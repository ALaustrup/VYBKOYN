import type { Hex } from "viem";
import { getAddress } from "viem";

export const SESSION_PURPOSE = "koyn_session_v1";

export const sessionPrimaryTypes = {
  Session: [
    { name: "wallet", type: "address" },
    { name: "nonce", type: "bytes32" },
    { name: "issuedAt", type: "uint256" },
    { name: "expiresAt", type: "uint256" },
    { name: "purpose", type: "string" },
  ],
} as const;

export type SessionProofMessageInput = {
  wallet: Hex;
  nonce: Hex;
  issuedAtSeconds: bigint;
  expiresAtSeconds: bigint;
  chainId: number;
};

/** Off-chain Session domain — verifyingContract zero means no contract binding. */
export function sessionDomain(chainId: number) {
  return {
    name: "KOYN Session",
    version: "1",
    chainId,
    verifyingContract: "0x0000000000000000000000000000000000000000" as const,
  } as const;
}

/** Hex string for uint256 fields in `eth_signTypedData_v4` JSON (wallet portability). */
export function uint256ToHex(v: bigint): string {
  if (v < 0n) throw new Error("uint256 negative");
  const h = v.toString(16);
  return `0x${h}`;
}

export function buildSessionProofEnvelope(input: SessionProofMessageInput): {
  domain: ReturnType<typeof sessionDomain>;
  types: typeof sessionPrimaryTypes;
  primaryType: "Session";
  message: Record<string, unknown>;
  messageForVerify: {
    wallet: `0x${string}`;
    nonce: `0x${string}`;
    issuedAt: bigint;
    expiresAt: bigint;
    purpose: typeof SESSION_PURPOSE;
  };
} {
  const wallet = getAddress(input.wallet) as Hex;
  const nonce = normalizeBytes32Hex(input.nonce);
  const messageForVerify = {
    wallet,
    nonce,
    issuedAt: input.issuedAtSeconds,
    expiresAt: input.expiresAtSeconds,
    purpose: SESSION_PURPOSE as typeof SESSION_PURPOSE,
  };

  const messageJson = {
    wallet: wallet,
    nonce: nonce,
    issuedAt: uint256ToHex(input.issuedAtSeconds),
    expiresAt: uint256ToHex(input.expiresAtSeconds),
    purpose: SESSION_PURPOSE as typeof SESSION_PURPOSE,
  };

  return {
    domain: sessionDomain(input.chainId),
    types: sessionPrimaryTypes,
    primaryType: "Session",
    message: messageJson,
    messageForVerify,
  };
}

function normalizeBytes32Hex(n: Hex): Hex {
  const s = typeof n === "string" ? n.toLowerCase() : n;
  if (!/^0x[a-fA-F0-9]{64}$/.test(s)) throw new Error("invalid_nonce_hex");
  return s as Hex;
}
