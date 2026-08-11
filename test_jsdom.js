const jsdom = require("jsdom");
const { JSDOM } = jsdom;
const fs = require('fs');

const html = fs.readFileSync('private/app/dashboard.html', 'utf8');

const virtualConsole = new jsdom.VirtualConsole();
virtualConsole.on("error", (err) => { console.error("JSDOM Error:", err); });
virtualConsole.on("jsdomError", (err) => { console.error("JSDOM jsdomError:", err); });
virtualConsole.on("log", (msg) => { console.log("JSDOM Log:", msg); });

const dom = new JSDOM(html, { 
    runScripts: "dangerously", 
    virtualConsole: virtualConsole,
    url: "http://localhost/",
    resources: "usable"
});

setTimeout(() => {
    console.log("Checking if surveysGrid is populated...");
    const grid = dom.window.document.getElementById('surveysGrid');
    if (grid) {
        console.log("surveysGrid innerHTML length: ", grid.innerHTML.length);
        if (grid.innerHTML.length === 0) {
            console.log("SURVEYS GRID IS EMPTY!");
        } else {
            console.log("SURVEYS GRID HAS CONTENT.");
        }
    } else {
        console.log("surveysGrid not found!");
    }
}, 2000);
