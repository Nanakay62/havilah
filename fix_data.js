const fs = require('fs');
let dataJs = fs.readFileSync('js/data.js', 'utf8');

dataJs += `

  // Export to global scope
  window.phq9 = phq9;
  window.gad7 = gad7;
  window.pss10 = pss10;
  window.fas10 = fas10;
  window.copsoq3_core = copsoq3_core;
  window.copsoq3_middle = copsoq3_middle;
  window.copsoq3_long = copsoq3_long;
  window.COPSOQ3_CORE_MAPPINGS = COPSOQ3_CORE_MAPPINGS;

  return {
    phq9: phq9,
    gad7: gad7,
    pss10: pss10,
    fas10: fas10,
    copsoq3_core: copsoq3_core,
    copsoq3_middle: copsoq3_middle,
    copsoq3_long: copsoq3_long,
    COPSOQ3_CORE_MAPPINGS: COPSOQ3_CORE_MAPPINGS
  };
})();
`;

fs.writeFileSync('js/data.js', dataJs);
console.log("Successfully fixed data.js exports!");
