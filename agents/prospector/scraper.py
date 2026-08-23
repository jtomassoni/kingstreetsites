"""Playwright-based site scraper: screenshot + DOM signals."""
from __future__ import annotations

import asyncio
import os
import re
import subprocess
import json
import tempfile
from datetime import datetime
from pathlib import Path

import httpx
from playwright.async_api import async_playwright

from contact_enrichment import enrich_contact_from_site

MULTI_LOCATION_KEYWORDS = [
    "find a location", "find your location", "find locations", "our locations",
    "all locations", "view locations", "location finder", "store locator",
    "restaurant locator", "locations near",
]
FRANCHISE_KEYWORDS = [
    "franchise opportunities", "franchise info", "own a franchise",
    "franchising", "become a franchisee",
]
CORPORATE_PLATFORM_MARKERS = [
    "getbento.com", "bentobox.com", "popmenu.com", "singleplatform.com",
    "olo.com", "sevenrooms.com", "touchbistro.com", "spoton.com",
]

ORDERING_LINK_HINTS = (
    "order", "doordash", "grubhub", "ubereats", "uber eats", "toasttab",
    "toast.", "chownow", "slice", "olo.com", "menufy", "clover.com",
)
LEGACY_SITE_MARKERS = (
    "frontpage", "dreamweaver", "swfobject", "flash player",
    "table cellpadding", "under construction", "coming soon",
)
STALE_YEAR_CUTOFF = datetime.now().year - 3
ANCIENT_YEAR_CUTOFF = datetime.now().year - 5
RESERVATION_KEYWORDS = ["reserve", "reservation", "book a table", "book now", "book your table",
                         "opentable", "resy", "yelp reservations", "sevenrooms"]
SOCIAL_PATTERNS = ["instagram.com", "facebook.com", "twitter.com", "x.com", "tiktok.com"]
SOCIAL_ACTIVITY_HINTS = [
    "h ago", "hour ago", "hours ago", "d ago", "day ago", "days ago",
    "w ago", "week ago", "weeks ago", "yesterday", "today"
]

# Same-origin-ish paths that usually mean an HTML menu (not a PDF-only flow).
_MENU_PATH_MARKERS = (
    "/menu", "/menus", "/our-menu", "/dinner-menu", "/lunch-menu", "/brunch-menu",
    "/food", "/eat", "/dining", "/brunch", "/wine-list", "/cocktails", "/beer-wine",
)


def _link_suggests_html_menu(href: str) -> bool:
    if not href or not isinstance(href, str):
        return False
    low = href.lower().split("?", 1)[0].split("#", 1)[0]
    if low.startswith(("mailto:", "tel:", "javascript:")):
        return False
    if ".pdf" in low:
        return False
    if any(m in low for m in _MENU_PATH_MARKERS):
        return True
    # e.g. .../menu.html or trailing /menu
    tail = low.rstrip("/").split("/")[-1]
    return tail in ("menu", "menus", "food", "dining", "eat")


def _stale_signals(content: str) -> dict:
    years = [int(y) for y in re.findall(r"(?:©|copyright|&copy;)\s*(20\d{2})", content, re.I)]
    years += [int(y) for y in re.findall(r"(?:updated|modified|built)\s*:?\s*(20\d{2})", content, re.I)]
    latest = max(years) if years else None
    return {
        "copyright_year": latest,
        "looks_stale": latest is not None and latest < STALE_YEAR_CUTOFF,
        "looks_ancient": latest is not None and latest < ANCIENT_YEAR_CUTOFF,
        "looks_legacy": any(m in content for m in LEGACY_SITE_MARKERS),
    }


