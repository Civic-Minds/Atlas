/**
 * vitest globalSetup (CIV-2975): public/data/index.json and the catalogs aren't committed, and many tests import them.
 * Write them from config/agencies before any test file loads, so a fresh clone or worktree runs without a prior
 * `npm install` (only changed files are rewritten).
 */
import { resolve } from 'node:path';
import { writeAgencyIndexAndCatalogs } from '../../scripts/agencyIndexGeneration';

export default function setup(): void {
  writeAgencyIndexAndCatalogs(resolve(import.meta.dirname, '../..'));
}
