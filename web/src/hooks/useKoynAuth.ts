"use client";

import { useCallback, useState } from "react";
import { SiweMessage } from "siwe";
import { getAddress, type Address, type Hex } from "viem";
import { base } from "viem/chains";
import { getWalletClient } from "@wagmi/core";
import { useAccount, useConnect, useDisconnect, useSwitchChain } from "wagmi";
import type { Connector } from "wagmi";
import { wagmiConfig } from "@/lib/wagmi";
import {
  clearEmbeddedWallet,
  loadEmbeddedAccount,
  saveEmbeddedMnemonic,
  type EmbeddedAccount,
  type EmbeddedWalletCreated,
} from "@/lib/embeddedWallet";
import { TARGET_CHAIN_ID } from "@/lib/wagmi";
import { sessionPrimaryTypes } from "@/lib/eip712SessionTypes";

const API = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

type SessionTypedData = {
  domain: Record<string, unknown>;
  types: typeof sessionPrimaryTypes;
  primaryType: "Session";
  message: Record<string, unknown>;
};

type Signers = {
  address: Address;
  signMessage: (msg: string) => Promise<Hex>;
  signTypedData: (data: SessionTypedData) => Promise<Hex>;
};

type SignableAccount = {
  address: Address;
  signMessage: (args: { message: string }) => Promise<Hex>;
  signTypedData: (args: {
    domain: {
      name: string;
      version: string;
      chainId: number;
      verifyingContract: `0x${string}`;
    };
    types: typeof sessionPrimaryTypes;
    primaryType: "Session";
    message: {
      wallet: Address;
      nonce: Hex;
      issuedAt: bigint;
      expiresAt: bigint;
      purpose: string;
    };
  }) => Promise<Hex>;
};

function buildSignersFromAccount(account: SignableAccount): Signers {
  const addr = getAddress(account.address);
  return {
    address: addr,
    signMessage: (msg) => account.signMessage({ message: msg }),
    signTypedData: (data) =>
      account.signTypedData({
        domain: data.domain as {
          name: string;
          version: string;
          chainId: number;
          verifyingContract: `0x${string}`;
        },
        types: data.types,
        primaryType: "Session",
        message: data.message as {
          wallet: Address;
          nonce: Hex;
          issuedAt: bigint;
          expiresAt: bigint;
          purpose: string;
        },
      }),
  };
}

