import { Router } from "express";
import { z } from "zod";
import { computeTap, passiveAccrual, validateTapTiming } from "../lib/clickEngine.js";
import type { AuthedRequest } from "../middleware/auth.js";
import { prisma } from "../lib/prisma.js";

export const gameRouter = Router();

const tapBody = z.object({
  clientTapSeq: z.number().int().positive(),
  clientTs: z.number().int(),
});

const WINDOW_MS = 60_000;

function rolLingTapCount(args: {
  windowStart: Date | null;
  tapsInWindow: number;
  now: number;
}): { windowStart: Date; tapsInWindow: number; countForLimit: number } {
  const { windowStart, tapsInWindow, now } = args;
  if (!windowStart || now - windowStart.getTime() > WINDOW_MS) {
    return { windowStart: new Date(now), tapsInWindow: 1, countForLimit: 1 };
  }
  return {
    windowStart,
    tapsInWindow: tapsInWindow + 1,
    countForLimit: tapsInWindow + 1,
  };
}

gameRouter.post("/tap", async (req: AuthedRequest, res) => {
  if (!req.userId) {
    res.status(401).json({ error: "unauthorized" });
    return;
  }
  const parsed = tapBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "invalid_body" });
    return;
  }

  const serverTs = Date.now();

  try {
    const outcome = await prisma.$transaction(async (tx) => {
      const state = await tx.gameState.findUnique({
        where: { userId: req.userId! },
      });
      if (!state) {
        return { kind: "error" as const, status: 404, error: "missing_state" };
      }

      if (parsed.data.clientTapSeq !== state.tapSeq + 1) {
        return { kind: "reject" as const, reason: "seq_mismatch" };
      }

      const rolled = rolLingTapCount({
        windowStart: state.tapWindowStartedAt,
        tapsInWindow: state.tapsInWindow,
        now: serverTs,
      });

      const timing = validateTapTiming({
        lastTapAt: state.lastTapAt,
        clientTs: parsed.data.clientTs,
        serverTs,
        recentTapCountOneMinute: rolled.countForLimit,
      });
      if (!timing.ok) {
        return { kind: "reject" as const, reason: timing.reason };
      }

      const passive = passiveAccrual(state.passivePerSecond, state.updatedAt);
      const boostActive =
        !!state.boostExpiresAt && state.boostExpiresAt.getTime() > serverTs;

      const computed = computeTap({
        baseTpc: state.baseTpc,
        boostMultiplier: state.boostMultiplier,
        boostActive,
      });

      const newTotal = state.totalScore.add(passive).add(computed.delta);

      const updated = await tx.gameState.update({
        where: { userId: req.userId! },
        data: {
          tapSeq: state.tapSeq + 1,
          lastTapAt: new Date(serverTs),
          totalScore: newTotal,
          tapWindowStartedAt: rolled.windowStart,
          tapsInWindow: rolled.tapsInWindow,
        },
      });

      return {
        kind: "ok" as const,
        delta: computed.delta.toString(),
        isCritical: computed.isCritical,
        tapSeq: updated.tapSeq,
        totalScore: updated.totalScore.toString(),
        passiveApplied: passive.toString(),
      };
    });

    if (outcome.kind === "error") {
      res.status(outcome.status).json({ error: outcome.error });
      return;
    }
    if (outcome.kind === "reject") {
      res.status(429).json({ error: outcome.reason });
      return;
    }
    res.json(outcome);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "tap_failed" });
  }
});

gameRouter.get("/state", async (req: AuthedRequest, res) => {
  if (!req.userId) {
    res.status(401).json({ error: "unauthorized" });
    return;
  }
  const state = await prisma.gameState.findUnique({ where: { userId: req.userId } });
  if (!state) {
    res.status(404).json({ error: "not_found" });
    return;
  }
  const serverTs = Date.now();
  const boostActive = !!state.boostExpiresAt && state.boostExpiresAt.getTime() > serverTs;
  const passive = passiveAccrual(state.passivePerSecond, state.updatedAt);
  res.json({
    totalScore: state.totalScore.toString(),
    baseTpc: state.baseTpc.toString(),
    passivePerSecond: state.passivePerSecond.toString(),
    tapSeq: state.tapSeq,
    boostMultiplier: state.boostMultiplier.toString(),
    boostActive,
    boostExpiresAt: state.boostExpiresAt?.toISOString() ?? null,
    pendingPassive: passive.toString(),
    serverTs,
  });
});
