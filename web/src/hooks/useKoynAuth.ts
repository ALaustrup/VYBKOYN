"use client";

import { useCallback, useState } from "react";
import { SiweMessage } from "siwe";
import type { Address, Hex } from "viem";
import { base } from "viem/chains";
import { getWalletClient } from "@wagmi/core";
import { useAccount, useConnect, useDisconnect, useSwitchChain } from "wagmi";
import type { Connector } from "wagmi";
import { wagmiConfig } from "@/lib/wagmi";
import {
  clearEmbeddedWallet,
  loadEmbeddedAccount,
  saveEmbeddedMnemonic,
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

async function runSiweSession(args: {
  address: Address;
  signMessage: (msg: string) => Promise<Hex>;
  signTypedData: (data: SessionTypedData) => Promise<Hex>;
}): Promise<{ token: string; walletAddress: string }> {
  const message = new SiweMessage({
    domain: window.location.host,
    address: args.address,
    statement: "Sign in to VYBKOYN and bind your wallet to your game progress.",
    uri: window.location.origin,
    version: "1",
    chainId: TARGET_CHAIN_ID,
    nonce: Math.random().toString(36).slice(2),
  });

  const prepared = message.prepareMessage();
  const signature = await args.signMessage(prepared);

  const login = await fetch(`${API}/auth/siwe`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ message: prepared, signature }),
  });

  if (!login.ok) {
    const err = (await login.json().catch(() => ({}))) as { error?: string };
    throw new Error(err.error ?? "Sign-in failed");
  }

  const json = (await login.json()) as {
    preToken: string;
    walletAddress: string;
    sessionTypedData: SessionTypedData;
  };

  const msg = json.sessionTypedData.message;
  const sessionSig = await args.signTypedData({
    domain: json.sessionTypedData.domain,
    types: json.sessionTypedData.types,
    primaryType: "Session",
    message: {
      wallet: msg.wallet as Address,
      nonce: msg.nonce as Hex,
      issuedAt: BigInt(String(msg.issuedAt)),
      expiresAt: BigInt(String(msg.expiresAt)),
      purpose: String(msg.purpose),
    },
  });

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
    throw new Error(err.error ?? "Session verification failed");
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
  const [error, setError] = useState<string | null>(null);

  const signersFromWalletClient = useCallback(async () => {
    try {
      await switchChainAsync({ chainId: TARGET_CHAIN_ID });
    } catch {
      /* wallet may already be on Base */
    }
    const walletClient = await getWalletClient(wagmiConfig, { chainId: TARGET_CHAIN_ID });
    if (!walletClient) throw new Error("Wallet not ready — open your wallet app and try again");
    const addr = walletClient.account.address;
    return {
      address: addr,
      signMessage: (msg: string) => walletClient.signMessage({ message: msg }),
      signTypedData: (data: SessionTypedData) =>
        walletClient.signTypedData({
          account: addr,
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
  }, [switchChainAsync]);

  const signersFromEmbedded = useCallback(async () => {
    const account = loadEmbeddedAccount();
    if (!account) throw new Error("No saved wallet on this device");
    return {
      address: account.address,
      signMessage: (msg: string) => account.signMessage({ message: msg }),
      signTypedData: (data: SessionTypedData) =>
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
  }, []);

  const finalizeAuth = useCallback(async (mode: "external" | "embedded") => {
    setLoading(true);
    setError(null);
    try {
      const signers = mode === "embedded" ? await signersFromEmbedded() : await signersFromWalletClient();
      const result = await runSiweSession(signers);
      setToken(result.token);
      setWallet(result.walletAddress);
      setAuthMode(mode);
      if (typeof window !== "undefined") {
        sessionStorage.setItem("vybkoyn_token", result.token);
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Could not sign in";
      setError(msg);
      throw e;
    } finally {
      setLoading(false);
    }
  }, [signersFromEmbedded, signersFromWalletClient]);

  const connectExternal = useCallback(
    async (connector: Connector) => {
      setError(null);
      setLoading(true);
      try {
        await connectAsync({ connector, chainId: TARGET_CHAIN_ID });
        await finalizeAuth("external");
      } catch (e) {
        const msg = e instanceof Error ? e.message : "Could not connect wallet";
        if (msg.toLowerCase().includes("reject") || msg.toLowerCase().includes("denied")) {
          setError("Connection cancelled in wallet");
        } else {
          setError(msg);
        }
      } finally {
        setLoading(false);
      }
    },
    [connectAsync, finalizeAuth]
  );

  const activateEmbedded = useCallback(
    async (created: EmbeddedWalletCreated) => {
      saveEmbeddedMnemonic(created.mnemonic);
      setAuthMode("embedded");
      await finalizeAuth("embedded");
    },
    [finalizeAuth]
  );

  const restoreEmbeddedSession = useCallback(async () => {
    if (!loadEmbeddedAccount()) return false;
    await finalizeAuth("embedded");
    return true;
  }, [finalizeAuth]);

  const logout = useCallback(async () => {
    setToken(null);
    setWallet(null);
    setAuthMode(null);
    setError(null);
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
