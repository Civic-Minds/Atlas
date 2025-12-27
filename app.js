// Tier configuration with colors and display names
const TIER_CONFIG = {
  'freq_plus': { color: '#1a237e', label: 'Freq+ (≤10 min)', order: 1 },
  'freq': { color: '#1565c0', label: 'Freq (≤15 min)', order: 2 },
  'good': { color: '#2e7d32', label: 'Good (≤20 min)', order: 3 },
  'basic': { color: '#f9a825', label: 'Basic (≤30 min)', order: 4 },
  'infreq': { color: '#ef6c00', label: 'Infreq (≤60 min)', order: 5 },
  'sparse': { color: '#c62828', label: 'Sparse (>60 min)', order: 6 },
  'unknown': { color: '#9e9e9e', label: 'No data', order: 7 }
};

// Day types for filtering
const DAY_TYPES = ['weekday', 'saturday', 'sunday'];

// State
let currentDayType = 'weekday';
let visibleTiers = new Set(Object.keys(TIER_CONFIG));
let routeLayer = null;
let routesGeoJson = null;
let tierLookup = {};

// Initialize map
const map = L.map('map').setView([47.658, -117.426], 12);
L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
  maxZoom: 19,
  attribution: '&copy; OpenStreetMap'
}).addTo(map);

// Load check data from localStorage and build tier lookup
function loadCheckData() {
  const checks = JSON.parse(localStorage.getItem('transit-checks') || '[]');
  tierLookup = {};

  // Use the most recent check for each route
  for (const check of checks) {
    if (!check.routes) continue;

    for (const route of check.routes) {
      const routeId = route.route_id;
      if (!routeId) continue;

      // Store tier data for each day type
      tierLookup[routeId] = {
        weekday: route.weekday_tier || route.tier || null,
        saturday: route.saturday_tier || route.tier || null,
        sunday: route.sunday_tier || route.tier || null,
        route_short_name: route.route_short_name,
        route_long_name: route.route_long_name
      };
    }
  }

  return tierLookup;
}

// Get tier for a route based on current day type
function getRouteTier(routeId) {
  const tierData = tierLookup[routeId];
  if (!tierData) return 'unknown';

  const tier = tierData[currentDayType];
  if (!tier || !TIER_CONFIG[tier]) return 'unknown';

  return tier;
}

// Get color for a tier
function getTierColor(tier) {
  return TIER_CONFIG[tier]?.color || TIER_CONFIG.unknown.color;
}

// Style function for routes
function styleRoute(feature) {
  const routeId = feature.properties?.route_id;
  const tier = getRouteTier(routeId);
  const isVisible = visibleTiers.has(tier);

  return {
    weight: tier === 'freq_plus' ? 5 : tier === 'freq' ? 4 : 3,
    opacity: isVisible ? 0.9 : 0,
    color: getTierColor(tier)
  };
}

// Filter function to show/hide routes
function filterRoute(feature) {
  const routeId = feature.properties?.route_id;
  const tier = getRouteTier(routeId);
  return visibleTiers.has(tier);
}

// Create popup content for a route
function createPopupContent(feature) {
  const p = feature.properties || {};
  const routeId = p.route_id;
  const tier = getRouteTier(routeId);
  const tierConfig = TIER_CONFIG[tier];

  const name = [p.route_short_name, p.route_long_name].filter(Boolean).join(' — ');

  return `
    <div class="route-popup">
      <strong>${name || routeId || 'Route'}</strong>
      <div class="tier-badge" style="background-color: ${tierConfig.color}">
        ${tierConfig.label}
      </div>
    </div>
  `;
}

// Render routes on the map
function renderRoutes() {
  if (routeLayer) {
    map.removeLayer(routeLayer);
  }

  if (!routesGeoJson) return;

  routeLayer = L.geoJSON(routesGeoJson, {
    style: styleRoute,
    filter: filterRoute,
    onEachFeature: (feature, layer) => {
      layer.bindPopup(createPopupContent(feature));
    }
  }).addTo(map);
}

// Create legend control
function createLegend() {
  const legend = L.control({ position: 'bottomright' });

  legend.onAdd = function() {
    const div = L.DomUtil.create('div', 'legend');
    div.innerHTML = '<h4>Service Frequency</h4>';

    // Sort tiers by order
    const sortedTiers = Object.entries(TIER_CONFIG)
      .sort((a, b) => a[1].order - b[1].order);

    for (const [tierId, config] of sortedTiers) {
      div.innerHTML += `
        <div class="legend-item" data-tier="${tierId}">
          <span class="legend-color" style="background-color: ${config.color}"></span>
          <span class="legend-label">${config.label}</span>
        </div>
      `;
    }

    return div;
  };

  legend.addTo(map);
}

