import { homedir } from 'os';
import { join } from 'path';

// Local GTFS archive root (layout: Files/, Scripts/, Reports/, Runtime/).
// Override with GTFS_ARCHIVE_DIR.
export const GTFS_ARCHIVE_DIR = process.env.GTFS_ARCHIVE_DIR ?? join(homedir(), 'Developer', 'Data', 'GTFS');
export const GTFS_FILES_DIR = join(GTFS_ARCHIVE_DIR, 'Files');
