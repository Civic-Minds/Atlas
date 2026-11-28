/** The MCP docs page's tool groups (/internal/mcp; names in shared/mcpDocsCopy.ts, MCP_DOCS.tools.groups). */
export type ToolGroup = 'find' | 'schedules' | 'changes' | 'planning' | 'live';

/** Each tool's group on the Tools table (Ryan, 2026-11-22, picked 1), in the table's order. A new tool needs a group here. */
export const TOOL_GROUPS: Record<ToolGroup, readonly string[]> = {
  find: ['list_agencies', 'routes_near', 'compare_agencies', 'rank_agencies', 'on_demand_zones', 'explain_method'],
  schedules: ['route_frequency', 'routes_at_frequency', 'routes_by_hours', 'stop_frequency', 'trip_time', 'combined_frequency', 'night_service', 'frequent_coverage'],
  changes: ['route_history', 'network_history', 'schedule_changes'],
  planning: ['buses_needed'],
  live: ['route_now', 'route_reliability', 'route_bunching'],
};
