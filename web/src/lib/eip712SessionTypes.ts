/** Mirrors server Session EIP-712 types for client signing. */
export const SESSION_PURPOSE = "koyn_session_v1" as const;

export const sessionPrimaryTypes = {
  Session: [
    { name: "wallet", type: "address" },
    { name: "nonce", type: "bytes32" },
    { name: "issuedAt", type: "uint256" },
    { name: "expiresAt", type: "uint256" },
    { name: "purpose", type: "string" },
  ],
} as const;
