#!/usr/bin/env python3
"""
Analyzer — scrape websites + score leads where analysis_status = 'pending'.
Each lead is written to the DB immediately after analysis so the UI updates live.

Usage: python3 main.py <run_id> [limit]
  limit defaults to ANALYZER_LIMIT env or 200.
  Optional ANALYZER_LEAD_ID env targets a single lead (pending or failed).
"""
from __future__ import annotations

import json
import os
import sys
import threading
from concurrent.futures import ThreadPoolExecutor, as_completed
from pathlib import Path

# Load .env from project root
project_root = Path(__file__).parent.parent.parent
env_path = project_root / ".env"
if env_path.exists():
    for line in env_path.read_text().splitlines():
        line = line.strip()
        if line and not line.startswith("#") and "=" in line:
            k, _, v = line.partition("=")
            os.environ.setdefault(k.strip(), v.strip())

_PROSPECTOR = Path(__file__).resolve().parent.parent / "prospector"
sys.path.insert(0, str(_PROSPECTOR))

import psycopg2.extras

from db import get_conn, update_lead_scored, log_audit
from scraper import scrape
from scorer import business_viability, opportunity_score, web_pain
from places import is_chain
from corporate_signals import is_chain_or_corporate, skip_pitch
from target_profile import is_bar_pub_fit
from website_discovery import resolve_website_url


def update_run(conn, run_id: str, **kwargs):
    if not run_id:
        return
    sets = ", ".join(f"{k} = %({k})s" for k in kwargs)
    sql = f"update analyzer_runs set {sets} where id = %(run_id)s"
    with conn.cursor() as cur:
        cur.execute(sql, {**kwargs, "run_id": run_id})
    conn.commit()


def fail_run(conn, run_id: str, message: str):
    if not run_id:
        return
    with conn.cursor() as cur:
        cur.execute(
            "update analyzer_runs set status = 'failed', error = %s, finished_at = now() where id = %s",
            (message[:2000], run_id),
        )
    conn.commit()


def row_to_place(row: dict) -> dict:
    types = row.get("place_types") or []
    if isinstance(types, str):
        try:
            types = json.loads(types)
        except Exception:
            types = []
    return {
        "business_status": "OPERATIONAL",
        "formatted_address": row.get("address") or "",
        "formatted_phone_number": row.get("phone"),
        "user_ratings_total": row.get("google_review_count") or 0,
        "rating": float(row["google_rating"]) if row.get("google_rating") is not None else None,
        "website": row.get("website_url"),
        "name": row.get("business_name"),
        "types": list(types),
        "price_level": None,
    }


