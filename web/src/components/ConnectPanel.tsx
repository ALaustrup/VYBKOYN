"use client";

import { useState } from "react";
import { mnemonicToAccount } from "viem/accounts";
import type { Connector } from "wagmi";
import { createEmbeddedWallet, saveEmbeddedMnemonic } from "@/lib/embeddedWallet";
import { playConnectSound } from "@/lib/sounds";
import type { useKoynAuth } from "@/hooks/useKoynAuth";

type Auth = ReturnType<typeof useKoynAuth>;

export function ConnectPanel({ auth }: { auth: Auth }) {
  const [showCreate, setShowCreate] = useState(false);
  const [pendingMnemonic, setPendingMnemonic] = useState<string | null>(null);
  const [savedConfirm, setSavedConfirm] = useState(false);
  const [importMnemonic, setImportMnemonic] = useState("");
  const wcMissing = !process.env.NEXT_PUBLIC_WC_PROJECT_ID;

  const onPickWallet = async (connector: Connector) => {
    try {
      await auth.connectExternal(connector);
      playConnectSound();
    } catch {
      /* auth.error */
    }
  };

  const startCreate = () => {
    setPendingMnemonic(createEmbeddedWallet().mnemonic);
    setSavedConfirm(false);
    setShowCreate(true);
  };

  const confirmCreate = async () => {
    if (!pendingMnemonic || !savedConfirm) return;
    const account = mnemonicToAccount(pendingMnemonic);
    try {
      await auth.activateEmbedded({
        mnemonic: pendingMnemonic,
        address: account.address,
        account,
      });
      playConnectSound();
      setShowCreate(false);
      setPendingMnemonic(null);
    } catch {
      /* auth.error */
    }
  };

  const onImport = async () => {
    const words = importMnemonic.trim().toLowerCase();
    if (words.split(/\s+/).length < 12) {
      auth.setError("Enter a valid 12+ word recovery phrase");
      return;
    }
    try {
      const account = mnemonicToAccount(words);
      saveEmbeddedMnemonic(words);
      await auth.activateEmbedded({ mnemonic: words, address: account.address, account });
      playConnectSound();
    } catch {
      auth.setError("Could not restore wallet from phrase");
    }
  };

  if (showCreate && pendingMnemonic) {
    return (
      <div className="panel connect-panel">
        <h3>Save your recovery phrase</h3>
        <p className="muted">Write these words down. VYBKOYN cannot recover them for you.</p>
        <div className="mnemonic-box">{pendingMnemonic}</div>
        <label className="check-row">
          <input type="checkbox" checked={savedConfirm} onChange={(e) => setSavedConfirm(e.target.checked)} />
          I saved my recovery phrase securely
        </label>
        <button type="button" className="btn primary" disabled={!savedConfirm || auth.loading} onClick={() => void confirmCreate()}>
          {auth.loading ? "Signing in…" : "Continue"}
        </button>
        <button type="button" className="btn ghost" onClick={() => setShowCreate(false)}>
          Back
        </button>
      </div>
    );
  }

  return (
    <div className="panel connect-panel">
      <h3>Connect to play</h3>
      <p className="muted">
        Link a wallet to save taps and rank on the leaderboard. Your keys stay in your wallet — we only verify
        ownership to secure the game.
      </p>

      {auth.error && <p className="error-banner">{auth.error}</p>}
      {wcMissing && (
        <p className="hint-banner">
          For mobile &amp; QR wallets, add NEXT_PUBLIC_WC_PROJECT_ID (free at cloud.reown.com). Browser extensions work
          now.
        </p>
      )}

      <div className="wallet-grid">
        {auth.connectors.map((c: Connector) => (
          <button
            key={c.uid}
            type="button"
            className="wallet-chip"
            disabled={auth.loading}
            onClick={() => void onPickWallet(c)}
          >
            {c.name}
          </button>
        ))}
      </div>

      <p className="or-divider">or</p>

      <button type="button" className="btn secondary" disabled={auth.loading} onClick={startCreate}>
        Create new wallet (recovery phrase)
      </button>

      <details className="import-details">
        <summary>Import recovery phrase</summary>
        <textarea
          value={importMnemonic}
          onChange={(e) => setImportMnemonic(e.target.value)}
          placeholder="twelve or twenty-four words…"
          rows={3}
        />
        <button type="button" className="btn secondary" disabled={auth.loading} onClick={() => void onImport()}>
          Restore wallet
        </button>
      </details>
    </div>
  );
}
