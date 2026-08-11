const fs = require('fs');

let html = fs.readFileSync('private/portal/hr.html', 'utf8');

// 1. Inject the necessary utility classes into the <style> block
const utilitiesCSS = `
  /* Heatmap Utilities */
  .bg-white { background-color: #FFFFFF; }
  .rounded-2xl { border-radius: 16px; }
  .p-6 { padding: 24px; }
  .shadow-sm { box-shadow: 0 1px 2px rgba(0,0,0,0.05); }
  .border { border: 1px solid var(--border); }
  .border-slate-100 { border-color: #f1f5f9; }
  .mt-6 { margin-top: 24px; }
  .overflow-hidden { overflow: hidden; }
  .overflow-x-auto { overflow-x: auto; }
  .w-full { width: 100%; }
  .border-separate { border-collapse: separate; }
  table.border-separate { border-spacing: 8px 8px; } /* Combined spacing */
  .text-left { text-align: left; }
  .text-\\[11px\\] { font-size: 11px; }
  .font-bold { font-weight: 700; }
  .text-slate-400 { color: #94a3b8; }
  .uppercase { text-transform: uppercase; }
  .tracking-widest { letter-spacing: 0.1em; }
  .p-3 { padding: 12px; }
  .w-1\\/5 { width: 20%; }
  .text-center { text-align: center; }
  .font-semibold { font-weight: 600; }
  .h-14 { height: 56px; }
  .pr-4 { padding-right: 16px; }
  .text-slate-700 { color: #334155; }
  .text-sm { font-size: 14px; }
  .align-middle { vertical-align: middle; }
  .whitespace-nowrap { white-space: nowrap; }
  .p-0 { padding: 0; }
  .h-12 { height: 48px; }
  .flex { display: flex; }
  .items-center { align-items: center; }
  .justify-center { justify-content: center; }
  .rounded-xl { border-radius: 12px; }
  .transition-transform { transition-property: transform; }
  .duration-150 { transition-duration: 150ms; }
  .hover\\:scale-\\[1\\.01\\]:hover { transform: scale(1.02); cursor: pointer; }
  
  .bg-\\[\\#52B788\\] { background-color: #52B788; }
  .bg-\\[\\#74C69D\\] { background-color: #74C69D; }
  .bg-\\[\\#E9A944\\] { background-color: #E9A944; }
  .bg-\\[\\#E56B6F\\] { background-color: #E56B6F; }
  .bg-\\[\\#B53540\\] { background-color: #B53540; }
  .text-white { color: white; }
`;

html = html.replace('</style>', utilitiesCSS + '\n</style>');

// 2. Ensure exact HTML layout is in place
const exactHTML = `
<!-- Main Heatmap Card Panel Container -->
<div class="bg-white rounded-2xl p-6 shadow-sm border border-slate-100 mt-6 overflow-hidden">
  <div class="overflow-x-auto">
    <!-- border-separate and border-spacing handle the crisp spacing between grid cells -->
    <table class="w-full border-separate border-spacing-y-2 border-spacing-x-2 text-left">
      <thead>
        <tr class="text-[11px] font-bold text-slate-400 uppercase tracking-widest">
          <!-- Width designated to give the department names breathing room -->
          <th class="p-3 w-1/5"></th> 
          <th class="p-3 text-center font-semibold">Mood</th>
          <th class="p-3 text-center font-semibold">Calm</th>
          <th class="p-3 text-center font-semibold">Stress</th>
          <th class="p-3 text-center font-semibold">Energy</th>
          <th class="p-3 text-center font-semibold">Sleep</th>
          <th class="p-3 text-center font-semibold">Work-Fit</th>
          <th class="p-3 text-center font-semibold">Social</th>
        </tr>
      </thead>
      <!-- CRITICAL: Make sure this ID is attached to the tbody, NOT a generic div -->
      <tbody id="heatmapTableBody">
        <!-- Rows will build out here properly -->
      </tbody>
    </table>
  </div>
</div>
`;

