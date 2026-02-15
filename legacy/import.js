const fileInput = document.getElementById('fileInput');
const importResults = document.getElementById('importResults');
const checksList = document.getElementById('checksList');

// Load checks from localStorage
let CHECKS = JSON.parse(localStorage.getItem('transit-checks') || '[]');

fileInput.addEventListener('change', async (e) => {
  const files = Array.from(e.target.files);

  for(const file of files){
    const text = await file.text();
    const data = JSON.parse(text);

    // Validate schema
    if(!data.schema_version || !data.check || !data.routes){
      alert(`Invalid file: ${file.name}`);
      continue;
    }

    // Add to checks
    CHECKS.push(data);

    importResults.innerHTML += `<p>Imported ${data.agency.name} (${data.check.created_at})</p>`;
  }

  // Save to localStorage
  localStorage.setItem('transit-checks', JSON.stringify(CHECKS));

  // Save to /data/checks/ (requires backend or manual copy)
  alert('Checks imported! Copy JSON files to /data/checks/ for permanent storage.');

  renderChecksList();
});

function renderChecksList(){
  checksList.innerHTML = '<h2>Imported Checks</h2>';

  for(const check of CHECKS){
    checksList.innerHTML += `
      <div class="check-item">
        <h3>${check.agency.name}</h3>
        <p>Analyzed: ${new Date(check.check.created_at).toLocaleDateString()}</p>
        <p>Routes: ${check.routes.length}</p>
        <a href="/agency.html?id=${check.agency.id}">View Agency</a>
      </div>
    `;
  }
}

renderChecksList();
