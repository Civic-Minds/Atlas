import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import {
    Activity,
    Map as MapIcon,
    Zap,
    Target,
    BarChart3,
    ArrowRight,
    Search,
    Network
} from 'lucide-react';
import { MapContainer, TileLayer, Polyline, CircleMarker } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';

// Light mode map preset - CartoDB Positron
const MAP_THEME_URL = 'https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png';

// Mock data for transit lines pulsing on the map
const TRANSIT_LINES: [number, number][][] = [
    [
        [40.7128, -74.0060],
        [40.7200, -74.0100],
        [40.7300, -73.9900],
        [40.7400, -73.9800],
        [40.7500, -73.9700]
    ],
    [
        [40.7128, -74.0060],
        [40.7000, -73.9900],
        [40.6900, -73.9800],
        [40.6800, -73.9700]
    ],
    [
        [40.7500, -74.0000],
        [40.7400, -73.9900],
        [40.7300, -73.9800],
        [40.7200, -73.9700],
        [40.7100, -73.9600]
    ]
];

const BENTO_FEATURES = [
    {
        id: 'monitoring',
        title: 'Real-time Telemetry',
        desc: 'Sub-second latency on fleet positioning. Understand network health instantly.',
        icon: <Activity className="w-5 h-5" />,
        colSpan: 'col-span-1 md:col-span-2 lg:col-span-2',
        color: 'text-emerald-600',
        content: (
            <div className="flex flex-col gap-2 h-full justify-end mt-4">
                <div className="flex items-end gap-1 h-12 opacity-80">
                    {[40, 60, 45, 80, 55, 90, 75, 100].map((h, i) => (
                        <motion.div
                            key={i}
                            initial={{ height: 0 }}
                            animate={{ height: `${h}%` }}
                            transition={{ duration: 1, delay: i * 0.1, repeat: Infinity, repeatType: 'reverse' }}
                            className="w-full bg-emerald-500/30 hover:bg-emerald-500 rounded-t-sm"
                        />
                    ))}
                </div>
                <div className="text-[10px] text-slate-400 font-mono flex justify-between uppercase">
                    <span>Live Network Load</span>
                    <span className="text-emerald-600 flex items-center gap-1 font-bold">
                        <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                        Syncing
                    </span>
                </div>
            </div>
        )
    },
    {
        id: 'screener',
        title: 'Network Screener',
        desc: 'Identify transit deserts and optimize route coverage with precision.',
        icon: <MapIcon className="w-5 h-5" />,
        colSpan: 'col-span-1 md:col-span-2 lg:col-span-1',
        color: 'text-blue-600',
        content: (
            <div className="flex flex-col gap-3 mt-4">
                <div className="flex items-center gap-3 p-2 bg-slate-50 rounded-md border border-slate-200">
                    <Target className="w-4 h-4 text-slate-400" />
                    <div className="flex-1">
                        <div className="h-1.5 w-full bg-slate-200 rounded-full overflow-hidden">
                            <div className="h-full w-[65%] bg-blue-500/80 rounded-full" />
                        </div>
                    </div>
                    <span className="text-xs font-mono text-slate-600">65%</span>
                </div>
                <div className="flex items-center gap-3 p-2 bg-slate-50 rounded-md border border-slate-200">
                    <Network className="w-4 h-4 text-slate-400" />
                    <div className="flex-1">
                        <div className="h-1.5 w-full bg-slate-200 rounded-full overflow-hidden">
                            <div className="h-full w-[82%] bg-indigo-500/80 rounded-full" />
                        </div>
                    </div>
                    <span className="text-xs font-mono text-slate-600">82%</span>
                </div>
            </div>
        )
    },
    {
        id: 'simulator',
        title: 'Scenario Engine',
        desc: 'Model the exact impact of service changes before they reach the street.',
        icon: <Zap className="w-5 h-5" />,
        colSpan: 'col-span-1 md:col-span-4 lg:col-span-3',
        color: 'text-indigo-600',
        content: (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-6">
                {[
                    { label: 'Headway Variance', val: '-12%', metric: 'vs baseline', positive: true },
                    { label: 'Ridership Impact', val: '+4.2k', metric: 'daily est.', positive: true },
                    { label: 'Operating Cost', val: '$1.2M', metric: 'annual run rate', positive: false },
                    { label: 'Fleet Req.', val: '42', metric: 'peak vehicles', positive: false },
                ].map((stat, i) => (
                    <div key={i} className="flex flex-col p-3 rounded-md bg-slate-50 border border-slate-200 hover:border-indigo-200 transition-colors">
                        <span className="text-[10px] text-slate-400 uppercase font-mono tracking-wider mb-1">{stat.label}</span>
                        <span className={`text-lg font-bold ${stat.positive ? 'text-emerald-600' : 'text-slate-900'}`}>{stat.val}</span>
                        <span className="text-[10px] text-slate-500 mt-1">{stat.metric}</span>
                    </div>
                ))}
            </div>
        )
    }
];

