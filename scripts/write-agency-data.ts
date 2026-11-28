#!/usr/bin/env npx tsx
/**
 * Writes public/data/index.json and the catalogs from config/agencies, only where they change (CIV-2975). The git hooks
 * in .githooks run it after a checkout, merge or rebase, so a checkout never sits on a missing or stale index.
 */
import { resolve } from 'node:path';
import { writeAgencyIndexAndCatalogs } from './agencyIndexGeneration.js';

for (const path of writeAgencyIndexAndCatalogs(resolve(import.meta.dirname, '..'))) console.log(`agency data: wrote ${path}`);
