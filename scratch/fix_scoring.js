const fs = require('fs');
let html = fs.readFileSync('private/app/dashboard.html', 'utf8');

// Find completeSurvey
const startIndex = html.indexOf('  function completeSurvey() {');
const endIndex = html.indexOf('    function renderEmployeeDashboard() {');

const replacement = `  function completeSurvey() {
      let rawScore = 0;
      let maxScore = 0;
      let dimensionName = '';
      const sType = state.surveyState.type;
      const ans = state.surveyState.answers;
      
      if (sType === 'phq9') {
        rawScore = ans.reduce((a, b) => a + b, 0);
        maxScore = 27;
        dimensionName = 'Mood';
      } else if (sType === 'gad7') {
        rawScore = ans.reduce((a, b) => a + b, 0);
        maxScore = 21;
        dimensionName = 'Calm';
      } else if (sType === 'pss10') {
        const rev = [3, 4, 6, 7];
        rawScore = ans.reduce((acc, val, i) => acc + (rev.includes(i) ? (4 - val) : val), 0);
        maxScore = 40;
        dimensionName = 'Stress';
      } else if (sType === 'fas10') {
        const rev = [3, 9];
        rawScore = ans.reduce((acc, val, i) => acc + (rev.includes(i) ? (6 - val) : val), 0);
        maxScore = 50;
        dimensionName = 'Energy';
      } else if (sType.startsWith('copsoq3')) {
        rawScore = ans.reduce((a, b) => a + b, 0) / (ans.length || 1);
        maxScore = 100;
        dimensionName = 'Work-fit';
      }
      
      let normalized = 0;
      if (sType === 'fas10') {
        normalized = 100 - ((rawScore - 10) / 40 * 100);
      } else if (sType.startsWith('copsoq3')) {
        normalized = rawScore;
      } else {
        normalized = 100 - (rawScore / maxScore * 100);
      }
      normalized = Math.round(normalized);
      
      const dimObj = state.wellbeing.dimensions.find(d => d.label === dimensionName);
      if (dimObj) {
        dimObj.value = normalized;
        if (normalized >= 70) dimObj.status = 'healthy';
        else if (normalized >= 40) dimObj.status = 'moderate';
        else dimObj.status = 'at-risk';
      }
      
      state.wellbeing.score = Math.round(state.wellbeing.dimensions.reduce((acc, d) => acc + d.value, 0) / state.wellbeing.dimensions.length);
      state.wellbeing.marker = state.wellbeing.score;
      
      if (window.employeeTrendChartInstance) {
        window.employeeTrendChartInstance.data.labels.push('Just Now');
        window.employeeTrendChartInstance.data.datasets[0].data.push(state.wellbeing.score);
        if (window.employeeTrendChartInstance.data.labels.length > 5) {
          window.employeeTrendChartInstance.data.labels.shift();
          window.employeeTrendChartInstance.data.datasets[0].data.shift();
        }
        window.employeeTrendChartInstance.update();
      }

      document.getElementById('modalProgress').style.width = '100%';
      document.getElementById('modalQText').innerHTML = \`<div style="text-align:center; padding: 40px 0;">
        <svg viewBox="0 0 24 24" fill="none" stroke="#4FB286" stroke-width="2" style="width: 64px; height: 64px; margin-bottom: 20px;"><path stroke-linecap="round" stroke-linejoin="round" d="M5 13l4 4L19 7"></path></svg>
        <h3 style="font-size: 1.5rem; margin-bottom: 10px;">Check-in Complete</h3>
        <p style="color: var(--text-2); margin-bottom: 5px;">Your secure response has been recorded.</p>
        <p style="font-weight: 500; font-size: 1.1rem; color: var(--text-1); margin-top: 10px;">Raw Score: \${Math.round(rawScore)} \${maxScore ? '/ ' + maxScore : ''}</p>
        <button class="btn btn-primary" style="margin-top: 24px;" onclick="App.closeSurvey()">Done</button>
      </div>\`;
      document.getElementById('modalOptions').innerHTML = '';
      document.getElementById('modalBack').style.display = 'none';
      document.getElementById('modalNext').style.display = 'none';
      document.getElementById('modalQNum').style.display = 'none';
      
      state.surveyProgress[state.surveyState.type].completed = true;
      renderEmployeeDashboard();
    }
`;

html = html.substring(0, startIndex) + replacement + html.substring(endIndex);
fs.writeFileSync('private/app/dashboard.html', html);
