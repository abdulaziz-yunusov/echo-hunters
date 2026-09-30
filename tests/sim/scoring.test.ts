import { describe, expect, it } from 'vitest';
import { GAME } from '@/config/game';
import { scoreRound, type RoundResult } from '@/sim/scoring';

const S = GAME.scoring;
const base: RoundResult = {
  coresCollected: 3,
  extracted: true,
  seconds: 60,
  pingsUsed: 4,
  huntersStunned: 0,
  closeCalls: 0,
  areaScale: 1,
};

describe('scoreRound', () => {
  it('adds cores, extraction and time bonus', () => {
    const s = scoreRound(base);
    expect(s.cores).toBe(3 * S.core);
    expect(s.extraction).toBe(S.extraction);
    expect(s.timeBonus).toBe((S.parTime - 60) * S.timeBonusPerSecond);
    expect(s.ghostBonus).toBe(0);
    expect(s.total).toBe(s.cores + s.extraction + s.timeBonus);
  });

  it('never gives a negative time bonus for slow rounds', () => {
    expect(scoreRound({ ...base, seconds: S.parTime + 500 }).timeBonus).toBe(0);
  });

  it('gives more par time on bigger maps', () => {
    const small = scoreRound({ ...base, seconds: 100 });
    const big = scoreRound({ ...base, seconds: 100, areaScale: 1.5 });
    expect(small.timeBonus).toBe(0);
    expect(big.timeBonus).toBe((S.parTime * 1.5 - 100) * S.timeBonusPerSecond);
  });

  it('ghost bonus: extracted without a single ping', () => {
    expect(scoreRound({ ...base, pingsUsed: 0 }).ghostBonus).toBe(S.ghostBonus);
    expect(scoreRound({ ...base, pingsUsed: 1 }).ghostBonus).toBe(0);
  });

  it('a failed round keeps core and stun points but no bonuses', () => {
    const s = scoreRound({ ...base, extracted: false, pingsUsed: 0, huntersStunned: 2 });
    expect(s).toEqual({
      cores: 3 * S.core,
      extraction: 0,
      timeBonus: 0,
      ghostBonus: 0,
      stuns: 2 * S.hunterStunned,
      closeCalls: 0,
      total: 3 * S.core + 2 * S.hunterStunned,
    });
  });

  it('rounds the time bonus to whole points', () => {
    expect(Number.isInteger(scoreRound({ ...base, seconds: 61.37 }).timeBonus)).toBe(true);
  });
});

describe('close calls in the score', () => {
  it('add their points, extracted or not, up to the cap', () => {
    expect(scoreRound({ ...base, closeCalls: 2 }).closeCalls).toBe(2 * S.closeCall);
    expect(scoreRound({ ...base, extracted: false, closeCalls: 1 }).closeCalls).toBe(S.closeCall);
    const many = scoreRound({ ...base, closeCalls: S.closeCallMax + 3 });
    expect(many.closeCalls).toBe(S.closeCallMax * S.closeCall);
    expect(many.total).toBe(
      many.cores +
        many.extraction +
        many.timeBonus +
        many.ghostBonus +
        many.stuns +
        many.closeCalls,
    );
  });
});
