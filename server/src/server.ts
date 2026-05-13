import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import rateLimit from 'express-rate-limit';
import { Pool } from 'pg';

const app = express();
const PORT = process.env.PORT || 3001;

// Rate limiting: 100 requests per 15 minutes per IP
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  message: { error: 'Too many requests from this IP, please try again after 15 minutes' },
  standardHeaders: true,
  legacyHeaders: false,
});

app.use(cors());
app.use(express.json());
app.use('/api/', apiLimiter);

const staticPool = new Pool({
  connectionString: process.env.STATIC_DATABASE_URL,
});

app.get('/api/agencies', async (_req, res) => {
  try {
    const result = await staticPool.query(`
      SELECT slug, display_name, country_code, region
      FROM agency_accounts
      ORDER BY display_name ASC
    `);
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

app.get('/api/shapes/:agency', async (req, res) => {
  const { agency } = req.params;
  try {
    const result = await staticPool.query(
      `
      SELECT
        rs.gtfs_route_id,
        rs.direction_id,
        ST_AsGeoJSON(rs.geom) AS geojson,
        rfr.tier,
        rfr.base_headway,
        r.route_short_name,
        r.route_long_name
      FROM route_shapes rs
      JOIN feed_versions fv ON fv.id = rs.feed_version_id
      JOIN gtfs_agencies ga ON ga.id = fv.gtfs_agency_id
      LEFT JOIN route_frequency_results rfr ON (
        rfr.feed_version_id = fv.id AND
        rfr.gtfs_route_id = rs.gtfs_route_id AND
        rfr.direction_id = rs.direction_id AND
        rfr.day_type = 'Weekday'
      )
      LEFT JOIN routes r ON (
        r.feed_version_id = fv.id AND
        r.gtfs_route_id = rs.gtfs_route_id
      )
      WHERE ga.agency_slug = $1 AND fv.is_current = TRUE
      `,
      [agency]
    );

    const features = result.rows.map((row) => ({
      type: 'Feature',
      properties: {
        routeId: row.gtfs_route_id,
        directionId: row.direction_id,
        tier: row.tier,
        headway: row.base_headway,
        routeShortName: row.route_short_name ?? null,
        routeLongName: row.route_long_name ?? null,
      },
      geometry: JSON.parse(row.geojson),
    }));

    res.json({ type: 'FeatureCollection', features });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

app.get('/api/stops/:agency', async (req, res) => {
  const { agency } = req.params;
  try {
    const result = await staticPool.query(
      `
      SELECT s.gtfs_stop_id, s.stop_name, s.stop_lat, s.stop_lon
      FROM stops s
      JOIN feed_versions fv ON fv.id = s.feed_version_id
      JOIN gtfs_agencies ga ON ga.id = fv.gtfs_agency_id
      WHERE ga.agency_slug = $1 AND fv.is_current = TRUE
      LIMIT 2000
      `,
      [agency]
    );
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

app.get('/api/connections/:agency/:stopId', async (req, res) => {
  const { agency, stopId } = req.params;
  try {
    const result = await staticPool.query(
      `
      SELECT DISTINCT s2.gtfs_stop_id
      FROM stop_times st1
      JOIN feed_versions fv ON fv.id = st1.feed_version_id
      JOIN gtfs_agencies ga ON ga.id = fv.gtfs_agency_id
      JOIN stop_times st2 ON st1.gtfs_trip_id = st2.gtfs_trip_id AND st1.feed_version_id = st2.feed_version_id
      JOIN stops s2 ON st2.gtfs_stop_id = s2.gtfs_stop_id AND st2.feed_version_id = s2.feed_version_id
      WHERE ga.agency_slug = $1 
        AND fv.is_current = TRUE
        AND st1.gtfs_stop_id = $2
      LIMIT 500
      `,
      [agency, stopId]
    );
    res.json(result.rows.map(r => r.gtfs_stop_id));
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', version: '0.21.0' });
});

app.listen(PORT, () => {
  console.log(`Atlas server running on port ${PORT}`);
});
