#!/usr/bin/env python3
"""
Prospector (scrape) — discover restaurants via Google Places and upsert thin leads.
Scores and website screenshots are handled by agents/analyzer/main.py.

Usage: python3 main.py <zip_code|ALL> [<metro_name>] [<run_id>]
"""
from __future__ import annotations

import sys
import os
import re
from pathlib import Path
from concurrent.futures import ThreadPoolExecutor, as_completed

# Load .env from project root
project_root = Path(__file__).parent.parent.parent
env_path = project_root / ".env"
if env_path.exists():
    for line in env_path.read_text().splitlines():
        line = line.strip()
        if line and not line.startswith("#") and "=" in line:
            k, _, v = line.partition("=")
            os.environ.setdefault(k.strip(), v.strip())

from places import (
    search_bars_and_restaurants,
    get_place_details,
    is_chain,
    is_convenience_store,
    is_fast_food,
    get_zips_for_metro,
)
from target_profile import is_upscale_skip
from website_discovery import resolve_website_url
from db import get_conn, upsert_scrape_lead, log_audit


def update_run(conn, run_id: str, **kwargs):
    """Persist run progress. psycopg2 requires a cursor."""
    if not run_id:
        return
    sets = ", ".join(f"{k} = %({k})s" for k in kwargs)
    sql = f"update prospector_runs set {sets} where id = %(run_id)s"
    params = {**kwargs, "run_id": run_id}
    with conn.cursor() as cur:
        cur.execute(sql, params)
    conn.commit()


def fail_run(conn, run_id: str, message: str):
    if not run_id:
        return
    with conn.cursor() as cur:
        cur.execute(
            "update prospector_runs set status = 'failed', error = %s, finished_at = now() where id = %s",
            (message[:2000], run_id),
        )
    conn.commit()


def _extract_zip(address: str | None) -> str:
    if not address:
        return ""
    match = re.search(r"\b(\d{5})(?:-\d{4})?\b", address)
    return match.group(1) if match else ""


def _cuisine_from_types(types: list | None) -> str | None:
    if not types:
        return None
    return next(
        (t.replace("_", " ").title() for t in types
         if t not in ("restaurant", "food", "point_of_interest", "establishment", "store")),
        None,
    )


