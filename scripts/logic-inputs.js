(function exposeLogicInputs(root, factory) {
  const api = factory(typeof module === "object" && module.exports
    ? require("./logic-compile.js") : root.LogicCompile);
  if (typeof module === "object" && module.exports) module.exports = api;
  root.LogicInputs = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function createLogicInputs(Compile) {
  "use strict";

  const {
    advanceCells, alignCoordinates, canonicalShape, gliderTrack, shiftCoordinates, coordinateTransforms,
  } = Compile;
  const PERIOD = 30;
  const modulo = (value, period = PERIOD) => ((value % period) + period) % period;
  const add = ([row, col], [dy, dx]) => [row + dy, col + dx];
  const subtract = ([row, col], [dy, dx]) => [row - dy, col - dx];
  const corner = (cells) => [
    Math.min(...cells.map(([row]) => row)), Math.min(...cells.map(([, col]) => col)),
  ];
  const sameDirection = (a, b) => a[0] === b[0] && a[1] === b[1];
  const box = (cells) => {
    const [top, left] = corner(cells);
    const [bottom, right] = corner(cells.map(([row, col]) => [-row, -col]));
    return { top: top - 5, left: left - 5, bottom: -bottom + 5, right: -right + 5 };
  };
  const boxesOverlap = (a, b) => !(
    a.top > b.bottom || a.bottom < b.top || a.left > b.right || a.right < b.left
  );

  // Dietrich Leithner's p30 duplicator, with the demonstration glider removed
  // from the RLE below when building the kit.
  // https://conwaylife.com/wiki/Glider_duplicator
  const FORK_RLE = "44b2o4b$44b2o4b9$41b2obob2o2b2$41bo5bo2b2$42b2ob2o3b$44bo5b3$38b2o6bo3b$37bobo5bobo2b$12bo26bo4bo3bob$13bo30b5ob$11b3o29b2o3b2o$44b5ob$45b3o2b$46bo3b$24b2o4b3o17b$24b2o6bo17b$31bo18b5$23b2o25b$22bobo21b2o2b$24bo21b2o2b$13bo36b$12b4o34b$11b2obobo6bobo24b$2o8b3obo2bo3bo3bo24b$2o9b2obobo4bo28b$12b4o4bo4bo24b$13bo7bo28b$21bo3bo6b2o16b$23bobo6bobo15b$34bo15b$34b2o!";
  const FORK_INPUT = [[20, 12], [21, 13], [22, 11], [22, 12], [22, 13]];
  const FORK_OUTPUTS = [
    [[3, 58], [3, 59], [4, 57], [4, 59], [5, 59]],
    [[57, 52], [58, 53], [57, 54], [58, 54], [59, 53]],
  ];

  function parseRle(rle) {
    const cells = [];
    let row = 0;
    let col = 0;
    for (const [, count, token] of rle.matchAll(/(\d*)([bo$])/g)) {
      const length = Number(count || 1);
      if (token === "$") {
        row += length;
        col = 0;
      } else {
        if (token === "o") {
          for (let n = 0; n < length; n += 1) cells.push([row, col + n]);
        }
        col += length;
      }
    }
    return cells;
  }
  const FORK_BODY = parseRle(FORK_RLE).filter((cell) => !FORK_INPUT.some((input) => sameDirection(cell, input)));
  // Buckaroo, with the input and output markers removed. This gives the router
  // a color-preserving turn in addition to the existing p5 bouncer.
  // https://conwaylife.com/wiki/Buckaroo
  const BUCKAROO = {
    bodyCells: parseRle("8$9bo$7bobo$6bobo$2o3bo2bo$2o4bobo$7bobo9b2o$9bo9bobo$21bo$21b2o!"),
    inputSignalCells: [[1, 26], [2, 24], [2, 25], [3, 25], [3, 26]],
    outputSignalCells: [[0, 8], [0, 9], [0, 10], [1, 8], [2, 9]],
    outputDelay: 60,
    oscillatorPeriod: PERIOD,
    incomingLead: 12,
    outgoingLead: 24,
    referenceLead: 20,
  };

  function repeatedVariables(tree) {
    const counts = new Map();
    function visit(node) {
      if (node.variable) counts.set(node.variable, (counts.get(node.variable) || 0) + 1);
      node.children.forEach(visit);
    }
    if (tree) visit(tree);
    return new Set([...counts].filter(([, count]) => count > 1).map(([name]) => name));
  }

  function localSharedVariables(tree, repeated) {
    const local = new Set();
    const distributed = new Set();
    function visit(node) {
      const ports = node.children.filter((child) => repeated.has(child.variable));
      if (ports.length === 2 && ports[0].variable === ports[1].variable && !local.has(ports[0].variable)) {
        local.add(ports[0].variable);
      } else {
        for (const port of ports) distributed.add(port.variable);
      }
      node.children.filter((child) => child.gate).forEach(visit);
    }
    visit(tree);
    return new Set([...local].filter((name) => !distributed.has(name)));
  }

  function matchPhase(track, cells) {
    const shape = canonicalShape(cells);
    for (let phase = 0; phase < 4; phase += 1) {
      if (track.at(phase).shape === shape) return phase;
    }
    return -1;
  }

  function forwardMatch(track, target, minimumDelay) {
    const phase = matchPhase(track, target);
    if (phase < 0) return null;
    const delay = minimumDelay + modulo(phase - minimumDelay, 4);
    return { delay, cells: track.at(delay).cells };
  }

  function reflectorVariants(kit) {
    return [BUCKAROO, kit].flatMap((part) => Object.values(coordinateTransforms).map((transform) => {
      const input = part.inputSignalCells.map(transform);
      const output = part.outputSignalCells.map(transform);
      return {
        kit: part, transform, input, direction: gliderTrack(input).delta,
        output: gliderTrack(output),
        displacement: subtract(corner(output), corner(input)),
      };
    }));
  }

  function* turnSequences(variants, start, finish, count) {
    if (count === 0) {
      if (sameDirection(start, finish)) yield [];
      return;
    }
    for (const part of variants) {
      if (!sameDirection(part.direction, start)) continue;
      for (const rest of turnSequences(variants, part.output.delta, finish, count - 1)) {
        yield [part, ...rest];
      }
    }
  }

  // Diagonal travel separates into two independent axes. Opposite legs on an
  // axis can both be lengthened to change timing without moving the endpoint.
  function axisDistances(legs, axis, needed) {
    const positive = [];
    const negative = [];
    for (const [index, { track }] of legs.entries()) {
      const [row, col] = track.delta;
      if (axis === 0 ? row !== col : row === col) continue;
      (col > 0 ? positive : negative).push(index);
    }
    if ((needed > 0 && !positive.length) || (needed < 0 && !negative.length)) return [];
    const choices = [];
    const adjustable = positive.length > 0 && negative.length > 0;
    for (let extra = 0; extra <= (adjustable ? 59 : 0); extra += 1) {
      const distribute = (indices, distance, ratio) => indices.map((index, i) => [
        index, i === 0 ? distance - (indices.length > 1 ? Math.floor(distance * ratio) : 0)
          : i === 1 ? Math.floor(distance * ratio) : 0,
      ]);
      const ratios = positive.length > 1 || negative.length > 1 ? [0, 0.5, 1] : [0];
      const cycles = Math.abs(needed) + 2 * extra;
      for (const ratio of ratios) choices.push({
        cycles,
        lengths: [
          ...distribute(positive, Math.max(0, needed) + extra, ratio),
          ...distribute(negative, Math.max(0, -needed) + extra, ratio),
        ],
      });
    }
    return choices;
  }

  function flightInterval(point, direction, generation, duration, track, offset, probeGeneration) {
    const [row, col] = point;
    const axis = direction[0] === direction[1] ? 0 : 1;
    const positions = [(col + row) / 2, (col - row) / 2];
    const start = positions[axis];
    const sign = direction[1];
    const end = start + sign * duration / 4;
    return {
      axis, fixed: positions[1 - axis], start, sign, generation, track, offset, probeGeneration,
      low: Math.min(start, end), high: Math.max(start, end),
    };
  }

  function flightsConflict(first, second) {
    const timeAt = (flight, position) => (
      flight.generation + 4 * flight.sign * (position - flight.start)
    );
    if (first.axis === second.axis) {
      if (Math.abs(first.fixed - second.fixed) > 2
        || first.high + 2 < second.low || second.high + 2 < first.low) return false;
      if (first.sign !== second.sign) return true;
      return pulsesTouch(first, second, timeAt(first, first.start), timeAt(second, first.start));
    }
    if (first.low - 2 > second.fixed || first.high + 2 < second.fixed
      || second.low - 2 > first.fixed || second.high + 2 < first.fixed) return false;
    return pulsesTouch(first, second, timeAt(first, second.fixed), timeAt(second, first.fixed));
  }

  function pulsesTouch(first, second, firstCross, secondCross) {
    const pulse = Math.round((firstCross - secondCross) / PERIOD) * PERIOD;
    for (let step = -13; step <= 13; step += 1) {
      const generation = Math.floor(firstCross) + step;
      const firstCells = shiftCoordinates(first.track.at(generation - first.probeGeneration).cells, ...first.offset);
      for (const offset of [pulse - PERIOD, pulse, pulse + PERIOD]) {
        const secondCells = shiftCoordinates(
          second.track.at(generation - second.probeGeneration - offset).cells, ...second.offset,
        );
        if (firstCells.some(([r, c]) => secondCells.some(([y, x]) => (
          Math.abs(r - y) <= 2 && Math.abs(c - x) <= 2
        )))) return true;
      }
    }
    return false;
  }

  function routeGeometry(signal, port, turns, occupied) {
    let track = gliderTrack(signal.cells);
    let point = corner(signal.cells);
    const legs = [];
    let baseTime = signal.generation;
    for (const part of [...turns, null]) {
      const target = part?.input || port.cells;
      const phase = matchPhase(track, target);
      if (phase < 0) return null;
      const delay = phase + 4 * (part ? 14 : 10);
      const displacement = subtract(corner(track.at(delay).cells), corner(track.at(0).cells));
      point = add(point, displacement);
      baseTime += delay;
      legs.push({ track, delay, displacement, part });
      if (part) {
        point = add(point, part.displacement);
        baseTime += part.kit.outputDelay;
        track = part.output;
      }
    }
    const [row, col] = subtract(corner(port.cells), point);
    const u = (col + row) / 2;
    const v = (col - row) / 2;
    if (!Number.isInteger(u) || !Number.isInteger(v)) return null;
    const along = axisDistances(legs, 0, u);
    const across = axisDistances(legs, 1, v);
    const acrossByPhase = new Map();
    for (const choice of across) {
      const phase = modulo(choice.cycles * 4);
      if (!acrossByPhase.has(phase)) acrossByPhase.set(phase, []);
      acrossByPhase.get(phase).push(choice);
    }
    let best = null;
    for (const first of along) {
      const required = modulo(port.generation - baseTime - first.cycles * 4);
      for (const second of acrossByPhase.get(required) || []) {
        const arrival = baseTime + 4 * (first.cycles + second.cycles);
        if (best && best.arrival <= arrival) continue;
        const lengths = new Map([...first.lengths, ...second.lengths]);
        let current = corner(signal.cells);
        let generation = signal.generation;
        const components = [];
        const flights = [];
        const raySamples = [];
        let clear = true;
        for (const [index, leg] of legs.entries()) {
          const flight = leg.delay + 4 * (lengths.get(index) || 0);
          const offset = subtract(current, corner(leg.track.at(0).cells));
          const lead = index ? (turns[index - 1].kit.outgoingLead ?? 44) : 0;
          const interval = flightInterval(
            add(corner(leg.track.at(-lead).cells), offset), leg.track.delta,
            generation - lead, flight + lead + (leg.part ? (leg.part.kit.incomingLead ?? 84) : 0),
            leg.track, offset, generation,
          );
          if (!occupied.clearInterval(interval) || flights.some((other) => flightsConflict(interval, other))
            || !occupied.clearFlight(leg.track, offset, flight)) {
            clear = false;
            break;
          }
          flights.push(interval);
          raySamples.push({ track: leg.track, offset, flight });
          generation += flight;
          current = add(corner(leg.track.at(flight).cells), offset);
          if (!leg.part) continue;
          const { transform, input, displacement, kit } = leg.part;
          const anchor = subtract(current, corner(input));
          const zone = shiftCoordinates(kit.bodyCells.map(transform), ...anchor);
          const bounds = box(zone);
          if (!occupied.clearBox(bounds) || components.some((part) => boxesOverlap(bounds, part.bounds))) {
            clear = false;
            break;
          }
          const cells = shiftCoordinates(advanceCells(
            kit.bodyCells, modulo(-generation, kit.oscillatorPeriod),
          ).map(transform), ...anchor);
          const referenceLead = kit.referenceLead || 0;
          components.push({
            cells, zoneCells: zone, referenceCells: cells,
            incident: {
              cells: shiftCoordinates(gliderTrack(input).at(-referenceLead).cells, ...anchor),
              generation: generation - referenceLead,
            },
            bounds,
          });
          current = add(current, displacement);
          generation += kit.outputDelay;
        }
        if (clear && raySamples.every(({ track, offset, flight }, index) => (
          clearOfBoxes(track, offset, flight, components.filter((_, turn) => (
            turn !== index && turn !== index - 1
          )).map((part) => part.bounds))
        ))) best = { arrival, components, flights };
      }
    }
    return best;
  }

  function clearOfBoxes(track, offset, delay, boxes) {
    const [row, col] = add(corner(track.at(0).cells), offset);
    const [dy, dx] = track.delta;
    return !boxes.some(({ top, left, bottom, right }) => {
      const rows = dy > 0 ? [top - row, bottom - row] : [row - bottom, row - top];
      const cols = dx > 0 ? [left - col, right - col] : [col - right, col - left];
      return Math.max(0, rows[0], cols[0]) <= Math.min(Math.floor(delay / 4), rows[1], cols[1]);
    });
  }

  function occupancy(cells, groups) {
    const occupied = new Set();
    const diagonalLanes = [new Map(), new Map()];
    const flights = [];
    const boxes = groups.map((group) => box(group.zoneCells));
    function addCells(more) {
      for (const [row, col] of more) {
        for (let dy = -2; dy <= 2; dy += 1) {
          for (let dx = -2; dx <= 2; dx += 1) {
            const y = row + dy;
            const x = col + dx;
            const key = `${y},${x}`;
            if (occupied.has(key)) continue;
            occupied.add(key);
            const projected = [x + y, x - y];
            for (const [axis, lanes] of diagonalLanes.entries()) {
              const lane = projected[1 - axis];
              if (!lanes.has(lane)) lanes.set(lane, []);
              lanes.get(lane).push(projected[axis]);
            }
          }
        }
      }
    }
    function clearCells(more) {
      return more.every(([row, col]) => !occupied.has(`${row},${col}`));
    }
    addCells(cells);
    return {
      addCells, clearCells,
      addBox(bounds) { boxes.push(bounds); },
      clearBox(bounds) { return !boxes.some((other) => boxesOverlap(bounds, other)); },
      addFlights(more) { flights.push(...more); },
      clearInterval(interval) { return !flights.some((other) => flightsConflict(interval, other)); },
      clearFlight(track, offset, delay) {
        if (!clearOfBoxes(track, offset, delay, boxes)) return false;
        const [dy, dx] = track.delta;
        const axis = dy === dx ? 0 : 1;
        const steps = Math.floor(delay / 4);
        return shiftCoordinates(track.at(0).cells, ...offset).every(([y, x]) => {
          const projected = [x + y, x - y];
          const start = projected[axis];
          const end = start + 2 * dx * steps;
          return !(diagonalLanes[axis].get(projected[1 - axis]) || []).some((point) => (
            point >= Math.min(start, end) && point <= Math.max(start, end)
          ));
        });
      },
    };
  }

  function connect(signal, port, variants, occupied) {
    const from = gliderTrack(signal.cells).delta;
    const to = gliderTrack(port.cells).delta;
    for (let count = 0; count <= 4; count += 1) {
      let best = null;
      for (const turns of turnSequences(variants, from, to, count)) {
        const candidate = routeGeometry(signal, port, turns, occupied);
        if (candidate && (!best || candidate.arrival < best.arrival)) best = candidate;
      }
      if (best) return best;
    }
    return null;
  }

  function placeFork(input, transform, components) {
    const inputCells = FORK_INPUT.map(transform);
    const path = gliderTrack(input.cells);
    const matched = forwardMatch(path, inputCells, 96);
    const anchor = alignCoordinates(inputCells, matched.cells);
    const arrival = input.generation + matched.delay;
    const place = (coords) => shiftCoordinates(coords.map(transform), ...anchor);
    const cells = place(advanceCells(FORK_BODY, modulo(-arrival)));
    // The incident probe must be outside the fork's protected rectangle.
    const entry = gliderTrack(inputCells).at(-80).cells;
    components.push({
      cells, zoneCells: place(FORK_BODY), referenceCells: cells,
      incident: { cells: shiftCoordinates(entry, ...anchor), generation: arrival - 80 },
    });
    return FORK_OUTPUTS.map((coords) => ({ cells: place(coords), generation: arrival + 150 }));
  }

  function inputTree(name, value, count, kit, anchor, transform, phase) {
    const place = (coords) => shiftCoordinates(coords.map(transform), ...anchor);
    const sourceCells = place(advanceCells(value ? kit.inputTrueCells : kit.inputFalseCells, phase));
    const source = { name, value, cells: sourceCells, portCount: count };
    const components = [{ cells: sourceCells, zoneCells: place(kit.inputGunCells), referenceCells: sourceCells }];
    let trunk = { cells: place(kit.inputSignalCells), generation: kit.inputSignalGeneration - phase };
    const branches = [];
    for (let index = 1; index < count; index += 1) {
      const [side, forward] = placeFork(trunk, transform, components);
      branches.push(side);
      trunk = forward;
    }
    branches.push(trunk);
    return { source, components, branches };
  }

  function inputPlacement(ports, kit, transform, index, variant, top, left) {
    const { name, value } = ports[0];
    if (variant < 6) {
      const initial = inputTree(name, value, ports.length, kit, [0, 0], transform, 0);
      const port = ports[Math.floor(variant / 2) % ports.length];
      const ordered = initial.branches.map((branch, branchIndex) => ({ branch, branchIndex }));
      if (variant % 2) ordered.reverse();
      for (const { branch, branchIndex } of ordered) {
        const track = gliderTrack(branch.cells);
        const matched = forwardMatch(track, port.cells, 100 + 60 * Math.floor(variant / 2));
        if (!matched) continue;
        return {
          anchor: alignCoordinates(matched.cells, port.cells),
          phase: modulo(branch.generation + matched.delay - port.generation),
          preferredBranch: branchIndex,
        };
      }
    }
    const margin = 155 + Math.floor(variant / 2) * 39 + ports.length * 42;
    return {
      anchor: [top - margin - index * 91, left - margin - index * 169],
      phase: 1 + 2 * (Math.floor(variant / 2) % 3),
    };
  }

  // A checked layout for feeding the two standard p30 input lanes from one
  // gun. The canonical coordinates are relative to the AND kit's origin.
  const DUAL_PORT_TURNS = [
    ["buckaroo", "R180", [-105, 52], 396],
    ["p5", "R90", [-59, 119], 573],
    ["buckaroo", "AT", [15, 62], 838],
  ];

  function dualPortInput(ports, sourceKit, gateKit, reflectorKit) {
    if (ports.length !== 2 || ports[0].gatePath !== ports[1].gatePath
      || ports[0].portIndex === ports[1].portIndex || !gateKit) return null;
    const ordered = [...ports].sort((a, b) => a.portIndex - b.portIndex);
    const targets = gateKit.inputOrigins.map((origin) => shiftCoordinates(gateKit.inputSignalCells, ...origin));
    for (let phase = 0; phase < 4; phase += 1) {
      for (const transform of Object.values(coordinateTransforms)) {
        const targetCells = targets.map((cells) => advanceCells(cells, phase).map(transform));
        if (targetCells.some((cells, i) => canonicalShape(cells) !== canonicalShape(ordered[i].cells))) continue;
        const offset = alignCoordinates(targetCells[0], ordered[0].cells);
        if (!sameDirection(offset, alignCoordinates(targetCells[1], ordered[1].cells))) continue;
        const { name, value } = ordered[0];
        const layout = inputTree(name, value, 2, sourceKit, [-100, -106], coordinateTransforms.I, 19);
        for (const [type, orientation, anchor, arrival] of DUAL_PORT_TURNS) {
          const kit = type === "buckaroo" ? BUCKAROO : reflectorKit;
          const orient = coordinateTransforms[orientation];
          const position = (cells) => shiftCoordinates(cells.map(orient), ...anchor);
          const cells = position(advanceCells(kit.bodyCells, modulo(-arrival, kit.oscillatorPeriod)));
          const lead = kit.referenceLead || 0;
          layout.components.push({
            cells, zoneCells: position(kit.bodyCells), referenceCells: cells,
            incident: { cells: position(gliderTrack(kit.inputSignalCells).at(-lead).cells), generation: arrival - lead },
          });
        }
        const place = (cells) => shiftCoordinates(cells.map(transform), ...offset);
        const bodies = layout.components.map((part) => ({
          cells: place(advanceCells(part.cells, phase)),
          zoneCells: place(part.zoneCells),
          referenceCells: place(advanceCells(part.referenceCells, phase)),
          ...(part.incident ? {
            incident: { ...part.incident, cells: place(gliderTrack(part.incident.cells).at(phase).cells) },
          } : {}),
        }));
        return {
          source: { ...layout.source, cells: bodies[0].cells },
          bodies,
          connections: ordered.map((port, i) => ({
            ...port, expected: value, alignGeneration: i === 0 ? 941 : 431,
          })),
        };
      }
    }
    return null;
  }

  function attachSharedInputs(circuit, sourceKit, reflectorKit, variant = 0, referenceGateKit = null) {
    if (reflectorKit?.acceptedSignalPeriod !== PERIOD) return null;
    const variants = reflectorVariants(reflectorKit);
    const groups = new Map();
    for (const port of circuit.variablePorts) {
      if (!groups.has(port.name)) groups.set(port.name, []);
      groups.get(port.name).push(port);
    }
    const [top, left] = corner(circuit.cells);
    const occupied = occupancy(circuit.cells, circuit.gunGroups);
    const cells = [...circuit.cells];
    const gunGroups = [...circuit.gunGroups];
    const inputSources = [...(circuit.inputSources || [])];
    const inputConnections = [...(circuit.inputConnections || [])];
    function place(parts) {
      for (const part of parts) {
        cells.push(...part.cells);
        gunGroups.push(part);
        occupied.addCells(part.cells);
        occupied.addBox(part.bounds || box(part.zoneCells));
      }
    }
    for (const [index, ports] of [...groups.values()].entries()) {
      const { name, value } = ports[0];
      const dual = dualPortInput(ports, sourceKit, referenceGateKit, reflectorKit);
      if (dual && dual.bodies.every((part) => occupied.clearBox(box(part.zoneCells)))) {
        place(dual.bodies);
        inputSources.push(dual.source);
        inputConnections.push(...dual.connections);
        continue;
      }
      const pointsNorthEast = ports.some((port) => sameDirection(gliderTrack(port.cells).delta, [-1, 1]));
      const pointsSouthWest = ports.some((port) => sameDirection(gliderTrack(port.cells).delta, [1, -1]));
      const transform = pointsNorthEast && !pointsSouthWest ? coordinateTransforms.I
        : pointsSouthWest && !pointsNorthEast ? coordinateTransforms.T
          : variant % 2 === 0 ? coordinateTransforms.I : coordinateTransforms.T;
      const { anchor, phase, preferredBranch } = inputPlacement(ports, sourceKit, transform, index, variant, top, left);
      const tree = inputTree(name, value, ports.length, sourceKit, anchor, transform, phase);
      if (tree.components.some((part) => !occupied.clearCells(part.cells))) return null;
      place(tree.components);
      const remaining = [...ports];
      const branches = [...tree.branches];
      if (preferredBranch !== undefined) branches.unshift(...branches.splice(preferredBranch, 1));
      else if (variant % 4 >= 2) branches.reverse();
      for (const signal of branches) {
        let best = null;
        let target = -1;
        for (const [portIndex, port] of remaining.entries()) {
          const route = connect(signal, port, variants, occupied);
          if (route && (!best || route.arrival < best.arrival)) {
            best = route;
            target = portIndex;
          }
        }
        if (!best) return null;
        place(best.components);
        occupied.addFlights(best.flights);
        const [port] = remaining.splice(target, 1);
        inputConnections.push({ ...port, expected: value, alignGeneration: best.arrival });
      }
      inputSources.push(tree.source);
    }
    const delay = Math.ceil((Math.max(...inputConnections.map((port) => port.alignGeneration)) + 90) / PERIOD) * PERIOD;
    return {
      ...circuit, cells, gunGroups, inputSources, inputConnections,
      variablePorts: [],
      observeGeneration: circuit.observeGeneration + delay,
      connections: circuit.connections.map((edge) => ({ ...edge, alignGeneration: edge.alignGeneration + delay })),
      verifySignals: true,
    };
  }

  function compileSharedCandidate(tree, repeated, resolveGateKit, reflectorKit, attempt) {
    const local = localSharedVariables(tree, repeated);
    const sourceKit = resolveGateKit("NOT");
    const referenceGateKit = resolveGateKit("AND");
    const attachLocalInputs = (circuit, path) => {
      const ports = circuit.variablePorts.filter((port) => port.gatePath === path && local.has(port.name));
      if (ports.length !== 2) return null;
      const result = attachSharedInputs(
        { ...circuit, variablePorts: ports }, sourceKit, reflectorKit, attempt.variant, referenceGateKit,
      );
      if (!result) return null;
      return {
        ...result,
        variablePorts: circuit.variablePorts.filter((port) => !ports.includes(port)),
      };
    };
    const circuit = Compile.compileCircuit(
      tree, resolveGateKit, attempt.padding, attempt.layout, attempt.spacing, 0,
      {
        externalVariables: repeated, attachLocalInputs,
        ...(attempt.reflectedEdgePath ? {
          reflectedEdgePath: attempt.reflectedEdgePath,
          reflectorRouteVariant: attempt.reflectorRouteVariant,
          resolveReflectorKit: () => reflectorKit,
        } : {}),
      },
    );
    if (!circuit.variablePorts.length) return circuit;
    return attachSharedInputs(circuit, sourceKit, reflectorKit, attempt.variant, referenceGateKit);
  }

  return Object.freeze({ repeatedVariables, attachSharedInputs, compileSharedCandidate });
});
