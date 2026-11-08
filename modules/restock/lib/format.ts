export function formatStoreAddress(store: {
  address1: string | null;
  address2: string | null;
  city: string | null;
  state_code: string | null;
  postal_code: string | null;
}): string | null {
  const line1 = [store.address1, store.address2].filter(Boolean).join(", ");
  const line2 = [store.city, store.state_code].filter(Boolean).join(", ");
  const parts = [line1, [line2, store.postal_code].filter(Boolean).join(" ")].filter(Boolean);
  return parts.length ? parts.join(" · ") : null;
}

export function formatCheckTime(iso: string, timeZone = "America/Denver"): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return new Intl.DateTimeFormat("en-US", {
    timeZone,
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZoneName: "short",
  }).format(d);
}
