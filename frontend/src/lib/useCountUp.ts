import { useEffect, useRef, useState } from 'react';

const easeOutExpo = (t: number) => (t >= 1 ? 1 : 1 - Math.pow(2, -10 * t));

/**
 * Animates a displayed number from its current value to `target` whenever
 * `target` changes (including the very first render, which counts up from
 * 0 — the initial-load "this is live data" reveal for StatCard). Skips
 * straight to `target` under prefers-reduced-motion.
 */
export function useCountUp(target: number, durationMs = 600): number {
  const [display, setDisplay] = useState(0);
  const displayRef = useRef(0);

  useEffect(() => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      displayRef.current = target;
      setDisplay(target);
      return;
    }

    const from = displayRef.current;
    if (from === target) return;

    const start = performance.now();
    let rafId: number;

    function tick(now: number) {
      const t = Math.min(1, (now - start) / durationMs);
      const value = Math.round(from + (target - from) * easeOutExpo(t));
      displayRef.current = value;
      setDisplay(value);
      if (t < 1) rafId = requestAnimationFrame(tick);
    }

    rafId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafId);
  }, [target, durationMs]);

  return display;
}