async def _audit_ordering_links(links: list[str]) -> dict:
    candidates = [
        l for l in links
        if l and l.startswith("http") and any(h in l.lower() for h in ORDERING_LINK_HINTS)
    ][:4]
    if not candidates:
        return {
            "ordering_links_found": 0,
            "ordering_links_working": 0,
            "ordering_links_dead": 0,
            "has_working_ordering": False,
            "has_dead_ordering_only": False,
        }
    working = dead = 0
    async with httpx.AsyncClient(follow_redirects=True, timeout=8) as client:
        for url in candidates:
            try:
                resp = await client.head(url)
                if resp.status_code >= 400:
                    dead += 1
                else:
                    working += 1
            except Exception:
                dead += 1
    return {
        "ordering_links_found": len(candidates),
        "ordering_links_working": working,
        "ordering_links_dead": dead,
        "has_working_ordering": working > 0,
        "has_dead_ordering_only": dead > 0 and working == 0,
    }


def _is_recent_social_activity(content: str) -> bool:
    low = content.lower()
    return any(hint in low for hint in SOCIAL_ACTIVITY_HINTS)

async def _check_social_activity(page, url: str) -> bool | None:
    try:
        await page.goto(url, wait_until="domcontentloaded", timeout=15000)
        await page.wait_for_timeout(1500)
        content = await page.content()
        return _is_recent_social_activity(content)
    except Exception:
        return None

async def scrape_site(url: str, screenshot_dir: str, slug: str) -> dict:
    """Visit a URL with Playwright, take screenshot, extract DOM signals."""
    result = {
        "url": url,
        "reachable": False,
        "has_ordering": False,
        "has_reservation": False,
        "social_links": [],
        "has_contact_form": False,
        "has_html_menu_nav": False,
        "menu_is_pdf": False,
        "instagram_active_recently": None,
        "facebook_active_recently": None,
        "screenshot_path": None,
        "load_error": None,
        "contact_email": None,
        "contact_name": None,
        "contact_role": None,
        "contact_email_source": None,
        "contact_enrichment": None,
        "has_multi_location": False,
        "has_franchise_signals": False,
        "uses_corporate_platform": False,
        "has_book_now": False,
        "copyright_year": None,
        "looks_stale": False,
        "looks_ancient": False,
        "looks_legacy": False,
        "has_working_ordering": False,
        "has_dead_ordering_only": False,
        "facebook_only_web": False,
    }

    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True)
        context = await browser.new_context(
            viewport={"width": 390, "height": 844},
            user_agent="Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15",
        )
        page = await context.new_page()
        try:
            await page.goto(url, wait_until="domcontentloaded", timeout=20000)
            await page.wait_for_timeout(2000)
            result["reachable"] = True

            content = (await page.content()).lower()

            result["has_ordering"] = any(kw in content for kw in ORDERING_KEYWORDS)
            result.update(_stale_signals(content))
            result["has_reservation"] = any(kw in content for kw in RESERVATION_KEYWORDS)
            result["has_book_now"] = "book now" in content or "book your table" in content
            result["has_contact_form"] = bool(await page.query_selector("form"))
            result["has_multi_location"] = any(kw in content for kw in MULTI_LOCATION_KEYWORDS)
            result["has_franchise_signals"] = any(kw in content for kw in FRANCHISE_KEYWORDS)
            result["uses_corporate_platform"] = any(m in content for m in CORPORATE_PLATFORM_MARKERS)

            # Social links + menu heuristics (avoid ".pdf" anywhere in HTML + "menu" — huge false positives on CMS sites).
            links = await page.eval_on_selector_all(
                "a[href]", "els => els.map(e => e.href)"
            )
            result["has_html_menu_nav"] = any(_link_suggests_html_menu(l) for l in links if l)
            pdf_menu_anchor = await page.evaluate(
                """() => {
                  const as = Array.from(document.querySelectorAll('a[href]'));
                  return as.some(a => {
                    const href = (a.getAttribute('href') || '').toLowerCase();
                    if (!href.includes('.pdf')) return false;
                    const text = (a.textContent || '').toLowerCase();
                    const hrefMenu = /(menu|menus|wine|drink|beer|cocktail|food|dinner|lunch|brunch)/.test(href);
                    const textMenu = /(menu|wine list|drink|dinner|lunch|brunch|download)/.test(text);
                    return hrefMenu || textMenu;
                  });
                }"""
            )
            # PDF menu is a negative signal only if we do not see a normal HTML menu route in links.
            result["menu_is_pdf"] = bool(pdf_menu_anchor) and not result["has_html_menu_nav"]

            result["social_links"] = [
                l for l in links if any(s in l for s in SOCIAL_PATTERNS)
            ]
            location_links = sum(
                1 for l in links
                if l and ("/locations" in l.lower() or "/location/" in l.lower())
            )
            if location_links >= 3:
                result["has_multi_location"] = True

            ordering_audit = await _audit_ordering_links(links)
            result.update(ordering_audit)
            # Keyword in HTML but every ordering link is dead → treat as no real ordering.
            if result["has_ordering"] and result["has_dead_ordering_only"]:
                result["has_ordering"] = False

            # Facebook/Yelp-only web presence — common for dive bars with no real site.
            page_host = url.split("//")[-1].split("/")[0].lower()
            result["facebook_only_web"] = (
                "facebook.com" in page_host
                or ("yelp.com" in page_host and not result["has_html_menu_nav"])
            )

            # Screenshot of the business site before any social navigation.
            screenshot_path = os.path.join(screenshot_dir, f"{slug}.png")
            await page.screenshot(path=screenshot_path, full_page=False)
            result["screenshot_path"] = screenshot_path

            # Skip contact enrichment + social crawling for obvious corporate sites.
            from corporate_signals import is_chain_or_corporate

            corporate, _ = is_chain_or_corporate({}, result)
            if not corporate:
                homepage_html = await page.content()
                contact = await enrich_contact_from_site(page, url, links, homepage_html)
                result["contact_email"] = contact.get("contact_email")
                result["contact_name"] = contact.get("contact_name")
                result["contact_role"] = contact.get("contact_role")
                result["contact_email_source"] = contact.get("contact_email_source")
                result["contact_enrichment"] = contact.get("contact_enrichment")

                instagram_link = next((l for l in result["social_links"] if "instagram.com" in l), None)
                facebook_link = next((l for l in result["social_links"] if "facebook.com" in l), None)
                if instagram_link:
                    result["instagram_active_recently"] = await _check_social_activity(page, instagram_link)
                if facebook_link:
                    result["facebook_active_recently"] = await _check_social_activity(page, facebook_link)

        except Exception as e:
            result["load_error"] = str(e)
        finally:
            await browser.close()

    return result

