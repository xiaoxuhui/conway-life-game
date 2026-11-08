(function exposeLogicSafety(root, factory) {
  const api = factory(...(typeof module === "object" && module.exports ? [require("./life-engine.js"), require("./logic-parse.js")] : [root.LifeEngine, root.LogicParse]));
  if (typeof module === "object" && module.exports) module.exports = api;
  root.LogicSafety = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function createLogicSafety(LifeEngine, LogicParse) {
  "use strict";

  const { LogicCodeError, SAFETY_SLICE_BUDGET_MS } = LogicParse;

  function packedConway(candidate, horizon) {
    // Within this verification horizon nothing can move further than one
    // cell per generation. Leave that much room on both sides of every row.
    const stride = candidate.width + 2 * horizon + 3;
    const offsets = [-stride - 1, -stride, -stride + 1, -1, 1, stride - 1, stride, stride + 1];
    const key = ([row, column]) => row * stride + column;
    const { birthMask, survivalMask } = LifeEngine.parseRule(LifeEngine.DEFAULT_RULE);
    function next(cells) {
      const counts = new Map();
      for (const cell of cells) {
        counts.set(cell, (counts.get(cell) || 0) | 16);
        for (const offset of offsets) {
          const neighbor = cell + offset;
          counts.set(neighbor, (counts.get(neighbor) || 0) + 1);
        }
      }
      const result = new Set();
      for (const [cell, count] of counts) {
        if ((count & 16 ? survivalMask : birthMask) & (1 << (count & 15))) result.add(cell);
      }
      return result;
    }
    return { key, next };
  }

  function* verifyGateChain(candidate) {
    const { outputProbe } = candidate;
    const horizon = Math.max(
      4 * Math.max(candidate.width, candidate.height) + 120, outputProbe.generation + 120,
    );
    const { key, next } = packedConway(candidate, horizon);
    let world = new Set(candidate.cells.map(key));
    const references = candidate.gunGroups.map((group) => {
      const rows = group.zoneCells.map(([row]) => row);
      const columns = group.zoneCells.map(([, column]) => column);
      const zone = [];
      for (let row = Math.min(...rows); row <= Math.max(...rows); row += 1) {
        for (let column = Math.min(...columns); column <= Math.max(...columns); column += 1) {
          zone.push(key([row, column]));
        }
      }
      let current = new Set(group.referenceCells.map(key));
      if (group.incident) return {
        current, zone, phase: group.incident.generation % 30, input: group.incident.cells.map(key),
      };
      const phases = [];
      for (let phase = 0; phase < 30; phase += 1) {
        phases.push(zone.map((cell) => current.has(cell)));
        current = next(current);
      }
      return zone.every((cell, index) => current.has(cell) === phases[0][index])
        ? { zone, phases }
        : { zone, current: new Set(group.referenceCells.map(key)) };
    });
    const probes = [...candidate.connections.map((connection) => ({
      ...connection, generation: connection.alignGeneration,
    })), outputProbe].map((probe) => ({ ...probe, keys: probe.cells.map(key) }));

    for (let generation = 0; generation <= horizon; generation += 1) {
      const phase = generation % 30;
      for (let groupIndex = 0; groupIndex < references.length; groupIndex += 1) {
        const reference = references[groupIndex];
        // Sample the real incident glider upstream of the reflector. This
        // includes startup pulses, which need not match the settled truth.
        if (phase === reference.phase && reference.input.every((cell) => world.has(cell))) {
          for (const cell of reference.input) reference.current.add(cell);
        }
        const frame = reference.phases?.[phase];
        if (reference.zone.some((cell, index) => (
          world.has(cell) !== (frame ? frame[index] : reference.current.has(cell))
        ))) return { safe: false, generation, groupIndex, horizon };
      }
      for (let probeIndex = 0; probeIndex < probes.length; probeIndex += 1) {
        const { generation: first, keys, expected } = probes[probeIndex];
        if (generation >= first && (generation - first) % 30 === 0
          && Number(keys.every((cell) => world.has(cell))) !== expected) {
          return { safe: false, generation, probeIndex, horizon };
        }
      }
      yield { generation, horizon };
      if (generation < horizon) {
        world = next(world);
        for (const reference of references) {
          if (reference.current) reference.current = next(reference.current);
        }
      }
    }
    return { safe: true, horizon };
  }

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
      if (!usePhaseCache || group.phaseCache === false) return { phases: null, current: initial };
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
    if (candidate.outputProbe) {
      const iterator = verifyGateChain(candidate);
      let step = iterator.next();
      while (!step.done) step = iterator.next();
      return step.value;
    }
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

    if (candidate.outputProbe) {
      const iterator = verifyGateChain(candidate);
      for (let step = iterator.next(); ; step = iterator.next()) {
        abortIfRequested(options.signal);
        if (step.done) return step.value;
        if (step.value.generation === step.value.horizon || clock() - sliceStarted >= sliceBudgetMs) {
          options.onProgress?.(step.value);
          await yieldControl();
          abortIfRequested(options.signal);
          sliceStarted = clock();
        }
      }
    }

    const { horizon, zoneMembership, references, world: initialWorld } = createGunSafetyState(candidate, true);
    let world = initialWorld;
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
