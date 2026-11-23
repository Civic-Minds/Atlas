/**
 * Atlas Studio's buses-needed and schedule-change files in the cloud (CIV-1974): the prefix in the private Live bucket the
 * cloud rebuild uploads them under and the dev server reads them from (local-api/studioFiles.ts), and the file names
 * that belong there.
 */
export const STUDIO_FILES_PREFIX = 'studio/files/';

/** `<slug>-vehicles.json` or `<slug>-before-after.json`, a lower-case slug. */
export const isStudioFileName = (name: string): boolean => /^[a-z0-9]+(?:-[a-z0-9]+)*-(?:vehicles|before-after)\.json$/.test(name);