def run_lighthouse(url: str) -> dict:
    """Run Lighthouse CLI and return key scores."""
    scores = {"performance": None, "accessibility": None}
    try:
        lighthouse_bin = Path(__file__).parent.parent.parent / "node_modules" / ".bin" / "lighthouse"
        with tempfile.NamedTemporaryFile(suffix=".json", delete=False) as f:
            out_path = f.name

        result = subprocess.run(
            [
                str(lighthouse_bin), url,
                "--output=json", f"--output-path={out_path}",
                "--chrome-flags=--headless --no-sandbox",
                "--only-categories=performance,accessibility",
                "--form-factor=mobile",
                "--quiet",
            ],
            capture_output=True, timeout=60,
        )
        if result.returncode == 0:
            with open(out_path) as f:
                data = json.load(f)
            cats = data.get("categories", {})
            scores["performance"] = round((cats.get("performance", {}).get("score") or 0) * 100)
            scores["accessibility"] = round((cats.get("accessibility", {}).get("score") or 0) * 100)
        os.unlink(out_path)
    except Exception:
        pass  # Lighthouse is best-effort; scoring degrades gracefully without it
    return scores

def scrape(url: str, screenshot_dir: str, slug: str, *, run_lh: bool = True) -> dict:
    dom = asyncio.run(scrape_site(url, screenshot_dir, slug))
    if run_lh and dom["reachable"]:
        dom.update(run_lighthouse(url))
    elif not dom["reachable"]:
        dom.update({"performance": None, "accessibility": None})
    return dom
