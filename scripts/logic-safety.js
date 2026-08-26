(function exposeLogicSafety(root, factory) {
  const api = factory(...(typeof module === "object" && module.exports ? [require("./life-engine.js"), require("./logic-parse.js")] : [root.LifeEngine, root.LogicParse]));
  if (typeof module === "object" && module.exports) module.exports = api;
  root.LogicSafety = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function createLogicSafety(LifeEngine, LogicParse) {
  "use strict";

  const { LogicCodeError, SAFETY_SLICE_BUDGET_MS } = LogicParse;

  function createGunSafetyState(candidate, usePhaseCache = false) {
    const zones = candidate.gunGroups.map((group) => {
      const minRow = Math.min(...group.zoneCells.map(([row]) => row));
      const maxRow = Math.max(...group.zoneCells.map(([row]) => row));
      const minColumn = Math.min(...group.zoneCells.map(([, column]) => column));
      const maxColumn = Math.max(...group.zoneCells.map(([, column]) => column));
      const keys = [];
      for (let row = minRow; row <= maxRow; row += 1) {
        for (let column = minColumn; column <= maxColumn; column += 1) keys.push(`${row},${column}`);
      }
      return keys;
    });
    const zoneMembership = new Map();
    for (let groupIndex = 0; groupIndex < zones.length; groupIndex += 1) {
      for (const key of zones[groupIndex]) {
        const groups = zoneMembership.get(key);
        if (groups) groups.push(groupIndex);
        else zoneMembership.set(key, [groupIndex]);
      }
    }
    const references = candidate.gunGroups.map((group, groupIndex) => {
      const initial = new Set(group.referenceCells.map(([row, column]) => `${row},${column}`));
      if (!usePhaseCache) return { phases: null, current: initial };
      let evolving = initial;
      const phases = [];
      for (let phase = 0; phase < 30; phase += 1) {
        phases.push(new Set(zones[groupIndex].filter((key) => evolving.has(key))));
        evolving = LifeEngine.nextCellSet(evolving);
      }
      const periodic = zones[groupIndex].every(
        (key) => evolving.has(key) === phases[0].has(key),
      );
      return periodic ? { phases, current: null } : { phases: null, current: initial };
    });
    return {
      horizon: 4 * Math.max(candidate.width, candidate.height) + 120,
      world: new Set(candidate.cells.map(([row, column]) => `${row},${column}`)),
      zones,
      zoneMembership,
      references,
    };
  }

  function referenceAt(reference, generation) {
    return reference.phases ? reference.phases[generation % 30] : reference.current;
  }

  function advanceAperiodicReferences(references) {
    for (const reference of references) {
      if (!reference.phases) reference.current = LifeEngine.nextCellSet(reference.current);
    }
  }

  function findGunSafetyMismatch(world, references, zoneMembership, generation) {
    for (let groupIndex = 0; groupIndex < references.length; groupIndex += 1) {
      const reference = referenceAt(references[groupIndex], generation);
      for (const key of reference) {
        if (zoneMembership.get(key)?.includes(groupIndex) && !world.has(key)) return groupIndex;
      }
    }
    for (const key of world) {
      const groups = zoneMembership.get(key);
      if (!groups) continue;
      for (const groupIndex of groups) {
        if (!referenceAt(references[groupIndex], generation).has(key)) return groupIndex;
      }
    }
    return -1;
  }

  function validateGunSafety(candidate) {
    const { horizon, zoneMembership, references, world: initialWorld } = createGunSafetyState(candidate);
    let world = initialWorld;
    for (let generation = 0; generation <= horizon; generation += 1) {
      const groupIndex = findGunSafetyMismatch(world, references, zoneMembership, generation);
      if (groupIndex >= 0) {
        return { safe: false, generation, groupIndex, horizon };
      }
      if (generation < horizon) {
        world = LifeEngine.nextCellSet(world);
        advanceAperiodicReferences(references);
      }
    }
    return { safe: true, horizon };
  }

  function abortIfRequested(signal) {
    if (!signal?.aborted) return;
    const error = new LogicCodeError("已取消生成结构");
    error.code = "ABORTED";
    throw error;
  }

  function defaultYieldControl() {
    return new Promise((resolve) => setTimeout(resolve, 0));
  }

  async function validateGunSafetyAsync(candidate, options = {}) {
    const { horizon, zoneMembership, references, world: initialWorld } = createGunSafetyState(candidate, true);
    let world = initialWorld;
    const clock = typeof options.clock === "function"
      ? options.clock
      : () => (typeof performance === "object" ? performance.now() : Date.now());
    const yieldControl = typeof options.yieldControl === "function"
      ? options.yieldControl
      : defaultYieldControl;
    const sliceBudgetMs = Number.isFinite(options.sliceBudgetMs)
      ? Math.max(0, options.sliceBudgetMs)
      : SAFETY_SLICE_BUDGET_MS;
    let sliceStarted = clock();

    for (let generation = 0; generation <= horizon; generation += 1) {
      abortIfRequested(options.signal);
      const groupIndex = findGunSafetyMismatch(world, references, zoneMembership, generation);
      if (groupIndex >= 0) {
        return { safe: false, generation, groupIndex, horizon };
      }
      if (generation < horizon) {
        world = LifeEngine.nextCellSet(world);
        advanceAperiodicReferences(references);
      }
      if (generation < horizon && clock() - sliceStarted >= sliceBudgetMs) {
        options.onProgress?.({ generation: generation + 1, horizon });
        await yieldControl();
        abortIfRequested(options.signal);
        sliceStarted = clock();
      }
    }
    options.onProgress?.({ generation: horizon, horizon });
    return { safe: true, horizon };
  }

  return Object.freeze({ SAFETY_SLICE_BUDGET_MS, abortIfRequested, defaultYieldControl, validateGunSafety, validateGunSafetyAsync });
});
