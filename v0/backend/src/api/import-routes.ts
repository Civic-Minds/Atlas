import { Router, Request, Response } from 'express';
import multer from 'multer';
import { importGtfsFeed } from '../import/importer';
import { getStaticPool } from '../storage/static-db';
import { requireAuth, requireTenant } from './middleware/auth';

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
router.post('/', requireAuth, upload.single('file'), async (req: Request, res: Response): Promise<void> => {
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
// List agencies and their current feed version.
// Tenant users only see their own agency. Admins (no tenant) see all.
router.get('/agencies', requireAuth, requireTenant, async (req: Request, res: Response): Promise<void> => {
  const tenant = (req as any).tenant as { agencyId: string | null } | null;
  const params: string[] = [];
  const where = tenant?.agencyId ? `WHERE aa.slug = $${params.push(tenant.agencyId)}` : '';

  const result = await getStaticPool().query(
    `SELECT
       aa.slug, aa.display_name, aa.tier,
       ga.agency_slug, ga.country_code, ga.region,
       fv.id as feed_version_id, fv.label, fv.effective_from, fv.effective_to,
       fv.route_count, fv.stop_count, fv.trip_count, fv.uploaded_at
     FROM agency_accounts aa
     JOIN gtfs_agencies ga ON ga.agency_account_id = aa.id
     LEFT JOIN feed_versions fv ON fv.gtfs_agency_id = ga.id AND fv.is_current = TRUE
     ${where}
     ORDER BY aa.display_name`,
    params
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

// GET /api/import/agencies/:slug/simulate/routes
// Returns all routes for the Simulate module (id, name, type, color).
router.get('/agencies/:slug/simulate/routes', requireAuth, async (req: Request, res: Response): Promise<void> => {
  const pool = getStaticPool();

  const fvRow = await pool.query(
    `SELECT fv.id
     FROM feed_versions fv
     JOIN gtfs_agencies ga ON ga.id = fv.gtfs_agency_id
     JOIN agency_accounts aa ON aa.id = ga.agency_account_id
     WHERE aa.slug = $1 AND fv.is_current = TRUE
     LIMIT 1`,
    [req.params.slug]
  );
  if (fvRow.rows.length === 0) {
    res.status(404).json({ error: 'No current feed for this agency' });
    return;
  }
  const feedVersionId = fvRow.rows[0].id;

  const result = await pool.query(
    `SELECT gtfs_route_id, route_short_name, route_long_name, route_type, route_color
     FROM routes
     WHERE feed_version_id = $1
     ORDER BY route_short_name`,
    [feedVersionId]
  );

  const ROUTE_COLORS = ['6366F1','10B981','F59E0B','EF4444','8B5CF6','06B6D4','EC4899','14B8A6','F97316','3B82F6'];
  const routes = result.rows.map((r, i) => ({
    id: r.gtfs_route_id,
    name: r.route_short_name
      ? `${r.route_short_name}${r.route_long_name ? ' — ' + r.route_long_name : ''}`
      : r.route_long_name || r.gtfs_route_id,
    type: String(r.route_type ?? '3'),
    color: r.route_color?.trim() ? `#${r.route_color.trim()}` : `#${ROUTE_COLORS[i % ROUTE_COLORS.length]}`,
  }));

  res.json({ routes });
});

// GET /api/import/agencies/:slug/simulate/route/:routeId
// Returns stop sequence + shape polyline for the Simulate module.
router.get('/agencies/:slug/simulate/route/:routeId', requireAuth, async (req: Request, res: Response): Promise<void> => {
  const pool = getStaticPool();
  const { slug, routeId } = req.params;

  // Resolve current feed version
  const fvRow = await pool.query(
    `SELECT fv.id
     FROM feed_versions fv
     JOIN gtfs_agencies ga ON ga.id = fv.gtfs_agency_id
     JOIN agency_accounts aa ON aa.id = ga.agency_account_id
     WHERE aa.slug = $1 AND fv.is_current = TRUE
     LIMIT 1`,
    [slug]
  );
  if (fvRow.rows.length === 0) {
    res.status(404).json({ error: 'No current feed for this agency' });
    return;
  }
  const feedVersionId = fvRow.rows[0].id;

  // Route metadata
  const routeRow = await pool.query(
    `SELECT gtfs_route_id, route_short_name, route_long_name, route_color
     FROM routes WHERE feed_version_id = $1 AND gtfs_route_id = $2 LIMIT 1`,
    [feedVersionId, routeId]
  );
  if (routeRow.rows.length === 0) {
    res.status(404).json({ error: 'Route not found' });
    return;
  }
  const route = routeRow.rows[0];

  // Pick the representative trip: longest stop sequence for direction 0
  const tripRow = await pool.query(
    `SELECT t.gtfs_trip_id
     FROM trips t
     JOIN (
       SELECT gtfs_trip_id, COUNT(*) AS stop_count
       FROM stop_times WHERE feed_version_id = $1
       GROUP BY gtfs_trip_id
     ) sc ON sc.gtfs_trip_id = t.gtfs_trip_id
     WHERE t.feed_version_id = $1
       AND t.gtfs_route_id = $2
       AND (t.direction_id = 0 OR t.direction_id IS NULL)
     ORDER BY sc.stop_count DESC
     LIMIT 1`,
    [feedVersionId, routeId]
  );
  if (tripRow.rows.length === 0) {
    res.status(404).json({ error: 'No trips found for this route' });
    return;
  }
  const tripId = tripRow.rows[0].gtfs_trip_id;

  // Ordered stop sequence with lat/lon
  const stopsResult = await pool.query(
    `SELECT st.stop_sequence, s.gtfs_stop_id, s.stop_name, s.stop_lat, s.stop_lon
     FROM stop_times st
     JOIN stops s ON s.feed_version_id = st.feed_version_id
                 AND s.gtfs_stop_id   = st.gtfs_stop_id
     WHERE st.feed_version_id = $1 AND st.gtfs_trip_id = $2
     ORDER BY st.stop_sequence`,
    [feedVersionId, tripId]
  );

  const n = stopsResult.rows.length;
  const stops = stopsResult.rows.map((s, i) => ({
    id:         s.gtfs_stop_id,
    name:       s.stop_name,
    lat:        parseFloat(s.stop_lat),
    lng:        parseFloat(s.stop_lon),
    isTerminal: i === 0 || i === n - 1,
  }));

  // Route shape — GeoJSON LineString coords are [lon, lat], flip to [lat, lon]
  const shapeResult = await pool.query(
    `SELECT ST_AsGeoJSON(geom)::json AS geojson
     FROM route_shapes
     WHERE feed_version_id = $1 AND gtfs_route_id = $2
     ORDER BY direction_id ASC
     LIMIT 1`,
    [feedVersionId, routeId]
  );

  let shape: [number, number][] = [];
  if (shapeResult.rows.length > 0) {
    const coords = shapeResult.rows[0].geojson?.coordinates ?? [];
    shape = (coords as [number, number][]).map(([lon, lat]) => [lat, lon]);
  }
  if (shape.length === 0) {
    shape = stops.map(s => [s.lat, s.lng] as [number, number]);
  }

  const ROUTE_COLORS = ['6366F1','10B981','F59E0B','EF4444','8B5CF6','06B6D4','EC4899','14B8A6','F97316','3B82F6'];
  const color = route.route_color?.trim()
    ? `#${route.route_color.trim()}`
    : '#6366F1';

  res.json({
    id:    routeId,
    name:  route.route_short_name
      ? `${route.route_short_name}${route.route_long_name ? ' — ' + route.route_long_name : ''}`
      : route.route_long_name || routeId,
    color,
    stops,
    shape,
  });
});

export default router;