// Create controls panel (day type selector + tier filter)
function createControls() {
  const controls = L.control({ position: 'topright' });

  controls.onAdd = function() {
    const div = L.DomUtil.create('div', 'map-controls');

    // Day type selector
    div.innerHTML = `
      <div class="control-group">
        <label for="day-type-select">Day Type:</label>
        <select id="day-type-select">
          <option value="weekday" selected>Weekday</option>
          <option value="saturday">Saturday</option>
          <option value="sunday">Sunday</option>
        </select>
      </div>

      <div class="control-group">
        <label>Show Tiers:</label>
        <div class="tier-filters">
          <button class="tier-filter-btn active" data-filter="all">All</button>
          <button class="tier-filter-btn" data-filter="freq-plus">Freq+ only</button>
          <button class="tier-filter-btn" data-filter="freq-or-better">Freq or better</button>
          <button class="tier-filter-btn" data-filter="good-or-better">Good or better</button>
          <button class="tier-filter-btn" data-filter="custom">Custom...</button>
        </div>
        <div id="custom-tier-filters" class="custom-filters hidden">
          ${Object.entries(TIER_CONFIG)
            .sort((a, b) => a[1].order - b[1].order)
            .map(([tierId, config]) => `
              <label class="tier-checkbox">
                <input type="checkbox" value="${tierId}" checked>
                <span class="tier-color" style="background-color: ${config.color}"></span>
                ${config.label}
              </label>
            `).join('')}
        </div>
      </div>
    `;

    // Prevent map interactions when using controls
    L.DomEvent.disableClickPropagation(div);
    L.DomEvent.disableScrollPropagation(div);

    return div;
  };

  controls.addTo(map);

  // Add event listeners after control is added
  setTimeout(() => {
    setupControlListeners();
  }, 0);
}

// Setup event listeners for controls
function setupControlListeners() {
  // Day type selector
  const daySelect = document.getElementById('day-type-select');
  if (daySelect) {
    daySelect.addEventListener('change', (e) => {
      currentDayType = e.target.value;
      renderRoutes();
    });
  }

  // Tier filter buttons
  const filterBtns = document.querySelectorAll('.tier-filter-btn');
  const customFilters = document.getElementById('custom-tier-filters');

  filterBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      // Update active state
      filterBtns.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');

      const filter = btn.dataset.filter;

      // Show/hide custom filters
      if (filter === 'custom') {
        customFilters.classList.remove('hidden');
      } else {
        customFilters.classList.add('hidden');
      }

      // Apply filter
      switch (filter) {
        case 'all':
          visibleTiers = new Set(Object.keys(TIER_CONFIG));
          break;
        case 'freq-plus':
          visibleTiers = new Set(['freq_plus']);
          break;
        case 'freq-or-better':
          visibleTiers = new Set(['freq_plus', 'freq']);
          break;
        case 'good-or-better':
          visibleTiers = new Set(['freq_plus', 'freq', 'good']);
          break;
        case 'custom':
          // Keep current selection, sync checkboxes
          syncCustomCheckboxes();
          return;
      }

      renderRoutes();
    });
  });

  // Custom tier checkboxes
  if (customFilters) {
    customFilters.addEventListener('change', (e) => {
      if (e.target.type === 'checkbox') {
        const tier = e.target.value;
        if (e.target.checked) {
          visibleTiers.add(tier);
        } else {
          visibleTiers.delete(tier);
        }
        renderRoutes();
      }
    });
  }
}

// Sync custom checkboxes with current visible tiers
function syncCustomCheckboxes() {
  const checkboxes = document.querySelectorAll('#custom-tier-filters input[type="checkbox"]');
  checkboxes.forEach(cb => {
    cb.checked = visibleTiers.has(cb.value);
  });
}

// Show info message if no check data
function showNoDataMessage() {
  const hasCheckData = Object.keys(tierLookup).length > 0;

  if (!hasCheckData) {
    const info = L.control({ position: 'topleft' });
    info.onAdd = function() {
      const div = L.DomUtil.create('div', 'info-message');
      div.innerHTML = `
        <div class="info-content">
          <strong>No tier data loaded</strong>
          <p>Routes are shown in gray. <a href="/import.html">Import check files</a> to see frequency tiers.</p>
        </div>
      `;
      L.DomEvent.disableClickPropagation(div);
      return div;
    };
    info.addTo(map);
  }
}

// Initialize the application
async function init() {
  // Load check data first
  loadCheckData();

  // Create UI controls
  createControls();
  createLegend();

  // Load and render routes
  try {
    const response = await fetch('data/routes.geojson');
    routesGeoJson = await response.json();
    renderRoutes();

    // Fit bounds to routes
    if (routeLayer) {
      try {
        map.fitBounds(routeLayer.getBounds(), { padding: [20, 20] });
      } catch (e) {}
    }
  } catch (err) {
    console.error('Failed to load routes.geojson', err);
  }

  // Show message if no tier data
  showNoDataMessage();
}

// Start the app
init();