def build_site_snapshot(place: dict) -> dict:
    """Sales-friendly site quality snapshot — no website or unreachable = F."""
    scrape_data = place.get("_scrape", {})
    reachable = bool(scrape_data.get("reachable"))
    perf = scrape_data.get("performance")
    accessibility = scrape_data.get("accessibility")
    has_ordering = bool(scrape_data.get("has_ordering"))
    has_reservation = bool(scrape_data.get("has_reservation"))
    menu_is_pdf = bool(scrape_data.get("menu_is_pdf"))
    has_html_menu_nav = bool(scrape_data.get("has_html_menu_nav"))
    has_contact_form = bool(scrape_data.get("has_contact_form"))
    social_links = scrape_data.get("social_links") or []
    website = place.get("website")

    if not website or not reachable:
        bar_label = "Neighborhood bar/pub" if is_bar_pub_fit(place) else "Local spot"
        return {
            "site_grade": "F",
            "looks_modern": False,
            "mobile_ready": False,
            "accessibility_ok": False,
            "has_online_ordering": False,
            "has_reservations": False,
            "has_real_menu": False,
            "pitch_angle": (
                f"{bar_label} with no usable website. Prebuild a demo site "
                "(menu, hours, map, contact) then reach out to the owner."
            ),
        }

    stale_note = ""
    if scrape_data.get("looks_ancient"):
        yr = scrape_data.get("copyright_year")
        stale_note = f" — copyright {yr}, looks abandoned" if yr else " — looks abandoned"
    elif scrape_data.get("looks_stale"):
        yr = scrape_data.get("copyright_year")
        stale_note = f" — not updated since {yr}" if yr else " — stale/outdated"
    if scrape_data.get("has_dead_ordering_only"):
        stale_note += ", dead ordering links"
    elif scrape_data.get("facebook_only_web"):
        stale_note = " — Facebook-only web presence"

    # Lighthouse often missing or harsh on heavy CMS sites — do not treat "no score" as failing mobile UX.
    mobile_ready = perf is None or perf >= 38
    accessibility_ok = accessibility is None or accessibility >= 65
    # "Real menu" = explicit HTML menu nav (/menu, /menus, …) or we did not flag a PDF-only menu card.
    has_real_menu = has_html_menu_nav or not menu_is_pdf
    looks_modern = (
        mobile_ready
        and (accessibility is None or accessibility >= 60)
        and (has_ordering or has_reservation or has_contact_form)
        and not menu_is_pdf
    )

    good_signals = sum([
        1 if has_ordering else 0,
        1 if has_reservation else 0,
        1 if has_real_menu else 0,
        1 if mobile_ready else 0,
        1 if accessibility_ok else 0,
        1 if bool(social_links) else 0,
        1 if looks_modern else 0,
    ])
    bad_signals = sum([
        1 if menu_is_pdf else 0,
        1 if not has_ordering else 0,
        1 if not has_reservation else 0,
        1 if not has_contact_form else 0,
        1 if perf is not None and perf < 40 else 0,
        1 if accessibility is not None and accessibility < 60 else 0,
    ])

    if good_signals >= 6 and bad_signals <= 1:
        grade = "A"
    elif good_signals >= 4 and bad_signals <= 2:
        grade = "B"
    elif bad_signals >= 4 or scrape_data.get("looks_stale") or scrape_data.get("has_dead_ordering_only"):
        grade = "F"
    else:
        grade = "C"

    bar = is_bar_pub_fit(place)

    if grade == "F":
        touch_points: list[str] = []
        if not has_ordering:
            touch_points.append("no online ordering")
        if scrape_data.get("has_dead_ordering_only"):
            touch_points.append("dead ordering links")
        if not has_reservation:
            touch_points.append("no reservations")
        if menu_is_pdf:
            touch_points.append("PDF menu")
        if scrape_data.get("looks_stale") or scrape_data.get("looks_ancient"):
            touch_points.append("stale/outdated site")
        if not mobile_ready and perf is not None:
            touch_points.append("not mobile-friendly")
        issue_summary = ", ".join(touch_points[:3]) if touch_points else "broken / unusable UX"
        pitch_angle = (
            f"{'Neighborhood bar/pub' if bar else 'Local restaurant'} — weak web ({issue_summary}{stale_note}). "
            "Top demo-site candidate: prebuild a modern site, then cold outreach to the owner."
        )
    elif grade == "C":
        touch_points = []
        if not has_ordering:
            touch_points.append("no online ordering")
        if not has_reservation:
            touch_points.append("no reservations")
        if menu_is_pdf:
            touch_points.append("PDF menu")
        if scrape_data.get("looks_stale"):
            touch_points.append("outdated design")
        issue_summary = ", ".join(touch_points[:3]) if touch_points else "outdated UX"
        pitch_angle = (
            f"{'Bar/pub' if bar else 'Restaurant'} with dated site ({issue_summary}{stale_note}). "
            "Good demo-site pitch — show them something modern before you call."
        )
    else:
        pitch_angle = (
            "Site already looks polished. Skip demo prebuild — not a local owner-operator target."
        )

    return {
        "site_grade": grade,
        "looks_modern": looks_modern,
        "mobile_ready": mobile_ready,
        "accessibility_ok": accessibility_ok,
        "has_online_ordering": has_ordering,
        "has_reservations": has_reservation,
        "has_real_menu": has_real_menu,
        "pitch_angle": pitch_angle,
    }


def tier_from_grade(grade: str | None) -> str:
    """Map site grade to outreach tier. F = primary rebuild targets."""
    if grade == "F":
        return "A"  # horrendous / missing — call first
    if grade == "C":
        return "B"  # outdated — still worth pitching
    if grade == "B":
        return "C"
    if grade == "A":
        return "reject"  # already fine
    return "C"


