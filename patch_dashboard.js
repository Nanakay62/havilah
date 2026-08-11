const fs = require('fs');
let html = fs.readFileSync('private/app/dashboard.html', 'utf8');

const recommendedHtml = `
      const recList = document.getElementById('recommendedList');
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

html = html.replace("    renderEmployeeDashboard();", recommendedHtml + "\n    renderEmployeeDashboard();");

const replacementReturn = `
  return {
    navigate,
    openSurvey,
    closeSurvey,
    surveyNext,
    surveyBack,
    openResources: () => { openModal('resBackdrop'); document.getElementById('resPanel').classList.add('open'); },
    closeResources: () => { closeModal('resBackdrop'); document.getElementById('resPanel').classList.remove('open'); },
    openProfileSettings: () => {},
    openSettings: () => {},
    openHelp: () => {},
    openKeyboardShortcuts: () => {},
    signOut: () => { window.location.href = '/'; },
    closeNotifications: () => {
      document.getElementById('notifPanel').classList.remove('open');
      closeModal('notifBackdrop');
    },
    toggleNotifications: () => {
      const panel = document.getElementById('notifPanel');
      if (panel.classList.contains('open')) {
        panel.classList.remove('open');
        closeModal('notifBackdrop');
      } else {
        panel.classList.add('open');
        openModal('notifBackdrop');
        const badge = document.getElementById('notifBadge');
        if (badge) badge.style.display = 'none';
      }
    },
    openSearch: () => {
      const modal = document.getElementById('cmdPalette');
      if(modal) {
        modal.classList.add('open');
        openModal('cmdBackdrop');
        setTimeout(() => document.getElementById('cmdInput').focus(), 100);
      }
    },
    closeSearch: () => {
      document.getElementById('cmdPalette').classList.remove('open');
      closeModal('cmdBackdrop');
    },
    toggleProfileDropdown: () => {
      const dropdown = document.getElementById('profileDropdown');
      if(dropdown) dropdown.classList.toggle('open');
    },
    markAllRead: () => {},
    closeGeneric: () => {}
  };
})();`;

let cutIdx = html.indexOf("  return {\n    navigate,");
if (cutIdx === -1) {
  cutIdx = html.indexOf("  return {\r\n    navigate,");
}
if (cutIdx === -1) {
  cutIdx = html.indexOf("  return {");
}

html = html.substring(0, cutIdx) + replacementReturn + "\n</script>\n</body>\n</html>";

fs.writeFileSync('private/app/dashboard.html', html);
console.log("Patched dashboard.html!");
