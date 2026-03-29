import { Pool } from 'pg';

let staticPool: Pool | null = null;

export function getStaticPool(): Pool {
  if (!staticPool) {
    staticPool = new Pool({
      connectionString: process.env.STATIC_DATABASE_URL ?? 'postgresql://ubuntu:ouija@localhost/static',
    });
  }
  return staticPool;
}