def _skipped_payload(row: dict, reason: str, scrape_data: dict | None = None) -> dict:
    """Mark a lead complete + tier reject without full analysis."""
    lid = str(row["id"])
    sc = scrape_data or {}
    pitch = skip_pitch(reason)
    return {
        "lead_id": lid,
        "business_name": row.get("business_name", ""),
        "payload": {
            "business_viability": 0,
            "web_pain": 0,
            "opportunity_score": 0,
            "tier": "reject",
            "site_grade": "A",
            "pitch_angle": pitch,
            "looks_modern": True,
            "mobile_ready": True,
            "accessibility_ok": True,
            "has_online_ordering": bool(sc.get("has_ordering")),
            "has_reservations": bool(sc.get("has_reservation")),
            "has_real_menu": bool(sc.get("has_html_menu_nav")),
            "current_screenshot_url": sc.get("screenshot_path"),
            "analysis_status": "complete",
            "analysis_error": reason,
            "contact_email": sc.get("contact_email"),
            "contact_name": sc.get("contact_name"),
            "contact_role": sc.get("contact_role"),
            "contact_email_source": sc.get("contact_email_source"),
            "contact_enrichment": sc.get("contact_enrichment"),
        },
    }


def analyze_one(row: dict, screenshot_dir: str) -> dict:
    """Scrape + score a single lead. Safe to call from a thread."""
    lid = str(row["id"])
    slug = lid.replace("-", "")[:16]
    place = row_to_place(row)
    website = place.get("website")
    name = row.get("business_name") or ""

    resolved_url, website_source = resolve_website_url(
        name,
        website,
        metro=row.get("metro"),
        address=row.get("address"),
    )
    discovered_website_url = None
    if resolved_url and resolved_url != website:
        website = resolved_url
        place["website"] = resolved_url
        if website_source == "search":
            discovered_website_url = resolved_url

    if is_chain(name):
        print(f"  skip (chain): {name}")
        return _skipped_payload(row, "national_chain")

    scrape_data: dict = {}
    scrape_err: str | None = None
    try:
        if website:
            # DOM scrape first — skip Lighthouse if corporate/agency signals fire.
            scrape_data = scrape(website, screenshot_dir, slug, run_lh=False)
            corporate, reason = is_chain_or_corporate(place, scrape_data)
            if corporate:
                print(f"  skip ({reason}): {name}")
                return _skipped_payload(row, reason, scrape_data)
            if scrape_data.get("reachable"):
                from scraper import run_lighthouse
                scrape_data.update(run_lighthouse(website))
    except Exception as e:
        scrape_err = str(e)
        scrape_data = {"reachable": False, "load_error": scrape_err}

    place["_scrape"] = scrape_data
    snapshot = build_site_snapshot(place)

    viability, kills = business_viability(place)
    pain = web_pain(place)

    if kills:
        err_note = ", ".join(str(k) for k in kills)
        if scrape_err:
            err_note = f"{err_note}; scrape: {scrape_err}"
        return {
            "lead_id": lid,
            "business_name": row.get("business_name", ""),
            "website_url": discovered_website_url,
            "payload": {
                "business_viability": 0,
                "web_pain": pain,
                "opportunity_score": 0,
                "tier": tier_from_grade(snapshot["site_grade"]),
                "current_screenshot_url": None,
                "analysis_status": "complete",
                "analysis_error": err_note[:500],
                **snapshot,
            },
        }

    opp = opportunity_score(viability, pain, snapshot.get("site_grade"), place)
    tier = tier_from_grade(snapshot["site_grade"])
    sc = scrape_data

    return {
        "lead_id": lid,
        "business_name": row.get("business_name", ""),
        "website_url": discovered_website_url,
        "payload": {
            "business_viability": viability,
            "web_pain": pain,
            "opportunity_score": opp,
            "tier": tier,
            "current_screenshot_url": sc.get("screenshot_path"),
            "analysis_status": "complete",
            "analysis_error": None,
            "contact_email": sc.get("contact_email"),
            "contact_name": sc.get("contact_name"),
            "contact_role": sc.get("contact_role"),
            "contact_email_source": sc.get("contact_email_source"),
            "contact_enrichment": sc.get("contact_enrichment"),
            **snapshot,
        },
    }


