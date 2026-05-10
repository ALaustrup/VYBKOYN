"use client";

import { useCallback, useEffect, useRef, useState } from "react";

const API = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

function parseClientBuild(): number {
  const v = process.env.NEXT_PUBLIC_CLIENT_BUILD ?? "";
  const n = Number.parseInt(v, 10);
  return Number.isFinite(n) ? n : -1;
}

async function hardReloadClearingCaches(): Promise<void> {
  try {
    if ("caches" in window && typeof caches?.keys === "function") {
      const keys = await caches.keys();
      await Promise.all(keys.map((k) => caches.delete(k)));
    }
  } catch {
    /* ignore */
  }
  const u = new URL(window.location.href);
  u.searchParams.set("_koyn_v", String(Date.now()));
  window.location.replace(u.toString());
}

type VersionPayload = {
  requiredClientBuild: number;
  policy?: string;
};

/**
 * Server-driven mandatory update gate. No local override: users cannot dismiss or disable it.
 * If the version endpoint is unreachable, the shell stays blocked until verification succeeds.
 */
export function MandatoryUpdateGate({ children }: { children: React.ReactNode }) {
  const clientBuild = parseClientBuild();
  const [screen, setScreen] = useState<"checking" | "ready" | "blocked">("checking");
  const [detail, setDetail] = useState<string | null>(null);
  const reloadTimer = useRef<ReturnType<typeof setInterval> | null>(null);

  const verify = useCallback(async () => {
    if (clientBuild < 0) {
      setScreen("blocked");
      setDetail("Client build misconfigured. Redeploy the web app with NEXT_PUBLIC_CLIENT_BUILD.");
      return;
    }

    let payload: VersionPayload;
    try {
      const ctrl = new AbortController();
      const t = setTimeout(() => ctrl.abort(), 15_000);
      const r = await fetch(`${API}/client/version`, {
        method: "GET",
        cache: "no-store",
        signal: ctrl.signal,
      });
      clearTimeout(t);
      if (!r.ok) {
        throw new Error(`version_http_${r.status}`);
      }
      payload = (await r.json()) as VersionPayload;
    } catch {
      setScreen("checking");
      setDetail("Verifying required version from KOYN servers…");
      return;
    }

    const required = Number(payload.requiredClientBuild);
    if (!Number.isFinite(required) || required < 0) {
      setScreen("ready");
      setDetail(null);
      return;
    }

    if (required === 0) {
      setScreen("ready");
      setDetail(null);
      return;
    }

    if (clientBuild < required) {
      setScreen("blocked");
      setDetail(`This build (${clientBuild}) is no longer supported. Required: ${required}.`);
      return;
    }

    setScreen("ready");
    setDetail(null);
  }, [clientBuild]);

  useEffect(() => {
    void verify();
    const slow = window.setInterval(() => void verify(), 120_000);
    return () => window.clearInterval(slow);
  }, [verify]);

  useEffect(() => {
    if (screen !== "checking") return;
    const fast = window.setInterval(() => void verify(), 5_000);
    return () => window.clearInterval(fast);
  }, [screen, verify]);

  useEffect(() => {
    if (screen !== "blocked") {
      if (reloadTimer.current) {
        clearInterval(reloadTimer.current);
        reloadTimer.current = null;
      }
      return;
    }
    const soon = window.setTimeout(() => void hardReloadClearingCaches(), 1_200);
    reloadTimer.current = setInterval(() => {
      void hardReloadClearingCaches();
    }, 45_000);
    return () => {
      window.clearTimeout(soon);
      if (reloadTimer.current) clearInterval(reloadTimer.current);
      reloadTimer.current = null;
    };
  }, [screen]);

  if (screen === "ready") return <>{children}</>;

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 2147483647,
        background: "#050810",
        color: "#e2e8f0",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        padding: "1.5rem",
        textAlign: "center",
        fontFamily: "ui-sans-serif, system-ui, sans-serif",
      }}
    >
      <p style={{ margin: 0, fontSize: "0.95rem", opacity: 0.86, maxWidth: 420 }}>
        {screen === "checking"
          ? detail ?? "Checking for mandatory updates…"
          : "A mandatory update is required. Fetching the latest version…"}
      </p>
      {screen === "blocked" && detail && (
        <p style={{ marginTop: "1rem", fontSize: "0.85rem", opacity: 0.7, maxWidth: 460 }}>{detail}</p>
      )}
      <p style={{ marginTop: "1.25rem", fontSize: "0.78rem", opacity: 0.55 }}>
        This check cannot be turned off. If you are stuck on this screen, confirm the API is reachable and the
        latest web bundle is deployed.
      </p>
    </div>
  );
}
