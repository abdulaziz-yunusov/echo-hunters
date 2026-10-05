import { UPGRADE_IDS, UPGRADE_OFFER_SIZE, UPGRADES, type UpgradeId } from '@/config/upgrades';
import { deriveSeed, Rng } from '@/core/rng';

/** How many times `id` has been taken. */
export function stacksOf(owned: readonly UpgradeId[], id: UpgradeId): number {
  return owned.filter((o) => o === id).length;
}

/** Each upgrade taken, with its stack count, in the order first picked. */
export function ownedStacks(owned: readonly UpgradeId[]): [UpgradeId, number][] {
  return [...new Set(owned)].map((id) => [id, stacksOf(owned, id)]);
}

/**
 * The cards offered before `level` (Phase 20): up to UPGRADE_OFFER_SIZE
 * different upgrades not yet at their cap. They come from the run seed and
 * the level on their own stream, so the same run (`?seed=`) with the same
 * picks is offered the same cards. None left: an empty offer (skip the pick).
 */
export function offerUpgrades(
  runSeed: number,
  level: number,
  owned: readonly UpgradeId[],
): UpgradeId[] {
  const open = UPGRADE_IDS.filter((id) => stacksOf(owned, id) < UPGRADES[id].maxStacks);
  const rng = new Rng(deriveSeed(runSeed, `upgrades-${level}`));
  return rng.shuffle([...open]).slice(0, UPGRADE_OFFER_SIZE);
}
