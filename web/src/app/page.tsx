"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { SiweMessage } from "siwe";
import type { Address } from "viem";
import {
  ensureEvmChain,
  getInjectedProvider,
  signSessionTypedData,
  signSiweMessage,
} from "@/lib/walletSiwe";

type Tab = "game" | "shop" | "wallet" | "leaderboard";

const API = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";
const BASE_CHAIN_ID = Number(process.env.NEXT_PUBLIC_CHAIN_ID ?? "8453");

export default function Home() {
  const [tab, setTab] = useState<Tab>("game");
  const [token, setToken] = useState<string | null>(null);
  const [wallet, setWallet] = useState<string | null>(null);
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
    if (token) h.Authorization = `Bearer ${token}`;
    return h;
  }, [token]);

  const refreshState = useCallback(async () => {
    if (!token) return;
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
  }, [token, authHeaders]);

  useEffect(() => {
    void refreshState();
    const id = setInterval(refreshState, 12_000);
    return () => clearInterval(id);
  }, [refreshState]);

  const connectWallet = async () => {
    const eth = getInjectedProvider();
    if (!eth) {
      alert("Install a wallet extension (MetaMask / Rabby / Coinbase Wallet).");
      return;
    }
    await ensureEvmChain(BASE_CHAIN_ID);
    const accounts = (await eth.request({ method: "eth_requestAccounts", params: [] })) as string[];
    const address = accounts[0] as Address;

    const message = new SiweMessage({
      domain: typeof window !== "undefined" ? window.location.host : "localhost",
      address,
      statement: "Authenticate to KOYN authoritative game session.",
      uri: typeof window !== "undefined" ? window.location.origin : "http://localhost:3000",
      version: "1",
      chainId: BASE_CHAIN_ID,
      nonce: Math.random().toString(36).slice(2),
    });

    const msg = message.prepareMessage();
    const signature = await signSiweMessage({ message: msg, address });

    const login = await fetch(`${API}/auth/siwe`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message: msg, signature }),
    });
    if (!login.ok) {
      alert("Auth failed — check Chain ID matches server.");
      return;
    }
    const json = (await login.json()) as {
      phase: string;
      preToken: string;
      walletAddress: string;
      sessionTypedData: {
        domain: Record<string, unknown>;
        types: Record<string, readonly { name: string; type: string }[]>;
        primaryType: string;
        message: Record<string, unknown>;
      };
    };

    const sig712 = await signSessionTypedData({
      address,
      sessionTypedData: json.sessionTypedData,
    });

    const proof = await fetch(`${API}/auth/session-proof`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${json.preToken}`,
      },
      body: JSON.stringify({ signature: sig712 }),
    });
    if (!proof.ok) {
      const errBody = await proof.json().catch(() => ({}));
      const code = (errBody as { error?: string }).error;
      if (proof.status === 409 && code === "session_nonce_reused") {
        alert("Session proof already used. Connect again from the start.");
        return;
      }
      alert(typeof code === "string" ? code : "Session proof failed — sign EIP-712 in your wallet.");
      return;
    }
    const done = (await proof.json()) as { token: string; walletAddress: string };
    setToken(done.token);
    setWallet(done.walletAddress ?? json.walletAddress);
    await refreshState();
  };

  const onTap = async () => {
    if (!token) {
      alert("Connect wallet first.");
      return;
    }
    const payload = {
      clientTapSeq: tapSeq + 1,
      clientTs: Date.now(),
    };
    const r = await fetch(`${API}/game/tap`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...authHeaders },
      body: JSON.stringify(payload),
    });
    const body = await r.json();
    if (!r.ok) {
      setFlash(`Rejected: ${body.error ?? r.status}`);
      setTimeout(() => setFlash(null), 1800);
      await refreshState();
      return;
    }
    const j = body as {
      tapSeq: number;
      delta: string;
      isCritical: boolean;
      totalScore: string;
    };
    setTapSeq(j.tapSeq);
    setFlash(j.isCritical ? `CRITICAL +${j.delta}` : `+${j.delta}`);
    setGameState((g) =>
      g
        ? { ...g, totalScore: j.totalScore, tapSeq: j.tapSeq }
        : { totalScore: j.totalScore, baseTpc: "1", tapSeq: j.tapSeq, passivePerSecond: "0", boostActive: false }
    );
    setTimeout(() => setFlash(null), 700);
  };

  const buyBoost = async () => {
    if (!token) return;
    const mult = 2;
    const durationSec = 120;
    const costCredits = Math.ceil(mult * durationSec * 0.05);
    const r = await fetch(`${API}/shop/boost`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...authHeaders },
      body: JSON.stringify({ multiplier: mult, durationSec, costCredits }),
    });
    if (!r.ok) {
      alert((await r.json()).error ?? "shop error");
      return;
    }
    await refreshState();
  };

  const upgradeTpc = async () => {
    if (!token) return;
    const inc = 0.25;
    const costCredits = Math.ceil(inc * 100);
    const r = await fetch(`${API}/shop/tpc`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...authHeaders },
      body: JSON.stringify({ tpcIncrease: inc, costCredits }),
    });
    if (!r.ok) {
      alert((await r.json()).error ?? "shop error");
      return;
    }
    await refreshState();
  };

  return (
    <main style={{ maxWidth: 480, margin: "0 auto", padding: "1rem" }}>
      <header style={{ textAlign: "center", marginBottom: "1rem" }}>
        <h1 style={{ fontSize: "1.5rem", margin: "0 0 0.5rem", letterSpacing: "0.04em" }}>VYBKOY • KOYN</h1>
        <p style={{ margin: 0, opacity: 0.76, fontSize: "0.9rem" }}>Authoritative taps · Base-class ERC‑20 rewards path</p>
      </header>

      <nav
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(4, 1fr)",
          gap: 6,
          marginBottom: 12,
        }}
      >
        {(
          [
            ["game", "Tap"],
            ["shop", "Shop"],
            ["wallet", "Wallet"],
            ["leaderboard", "Top 20"],
          ] as const
        ).map(([id, label]) => (
          <button
            key={id}
            type="button"
            onClick={() => setTab(id)}
            style={{
              padding: "0.55rem",
              borderRadius: 10,
              border: tab === id ? "1px solid var(--accent)" : "1px solid #2a395a",
              background: tab === id ? "#143241" : "var(--panel)",
              color: "var(--text)",
              cursor: "pointer",
              fontWeight: tab === id ? 700 : 500,
              fontSize: "0.82rem",
            }}
          >
            {label}
          </button>
        ))}
      </nav>

      {!token && (
        <section style={{ background: "var(--panel)", borderRadius: 12, padding: "1rem", marginBottom: 12 }}>
          <p style={{ marginTop: 0 }}>Non-custodial session (SIWE). Connect your wallet — keys stay in your signer.</p>
          <button
            type="button"
            onClick={() => void connectWallet()}
            style={{
              width: "100%",
              padding: "0.75rem",
              borderRadius: 10,
              border: "none",
              background: "linear-gradient(90deg,#2dd4bf,#0891b2)",
              fontWeight: 700,
              cursor: "pointer",
            }}
          >
            Connect & Sign In
          </button>
        </section>
      )}

      {token && wallet && (
        <p style={{ fontSize: "0.8rem", opacity: 0.8, wordBreak: "break-all", marginBottom: 12 }}>
          Session: <strong>{wallet}</strong>
        </p>
      )}

      {tab === "game" && (
        <section style={{ textAlign: "center" }}>
          <div style={{ marginBottom: 12, fontVariantNumeric: "tabular-nums", fontSize: "1.05rem" }}>
            Score{" "}
            <strong>{gameState?.totalScore ?? "—"}</strong>
            {" · "}TPC <strong>{gameState?.baseTpc ?? "—"}</strong>
            {" · "}Seq <strong>{tapSeq}</strong>
          </div>
          <button
            type="button"
            aria-label="Tap"
            onClick={() => void onTap()}
            style={{
              width: 210,
              height: 210,
              margin: "0 auto",
              borderRadius: "50%",
              border: "4px solid #2dd4bf",
              boxShadow: "0 18px 50px rgba(45,212,191,0.25)",
              background: "radial-gradient(circle at 30% 30%, #2dd4bf, #083344)",
              color: "#021014",
              fontSize: "1.5rem",
              fontWeight: 800,
              cursor: "pointer",
            }}
          >
            TAP
          </button>
          {flash && (
            <p style={{ marginTop: "1rem", color: flash.startsWith("CRITICAL") ? "#fbbf24" : "var(--accent)" }}>
              {flash}
            </p>
          )}
        </section>
      )}

      {tab === "shop" && (
        <section style={{ background: "var(--panel)", borderRadius: 12, padding: "1rem", display: "grid", gap: 10 }}>
          <div>
            <h3 style={{ margin: "0 0 0.5rem", fontSize: "1rem" }}>Timed boost ×2 · 120s</h3>
            <button type="button" onClick={() => void buyBoost()} style={btnSecondary}>
              Purchase (priced off-chain KOYN credits)
            </button>
          </div>
          <div>
            <h3 style={{ margin: "0 0 0.5rem", fontSize: "1rem" }}>Permanent +0.25 TPC</h3>
            <button type="button" onClick={() => void upgradeTpc()} style={btnSecondary}>
              Purchase
            </button>
          </div>
          <p style={{ margin: 0, fontSize: "0.8rem", opacity: 0.75 }}>
            Server recomputes price; client sends expected costCredits to resist tampering — production should use catalogue + inventory service.
          </p>
        </section>
      )}

      {tab === "wallet" && <WalletTab wallet={wallet} api={API} />}

      {tab === "leaderboard" && <Leaderboard api={API} />}
    </main>
  );
}

const btnSecondary: React.CSSProperties = {
  width: "100%",
  padding: "0.7rem",
  borderRadius: 10,
  border: "1px solid #344869",
  background: "#172033",
  color: "var(--text)",
  cursor: "pointer",
};

function WalletTab(props: { wallet: string | null; api: string }) {
  /** Local demo key — WARN: insecure pattern; embed only for sandbox. Prefer external signer. */
  const [localPk, setLocalPk] = useState<string>("");
  useEffect(() => {
    try {
      const existing = sessionStorage.getItem("koyn_demo_sk");
      if (existing) setLocalPk(existing);
    } catch {
      /* noop */
    }
  }, []);

  const generateEmbedded = async () => {
    const mod = await import("viem/accounts");
    const acc = mod.generatePrivateKey();
    sessionStorage.setItem("koyn_demo_sk", acc);
    setLocalPk(acc);
  };

  const clearEmbedded = () => {
    sessionStorage.removeItem("koyn_demo_sk");
    setLocalPk("");
  };

  return (
    <section style={{ background: "var(--panel)", borderRadius: 12, padding: "1rem" }}>
      <h3 style={{ marginTop: 0 }}>Linked wallet</h3>
      <code style={{ display: "block", wordBreak: "break-all", marginBottom: 12 }}>{props.wallet ?? "—"}</code>
      <p style={{ opacity: 0.8 }}>
        KOYN ERC‑20 balances read via your indexer / RPC. Add <code>VITE_CONTRACT</code> / env and use <code>viem readContract balanceOf</code>.
      </p>
      <hr style={{ borderColor: "#2a395a", margin: "1rem 0" }} />
      <h4 style={{ margin: "0 0 0.5rem" }}>Sandbox embedded key (not production)</h4>
      {!localPk && (
        <button type="button" onClick={() => void generateEmbedded()} style={btnSecondary}>
          Generate local key into sessionStorage
        </button>
      )}
      {localPk && (
        <>
          <p style={{ fontSize: "0.8rem", opacity: 0.75 }}>
            Stored in sessionStorage only — phishing or XSS can steal this. Prefer browser extension signer.
          </p>
          <code style={{ display: "block", wordBreak: "break-all", fontSize: "0.72rem", marginBottom: 8 }}>
            {localPk}
          </code>
          <button type="button" onClick={clearEmbedded} style={btnSecondary}>
            Clear
          </button>
        </>
      )}
      <ClaimInfoSection api={props.api} />
      <SendStub />
    </section>
  );
}

type ClaimInfo = {
  chainId: number;
  merkleDistributor: string | null;
  koynToken: string | null;
  alpha: boolean;
};

function ClaimInfoSection(props: { api: string }) {
  const [info, setInfo] = useState<ClaimInfo | null>(null);

  useEffect(() => {
    const load = async () => {
      const r = await fetch(`${props.api}/claim/info`);
      if (!r.ok) return;
      const j = (await r.json()) as ClaimInfo;
      setInfo(j);
    };
    void load();
    const id = setInterval(load, 60_000);
    return () => clearInterval(id);
  }, [props.api]);

  return (
    <div style={{ marginTop: 16 }}>
      <h4 style={{ margin: "0 0 0.5rem" }}>On-chain claim (Alpha)</h4>
      {!info && <p style={{ fontSize: "0.82rem", opacity: 0.7 }}>Loading claim metadata…</p>}
      {info && (
        <dl style={{ margin: 0, fontSize: "0.82rem", opacity: 0.88 }}>
          <dt style={{ opacity: 0.65 }}>Alpha public</dt>
          <dd style={{ margin: "0 0 0.5rem 0" }}>{info.alpha ? "yes" : "no"}</dd>
          <dt style={{ opacity: 0.65 }}>Chain ID</dt>
          <dd style={{ margin: "0 0 0.5rem 0" }}>{info.chainId}</dd>
          <dt style={{ opacity: 0.65 }}>KOYN token</dt>
          <dd style={{ margin: "0 0 0.5rem 0", wordBreak: "break-all" }}>{info.koynToken ?? "—"}</dd>
          <dt style={{ opacity: 0.65 }}>Merkle distributor</dt>
          <dd style={{ margin: 0, wordBreak: "break-all" }}>{info.merkleDistributor ?? "—"}</dd>
        </dl>
      )}
    </div>
  );
}

function SendStub() {
  return (
    <div style={{ marginTop: 16 }}>
      <h4 style={{ margin: "0 0 0.5rem" }}>Receive / Send</h4>
      <p style={{ fontSize: "0.82rem", opacity: 0.78, margin: 0 }}>
        Wire <code>eth_sendTransaction</code> or paymaster UserOp for ERC‑20 <code>transfer</code> / <code>permit</code> + transferFrom. Do not implement “paste private key to send” in production.
      </p>
    </div>
  );
}

function Leaderboard(props: { api: string }) {
  const [rows, setRows] = useState<{ rank: number; wallet: string; score: string }[]>([]);
  const [ts, setTs] = useState<string>("");

  useEffect(() => {
    const load = async () => {
      const r = await fetch(`${props.api}/leaderboard/top`);
      if (!r.ok) return;
      const j = (await r.json()) as {
        leaderboard: { rank: number; wallet: string; score: string }[];
        updatedAt: string;
      };
      setRows(j.leaderboard);
      setTs(j.updatedAt);
    };
    void load();
    const id = setInterval(load, 5000);
    return () => clearInterval(id);
  }, [props.api]);

  return (
    <section style={{ background: "var(--panel)", borderRadius: 12, padding: "1rem" }}>
      <h3 style={{ marginTop: 0 }}>Top 20</h3>
      <p style={{ fontSize: "0.8rem", opacity: 0.7, marginTop: 0 }}>Updated {ts || "…"}</p>
      <ol style={{ paddingLeft: "1.1rem", margin: 0 }}>
        {rows.map((r) => (
          <li key={r.rank} style={{ marginBottom: 6, fontVariantNumeric: "tabular-nums" }}>
            <strong>#{r.rank}</strong> {r.wallet} — {r.score}
          </li>
        ))}
      </ol>
    </section>
  );
}