def run(run_id: str, limit: int, lead_id: str | None = None):
    db_url = os.environ["DATABASE_URL"]
    screenshot_dir = str(_PROSPECTOR / "screenshots")
    os.makedirs(screenshot_dir, exist_ok=True)

    print(
        f"[analyzer] Starting run_id={run_id or 'none'} limit={limit}"
        + (f" lead_id={lead_id}" if lead_id else "")
    )

    conn = get_conn(db_url)
    # Separate connection for per-lead writes so it doesn't conflict with
    # the run-status connection used from the main thread.
    write_conn = get_conn(db_url)
    write_lock = threading.Lock()

    try:
        if run_id:
            update_run(
                conn,
                run_id,
                current_business="Loading lead…" if lead_id else "Loading pending leads…",
            )

        with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
            if lead_id:
                cur.execute(
                    """
                    select id, google_place_id, business_name, address, phone, website_url, cuisine,
                           google_review_count, google_rating, place_types, metro, zip
                    from leads
                    where id = %s
                      and analysis_status in ('pending', 'failed')
                    """,
                    (lead_id,),
                )
            else:
                cur.execute(
                    """
                    select id, google_place_id, business_name, address, phone, website_url, cuisine,
                           google_review_count, google_rating, place_types, metro, zip
                    from leads
                    where analysis_status = 'pending'
                      and coalesce(lead_type, 'location') = 'location'
                    order by created_at asc
                    limit %s
                    """,
                    (limit,),
                )
            rows = cur.fetchall()

        total = len(rows)
        print(f"[analyzer] {total} lead(s) queued")

        if total == 0:
            log_audit(
                conn,
                "analyzer_run_complete",
                {
                    "run_id": run_id,
                    "processed": 0,
                    "updated": 0,
                    "note": "no_pending",
                    "lead_id": lead_id,
                },
            )
            if run_id:
                with conn.cursor() as cur:
                    cur.execute(
                        """update analyzer_runs
                           set status = 'complete', inserted = 0, processed = 0,
                               current_business = null, finished_at = now()
                           where id = %s""",
                        (run_id,),
                    )
            conn.commit()
            conn.close()
            write_conn.close()
            print("[analyzer] Nothing pending.")
            return

        if run_id:
            with conn.cursor() as cur:
                cur.execute(
                    "update analyzer_runs set total = %s, status = 'running' where id = %s",
                    (total, run_id),
                )
            conn.commit()

        log_audit(
            conn,
            "analyzer_run_start",
            {
                "run_id": run_id,
                "pending_selected": total,
                "limit": limit,
                "lead_id": lead_id,
            },
        )
        conn.commit()

        processed = 0
        inserted = 0

        max_workers = int(os.environ.get("ANALYZER_MAX_WORKERS", "3"))
        with ThreadPoolExecutor(max_workers=max_workers) as executor:
            row_by_future = {
                executor.submit(analyze_one, dict(r), screenshot_dir): dict(r)
                for r in rows
            }
            for future in as_completed(row_by_future):
                result = future.result()
                lid = result["lead_id"]
                name = result["business_name"]
                payload = result["payload"]
                if result.get("website_url"):
                    payload = {**payload, "website_url": result["website_url"]}

                # Write this lead immediately — visible in UI right away.
                with write_lock:
                    update_lead_scored(write_conn, lid, payload)
                    write_conn.commit()
                    inserted += 1

                processed += 1
                grade = payload.get("site_grade", "?")
                status_line = f"{name[:35]} → {grade}"
                print(f"  [{processed}/{total}] {status_line}")

                if run_id:
                    update_run(
                        conn,
                        run_id,
                        processed=processed,
                        inserted=inserted,
                        current_business=status_line,
                    )

        log_audit(conn, "analyzer_run_complete", {"run_id": run_id, "processed": processed, "updated": inserted})

        if run_id:
            with conn.cursor() as cur:
                cur.execute(
                    """update analyzer_runs
                       set status = 'complete', inserted = %s, processed = %s,
                           current_business = null, finished_at = now()
                       where id = %s""",
                    (inserted, processed, run_id),
                )
        conn.commit()
        conn.close()
        write_conn.close()

        print(f"[analyzer] Done. {inserted}/{total} lead(s) updated.")

    except Exception as e:
        print(f"[analyzer] FATAL: {e}")
        if run_id:
            try:
                fail_run(conn, run_id, str(e))
            except Exception:
                pass
        raise


if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("Usage: python3 main.py <run_id> [limit]")
        sys.exit(1)
    rid = sys.argv[1]
    lim = int(sys.argv[2]) if len(sys.argv) > 2 else int(os.environ.get("ANALYZER_LIMIT", "200"))
    target_lead = (os.environ.get("ANALYZER_LEAD_ID") or "").strip() or None
    run(rid, lim, target_lead)
