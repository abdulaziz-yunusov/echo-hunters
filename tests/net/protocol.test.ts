import { describe, expect, it } from 'vitest';
import { Interpolator } from '@/net/interpolation';
import { decode, encode, PROTOCOL_VERSION, type NetMessage } from '@/net/protocol';

describe('protocol', () => {
  const samples: NetMessage[] = [
    { t: 'hello', v: PROTOCOL_VERSION, seed: 42 },
    { t: 'p', x: 1.5, y: 2 },
    { t: 'snd', kind: 'ping', x: 3, y: 4, owner: 2, fx: 3, fy: 4 },
    { t: 'take', kind: 'core', id: 1 },
    { t: 'taken', kind: 'pickup', id: 2, by: 1 },
    { t: 'denied', kind: 'core', id: 1 },
    { t: 'extract' },
    { t: 'hit', hits: 1, fromX: 0, fromY: 0 },
    { t: 'drop', by: 2, cores: [{ id: 9, x: 1, y: 1, collected: false }] },
    {
      t: 'snap',
      hunters: [{ id: 100, x: 1, y: 2, state: 'idle' }],
      cores: [{ id: 1, x: 1, y: 1, collected: true }],
      held: [[1, 1]],
      hits: [[2, 0]],
      beacon: false,
      winner: null,
    },
    { t: 'end', winner: 1 },
    { t: 'bye' },
  ];

  it('every message survives encode → decode unchanged', () => {
    for (const m of samples) expect(decode(encode(m))).toEqual(m);
  });

  it('rejects anything malformed', () => {
    for (const bad of [
      'not json',
      '{"t":"nope"}',
      '{"t":"p","x":"1","y":2}',
      '{"t":"p","x":1}',
      '{"t":"snd","kind":"laser","x":1,"y":1,"owner":1,"fx":1,"fy":1}',
      '{"t":"take","kind":"core","id":1.5}',
      '{"t":"hello","v":1,"seed":null}',
      '{"t":"p","x":1e999,"y":0}',
      'null',
      '42',
    ]) {
      expect(decode(bad), bad).toBeNull();
    }
  });
});

describe('Interpolator', () => {
  it('glides between updates and holds at the newest', () => {
    const i = new Interpolator();
    expect(i.sample(0)).toBeNull();
    i.push(0, 0, 0);
    i.push(1, 10, 20);
    expect(i.sample(0.5)).toEqual({ x: 5, y: 10 });
    expect(i.sample(-1)).toEqual({ x: 0, y: 0 });
    expect(i.sample(5)).toEqual({ x: 10, y: 20 });
  });
});
