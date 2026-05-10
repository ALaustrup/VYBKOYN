import { Router } from "express";

/**
 * Authoritative client compatibility. Bump REQUIRED_CLIENT_BUILD when shipping a web release
 * that must replace cached clients; the gate has no user-facing opt-out.
 */
export const clientVersionRouter = Router();

clientVersionRouter.get("/version", (_req, res) => {
  const raw = process.env.REQUIRED_CLIENT_BUILD ?? "1";
  const required = Number.parseInt(raw, 10);
  const min = Number.isFinite(required) && required >= 0 ? required : 1;

  res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate, proxy-revalidate");
  res.json({
    requiredClientBuild: min,
    policy: "mandatory",
    serverTime: new Date().toISOString(),
  });
});
