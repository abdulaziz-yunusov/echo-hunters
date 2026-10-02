/** Round replays: what is recorded during play and how the replay screen plays it back. */
export const REPLAY = {
  /** Positions sampled per second (the sim runs at 60; replays interpolate between samples). */
  sampleHz: 30,
  /** Recording stops after this long, so an idle round can't grow without limit (s). */
  maxSeconds: 30 * 60,
  /** Playback speeds, slowest first. */
  speeds: [0.25, 0.5, 1, 2, 4],
  defaultSpeed: 1,
  /** Left / right jumps this far (s). */
  seekStep: 5,
  /** Hunters show where they walked in the last few seconds (s). */
  hunterTrail: 4,
  /** A jump between two samples longer than this is a teleport (debug warp), not a path (px). */
  teleportDistance: 64,
  /** The player's most recent path is drawn brighter (s). */
  playerTrail: 3,
  /** Duel recordings sent to the client (message `rec`): largest packed size (characters). */
  maxPackedChars: 8_000_000,
  /** …and largest size once unpacked (bytes), so a malformed message can't eat the memory. */
  maxUnpackedBytes: 48_000_000,
} as const;
