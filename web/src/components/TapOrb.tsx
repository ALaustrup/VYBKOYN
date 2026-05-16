"use client";

import { useCallback, useState } from "react";

type Props = {
  disabled?: boolean;
  onTap: () => void | Promise<void>;
  flash: string | null;
  score: string;
  tpc: string;
};

export function TapOrb({ disabled, onTap, flash, score, tpc }: Props) {
  const [pulse, setPulse] = useState(false);
  const [ripples, setRipples] = useState<{ id: number; x: number; y: number }[]>([]);

  const handleTap = useCallback(
    async (e: React.MouseEvent<HTMLButtonElement>) => {
      if (disabled) return;
      const rect = e.currentTarget.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;
      const id = Date.now();
      setRipples((r) => [...r, { id, x, y }]);
      setTimeout(() => setRipples((r) => r.filter((i) => i.id !== id)), 600);
      setPulse(true);
      setTimeout(() => setPulse(false), 180);
      await onTap();
    },
    [disabled, onTap]
  );

  return (
    <section className="tap-zone">
      <div className="stats-row">
        <span className="stat">
          <small>Balance</small>
          <strong>{score}</strong>
        </span>
        <span className="stat">
          <small>Power</small>
          <strong>{tpc}</strong>
        </span>
      </div>

      <button
        type="button"
        className={`tap-orb ${pulse ? "tap-orb--pulse" : ""}`}
        disabled={disabled}
        aria-label="Tap to mine"
        onClick={(e) => void handleTap(e)}
      >
        {ripples.map((r) => (
          <span
            key={r.id}
            className="ripple"
            style={{ left: r.x, top: r.y }}
          />
        ))}
        <span className="tap-orb__label">TAP</span>
      </button>

      {flash && (
        <p className={`tap-flash ${flash.startsWith("CRITICAL") ? "tap-flash--crit" : ""}`}>{flash}</p>
      )}
    </section>
  );
}
