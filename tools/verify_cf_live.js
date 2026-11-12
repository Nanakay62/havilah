fetch('https://havilah.dic20016.workers.dev/', { headers: { 'Cache-Control': 'no-cache' } })
  .then((r) => r.text())
  .then((t) => {
    console.log('Live Length:', t.length);
    console.log('Live H1:', t.match(/<h1[^>]*>([^<]+)<\/h1>/i)?.[1]);
    console.log('Includes portal-showcase:', t.includes('portal-showcase'));
    console.log('Includes portalMorph.js:', t.includes('portalMorph.js'));
    console.log('Includes heroViz.js:', t.includes('heroViz.js'));
    console.log('Includes Take a moment:', t.includes('Take a moment'));
  })
  .catch((e) => console.error(e));
