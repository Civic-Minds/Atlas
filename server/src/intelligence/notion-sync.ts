import { Client } from '@notionhq/client';
import { log } from '../logger';
import { aggregateCorridorPerformance } from './headway';

const NOTION_DATABASE_ID = process.env.NOTION_DATABASE_ID ?? '3339563c9a49804e92fde353d1470eb4';

// Use the MCP environment's internal token via tool or assume the user will provide one in .env
const notion = new Client({
  auth: process.env.NOTION_TOKEN
});

interface SyncResult {
  agencyId: string;
  success: boolean;
  score?: number;
  syncAt?: Date;
  syncStatus?: string;
  error?: string;
}


/**
 * Synchronizes local transit intelligence (Pulse & AHW) to the global Notion repository.
 * This bridges the "Discovery Lab" data with the "Enterprise Visibility" layer.
 */
export async function syncAgencyToNotion(agencyId: string, health: { success: boolean; vehicleCount: number | null; errorMsg?: string | null }): Promise<SyncResult> {
  if (!process.env.NOTION_TOKEN) {
    log.warn('NotionSync', 'Skipping sync: NOTION_TOKEN not configured.');
    return { agencyId, success: false, error: 'NOTION_TOKEN missing' };
  }

  try {
    log.info('NotionSync', `Synchronizing intelligence for ${agencyId}...`);

    // 1. Calculate the latest aggregate AHW score for this agency (last 60 mins)
    const endTime = new Date();
    const startTime = new Date(endTime.getTime() - 60 * 60 * 1000);
    const corridors = await aggregateCorridorPerformance(agencyId, startTime, endTime);
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
      log.warn('NotionSync', `No mapping found for agency ${agencyId} in Notion.`);
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
    log.info('NotionSync', `Successfully pushed intelligence for ${agencyId} to Notion. ${syncStatus}`);
    return { agencyId, success: true, score: avgScore ?? undefined, syncAt: new Date(), syncStatus };


  } catch (err) {
    log.error('NotionSync', `Failed to sync ${agencyId} to Notion`, { error: (err as Error).message, stack: (err as Error).stack });
    return { agencyId, success: false, error: (err as Error).message };
  }
}

