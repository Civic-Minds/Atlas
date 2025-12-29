const agencyHeader = document.getElementById('agencyHeader');
const checksTimeline = document.getElementById('checksTimeline');
const routesList = document.getElementById('routesList');

// Get agency ID from URL
const params = new URLSearchParams(window.location.search);
const agencyId = params.get('id');

// Load checks from localStorage
const CHECKS = JSON.parse(localStorage.getItem('transit-checks') || '[]');

// Format time string (HH:MM:SS or HH:MM) to readable format (e.g., "5am", "11pm")
function formatTime(timeStr) {
  if (!timeStr) return null;
  const parts = timeStr.split(':');
  let hours = parseInt(parts[0], 10);
  hours = hours % 24;
  const suffix = hours >= 12 ? 'pm' : 'am';
  const displayHour = hours === 0 ? 12 : hours > 12 ? hours - 12 : hours;
  return `${displayHour}${suffix}`;
}

// Format service period for a day type (e.g., "5am-11pm")
function formatServicePeriod(firstDeparture, lastDeparture) {
  const first = formatTime(firstDeparture);
  const last = formatTime(lastDeparture);
  if (!first || !last) return null;
  return `${first}-${last}`;
}

// Get service periods HTML for a route
function getServicePeriodsHtml(route) {
  const periods = [];
  const dayTypes = [
    { icon: '&#128188;', label: 'Weekday', first: route.weekday_first_departure, last: route.weekday_last_departure },
    { icon: '&#128197;', label: 'Sat', first: route.saturday_first_departure, last: route.saturday_last_departure },
    { icon: '&#9728;', label: 'Sun', first: route.sunday_first_departure, last: route.sunday_last_departure }
  ];

  for (const day of dayTypes) {
    const period = formatServicePeriod(day.first, day.last);
    if (period) {
      periods.push(`
        <span class="service-period" title="${day.label}">
          <span class="day-icon">${day.icon}</span>
          <span class="period-time">${period}</span>
        </span>
      `);
    }
  }

  if (periods.length === 0) return '';
  return `<div class="service-periods">${periods.join('')}</div>`;
}

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
    const servicePeriodsHtml = getServicePeriodsHtml(route);
    routesList.innerHTML += `
      <div class="route-item">
        <h3>${route.route_short_name || route.route_id}: ${route.route_long_name || ''}</h3>
        <p>Type: ${route.route_type}</p>
        ${servicePeriodsHtml}
      </div>
    `;
  }
}
