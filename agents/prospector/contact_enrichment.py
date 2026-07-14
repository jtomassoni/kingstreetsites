"""Discover owner/GM contact info from business websites during analyze."""
from __future__ import annotations

import json
import re
from urllib.parse import urljoin, urlparse

EMAIL_RE = re.compile(
    r"\b[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}\b"
)

GENERIC_LOCAL_PARTS = {
    "info", "hello", "contact", "support", "help", "admin", "office",
    "reservations", "reservation", "orders", "order", "catering", "events",
    "marketing", "sales", "team", "mail", "general", "inquiries", "enquiries",
    "booking", "bookings", "frontdesk", "hr", "jobs", "careers", "press",
    "media", "feedback", "service", "customerservice", "enquiry", "inquiry",
}

SKIP_LOCAL_PARTS = {
    "noreply", "no-reply", "donotreply", "do-not-reply", "bounce",
    "mailer-daemon", "postmaster", "webmaster", "sentry", "wixpress",
    "example", "email", "yourname", "name", "username",
}

CONTACT_PATH_MARKERS = (
    "/about", "/contact", "/team", "/our-team", "/staff", "/meet",
    "/our-story", "/who-we-are", "/leadership", "/people", "/management",
    "/founders", "/owners",
)

ROLE_PATTERNS: list[tuple[re.Pattern[str], str]] = [
    (re.compile(r"(?:owner|proprietor|founder|co-?owner)\s*[:\-–—]?\s*([A-Z][\w'.-]+(?:\s+[A-Z][\w'.-]+){0,2})", re.I), "owner"),
    (re.compile(r"([A-Z][\w'.-]+(?:\s+[A-Z][\w'.-]+){0,2})\s*,?\s*(?:owner|proprietor|founder)", re.I), "owner"),
    (re.compile(r"general\s+manager\s*[:\-–—]?\s*([A-Z][\w'.-]+(?:\s+[A-Z][\w'.-]+){0,2})", re.I), "gm"),
    (re.compile(r"([A-Z][\w'.-]+(?:\s+[A-Z][\w'.-]+){0,2})\s*,?\s*general\s+manager", re.I), "gm"),
    (re.compile(r"(?:manager|gm)\s*[:\-–—]?\s*([A-Z][\w'.-]+(?:\s+[A-Z][\w'.-]+){0,2})", re.I), "manager"),
    (re.compile(r"chef\s*/\s*owner\s*[:\-–—]?\s*([A-Z][\w'.-]+(?:\s+[A-Z][\w'.-]+){0,2})", re.I), "owner"),
]


def _normalize_email(raw: str) -> str | None:
    email = raw.strip().lower().strip(".,;:")
    if not email or "@" not in email:
        return None
    local, _, domain = email.partition("@")
    if not local or not domain or "." not in domain:
        return None
    if any(skip in local for skip in SKIP_LOCAL_PARTS):
        return None
    if domain.endswith((".png", ".jpg", ".gif", ".webp", ".svg")):
        return None
    return email


def _email_local_part(email: str) -> str:
    return email.split("@", 1)[0].lower()


def _is_generic_email(email: str) -> bool:
    local = _email_local_part(email)
    if local in GENERIC_LOCAL_PARTS:
        return True
    return any(local.startswith(f"{g}.") or local.startswith(f"{g}+") for g in GENERIC_LOCAL_PARTS)


def _name_matches_email(name: str | None, email: str) -> bool:
    if not name:
        return False
    local = _email_local_part(email).replace(".", " ").replace("_", " ").replace("-", " ")
    parts = [p.lower() for p in re.split(r"\s+", name.strip()) if len(p) > 2]
    return any(p in local for p in parts)


def _score_email(email: str, name_hint: str | None, page_kind: str) -> int:
    if _is_generic_email(email):
        score = 25
    else:
        score = 55
        local = _email_local_part(email)
        if "." in local or "_" in local or "-" in local:
            score += 15
        if _name_matches_email(name_hint, email):
            score += 25

    page_bonus = {"about": 12, "contact": 15, "team": 10, "homepage": 5}.get(page_kind, 0)
    return score + page_bonus


