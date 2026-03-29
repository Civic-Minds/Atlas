import { Router, Request, Response } from 'express';
import multer from 'multer';
import { importGtfsFeed } from '../import/importer';
import { getStaticPool } from '../storage/static-db';

const router = Router();

// Store uploads in memory (max 200MB — large feeds like NYC MTA)
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 200 * 1024 * 1024 } });

// POST /api/import
// Upload a GTFS ZIP and run the full import + analysis pipeline.
// Form fields:
//   file         — the GTFS ZIP (required)
//   accountSlug  — e.g. "ttc" (required)
//   accountName  — e.g. "Toronto Transit Commission" (required)
//   label        — e.g. "Fall 2024" (optional)
//   countryCode  — e.g. "CA" (optional)
//   region       — e.g. "Ontario" (optional)
router.post('/', upload.single('file'), async (req: Request, res: Response): Promise<void> => {
  if (!req.file) {
    res.status(400).json({ error: 'No file uploaded' });
    return;
  }

  const { accountSlug, accountName, label, countryCode, region } = req.body;

  if (!accountSlug || !accountName) {
    res.status(400).json({ error: 'accountSlug and accountName are required' });
    return;
  }

  try {
    const result = await importGtfsFeed({
      zipBuffer: req.file.buffer,
      filename: req.file.originalname,
      accountSlug,
      accountName,
      label: label || undefined,
      countryCode: countryCode || undefined,
      region: region || undefined,
    });

    res.json({ ok: true, ...result });
  } catch (err: any) {
    res.status(500).json({ error: err.message ?? 'Import failed' });
  }
});

// GET /api/import/agencies
// List all agencies and their current feed version.
router.get('/agencies', async (_req: Request, res: Response): Promise<void> => {
  const result = await getStaticPool().query(
    `SELECT
       aa.slug, aa.display_name, aa.tier,
       ga.agency_slug, ga.country_code, ga.region,
       fv.id as feed_version_id, fv.label, fv.effective_from, fv.effective_to,
       fv.route_count, fv.stop_count, fv.trip_count, fv.uploaded_at
     FROM agency_accounts aa
     JOIN gtfs_agencies ga ON ga.agency_account_id = aa.id
     LEFT JOIN feed_versions fv ON fv.gtfs_agency_id = ga.id AND fv.is_current = TRUE
     ORDER BY aa.display_name`
  );
  res.json(result.rows);
});

// GET /api/import/agencies/:slug/versions
// All feed versions for an agency (newest first).
router.get('/agencies/:slug/versions', async (req: Request, res: Response): Promise<void> => {
  const result = await getStaticPool().query(
    `SELECT
       fv.id, fv.label, fv.feed_info_version, fv.effective_from, fv.effective_to,
       fv.original_filename, fv.file_size_bytes, fv.status, fv.is_current,
       fv.route_count, fv.stop_count, fv.trip_count, fv.uploaded_at
     FROM feed_versions fv
     JOIN gtfs_agencies ga ON ga.id = fv.gtfs_agency_id
     JOIN agency_accounts aa ON aa.id = ga.agency_account_id
     WHERE aa.slug = $1
     ORDER BY fv.uploaded_at DESC`,
    [req.params.slug]
  );
  res.json(result.rows);
});

// GET /api/import/agencies/:slug/routes?dayType=Weekday
// Frequency analysis results for the current feed version.
router.get('/agencies/:slug/routes', async (req: Request, res: Response): Promise<void> => {
  const dayType = (req.query.dayType as string) || 'Weekday';
  const result = await getStaticPool().query(
    `SELECT
       rfr.gtfs_route_id, rfr.route_short_name, rfr.route_long_name,
       rfr.mode_category, rfr.direction_id, rfr.day_type, rfr.tier,
       rfr.avg_headway, rfr.peak_headway, rfr.base_headway,
       rfr.service_span_start, rfr.service_span_end, rfr.trip_count,
       rfr.reliability_score, rfr.verification_status, rfr.warnings
     FROM route_frequency_results rfr
     JOIN analysis_runs ar ON ar.id = rfr.analysis_run_id
     JOIN feed_versions fv ON fv.id = rfr.feed_version_id
     JOIN gtfs_agencies ga ON ga.id = fv.gtfs_agency_id
     JOIN agency_accounts aa ON aa.id = ga.agency_account_id
     WHERE aa.slug = $1
       AND fv.is_current = TRUE
       AND rfr.day_type = $2
     ORDER BY rfr.route_short_name, rfr.direction_id`,
    [req.params.slug, dayType]
  );
  res.json(result.rows);
});

export default router;
