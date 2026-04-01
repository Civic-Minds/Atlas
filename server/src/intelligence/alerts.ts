import { getPool } from '../storage/db';
import { getStaticPool } from '../storage/static-db';
import { log } from '../logger';

/**
 * Alert Engine (Phase 2 Hardening)
 * 
 * Manages threshold evaluation and notification dispatch (Notion/Slack).
 */

export interface Threshold {
    id: string;
    agency_account_id: string;
    target_type: 'agency' | 'route' | 'corridor';
    target_id: string;
    metric: 'reliability_score' | 'bunching_count' | 'ghost_rate' | 'health_score';
    comparison: '>' | '<' | '>=' | '<=';
    value: number;
    cooldown_minutes: number;
    is_active: boolean;
    notion_enabled: boolean;
    slack_enabled: boolean;
    last_triggered_at?: Date;
}

export async function evaluateThresholds(agencyId: string, currentMetrics: Record<string, number>) {
    const staticPool = getStaticPool();
    const rtPool = getPool();

    log.info('Alerts', 'Evaluating thresholds', { agencyId, metrics: currentMetrics });

    // 1. Get all active thresholds for this agencyId (cross-ref with gtfs_agencies to find agency_account_id)
    const accountLookup = await staticPool.query(
        `SELECT agency_account_id FROM gtfs_agencies WHERE id = (
            SELECT id FROM gtfs_agencies WHERE agency_account_id IN (
                SELECT id FROM agency_accounts WHERE slug = $1 OR display_name = $1
            ) LIMIT 1
        )`, [agencyId]
    );

    // Simplification: Try finding by slug for now since agencyId in RT usually matches slug
    const accountRes = await staticPool.query(
        `SELECT id FROM agency_accounts WHERE slug = $1`, [agencyId]
    );

    if (accountRes.rows.length === 0) return;
    const accountId = accountRes.rows[0].id;

    const thresholds = await staticPool.query(
        `SELECT * FROM alert_thresholds 
         WHERE agency_account_id = $1 AND is_active = TRUE`,
        [accountId]
    );

    for (const t of thresholds.rows as Threshold[]) {
        const val = currentMetrics[t.metric];
        if (val === undefined) continue;

        let triggered = false;
        switch (t.comparison) {
            case '>': triggered = val > t.value; break;
            case '<': triggered = val < t.value; break;
            case '>=': triggered = val >= t.value; break;
            case '<=': triggered = val <= t.value; break;
        }

        if (triggered) {
            // Check cooldown
            if (t.last_triggered_at) {
                const diff = (new Date().getTime() - new Date(t.last_triggered_at).getTime()) / (1000 * 60);
                if (diff < t.cooldown_minutes) continue;
            }

            await triggerAlert(t, val);
        }
    }
}

async function triggerAlert(threshold: Threshold, value: number) {
    const staticPool = getStaticPool();
    const message = `Alert: ${threshold.metric} for ${threshold.target_id} (${threshold.target_type}) reached ${value} (Threshold: ${threshold.comparison}${threshold.value})`;

    log.warn('Alerts', 'THRESHOLD TRIGGERED', { thresholdId: threshold.id, value, message });

    // 1. Record in history
    await staticPool.query(
        `INSERT INTO alert_history (agency_account_id, threshold_id, observed_value, message)
         VALUES ($1, $2, $3, $4)`,
        [threshold.agency_account_id, threshold.id, value, message]
    );

    // 2. Update last_triggered_at
    await staticPool.query(
        `UPDATE alert_thresholds SET last_triggered_at = NOW() WHERE id = $1`,
        [threshold.id]
    );

    // 3. Dispatch (Mock for now, will integrate Notion in next step)
    if (threshold.notion_enabled) {
        log.info('Alerts', 'Dispatching to Notion...', { thresholdId: threshold.id });
    }
}
