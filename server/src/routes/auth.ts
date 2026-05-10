import crypto from "node:crypto";
import type { Response } from "express";
import { Router } from "express";
import jwt from "jsonwebtoken";
import { SiweMessage } from "siwe";
import { Prisma } from "@prisma/client";
import { verifyTypedData, type Hex } from "viem";
import { z } from "zod";
import { buildSessionProofEnvelope, sessionPrimaryTypes, SESSION_PURPOSE } from "../lib/eip712Session.js";
import { prisma } from "../lib/prisma.js";
import type { AuthedRequest } from "../middleware/auth.js";
import { requirePreSession } from "../middleware/auth.js";

const siweBody = z.object({
  message: z.string(),
  signature: z.string(),
});

const proofBody = z.object({
  signature: z.string().regex(/^0x[0-9a-fA-F]+$/),
});

export const authRouter = Router();

authRouter.post("/siwe", async (req, res) => {
  const parsed = siweBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "invalid_body" });
    return;
  }
  const secret = process.env.JWT_SECRET;
  const chainId = Number(process.env.CHAIN_ID ?? "8453");
  if (!secret) {
    res.status(500).json({ error: "server_misconfigured" });
    return;
  }

  try {
    const siwe = new SiweMessage(parsed.data.message);
    const result = await siwe.verify({ signature: parsed.data.signature });
    if (!result.success) {
      res.status(401).json({ error: "siwe_failed" });
      return;
    }
    if (siwe.chainId !== chainId) {
      res.status(400).json({ error: "wrong_chain" });
      return;
    }

    const walletAddress = siwe.address.toLowerCase();
    const user = await prisma.user.upsert({
      where: { walletAddress },
      create: {
        walletAddress,
        state: {
          create: {},
        },
      },
      update: {},
      include: { state: true },
    });

    const nowSec = Math.floor(Date.now() / 1000);
    const spExpiresAt = nowSec + 15 * 60;
    const spNonce = (`0x${crypto.randomBytes(32).toString("hex")}`) as `0x${string}`;

    const preToken = jwt.sign(
      {
        sub: user.id,
        wallet: user.walletAddress,
        typ: "koyn_pre",
        spNonce,
        spIssuedAt: nowSec,
        spExpiresAt,
      },
      secret,
      { expiresIn: "15m" }
    );

    const envelope = buildSessionProofEnvelope({
      wallet: user.walletAddress as Hex,
      nonce: spNonce,
      issuedAtSeconds: BigInt(nowSec),
      expiresAtSeconds: BigInt(spExpiresAt),
      chainId,
    });

    res.json({
      phase: "eip712_required",
      preToken,
      userId: user.id,
      walletAddress: user.walletAddress,
      sessionTypedData: {
        domain: envelope.domain,
        types: envelope.types,
        primaryType: envelope.primaryType,
        message: envelope.message,
      },
      purposeInfo: SESSION_PURPOSE,
    });
  } catch (e) {
    console.error(e);
    res.status(401).json({ error: "verify_error" });
  }
});

authRouter.post(
  "/session-proof",
  (req, res, next) => requirePreSession(req as AuthedRequest, res, next),
  async (req: AuthedRequest, res: Response) => {
    const secret = process.env.JWT_SECRET;
    const chainId = Number(process.env.CHAIN_ID ?? "8453");

    const parsed = proofBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "invalid_body" });
      return;
    }
    if (!secret) {
      res.status(500).json({ error: "server_misconfigured" });
      return;
    }

    const pre = req.preSession;
    if (!pre) {
      res.status(400).json({ error: "missing_pre_session" });
      return;
    }

    const nowSec = Math.floor(Date.now() / 1000);
    if (nowSec >= pre.spExpiresAt) {
      res.status(401).json({ error: "session_proof_window_expired" });
      return;
    }

    const envelope = buildSessionProofEnvelope({
      wallet: pre.wallet as Hex,
      nonce: pre.spNonce,
      issuedAtSeconds: BigInt(pre.spIssuedAt),
      expiresAtSeconds: BigInt(pre.spExpiresAt),
      chainId,
    });

    const ok = verifyTypedData({
      address: envelope.messageForVerify.wallet,
      domain: envelope.domain,
      types: sessionPrimaryTypes,
      primaryType: "Session",
      message: envelope.messageForVerify,
      signature: parsed.data.signature as Hex,
    });

    if (!ok) {
      res.status(401).json({ error: "invalid_session_proof" });
      return;
    }

    const nonceKey = pre.spNonce.toLowerCase();
    try {
      await prisma.sessionNonceUse.create({
        data: { nonce: nonceKey, userId: pre.sub },
      });
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
        res.status(409).json({ error: "session_nonce_reused" });
        return;
      }
      throw e;
    }

    const token = jwt.sign(
      {
        sub: pre.sub,
        wallet: pre.wallet.toLowerCase(),
        typ: "koyn",
      },
      secret,
      { expiresIn: "7d" }
    );

    res.json({
      phase: "ready",
      token,
      walletAddress: pre.wallet.toLowerCase(),
    });
  }
);
