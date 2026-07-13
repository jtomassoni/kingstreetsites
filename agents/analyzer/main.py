#!/usr/bin/env python3
"""
Analyzer — scrape websites + score leads where analysis_status = 'pending'.
Each lead is written to the DB immediately after analysis so the UI updates live.

Usage: python3 main.py <run_id> [limit]
  limit defaults to ANALYZER_LIMIT env or 200.
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
        return {
            "site_grade": "F",
            "looks_modern": False,
            "mobile_ready": False,
            "accessibility_ok": False,
            "has_online_ordering": False,
            "has_reservations": False,
            "has_real_menu": False,
            "pitch_angle": (
                "No usable website. Lead with an affordable rebuild "
                "(simple site + menu + map) and hourly updates after launch."
            ),
        }

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
    elif bad_signals >= 4:
        grade = "F"
    else:
        grade = "C"

    if grade == "F":
        touch_points: list[str] = []
        if not has_ordering:
            touch_points.append("no online ordering")
        if not has_reservation:
            touch_points.append("no reservations")
        if menu_is_pdf:
            touch_points.append("PDF-style menu")
        if not accessibility_ok and accessibility is not None:
            touch_points.append("weak accessibility")
        if not mobile_ready and perf is not None:
            touch_points.append("not mobile-friendly")
        issue_summary = ", ".join(touch_points[:3]) if touch_points else "broken / unusable UX"
        pitch_angle = (
            f"Horrendous site ({issue_summary}). Top rebuild target — "
            "quote a flat affordable rebuild, then hourly rates for ongoing updates."
        )
    elif grade == "C":
        touch_points = []
        if not has_ordering:
            touch_points.append("no online ordering")
        if not has_reservation:
            touch_points.append("no reservations")
        if menu_is_pdf:
            touch_points.append("PDF-style menu")
        if not accessibility_ok and accessibility is not None:
            touch_points.append("weak accessibility")
        if not mobile_ready and perf is not None:
            touch_points.append("not mobile-friendly")
        issue_summary = ", ".join(touch_points[:3]) if touch_points else "outdated UX"
        pitch_angle = (
            f"Outdated site ({issue_summary}). Strong candidate for a cheaper rebuild "
            "vs agency pricing, with simple hourly updates afterward."
        )
    else:
        pitch_angle = (
            "Site already looks conversion-ready. Low rebuild priority — "
            "skip unless they ask, or offer light hourly polish only."
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


def analyze_one(row: dict, screenshot_dir: str) -> dict:
    """Scrape + score a single lead. Safe to call from a thread."""
    lid = str(row["id"])
    slug = lid.replace("-", "")[:16]
    place = row_to_place(row)
    website = place.get("website")

    scrape_data: dict = {}
    scrape_err: str | None = None
    try:
        if website:
            scrape_data = scrape(website, screenshot_dir, slug)
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

    opp = opportunity_score(viability, pain, snapshot.get("site_grade"))
    tier = tier_from_grade(snapshot["site_grade"])
    sc = scrape_data

    return {
        "lead_id": lid,
        "business_name": row.get("business_name", ""),
        "payload": {
            "business_viability": viability,
            "web_pain": pain,
            "opportunity_score": opp,
            "tier": tier,
            "current_screenshot_url": sc.get("screenshot_path"),
            "analysis_status": "complete",
            "analysis_error": None,
            **snapshot,
        },
    }


def run(run_id: str, limit: int):
    db_url = os.environ["DATABASE_URL"]
    screenshot_dir = str(_PROSPECTOR / "screenshots")
    os.makedirs(screenshot_dir, exist_ok=True)

    print(f"[analyzer] Starting run_id={run_id or 'none'} limit={limit}")

    conn = get_conn(db_url)
    # Separate connection for per-lead writes so it doesn't conflict with
    # the run-status connection used from the main thread.
    write_conn = get_conn(db_url)
    write_lock = threading.Lock()

    try:
        if run_id:
            update_run(conn, run_id, current_business="Loading pending leads…")

        with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
            cur.execute(
                """
                select id, google_place_id, business_name, address, phone, website_url, cuisine,
                       google_review_count, google_rating, place_types, metro, zip
                from leads
                where analysis_status = 'pending'
                order by created_at asc
                limit %s
                """,
                (limit,),
            )
            rows = cur.fetchall()

        total = len(rows)
        print(f"[analyzer] {total} pending lead(s)")

        if total == 0:
            log_audit(conn, "analyzer_run_complete", {"run_id": run_id, "processed": 0, "updated": 0, "note": "no_pending"})
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

        log_audit(conn, "analyzer_run_start", {"run_id": run_id, "pending_selected": total, "limit": limit})
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
    run(rid, lim)
