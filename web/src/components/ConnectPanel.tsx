"use client";

import { useState } from "react";
import { mnemonicToAccount } from "viem/accounts";
import type { Connector } from "wagmi";
import { createEmbeddedWallet } from "@/lib/embeddedWallet";
import { playConnectSound } from "@/lib/sounds";
import type { useKoynAuth } from "@/hooks/useKoynAuth";

type Auth = ReturnType<typeof useKoynAuth>;

function ErrorBanner({ auth }: { auth: Auth }) {
  if (!auth.error) return null;
  return <p className="error-banner">{auth.error}</p>;
}

function SigningStatus({ auth }: { auth: Auth }) {
  if (!auth.loading || !auth.signingStep) return null;
  return <p className="hint-banner">{auth.signingStep}</p>;
}

export function ConnectPanel({ auth }: { auth: Auth }) {
  const [showCreate, setShowCreate] = useState(false);
  const [pendingMnemonic, setPendingMnemonic] = useState<string | null>(null);
  const [savedConfirm, setSavedConfirm] = useState(false);
  const [importMnemonic, setImportMnemonic] = useState("");
  const wcMissing = !process.env.NEXT_PUBLIC_WC_PROJECT_ID;

  const onPickWallet = async (connector: Connector) => {
    auth.setError(null);
    try {
      await auth.connectExternal(connector);
      playConnectSound();
    } catch {
      /* error on auth */
    }
  };

  const startCreate = () => {
    auth.setError(null);
    setPendingMnemonic(createEmbeddedWallet().mnemonic);
    setSavedConfirm(false);
    setShowCreate(true);
  };

  const confirmCreate = async () => {
    if (!pendingMnemonic || !savedConfirm) return;
    auth.setError(null);
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
      /* auth.error + signingStep cleared in hook */
    }
  };

  const onImport = async () => {
    const words = importMnemonic.trim().toLowerCase();
    if (words.split(/\s+/).length < 12) {
      auth.setError("Enter a valid 12+ word recovery phrase");
      return;
    }
    auth.setError(null);
    try {
      const account = mnemonicToAccount(words);
      await auth.activateEmbedded({ mnemonic: words, address: account.address, account });
      playConnectSound();
    } catch {
      if (!auth.error) auth.setError("Could not restore wallet from phrase");
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
        <ErrorBanner auth={auth} />
        <SigningStatus auth={auth} />
        <button
          type="button"
          className="btn primary"
          disabled={!savedConfirm || auth.loading}
          onClick={() => void confirmCreate()}
        >
          {auth.loading ? "Signing in…" : "Continue"}
        </button>
        <button type="button" className="btn ghost" disabled={auth.loading} onClick={() => setShowCreate(false)}>
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

      <ErrorBanner auth={auth} />
      <SigningStatus auth={auth} />
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

