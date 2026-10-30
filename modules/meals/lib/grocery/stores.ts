export const STORES = [
  { id: "king_soopers", label: "King Soopers" },
  { id: "whole_foods", label: "Whole Foods" },
  { id: "costco", label: "Costco" },
  { id: "any", label: "Any Store" },
] as const;

export type StoreId = (typeof STORES)[number]["id"];

export function getStoreLabel(storeId: string): string {
  const store = STORES.find((s) => s.id === storeId);
  return store?.label ?? storeId;
}
