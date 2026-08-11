const jsdom = require("jsdom");
const { JSDOM } = jsdom;
const fs = require('fs');

let html = fs.readFileSync('private/app/dashboard.html', 'utf8');
const dataJs = fs.readFileSync('js/data.js', 'utf8');

// replace the script tags with inline scripts
html = html.replace(/<script src="\/js\/data\.js\?v=\d+"><\/script>/, '<script>' + dataJs + '</script>');

// remove others that might cause 404
html = html.replace(/<script src="\/js\/auth\.js"><\/script>/, '');
html = html.replace(/<script src="\/js\/router\.js"><\/script>/, '');

const virtualConsole = new jsdom.VirtualConsole();
virtualConsole.on("error", (err) => { console.error("JSDOM Error:", err); });
virtualConsole.on("jsdomError", (err) => { console.error("JSDOM jsdomError:", err); });
virtualConsole.on("log", (msg) => { console.log("JSDOM Log:", msg); });

const dom = new JSDOM(html, { 
    runScripts: "dangerously", 
    virtualConsole: virtualConsole,
    url: "http://localhost/"
});

setTimeout(() => {
    console.log("Checking if surveysGrid is populated...");
    const grid = dom.window.document.getElementById('surveysGrid');
    if (grid) {
        console.log("surveysGrid innerHTML length: ", grid.innerHTML.length);
    } else {
        console.log("surveysGrid not found!");
    }
}, 2000);
