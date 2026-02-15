import React from 'react';
import { AVAILABLE_ROUTES } from '../data/routeData';

interface RouteSelectorProps {
    selectedRouteId: string;
    onRouteSelect: (routeId: string) => void;
}

const RouteSelector: React.FC<RouteSelectorProps> = ({ selectedRouteId, onRouteSelect }) => {
    return (
        <div className="route-selector-container">
            <select
                value={selectedRouteId}
                onChange={(e) => onRouteSelect(e.target.value)}
                className="route-select"
            >
                {AVAILABLE_ROUTES.map((route) => (
                    <option key={route.id} value={route.id}>
                        {route.name}
                    </option>
                ))}
            </select>
            <div className="route-select-arrow">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="6 9 12 15 18 9" />
                </svg>
            </div>
        </div>
    );
};

export default RouteSelector;
