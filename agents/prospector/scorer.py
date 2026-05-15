"""Scoring logic per architecture.md rubric."""

import re


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
    """Return (score 0-100, list of hard-kill reasons)."""
    kills = []

    if place.get("business_status") != "OPERATIONAL":
        kills.append("not_operational")
    if (place.get("user_ratings_total") or 0) < 10:
        kills.append("fewer_than_10_reviews")
    if (place.get("rating") or 0) < 3.0:
        kills.append("rating_below_3")

    if kills:
        return 0, kills

    score = 0

    ratings = place.get("user_ratings_total", 0) or 0
    rating = place.get("rating", 0) or 0

    if ratings >= 50:
        score += 20
    if rating >= 3.8:
        score += 10
    if ratings >= 10:  # has phone proxy — we check presence of phone
        score += 5
    if place.get("formatted_phone_number"):
        score += 5

    # Independent (not a chain) — already filtered upstream, add bonus
    score += 15

    # Target owner-operated neighborhood bars/grills.
    if _is_neighborhood_bar_fit(place):
        score += 10

    # Budget-fit proxy: established but not massive brands.
    if 15 <= ratings <= 250:
        score += 8

    # Social links on website (from scrape)
    scrape = place.get("_scrape", {})
    if scrape.get("social_links"):
        score += 10
    if scrape.get("instagram_active_recently") or scrape.get("facebook_active_recently"):
        score += 8

    # Placeholder for: ≥1 review in last 30 days (15pts), in biz ≥2yr (10pts),
    # active social (15pts) — requires deeper data not in Places basic fields
    # Award partial credit conservatively
    if ratings >= 100:
        score += 15  # proxy for active, established business
    elif ratings >= 30:
        score += 8

    # De-prioritize polished high-competition districts and higher-end profiles.
    zip_code = _extract_zip(place)
    if zip_code in HIGH_COMPETITION_ZIPS:
        score -= 12

    if (place.get("price_level") or 0) >= 3:
        score -= 8

    scrape = place.get("_scrape", {})
    perf = scrape.get("performance")
    if (
        scrape.get("reachable")
        and (perf is not None and perf >= 80)
        and scrape.get("has_ordering")
        and scrape.get("has_reservation")
    ):
        score -= 10

    return max(0, min(score, 100)), kills


def web_pain(place: dict) -> int:
    """Return web pain score 0-100. Higher = more pain = better opportunity."""
    scrape = place.get("_scrape", {})
    score = 0

    if not place.get("website"):
        # No website is a strong opening for local bars/grills.
        if _is_neighborhood_bar_fit(place):
            return 90
        return 75  # No website at all = high pain

    if not scrape.get("reachable"):
        return 60  # Site exists but unreachable

    perf = scrape.get("performance")
    accessibility = scrape.get("accessibility")

    if perf is not None and perf < 50:
        score += 15
    if accessibility is not None and accessibility < 80:
        score += 10

    if not scrape.get("has_ordering"):
        score += 15
    if not scrape.get("has_reservation"):
        score += 10
    if scrape.get("menu_is_pdf"):
        score += 10
    if not scrape.get("has_contact_form"):
        score += 5
    if not scrape.get("social_links"):
        score += 5

    # If Lighthouse didn't run, give partial credit assuming avg pain
    if perf is None:
        score += 8
    if accessibility is None:
        score += 5

    return min(score, 100)


def opportunity_score(viability: int, pain: int) -> int:
    return round((viability * pain) / 100)


def assign_tier(score: int, all_scores: list[int]) -> str:
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
