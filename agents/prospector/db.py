"""Database operations for the Prospector."""
import psycopg2
import psycopg2.extras
import json
import os


def get_conn(database_url: str):
    return psycopg2.connect(database_url)


def upsert_lead(conn, lead: dict):
    """Legacy full upsert (scores + tier). Prefer upsert_scrape_lead + update_lead_scored for the split pipeline."""
    with conn.cursor() as cur:
        cur.execute("""
            insert into leads (
                metro, zip, google_place_id, business_name, address, phone,
                website_url, cuisine, google_review_count, google_rating,
                business_viability, web_pain, opportunity_score, tier,
                status, current_screenshot_url
            ) values (
                %(metro)s, %(zip)s, %(google_place_id)s, %(business_name)s,
                %(address)s, %(phone)s, %(website_url)s, %(cuisine)s,
                %(google_review_count)s, %(google_rating)s,
                %(business_viability)s, %(web_pain)s, %(opportunity_score)s,
                %(tier)s, 'new', %(current_screenshot_url)s
            )
            on conflict (google_place_id) do update set
                business_viability = excluded.business_viability,
                web_pain = excluded.web_pain,
                opportunity_score = excluded.opportunity_score,
                tier = excluded.tier,
                google_review_count = excluded.google_review_count,
                google_rating = excluded.google_rating,
                current_screenshot_url = excluded.current_screenshot_url,
                updated_at = now()
        """, lead)


def upsert_scrape_lead(conn, lead: dict):
    """Google Places scrape only: upsert identity + ratings, queue for analyzer."""
    with conn.cursor() as cur:
        cur.execute("""
            insert into leads (
                metro, zip, google_place_id, business_name, address, phone,
                website_url, cuisine, google_review_count, google_rating,
                place_types, analysis_status, analysis_error,
                site_grade, pitch_angle, looks_modern, mobile_ready, accessibility_ok,
                has_online_ordering, has_reservations, has_real_menu,
                business_viability, web_pain, opportunity_score, tier,
                status, current_screenshot_url
            ) values (
                %(metro)s, %(zip)s, %(google_place_id)s, %(business_name)s,
                %(address)s, %(phone)s, %(website_url)s, %(cuisine)s,
                %(google_review_count)s, %(google_rating)s,
                %(place_types)s, 'pending', null,
                null, null, null, null, null,
                null, null, null,
                null, null, null, null,
                'new', null
            )
            on conflict (google_place_id) do update set
                metro = excluded.metro,
                zip = excluded.zip,
                business_name = excluded.business_name,
                address = excluded.address,
                phone = excluded.phone,
                website_url = excluded.website_url,
                cuisine = excluded.cuisine,
                google_review_count = excluded.google_review_count,
                google_rating = excluded.google_rating,
                place_types = excluded.place_types,
                analysis_status = 'pending',
                analysis_error = null,
                site_grade = null,
                pitch_angle = null,
                looks_modern = null,
                mobile_ready = null,
                accessibility_ok = null,
                has_online_ordering = null,
                has_reservations = null,
                has_real_menu = null,
                business_viability = null,
                web_pain = null,
                opportunity_score = null,
                tier = null,
                current_screenshot_url = null,
                updated_at = now()
        """, lead)


def update_lead_scored(conn, lead_id: str, payload: dict):
    """Persist analyzer output for one lead."""
    with conn.cursor() as cur:
        cur.execute(
            """
            update leads set
                business_viability = %(viability)s,
                web_pain = %(pain)s,
                opportunity_score = %(opp)s,
                tier = %(tier)s,
                site_grade = %(site_grade)s,
                pitch_angle = %(pitch_angle)s,
                looks_modern = %(looks_modern)s,
                mobile_ready = %(mobile_ready)s,
                accessibility_ok = %(accessibility_ok)s,
                has_online_ordering = %(has_online_ordering)s,
                has_reservations = %(has_reservations)s,
                has_real_menu = %(has_real_menu)s,
                current_screenshot_url = %(screenshot)s,
                analysis_status = %(analysis_status)s,
                analysis_error = %(analysis_error)s,
                analyzed_at = case when %(analysis_status)s = 'complete' then now() else analyzed_at end,
                updated_at = now()
            where id = %(lead_id)s
            """,
            {
                "lead_id": lead_id,
                "viability": payload["business_viability"],
                "pain": payload["web_pain"],
                "opp": payload["opportunity_score"],
                "tier": payload["tier"],
                "site_grade": payload.get("site_grade"),
                "pitch_angle": payload.get("pitch_angle"),
                "looks_modern": payload.get("looks_modern"),
                "mobile_ready": payload.get("mobile_ready"),
                "accessibility_ok": payload.get("accessibility_ok"),
                "has_online_ordering": payload.get("has_online_ordering"),
                "has_reservations": payload.get("has_reservations"),
                "has_real_menu": payload.get("has_real_menu"),
                "screenshot": payload.get("current_screenshot_url"),
                "analysis_status": payload.get("analysis_status", "complete"),
                "analysis_error": payload.get("analysis_error"),
            },
        )


def log_audit(conn, action: str, payload: dict):
    with conn.cursor() as cur:
        cur.execute("""
            insert into audit_log (agent, action, payload)
            values ('prospector', %s, %s)
        """, (action, json.dumps(payload)))
