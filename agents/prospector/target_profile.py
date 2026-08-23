"""Ideal customer profile: neighborhood bars/pubs with weak or missing web presence."""
from __future__ import annotations

BAR_PUB_KEYWORDS = {
    "bar", "tavern", "pub", "saloon", "lounge", "taproom", "tap room",
    "brewery", "brewhouse", "dive", "inn", "roadhouse", "cantina",
    "speakeasy", "ale house", "beer garden", "bottle shop", "wine bar",
    "sports bar", "neighborhood bar", "grill",  # many local grills are bar-first
}

# Skip polished upscale dining — wrong buyer for affordable demo-site rebuilds.
UPSCALE_KEYWORDS = {
    "steakhouse", "chophouse", "omakase", "tasting menu", "fine dining",
    "michelin", "chef's table",
}

UPSCALE_TYPES = {"fine_dining_restaurant"}


def is_bar_pub_fit(place: dict) -> bool:
    name = (place.get("name") or place.get("business_name") or "").lower()
    types = set(place.get("types") or place.get("place_types") or [])
    if "bar" in types or "night_club" in types:
        return True
    return any(k in name for k in BAR_PUB_KEYWORDS)


def is_upscale_skip(name: str, types: list | None, price_level: int | None = None) -> bool:
    types_set = set(types or [])
    if types_set & UPSCALE_TYPES and "bar" not in types_set:
        return True
    if price_level is not None and price_level >= 3 and "bar" not in types_set:
        return True
    lower = name.lower()
    return any(k in lower for k in UPSCALE_KEYWORDS)


def bar_fit_bonus(place: dict) -> int:
    """Extra opportunity points for dive-bar / neighborhood pub fit."""
    if not is_bar_pub_fit(place):
        return 0
    name = (place.get("name") or place.get("business_name") or "").lower()
    bonus = 12
    if any(k in name for k in ("dive", "pub", "tavern", "saloon", "neighborhood")):
        bonus += 8
    return bonus
