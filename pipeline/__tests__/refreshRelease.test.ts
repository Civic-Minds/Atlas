import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// CIV-43: refresh-release.ts chains refresh, build-pmtiles, verify, build-history and publish.
// The chain must stop before build-pmtiles when the refresh was incomplete, and forward the
// reviewed gate overrides to the publish step.

const execFileSync = vi.hoisted(() => vi.fn());
const readRefreshRunResult = vi.hoisted(() => vi.fn());

vi.mock('node:child_process', async importOriginal => ({ ...(await importOriginal<typeof import('node:child_process')>()), execFileSync }));
vi.mock('../loadEnv.js', () => ({}));
vi.mock('../dataRefreshMarker.js', () => ({ readRefreshRunResult }));

async function runScript(...argv: string[]): Promise<void> {
  process.argv = ['node', 'refresh-release.ts', ...argv];
  vi.resetModules();
  await import('../refresh-release');
}

const scripts = () => execFileSync.mock.calls.map(call => (call as unknown as [string, string[]])[1].slice(0, 2).join(' '));
const complete = (slugs: string[]) => ({
  generatedAt: '2026-10-14T00:00:00Z', requestedSlugs: slugs, statuses: Object.fromEntries(slugs.map(s => [s, 'processed'])), complete: true,
});

let savedSmoke: string | undefined;
beforeEach(() => {
  execFileSync.mockReset();
  readRefreshRunResult.mockReset();
  savedSmoke = process.env.PMTILES_REMOTE_SMOKE_SLUGS;
  vi.spyOn(console, 'log').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
});
afterEach(() => {
  if (savedSmoke === undefined) delete process.env.PMTILES_REMOTE_SMOKE_SLUGS;
  else process.env.PMTILES_REMOTE_SMOKE_SLUGS = savedSmoke;
  vi.restoreAllMocks();
});

describe('refresh-release', () => {
  it('runs refresh, build-pmtiles, verify, build-history, publish in order and sets the smoke slugs', async () => {
    readRefreshRunResult.mockReturnValue(complete(['sct', 'translink']));
    await runScript('translink', 'sct', '--force');

    expect(scripts()).toEqual([
      'run refresh', 'run build-pmtiles', 'run verify-pmtiles-remote', 'run build-history', 'run publish-data-release',
    ]);
    expect((execFileSync.mock.calls[0] as unknown as [string, string[]])[1]).toEqual(['run', 'refresh', '--', 'translink', 'sct', '--force']);
    expect(process.env.PMTILES_REMOTE_SMOKE_SLUGS).toBe('sct,translink');
  });

  it('forwards reviewed gate overrides to refresh and to publish, not to the other steps', async () => {
    readRefreshRunResult.mockReturnValue(complete(['sct']));
    await runScript('sct', '--allow', 'sct:drop');

    const argsOf = (i: number) => (execFileSync.mock.calls[i] as unknown as [string, string[]])[1];
    expect(argsOf(0)).toEqual(['run', 'refresh', '--', 'sct', '--allow', 'sct:drop']);
    expect(argsOf(1)).toEqual(['run', 'build-pmtiles']);
    expect(argsOf(4)).toEqual(['run', 'publish-data-release', '--', '--allow', 'sct:drop']);
  });

  it('stops before build-pmtiles when the refresh left an agency failed', async () => {
    readRefreshRunResult.mockReturnValue({ ...complete(['sct', 'translink']), statuses: { sct: 'processed', translink: 'failed' }, complete: false });
    await expect(runScript('translink', 'sct')).rejects.toThrow(/stopped before PMTiles.*translink: failed/);
    expect(scripts()).toEqual(['run refresh']);
  });

  it('stops when no refresh result was written', async () => {
    readRefreshRunResult.mockReturnValue(null);
    await expect(runScript('sct')).rejects.toThrow(/no refresh result was written/);
    expect(scripts()).toEqual(['run refresh']);
  });

  it('stops when the refresh result covers a different batch than requested', async () => {
    readRefreshRunResult.mockReturnValue(complete(['other']));
    await expect(runScript('sct')).rejects.toThrow(/requested batch was incomplete/);
    expect(scripts()).toEqual(['run refresh']);
  });

  it('does not publish when a later step throws', async () => {
    readRefreshRunResult.mockReturnValue(complete(['sct']));
    execFileSync.mockImplementation((_cmd: string, args: string[]) => {
      if (args[1] === 'verify-pmtiles-remote') throw new Error('verify failed');
    });
    await expect(runScript('sct')).rejects.toThrow('verify failed');
    expect(scripts()).toEqual(['run refresh', 'run build-pmtiles', 'run verify-pmtiles-remote']);
  });

  it('exits with usage when no agency is given, before running anything', async () => {
    vi.spyOn(process, 'exit').mockImplementation(((code?: number) => { throw new Error(`exit ${code}`); }) as never);
    await expect(runScript()).rejects.toThrow('exit 1');
    expect(execFileSync).not.toHaveBeenCalled();
  });

  it('exits on a malformed --allow before running anything', async () => {
    vi.spyOn(process, 'exit').mockImplementation(((code?: number) => { throw new Error(`exit ${code}`); }) as never);
    await expect(runScript('sct', '--allow', 'bogus')).rejects.toThrow('exit 1');
    expect(execFileSync).not.toHaveBeenCalled();
  });
});
