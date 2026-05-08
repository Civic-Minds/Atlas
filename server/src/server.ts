import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import { Pool } from 'pg';

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors());
app.use(express.json());

// Minimal DB setup for the reboot
const pool = new Pool({
  connectionString: process.env.DATABASE_URL
});

const staticPool = new Pool({
  connectionString: process.env.STATIC_DATABASE_URL
});

// Minimal Agency List
app.get('/api/agencies', async (req, res) => {
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

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', reboot: true });
});

app.listen(PORT, () => {
  console.log(`Atlas Reboot Server running on port ${PORT}`);
});
