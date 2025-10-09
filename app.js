// Basic Leaflet map
const map = L.map('map').setView([47.658, -117.426], 12);
L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
  maxZoom: 19,
  attribution: '&copy; OpenStreetMap'
}).addTo(map);

// Load exported routes and draw them
fetch('data/routes.geojson')
  .then(r => r.json())
  .then(geo => {
    const layer = L.geoJSON(geo, {
      style: { weight: 3, opacity: 0.9, color: 'blue' },
      onEachFeature: (f, l) => {
        const p = f.properties || {};
        const name = [p.route_short_name, p.route_long_name].filter(Boolean).join(' — ');
        l.bindPopup(`<b>${name || p.route_id || 'Route'}</b>`);
      }
    }).addTo(map);
    try { map.fitBounds(layer.getBounds(), { padding: [20, 20] }); } catch (e) {}
  })
  .catch(err => console.error('Failed to load routes.geojson', err));
