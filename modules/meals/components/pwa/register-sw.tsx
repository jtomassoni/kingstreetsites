"use client";

import { useEffect } from "react";

/**
 * Register the PWA service worker in production only.
 * In development, actively unregister so a stale SW can’t serve old
 * `/_next/static` chunks against fresh SSR HTML (hydration mismatch).
 */
export function RegisterServiceWorker() {
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;

    if (process.env.NODE_ENV !== "production") {
      void navigator.serviceWorker.getRegistrations().then((regs) => {
        for (const reg of regs) void reg.unregister();
      });
      if ("caches" in window) {
        void caches.keys().then((keys) => {
          for (const key of keys) {
            if (key.startsWith("mealplan-")) void caches.delete(key);
          }
        });
      }
      return;
    }

    navigator.serviceWorker.register("/sw.js").catch(() => {
      // ignore
    });
  }, []);

  return null;
}
