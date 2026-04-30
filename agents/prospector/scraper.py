"""Playwright-based site scraper: screenshot + DOM signals."""
import asyncio
import os
import subprocess
import json
import tempfile
from pathlib import Path
from playwright.async_api import async_playwright

ORDERING_KEYWORDS = ["order online", "order now", "doordash", "grubhub", "ubereats",
                     "uber eats", "toast", "square", "olo", "slice", "chownow"]
RESERVATION_KEYWORDS = ["reserve", "reservation", "book a table", "opentable",
                         "resy", "yelp reservations", "sevenrooms"]
SOCIAL_PATTERNS = ["instagram.com", "facebook.com", "twitter.com", "x.com", "tiktok.com"]

async def scrape_site(url: str, screenshot_dir: str, slug: str) -> dict:
    """Visit a URL with Playwright, take screenshot, extract DOM signals."""
    result = {
        "url": url,
        "reachable": False,
        "has_ordering": False,
        "has_reservation": False,
        "social_links": [],
        "has_contact_form": False,
        "menu_is_pdf": False,
        "screenshot_path": None,
        "load_error": None,
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
            result["has_reservation"] = any(kw in content for kw in RESERVATION_KEYWORDS)
            result["has_contact_form"] = bool(await page.query_selector("form"))
            result["menu_is_pdf"] = ".pdf" in content and "menu" in content

            # Social links
            links = await page.eval_on_selector_all(
                "a[href]", "els => els.map(e => e.href)"
            )
            result["social_links"] = [
                l for l in links if any(s in l for s in SOCIAL_PATTERNS)
            ]

            # Screenshot
            screenshot_path = os.path.join(screenshot_dir, f"{slug}.png")
            await page.screenshot(path=screenshot_path, full_page=False)
            result["screenshot_path"] = screenshot_path

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

def scrape(url: str, screenshot_dir: str, slug: str) -> dict:
    dom = asyncio.run(scrape_site(url, screenshot_dir, slug))
    lh = run_lighthouse(url) if dom["reachable"] else {"performance": None, "accessibility": None}
    return {**dom, **lh}
