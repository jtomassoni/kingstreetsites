/** Canonical site URL for metadata and absolute OG image links. */
export function getSiteUrl(): URL {
  if (process.env.APP_URL) {
    return new URL(process.env.APP_URL);
  }
  if (process.env.VERCEL_URL) {
    return new URL(`https://${process.env.VERCEL_URL}`);
  }
  return new URL("http://localhost:3000");
}
