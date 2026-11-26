(function exposeGliderTools(root, factory) {
  const isNode = typeof module === "object" && module.exports;
  const api = factory(isNode ? require("./life-engine.js") : root.LifeEngine,
    isNode ? require("./presets.js") : root.LifePresets);
  if (isNode) module.exports = api;
  else root.GliderTools = api;
})(globalThis, function createGliderTools(Life, Presets) {
  "use strict";

  function bounds(cells) {
    return Life.bounds(Life.createWorld(cells));
  }

  function normalize(cells) {
    const box = bounds(cells);
    if (!box) throw new Error("请先放置需要转换的图案。");
    return cells.map(([r, c]) => [r - box.minRow, c - box.minColumn]);
  }

  function signature(cells) {
    return normalize(cells).map(([r, c]) => r + "," + c).sort().join(";");
  }

  function advance(cells, generations) {
    let world = Life.createWorld(cells);
    for (let generation = 0; generation < generations; generation += 1) world = Life.nextGeneration(world);
    return Life.aliveCoordinates(world);
  }

  function makePattern(cells, name, description, extra = {}) {
    const normalized = normalize(cells);
    const box = bounds(normalized);
    return { name, description, cells: normalized, width: box.maxColumn + 1, height: box.maxRow + 1, ...extra };
  }

  function parsePeriod(value) {
    const period = Number(value);
    if (!Number.isSafeInteger(period) || period < 60 || period % 60 !== 0) {
      throw new Error("测试输入周期须为不小于 60 的安全整数，并且是 60 的倍数。");
    }
    return period;
  }

  function componentPattern(pattern, value) {
    if (!pattern.component?.input) return pattern;
    const period = parsePeriod(value);
    const { input, delta } = pattern.component;
    const cells = [...pattern.cells];
    for (let pulse = 1; pulse < 3; pulse += 1) {
      const distance = pulse * period / 4;
      cells.push(...input.map(([r, c]) => [r - delta[0] * distance, c - delta[1] * distance]));
    }
    return makePattern(cells, pattern.name, pattern.description +
      `。附 3 枚测试滑翔机，输入间隔 ${period} 代。`);
  }

  const RECIPES = [
    {
      name: "方块", generation: 68, target: [[2, 1], [2, 2], [3, 1], [3, 2]],
      second: [[-17, 22], [-16, 21], [-18, 20], [-17, 20], [-16, 20]],
    },
    {
      name: "闪烁器", generation: 92, target: [[5, 5], [6, 5], [7, 5]],
      second: [[-17, 23], [-16, 22], [-18, 21], [-17, 21], [-16, 21]],
    },
    {
      name: "蜂巢", generation: 71, target: [[2, 2], [2, 3], [3, 1], [3, 4], [4, 2], [4, 3]],
      second: [[-19, 21], [-18, 20], [-17, 22], [-17, 21], [-17, 20]],
    },
    {
      name: "面包", generation: 72, target: [[0, 4], [1, 3], [1, 5], [2, 3], [2, 6], [3, 4], [3, 5]],
      second: [[19, 22], [18, 21], [20, 20], [19, 20], [18, 20]],
    },
    {
      name: "小船", generation: 72, target: [[1, 3], [1, 4], [2, 3], [2, 5], [3, 4]],
      second: [[20, 23], [20, 21], [19, 22], [19, 21], [18, 22]],
    },
  ];
  const FIRST_GLIDER = [[-16, -15], [-15, -14], [-14, -16], [-14, -15], [-14, -14]];

  function transform(cells, orientation) {
    return cells.map(([row, column]) => {
      let r = row;
      let c = orientation >= 4 ? -column : column;
      for (let turn = 0; turn < orientation % 4; turn += 1) [r, c] = [c, -r];
      return [r, c];
    });
  }

  function gliderDelta(cells) {
    const before = bounds(cells);
    const next = advance(cells, 4);
    const after = bounds(next);
    if (!after || signature(cells) !== signature(next)) return null;
    const delta = [after.minRow - before.minRow, after.minColumn - before.minColumn];
    return Math.abs(delta[0]) === 1 && Math.abs(delta[1]) === 1 ? delta : null;
  }

  function findRecipe(cells) {
    if (!cells.length) throw new Error("请先放置需要转换的图案。");
    if (cells.length > 7) throw new Error("尚无这个图案的滑翔机合成配方。目前支持方块、闪烁器、蜂巢、面包、小船和单枚滑翔机。");
    if (cells.length === 5 && gliderDelta(cells)) {
      return { name: "滑翔机", generation: 112, gliders: [normalize(cells)], target: advance(normalize(cells), 112) };
    }
    const wanted = signature(cells);
    for (const recipe of RECIPES) {
      for (let orientation = 0; orientation < 8; orientation += 1) {
        const target = transform(recipe.target, orientation);
        if (signature(target) === wanted) {
          return {
            name: recipe.name, generation: recipe.generation, target,
            gliders: [transform(FIRST_GLIDER, orientation), transform(recipe.second, orientation)],
          };
        }
      }
    }
    throw new Error("尚无这个图案的滑翔机合成配方。目前支持方块、闪烁器、蜂巢、面包、小船和单枚滑翔机。");
  }

  function connectedGroups(cells) {
    const remaining = new Set(cells.map(String));
    const groups = [];
    while (remaining.size) {
      const key = remaining.values().next().value;
      remaining.delete(key);
      const queue = [key];
      const group = [];
      while (queue.length) {
        const [row, column] = queue.pop().split(",").map(Number);
        group.push([row, column]);
        for (let dr = -1; dr <= 1; dr += 1) {
          for (let dc = -1; dc <= 1; dc += 1) {
            const neighbor = (row + dr) + "," + (column + dc);
            if (remaining.delete(neighbor)) queue.push(neighbor);
          }
        }
      }
      groups.push(group);
    }
    return groups;
  }

  const gunCache = new Map();
  function emittersAt(glider, delay) {
    const wanted = signature(glider);
    if (!gunCache.has(delay)) {
      const emitters = [];
      let phased = Presets.getPreset("glider-gun-p60").cells;
      for (let phase = 0; phase < 4; phase += 1) {
        const output = connectedGroups(advance(phased, delay))
          .filter((group) => group.length === 5 && gliderDelta(group)?.join() === "1,1")
          .sort((a, b) => bounds(b).maxRow - bounds(a).maxRow)[0];
        if (output) {
          for (let orientation = 0; orientation < 8; orientation += 1) {
            emitters.push({ cells: transform(phased, orientation), output: transform(output, orientation) });
          }
        }
        phased = advance(phased, 1);
      }
      gunCache.set(delay, emitters);
    }
    const to = bounds(glider);
    return gunCache.get(delay).filter(({ output }) => signature(output) === wanted).map((emitter) => {
      const from = bounds(emitter.output);
      return emitter.cells.map(([r, c]) => [r + to.minRow - from.minRow, c + to.minColumn - from.minColumn]);
    });
  }

  async function synthesize(cells, { guns = false, period = 60 } = {}) {
    const recipe = findRecipe(cells);
    if (guns && Number(period) !== 60) throw new Error("当前配套枪为固定 60 周期，请将周期设为 60。");
    const delays = guns ? [120, 240, 480] : [0];
    for (const delay of delays) {
      await new Promise((resolve) => setTimeout(resolve, 0));
      const choices = guns ? recipe.gliders.map((glider) => emittersAt(glider, delay)) : recipe.gliders.map((g) => [g]);
      const combinations = choices.reduce((sets, options) => sets.flatMap((set) => options.map((option) => [...set, option])), [[]]);
      for (const sources of combinations) {
        const initial = sources.flat();
        let world = Life.createWorld(initial);
        const generation = delay + recipe.generation;
        for (let step = 0; step < generation; step += 1) {
          if (step % 24 === 0) await new Promise((resolve) => setTimeout(resolve, 0));
          world = Life.nextGeneration(world);
        }
        const expected = new Set(recipe.target.map(String));
        const region = bounds(recipe.target);
        const matches = (guns || world.cells.size === expected.size) &&
          [...expected].every((key) => world.cells.has(key)) &&
          Life.aliveCoordinates(world).every(([r, c]) =>
            expected.has(r + "," + c) || r < region.minRow - 2 || r > region.maxRow + 2 ||
            c < region.minColumn - 2 || c > region.maxColumn + 2);
        if (!matches) continue;
        if (guns && sources.some((source) => {
          const sourceBounds = bounds(source);
          const inBody = ([r, c]) => r >= sourceBounds.minRow && r <= sourceBounds.maxRow &&
            c >= sourceBounds.minColumn && c <= sourceBounds.maxColumn;
          const reference = new Set(advance(source, generation).filter(inBody).map(String));
          const actual = Life.aliveCoordinates(world).filter(inBody);
          return actual.length !== reference.size || actual.some((cell) => !reference.has(String(cell)));
        })) continue;
        const box = bounds(initial);
        return makePattern(initial, recipe.name + (guns ? " · 滑翔机与配套枪" : " · 滑翔机合成"),
          `${recipe.gliders.length} 路滑翔机，第 ${generation} 代生成${recipe.name}。` +
            (guns ? "枪体每 60 代继续发射，后续脉冲会继续与目标作用。" : ""),
          {
            synthesis: {
              generation, gliderCount: recipe.gliders.length, gunCount: guns ? sources.length : 0,
              target: recipe.target.map(([r, c]) => [r - box.minRow, c - box.minColumn]),
            },
          });
      }
    }
    throw new Error("配套枪的首批脉冲未通过碰撞验证，请使用纯滑翔机合成。");
  }

  return Object.freeze({ componentPattern, synthesize, parsePeriod });
});