const BurnerHomePage: React.FC = () => {
    const navigate = useNavigate();
    const [mapLoaded] = useState(true);

    return (
        <div className="flex-1 flex flex-col relative w-full bg-white text-slate-900 selection:bg-indigo-100 overflow-x-hidden">
            {/* Hero Section */}
            <section className="relative pt-16 pb-20 md:pt-24 md:pb-32 px-6 border-b border-slate-200 overflow-hidden min-h-[85vh] flex items-center">

                {/* Map Background Wrapper - Behind everything */}
                <div className="absolute inset-0 z-0 opacity-100 pointer-events-none">
                    <div className="absolute inset-0 bg-gradient-to-r from-white via-white/40 to-transparent z-10" />
                    <div className="absolute inset-0 bg-gradient-to-t from-white via-transparent to-white z-10" />
                    {mapLoaded && (
                        <MapContainer
                            center={[40.7300, -73.9900]}
                            zoom={13}
                            zoomControl={false}
                            attributionControl={false}
                            className="w-full h-full grayscale-[0.5] contrast-[1.1]"
                        >
                            <TileLayer url={MAP_THEME_URL} />
                            {TRANSIT_LINES.map((line, i) => (
                                <Polyline
                                    key={i}
                                    positions={line}
                                    pathOptions={{
                                        color: i === 0 ? '#059669' : i === 1 ? '#4f46e5' : '#2563eb',
                                        weight: 4,
                                        opacity: 0.7,
                                        dashArray: '5, 12',
                                        className: 'animate-dash-scroll'
                                    }}
                                />
                            ))}
                            {TRANSIT_LINES.flat().map((point, i) => (
                                <CircleMarker
                                    key={`pt-${i}`}
                                    center={point}
                                    radius={4}
                                    pathOptions={{ color: '#fff', fillColor: '#334155', fillOpacity: 1, weight: 2 }}
                                />
                            ))}
                        </MapContainer>
                    )}
                </div>

                <div className="max-w-7xl mx-auto w-full relative z-10">
                    <motion.div
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.8 }}
                        className="max-w-3xl"
                    >
                        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-indigo-50 border border-indigo-100 text-indigo-600 text-xs font-bold mb-8 shadow-sm">
                            <span className="w-1.5 h-1.5 rounded-full bg-indigo-500 animate-pulse" />
                            Atlas Engine v0.9 Deployed
                        </div>
                        <h1 className="text-6xl md:text-8xl font-black tracking-tighter leading-[0.9] mb-6 text-slate-900">
                            Intelligence for <br />
                            <span className="text-transparent bg-clip-text bg-gradient-to-r from-indigo-600 to-emerald-600">
                                Modern Mobility.
                            </span>
                        </h1>
                        <p className="text-xl md:text-2xl text-slate-600 max-w-xl font-medium leading-relaxed mb-10">
                            The precise, data-driven platform for analyzing transit networks, modeling scenarios, and optimizing urban paths.
                        </p>

                        <div className="flex flex-col sm:flex-row gap-4">
                            <button
                                onClick={() => navigate('/atlas')}
                                className="group px-6 py-3 bg-slate-900 text-white font-bold rounded text-sm flex items-center justify-center gap-2 hover:bg-black transition-all shadow-lg hover:shadow-xl active:scale-95"
                            >
                                Enter Workspace
                                <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
                            </button>
                            <button
                                onClick={() => navigate('/simulator')}
                                className="px-6 py-3 bg-white text-slate-900 font-bold rounded text-sm flex items-center justify-center gap-2 hover:bg-slate-50 transition-all border border-slate-200 hover:border-slate-300 shadow-sm"
                            >
                                <Search className="w-4 h-4" />
                                Explore Features
                            </button>
                        </div>
                    </motion.div>
                </div>
            </section>

            {/* Bento Grid Section */}
            <section className="py-24 px-6 relative z-10 bg-slate-50/50 backdrop-blur-sm border-t border-slate-100">
                <div className="max-w-7xl mx-auto">
                    <div className="mb-16">
                        <h2 className="text-3xl md:text-4xl font-black tracking-tight mb-4 text-slate-900">Unprecedented <span className="text-slate-400">Clarity.</span></h2>
                        <p className="text-slate-500 max-w-2xl text-lg font-medium">Leave the guesswork behind. Atlas provides highly technical, beautifully rendered tools for transit planners who demand exactness.</p>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-4 lg:grid-cols-3 gap-6">
                        {BENTO_FEATURES.map((feature, i) => (
                            <motion.div
                                key={feature.id}
                                initial={{ opacity: 0, y: 20 }}
                                whileInView={{ opacity: 1, y: 0 }}
                                viewport={{ once: true }}
                                transition={{ duration: 0.5, delay: i * 0.1 }}
                                className={`flex flex-col p-8 rounded-2xl bg-white border border-slate-200 hover:border-indigo-200 hover:shadow-xl hover:shadow-indigo-500/5 transition-all group ${feature.colSpan}`}
                            >
                                <div className="flex flex-col gap-2 mb-6 flex-1">
                                    <div className={`w-12 h-12 rounded-xl bg-slate-50 flex items-center justify-center mb-4 border border-slate-100 group-hover:bg-indigo-50 group-hover:border-indigo-100 transition-colors ${feature.color}`}>
                                        {feature.icon}
                                    </div>
                                    <h3 className="text-xl font-bold tracking-tight text-slate-900">{feature.title}</h3>
                                    <p className="text-sm text-slate-500 leading-relaxed font-medium">{feature.desc}</p>
                                </div>

                                {feature.content}
                            </motion.div>
                        ))}
                    </div>
                </div>
            </section>

            {/* Simple Footer */}
            <footer className="py-16 px-6 border-t border-slate-100 bg-white">
                <div className="max-w-7xl mx-auto flex flex-col md:flex-row justify-between items-center gap-8">
                    <div className="flex items-center gap-2 opacity-80">
                        <div className="w-5 h-5 rounded bg-slate-900 flex items-center justify-center">
                            <Network className="w-3 h-3 text-white" />
                        </div>
                        <span className="font-black tracking-tight text-sm text-slate-900 uppercase">Atlas by Civic Minds</span>
                    </div>
                    <div className="flex gap-8 text-[11px] font-bold text-slate-400 uppercase tracking-[0.2em]">
                        <button className="hover:text-slate-900 transition-colors">Privacy</button>
                        <button className="hover:text-slate-900 transition-colors">Terms</button>
                        <button className="hover:text-slate-900 transition-colors">System Status</button>
                    </div>
                </div>
            </footer>

            {/* Global style for map animation */}
            <style>{`
                @keyframes dash-scroll {
                    to { stroke-dashoffset: -40; }
                }
                .animate-dash-scroll {
                    animation: dash-scroll 3s linear infinite;
                }
            `}</style>
        </div>
    );
};

export default BurnerHomePage;
