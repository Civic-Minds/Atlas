"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.syncAgencyToNotion = syncAgencyToNotion;
const client_1 = require("@notionhq/client");
const logger_1 = require("../logger");
const headway_1 = require("./headway");
const NOTION_DATABASE_ID = process.env.NOTION_DATABASE_ID ?? '3339563c9a49804e92fde353d1470eb4';
// Use the MCP environment's internal token via tool or assume the user will provide one in .env
const notion = new client_1.Client({
    auth: process.env.NOTION_TOKEN
});
/**
 * Synchronizes production transit intelligence (Pulse & AHW) to the global Notion repository.
 * Runs from the OCI-backed server process, not a local development poller.
 */
async function syncAgencyToNotion(agencyId, health) {
    if (!process.env.NOTION_TOKEN) {
        logger_1.log.warn('NotionSync', 'Skipping sync: NOTION_TOKEN not configured.');
        return { agencyId, success: false, error: 'NOTION_TOKEN missing' };
    }
    try {
        logger_1.log.info('NotionSync', `Synchronizing intelligence for ${agencyId}...`);
        // 1. Calculate the latest aggregate AHW score for this agency (last 60 mins)
        const endTime = new Date();
        const startTime = new Date(endTime.getTime() - 60 * 60 * 1000);
        const corridors = await (0, headway_1.aggregateCorridorPerformance)(agencyId, startTime, endTime);
        const avgScore = corridors.length > 0
            ? corridors.reduce((acc, c) => acc + c.reliabilityScore, 0) / corridors.length
            : null;
        // 2. Find the corresponding row in the Agencies Database
        // @ts-ignore - Notion SDK typing can be finicky in mixed environments
        const response = await notion.databases.query({
            database_id: NOTION_DATABASE_ID,
            filter: {
                property: 'ID',
                rich_text: {
                    equals: agencyId
                }
            }
        });
        if (response.results.length === 0) {
            logger_1.log.warn('NotionSync', `No mapping found for agency ${agencyId} in Notion.`);
            return { agencyId, success: false, error: 'Mapping not found' };
        }
        const pageId = response.results[0].id;
        // 3. Update the Notion properties
        // Map health to Status: Healthy -> Live, Error -> Down
        const statusName = health.success ? 'Live' : 'Down';
        await notion.pages.update({
            page_id: pageId,
            properties: {
                'Status': {
                    status: {
                        name: statusName
                    }
                },
                'Notes': {
                    rich_text: [
                        {
                            text: {
                                content: `Pulse Sync: ${new Date().toLocaleTimeString()} UTC. ${health.vehicleCount ?? 0} vehicles tracked. ${health.errorMsg ? `LAST_ERR: ${health.errorMsg}` : 'All flow stable.'}`
                            }
                        }
                    ]
                },
                // We'll attempt to update "Reliability (AHW)" - this property might need manual creation if not present
                ...(avgScore !== null ? {
                    'Performance': {
                        number: Math.round(avgScore * 10) / 10 // Store with 1 decimal precision
                    }
                } : {})
            }
        });
        const syncStatus = `Status: ${statusName}, Performance: ${avgScore !== null ? (Math.round(avgScore * 10) / 10).toString() : 'N/A'}`;
        logger_1.log.info('NotionSync', `Successfully pushed intelligence for ${agencyId} to Notion. ${syncStatus}`);
        return { agencyId, success: true, score: avgScore ?? undefined, syncAt: new Date(), syncStatus };
    }
    catch (err) {
        logger_1.log.error('NotionSync', `Failed to sync ${agencyId} to Notion`, { error: err.message, stack: err.stack });
        return { agencyId, success: false, error: err.message };
    }
}
