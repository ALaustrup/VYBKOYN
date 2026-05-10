import { Router } from "express";
import { prisma } from "../lib/prisma.js";

export const leaderboardRouter = Router();

leaderboardRouter.get("/top", async (_req, res) => {
  const rows = await prisma.gameState.findMany({
    orderBy: { totalScore: "desc" },
    take: 20,
    include: {
      user: { select: { walletAddress: true } },
    },
  });
  res.json({
    leaderboard: rows.map((r, i) => ({
      rank: i + 1,
      wallet: `${r.user.walletAddress.slice(0, 6)}…${r.user.walletAddress.slice(-4)}`,
      score: r.totalScore.toString(),
    })),
    updatedAt: new Date().toISOString(),
  });
});
