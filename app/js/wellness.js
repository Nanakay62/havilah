// private/app/js/wellness.js

document.addEventListener('DOMContentLoaded', () => {
  // We use a MutationObserver because dashboard.html renders the gauges dynamically.
  const observer = new MutationObserver(() => {
    const gauges = document.querySelectorAll('.wb-dim');
    if (gauges.length === 0) return; // Not rendered yet

    let anomalyDetected = false;
    let criticalLabels = [];

    gauges.forEach(gauge => {
      // Find the value and the label from the DOM
      const divs = gauge.querySelectorAll('div');
      let valText = null;
      let labelText = null;

      divs.forEach(div => {
        const text = div.textContent.trim();
        if (/^\d+$/.test(text)) {
          valText = text;
        } else if (text && text.length > 1 && !/^\d+$/.test(text)) {
          labelText = text;
        }
      });

      if (valText && parseInt(valText) < 50) {
        anomalyDetected = true;
        if (labelText) criticalLabels.push(labelText.toLowerCase());
      }
    });

    if (anomalyDetected) {
      // Find the resource cards container or specific cards
      const resourcesList = document.getElementById('recommendedList');
      if (resourcesList) {
        // Highlight the parent container
        resourcesList.classList.add('anomaly-alert');
        
        // Add a high-visibility header or styling
        if (!document.getElementById('anomaly-warning')) {
          const warning = document.createElement('div');
          warning.id = 'anomaly-warning';
          warning.style.color = '#E5646E';
          warning.style.fontWeight = 'bold';
          warning.style.marginBottom = '12px';
          warning.style.padding = '12px';
          warning.style.backgroundColor = 'rgba(229,100,110,0.1)';
          warning.style.borderRadius = '8px';
          warning.style.border = '1px solid #E5646E';
          warning.textContent = `Warning: Score dropped below threshold in ${criticalLabels.join(', ')}. Recommended exercises prioritized below.`;
          resourcesList.parentNode.insertBefore(warning, resourcesList);
        }

        // Add a layout class to top-pin / highlight the cards
        const items = resourcesList.querySelectorAll('.resource-item');
        items.forEach(item => {
          item.classList.add('recommended-card');
          item.style.borderColor = '#E5646E';
          item.style.borderWidth = '2px';
          item.style.boxShadow = '0 0 10px rgba(229,100,110,0.3)';
        });
      }
    }

    // We only need to run this once after the gauges render.
    // If the data updates dynamically later, we could keep it running, 
    // but we can safely disconnect if it's a one-time check per load.
  });

  observer.observe(document.body, { childList: true, subtree: true });
});
