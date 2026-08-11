const fs = require('fs');

let html = fs.readFileSync('private/portal/hr.html', 'utf8');

const newContainer = `
<div class="bg-white rounded-2xl p-8 shadow-sm border border-slate-100 overflow-hidden">
  <div class="overflow-x-auto">
    <table class="w-full border-separate border-spacing-y-3 border-spacing-x-3 text-left">
      <thead>
        <tr class="text-[11px] font-bold text-slate-400 uppercase tracking-widest">
          <th class="p-3 w-1/5"></th> 
          <th class="p-3 text-center font-semibold tracking-wider">Mood</th>
          <th class="p-3 text-center font-semibold tracking-wider">Calm</th>
          <th class="p-3 text-center font-semibold tracking-wider">Stress</th>
          <th class="p-3 text-center font-semibold tracking-wider">Energy</th>
          <th class="p-3 text-center font-semibold tracking-wider">Sleep</th>
          <th class="p-3 text-center font-semibold tracking-wider">Work-Fit</th>
          <th class="p-3 text-center font-semibold tracking-wider">Social</th>
        </tr>
      </thead>
      <tbody id="heatmapTableBody">
      </tbody>
    </table>
  </div>
</div>
`;

html = html.replace('<div class="heatmap" id="heatmap"></div>', newContainer);

fs.writeFileSync('private/portal/hr.html', html, 'utf8');
console.log('Successfully injected the heatmap table layout!');