def _same_site(base_url: str, href: str) -> bool:
    if not href or href.startswith(("mailto:", "tel:", "javascript:", "#")):
        return False
    base = urlparse(base_url)
    target = urlparse(urljoin(base_url, href))
    if target.scheme not in ("http", "https"):
        return False
    base_host = (base.hostname or "").removeprefix("www.")
    target_host = (target.hostname or "").removeprefix("www.")
    return base_host == target_host


def _page_kind(url: str) -> str:
    path = urlparse(url).path.lower()
    if any(m in path for m in ("/contact", "/get-in-touch", "/reach-us")):
        return "contact"
    if any(m in path for m in ("/about", "/our-story", "/who-we-are", "/founders", "/owners")):
        return "about"
    if any(m in path for m in ("/team", "/staff", "/leadership", "/people", "/management")):
        return "team"
    return "homepage"


def _contact_page_candidates(base_url: str, links: list[str]) -> list[str]:
    seen: set[str] = set()
    out: list[str] = []
    for href in links:
        if not _same_site(base_url, href):
            continue
        full = urljoin(base_url, href)
        path = urlparse(full).path.lower()
        if not any(marker in path for marker in CONTACT_PATH_MARKERS):
            continue
        key = urlparse(full)._replace(fragment="", query="").geturl().rstrip("/")
        if key not in seen:
            seen.add(key)
            out.append(full)
    # Prefer contact > about > team
    def rank(u: str) -> tuple[int, str]:
        kind = _page_kind(u)
        order = {"contact": 0, "about": 1, "team": 2}.get(kind, 3)
        return (order, u)

    return sorted(out, key=rank)[:4]


def _extract_emails_from_text(text: str) -> list[str]:
    found: list[str] = []
    for match in EMAIL_RE.findall(text or ""):
        normalized = _normalize_email(match)
        if normalized:
            found.append(normalized)
    return found


def _extract_emails_from_mailto(links: list[str]) -> list[str]:
    out: list[str] = []
    for href in links:
        if not href.lower().startswith("mailto:"):
            continue
        raw = href[7:].split("?", 1)[0]
        normalized = _normalize_email(raw)
        if normalized:
            out.append(normalized)
    return out


def _extract_people(text: str) -> list[dict]:
    people: list[dict] = []
    seen_names: set[str] = set()
    for pattern, role in ROLE_PATTERNS:
        for match in pattern.finditer(text or ""):
            name = match.group(1).strip()
            key = name.lower()
            if len(name) < 3 or key in seen_names:
                continue
            seen_names.add(key)
            people.append({"name": name, "role": role, "source": "page_text"})
    return people


def _linkedin_hints(links: list[str]) -> list[dict]:
    hints: list[dict] = []
    seen: set[str] = set()
    for link in links:
        low = link.lower()
        if "linkedin.com/in/" not in low:
            continue
        slug = low.split("/in/", 1)[-1].split("?", 1)[0].strip("/")
        if not slug or slug in seen:
            continue
        seen.add(slug)
        name = " ".join(part.capitalize() for part in slug.split("-") if part)
        hints.append({
            "name": name,
            "role": None,
            "source": "linkedin_profile_url",
            "url": link,
        })
    return hints


def _pick_best(candidates: list[dict]) -> dict | None:
    if not candidates:
        return None
    emails = [c for c in candidates if c.get("email")]
    if not emails:
        return None
    emails.sort(key=lambda c: c.get("score", 0), reverse=True)
    best_email = emails[0]
    people = [c for c in candidates if c.get("name")]
    best_person = None
    if people:
        people.sort(key=lambda c: (
            0 if c.get("role") in ("owner", "gm") else 1,
            -c.get("score", 0),
        ))
        best_person = people[0]

    name = best_person.get("name") if best_person else None
    role = best_person.get("role") if best_person else None
    if best_email.get("name") and not name:
        name = best_email["name"]
    if best_email.get("role") and not role:
        role = best_email["role"]

    source = best_email.get("source_page_kind") or "website"
    if source == "homepage":
        source = "website_homepage"
    elif source in ("about", "contact", "team"):
        source = f"website_{source}"

    return {
        "contact_email": best_email["email"],
        "contact_name": name,
        "contact_role": role,
        "contact_email_source": "generic_fallback" if _is_generic_email(best_email["email"]) else source,
        "is_generic_email": _is_generic_email(best_email["email"]),
        "score": best_email.get("score", 0),
    }


