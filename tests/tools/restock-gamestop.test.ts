import { describe, expect, it } from "vitest";
import {
  mapGameStopStore,
  parseGameStopResponse,
} from "../../modules/restock/retailers/gamestop/parse";

const inStockStore = {
  ID: "2730",
  name: "Hancock Plaza - GAMESTOP",
  address1: "2850 S ACADEMY BLVD",
  address2: "STE 150",
  city: "COLORADO SPRINGS",
  postalCode: "80916",
  phone: "(719) 392-0035",
  stateCode: "CO",
  storeDirectionsUrl:
    "https://www.google.com/maps/dir/?api=1&destination=2850%20S%20ACADEMY%20BLVD",
  distance: "65.63",
  isInStock: true,
  isLimitedStock: true,
  conditionsInStock: ["New"],
  inventory: [{ sku: "451607", count: 1 }],
};

const outStore = {
  ID: "0813",
  name: "C/o Barnes & Noble - GAMESTOP",
  address1: "960 S COLORADO BLVD",
  city: "Denver",
  postalCode: "80246",
  phone: "(303) 757-1005",
  stateCode: "CO",
  distance: "7.61",
  isInStock: false,
  isLimitedStock: true,
  conditionsInStock: [],
  inventory: [{ sku: "451607", count: 0 }],
};

describe("GameStop inventory parser", () => {
  it("maps a verified in-stock store from Stores-FindStores", () => {
    const store = mapGameStopStore(inStockStore);
    expect(store).toMatchObject({
      storeId: "2730",
      name: "Hancock Plaza - GAMESTOP",
      phone: "(719) 392-0035",
      availability: "available",
      detail: "Limited stock · New",
    });
    expect(store?.distanceMiles).toBeCloseTo(65.63);
  });

  it("maps an out-of-stock store as unavailable, not unknown", () => {
    expect(mapGameStopStore(outStore)?.availability).toBe("unavailable");
  });

  it("treats a missing isInStock flag as unknown, not sold out", () => {
    const store = mapGameStopStore({ ID: "1", name: "Test Store" });
    expect(store?.availability).toBe("unknown");
  });

  it("parses a FindStores payload with mixed availability", () => {
    const result = parseGameStopResponse({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ stores: [outStore, inStockStore] }),
      endpoint: "find",
    });
    expect(result.status).toBe("ok");
    expect(result.coversAllStoresInRange).toBe(true);
    expect(result.stores.map((s) => s.availability)).toEqual([
      "unavailable",
      "available",
    ]);
  });

  it("does not treat an empty FindStores list as sold out", () => {
    const result = parseGameStopResponse({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ stores: [], radius: 30 }),
      endpoint: "find",
    });
    expect(result).toMatchObject({
      status: "ok",
      stores: [],
      error: null,
      coversAllStoresInRange: true,
    });
  });

  it("marks InventorySearch empty lists as not covering every store", () => {
    const result = parseGameStopResponse({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ stores: [] }),
      endpoint: "inventory",
    });
    expect(result.status).toBe("ok");
    expect(result.coversAllStoresInRange).toBe(false);
  });

  it("returns blocked for Cloudflare HTML, not sold out", () => {
    const result = parseGameStopResponse({
      status: 403,
      contentType: "text/html",
      body: "<html><title>Attention Required! | Cloudflare</title><h1>Sorry, you have been blocked</h1></html>",
      endpoint: "find",
    });
    expect(result.status).toBe("blocked");
    expect(result.stores).toEqual([]);
  });

  it("returns malformed when JSON has no stores array", () => {
    const result = parseGameStopResponse({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ locations: [], searchKey: {} }),
      endpoint: "find",
    });
    expect(result.status).toBe("malformed");
    expect(result.stores).toEqual([]);
  });

  it("returns malformed for non-JSON 200s", () => {
    const result = parseGameStopResponse({
      status: 200,
      contentType: "text/html",
      body: "<html>ok</html>",
      endpoint: "find",
    });
    expect(result.status).toBe("malformed");
  });
});