async function runSiweSession(
  signers: Signers,
  onStep?: (step: string) => void
): Promise<{ token: string; walletAddress: string }> {
  onStep?.("Preparing sign-in…");

  const message = new SiweMessage({
    domain: window.location.host,
    address: signers.address,
    statement: "Sign in to VYBKOYN and bind your wallet to your game progress.",
    uri: window.location.origin,
    version: "1",
    chainId: TARGET_CHAIN_ID,
    nonce: Math.random().toString(36).slice(2),
  });

  const prepared = message.prepareMessage();
  onStep?.("Confirm wallet signature…");
  const signature = await signers.signMessage(prepared);

  onStep?.("Verifying with server…");
  let login: Response;
  try {
    login = await fetch(`${API}/auth/siwe`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message: prepared, signature }),
    });
  } catch {
    throw new Error(
      `Cannot reach API at ${API}. Use http://localhost:3000 and ensure the server is running.`
    );
  }

  if (!login.ok) {
    const err = (await login.json().catch(() => ({}))) as { error?: string };
    throw new Error(err.error ?? `Sign-in failed (${login.status})`);
  }

  const json = (await login.json()) as {
    preToken: string;
    walletAddress: string;
    sessionTypedData: SessionTypedData;
  };

  const msg = json.sessionTypedData.message;
  onStep?.("Confirm session proof…");
  const sessionSig = await signers.signTypedData({
    domain: json.sessionTypedData.domain,
    types: json.sessionTypedData.types,
    primaryType: "Session",
    message: {
      wallet: getAddress(String(msg.wallet)) as Address,
      nonce: msg.nonce as Hex,
      issuedAt: BigInt(String(msg.issuedAt)),
      expiresAt: BigInt(String(msg.expiresAt)),
      purpose: String(msg.purpose),
    },
  });

  onStep?.("Finishing…");
  const proof = await fetch(`${API}/auth/session-proof`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${json.preToken}`,
    },
    body: JSON.stringify({ signature: sessionSig }),
  });

  if (!proof.ok) {
    const err = (await proof.json().catch(() => ({}))) as { error?: string };
    const code = err.error ?? `Session failed (${proof.status})`;
    if (proof.status === 409 && code === "session_nonce_reused") {
      throw new Error("Session already used — click Continue again.");
    }
    throw new Error(code);
  }

  return (await proof.json()) as { token: string; walletAddress: string };
}

export function useKoynAuth() {
  const { address, isConnected, connector } = useAccount();
  const { connectAsync, connectors, isPending: isConnecting } = useConnect();
  const { disconnectAsync } = useDisconnect();
  const { switchChainAsync } = useSwitchChain();
  const [token, setToken] = useState<string | null>(null);
  const [wallet, setWallet] = useState<string | null>(null);
  const [authMode, setAuthMode] = useState<"external" | "embedded" | null>(null);
  const [loading, setLoading] = useState(false);
  const [signingStep, setSigningStep] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const signersFromWalletClient = useCallback(async (): Promise<Signers> => {
    try {
      await switchChainAsync({ chainId: TARGET_CHAIN_ID });
    } catch {
      /* already on chain */
    }
    const walletClient = await getWalletClient(wagmiConfig, { chainId: TARGET_CHAIN_ID });
    if (!walletClient) throw new Error("Wallet not ready — open your wallet app and try again");
    return buildSignersFromAccount(walletClient.account as SignableAccount);
  }, [switchChainAsync]);

  const completeSession = useCallback(async (signers: Signers, mode: "external" | "embedded") => {
    setLoading(true);
    setError(null);
    setSigningStep("Starting…");
    try {
      const result = await runSiweSession(signers, setSigningStep);
      setToken(result.token);
      setWallet(result.walletAddress);
      setAuthMode(mode);
      sessionStorage.setItem("vybkoyn_token", result.token);
      setSigningStep(null);
      return result;
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Could not sign in";
      setError(msg);
      setSigningStep(null);
      throw e;
    } finally {
      setLoading(false);
    }
  }, []);

  const connectExternal = useCallback(
    async (connector: Connector) => {
      setError(null);
      try {
        await connectAsync({ connector, chainId: TARGET_CHAIN_ID });
        const signers = await signersFromWalletClient();
        await completeSession(signers, "external");
      } catch (e) {
        const msg = e instanceof Error ? e.message : "Could not connect wallet";
        if (msg.toLowerCase().includes("reject") || msg.toLowerCase().includes("denied")) {
          setError("Connection cancelled in wallet");
        } else {
          setError(msg);
        }
        throw e;
      }
    },
    [connectAsync, signersFromWalletClient, completeSession]
  );

  const activateEmbedded = useCallback(
    async (created: EmbeddedWalletCreated) => {
      try {
        saveEmbeddedMnemonic(created.mnemonic);
      } catch {
        throw new Error("Could not save wallet in this browser (storage blocked?)");
      }
      const signers = buildSignersFromAccount(created.account);
      await completeSession(signers, "embedded");
    },
    [completeSession]
  );

  const restoreEmbeddedSession = useCallback(async () => {
    const account = loadEmbeddedAccount();
    if (!account) return false;
    await completeSession(buildSignersFromAccount(account), "embedded");
    return true;
  }, [completeSession]);

  const logout = useCallback(async () => {
    setToken(null);
    setWallet(null);
    setAuthMode(null);
    setError(null);
    setSigningStep(null);
    sessionStorage.removeItem("vybkoyn_token");
    if (isConnected) await disconnectAsync();
    clearEmbeddedWallet();
  }, [disconnectAsync, isConnected]);

  const restoreToken = useCallback(() => {
    const t = sessionStorage.getItem("vybkoyn_token");
    if (t) setToken(t);
  }, []);

  return {
    token,
    wallet: wallet ?? address ?? null,
    authMode,
    loading: loading || isConnecting,
    signingStep,
    error,
    setError,
    connectors,
    isConnected,
    connector,
    connectExternal,
    activateEmbedded,
    restoreEmbeddedSession,
    logout,
    restoreToken,
    chain: base,
  };
}
