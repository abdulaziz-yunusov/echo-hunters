import { UPGRADES, type UpgradeId } from '@/config/upgrades';
import { ownedStacks } from '@/sim/upgrades';

/** Seconds as m:ss (e.g. 1:05). */
export function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

/** A run's upgrades in a line: "QUICK PING ×2 · THICK SKIN" ('' for none). */
export function upgradeSummary(owned: readonly UpgradeId[]): string {
  return ownedStacks(owned)
    .map(([id, n]) => (n > 1 ? `${UPGRADES[id].label} ×${n}` : UPGRADES[id].label))
    .join(' · ');
}
