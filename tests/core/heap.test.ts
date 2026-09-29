import { describe, expect, it } from 'vitest';
import { MinHeap } from '@/core/heap';
import { Rng } from '@/core/rng';

describe('MinHeap', () => {
  it('pops items in priority order', () => {
    const heap = new MinHeap<string>();
    heap.push('c', 3);
    heap.push('a', 1);
    heap.push('d', 4);
    heap.push('b', 2);
    expect([heap.pop(), heap.pop(), heap.pop(), heap.pop(), heap.pop()]).toEqual([
      'a',
      'b',
      'c',
      'd',
      undefined,
    ]);
  });

  it('stays correct with many random items', () => {
    const rng = new Rng(3);
    const heap = new MinHeap<number>();
    const values = Array.from({ length: 500 }, () => rng.int(0, 1000));
    for (const v of values) heap.push(v, v);
    const out: number[] = [];
    while (heap.size > 0) out.push(heap.pop()!);
    expect(out).toEqual([...values].sort((a, b) => a - b));
  });
});
