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

  function mirrorCoordinates(coordinates) {
    return coordinates.map(([row, column]) => [row, -column]);
  }

  function advanceCells(coordinates, generations) {
    let cells = new Set(coordinates.map(([row, column]) => `${row},${column}`));
    for (let generation = 0; generation < generations; generation += 1) {
      cells = LifeEngine.nextCellSet(cells);
    }
    return [...cells].map((key) => key.split(",").map(Number));
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

  function orientSouthEast(circuit) {
    if (circuit.signalDelta[1] >= 0) return circuit;
    return {
      ...circuit,
      cells: mirrorCoordinates(circuit.cells),
      inputOrigins: mirrorCoordinates(circuit.inputOrigins),
      signalCells: mirrorCoordinates(circuit.signalCells),
      signalDelta: [circuit.signalDelta[0], -circuit.signalDelta[1]],
      terminalCells: mirrorCoordinates(circuit.terminalCells),
      gunGroups: circuit.gunGroups.map((group) => ({
        zoneCells: mirrorCoordinates(group.zoneCells),
        referenceCells: mirrorCoordinates(group.referenceCells),
      })),
      connections: circuit.connections.map((connection) => ({
        ...connection,
        cells: mirrorCoordinates(connection.cells),
      })),
    };
  }

  function transposeCircuit(circuit) {
    const transpose = (coordinates) => coordinates.map(([row, column]) => [column, row]);
    return {
      ...circuit,
      cells: transpose(circuit.cells),
      inputOrigins: transpose(circuit.inputOrigins),
      signalCells: transpose(circuit.signalCells),
      signalDelta: [circuit.signalDelta[1], circuit.signalDelta[0]],
      terminalCells: transpose(circuit.terminalCells),
      gunGroups: circuit.gunGroups.map((group) => ({
        zoneCells: transpose(group.zoneCells),
        referenceCells: transpose(group.referenceCells),
      })),
      connections: circuit.connections.map((connection) => ({
        ...connection,
        cells: transpose(connection.cells),
      })),
    };
  }

  function phaseShiftCircuit(circuit, generations) {
    return {
      ...circuit,
      cells: advanceCells(circuit.cells, generations),
      signalCells: advanceCells(circuit.signalCells, generations),
      terminalCells: advanceCells(circuit.terminalCells, generations),
      gunGroups: circuit.gunGroups.map((group) => ({
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

  function compileCircuit(
    node, resolveGateKit, routePadding = 240, layoutVariant = 0,
    branchPulseSpacing = 20, depth = 0,
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
      let circuit = orientSouthEast(compileCircuit(
        child, resolveGateKit, routePadding, layoutVariant, branchPulseSpacing, depth + 1,
      ));
      if (shouldTransposeNested(layoutVariant, depth, nested.length, nestedCount)) {
        circuit = phaseShiftCircuit(transposeCircuit(circuit), 2);
      }
      nested.push({
        child,
        portIndex,
        origin,
        circuit,
        pulseIndex: nested.length * branchPulseSpacing,
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
      pulseIndex = Math.max(0, Math.ceil((latestSource + routePadding - kit.inputSignalGeneration) / 30));
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
        const [rowOffset, columnOffset] = alignCoordinates(sourceCells, targetCells);
        cells.push(...shiftCoordinates(item.circuit.cells, rowOffset, columnOffset));
        gunGroups.push(...item.circuit.gunGroups.map((group) => ({
          zoneCells: shiftCoordinates(group.zoneCells, rowOffset, columnOffset),
          referenceCells: shiftCoordinates(group.referenceCells, rowOffset, columnOffset),
        })));
        connections.push(...item.circuit.connections.map((connection) => ({
          ...connection,
          cells: shiftCoordinates(connection.cells, rowOffset, columnOffset),
        })));
        connections.push({
          from: item.child.gate,
          to: node.gate,
          portIndex: item.portIndex,
          expected: item.child.value,
          alignGeneration,
          cells: targetCells,
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
      connections,
      gunGroups,
    };
  }

  function normalizeCircuit(circuit) {
    const metadataCells = [
      ...circuit.cells,
      ...circuit.inputOrigins,
      ...circuit.signalCells,
      ...circuit.terminalCells,
      ...circuit.connections.flatMap((connection) => connection.cells),
      ...circuit.gunGroups.flatMap((group) => [...group.zoneCells, ...group.referenceCells]),
    ];
    const minRow = Math.min(...metadataCells.map(([row]) => row));
    const minColumn = Math.min(...metadataCells.map(([, column]) => column));
    const shift = (coordinates) => shiftCoordinates(coordinates, -minRow, -minColumn);
    const cells = shift(circuit.cells);
    const allShifted = [
      ...cells,
      ...shift(circuit.inputOrigins),
      ...shift(circuit.signalCells),
      ...shift(circuit.terminalCells),
      ...circuit.connections.flatMap((connection) => shift(connection.cells)),
      ...circuit.gunGroups.flatMap((group) => [...shift(group.zoneCells), ...shift(group.referenceCells)]),
    ];
    return {
      cells,
      width: Math.max(...allShifted.map(([, column]) => column)) + 1,
      height: Math.max(...allShifted.map(([row]) => row)) + 1,
      inputOrigins: shift(circuit.inputOrigins),
      signalCells: shift(circuit.signalCells),
      terminalCells: shift(circuit.terminalCells),
      connections: circuit.connections.map((connection) => Object.freeze({
        ...connection,
        cells: Object.freeze(shift(connection.cells).map(Object.freeze)),
      })),
      gunGroups: circuit.gunGroups.map((group) => ({
        zoneCells: shift(group.zoneCells),
        referenceCells: shift(group.referenceCells),
      })),
    };
  }

  return Object.freeze({ compileCircuit, normalizeCircuit, orientSouthEast, phaseShiftCircuit });
});
