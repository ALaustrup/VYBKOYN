import { Decimal } from "@prisma/client/runtime/library";

const MIN_INTERVAL_MS = 72;
/** Reject bursts above this sustained rate even if timestamps look spaced (seq + timing heuristic). */
const MAX_TAPS_PER_MINUTE = 420;

export type TapComputation = {
  delta: Decimal;
  isCritical: boolean;
  multiplierApplied: Decimal;
};

function nowMs(): number {
  return Date.now();
}

export function passiveAccrual(passivePerSecond: Decimal, lastUpdate: Date | null): Decimal {
  if (!lastUpdate || passivePerSecond.lte(0)) return new Decimal(0);
  const elapsed = (nowMs() - lastUpdate.getTime()) / 1000;
  if (elapsed <= 0) return new Decimal(0);
  return passivePerSecond.mul(elapsed);
}

/**
 * Server-authoritative tap: score is derived only from DB state + this function.
 * Critical hits use server RNG (not client).
 */
export function computeTap(args: {
  baseTpc: Decimal;
  boostMultiplier: Decimal;
  boostActive: boolean;
  /** 3% crit at 10x */
  critChance?: number;
  critMultiplier?: number;
}): TapComputation {
  const critChance = args.critChance ?? 0.03;
  const critMult = args.critMultiplier ?? 10;
  const mult = args.boostActive ? args.boostMultiplier : new Decimal(1);
  const isCritical = Math.random() < critChance;
  const critFactor = isCritical ? new Decimal(critMult) : new Decimal(1);
  const delta = args.baseTpc.mul(mult).mul(critFactor);
  return { delta, isCritical, multiplierApplied: mult.mul(critFactor) };
}

export function validateTapTiming(args: {
  lastTapAt: Date | null;
  clientTs: number;
  serverTs: number;
  recentTapCountOneMinute: number;
}): { ok: true } | { ok: false; reason: string } {
  const { lastTapAt, clientTs, serverTs, recentTapCountOneMinute } = args;
  if (Number.isNaN(clientTs)) return { ok: false, reason: "invalid_client_ts" };
  const skew = Math.abs(clientTs - serverTs);
  if (skew > 60_000) return { ok: false, reason: "clock_skew" };
  if (lastTapAt) {
    const elapsed = serverTs - lastTapAt.getTime();
    if (elapsed < MIN_INTERVAL_MS) return { ok: false, reason: "too_fast" };
  }
  if (recentTapCountOneMinute >= MAX_TAPS_PER_MINUTE) return { ok: false, reason: "rate_cap" };
  return { ok: true };
}
