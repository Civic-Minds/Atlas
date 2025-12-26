const agencyHeader = document.getElementById('agencyHeader');
const checksTimeline = document.getElementById('checksTimeline');
const routesList = document.getElementById('routesList');

// Get agency ID from URL
const params = new URLSearchParams(window.location.search);
const agencyId = params.get('id');

// Load checks from localStorage
const CHECKS = JSON.parse(localStorage.getItem('transit-checks') || '[]');

// Find checks for this agency
const agencyChecks = CHECKS.filter(check => check.agency.id === agencyId);

if (agencyChecks.length === 0) {
  agencyHeader.innerHTML = '<h1>Agency Not Found</h1><p>No checks found for this agency.</p>';
} else {
  // Use most recent check for header
  const latestCheck = agencyChecks[agencyChecks.length - 1];

  agencyHeader.innerHTML = `
    <h1>${latestCheck.agency.name}</h1>
    <p>Agency ID: ${latestCheck.agency.id}</p>
  `;

  // Render checks timeline
  checksTimeline.innerHTML = '<h2>Analysis History</h2>';
  for (const check of agencyChecks) {
    checksTimeline.innerHTML += `
      <div class="check-item">
        <p>Analyzed: ${new Date(check.check.created_at).toLocaleDateString()}</p>
        <p>Routes: ${check.routes.length}</p>
      </div>
    `;
  }

  // Render routes from latest check
  routesList.innerHTML = '<h2>Routes</h2>';
  for (const route of latestCheck.routes) {
    routesList.innerHTML += `
      <div class="route-item">
        <h3>${route.route_short_name || route.route_id}: ${route.route_long_name || ''}</h3>
        <p>Type: ${route.route_type}</p>
      </div>
    `;
  }
}
