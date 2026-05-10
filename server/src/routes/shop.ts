import { Router } from "express";
import { Decimal } from "@prisma/client/runtime/library";
import { z } from "zod";
import type { AuthedRequest } from "../middleware/auth.js";
import { prisma } from "../lib/prisma.js";

export const shopRouter = Router();

const buyBoost = z.object({
  multiplier: z.number().min(1.1).max(10),
  durationSec: z.number().int().min(30).max(3600),
  costCredits: z.number().int().nonnegative(),
});

const buyPermanent = z.object({
  tpcIncrease: z.number().positive(),
  costCredits: z.number().int().nonnegative(),
});

const buyPassive = z.object({
  perSecondIncrease: z.number().nonnegative(),
  costCredits: z.number().int().nonnegative(),
});

function boostPrice(mult: number, durationSec: number): number {
  return Math.ceil(mult * durationSec * 0.05);
}

function permanentTpcPrice(inc: number): number {
  return Math.ceil(inc * 100);
}

function passivePrice(inc: number): number {
  return Math.ceil(inc * 500);
}

shopRouter.post("/boost", async (req: AuthedRequest, res) => {
  if (!req.userId) {
    res.status(401).json({ error: "unauthorized" });
    return;
  }
  const parsed = buyBoost.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "invalid_body" });
    return;
  }
  const expected = boostPrice(parsed.data.multiplier, parsed.data.durationSec);
  if (parsed.data.costCredits !== expected) {
    res.status(400).json({ error: "price_mismatch" });
    return;
  }

  const cost = new Decimal(parsed.data.costCredits);
  try {
    const state = await prisma.$transaction(async (tx) => {
      const cur = await tx.gameState.findUnique({ where: { userId: req.userId! } });
      if (!cur) throw new Error("missing_state");
      if (cur.totalScore.lt(cost)) throw new Error("insufficient");

      const until = new Date(Date.now() + parsed.data.durationSec * 1000);
      return tx.gameState.update({
        where: { userId: req.userId! },
        data: {
          boostMultiplier: new Decimal(parsed.data.multiplier),
          boostExpiresAt: until,
          totalScore: { decrement: cost },
        },
      });
    });
    res.json({
      boostMultiplier: state.boostMultiplier.toString(),
      boostExpiresAt: state.boostExpiresAt?.toISOString() ?? null,
      totalScore: state.totalScore.toString(),
    });
  } catch {
    res.status(400).json({ error: "insufficient_credits" });
  }
});

shopRouter.post("/tpc", async (req: AuthedRequest, res) => {
  if (!req.userId) {
    res.status(401).json({ error: "unauthorized" });
    return;
  }
  const parsed = buyPermanent.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "invalid_body" });
    return;
  }
  const expected = permanentTpcPrice(parsed.data.tpcIncrease);
  if (parsed.data.costCredits !== expected) {
    res.status(400).json({ error: "price_mismatch" });
    return;
  }
  const cost = new Decimal(parsed.data.costCredits);
  try {
    const state = await prisma.$transaction(async (tx) => {
      const cur = await tx.gameState.findUnique({ where: { userId: req.userId! } });
      if (!cur) throw new Error("missing_state");
      if (cur.totalScore.lt(cost)) throw new Error("insufficient");

      return tx.gameState.update({
        where: { userId: req.userId! },
        data: {
          baseTpc: { increment: new Decimal(parsed.data.tpcIncrease) },
          totalScore: { decrement: cost },
        },
      });
    });
    res.json({ baseTpc: state.baseTpc.toString(), totalScore: state.totalScore.toString() });
  } catch {
    res.status(400).json({ error: "insufficient_credits" });
  }
});

shopRouter.post("/passive", async (req: AuthedRequest, res) => {
  if (!req.userId) {
    res.status(401).json({ error: "unauthorized" });
    return;
  }
  const parsed = buyPassive.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "invalid_body" });
    return;
  }
  const expected = passivePrice(parsed.data.perSecondIncrease);
  if (parsed.data.costCredits !== expected) {
    res.status(400).json({ error: "price_mismatch" });
    return;
  }
  const cost = new Decimal(parsed.data.costCredits);

  try {
    const state = await prisma.$transaction(async (tx) => {
      const cur = await tx.gameState.findUnique({ where: { userId: req.userId! } });
      if (!cur) throw new Error("missing_state");
      if (cur.totalScore.lt(cost)) throw new Error("insufficient");

      return tx.gameState.update({
        where: { userId: req.userId! },
        data: {
          passivePerSecond: { increment: new Decimal(parsed.data.perSecondIncrease) },
          totalScore: { decrement: cost },
        },
      });
    });
    res.json({
      passivePerSecond: state.passivePerSecond.toString(),
      totalScore: state.totalScore.toString(),
    });
  } catch {
    res.status(400).json({ error: "insufficient_credits" });
  }
});
