"""Scoring for King Street Sites lead analytics.

ICP: neighborhood bars/pubs with missing, dead, or outdated websites —
ideal for AI-prebuilt demo sites + owner outreach.
Pain and site grade drive priority; bar/pub fit boosts opportunity.
"""

from __future__ import annotations

import re
from typing import Optional

from target_profile import is_bar_pub_fit, bar_fit_bonus

# Higher-competition / polished Denver core pockets to down-rank slightly.
HIGH_COMPETITION_ZIPS = {"80202", "80205", "80211"}


def _extract_zip(place: dict) -> str:
    address = place.get("formatted_address") or place.get("address") or ""
    match = re.search(r"\b(\d{5})(?:-\d{4})?\b", address)
    return match.group(1) if match else ""


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
        score += 14
    elif ratings >= 20:
        score += 10
    elif ratings >= 10:
        score += 6
    elif ratings < 5:
        score -= 4  # very quiet — still keep for dive bars

    if rating >= 4.2:
        score += 8
    elif rating >= 3.8:
        score += 5
    elif rating >= 3.3:
        score += 2

    if place.get("formatted_phone_number") or place.get("phone"):
        score += 5

    # Bar/pub ICP — strong fit for demo-site outreach
    if is_bar_pub_fit(place):
        score += 18

    # Sweet spot: real neighborhood spot, not a mega-brand
    if 10 <= ratings <= 250:
        score += 10

    scrape = place.get("_scrape", {})
    # Active social without a real site = reachable owner, still needs a website
    if scrape.get("facebook_only_web"):
        score += 8
    elif scrape.get("social_links") and not place.get("website"):
        score += 6

    if ratings >= 400:
        score -= 6  # likely already invested in web

    zip_code = _extract_zip(place)
    if zip_code in HIGH_COMPETITION_ZIPS:
        score -= 8

    if (place.get("price_level") or 0) >= 3:
        score -= 10

    # Polished conversion stack — not our buyer
    perf = scrape.get("performance")
    if (
        scrape.get("reachable")
        and not scrape.get("looks_stale")
        and (perf is not None and perf >= 75)
        and scrape.get("has_working_ordering")
    ):
        score -= 12

    return max(0, min(score, 100)), kills


def web_pain(place: dict) -> int:
    """Web pain 0-100. Higher = worse site = better demo-site rebuild target."""
    scrape = place.get("_scrape", {})
    bar = is_bar_pub_fit(place)

    if not place.get("website"):
        return 98 if bar else 90

    if scrape.get("facebook_only_web"):
        return 96 if bar else 88

    if not scrape.get("reachable"):
        return 94 if bar else 88

    score = 18  # baseline friction for any live legacy site
    perf = scrape.get("performance")
    accessibility = scrape.get("accessibility")

    if perf is not None:
        if perf < 25:
            score += 30
        elif perf < 40:
            score += 22
        elif perf < 55:
            score += 14
        elif perf >= 75:
            score -= 8
    else:
        score += 12  # unknown often means old CMS / blocked LH

    if accessibility is not None:
        if accessibility < 50:
            score += 18
        elif accessibility < 70:
            score += 10
    else:
        score += 8

    if not scrape.get("has_ordering"):
        score += 16
    elif scrape.get("has_dead_ordering_only"):
        score += 20  # ordering links exist but are broken — great demo pitch
    elif not scrape.get("has_working_ordering"):
        score += 10

    if not scrape.get("has_reservation"):
        score += 8

    if scrape.get("menu_is_pdf"):
        score += 16
    elif not scrape.get("has_html_menu_nav"):
        score += 10

    if not scrape.get("has_contact_form"):
        score += 6
    if not scrape.get("social_links"):
        score += 4

    if scrape.get("looks_ancient"):
        score += 18
    elif scrape.get("looks_stale"):
        score += 12
    if scrape.get("looks_legacy"):
        score += 14

    if bar:
        score += 8

    return min(score, 100)


def opportunity_score(viability: int, pain: int, site_grade: Optional[str] = None, place: Optional[dict] = None) -> int:
    """Pain-led opportunity for demo-site rebuild outreach."""
    if viability <= 0:
        return 0

    blended = round(pain * 0.75 + viability * 0.25)

    grade_adjust = {
        "F": 15,
        "C": 6,
        "B": -12,
        "A": -30,
    }.get(site_grade or "", 0)

    bonus = bar_fit_bonus(place or {}) if place else 0

    return max(0, min(100, blended + grade_adjust + bonus))


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
