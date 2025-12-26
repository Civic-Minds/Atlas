const agenciesList = document.getElementById('agenciesList');

// Load checks from localStorage
const CHECKS = JSON.parse(localStorage.getItem('transit-checks') || '[]');

// Group checks by agency
const agenciesMap = new Map();
for (const check of CHECKS) {
  if (!agenciesMap.has(check.agency.id)) {
    agenciesMap.set(check.agency.id, {
      agency: check.agency,
      checks: []
    });
  }
  agenciesMap.get(check.agency.id).checks.push(check);
}

if (agenciesMap.size === 0) {
  agenciesList.innerHTML = '<p>No agencies imported yet. <a href="/import.html">Import checks</a> to get started.</p>';
} else {
  for (const [id, data] of agenciesMap) {
    const latestCheck = data.checks[data.checks.length - 1];
    agenciesList.innerHTML += `
      <div class="agency-item">
        <h2>${data.agency.name}</h2>
        <p>Checks: ${data.checks.length}</p>
        <p>Latest: ${new Date(latestCheck.check.created_at).toLocaleDateString()}</p>
        <p>Routes: ${latestCheck.routes.length}</p>
        <a href="/agency.html?id=${id}">View Details</a>
      </div>
    `;
  }
}
