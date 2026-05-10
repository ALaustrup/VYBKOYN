import type { NextFunction, Request, Response } from "express";
import jwt from "jsonwebtoken";

export type PreSessionJwt = {
  sub: string;
  wallet: string;
  typ: "koyn_pre";
  spNonce: `0x${string}`;
  spIssuedAt: number;
  spExpiresAt: number;
};

export type AuthedRequest = Request & {
  userId?: string;
  walletAddress?: string;
  preSession?: PreSessionJwt;
};

type VerifiedClaims = Record<string, unknown> & {
  sub: string;
  wallet: string;
  typ?: string;
};

function verifyBearer(secret: string, token: string): VerifiedClaims {
  return jwt.verify(token, secret) as VerifiedClaims;
}

/** Requires a finalized session JWT (`typ === koyn`) after EIP-712 session proof. */
export function requireAuth(req: AuthedRequest, res: Response, next: NextFunction) {
  const secret = process.env.JWT_SECRET;
  if (!secret) {
    res.status(500).json({ error: "server_misconfigured" });
    return;
  }
  const header = req.headers.authorization;
  const raw = header?.startsWith("Bearer ") ? header.slice(7) : undefined;
  if (!raw) {
    res.status(401).json({ error: "unauthorized" });
    return;
  }
  try {
    const payload = verifyBearer(secret, raw);
    if (!payload?.sub || typeof payload.wallet !== "string") {
      res.status(401).json({ error: "invalid_token" });
      return;
    }
    if (payload.typ === "koyn_pre") {
      res.status(403).json({ error: "session_proof_required" });
      return;
    }
    if (payload.typ !== "koyn") {
      res.status(403).json({ error: "invalid_session" });
      return;
    }
    req.userId = payload.sub;
    req.walletAddress = payload.wallet.toLowerCase();
    next();
  } catch {
    res.status(401).json({ error: "invalid_token" });
  }
}

/** Validates the SIWE handshake token that must sign the EIP-712 Session payload once. */
export function requirePreSession(req: AuthedRequest, res: Response, next: NextFunction) {
  const secret = process.env.JWT_SECRET;
  if (!secret) {
    res.status(500).json({ error: "server_misconfigured" });
    return;
  }
  const header = req.headers.authorization;
  const raw = header?.startsWith("Bearer ") ? header.slice(7) : undefined;
  if (!raw) {
    res.status(401).json({ error: "unauthorized" });
    return;
  }
  try {
    const payload = verifyBearer(secret, raw);
    if (payload.typ !== "koyn_pre" || typeof payload.spNonce !== "string") {
      res.status(400).json({ error: "invalid_pre_token" });
      return;
    }
    req.preSession = payload as unknown as PreSessionJwt;
    next();
  } catch {
    res.status(401).json({ error: "invalid_token" });
  }
}
