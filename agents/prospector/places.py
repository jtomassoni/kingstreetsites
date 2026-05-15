"""Google Places API client for restaurant discovery."""
import httpx

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

ZIP_COORDS: dict[str, tuple[float, float]] = {
    "80211": (39.7612, -105.0178),  # Denver - Highland/LoHi
    "80202": (39.7527, -104.9963),  # Denver - LoDo / Union Station
    "80205": (39.7621, -104.9716),  # Denver - RiNo
    "80110": (39.6462, -105.0014),  # Englewood / Sheridan
    "80226": (39.7113, -105.0942),  # Lakewood
    "80214": (39.7439, -105.0748),  # Lakewood / Wheat Ridge edge
    "80033": (39.7721, -105.0900),  # Wheat Ridge
    "80219": (39.6951, -105.0342),  # Southwest Denver
    "80227": (39.6668, -105.1006),  # Bear Valley / Lakewood
    "80232": (39.6988, -105.0882),  # South-central Lakewood
    "80222": (39.6749, -104.9278),  # Southeast Denver
    "80113": (39.6509, -104.9658),  # Englewood central
    "21231": (39.2839, -76.5919),   # Baltimore - Fells Point
    "21224": (39.2780, -76.5576),   # Baltimore - Canton / Highlandtown
    "21230": (39.2746, -76.6219),   # Baltimore - Federal Hill / Locust Point
    "21211": (39.3275, -76.6408),   # Baltimore - Hampden
    "21215": (39.3456, -76.6850),   # Baltimore NW
    "21218": (39.3289, -76.6028),   # Baltimore North / Waverly
    "21206": (39.3395, -76.5412),   # Baltimore East
}

METRO_ZIP_CODES: dict[str, list[str]] = {
    "Denver": [
        "80110", "80226", "80214", "80033", "80219", "80227",
        "80232", "80222", "80113", "80211", "80202", "80205",
    ],
    "Baltimore": [
        "21231", "21224", "21230", "21211", "21215", "21218", "21206",
    ],
}


def get_zips_for_metro(metro: str) -> list[str]:
    """Return configured ZIP list for a metro."""
    return METRO_ZIP_CODES.get((metro or "").strip().title(), [])

def search_restaurants(zip_code: str, api_key: str) -> list[dict]:
    """Search Google Places for restaurants in a ZIP, return place_ids."""
    if zip_code in ZIP_COORDS:
        lat, lng = ZIP_COORDS[zip_code]
    else:
        # Fallback: geocode via Places API (requires Geocoding API enabled)
        geo = httpx.get(
            "https://maps.googleapis.com/maps/api/geocode/json",
            params={"address": zip_code, "key": api_key}, timeout=10
        ).json()
        if not geo.get("results"):
            raise ValueError(f"Could not geocode ZIP {zip_code}")
        loc = geo["results"][0]["geometry"]["location"]
        lat, lng = loc["lat"], loc["lng"]

    seen = set()
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
        for place in resp.get("results", []):
            pid = place.get("place_id")
            if pid and pid not in seen:
                seen.add(pid)
                places.append(place)

        next_page = resp.get("next_page_token")
        if not next_page:
            break
        import time; time.sleep(2)  # Google requires delay before next page token is valid

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
