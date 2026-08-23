"""Google Places API client for restaurant discovery."""
from __future__ import annotations

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
    "a&w", "long john silver's", "taco john's", "checkers", "rally's",
    "white castle", "zaxby's", "bojangles", "captain d's", "steak 'n shake",
    # Casual / upscale dining chains
    "rodizio grill", "ted's montana grill", "fogo de chao", "fogo de chão",
    "texas de brazil", "ruth's chris", "morton's", "capital grille",
    "longhorn steakhouse", "texas roadhouse", "golden corral", "sizzler",
    "yard house", "bj's restaurant", "bj's brewhouse", "seasons 52",
    "cooper's hawk", "melting pot", "benihana", "hooters", "twin peaks",
    "lazy dog", "true food kitchen", "north italia", "flower child",
    "mccormick & schmick", "bonefish grill", "carrabba's", "maggiano's",
    "legal sea foods", "eddie v's", "del frisco", "mastro's", "mastros",
    "black bear diner", "snooze", "nando's", "j alexander's", "j. alexander's",
    "carrabba's italian grill", "bahama breeze", "columbia restaurant",
    "rainforest cafe", "hard rock cafe", "dave & buster", "dave and buster",
    "claim jumper", "california pizza kitchen", "cpk", "nobu", "stk",
}

# Aliases for name matching beyond exact NATIONAL_CHAINS entries.
CHAIN_ALIASES: dict[str, list[str]] = {
    "kfc": ["kfc", "kentucky fried chicken"],
    "mcdonald's": ["mcdonald", "mcdonalds", "mcdonald's"],
    "burger king": ["burger king"],
    "wendy's": ["wendy", "wendy's"],
    "taco bell": ["taco bell"],
    "chick-fil-a": ["chick-fil-a", "chick fil a", "chickfila"],
    "popeyes": ["popeyes", "popeye's"],
    "a&w": ["a&w", "a & w"],
    "pizza hut": ["pizza hut"],
    "domino's": ["domino", "domino's"],
    "papa john's": ["papa john", "papa john's"],
    "dairy queen": ["dairy queen"],
    "jack in the box": ["jack in the box"],
    "panda express": ["panda express"],
    "raising cane's": ["raising cane", "raising cane's"],
    "church's chicken": ["church's chicken", "churchs chicken"],
    "el pollo loco": ["el pollo loco"],
    "arby's": ["arby", "arby's"],
    "subway": ["subway"],
    "starbucks": ["starbucks"],
    "dunkin": ["dunkin"],
    "chipotle": ["chipotle"],
    "sonic": ["sonic drive"],
    "whataburger": ["whataburger"],
    "in-n-out": ["in-n-out", "in n out"],
    "five guys": ["five guys"],
    "shake shack": ["shake shack"],
    "buffalo wild wings": ["buffalo wild wings", "bww"],
    "olive garden": ["olive garden"],
    "applebee's": ["applebee", "applebee's"],
    "chili's": ["chili's", "chilis"],
    "ihop": ["ihop"],
    "denny's": ["denny", "denny's"],
    "waffle house": ["waffle house"],
    "cracker barrel": ["cracker barrel"],
    "rodizio grill": ["rodizio"],
    "ted's montana grill": ["ted's montana", "teds montana"],
    "fogo de chao": ["fogo de chao", "fogo de chão"],
    "texas de brazil": ["texas de brazil"],
    "longhorn steakhouse": ["longhorn steakhouse"],
    "texas roadhouse": ["texas roadhouse"],
    "golden corral": ["golden corral"],
    "yard house": ["yard house"],
    "bj's restaurant": ["bj's restaurant", "bjs restaurant", "bj's brewhouse"],
    "true food kitchen": ["true food kitchen"],
    "north italia": ["north italia"],
    "cooper's hawk": ["cooper's hawk", "coopers hawk"],
    "benihana": ["benihana"],
    "lazy dog": ["lazy dog"],
    "black bear diner": ["black bear diner"],
    "snooze": ["snooze an am", "snooze eatery"],
}

FAST_FOOD_TYPES = {"fast_food_restaurant"}

CONVENIENCE_STORE_TYPES = {"convenience_store"}

