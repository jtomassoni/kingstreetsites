"use client";

import { useEffect, useMemo, useState } from "react";
import {
  missingPlatforms,
  REQUIRED_SOCIAL_PLATFORMS,
  type SocialConnection,
  type SocialPlatform,
} from "@/lib/social-connections";

type ConnectionsResponse = { connections: SocialConnection[] };

const LABELS: Record<SocialPlatform, string> = {
  instagram: "Instagram",
  facebook: "Facebook",
};

export default function SocialConnectionsCard() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<SocialPlatform | null>(null);
  const [connections, setConnections] = useState<SocialConnection[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [availableProviders, setAvailableProviders] = useState<Set<string>>(new Set());
  const [connectTarget, setConnectTarget] = useState<SocialPlatform | null>(null);
  const [connectOpen, setConnectOpen] = useState(false);
  const [connecting, setConnecting] = useState(false);

  async function loadConnections() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/social-connections");
      if (!res.ok) throw new Error("Could not load social connections");
      const data = (await res.json()) as ConnectionsResponse;
      setConnections(data.connections);
    } catch (e) {
      const message = e instanceof Error ? e.message : "Unknown error";
      setError(message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadConnections();
  }, []);

  useEffect(() => {
    async function loadProviders() {
      try {
        const res = await fetch("/api/auth/providers");
        if (!res.ok) return;
        const data = (await res.json()) as Record<string, unknown>;
        setAvailableProviders(new Set(Object.keys(data)));
      } catch {
        // Keep empty set; UI will show provider unavailable state.
      }
    }
    void loadProviders();
  }, []);

  const missing = useMemo(() => missingPlatforms(connections), [connections]);

  async function disconnect(platform: SocialPlatform) {
    setSaving(platform);
    setError(null);
    try {
      const res = await fetch("/api/social-connections", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ platform, connected: false }),
      });
      if (!res.ok) throw new Error("Could not save social connection");
      const data = (await res.json()) as ConnectionsResponse;
      setConnections(data.connections);
      window.dispatchEvent(new CustomEvent("kss:social-connections-updated"));
    } catch (e) {
      const message = e instanceof Error ? e.message : "Unknown error";
      setError(message);
    } finally {
      setSaving(null);
    }
  }

  function connect(platform: SocialPlatform) {
    setError(null);
    setConnectTarget(platform);
    setConnectOpen(true);
  }

  function launchProviderAuth() {
    if (!connectTarget) return;
    const provider = connectTarget === "instagram" ? "instagram" : "facebook";
    if (!availableProviders.has(provider)) {
      setError(
        `The ${provider} provider is not configured yet. Add AUTH_FACEBOOK_ID and AUTH_FACEBOOK_SECRET, then restart dev server.`
      );
      setConnectOpen(false);
      setConnectTarget(null);
      return;
    }

    const callbackUrl = encodeURIComponent("/admin/leads");
    const url = `/api/auth/signin/${provider}?callbackUrl=${callbackUrl}`;
    setConnecting(true);
    const popup = window.open(url, "kss-social-auth", "width=560,height=740");
    if (!popup) {
      setError("Popup blocked by browser. Please allow popups and try again.");
      setConnecting(false);
      return;
    }

    const timer = window.setInterval(async () => {
      if (popup.closed) {
        window.clearInterval(timer);
        setConnecting(false);
        setConnectOpen(false);
        setConnectTarget(null);
        await loadConnections();
        window.dispatchEvent(new CustomEvent("kss:social-connections-updated"));
      }
    }, 500);
  }

  function providerReady(platform: SocialPlatform): boolean {
    const provider = platform === "instagram" ? "instagram" : "facebook";
    return availableProviders.has(provider);
  }

  return (
    <div className="rounded-xl border border-white/10 bg-slate-900/60 p-4 mb-4">
      <div className="flex items-center justify-between mb-3">
        <div>
          <h2 className="text-sm font-semibold text-white">Social Connections</h2>
          <p className="text-xs text-slate-500 mt-1">
            One click to Meta auth. No manual typing needed.
          </p>
        </div>
        {loading ? (
          <span className="text-xs text-slate-500">Loading…</span>
        ) : missing.length === 0 ? (
          <span className="text-xs text-teal-400">Ready for social checks</span>
        ) : (
          <span className="text-xs text-amber-400">
            Missing: {missing.map((p) => LABELS[p]).join(", ")}
          </span>
        )}
      </div>

      <div className="grid gap-3 md:grid-cols-2">
        {REQUIRED_SOCIAL_PLATFORMS.map((platform) => {
          const current = connections.find((connection) => connection.platform === platform);
          const isConnected = current?.connected ?? false;
          const isSaving = saving === platform;
          return (
            <div key={platform} className="rounded-lg border border-white/10 bg-slate-950/60 p-3">
              <div className="flex items-center justify-between mb-2">
                <p className="text-sm text-white">{LABELS[platform]}</p>
                <span className={`text-xs ${isConnected ? "text-teal-400" : "text-slate-500"}`}>
                  {isConnected ? "Connected" : "Not connected"}
                </span>
              </div>
              <div className="mt-2 flex items-center gap-2">
                <button
                  onClick={() => connect(platform)}
                  disabled={isSaving || isConnected || !providerReady(platform)}
                  className="rounded-md bg-teal-600 hover:bg-teal-500 disabled:opacity-50 transition-colors px-3 py-1.5 text-xs font-semibold text-white"
                >
                  {platform === "instagram" ? "Connect to Instagram" : "Connect to Facebook"}
                </button>
                <button
                  onClick={() => disconnect(platform)}
                  disabled={isSaving || !isConnected}
                  className="rounded-md bg-slate-700 hover:bg-slate-600 disabled:opacity-50 transition-colors px-3 py-1.5 text-xs font-semibold text-slate-300"
                >
                  {isSaving ? "Disconnecting…" : "Disconnect"}
                </button>
              </div>
              {!providerReady(platform) && (
                <p className="mt-2 text-[11px] text-amber-400">
                  Provider not configured yet.
                </p>
              )}
            </div>
          );
        })}
      </div>

      {error && <p className="text-xs text-red-400 mt-3">{error}</p>}

      {connectOpen && connectTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="w-full max-w-md rounded-xl border border-white/10 bg-slate-950 p-5">
            <h3 className="text-base font-semibold text-white mb-2">
              Connect {connectTarget === "instagram" ? "Instagram" : "Facebook"}
            </h3>
            <p className="text-sm text-slate-400 mb-4">
              This opens Meta auth in a popup so you can approve access and come right back here.
            </p>
            <div className="flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => {
                  if (connecting) return;
                  setConnectOpen(false);
                  setConnectTarget(null);
                }}
                className="rounded-md bg-slate-700 hover:bg-slate-600 px-3 py-1.5 text-xs font-semibold text-slate-300"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={connecting}
                onClick={launchProviderAuth}
                className="rounded-md bg-teal-600 hover:bg-teal-500 disabled:opacity-60 px-3 py-1.5 text-xs font-semibold text-white"
              >
                {connecting ? "Waiting for auth…" : "Continue to Meta"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
