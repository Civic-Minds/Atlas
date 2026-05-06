"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.evaluateThresholds = evaluateThresholds;
const db_1 = require("../storage/db");
const static_db_1 = require("../storage/static-db");
const logger_1 = require("../logger");
async function evaluateThresholds(agencyId, currentMetrics) {
    const staticPool = (0, static_db_1.getStaticPool)();
    const rtPool = (0, db_1.getPool)();
    logger_1.log.info('Alerts', 'Evaluating thresholds', { agencyId, metrics: currentMetrics });
    // Resolve agency_account_id from slug
    const accountRes = await staticPool.query(`SELECT id FROM agency_accounts WHERE slug = $1`, [agencyId]);
    if (accountRes.rows.length === 0)
        return;
    const accountId = accountRes.rows[0].id;
    const thresholds = await staticPool.query(`SELECT * FROM alert_thresholds 
         WHERE agency_account_id = $1 AND is_active = TRUE`, [accountId]);
    for (const t of thresholds.rows) {
        const val = currentMetrics[t.metric];
        if (val === undefined)
            continue;
        let triggered = false;
        switch (t.comparison) {
            case '>':
                triggered = val > t.value;
                break;
            case '<':
                triggered = val < t.value;
                break;
            case '>=':
                triggered = val >= t.value;
                break;
            case '<=':
                triggered = val <= t.value;
                break;
        }
        if (triggered) {
            // Check cooldown
            if (t.last_triggered_at) {
                const diff = (new Date().getTime() - new Date(t.last_triggered_at).getTime()) / (1000 * 60);
                if (diff < t.cooldown_minutes)
                    continue;
            }
            await triggerAlert(t, val);
        }
    }
}
async function triggerAlert(threshold, value) {
    const staticPool = (0, static_db_1.getStaticPool)();
    const message = `Alert: ${threshold.metric} for ${threshold.target_id} (${threshold.target_type}) reached ${value} (Threshold: ${threshold.comparison}${threshold.value})`;
    logger_1.log.warn('Alerts', 'THRESHOLD TRIGGERED', { thresholdId: threshold.id, value, message });
    // 1. Record in history
    await staticPool.query(`INSERT INTO alert_history (agency_account_id, threshold_id, observed_value, message)
         VALUES ($1, $2, $3, $4)`, [threshold.agency_account_id, threshold.id, value, message]);
    // 2. Update last_triggered_at
    await staticPool.query(`UPDATE alert_thresholds SET last_triggered_at = NOW() WHERE id = $1`, [threshold.id]);
    // 3. Dispatch (Mock for now, will integrate Notion in next step)
    if (threshold.notion_enabled) {
        logger_1.log.info('Alerts', 'Dispatching to Notion...', { thresholdId: threshold.id });
    }
}
