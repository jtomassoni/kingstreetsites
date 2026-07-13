"""Scoring for King Street Sites lead analytics.

Business model: find restaurants/bars with horrible (or missing) websites,
offer an affordable rebuild, then simple hourly rates for updates.
Pain and site grade drive priority; viability is a soft qualifier.
"""

from __future__ import annotations

import re
from typing import Optional


BAR_KEYWORDS = {
    "bar", "tavern", "pub", "saloon", "lounge", "grill", "inn", "roadhouse",
}

# Higher-competition / polished Denver core pockets to down-rank slightly.
HIGH_COMPETITION_ZIPS = {"80202", "80205", "80211"}


def _extract_zip(place: dict) -> str:
    address = place.get("formatted_address") or ""
    match = re.search(r"\b(\d{5})(?:-\d{4})?\b", address)
    return match.group(1) if match else ""


def _is_neighborhood_bar_fit(place: dict) -> bool:
    name = (place.get("name") or "").lower()
    types = set(place.get("types") or [])
    has_bar_type = "bar" in types
    has_bar_keyword = any(k in name for k in BAR_KEYWORDS)
    return has_bar_type or has_bar_keyword


def business_viability(place: dict) -> tuple[int, list[str]]:
    """Return (score 0-100, list of hard-kill reasons).

    Soft on quiet-but-real local spots (few reviews) so ugly sites still surface.
    Hard-kill only clearly dead or toxic businesses.
    """
    kills = []

    if place.get("business_status") != "OPERATIONAL":
        kills.append("not_operational")
    if (place.get("rating") or 0) < 3.0 and (place.get("user_ratings_total") or 0) >= 10:
        kills.append("rating_below_3")

    if kills:
        return 0, kills

    score = 40  # baseline: operational local business is workable

    ratings = place.get("user_ratings_total", 0) or 0
    rating = place.get("rating", 0) or 0

    if ratings >= 50:
        score += 18
    elif ratings >= 20:
        score += 12
    elif ratings >= 10:
        score += 6
    elif ratings < 5:
        score -= 8  # very quiet — still keep, but lower

    if rating >= 4.2:
        score += 10
    elif rating >= 3.8:
        score += 6
    elif rating >= 3.3:
        score += 2

    if place.get("formatted_phone_number"):
        score += 5

    # Independent owner-ops (already filtered upstream)
    score += 10

    if _is_neighborhood_bar_fit(place):
        score += 8

    # Established but not mega-brand — sweet for affordable rebuilds
    if 15 <= ratings <= 400:
        score += 8

    scrape = place.get("_scrape", {})
    if scrape.get("social_links"):
        score += 6
    if scrape.get("instagram_active_recently") or scrape.get("facebook_active_recently"):
        score += 6

    if ratings >= 100:
        score += 10
    elif ratings >= 30:
        score += 5

    zip_code = _extract_zip(place)
    if zip_code in HIGH_COMPETITION_ZIPS:
        score -= 10

    if (place.get("price_level") or 0) >= 3:
        score -= 8

    # Already polished site → weaker rebuild target (viability stays, opp will drop via pain)
    perf = scrape.get("performance")
    if (
        scrape.get("reachable")
        and (perf is not None and perf >= 80)
        and scrape.get("has_ordering")
        and scrape.get("has_reservation")
    ):
        score -= 8

    return max(0, min(score, 100)), kills


def web_pain(place: dict) -> int:
    """Web pain 0-100. Higher = worse site = better rebuild outreach target."""
    scrape = place.get("_scrape", {})

    if not place.get("website"):
        # Missing site is a clean launch offer
        if _is_neighborhood_bar_fit(place):
            return 95
        return 88

    if not scrape.get("reachable"):
        # Broken / dead site — prime rebuild
        return 92

    score = 20  # baseline friction for any live legacy site
    perf = scrape.get("performance")
    accessibility = scrape.get("accessibility")

    # Performance / mobile — lean hard into slow or unusable
    if perf is not None:
        if perf < 25:
            score += 28
        elif perf < 40:
            score += 20
        elif perf < 55:
            score += 12
    else:
        score += 10  # unknown often means old CMS / blocked LH

    if accessibility is not None:
        if accessibility < 50:
            score += 18
        elif accessibility < 70:
            score += 10
    else:
        score += 6

    if not scrape.get("has_ordering"):
        score += 12
    if not scrape.get("has_reservation"):
        score += 10
    if scrape.get("menu_is_pdf"):
        score += 14
    if not scrape.get("has_html_menu_nav") and scrape.get("menu_is_pdf"):
        score += 6
    if not scrape.get("has_contact_form"):
        score += 6
    if not scrape.get("social_links"):
        score += 4

    return min(score, 100)


def opportunity_score(viability: int, pain: int, site_grade: Optional[str] = None) -> int:
    """Pain-led opportunity for affordable rebuild outreach.

    Horrible sites (high pain / F) rise to the top. Viability keeps dead
    businesses from dominating, but does not equal-weight pain away.
    """
    if viability <= 0:
        return 0

    # Weighted blend — pain is the product signal
    blended = round(pain * 0.7 + viability * 0.3)

    grade_adjust = {
        "F": 12,   # no site / broken / disastrous UX
        "C": 4,    # clearly outdated — still a rebuild pitch
        "B": -8,   # decent enough — lower priority
        "A": -22,  # already fine — deprioritize
    }.get(site_grade or "", 0)

    return max(0, min(100, blended + grade_adjust))


def assign_tier(score: int, all_scores: list[int]) -> str:
    """Legacy percentile tier — analyzer uses tier_from_grade instead."""
    if not all_scores:
        return "C"
    sorted_scores = sorted(all_scores, reverse=True)
    n = len(sorted_scores)
    top_10 = sorted_scores[: max(1, n // 10)]
    top_30 = sorted_scores[: max(1, n // 3)]
    if score >= top_10[-1] and score > 0:
        return "A"
    if score >= top_30[-1] and score > 0:
        return "B"
    if score > 0:
        return "C"
    return "reject"
