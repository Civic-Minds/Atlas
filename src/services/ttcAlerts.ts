// Salvaged from TTC-Status-Board-main
// original author: Ryan
// Logic to fetch and parse live alerts from the TTC API

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

interface TtcAlertRoute {
    route: string;
    routeType: string;
    headerText: string;
    descriptionText: string;
    lastUpdated: string;
    severity: string;
    direction: string;
    alertType?: string;
}

interface TtcApiResponse {
    routes: TtcAlertRoute[];
    status: string;
}

const mapSeverity = (apiSeverity: string): Alert['severity'] => {
    const s = apiSeverity.toLowerCase();
    if (s === 'critical') return 'Critical';
    if (s === 'major') return 'Major';
    if (s === 'minor') return 'Minor';
    return 'Minor';
};

const determineType = (text: string, rawType?: string): Alert['type'] => {
    if (rawType === 'Planned' || text.toLowerCase().includes('planned')) return 'Planned';
    if (text.toLowerCase().includes('maintenance')) return 'Maintenance';
    if (text.toLowerCase().includes('delay')) return 'Delay';
    return 'Service';
};

export const fetchLiveAlerts = async (lineId: string): Promise<Alert[]> => {
    try {
        const res = await fetch('https://alerts.ttc.ca/api/alerts/list');
        if (!res.ok) throw new Error('Failed to fetch alerts');

        const data: TtcApiResponse = await res.json();
        if (!data.routes) return [];

        return data.routes
            .filter(r => r.route === lineId)
            .map(r => ({
                id: `live-${Math.random()}`,
                lineId,
                type: determineType(r.headerText, r.alertType),
                severity: mapSeverity(r.severity),
                description: r.headerText,
                timestamp: r.lastUpdated,
                active: true,
                direction: r.direction
            }));

    } catch (error) {
        console.warn('TTC Alert Fetch Error:', error);
        return [];
    }
};
