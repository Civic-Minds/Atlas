// Generic Agency Alert Service — Agency-agnostic
// Fetches and parses live alerts from any GTFS-RT compatible alerts endpoint.

export interface Alert {
    id: string;
    lineId: string;
    type: 'Delay' | 'Service' | 'Maintenance' | 'Planned';
    severity: 'Minor' | 'Major' | 'Critical';
    description: string;
    timestamp: string;
    active: boolean;
    direction?: string;
}

export interface AgencyConfig {
    name: string;
    alertsUrl?: string;
    timezone?: string;
}

/**
 * Fetches live alerts from a configured GTFS-RT alerts endpoint.
 * Returns an empty array if no endpoint is configured or if the fetch fails.
 */
export const fetchLiveAlerts = async (
    routeId: string,
    agencyConfig?: AgencyConfig | null
): Promise<Alert[]> => {
    // If no agency config or no alerts URL, return empty — no alerts to show
    if (!agencyConfig?.alertsUrl) return [];

    try {
        const res = await fetch(agencyConfig.alertsUrl);
        if (!res.ok) throw new Error(`Alert fetch failed: ${res.status}`);

        const data = await res.json();

        // Handle standard GTFS-RT JSON format (entity-based)
        if (data.entity && Array.isArray(data.entity)) {
            return parseGtfsRtAlerts(data.entity, routeId);
        }

        // Handle flat array format (some agencies serve alerts this way)
        if (data.routes && Array.isArray(data.routes)) {
            return parseFlatAlerts(data.routes, routeId);
        }

        console.warn('Unrecognized alert format from', agencyConfig.alertsUrl);
        return [];

    } catch (error) {
        console.warn(`Alert fetch error (${agencyConfig.name}):`, error);
        return [];
    }
};

// --- Parsers for different alert formats ---

function parseGtfsRtAlerts(entities: any[], routeId: string): Alert[] {
    return entities
        .filter(entity => {
            const informed = entity.alert?.informed_entity || [];
            return informed.some((ie: any) => ie.route_id === routeId);
        })
        .map(entity => {
            const alert = entity.alert;
            const headerText = alert?.header_text?.translation?.[0]?.text || 'Service Alert';
            const descText = alert?.description_text?.translation?.[0]?.text || headerText;

            return {
                id: entity.id || crypto.randomUUID(),
                lineId: routeId,
                type: determineType(headerText),
                severity: mapGtfsRtSeverity(alert?.severity_level),
                description: descText,
                timestamp: new Date().toISOString(),
                active: true,
            };
        });
}

function parseFlatAlerts(routes: any[], routeId: string): Alert[] {
    return routes
        .filter(r => r.route === routeId || r.route_id === routeId)
        .map(r => ({
            id: crypto.randomUUID(),
            lineId: routeId,
            type: determineType(r.headerText || r.header || '', r.alertType),
            severity: mapSeverity(r.severity || 'minor'),
            description: r.headerText || r.header || r.description || 'Service Alert',
            timestamp: r.lastUpdated || new Date().toISOString(),
            active: true,
            direction: r.direction,
        }));
}

// --- Helpers ---

function mapSeverity(apiSeverity: string): Alert['severity'] {
    const s = apiSeverity.toLowerCase();
    if (s === 'critical') return 'Critical';
    if (s === 'major') return 'Major';
    return 'Minor';
}

function mapGtfsRtSeverity(level?: number): Alert['severity'] {
    // GTFS-RT severity_level: 1=INFO, 2=WARNING, 3=SEVERE
    if (level === 3) return 'Critical';
    if (level === 2) return 'Major';
    return 'Minor';
}

function determineType(text: string, rawType?: string): Alert['type'] {
    if (rawType === 'Planned' || text.toLowerCase().includes('planned')) return 'Planned';
    if (text.toLowerCase().includes('maintenance')) return 'Maintenance';
    if (text.toLowerCase().includes('delay')) return 'Delay';
    return 'Service';
}
