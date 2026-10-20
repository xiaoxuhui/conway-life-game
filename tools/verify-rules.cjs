"use strict";

// Independent dense oracle: never uses the engine's parser or neighbor counts.
const assert = require("node:assert/strict");
const Life = require("../scripts/life-engine.js");

function verifyRules() {
  const rules = [
    ...Array.from({ length: 8 }, (_, i) => ({ birth: String(i + 1), survival: "" })),
    ...Array.from({ length: 9 }, (_, i) => ({ birth: "", survival: String(i) })),
    { birth: "", survival: "" }, { birth: "12345678", survival: "012345678" },
    { birth: "3", survival: "23" }, { birth: "23", survival: "3" }, { birth: "36", survival: "23" },
  ];
  let transitions = 0;
  for (const { birth, survival } of rules) {
    const rule = `B${birth}/S${survival}`;
    for (let layout = 0; layout < 512; layout += 1) {
      const cells = new Set();
      for (let i = 0; i < 9; i += 1) {
        if (layout & (1 << i)) cells.add(`${Math.floor(i / 3) - 1},${i % 3 - 1}`);
      }
      const expected = new Set();
      for (let row = -2; row <= 2; row += 1) {
        for (let column = -2; column <= 2; column += 1) {
          let neighbors = 0;
          for (let dr = -1; dr <= 1; dr += 1) {
            for (let dc = -1; dc <= 1; dc += 1) {
              if ((dr || dc) && cells.has(`${row + dr},${column + dc}`)) neighbors += 1;
            }
          }
          const key = `${row},${column}`;
          if ((cells.has(key) ? survival : birth).includes(String(neighbors))) expected.add(key);
        }
      }
      assert.deepEqual(Life.nextCellSet(cells, rule), expected, `${rule}, layout=${layout}`);
      transitions += 1;
    }
  }
  return { rules: rules.length, neighborhoods: 512, transitions };
}

if (require.main === module) console.log(JSON.stringify(verifyRules()));
module.exports = { verifyRules };
