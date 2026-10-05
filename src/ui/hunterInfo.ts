import type { HunterTypeId } from '@/config/hunters';

/** What the player is told about each hunter type: How to Play, and the banner of the level it first appears in. */
export const HUNTER_INFO: Record<
  HunterTypeId,
  { lines: readonly [string, string?]; short: string }
> = {
  stalker: {
    lines: ['Slow. Walks to any sound it hears, then searches the spot.'],
    short: 'it walks to any sound',
  },
  sprinter: {
    lines: ['Faster than you. Reacts only to pings, stones and shockwaves.'],
    short: 'fast, but deaf to footsteps',
  },
  listener: {
    lines: ['Never moves. Screams when it hears you, calling the others.'],
    short: 'it screams when it hears you',
  },
  tracker: {
    lines: [
      'Follows your footsteps in order, sniffing as it goes.',
      'Ignores pings. Sneaking, boots or cover break the trail.',
    ],
    short: 'it follows your footsteps: sneak to lose it',
  },
  echo: {
    lines: [
      'Silent. Moves only while a sound you made still spreads.',
      'A rewind sound when it wakes. Stay quiet and it freezes.',
    ],
    short: 'it moves only while your sounds spread',
  },
  mimic: {
    lines: [
      'Hums like a core, a shade off in color and pitch.',
      'Answers pings with a fake one. Lunges if you come close.',
    ],
    short: 'it hums like a core: listen closely',
  },
};

/** The order How to Play lists them in: the order they are met. */
export const HUNTER_ORDER: readonly HunterTypeId[] = [
  'stalker',
  'listener',
  'sprinter',
  'tracker',
  'echo',
  'mimic',
];
