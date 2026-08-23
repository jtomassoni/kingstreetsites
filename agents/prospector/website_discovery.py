"""Discover a business website via web search when Google Places returns social/directory URLs."""
from __future__ import annotations

import os
import re
import time
from urllib.parse import unquote, urlparse

import httpx

# Host fragments we should never treat as the business's own site.
BLOCKED_HOST_FRAGMENTS = (
    "facebook.com",
    "m.facebook.com",
    "instagram.com",
    "yelp.com",
    "tripadvisor.",
    "twitter.com",
    "x.com",
    "tiktok.com",
    "doordash.com",
    "grubhub.com",
    "ubereats.com",
    "postmates.com",
    "seamless.com",
    "google.com",
    "maps.google",
    "goo.gl/maps",
    "linkedin.com",
    "youtube.com",
    "pinterest.com",
    "opentable.com",
    "resy.com",
    "toasttab.com",
    "menupages.com",
    "allmenus.com",
    "zmenu.com",
    "restaurantguru.com",
    "foursquare.com",
    "bbb.org",
    "yellowpages.com",
    "manta.com",
    "mapquest.com",
    "wikipedia.org",
    "reddit.com",
    "t.co",
    "bit.ly",
)

NAME_STOP_WORDS = frozenset(
    {
        "bar",
        "grill",
        "restaurant",
        "the",
        "and",
        "pub",
        "cafe",
        "kitchen",
        "tavern",
        "lounge",
        "brewery",
        "pizza",
        "inc",
        "llc",
        "co",
    }
)

_last_search_at = 0.0
_MIN_SEARCH_INTERVAL_SEC = float(os.environ.get("WEBSITE_DISCOVERY_MIN_INTERVAL", "0.35"))


def is_weak_website_url(url: str | None) -> bool:
    """True when Places gave us nothing useful (social, directory, empty)."""
    if not url or not str(url).strip():
        return True
    try:
        host = urlparse(str(url).strip()).netloc.lower().removeprefix("www.")
    except Exception:
        return True
    if not host:
        return True
    return any(fragment in host for fragment in BLOCKED_HOST_FRAGMENTS)


def _normalize_tokens(name: str) -> list[str]:
    raw = re.split(r"[^a-z0-9]+", (name or "").lower())
    return [t for t in raw if len(t) > 2 and t not in NAME_STOP_WORDS]


def _extract_city(metro: str | None, address: str | None) -> str | None:
    if metro and metro.strip():
        return metro.strip()
    if not address:
        return None
    # "3889 S King St, Denver, CO 80236, USA"
    parts = [p.strip() for p in address.split(",") if p.strip()]
    if len(parts) >= 3:
        return parts[-3]
    if len(parts) >= 2:
        return parts[-2].split()[0]
    return None


def build_search_query(
    business_name: str,
    *,
    metro: str | None = None,
    address: str | None = None,
) -> str:
    """e.g. Monaghan's Bar and Grill Denver"""
    city = _extract_city(metro, address)
    parts = [business_name.strip()]
    if city:
        parts.append(city)
    return " ".join(p for p in parts if p)


def _is_blocked_url(url: str) -> bool:
    try:
        host = urlparse(url).netloc.lower().removeprefix("www.")
    except Exception:
        return True
    if not host or not host.count("."):
        return True
    return any(fragment in host for fragment in BLOCKED_HOST_FRAGMENTS)


def _name_match_score(business_name: str, url: str, title: str = "") -> int:
    tokens = _normalize_tokens(business_name)
    if not tokens:
        return 0
    host = urlparse(url).netloc.lower().removeprefix("www.")
    path = urlparse(url).path.lower()
    blob = f"{host} {path} {title.lower()}"
    score = 0
    for token in tokens:
        if token in blob:
            score += 12
    # Strong signal: distinctive token in domain (e.g. monaghans in monaghansbarandgrilldenver.com)
    if tokens[0] in host.replace("-", "").replace(".", ""):
        score += 18
    if len(tokens) >= 2 and tokens[0] in blob and tokens[1] in blob:
        score += 10
    return score


