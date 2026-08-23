"""Detect chain / corporate / agency-built restaurant sites — skip full analysis."""
from __future__ import annotations

from places import is_chain

# Multi-unit or franchise site copy — not typical of a single owner-operator.
MULTI_LOCATION_KEYWORDS = (
    "find a location",
    "find your location",
    "find locations",
    "our locations",
    "all locations",
    "view locations",
    "location finder",
    "store locator",
    "restaurant locator",
    "locations near",
)

FRANCHISE_KEYWORDS = (
    "franchise opportunities",
    "franchise info",
    "own a franchise",
    "franchising",
    "become a franchisee",
)

# Common restaurant agency / corporate web platforms.
CORPORATE_PLATFORM_MARKERS = (
    "getbento.com",
    "bentobox.com",
    "popmenu.com",
    "singleplatform.com",
    "olo.com",
    "sevenrooms.com",
    "touchbistro.com",
    "spoton.com",
    "thanx.com",
    "fishbowl.com",
    "momentfeed.com",
)


def is_chain_or_corporate(place: dict, scrape: dict | None = None) -> tuple[bool, str]:
    """Return (should_skip, reason_code)."""
    name = place.get("name") or place.get("business_name") or ""
    if is_chain(name):
        return True, "national_chain"

    if not scrape or not scrape.get("reachable"):
        return False, ""

    if scrape.get("has_multi_location"):
        return True, "multi_location_site"
    if scrape.get("uses_corporate_platform"):
        return True, "corporate_platform"
    if scrape.get("has_franchise_signals"):
        return True, "franchise_site"

    reviews = place.get("user_ratings_total") or 0
    conversion_stack = sum(
        1
        for key in ("has_reservation", "has_ordering", "has_html_menu_nav", "has_contact_form")
        if scrape.get(key)
    )
    # Book-now + ordering + reservations on a high-traffic site ≈ agency / corporate build.
    if reviews >= 150 and conversion_stack >= 3 and scrape.get("has_book_now"):
        return True, "agency_grade_site"
    if reviews >= 400 and conversion_stack >= 2:
        return True, "high_volume_brand_site"

    return False, ""


def skip_pitch(reason: str) -> str:
    labels = {
        "national_chain": "National / corporate chain",
        "multi_location_site": "Multi-location corporate site",
        "corporate_platform": "Corporate web platform (agency/CMS)",
        "franchise_site": "Franchise / corporate site",
        "agency_grade_site": "Agency-grade site (book now + ordering + reservations)",
        "high_volume_brand_site": "High-volume brand with polished web presence",
    }
    label = labels.get(reason, reason.replace("_", " "))
    return (
        f"Skipped — {label}. Not a local owner-operator rebuild target."
    )