# C-store / travel-center chains (7-Eleven is not in NATIONAL_CHAINS).
CONVENIENCE_NAME_MARKERS = (
    "7-eleven",
    "7 eleven",
    "seven eleven",
    "circle k",
    "ampm",
    "am pm",
    "am/pm",
    "wawa",
    "sheetz",
    "racetrac",
    "race trac",
    "kwik trip",
    "kwiktrip",
    "casey's",
    "caseys general",
    "royal farms",
    "speedway",
    "maverick",
    "thornton's",
    "thorntons",
    "quiktrip",
    "quick trip",
    "cumberland farms",
    "stripes ",
    "kum & go",
    "kum and go",
    "allsup's",
    "allsups",
    "flying j",
    "pilot travel",
    "extramile",
    "extra mile",
    "on the run",
    "on-the-run",
    "loaf 'n jug",
    "ez mart",
    "ezmart",
    "cefco",
    "cefco food",
    "mapco",
    "turkey hill",
    "rutter's",
    "rutters",
    "getgo",
    "get go",
    "couch potato",
)


def match_chain_brand(name: str) -> str | None:
    """Return canonical brand key if name matches a national chain, else None."""
    lower = f" {name.lower().strip()} "
    if name.lower().strip() in NATIONAL_CHAINS:
        return name.lower().strip()
    for brand, aliases in CHAIN_ALIASES.items():
        for alias in aliases:
            if alias in lower or alias in name.lower():
                return brand
    for chain in NATIONAL_CHAINS:
        if len(chain) > 4 and chain in name.lower():
            return chain
    return None


def is_chain(name: str) -> bool:
    return match_chain_brand(name) is not None


def is_fast_food(types: list | None) -> bool:
    return bool(FAST_FOOD_TYPES & set(types or []))


def is_convenience_store(name: str, types: list | None = None) -> bool:
    """Gas-station marts, 7-Eleven, etc. — not bar/restaurant rebuild targets."""
    types_set = set(types or [])
    if types_set & CONVENIENCE_STORE_TYPES:
        return True
    lower = f" {name.lower().strip()} "
    return any(marker in lower or marker in name.lower() for marker in CONVENIENCE_NAME_MARKERS)


ZIP_COORDS: dict[str, tuple[float, float]] = {
    # Denver — downtown / central
    "80202": (39.7527, -104.9963),  # LoDo / Union Station
    "80203": (39.7312, -104.9823),  # Capitol Hill / City Park West
    "80204": (39.7396, -105.0258),  # West Denver / Sun Valley
    "80205": (39.7621, -104.9716),  # RiNo / Five Points
    "80206": (39.7406, -104.9489),  # Cherry Creek / Congress Park
    "80207": (39.7596, -104.9327),  # Park Hill
    "80209": (39.7048, -104.9598),  # Washington Park / Cory Merrill
    "80210": (39.6789, -104.9618),  # University / Platt Park
    "80211": (39.7612, -105.0178),  # Highland / LoHi
    "80212": (39.7686, -105.0469),  # West Highland / Sloan Lake
    "80216": (39.7848, -104.9956),  # North Denver / Elyria Swansea
    "80218": (39.7398, -104.9698),  # Capitol Hill / Uptown
    "80220": (39.7328, -104.9068),  # Park Hill / Montclair
    "80223": (39.6996, -105.0098),  # Baker / Athmar Park
    "80224": (39.6868, -104.9098),  # Virginia Village
    "80231": (39.6478, -104.8748),  # Hampden / Southeast
    "80236": (39.6472, -105.0258),  # Sheridan / South King
    "80237": (39.6478, -104.8998),  # Hampden South / Southmoor
    "80238": (39.7828, -104.8898),  # Central Park / Stapleton
    "80239": (39.7848, -104.8398),  # Montbello
    "80246": (39.7048, -104.9298),  # Glendale / Cherry Creek
    "80247": (39.6948, -104.8798),  # Southeast Denver
    # Denver — west / southwest
    "80219": (39.6951, -105.0342),  # Southwest Denver
    "80226": (39.7113, -105.0942),  # Lakewood
    "80227": (39.6668, -105.1006),  # Bear Valley / Lakewood
    "80228": (39.6868, -105.0598),  # Green Mountain
    "80232": (39.6988, -105.0882),  # South-central Lakewood
    "80235": (39.6468, -105.0598),  # Ken Caryl / Southwest
    # Inner suburbs
    "80002": (39.7548, -105.0998),  # Arvada
    "80003": (39.8148, -105.0598),  # Arvada
    "80004": (39.8148, -105.1198),  # Arvada / West
    "80005": (39.8548, -105.0998),  # Arvada / Westminster edge
    "80033": (39.7721, -105.0900),  # Wheat Ridge
    "80214": (39.7439, -105.0748),  # Lakewood / Wheat Ridge edge
    "80221": (39.8348, -105.0098),  # Federal Heights / North
    "80222": (39.6749, -104.9278),  # Southeast Denver / Glendale edge
    "80110": (39.6462, -105.0014),  # Englewood / Sheridan
    "80113": (39.6509, -104.9658),  # Englewood
    "80120": (39.5948, -105.0098),  # Littleton
    "80121": (39.6148, -104.9598),  # Littleton / Greenwood Village
    "80122": (39.5948, -104.9598),  # Centennial / Littleton
    "80123": (39.6148, -105.0998),  # Littleton / Southwest
    # Baltimore
    "21231": (39.2839, -76.5919),   # Fells Point
    "21224": (39.2780, -76.5576),   # Canton / Highlandtown
    "21230": (39.2746, -76.6219),   # Federal Hill / Locust Point
    "21211": (39.3275, -76.6408),   # Hampden
    "21215": (39.3456, -76.6850),   # NW Baltimore
    "21218": (39.3289, -76.6028),   # North / Waverly
    "21206": (39.3395, -76.5412),   # East Baltimore
}

