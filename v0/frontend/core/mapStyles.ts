/**
 * Cinematic Map Presets for Atlas
 * Focuses on high-contrast, professional planning aesthetics
 */

export const MAP_PRESETS = {
    dark: {
        url: "https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png",
        attribution: '&copy; OpenStreetMap &copy; CARTO',
        styles: {
            container: "bg-[#020617]",
            polyline: {
                color: '#6366f1', // Indigo 500
                weight: 4,
                opacity: 0.8,
                lineCap: 'round' as const,
                lineJoin: 'round' as const
            },
            marker: {
                radius: 6,
                fillColor: '#6366f1',
                fillOpacity: 0.9,
                color: '#ffffff',
                weight: 2
            }
        }
    },
    light: {
        url: "https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png",
        attribution: '&copy; OpenStreetMap &copy; CARTO',
        styles: {
            container: "bg-[#f8fafc]",
            polyline: {
                color: '#4f46e5', // Indigo 600
                weight: 4,
                opacity: 0.7,
                lineCap: 'round' as const,
                lineJoin: 'round' as const
            },
            marker: {
                radius: 6,
                fillColor: '#4f46e5',
                fillOpacity: 0.9,
                color: '#ffffff',
                weight: 2
            }
        }
    }
};

export const getTheme = () => {
    return document.documentElement.classList.contains('dark') ? 'dark' : 'light';
};