def pick_best_website(
    candidates: list[tuple[str, str]],
    business_name: str,
    *,
    min_score: int = 12,
) -> str | None:
    """Choose the best (url, title) pair from search results."""
    best_url: str | None = None
    best_score = 0
    seen_hosts: set[str] = set()

    for url, title in candidates:
        if not url or _is_blocked_url(url):
            continue
        host = urlparse(url).netloc.lower().removeprefix("www.")
        if host in seen_hosts:
            continue
        seen_hosts.add(host)
        score = _name_match_score(business_name, url, title)
        if score > best_score:
            best_score = score
            best_url = url

    if best_url and best_score >= min_score:
        return best_url
    return None


def _throttle_search() -> None:
    global _last_search_at
    now = time.monotonic()
    wait = _MIN_SEARCH_INTERVAL_SEC - (now - _last_search_at)
    if wait > 0:
        time.sleep(wait)
    _last_search_at = time.monotonic()


def _search_duckduckgo_html(query: str) -> list[tuple[str, str]]:
    """Web search via DuckDuckGo HTML — no API key required."""
    _throttle_search()
    resp = httpx.post(
        "https://html.duckduckgo.com/html/",
        data={"q": query, "kl": "us-en"},
        headers={
            "User-Agent": (
                "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
                "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36"
            ),
            "Accept-Language": "en-US,en;q=0.9",
        },
        follow_redirects=True,
        timeout=15,
    )
    resp.raise_for_status()
    html = resp.text

    out: list[tuple[str, str]] = []
    seen: set[str] = set()

    # Current DDG HTML: direct href on result__a
    for match in re.finditer(
        r'class="result__a"\s+href="(https?://[^"]+)"',
        html,
        flags=re.I,
    ):
        url = unquote(match.group(1))
        host = urlparse(url).netloc.lower()
        if host in seen:
            continue
        seen.add(host)
        out.append((url, ""))

    if out:
        return out

    # Legacy DDG markup: uddg= encoded outbound links
    for match in re.finditer(r'class="result__a"[^>]*href="[^"]*uddg=([^"&]+)', html):
        url = unquote(match.group(1))
        if url.startswith("http"):
            host = urlparse(url).netloc.lower()
            if host not in seen:
                seen.add(host)
                out.append((url, ""))

    return out


def search_web_for_website(query: str) -> list[tuple[str, str]]:
    """Search the web for candidate business websites."""
    try:
        return _search_duckduckgo_html(query)
    except Exception as exc:
        print(f"[website_discovery] DuckDuckGo search failed for {query!r}: {exc}")
        return []


def discover_website(
    business_name: str,
    *,
    metro: str | None = None,
    address: str | None = None,
    places_website: str | None = None,
) -> str | None:
    """
    Find a likely business-owned website via web search.
    Returns None if Places already gave a good URL or search finds nothing confident.
    """
    if not is_weak_website_url(places_website):
        return None

    query = build_search_query(business_name, metro=metro, address=address)
    if not query.strip():
        return None

    results = search_web_for_website(query)
    picked = pick_best_website(results, business_name)
    if picked:
        print(
            f"[website_discovery] {business_name!r}: "
            f"{places_website or '(none)'} → {picked} (query: {query!r})"
        )
    return picked


def resolve_website_url(
    business_name: str,
    places_website: str | None,
    *,
    metro: str | None = None,
    address: str | None = None,
) -> tuple[str | None, str | None]:
    """
    Return (final_url, discovery_source).
    discovery_source is 'places', 'search', or None.
    """
    if not is_weak_website_url(places_website):
        return places_website, "places"

    discovered = discover_website(
        business_name,
        metro=metro,
        address=address,
        places_website=places_website,
    )
    if discovered:
        return discovered, "search"
    return places_website, None
