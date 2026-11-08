import { bestbuyAdapter } from "@restock/retailers/bestbuy/adapter";
import { gamestopAdapter } from "@restock/retailers/gamestop/adapter";
import type { RetailerAdapter } from "@restock/retailers/types";
import type { RetailerId } from "@restock/types";

export const ADAPTERS: Record<RetailerId, RetailerAdapter> = {
  gamestop: gamestopAdapter,
  bestbuy: bestbuyAdapter,
};

export function adapterFor(retailer: RetailerId): RetailerAdapter {
  return ADAPTERS[retailer];
}

/**
 * Products tracked by default for a new household. Verified identities:
 *  - GameStop product 451607 (PDP title "Nintendo Switch 2 The Legend of
 *    Zelda 40th Anniversary Edition", data-pid 451607).
 *  - Best Buy SKU 13234053 (bestbuy.com /product/…/J7GSL57HTY/sku/13234053).
 */
export const DEFAULT_TRACKED_PRODUCTS = [
  {
    retailer: "gamestop" as const,
    retailerProductId: "451607",
    title: "Nintendo Switch 2 – The Legend of Zelda 40th Anniversary Edition",
    productUrl:
      "https://www.gamestop.com/consoles-hardware/nintendo-switch-2/products/nintendo-switch-2-the-legend-of-zelda-40th-anniversary-edition/451607.html",
  },
  {
    retailer: "bestbuy" as const,
    retailerProductId: "13234053",
    title: "Switch 2 – The Legend of Zelda – 40th Anniversary Edition",
    productUrl:
      "https://www.bestbuy.com/product/switch-2-the-legend-of-zelda-40th-anniversary-edition/J7GSL57HTY",
  },
];
