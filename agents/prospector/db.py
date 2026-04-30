"""Database operations for the Prospector."""
import psycopg2
import psycopg2.extras
import json
import os


def get_conn(database_url: str):
    return psycopg2.connect(database_url)


def upsert_lead(conn, lead: dict):
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


def log_audit(conn, action: str, payload: dict):
    with conn.cursor() as cur:
        cur.execute("""
            insert into audit_log (agent, action, payload)
            values ('prospector', %s, %s)
        """, (action, json.dumps(payload)))
