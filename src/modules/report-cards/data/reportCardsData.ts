export interface ReportCardSource {
    label: string;
    url: string;
    date?: string;
}

export interface AgencyMetrics {
    fleetSize: number;
    headcount: {
        total: number;
        operators: number;
        admin: number;
        maintenance: number;
    };
    procurement: {
        recentBusCost: number;
        recentBusType: string;
        busManufacturer: string;
    };
    efficiency: {
        costPerRevenueHour: number;
        passengersPerRevenueHour: number;
    };
}

export interface AgencyReportCard {
    id: string;
    name: string;
    city: string;
    logoUrl?: string;
    metrics: AgencyMetrics;
    sources: ReportCardSource[];
}

export const REPORT_CARDS: AgencyReportCard[] = [
    {
        id: 'ttc',
        name: 'TTC',
        city: 'Toronto',
        metrics: {
            fleetSize: 2100,
            headcount: {
                total: 16000,
                operators: 7500,
                admin: 3200,
                maintenance: 5300
            },
            procurement: {
                recentBusCost: 1200000,
                recentBusType: 'eBus (60ft)',
                busManufacturer: 'New Flyer'
            },
            efficiency: {
                costPerRevenueHour: 185,
                passengersPerRevenueHour: 45
            }
        },
        sources: [
            { label: 'TTC 2024 Operating Budget', url: 'https://www.ttc.ca/About_the_TTC/Transit_Planning', date: '2024-01-15' },
            { label: 'Metrolinx Group Procurement Contract', url: 'https://www.metrolinx.com/en/aboutus/procurement/contracts.aspx', date: '2023-11-20' }
        ]
    },
    {
        id: 'la-metro',
        name: 'LA Metro',
        city: 'Los Angeles',
        metrics: {
            fleetSize: 2320,
            headcount: {
                total: 11000,
                operators: 4200,
                admin: 2800,
                maintenance: 4000
            },
            procurement: {
                recentBusCost: 1800000,
                recentBusType: 'eBus (40ft)',
                busManufacturer: 'BYD'
            },
            efficiency: {
                costPerRevenueHour: 215,
                passengersPerRevenueHour: 32
            }
        },
        sources: [
            { label: 'Metro 2024 Adopted Budget', url: 'https://www.metro.net/about/financebudget/', date: '2023-06-22' }
        ]
    }
];
