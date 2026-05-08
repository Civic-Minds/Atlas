import { getStaticPool } from '../storage/static-db';

export class AlertService {
  static async getThresholds(accountId: string) {
    const result = await getStaticPool().query(
      'SELECT * FROM alert_thresholds WHERE agency_account_id = $1 ORDER BY created_at DESC',
      [accountId]
    );
    return result.rows;
  }

  static async createThreshold(data: {
    accountId: string;
    target_type: string;
    target_id?: string;
    metric: string;
    comparison: string;
    value: number;
    cooldown_minutes?: number;
    notion_enabled?: boolean;
  }) {
    const { accountId, target_type, target_id, metric, comparison, value, cooldown_minutes, notion_enabled } = data;
    const result = await getStaticPool().query(
      `INSERT INTO alert_thresholds 
       (agency_account_id, target_type, target_id, metric, comparison, value, cooldown_minutes, notion_enabled)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING *`,
      [accountId, target_type, target_id, metric, comparison, value, cooldown_minutes || 60, !!notion_enabled]
    );
    return result.rows[0];
  }

  static async deleteThreshold(id: string, accountId: string) {
    await getStaticPool().query(
      'DELETE FROM alert_thresholds WHERE id = $1 AND agency_account_id = $2',
      [id, accountId]
    );
  }
}
