/**
 * Holds back route-tile downloads while the user is mid-zoom. A scroll or pinch zoom passes through
 * several zoom levels, and each one asks for tiles nobody ends up looking at (zooming out over a
 * region pulled about 11 MB of detail tiles that were already replaced by the time they arrived).
 * Held requests continue when the zoom ends, when they are aborted, or after MAX_HOLD_MS.
 */
export const MAX_HOLD_MS = 3000;

export class TileFetchGate {
  private held = false;
  private waiters = new Set<() => void>();
  private timer: ReturnType<typeof setTimeout> | null = null;

  hold(): void {
    this.held = true;
    if (this.timer) clearTimeout(this.timer);
    this.timer = setTimeout(() => this.release(), MAX_HOLD_MS);
  }

  release(): void {
    this.held = false;
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    const waiting = [...this.waiters];
    this.waiters.clear();
    for (const resume of waiting) resume();
  }

  /** Resolves right away when not held; otherwise when released. Rejects if `signal` aborts first. */
  wait(signal?: AbortSignal): Promise<void> {
    if (!this.held) return Promise.resolve();
    if (signal?.aborted) return Promise.reject(signal.reason ?? new DOMException('Aborted', 'AbortError'));
    return new Promise<void>((resolve, reject) => {
      const resume = () => { signal?.removeEventListener('abort', onAbort); resolve(); };
      const onAbort = () => { this.waiters.delete(resume); reject(signal?.reason ?? new DOMException('Aborted', 'AbortError')); };
      this.waiters.add(resume);
      signal?.addEventListener('abort', onAbort, { once: true });
    });
  }
}
