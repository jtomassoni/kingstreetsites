"""Google Places API client for restaurant discovery."""
import httpx
import os

PLACES_BASE = "https://maps.googleapis.com/maps/api/place"

NATIONAL_CHAINS = {
    "mcdonald's", "burger king", "wendy's", "taco bell", "chipotle", "subway",
    "starbucks", "dunkin", "chick-fil-a", "chick fil a", "kfc", "popeyes",
    "domino's", "pizza hut", "papa john's", "little caesars", "five guys",
    "shake shack", "in-n-out", "whataburger", "sonic", "arby's", "panera",
    "panera bread", "olive garden", "applebee's", "chili's", "red lobster",
    "ihop", "denny's", "waffle house", "cracker barrel", "buffalo wild wings",
    "red robin", "outback", "cheesecake factory", "pf chang's", "noodles",
    "raising cane's", "wingstop", "dave's hot chicken", "first watch",
    "tropical smoothie", "jamba juice", "sweetgreen", "cava", "mod pizza",
    "blaze pizza", "jersey mike's", "jimmy john's", "firehouse subs",
    "moe's", "qdoba", "del taco", "jack in the box", "culver's", "hardee's",
    "carl's jr", "church's chicken", "el pollo loco", "panda express",
    "habit burger", "smashburger", "fatburger", "dq", "dairy queen",
    "baskin robbins", "cold stone", "ben & jerry's", "menchie's",
}

def is_chain(name: str) -> bool:
    return name.lower().strip() in NATIONAL_CHAINS or any(
        chain in name.lower() for chain in NATIONAL_CHAINS if len(chain) > 6
    )

def search_restaurants(zip_code: str, api_key: str) -> list[dict]:
    """Search Google Places for restaurants in a ZIP, return place_ids."""
    # First geocode the ZIP to get lat/lng
    geo_url = f"https://maps.googleapis.com/maps/api/geocode/json"
    geo = httpx.get(geo_url, params={"address": zip_code, "key": api_key}, timeout=10).json()
    if not geo.get("results"):
        raise ValueError(f"Could not geocode ZIP {zip_code}")
    loc = geo["results"][0]["geometry"]["location"]
    lat, lng = loc["lat"], loc["lng"]

    places = []
    next_page = None

    for _ in range(3):  # up to 3 pages = 60 results
        params = {
            "location": f"{lat},{lng}",
            "radius": 2000,
            "type": "restaurant",
            "key": api_key,
        }
        if next_page:
            params = {"pagetoken": next_page, "key": api_key}

        resp = httpx.get(f"{PLACES_BASE}/nearbysearch/json", params=params, timeout=10).json()
        places.extend(resp.get("results", []))
        next_page = resp.get("next_page_token")
        if not next_page:
            break
        import time; time.sleep(2)  # Google requires a short delay before next page token is valid

    return places

def get_place_details(place_id: str, api_key: str) -> dict:
    """Fetch full details for a place."""
    fields = ",".join([
        "place_id", "name", "formatted_address", "formatted_phone_number",
        "website", "rating", "user_ratings_total", "business_status",
        "opening_hours", "price_level", "types",
    ])
    resp = httpx.get(
        f"{PLACES_BASE}/details/json",
        params={"place_id": place_id, "fields": fields, "key": api_key},
        timeout=10,
    ).json()
    return resp.get("result", {})