// It might already be partly there from previous step, let's just replace the whole block again to be safe
const oldContainerRegex = /<div class="bg-white rounded-2xl[^>]*>[\s\S]*?<tbody id="heatmapTableBody">[\s\S]*?<\/tbody>\s*<\/table>\s*<\/div>\s*<\/div>/;
html = html.replace(oldContainerRegex, exactHTML.trim());


// 3. Re-write the renderHeatmap function to EXACTLY match user's code, incorporating the mockData since backend endpoint is dummy
// Note: We need mockData since the real endpoint returns empty in this prototype.
const newRenderHeatmap = `
// Function to handle the exact hex color code mapping for the risk blocks
function getRiskBrickColor(score) {
  if (score <= 35) return 'bg-[#52B788] text-white'; // Deep Green
  if (score <= 39) return 'bg-[#74C69D] text-white'; // Light Sage Green
  if (score <= 49) return 'bg-[#E9A944] text-white'; // Amber Orange
  if (score <= 59) return 'bg-[#E56B6F] text-white'; // Salmon Pink
  return 'bg-[#B53540] text-white';                 // Crimson Red
}

async function renderHeatmap() {
  try {
    const container = document.getElementById('heatmapTableBody');
    if (!container) return;
    container.innerHTML = ''; // Reset container cleanly

    // We use mockData because the backend hasn't been seeded yet in this prototype
    const mockData = [
      { department: 'Engineering', meetsNSize: true, scores: { mood: 22, calm: 28, stress: 35, energy: 40, sleep: 32, workFit: 18, social: 25 } },
      { department: 'Sales', meetsNSize: true, scores: { mood: 45, calm: 52, stress: 68, energy: 58, sleep: 48, workFit: 38, social: 55 } },
      { department: 'Operations', meetsNSize: true, scores: { mood: 38, calm: 42, stress: 48, energy: 44, sleep: 50, workFit: 32, social: 41 } },
      { department: 'Human Resources', meetsNSize: true, scores: { mood: 28, calm: 30, stress: 32, energy: 35, sleep: 28, workFit: 22, social: 26 } },
      { department: 'Finance', meetsNSize: true, scores: { mood: 32, calm: 36, stress: 40, energy: 42, sleep: 38, workFit: 28, social: 34 } },
      { department: 'Marketing', meetsNSize: true, scores: { mood: 25, calm: 30, stress: 38, energy: 36, sleep: 30, workFit: 24, social: 29 } },
      { department: 'Customer Success', meetsNSize: true, scores: { mood: 42, calm: 48, stress: 55, energy: 50, sleep: 46, workFit: 35, social: 44 } }
    ];

    mockData.forEach(dept => {
      // 1. Open a clean row tag and inject the left-aligned department name element
      let rowHtml = \`
        <tr class="h-14">
          <td class="pr-4 font-bold text-slate-700 text-sm align-middle whitespace-nowrap">\${dept.department}</td>
      \`;

      // 2. Map all 7 exact dimensions matching your mockup view image layout
      const trackedDimensions = ['mood', 'calm', 'stress', 'energy', 'sleep', 'workFit', 'social'];

      trackedDimensions.forEach(dim => {
        const score = dept.scores[dim] || 0;
        const colorClass = getRiskBrickColor(score);

        // 3. Wrap each numeric score element cleanly inside centralized cell elements
        rowHtml += \`
          <td class="p-0 text-center align-middle">
            <div class="w-full h-12 flex items-center justify-center font-bold rounded-xl text-sm transition-transform duration-150 hover:scale-[1.01] shadow-sm \${colorClass}">
              \${score}
            </div>
          </td>
        \`;
      });

      rowHtml += '</tr>';
      container.innerHTML += rowHtml; // Append row matrix element block
    });
  } catch (err) {
    console.error('Heatmap grid alignment engine error:', err);
  }
}
`;

// Replace old renderHeatmap with new one
const renderHeatmapRegex = /async function renderHeatmap\(\) \{[\s\S]*?\}\s*function renderDeptList/g;
html = html.replace(renderHeatmapRegex, newRenderHeatmap + '\n\n  function renderDeptList');

// Write back to file
fs.writeFileSync('private/portal/hr.html', html, 'utf8');
console.log('Successfully injected utilities, layout, and renderHeatmap logic!');
