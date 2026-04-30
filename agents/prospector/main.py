#!/usr/bin/env python3
"""
Prospector v0 — finds and scores restaurants in a ZIP code.
Usage: python3 main.py <zip_code> [<metro_name>]
"""
import sys
import os
import json
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

from places import search_restaurants, get_place_details, is_chain
from scraper import scrape
from scorer import business_viability, web_pain, opportunity_score, assign_tier
from db import get_conn, upsert_lead, log_audit


def run(zip_code: str, metro: str):
    api_key = os.environ["GOOGLE_PLACES_API_KEY"]
    db_url = os.environ["DATABASE_URL"]
    screenshot_dir = str(Path(__file__).parent / "screenshots")
    os.makedirs(screenshot_dir, exist_ok=True)

    print(f"[prospector] Starting run: ZIP={zip_code} metro={metro}")

    print("[prospector] Searching Google Places...")
    raw_places = search_restaurants(zip_code, api_key)
    print(f"[prospector] Found {len(raw_places)} raw results")

    conn = get_conn(db_url)
    log_audit(conn, "prospector_run_start", {"zip": zip_code, "metro": metro, "raw_count": len(raw_places)})
    conn.commit()

    scored = []

    for i, place in enumerate(raw_places):
        name = place.get("name", "")
        place_id = place.get("place_id", "")

        if is_chain(name):
            print(f"  [{i+1}/{len(raw_places)}] SKIP (chain): {name}")
            continue

        print(f"  [{i+1}/{len(raw_places)}] Processing: {name}")

        # Get full details
        details = get_place_details(place_id, api_key)
        if details.get("business_status") != "OPERATIONAL":
            print(f"    → not operational, skipping")
            continue

        website = details.get("website")
        slug = place_id.replace("ChIJ", "")[:20]

        # Scrape site if it has one
        scrape_data = {}
        if website:
            print(f"    → scraping {website}")
            try:
                scrape_data = scrape(website, screenshot_dir, slug)
            except Exception as e:
                print(f"    → scrape error: {e}")

        details["_scrape"] = scrape_data

        # Score
        viability, kills = business_viability(details)
        if kills:
            print(f"    → hard kill: {kills}")
            continue

        pain = web_pain(details)
        opp = opportunity_score(viability, pain)

        # Cuisine from types
        types = details.get("types", [])
        cuisine = next((t.replace("_", " ").title() for t in types
                        if t not in ("restaurant", "food", "point_of_interest",
                                     "establishment", "store")), None)

        scored.append({
            "place_id": place_id,
            "name": name,
            "viability": viability,
            "pain": pain,
            "opp": opp,
            "details": details,
            "scrape": scrape_data,
            "cuisine": cuisine,
            "kills": kills,
        })

    print(f"\n[prospector] Scored {len(scored)} leads. Assigning tiers...")
    all_opps = [s["opp"] for s in scored]

    inserted = 0
    for s in scored:
        tier = assign_tier(s["opp"], all_opps)
        d = s["details"]
        sc = s["scrape"]

        lead = {
            "metro": metro,
            "zip": zip_code,
            "google_place_id": s["place_id"],
            "business_name": s["name"],
            "address": d.get("formatted_address"),
            "phone": d.get("formatted_phone_number"),
            "website_url": d.get("website"),
            "cuisine": s["cuisine"],
            "google_review_count": d.get("user_ratings_total"),
            "google_rating": d.get("rating"),
            "business_viability": s["viability"],
            "web_pain": s["pain"],
            "opportunity_score": s["opp"],
            "tier": tier,
            "current_screenshot_url": sc.get("screenshot_path"),
        }

        try:
            upsert_lead(conn, lead)
            inserted += 1
        except Exception as e:
            print(f"  DB error for {s['name']}: {e}")
            conn.rollback()
            continue

    log_audit(conn, "prospector_run_complete", {
        "zip": zip_code, "metro": metro,
        "raw": len(raw_places), "scored": len(scored), "inserted": inserted,
    })
    conn.commit()
    conn.close()

    tier_counts = {}
    for s in scored:
        t = assign_tier(s["opp"], all_opps)
        tier_counts[t] = tier_counts.get(t, 0) + 1

    print(f"\n[prospector] Done. {inserted} leads upserted.")
    print(f"  Tier breakdown: {tier_counts}")


if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("Usage: python3 main.py <zip_code> [<metro>]")
        sys.exit(1)
    zip_code = sys.argv[1]
    metro = sys.argv[2] if len(sys.argv) > 2 else "Denver"
    run(zip_code, metro)
