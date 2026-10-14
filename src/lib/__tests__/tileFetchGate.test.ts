import { afterEach, describe, expect, it, vi } from 'vitest';
import { MAX_HOLD_MS, TileFetchGate } from '../tileFetchGate';

afterEach(() => { vi.useRealTimers(); });

describe('TileFetchGate', () => {
  it('lets requests through when nothing is held', async () => {
    await expect(new TileFetchGate().wait()).resolves.toBeUndefined();
  });

  it('holds requests until release', async () => {
    const gate = new TileFetchGate();
    gate.hold();
    let done = false;
    const waiting = gate.wait().then(() => { done = true; });
    await Promise.resolve();
    expect(done).toBe(false);
    gate.release();
    await waiting;
    expect(done).toBe(true);
  });

  it('lets go on its own after the maximum hold', async () => {
    vi.useFakeTimers();
    const gate = new TileFetchGate();
    gate.hold();
    let done = false;
    void gate.wait().then(() => { done = true; });
    await vi.advanceTimersByTimeAsync(MAX_HOLD_MS - 1);
    expect(done).toBe(false);
    await vi.advanceTimersByTimeAsync(2);
    expect(done).toBe(true);
  });

  it('rejects a held request that is aborted before release', async () => {
    const gate = new TileFetchGate();
    gate.hold();
    const controller = new AbortController();
    const waiting = gate.wait(controller.signal);
    controller.abort();
    await expect(waiting).rejects.toBeDefined();
    gate.release();
  });
});