METRO_ZIP_CODES: dict[str, list[str]] = {
    "Denver": [
        # Downtown / central Denver
        "80202", "80203", "80204", "80205", "80206", "80207", "80209", "80210",
        "80211", "80212", "80216", "80218", "80220", "80223", "80224", "80231",
        "80236", "80237", "80238", "80239", "80246", "80247",
        # West / southwest Denver
        "80219", "80226", "80227", "80228", "80232", "80235",
        # Inner suburbs
        "80002", "80003", "80004", "80005", "80033", "80214", "80221", "80222",
        "80110", "80113", "80120", "80121", "80122", "80123",
    ],
    "Baltimore": [
        "21231", "21224", "21230", "21211", "21215", "21218", "21206",
    ],
}


def get_zips_for_metro(metro: str) -> list[str]:
    """Return configured ZIP list for a metro."""
    return METRO_ZIP_CODES.get((metro or "").strip().title(), [])


def _nearby_search(lat: float, lng: float, place_type: str, api_key: str) -> list[dict]:
    """Google Places nearbysearch for one type, up to ~60 results."""
    seen: set[str] = set()
    places: list[dict] = []
    next_page = None

    for _ in range(3):
        params: dict = {
            "location": f"{lat},{lng}",
            "radius": 2000,
            "type": place_type,
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
        import time
        time.sleep(2)

    return places


def _zip_centroid(zip_code: str, api_key: str) -> tuple[float, float]:
    if zip_code in ZIP_COORDS:
        return ZIP_COORDS[zip_code]
    geo = httpx.get(
        "https://maps.googleapis.com/maps/api/geocode/json",
        params={"address": zip_code, "key": api_key},
        timeout=10,
    ).json()
    if not geo.get("results"):
        raise ValueError(f"Could not geocode ZIP {zip_code}")
    loc = geo["results"][0]["geometry"]["location"]
    return loc["lat"], loc["lng"]


def search_bars_and_restaurants(zip_code: str, api_key: str) -> list[dict]:
    """Search bars + restaurants in a ZIP — deduped. Bars are the primary ICP."""
    lat, lng = _zip_centroid(zip_code, api_key)
    seen: set[str] = set()
    places: list[dict] = []
    for place_type in ("bar", "restaurant"):
        for place in _nearby_search(lat, lng, place_type, api_key):
            pid = place.get("place_id")
            if pid and pid not in seen:
                seen.add(pid)
                places.append(place)
    return places


def search_restaurants(zip_code: str, api_key: str) -> list[dict]:
    """Search Google Places for restaurants in a ZIP, return place_ids."""
    lat, lng = _zip_centroid(zip_code, api_key)
    return _nearby_search(lat, lng, "restaurant", api_key)

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
