import { describe, expect, it } from 'vitest';
import { cloudStudioFiles } from '../studioFiles';
import { STUDIO_FILES_PREFIX } from '../../shared/studioFiles';

describe('the cloud source of Studio files (CIV-1974)', () => {
  it('lists only Studio file names under its prefix and reads each once per few minutes', async () => {
    const asked: string[] = [];
    let t = 0;
    const src = cloudStudioFiles(
      async prefix => [`${prefix}ttc-vehicles.json`, `${prefix}ttc-before-after.json`, `${prefix}../x.json`, `${prefix}notes.txt`],
      async key => { asked.push(key); return `{"k":"${key}"}`; },
      () => t,
    );
    expect(await src.list()).toEqual(['ttc-vehicles.json', 'ttc-before-after.json']);
    expect(await src.read('ttc-vehicles.json')).toBe(`{"k":"${STUDIO_FILES_PREFIX}ttc-vehicles.json"}`);
    await src.read('ttc-vehicles.json');
    expect(asked).toHaveLength(1);
    expect(await src.read('../x.json')).toBeNull();
    t += 10 * 60_000;
    await src.read('ttc-vehicles.json');
    expect(asked).toHaveLength(2);
  });

  it('answers with nothing when the bucket cannot be listed', async () => {
    const src = cloudStudioFiles(async () => { throw new Error('denied'); }, async () => 'x');
    expect(await src.list()).toEqual([]);
    expect(await src.read('ttc-vehicles.json')).toBeNull();
  });
});