def run(zip_code: str, metro: str, run_id: str = ""):
    screenshot_dir = str(Path(__file__).parent / "screenshots")
    os.makedirs(screenshot_dir, exist_ok=True)

    print(f"[prospector] Scrape run: ZIP={zip_code} metro={metro} run_id={run_id or 'none'}")

    db_url = (os.environ.get("DATABASE_URL") or "").strip()
    if not db_url or "localhost" in db_url or "127.0.0.1" in db_url:
        print(
            "[prospector] FATAL: DATABASE_URL must be your Neon connection string. "
            "Add it under GitHub → Settings → Secrets and variables → Actions "
            "(secret name: DATABASE_URL)."
        )
        sys.exit(1)

    conn = get_conn(db_url)

    try:
        api_key = os.environ["GOOGLE_PLACES_API_KEY"]

        if run_id:
            update_run(conn, run_id, current_business="Worker started — fetching places from Google…")

        target_zips = [zip_code]
        if zip_code.upper() == "ALL":
            target_zips = get_zips_for_metro(metro)
            if not target_zips:
                raise ValueError(f"No configured ZIPs for metro '{metro}'")

        print(f"[prospector] Searching Google Places for {len(target_zips)} ZIP(s)...")
        seen_place_ids = set()
        raw_places = []
        for zi, target_zip in enumerate(target_zips):
            if run_id:
                update_run(
                    conn,
                    run_id,
                    current_business=f"Google Places: ZIP {target_zip} ({zi + 1}/{len(target_zips)})…",
                )
            zip_places = search_bars_and_restaurants(target_zip, api_key)
            for place in zip_places:
                pid = place.get("place_id")
                if not pid or pid in seen_place_ids:
                    continue
                seen_place_ids.add(pid)
                raw_places.append(place)

        total_raw = len(raw_places)
        print(f"[prospector] Found {total_raw} raw results")

        candidates = []
        skipped = 0
        for i, place in enumerate(raw_places):
            name = place.get("name", "")
            types = place.get("types") or []
            if is_chain(name):
                skipped += 1
                print(f"  [{i+1}/{total_raw}] SKIP (chain): {name}")
                continue
            if is_convenience_store(name, types):
                skipped += 1
                print(f"  [{i+1}/{total_raw}] SKIP (convenience store): {name}")
                continue
            candidates.append((i, place))

        if skipped:
            print(f"[prospector] Skipped {skipped} chain/corporate/convenience location(s)")

        total = len(candidates)
        if run_id:
            with conn.cursor() as cur:
                cur.execute(
                    "update prospector_runs set total = %s, status = 'running' where id = %s",
                    (total, run_id),
                )
            conn.commit()

        log_audit(
            conn,
            "prospector_run_start",
            {
                "run_id": run_id,
                "zip": zip_code,
                "metro": metro,
                "raw_count": total_raw,
                "candidate_count": total,
                "target_zips": target_zips,
                "mode": "scrape_only",
            },
        )
        conn.commit()

        def fetch_details(index: int, place: dict) -> tuple[bool, dict | None, str]:
            name = place.get("name", "")
            place_id = place.get("place_id", "")
            try:
                details = get_place_details(place_id, api_key)
                if details.get("business_status") != "OPERATIONAL":
                    return False, None, f"[{index+1}/{total_raw}] {name}: not operational"
                types = details.get("types") or []
                if is_chain(name):
                    return False, None, f"[{index+1}/{total_raw}] {name}: SKIP (chain)"
                if is_fast_food(types):
                    return False, None, f"[{index+1}/{total_raw}] {name}: SKIP (fast food)"
                if is_convenience_store(name, types):
                    return False, None, f"[{index+1}/{total_raw}] {name}: SKIP (convenience store)"
                price_level = details.get("price_level")
                if is_upscale_skip(name, types, price_level):
                    return False, None, f"[{index+1}/{total_raw}] {name}: SKIP (upscale)"
                cuisine = _cuisine_from_types(types)
                places_website = details.get("website")
                website_url, website_source = resolve_website_url(
                    name,
                    places_website,
                    metro=metro,
                    address=details.get("formatted_address"),
                )
                lead = {
                    "metro": metro,
                    "zip": _extract_zip(details.get("formatted_address")) or zip_code,
                    "google_place_id": place_id,
                    "business_name": name,
                    "address": details.get("formatted_address"),
                    "phone": details.get("formatted_phone_number"),
                    "website_url": website_url,
                    "cuisine": cuisine,
                    "google_review_count": details.get("user_ratings_total"),
                    "google_rating": details.get("rating"),
                    "place_types": types,
                }
                msg = f"[{index+1}/{total_raw}] {name}: saved"
                if website_source == "search" and website_url:
                    msg += f" (website via search: {website_url})"
                return True, lead, msg
            except Exception as e:
                return False, None, f"[{index+1}/{total_raw}] {name}: error {e}"

        max_workers = int(os.environ.get("PROSPECTOR_MAX_WORKERS", "4"))
        batch_size = int(os.environ.get("PROSPECTOR_BATCH_SIZE", str(max_workers * 3)))
        total_batches = max(1, (len(candidates) + batch_size - 1) // batch_size)

        processed = 0
        inserted = 0

        for batch_idx in range(total_batches):
            batch_start = batch_idx * batch_size
            batch = candidates[batch_start:batch_start + batch_size]
            if not batch:
                continue

            batch_label = (
                f"Batch {batch_idx + 1}/{total_batches} "
                f"({batch_start + 1}-{batch_start + len(batch)} of {len(candidates)} places)"
            )
            print(f"[prospector] {batch_label}")
            update_run(conn, run_id, current_business=batch_label)
            log_audit(conn, "prospector_batch_start", {
                "run_id": run_id,
                "zip": zip_code,
                "metro": metro,
                "batch_index": batch_idx + 1,
                "total_batches": total_batches,
                "batch_size": len(batch),
                "max_workers": max_workers,
            })
            conn.commit()

            with ThreadPoolExecutor(max_workers=max_workers) as executor:
                futures = [executor.submit(fetch_details, idx, place) for idx, place in batch]
                for future in as_completed(futures):
                    ok, lead_dict, message = future.result()
                    processed += 1
                    print(f"  {message}")
                    if ok and lead_dict:
                        upsert_scrape_lead(conn, lead_dict)
                        inserted += 1
                    update_run(conn, run_id, processed=processed, current_business=message)

            log_audit(conn, "prospector_batch_complete", {
                "run_id": run_id,
                "zip": zip_code,
                "metro": metro,
                "batch_index": batch_idx + 1,
                "total_batches": total_batches,
                "processed": processed,
                "inserted_so_far": inserted,
            })
            conn.commit()

        log_audit(conn, "prospector_run_complete", {
            "run_id": run_id,
            "zip": zip_code,
            "metro": metro,
            "target_zips": target_zips,
            "raw": total_raw,
            "candidates": total,
            "upserted": inserted,
            "mode": "scrape_only",
        })

        if run_id:
            with conn.cursor() as cur:
                cur.execute(
                    """update prospector_runs
                       set status = 'complete', inserted = %s, processed = %s,
                           current_business = null, finished_at = now()
                       where id = %s""",
                    (inserted, processed, run_id),
                )
        conn.commit()
        conn.close()

        print(f"\n[prospector] Done. {inserted} leads upserted (queued for analysis).")

    except Exception as e:
        print(f"[prospector] FATAL: {e}")
        if run_id:
            try:
                fail_run(conn, run_id, str(e))
            except Exception:
                pass
        raise


if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("Usage: python3 main.py <zip_code|ALL> [<metro>] [<run_id>]")
        sys.exit(1)
    zip_code = sys.argv[1]
    metro = sys.argv[2] if len(sys.argv) > 2 else "Denver"
    run_id = sys.argv[3] if len(sys.argv) > 3 else ""
    run(zip_code, metro, run_id)
