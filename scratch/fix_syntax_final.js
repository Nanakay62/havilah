const fs = require('fs');
let html = fs.readFileSync('C:/Users/nanak/Desktop/copsoqu/private/app/dashboard.html', 'utf8');

const badStart = html.indexOf('const recList = document.getElementById(\'recommendedList\');');
const badEnd = html.indexOf('const marker = document.getElementById(\'balanceMarker\');');

const correctBlock = `const recList = document.getElementById('recommendedList');
      if (recList) {
        recList.innerHTML = '';
        const resources = [
          { title: "Managing work-related stress", meta: "Article • 5 min read", icon: '<path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/>' },
          { title: "Box breathing exercise", meta: "Audio • 3 mins", icon: '<path d="M3 18v-6a9 9 0 0 1 18 0v6"/><path d="M21 19a2 2 0 0 1-2 2h-1a2 2 0 0 1-2-2v-3a2 2 0 0 1 2-2h3zM3 19a2 2 0 0 0 2 2h1a2 2 0 0 0 2-2v-3a2 2 0 0 0-2-2H3z"/>' }
        ];
        resources.forEach(r => {
          recList.innerHTML += \`<a href="#" class="resource-item" onclick="App.openResources()">
            <div class="resource-thumb" style="background: var(--accent);"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">\${r.icon}</svg></div>
            <div class="resource-info">
              <div class="resource-title">\${r.title}</div>
              <div class="resource-meta">\${r.meta}</div>
            </div>
          </a>\`;
        });
      }
      `;

html = html.substring(0, badStart) + correctBlock + html.substring(badEnd);
fs.writeFileSync('C:/Users/nanak/Desktop/copsoqu/private/app/dashboard.html', html);
