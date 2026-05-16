"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { ConnectPanel } from "@/components/ConnectPanel";
import { TapOrb } from "@/components/TapOrb";
import { useKoynAuth } from "@/hooks/useKoynAuth";
import { loadEmbeddedAccount } from "@/lib/embeddedWallet";
import { playTapSound } from "@/lib/sounds";

const API = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

type Tab = "game" | "shop" | "wallet" | "leaderboard";

export function VyKoynApp() {
  const auth = useKoynAuth();
  const [tab, setTab] = useState<Tab>("game");
  const [tapSeq, setTapSeq] = useState(0);
  const [flash, setFlash] = useState<string | null>(null);
  const [gameState, setGameState] = useState<{
    totalScore: string;
    baseTpc: string;
    tapSeq: number;
    passivePerSecond: string;
    boostActive: boolean;
  } | null>(null);

  const authHeaders = useMemo((): Record<string, string> => {
    const h: Record<string, string> = {};
    if (auth.token) h.Authorization = `Bearer ${auth.token}`;
    return h;
  }, [auth.token]);

  useEffect(() => {
    auth.restoreToken();
    void (async () => {
      const stored = sessionStorage.getItem("vybkoyn_token");
      if (stored) return;
      if (loadEmbeddedAccount()) {
        try {
          await auth.restoreEmbeddedSession();
        } catch {
          /* show connect */
        }
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- mount bootstrap only
  }, []);

  const refreshState = useCallback(async () => {
    if (!auth.token) return;
    const r = await fetch(`${API}/game/state`, { headers: { ...authHeaders } });
    if (!r.ok) return;
    const j = (await r.json()) as typeof gameState & { tapSeq: number };
    setTapSeq(j.tapSeq);
    setGameState({
      totalScore: j.totalScore,
      baseTpc: j.baseTpc,
      tapSeq: j.tapSeq,
      passivePerSecond: j.passivePerSecond,
      boostActive: j.boostActive,
    });
  }, [auth.token, authHeaders]);

  useEffect(() => {
    void refreshState();
    const id = setInterval(refreshState, 12_000);
    return () => clearInterval(id);
  }, [refreshState]);

  const onTap = async () => {
    if (!auth.token) return;
    const r = await fetch(`${API}/game/tap`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...authHeaders },
      body: JSON.stringify({ clientTapSeq: tapSeq + 1, clientTs: Date.now() }),
    });
    const body = await r.json();
    if (!r.ok) {
      setFlash(`Blocked: ${body.error ?? r.status}`);
      setTimeout(() => setFlash(null), 1600);
      await refreshState();
      return;
    }
    const j = body as { tapSeq: number; delta: string; isCritical: boolean; totalScore: string };
    setTapSeq(j.tapSeq);
    playTapSound(j.isCritical);
    setFlash(j.isCritical ? `CRITICAL +${j.delta}` : `+${j.delta}`);
    setGameState((g) =>
      g ? { ...g, totalScore: j.totalScore, tapSeq: j.tapSeq } : null
    );
    setTimeout(() => setFlash(null), 700);
  };

  const buyBoost = async () => {
    if (!auth.token) return;
    const mult = 2;
    const durationSec = 120;
    const costCredits = Math.ceil(mult * durationSec * 0.05);
    const r = await fetch(`${API}/shop/boost`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...authHeaders },
      body: JSON.stringify({ multiplier: mult, durationSec, costCredits }),
    });
    if (!r.ok) alert((await r.json()).error ?? "Purchase failed");
    else await refreshState();
  };

  const upgradeTpc = async () => {
    if (!auth.token) return;
    const inc = 0.25;
    const costCredits = Math.ceil(inc * 100);
    const r = await fetch(`${API}/shop/tpc`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...authHeaders },
      body: JSON.stringify({ tpcIncrease: inc, costCredits }),
    });
    if (!r.ok) alert((await r.json()).error ?? "Purchase failed");
    else await refreshState();
  };

  return (
    <main className="app-shell">
      <div className="bg-shift" aria-hidden />
      <header className="app-header">
        <h1 className="brand">VYBKOYN</h1>
        {auth.token && auth.wallet && (
          <button type="button" className="btn-ghost-sm" onClick={() => void auth.logout()}>
            Sign out
          </button>
        )}
      </header>

      <nav className="tab-bar">
        {(
          [
            ["game", "Mine"],
            ["shop", "Boost"],
            ["wallet", "Wallet"],
            ["leaderboard", "Rank"],
          ] as const
        ).map(([id, label]) => (
          <button
            key={id}
            type="button"
            className={`tab ${tab === id ? "tab--active" : ""}`}
            onClick={() => setTab(id)}
          >
            {label}
          </button>
        ))}
      </nav>

      {!auth.token && <ConnectPanel auth={auth} />}

      {auth.token && tab === "game" && (
        <TapOrb
          disabled={auth.loading}
          onTap={onTap}
          flash={flash}
          score={gameState?.totalScore ?? "0"}
          tpc={gameState?.baseTpc ?? "1"}
        />
      )}

      {auth.token && tab === "shop" && (
        <section className="panel">
          <h3>Timed boost ×2</h3>
          <p className="muted">120 seconds of doubled tap power</p>
          <button type="button" className="btn secondary" onClick={() => void buyBoost()}>
            Buy boost
          </button>
          <h3>Permanent power +0.25</h3>
          <button type="button" className="btn secondary" onClick={() => void upgradeTpc()}>
            Upgrade
          </button>
        </section>
      )}

      {auth.token && tab === "wallet" && (
        <section className="panel">
          <h3>Your wallet</h3>
          <code className="addr">{auth.wallet}</code>
          <p className="muted">
            On-chain token claims use your linked address. Recovery phrase wallets are stored only on this device.
          </p>
          <ClaimInfo />
        </section>
      )}

      {auth.token && tab === "leaderboard" && <Leaderboard />}
    </main>
  );
}

function ClaimInfo() {
  const [info, setInfo] = useState<{
    chainId: number;
    merkleDistributor: string | null;
    koynToken: string | null;
    alpha: boolean;
  } | null>(null);

  useEffect(() => {
    void fetch(`${API}/claim/info`)
      .then((r) => r.json())
      .then(setInfo);
  }, []);

  if (!info) return <p className="muted">Loading chain info…</p>;
  return (
    <dl className="meta-dl">
      <dt>Chain</dt>
      <dd>{info.chainId}</dd>
      <dt>Token</dt>
      <dd className="addr-sm">{info.koynToken ?? "—"}</dd>
      <dt>Claims</dt>
      <dd className="addr-sm">{info.merkleDistributor ?? "—"}</dd>
    </dl>
  );
}

function Leaderboard() {
  const [rows, setRows] = useState<{ rank: number; wallet: string; score: string }[]>([]);

  useEffect(() => {
    const load = () =>
      void fetch(`${API}/leaderboard/top`)
        .then((r) => r.json())
        .then((j: { leaderboard: typeof rows }) => setRows(j.leaderboard));
    load();
    const id = setInterval(load, 5000);
    return () => clearInterval(id);
  }, []);

  return (
    <section className="panel">
      <h3>Top miners</h3>
      <ol className="rank-list">
        {rows.map((r) => (
          <li key={r.rank}>
            <span className="rank">#{r.rank}</span>
            <span className="who">{r.wallet}</span>
            <span className="pts">{r.score}</span>
          </li>
        ))}
      </ol>
    </section>
  );
}