async def _collect_page_signals(page, url: str, links: list[str], html: str) -> tuple[list[dict], list[dict]]:
    page_kind = _page_kind(url)
    visible_text = await page.evaluate("() => document.body ? document.body.innerText : ''")
    text_blob = f"{html}\n{visible_text}"

    email_candidates: list[dict] = []
    seen_emails: set[str] = set()
    people = _extract_people(visible_text) + _linkedin_hints(links)

    for email in _extract_emails_from_mailto(links) + _extract_emails_from_text(text_blob):
        if email in seen_emails:
            continue
        seen_emails.add(email)
        name_hint = people[0]["name"] if people else None
        email_candidates.append({
            "email": email,
            "score": _score_email(email, name_hint, page_kind),
            "source_page": url,
            "source_page_kind": page_kind,
            "is_generic": _is_generic_email(email),
        })

    return email_candidates, people


async def enrich_contact_from_site(page, base_url: str, homepage_links: list[str], homepage_html: str) -> dict:
    """Crawl homepage + contact/about pages and pick the best owner/GM contact."""
    all_email_candidates: list[dict] = []
    all_people: list[dict] = []
    pages_visited = [base_url]

    home_emails, home_people = await _collect_page_signals(page, base_url, homepage_links, homepage_html)
    all_email_candidates.extend(home_emails)
    all_people.extend(home_people)

    for contact_url in _contact_page_candidates(base_url, homepage_links):
        try:
            await page.goto(contact_url, wait_until="domcontentloaded", timeout=15000)
            await page.wait_for_timeout(1200)
            pages_visited.append(contact_url)
            sub_links = await page.eval_on_selector_all("a[href]", "els => els.map(e => e.href)")
            sub_html = await page.content()
            sub_emails, sub_people = await _collect_page_signals(page, contact_url, sub_links, sub_html)
            all_email_candidates.extend(sub_emails)
            all_people.extend(sub_people)
        except Exception:
            continue

    # Attach names to email candidates when we can match
    for person in all_people:
        for cand in all_email_candidates:
            if _name_matches_email(person.get("name"), cand["email"]):
                cand["name"] = person["name"]
                cand["role"] = person.get("role")
                cand["score"] = cand.get("score", 0) + 10

    for person in all_people:
        person["score"] = 80 if person.get("role") == "owner" else 70 if person.get("role") == "gm" else 50

    combined = all_email_candidates + [p for p in all_people if p.get("name")]
    best = _pick_best(combined)

    unique_emails = []
    seen = set()
    for c in sorted(all_email_candidates, key=lambda x: x.get("score", 0), reverse=True):
        e = c.get("email")
        if e and e not in seen:
            seen.add(e)
            unique_emails.append({
                "email": e,
                "score": c.get("score"),
                "is_generic": c.get("is_generic"),
                "source_page": c.get("source_page"),
            })

    enrichment = {
        "pages_visited": pages_visited,
        "emails_found": unique_emails[:8],
        "people_found": [
            {"name": p.get("name"), "role": p.get("role"), "source": p.get("source"), "url": p.get("url")}
            for p in all_people[:8]
        ],
        "linkedin_urls": [p["url"] for p in all_people if p.get("url")],
        "best": best,
    }

    if not best:
        return {
            "contact_email": None,
            "contact_name": None,
            "contact_role": None,
            "contact_email_source": None,
            "contact_enrichment": enrichment,
        }

    return {
        "contact_email": best["contact_email"],
        "contact_name": best.get("contact_name"),
        "contact_role": best.get("contact_role"),
        "contact_email_source": best.get("contact_email_source"),
        "contact_enrichment": enrichment,
    }


def contact_enrichment_to_json(enrichment: dict) -> str:
    return json.dumps(enrichment.get("contact_enrichment") or {}, default=str)
