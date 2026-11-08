import { describe, expect, it } from "vitest";
import {
  bestBuyAvailabilityUrl,
  filterStoresByRadius,
  mapBestBuyFulfillmentStore,
  mapBestBuyStore,
  parseBestBuyFulfillment,
  parseBestBuyResponse,
  redactBestBuyKey,
} from "../../modules/restock/retailers/bestbuy/parse";

const documentedStore = {
  storeID: "10",
  name: "Maplewood",
  address: "1795 County Rd D E",
  city: "Maplewood",
  state: "MN",
  postalCode: "55109",
  storeType: "Big_Box_Store",
  minPickupHours: null,
  lowStock: false,
  distance: 16.594,
};

describe("Best Buy PDP fulfillment parser", () => {
  it("treats a Sold Out fulfillment payload as ok with no in-stock stores", () => {
    const result = parseBestBuyFulfillment({
      status: 200,
      body: JSON.stringify({
        data: {
          fulfillmentOptions: {
            buttonStates: [
              { buttonState: "SOLD_OUT", displayText: "Sold Out", skuId: "6691841" },
            ],
            ispuDetails: [
              {
                nearbyLocations: null,
                nearbyLocation: null,
                store: { storeId: "382", name: null, city: null, zip: null },
              },
            ],
          },
        },
      }),
      radiusMiles: 30,
    });
    expect(result).toMatchObject({
      status: "ok",
      method: "browser",
      stores: [],
      coversAllStoresInRange: false,
      error: null,
    });
  });

  it("maps a nearby in-stock fulfillment store", () => {
    const store = mapBestBuyFulfillmentStore({
      storeId: "382",
      name: "Denver West",
      city: "Golden",
      state: "CO",
      zip: "80401",
      distance: 4,
      ispuAvailability: [{ pickupEligible: true, quantity: 1 }],
    });
    expect(store).toMatchObject({
      storeId: "382",
      name: "Denver West",
      availability: "available",
    });
  });

  it("does not map a store with no pickup-eligibility signal", () => {
    expect(
      mapBestBuyFulfillmentStore({
        storeId: "382",
        name: "Denver West",
        ispuAvailability: [{ pickupEligible: null, quantity: null }],
      }),
    ).toBeNull();
  });
});

describe("Best Buy availability parser", () => {
  it("builds the documented real-time availability URL", () => {
    const url = bestBuyAvailabilityUrl({
      sku: "13234053",
      postalCode: "80219",
      apiKey: "secret-key",
    });
    expect(url).toContain("/products/13234053/stores.json");
    expect(url).toContain("postalCode=80219");
  });

  it("redacts apiKey from stored errors", () => {
    expect(redactBestBuyKey("https://api.bestbuy.com/v1/x?apiKey=secret-key&x=1")).toContain(
      "apiKey=***",
    );
  });

  it("maps the documented in-stock store shape", () => {
    const store = mapBestBuyStore(documentedStore);
    expect(store).toMatchObject({
      storeId: "10",
      name: "Maplewood",
      city: "Maplewood",
      stateCode: "MN",
      availability: "available",
    });
    expect(store?.distanceMiles).toBeCloseTo(16.594);
  });

  it("parses a documented 200 with stores in range", () => {
    const result = parseBestBuyResponse({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ ispuEligible: true, stores: [documentedStore] }),
      radiusMiles: 30,
    });
    expect(result.status).toBe("ok");
    expect(result.coversAllStoresInRange).toBe(false);
    expect(result.stores).toHaveLength(1);
  });

  it("filters documented 250-mile results down to the selected radius", () => {
    const far = { ...documentedStore, storeID: "99", distance: 80 };
    const result = parseBestBuyResponse({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ stores: [documentedStore, far] }),
      radiusMiles: 30,
    });
    expect(result.stores.map((s) => s.storeId)).toEqual(["10"]);
  });

  it("does not treat an empty stores array as a sold-out census", () => {
    const result = parseBestBuyResponse({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ ispuEligible: true, stores: [] }),
      radiusMiles: 30,
    });
    expect(result.status).toBe("ok");
    expect(result.stores).toEqual([]);
    expect(result.coversAllStoresInRange).toBe(false);
  });

  it("returns blocked for a missing API key (verified 403 shape)", () => {
    const result = parseBestBuyResponse({
      status: 403,
      contentType: "application/json",
      body: JSON.stringify({
        errorCode: "403",
        errorMessage: "We were unable to locate your API Key.",
      }),
    });
    expect(result.status).toBe("blocked");
    expect(result.error).toMatch(/API Key/i);
    expect(result.stores).toEqual([]);
  });

  it("returns malformed when stores is missing", () => {
    const result = parseBestBuyResponse({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ ispuEligible: true }),
    });
    expect(result.status).toBe("malformed");
  });

  it("keeps stores without distance when filtering by radius", () => {
    expect(
      filterStoresByRadius(
        [
          {
            storeId: "1",
            name: "Unknown distance",
            address1: null,
            address2: null,
            city: null,
            stateCode: null,
            postalCode: null,
            phone: null,
            directionsUrl: null,
            distanceMiles: null,
            availability: "available",
            detail: null,
          },
        ],
        15,
      ),
    ).toHaveLength(1);
  });
});
