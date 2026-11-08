(function exposeLogicCompile(root, factory) {
  const api = factory(...(typeof module === "object" && module.exports ? [require("./life-engine.js"), require("./logic-parse.js")] : [root.LifeEngine, root.LogicParse]));
  if (typeof module === "object" && module.exports) module.exports = api;
  root.LogicCompile = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function createLogicCompile(LifeEngine, LogicParse) {
  "use strict";

  const { LogicCodeError } = LogicParse;

  function shiftCoordinates(coordinates, rowOffset, columnOffset) {
    return coordinates.map(([row, column]) => [row + rowOffset, column + columnOffset]);
  }

  const OR_TO_NOT_GUARD_EATER = Object.freeze([
    [-7, 51], [-7, 52], [-6, 51], [-5, 52], [-5, 53], [-5, 54], [-4, 54],
  ].map((coordinate) => Object.freeze(coordinate)));

  const COORDINATE_TRANSFORMS = Object.freeze({
    I: ([row, column]) => [row, column],
    R90: ([row, column]) => [column, -row],
    R180: ([row, column]) => [-row, -column],
    R270: ([row, column]) => [-column, row],
    FH: ([row, column]) => [row, -column],
    T: ([row, column]) => [column, row],
    FV: ([row, column]) => [-row, column],
    AT: ([row, column]) => [-column, -row],
  });

  function transformCoordinates(coordinates, transform) {
    return coordinates.map((coordinate) => transform(coordinate));
  }

  function transformCircuit(circuit, transformName = "I") {
    const transform = COORDINATE_TRANSFORMS[transformName];
    if (!transform) throw new LogicCodeError(`不支持的逻辑门变形：${transformName}`);
    const map = (coordinates) => transformCoordinates(coordinates || [], transform);
    return {
      ...circuit,
      cells: map(circuit.cells),
      inputOrigins: map(circuit.inputOrigins),
      signalCells: map(circuit.signalCells),
      signalDelta: transform(circuit.signalDelta),
      terminalCells: map(circuit.terminalCells),
      ...(circuit.gateAnchors ? { gateAnchors: map(circuit.gateAnchors) } : {}),
      gunGroups: (circuit.gunGroups || []).map((group) => ({
        ...group,
        zoneCells: map(group.zoneCells),
        referenceCells: map(group.referenceCells),
      })),
      connections: (circuit.connections || []).map((connection) => ({
        ...connection,
        cells: map(connection.cells),
        ...(connection.reflectors ? {
          reflectors: connection.reflectors.map((reflector) => ({
            ...reflector, anchor: transform(reflector.anchor),
          })),
        } : {}),
      })),
    };
  }

  function advanceCells(coordinates, generations) {
    let cells = new Set(coordinates.map(([row, column]) => `${row},${column}`));
    for (let generation = 0; generation < generations; generation += 1) {
      cells = LifeEngine.nextCellSet(cells);
    }
    return [...cells].map((key) => key.split(",").map(Number));
  }

  function uniqueCoordinates(coordinates) {
    const unique = new Map();
    for (const [row, column] of coordinates) unique.set(`${row},${column}`, [row, column]);
    return [...unique.values()];
  }

  function canonicalShape(coordinates) {
    const minRow = Math.min(...coordinates.map(([row]) => row));
    const minColumn = Math.min(...coordinates.map(([, column]) => column));
    return shiftCoordinates(coordinates, -minRow, -minColumn)
      .sort((left, right) => left[0] - right[0] || left[1] - right[1])
      .map(([row, column]) => `${row},${column}`)
      .join(";");
  }

  function alignCoordinates(source, target) {
    if (canonicalShape(source) !== canonicalShape(target)) {
      throw new LogicCodeError("子门输出与父门输入的滑翔机相位不兼容");
    }
    const sourceMinRow = Math.min(...source.map(([row]) => row));
    const sourceMinColumn = Math.min(...source.map(([, column]) => column));
    const targetMinRow = Math.min(...target.map(([row]) => row));
    const targetMinColumn = Math.min(...target.map(([, column]) => column));
    return [targetMinRow - sourceMinRow, targetMinColumn - sourceMinColumn];
  }

  function seedGliderForArrival(targetCells, arrivalGeneration) {
    const phaseLead = (4 - (arrivalGeneration % 4)) % 4;
    const seed = advanceCells(targetCells, phaseLead);
    const evolved = advanceCells(seed, arrivalGeneration);
    const [rowOffset, columnOffset] = alignCoordinates(evolved, targetCells);
    return shiftCoordinates(seed, rowOffset, columnOffset);
  }

  function signalTrainReference(targetCells, firstArrival, lastArrival) {
    const cells = [];
    for (let arrival = firstArrival; arrival <= lastArrival; arrival += 30) {
      cells.push(...seedGliderForArrival(targetCells, arrival));
    }
    return uniqueCoordinates(cells);
  }

  function orientSouthEast(circuit) {
    if (circuit.signalDelta[1] >= 0) return circuit;
    return transformCircuit(circuit, "FH");
  }

  function phaseShiftCircuit(circuit, generations) {
    return {
      ...circuit,
      cells: advanceCells(circuit.cells, generations),
      signalCells: advanceCells(circuit.signalCells, generations),
      terminalCells: advanceCells(circuit.terminalCells, generations),
      gunGroups: circuit.gunGroups.map((group) => ({
        ...group,
        zoneCells: group.zoneCells,
        referenceCells: advanceCells(group.referenceCells, generations),
      })),
      connections: circuit.connections.map((connection) => ({
        ...connection,
        cells: advanceCells(connection.cells, generations),
      })),
    };
  }

  function shouldTransposeNested(layoutVariant, depth, nestedIndex, nestedCount) {
    if (nestedCount < 2) return false;
    if (layoutVariant === 1) return nestedIndex === 0;
    if (layoutVariant === 2) return nestedIndex === depth % 2;
    if (layoutVariant === 3) return nestedIndex === (depth + 1) % 2;
    return nestedIndex === 1;
  }

  function nestedTransformSetting(
    options, layoutVariant, depth, nestedIndex, nestedCount, portIndex, child, parent,
  ) {
    if (typeof options?.nestedTransform === "function") {
      const requested = options.nestedTransform({
        depth, nestedIndex, nestedCount, portIndex, child, parent,
      });
      if (typeof requested === "string") return { name: requested, phase: 0 };
      if (requested && typeof requested === "object") {
        const phase = requested.phase ?? 0;
        if (!Number.isInteger(phase) || phase < 0 || phase > 3) {
          throw new LogicCodeError("嵌套逻辑门相位必须是 0 到 3 的整数");
        }
        return { name: requested.name || "I", phase };
      }
      return { name: "I", phase: 0 };
    }
    return shouldTransposeNested(layoutVariant, depth, nestedIndex, nestedCount)
      ? { name: "T", phase: 2 }
      : { name: "I", phase: 0 };
  }

  function collectNestedEdges(node, path = "root", edges = []) {
    if (!node?.gate) return edges;
    node.children.forEach((child, portIndex) => {
      if (!child?.gate) return;
      const edgePath = `${path}.${portIndex}`;
      collectNestedEdges(child, edgePath, edges);
      edges.push(Object.freeze({
        path: edgePath, from: child.gate, to: node.gate, portIndex,
      }));
    });
    return edges;
  }

  function reflectedRouteCandidates(
    item, targetCells, alignGeneration, resolveReflectorKit, candidateLimit = 1,
  ) {
    const reflectorKit = resolveReflectorKit?.("P5_90");
    if (!reflectorKit || reflectorKit.acceptedSignalPeriod !== 30) {
      throw new LogicCodeError("大型嵌套线路缺少兼容 p30 信号的反射器");
    }
    const outputDelay = reflectorKit.outputDelay ?? 180;
    const sourceGeneration = item.circuit.observeGeneration + item.pulseIndex * 30;
    const results = [];
    const seen = new Set();
    const evolutionSeries = (initial, generations) => {
      const wanted = new Set(generations);
      const last = Math.max(0, ...generations);
      const evolved = new Map();
      let cells = initial;
      for (let generation = 0; generation <= last; generation += 1) {
        if (wanted.has(generation)) evolved.set(generation, cells);
        if (generation < last) cells = advanceCells(cells, 1);
      }
      return evolved;
    };
    const tailDelays = Array.from({ length: 20 }, (_, value) => value)
      .filter((tailDelay) => (
        (alignGeneration - outputDelay - tailDelay) >= 0
        && (alignGeneration - outputDelay - tailDelay) % reflectorKit.oscillatorPeriod === 0
      ));
    const middleDelays = Array.from({ length: 121 }, (_, index) => 5 + index * 5);
    const sourceDelays = [...new Set(tailDelays.flatMap((tailDelay) => {
      const secondArrival = alignGeneration - outputDelay - tailDelay;
      return middleDelays.map((middleDelay) => (
        secondArrival - outputDelay - middleDelay - sourceGeneration
      )).filter((delay) => delay >= 0);
    }))];
    const sourceVariants = Object.fromEntries(Object.keys(COORDINATE_TRANSFORMS).map((name) => {
      const circuit = transformCircuit(item.circuit, name);
      return [name, {
        circuit,
        series: evolutionSeries(circuit.signalCells, sourceDelays),
      }];
    }));
    const transformed = Object.fromEntries(Object.keys(COORDINATE_TRANSFORMS).map((name) => {
      const transform = COORDINATE_TRANSFORMS[name];
      const input = transformCoordinates(reflectorKit.inputSignalCells, transform);
      const output = transformCoordinates(reflectorKit.outputSignalCells, transform);
      return [name, {
        input,
        inputShape: canonicalShape(input),
        middleSeries: evolutionSeries(output, middleDelays),
        tailSeries: evolutionSeries(output, tailDelays),
      }];
    }));

    routeSearch: for (const tailDelay of tailDelays) {
      const secondArrival = alignGeneration - outputDelay - tailDelay;
      for (const middleDelay of middleDelays) {
        const firstArrival = secondArrival - outputDelay - middleDelay;
        if (firstArrival < sourceGeneration
          || firstArrival % reflectorKit.oscillatorPeriod !== 0) continue;
        for (const childTransform of Object.keys(COORDINATE_TRANSFORMS)) {
          const source = sourceVariants[childTransform];
          const sourceCells = source.series.get(firstArrival - sourceGeneration);
          const sourceShape = canonicalShape(sourceCells);
          for (const firstTransform of Object.keys(COORDINATE_TRANSFORMS)) {
            const first = transformed[firstTransform];
            const firstInput = first.input;
            const firstOutput = first.middleSeries.get(middleDelay);
            if (sourceShape !== first.inputShape) continue;
            const firstOutputShape = canonicalShape(firstOutput);
            for (const secondTransform of Object.keys(COORDINATE_TRANSFORMS)) {
              const second = transformed[secondTransform];
              const secondInput = second.input;
              const secondOutput = second.tailSeries.get(tailDelay);
              if (firstOutputShape !== second.inputShape
                || canonicalShape(secondOutput) !== canonicalShape(targetCells)) continue;

              const secondOffset = alignCoordinates(secondOutput, targetCells);
              const shiftedSecondInput = shiftCoordinates(secondInput, ...secondOffset);
              const firstOffset = alignCoordinates(firstOutput, shiftedSecondInput);
              const shiftedFirstInput = shiftCoordinates(firstInput, ...firstOffset);
              const childOffset = alignCoordinates(sourceCells, shiftedFirstInput);
              const key = [
                childTransform, firstTransform, secondTransform,
                ...firstOffset, ...secondOffset,
              ].join(":");
              if (seen.has(key)) continue;
              seen.add(key);
              results.push({
                childCircuit: source.circuit,
                childTransform,
                childOffset,
                reflectors: [
                  { transform: firstTransform, offset: firstOffset, arrival: firstArrival },
                  { transform: secondTransform, offset: secondOffset, arrival: secondArrival },
                ],
              });
              if (results.length >= candidateLimit) break routeSearch;
            }
          }
        }
      }
    }
    return results;
  }

  function addReflectedNestedRoute(
    cells, gunGroups, item, targetCells, alignGeneration, options,
  ) {
    const routes = reflectedRouteCandidates(
      item, targetCells, alignGeneration, options.resolveReflectorKit,
      (options.reflectorRouteVariant || 0) + 1,
    );
    const route = routes[options.reflectorRouteVariant || 0];
    if (!route) throw new LogicCodeError(`连接 ${item.edgePath} 没有兼容的双反射几何候选`);
    const reflectorKit = options.resolveReflectorKit("P5_90");
    const shiftedChild = shiftCircuit(route.childCircuit, route.childOffset);
    const reflectorMetadata = [];
    cells.push(...shiftedChild.cells);
    gunGroups.push(...shiftedChild.gunGroups);

    for (const reflector of route.reflectors) {
      const transform = COORDINATE_TRANSFORMS[reflector.transform];
      const bodyCells = shiftCoordinates(
        transformCoordinates(reflectorKit.bodyCells, transform), ...reflector.offset,
      );
      const inputCells = shiftCoordinates(
        transformCoordinates(reflectorKit.inputSignalCells, transform), ...reflector.offset,
      );
      cells.push(...bodyCells);
      gunGroups.push({
        zoneCells: bodyCells,
        referenceCells: item.child.value
          ? uniqueCoordinates([
            ...bodyCells,
            ...signalTrainReference(inputCells, reflector.arrival, alignGeneration + 2400),
          ])
          : bodyCells,
        phaseCache: false,
      });
      reflectorMetadata.push(Object.freeze({
        transform: reflector.transform,
        anchor: Object.freeze([...reflector.offset]),
        arrivalGeneration: reflector.arrival,
      }));
    }
    return { shiftedChild, reflectorMetadata, childTransform: route.childTransform };
  }

  function compileCircuit(
    node, resolveGateKit, routePadding = 240, layoutVariant = 0,
    branchPulseSpacing = 20, depth = 0, options = {}, path = "root",
  ) {
    const kit = resolveGateKit(node.gate);
    if (!kit) throw new LogicCodeError(`没有找到可连接门体：${node.gate}`);
    const cells = [...kit.bodyCells.map((coordinate) => [...coordinate])];
    const connections = [];
    const gunGroups = kit.bodyGunGroups.map((cells) => ({
      zoneCells: cells.map((coordinate) => [...coordinate]),
      referenceCells: cells.map((coordinate) => [...coordinate]),
    }));
    const nested = [];
    const gateAnchors = [[0, 0]];
    const nestedCount = node.children.filter((child) => child.gate).length;

    node.children.forEach((child, portIndex) => {
      const origin = kit.inputOrigins[portIndex];
      if (!child.gate) {
        const source = child.value ? kit.inputTrueCells : kit.inputFalseCells;
        cells.push(...shiftCoordinates(source, origin[0], origin[1]));
        gunGroups.push({
          zoneCells: shiftCoordinates(kit.inputGunCells, origin[0], origin[1]),
          referenceCells: shiftCoordinates(source, origin[0], origin[1]),
        });
        return;
      }
      const edgePath = `${path}.${portIndex}`;
      let circuit = orientSouthEast(compileCircuit(
        child, resolveGateKit, routePadding, layoutVariant, branchPulseSpacing,
        depth + 1, options, edgePath,
      ));
      const transform = nestedTransformSetting(
        options, layoutVariant, depth, nested.length, nestedCount, portIndex, child, node,
      );
      circuit = transformCircuit(circuit, transform.name);
      if (transform.phase > 0) circuit = phaseShiftCircuit(circuit, transform.phase);
      nested.push({
        child,
        portIndex,
        origin,
        circuit,
        transform: transform.name,
        transformPhase: transform.phase,
        pulseIndex: nested.length * branchPulseSpacing,
        edgePath,
      });
    });

    if (node.gate === "NOT" && nested.some(({ child }) => child.gate === "OR")) {
      cells.push(...OR_TO_NOT_GUARD_EATER.map((coordinate) => [...coordinate]));
    }

    let pulseIndex = 0;
    if (nested.length > 0) {
      const latestSource = Math.max(...nested.map(({ circuit, pulseIndex: sourcePulse }) => (
        circuit.observeGeneration + sourcePulse * 30
      )));
      const needsReflection = nested.some(({ edgePath }) => (
        edgePath === options.reflectedEdgePath
      ));
      const effectivePadding = needsReflection ? Math.max(routePadding, 960) : routePadding;
      pulseIndex = Math.max(0, Math.ceil((latestSource + effectivePadding - kit.inputSignalGeneration) / 30));
      let alignGeneration;
      let compatible = false;
      for (let phaseAttempt = 0; phaseAttempt < 4; phaseAttempt += 1) {
        alignGeneration = kit.inputSignalGeneration + pulseIndex * 30;
        compatible = nested.every((item) => {
          const sourceGeneration = item.circuit.observeGeneration + item.pulseIndex * 30;
          const sourceCells = advanceCells(
            item.circuit.signalCells,
            alignGeneration - sourceGeneration,
          );
          return canonicalShape(sourceCells) === canonicalShape(kit.inputSignalCells);
        });
        if (compatible) break;
        pulseIndex += 1;
      }
      if (!compatible) throw new LogicCodeError("无法为级联线路找到兼容的滑翔机相位");

      for (const item of nested) {
        const sourceGeneration = item.circuit.observeGeneration + item.pulseIndex * 30;
        const sourceCells = advanceCells(
          item.circuit.signalCells,
          alignGeneration - sourceGeneration,
        );
        const targetCells = shiftCoordinates(
          kit.inputSignalCells,
          item.origin[0],
          item.origin[1],
        );
        let shiftedChild;
        let reflectorMetadata = null;
        let reflectedChildTransform = null;
        if (item.edgePath === options.reflectedEdgePath) {
          const reflected = addReflectedNestedRoute(
            cells, gunGroups, item, targetCells, alignGeneration, options,
          );
          shiftedChild = reflected.shiftedChild;
          reflectorMetadata = reflected.reflectorMetadata;
          reflectedChildTransform = reflected.childTransform;
        } else {
          const offset = alignCoordinates(sourceCells, targetCells);
          shiftedChild = shiftCircuit(item.circuit, offset);
          cells.push(...shiftedChild.cells);
          gunGroups.push(...shiftedChild.gunGroups);
        }
        gateAnchors.push(...shiftedChild.gateAnchors);
        connections.push(...shiftedChild.connections);
        connections.push({
          from: item.child.gate,
          to: node.gate,
          portIndex: item.portIndex,
          expected: item.child.value,
          transform: item.transform,
          transformPhase: item.transformPhase,
          edgePath: item.edgePath,
          alignGeneration,
          cells: targetCells,
          ...(reflectorMetadata ? {
            routeMode: "double-reflector",
            reflectors: Object.freeze(reflectorMetadata),
            reflectedChildTransform,
          } : { routeMode: "direct" }),
        });
      }
    }

    const unique = new Map();
    for (const [row, column] of cells) unique.set(`${row},${column}`, [row, column]);
    return {
      gate: node.gate,
      expected: node.value,
      cells: [...unique.values()],
      inputOrigins: kit.inputOrigins.map((coordinate) => [...coordinate]),
      observeGeneration: kit.observeGeneration + pulseIndex * 30,
      signalCells: kit.signalCells.map((coordinate) => [...coordinate]),
      signalDelta: [...kit.signalDelta],
      terminalCells: kit.terminalCells.map((coordinate) => [...coordinate]),
      gateAnchors,
      connections,
      gunGroups,
    };
  }

  const AXIAL_PAIR_ROUTES = Object.freeze({
    "AND>NOT:0": Object.freeze({
      childTransform: "I",
      parentTransform: "T",
      childOffset: Object.freeze([0, -208]),
      reflectors: Object.freeze([
        Object.freeze({ transform: "FV", offset: Object.freeze([123, -102]), arrival: 275 }),
        Object.freeze({ transform: "I", offset: Object.freeze([-8, -11]), arrival: 640 }),
      ]),
      alignGeneration: 821,
    }),
  });

  function componentCircuit(cells, signalCells, signalDelta, gunGroups = []) {
    return {
      cells: cells.map((coordinate) => [...coordinate]),
      inputOrigins: [],
      signalCells: signalCells.map((coordinate) => [...coordinate]),
      signalDelta: [...signalDelta],
      terminalCells: [],
      gateAnchors: [[0, 0]],
      gunGroups: gunGroups.map((group) => ({
        zoneCells: group.map((coordinate) => [...coordinate]),
        referenceCells: group.map((coordinate) => [...coordinate]),
      })),
      connections: [],
    };
  }

  function shiftCircuit(circuit, [rowOffset, columnOffset]) {
    return {
      ...circuit,
      cells: shiftCoordinates(circuit.cells, rowOffset, columnOffset),
      inputOrigins: shiftCoordinates(circuit.inputOrigins, rowOffset, columnOffset),
      signalCells: shiftCoordinates(circuit.signalCells, rowOffset, columnOffset),
      terminalCells: shiftCoordinates(circuit.terminalCells, rowOffset, columnOffset),
      gateAnchors: shiftCoordinates(circuit.gateAnchors || [[0, 0]], rowOffset, columnOffset),
      gunGroups: circuit.gunGroups.map((group) => ({
        ...group,
        zoneCells: shiftCoordinates(group.zoneCells, rowOffset, columnOffset),
        referenceCells: shiftCoordinates(group.referenceCells, rowOffset, columnOffset),
      })),
      connections: circuit.connections.map((connection) => ({
        ...connection,
        cells: shiftCoordinates(connection.cells, rowOffset, columnOffset),
        ...(connection.reflectors ? {
          reflectors: connection.reflectors.map((reflector) => ({
            ...reflector,
            anchor: [reflector.anchor[0] + rowOffset, reflector.anchor[1] + columnOffset],
          })),
        } : {}),
      })),
    };
  }

  function axialPairParts(node, resolveGateKit) {
    const nested = node?.children?.map((child, portIndex) => ({ child, portIndex }))
      .filter(({ child }) => child?.gate);
    if (!node?.gate || nested?.length !== 1 || nested[0].child.children.some((child) => child?.gate)) {
      return null;
    }
    const { child, portIndex } = nested[0];
    const parentKit = resolveGateKit(node.gate);
    const childCircuit = compileCircuit(child, resolveGateKit);
    if (!parentKit) throw new LogicCodeError(`没有找到可连接门体：${node.gate}`);
    return { child, childCircuit, parentKit, portIndex };
  }

  function transformedParent(node, parentKit, portIndex, transformName) {
    const transform = COORDINATE_TRANSFORMS[transformName];
    const parent = transformCircuit(componentCircuit(
      parentKit.bodyCells, parentKit.signalCells, parentKit.signalDelta, parentKit.bodyGunGroups,
    ), transformName);
    const cells = [...parent.cells];
    const gunGroups = [...parent.gunGroups];
    node.children.forEach((input, inputPortIndex) => {
      if (inputPortIndex === portIndex || input?.gate) return;
      const origin = parentKit.inputOrigins[inputPortIndex];
      const source = input.value ? parentKit.inputTrueCells : parentKit.inputFalseCells;
      cells.push(...transformCoordinates(shiftCoordinates(source, ...origin), transform));
      const gunCells = transformCoordinates(
        shiftCoordinates(parentKit.inputGunCells, ...origin), transform,
      );
      gunGroups.push({
        zoneCells: gunCells,
        referenceCells: transformCoordinates(shiftCoordinates(source, ...origin), transform),
      });
    });
    return {
      parent: { ...parent, cells: uniqueCoordinates(cells), gunGroups },
      inputOrigins: transformCoordinates(parentKit.inputOrigins, transform),
      terminalCells: transformCoordinates(parentKit.terminalCells, transform),
      targetCells: portIndex === undefined ? [] : transformCoordinates(
        shiftCoordinates(parentKit.inputSignalCells, ...parentKit.inputOrigins[portIndex]),
        transform,
      ),
    };
  }

  function directAxialCandidates(node, parts) {
    const candidates = [];
    let geometryAttempts = 0;
    for (const childTransform of Object.keys(COORDINATE_TRANSFORMS)) {
      const child = transformCircuit(parts.childCircuit, childTransform);
      const firstPulse = Math.max(0, Math.ceil((
        child.observeGeneration + 120 - parts.parentKit.inputSignalGeneration
      ) / 30));
      const alignGenerations = Array.from(
        { length: 32 },
        (_, index) => parts.parentKit.inputSignalGeneration + (firstPulse + index) * 30,
      );
      const sourceAtGeneration = new Map();
      let sourceCells = child.signalCells;
      let generation = child.observeGeneration;
      const wanted = new Set(alignGenerations);
      const lastGeneration = alignGenerations[alignGenerations.length - 1];
      while (generation <= lastGeneration) {
        if (wanted.has(generation)) sourceAtGeneration.set(generation, sourceCells);
        if (generation < lastGeneration) sourceCells = advanceCells(sourceCells, 1);
        generation += 1;
      }
      for (const parentTransform of Object.keys(COORDINATE_TRANSFORMS)) {
        const parentParts = transformedParent(
          node, parts.parentKit, parts.portIndex, parentTransform,
        );
        for (let index = 0; index < alignGenerations.length; index += 1) {
          const pulseIndex = firstPulse + index;
          geometryAttempts += 1;
          const alignGeneration = alignGenerations[index];
          const alignedSourceCells = sourceAtGeneration.get(alignGeneration);
          if (canonicalShape(alignedSourceCells) !== canonicalShape(parentParts.targetCells)) continue;
          const offset = alignCoordinates(alignedSourceCells, parentParts.targetCells);
          if (offset[0] !== 0 || offset[1] >= 0) continue;
          const shiftedChild = shiftCircuit(child, offset);
          candidates.push({
            gate: node.gate,
            expected: node.value,
            cells: uniqueCoordinates([...parentParts.parent.cells, ...shiftedChild.cells]),
            inputOrigins: parentParts.inputOrigins,
            observeGeneration: parts.parentKit.observeGeneration + pulseIndex * 30,
            signalCells: parentParts.parent.signalCells,
            signalDelta: parentParts.parent.signalDelta,
            terminalCells: parentParts.terminalCells,
            gateAnchors: [[0, 0], ...shiftedChild.gateAnchors],
            connections: [
              ...shiftedChild.connections,
              {
                from: parts.child.gate,
                to: node.gate,
                portIndex: parts.portIndex,
                expected: parts.child.value,
                alignGeneration,
                cells: parentParts.targetCells,
                routeMode: "direct",
                childTransform,
                parentTransform,
              },
            ],
            gunGroups: [...parentParts.parent.gunGroups, ...shiftedChild.gunGroups],
            routingMode: "axial",
            routeStage: "direct",
          });
        }
      }
    }
    return { candidates, geometryAttempts };
  }

  function reflectedAxialCandidate(node, parts, resolveReflectorKit) {
    const route = AXIAL_PAIR_ROUTES[
      `${parts.child.gate}>${node.gate}:${parts.portIndex}`
    ];
    if (!route) return null;
    const reflectorKit = resolveReflectorKit?.("P5_90");
    if (!reflectorKit || reflectorKit.acceptedSignalPeriod !== 30) {
      throw new LogicCodeError("同轴线路缺少兼容 p30 信号的反射器");
    }

    const childCircuit = shiftCircuit(transformCircuit(
      parts.childCircuit, route.childTransform,
    ), route.childOffset);
    const parentParts = transformedParent(
      node, parts.parentKit, parts.portIndex, route.parentTransform,
    );

    const cells = [...parentParts.parent.cells, ...childCircuit.cells];
    const gunGroups = [...parentParts.parent.gunGroups, ...childCircuit.gunGroups];
    const reflectorMetadata = [];
    for (const reflector of route.reflectors) {
      const transformed = transformCircuit(componentCircuit(
        reflectorKit.bodyCells, reflectorKit.outputSignalCells, reflectorKit.signalDelta,
      ), reflector.transform);
      const bodyCells = shiftCoordinates(transformed.cells, ...reflector.offset);
      const inputCells = shiftCoordinates(transformCoordinates(
        reflectorKit.inputSignalCells, COORDINATE_TRANSFORMS[reflector.transform],
      ), ...reflector.offset);
      cells.push(...bodyCells);
      const referenceCells = parts.child.value
        ? [...bodyCells, ...signalTrainReference(inputCells, reflector.arrival, 1600)]
        : bodyCells;
      gunGroups.push({
        zoneCells: bodyCells,
        referenceCells: uniqueCoordinates(referenceCells),
        phaseCache: false,
      });
      reflectorMetadata.push(Object.freeze({
        transform: reflector.transform,
        anchor: Object.freeze([...reflector.offset]),
        arrivalGeneration: reflector.arrival,
      }));
    }

    const pulseIndex = (
      route.alignGeneration - parts.parentKit.inputSignalGeneration
    ) / 30;
    return {
      gate: node.gate,
      expected: node.value,
      cells: uniqueCoordinates(cells),
      inputOrigins: parentParts.inputOrigins,
      observeGeneration: parts.parentKit.observeGeneration + pulseIndex * 30,
      signalCells: parentParts.parent.signalCells,
      signalDelta: parentParts.parent.signalDelta,
      terminalCells: parentParts.terminalCells,
      gateAnchors: [[0, 0], ...childCircuit.gateAnchors],
      connections: [
        ...childCircuit.connections,
        {
          from: parts.child.gate,
          to: node.gate,
          portIndex: parts.portIndex,
          expected: parts.child.value,
          alignGeneration: route.alignGeneration,
          cells: parentParts.targetCells,
          routeMode: "double-reflector",
          reflectors: Object.freeze(reflectorMetadata),
        },
      ],
      gunGroups,
      routingMode: "axial",
      routeStage: "reflected",
    };
  }

  function compileAxialPairCandidates(node, resolveGateKit, resolveReflectorKit) {
    const parts = axialPairParts(node, resolveGateKit);
    if (!parts) return null;
    const direct = directAxialCandidates(node, parts);
    const reflected = reflectedAxialCandidate(node, parts, resolveReflectorKit);
    return Object.freeze({
      direct: Object.freeze(direct.candidates),
      directGeometryAttempts: direct.geometryAttempts,
      reflected: Object.freeze(reflected ? [reflected] : []),
    });
  }

  function compileAxialPair(node, resolveGateKit, resolveReflectorKit) {
    const candidates = compileAxialPairCandidates(
      node, resolveGateKit, resolveReflectorKit,
    );
    return candidates?.direct[0] || candidates?.reflected[0] || null;
  }

  // A single-path chain may include AND and OR with a constant on the other port.
  // Every occurrence remains a separate copy of its kit.
  function collectAxialChain(node) {
    const chain = [];
    while (node?.gate) {
      const nestedPorts = node.children.flatMap((child, port) => child.gate ? [port] : []);
      if (nestedPorts.length > 1) return null;
      const [port] = nestedPorts;
      chain.push({ node, port });
      node = node.children[port];
    }
    return chain.length >= 3 ? chain.reverse() : null;
  }

  function gliderTrack(cells) {
    const phases = [];
    let frame = cells;
    for (let index = 0; index < 4; index += 1) {
      phases.push({ cells: frame, shape: canonicalShape(frame) });
      frame = advanceCells(frame, 1);
    }
    const delta = alignCoordinates(cells, frame);
    return {
      delta,
      at(delay) {
        const phase = phases[((delay % 4) + 4) % 4];
        const cycles = Math.floor(delay / 4);
        return {
          shape: phase.shape,
          cells: shiftCoordinates(phase.cells, cycles * delta[0], cycles * delta[1]),
        };
      },
    };
  }

  function finishAxialRoute(track, target, anchor = [0, 0]) {
    for (let phase = 0; phase < 4; phase += 1) {
      const frame = track.at(phase);
      if (frame.shape !== target.shape) continue;
      const [row, column] = alignCoordinates(target.cells, frame.cells);
      const cycles = -(row + anchor[0]) * track.delta[0];
      return {
        delay: phase + 4 * cycles,
        column: column + anchor[1] + cycles * track.delta[1],
      };
    }
    return null;
  }

  const AXIAL_CHAIN_TRANSFORMS = Object.freeze(["T", "R270", "I", "FV"]);

  function chainOrientations(kit, port, reverseOrder) {
    const names = reverseOrder ? [...AXIAL_CHAIN_TRANSFORMS].reverse() : AXIAL_CHAIN_TRANSFORMS;
    return names.flatMap((name) => {
      const transform = COORDINATE_TRANSFORMS[name];
      if (transform(kit.signalDelta)[1] !== 1) return [];
      const input = port === undefined ? null : transformCoordinates(
        shiftCoordinates(kit.inputSignalCells, ...kit.inputOrigins[port]), transform,
      );
      return [{
        name, track: gliderTrack(transformCoordinates(kit.signalCells, transform)),
        target: input && { cells: input, shape: canonicalShape(input) },
      }];
    });
  }

  function chainReflectorOrientations(kit) {
    return AXIAL_CHAIN_TRANSFORMS.flatMap((name) => {
      const transform = COORDINATE_TRANSFORMS[name];
      const input = transformCoordinates(kit.inputSignalCells, transform);
      if (gliderTrack(input).delta[1] !== 1 || transform(kit.signalDelta)[1] !== 1) return [];
      return [{
        name, input, shape: canonicalShape(input),
        output: gliderTrack(transformCoordinates(kit.outputSignalCells, transform)),
      }];
    });
  }

  function reflectedChainLink(source, target, reflectors, outputDelay, spacing) {
    let best = null;
    function consider(track, anchor, wait, path) {
      const tail = finishAxialRoute(track, target, anchor);
      if (!tail || tail.delay < 60 || tail.column < spacing - 24 || tail.column > spacing + 80) return;
      const score = path.length * 1000 + Math.abs(tail.column - spacing);
      if (!best || score < best.score) {
        best = { column: tail.column, delay: wait + tail.delay, reflectors: path, score };
      }
    }
    // Moving a reflector by one cell along the incoming track preserves its
    // glider phase and changes the flight by four generations.
    for (let phase = 0; phase < 4; phase += 1) {
      for (const first of reflectors) {
        const match = source.at(phase);
        if (match.shape !== first.shape) continue;
        for (let flight = 60 + phase; flight <= 4 * (spacing + 48); flight += 16) {
          const firstAnchor = alignCoordinates(first.input, source.at(flight).cells);
          const firstStep = { name: first.name, anchor: firstAnchor, delay: flight };
          const wait = flight + outputDelay;
          consider(first.output, firstAnchor, wait, [firstStep]);
          if (best?.reflectors.length === 1) continue;
          for (const second of reflectors) {
            for (let midPhase = 0; midPhase < 4; midPhase += 1) {
              if (first.output.at(midPhase).shape !== second.shape) continue;
              for (let middle = 60 + midPhase; middle <= 4 * (spacing + 64); middle += 8) {
                const incident = shiftCoordinates(first.output.at(middle).cells, ...firstAnchor);
                const anchor = alignCoordinates(second.input, incident);
                const delay = wait + middle;
                consider(second.output, anchor, delay + outputDelay, [
                  firstStep, { name: second.name, anchor, delay },
                ]);
              }
            }
          }
        }
      }
    }
    return best;
  }

  function compileAxialChainCandidate(chain, resolveGateKit, reflectorKit, options) {
    const kits = chain.map(({ node }) => resolveGateKit(node.gate));
    if (kits.some((kit) => !kit)) throw new LogicCodeError("同排线路缺少基础门体");
    const orientations = kits.map((kit, index) => chainOrientations(
      kit, chain[index].port, options.reverseOrder,
    ));
    const reflectors = reflectorKit?.acceptedSignalPeriod === 30
      ? chainReflectorOrientations(reflectorKit)
      : [];
    // Keep the best prefix for each orientation. The next link depends on
    // that orientation and the port, not on the preceding expression.
    let prefixes = orientations[0].map((orientation) => ({
      orientation, score: 0, previous: null, link: null, hasReflection: false,
    }));
    const reflectedCache = new Map();
    for (let index = 1; index < chain.length; index += 1) {
      const next = [];
      for (const orientation of orientations[index]) {
        const best = [null, null];
        for (const prefix of prefixes) {
          const from = prefix.orientation;
          const route = finishAxialRoute(from.track, orientation.target);
          const links = [];
          if (route?.column >= 52 && route.delay >= 48) {
            links.push({ ...route, reflectors: [], score: route.column / 100 });
          }
          if (reflectors.length) {
            const key = [kits[index - 1].gate, from.name, kits[index].gate,
              orientation.name, chain[index].port].join(":");
            if (!reflectedCache.has(key)) {
              reflectedCache.set(key, reflectedChainLink(
                from.track, orientation.target, reflectors, reflectorKit.outputDelay,
                options.spacing,
              ));
            }
            const reflected = reflectedCache.get(key);
            if (reflected) links.push(reflected);
          }
          for (const link of links) {
            const score = prefix.score + link.score;
            const hasReflection = prefix.hasReflection || link.reflectors.length > 0;
            const kind = Number(hasReflection);
            if (!best[kind] || score < best[kind].score) {
              best[kind] = { orientation, score, previous: prefix, link, hasReflection };
            }
          }
        }
        next.push(...best.filter(Boolean));
      }
      if (!next.length) return null;
      prefixes = next;
    }
    if (reflectorKit) prefixes = prefixes.filter((prefix) => prefix.hasReflection);
    if (!prefixes.length) return null;
    let entry = prefixes.reduce((best, item) => item.score < best.score ? item : best);
    const placements = [];
    while (entry) {
      placements.push(entry);
      entry = entry.previous;
    }
    placements.reverse();

    let column = 0;
    let observeGeneration = 0;
    const cells = [];
    const connections = [];
    const gunGroups = [];
    const gateAnchors = [];
    let root;
    for (let index = 0; index < chain.length; index += 1) {
      const { node, port } = chain[index];
      const { link, orientation } = placements[index];
      const kit = kits[index];
      let phase = 0;
      if (link) {
        const alignGeneration = observeGeneration + link.delay;
        const metadata = link.reflectors.map((reflector) => {
          const anchor = [reflector.anchor[0], reflector.anchor[1] + column];
          const arrivalGeneration = observeGeneration + reflector.delay;
          const oscillatorPhase = (reflectorKit.oscillatorPeriod
            - arrivalGeneration % reflectorKit.oscillatorPeriod) % reflectorKit.oscillatorPeriod;
          const place = (coordinates) => shiftCoordinates(transformCoordinates(
            coordinates, COORDINATE_TRANSFORMS[reflector.name],
          ), ...anchor);
          const body = place(advanceCells(reflectorKit.bodyCells, oscillatorPhase));
          cells.push(...body);
          gunGroups.push({
            zoneCells: place(reflectorKit.bodyCells), referenceCells: body,
            incident: { cells: place(reflectorKit.inputSignalCells), generation: arrivalGeneration },
          });
          return { transform: reflector.name, anchor, arrivalGeneration };
        });
        column += link.column;
        // NOT's isolated pulse collision needs an offset to avoid residues
        // when a finite burst from the upstream gate starts or stops.
        const offset = node.gate === "NOT" ? options.notPhase : 0;
        phase = ((kit.inputSignalGeneration - alignGeneration + offset) % 30 + 30) % 30;
        observeGeneration = alignGeneration + kit.observeGeneration
          - kit.inputSignalGeneration - offset + 60;
        connections.push({
          from: chain[index - 1].node.gate,
          to: node.gate, portIndex: port,
          expected: node.children[port].value,
          alignGeneration,
          cells: shiftCoordinates(orientation.target.cells, 0, column),
          routeMode: ["direct", "single-reflector", "double-reflector"][metadata.length],
          ...(metadata.length ? { reflectors: metadata } : {}),
        });
      } else observeGeneration = kit.observeGeneration;
      const module = transformedParent(node, kit, port, orientation.name);
      const placed = shiftCircuit({
        ...module.parent,
        cells: advanceCells(module.parent.cells, phase),
        gunGroups: module.parent.gunGroups.map((group) => ({
          ...group, referenceCells: advanceCells(group.referenceCells, phase),
        })),
        inputOrigins: module.inputOrigins,
        terminalCells: module.terminalCells,
      }, [0, column]);
      cells.push(...placed.cells);
      gunGroups.push(...placed.gunGroups);
      gateAnchors.push([0, column]);
      root = placed;
    }
    if (uniqueCoordinates(cells).length !== cells.length) return null;
    return {
      ...root, gate: chain.at(-1).node.gate, expected: chain.at(-1).node.value,
      cells, gunGroups, gateAnchors, connections, observeGeneration,
      verifySignals: true,
    };
  }

  function normalizeCircuit(circuit) {
    const metadataCells = [
      ...circuit.cells,
      ...circuit.inputOrigins,
      ...circuit.signalCells,
      ...circuit.terminalCells,
      ...(circuit.gateAnchors || []),
      ...circuit.connections.flatMap((connection) => connection.cells),
      ...circuit.gunGroups.flatMap((group) => group.zoneCells),
    ];
    let minRow = Infinity;
    let minColumn = Infinity;
    for (const [row, column] of metadataCells) {
      minRow = Math.min(minRow, row);
      minColumn = Math.min(minColumn, column);
    }
    const shift = (coordinates) => shiftCoordinates(coordinates, -minRow, -minColumn);
    const cells = shift(circuit.cells);
    const allShifted = [
      ...cells,
      ...shift(circuit.inputOrigins),
      ...shift(circuit.signalCells),
      ...shift(circuit.terminalCells),
      ...shift(circuit.gateAnchors || []),
      ...circuit.connections.flatMap((connection) => shift(connection.cells)),
      ...circuit.gunGroups.flatMap((group) => shift(group.zoneCells)),
    ];
    return {
      cells,
      width: allShifted.reduce((width, [, column]) => Math.max(width, column + 1), 0),
      height: allShifted.reduce((height, [row]) => Math.max(height, row + 1), 0),
      inputOrigins: shift(circuit.inputOrigins),
      signalCells: shift(circuit.signalCells),
      terminalCells: shift(circuit.terminalCells),
      gateAnchors: shift(circuit.gateAnchors || []),
      connections: circuit.connections.map((connection) => Object.freeze({
        ...connection,
        cells: Object.freeze(shift(connection.cells).map(Object.freeze)),
        ...(connection.reflectors ? {
          reflectors: Object.freeze(connection.reflectors.map((reflector) => Object.freeze({
            ...reflector,
            anchor: Object.freeze([
              reflector.anchor[0] - minRow,
              reflector.anchor[1] - minColumn,
            ]),
          }))),
        } : {}),
      })),
      gunGroups: circuit.gunGroups.map((group) => ({
        ...group,
        zoneCells: shift(group.zoneCells),
        referenceCells: shift(group.referenceCells),
        ...(group.incident ? { incident: { ...group.incident, cells: shift(group.incident.cells) } } : {}),
      })),
      ...(circuit.verifySignals ? {
        outputProbe: {
          cells: shift(circuit.signalCells), generation: circuit.observeGeneration, expected: circuit.expected,
        },
      } : {}),
    };
  }

  return Object.freeze({
    collectAxialChain, collectNestedEdges, compileAxialChainCandidate, compileAxialPair,
    compileAxialPairCandidates, compileCircuit, normalizeCircuit,
    orientSouthEast, phaseShiftCircuit, transformCircuit,
    transformNames: Object.freeze(Object.keys(COORDINATE_TRANSFORMS)),
  });
});
