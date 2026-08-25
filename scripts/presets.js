(function exposePresets(root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  root.LifePresets = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function createPresets() {
  "use strict";

  function definePreset(definition) {
    const preset = {
      ...definition,
      cells: Object.freeze(definition.cells.map((coordinate) => Object.freeze(coordinate))),
    };
    if (definition.logic) {
      preset.logic = Object.freeze({
        ...definition.logic,
        inputs: Object.freeze([...definition.logic.inputs]),
        inputOrigins: Object.freeze(definition.logic.inputOrigins.map((coordinate) => Object.freeze(coordinate))),
        signalCells: Object.freeze(definition.logic.signalCells.map((coordinate) => Object.freeze(coordinate))),
        signalDelta: Object.freeze([...definition.logic.signalDelta]),
        terminalCells: Object.freeze(definition.logic.terminalCells.map((coordinate) => Object.freeze(coordinate))),
      });
    }
    return Object.freeze(preset);
  }

  // Standard p30 gun/eater components, independently reconstructed and behavior-tested
  // from Jean-Philippe Rennard's published LogiCell logic-gate method.
  const LOGIC_PRIMITIVES = Object.freeze({
    gun: Object.freeze([
      "000000400", "000000500", "00C0000C0", "0220000C3", "0410000C3",
      "CD1008500", "C41004400", "02201C000", "00C000000",
    ]),
    inputFalse: Object.freeze([
      "000000400", "000000500", "00C0000C0", "0220000C3", "0410000C3",
      "CD1008500", "C41004400", "02201C000", "00C000000", "000000000",
      "000001800", "000001000", "000000E00", "000000200",
    ]),
    inputTrue: Object.freeze([
      "000000400", "000000500", "00C0000C0", "0220000C3", "0410000C3",
      "CD1008500", "C41004400", "02201C000", "00C000000", "000000000",
      "000001800", "000001000", "000001E00", "000000200",
    ]),
    eater: Object.freeze(["C", "8", "7", "1"]),
  });

  function primitiveCells(kind, column, row, mirrorHorizontal = false) {
    const lines = LOGIC_PRIMITIVES[kind];
    const cells = [];
    for (let relativeRow = 0; relativeRow < lines.length; relativeRow += 1) {
      let bits = [...lines[relativeRow]]
        .map((digit) => Number.parseInt(digit, 16).toString(2).padStart(4, "0"))
        .join("");
      if (mirrorHorizontal) bits = [...bits].reverse().join("");
      for (let relativeColumn = 0; relativeColumn < bits.length; relativeColumn += 1) {
        if (bits[relativeColumn] === "1") cells.push([row + relativeRow, column + relativeColumn]);
      }
    }
    return cells;
  }

  function blockCells(row, column) {
    return [[row, column], [row, column + 1], [row + 1, column], [row + 1, column + 1]];
  }

  function normalizeLogicPattern(parts, logic) {
    const unique = new Map();
    for (const [row, column] of parts.flat()) unique.set(`${row},${column}`, [row, column]);
    const absolute = [...unique.values()];
    const minRow = Math.min(...absolute.map(([row]) => row));
    const minColumn = Math.min(...absolute.map(([, column]) => column));
    const normalized = absolute.map(([row, column]) => [row - minRow, column - minColumn]);
    const maxRow = Math.max(...normalized.map(([row]) => row));
    const maxColumn = Math.max(...normalized.map(([, column]) => column));
    return {
      width: maxColumn + 1,
      height: maxRow + 1,
      cells: normalized,
      logic: {
        ...logic,
        inputOrigins: logic.inputOrigins.map(([row, column]) => [row - minRow, column - minColumn]),
        signalCells: logic.signalCells.map(([row, column]) => [row - minRow, column - minColumn]),
        terminalCells: logic.terminalCells.map(([row, column]) => [row - minRow, column - minColumn]),
      },
    };
  }

  function logicNot(input) {
    const terminalCells = blockCells(26, 43);
    return normalizeLogicPattern(
      [
        primitiveCells(input ? "inputTrue" : "inputFalse", 0, 0),
        primitiveCells("gun", 41, 0, true),
        terminalCells,
      ],
      {
        gate: "NOT",
        inputs: [Number(input)],
        inputOrigins: [[0, 0]],
        expected: Number(!input),
        observeGeneration: 83,
        signalCells: [[26, 36], [27, 34], [27, 35], [28, 35], [28, 36]],
        signalDelta: [1, -1],
        terminalCells,
      },
    );
  }

  function logicAnd(left, right) {
    const terminalCells = blockCells(61, 15);
    return normalizeLogicPattern(
      [
        primitiveCells(left ? "inputTrue" : "inputFalse", 0, 0),
        primitiveCells(right ? "inputTrue" : "inputFalse", -42, 1),
        primitiveCells("gun", 41, 0, true),
        primitiveCells("eater", 11, 49, true),
        terminalCells,
      ],
      {
        gate: "AND",
        inputs: [Number(left), Number(right)],
        inputOrigins: [[0, 0], [1, -42]],
        expected: Number(left && right),
        observeGeneration: 150,
        signalCells: [[44, 16], [45, 14], [45, 16], [46, 15], [46, 16]],
        signalDelta: [1, 1],
        terminalCells,
      },
    );
  }

  function logicOr(left, right) {
    const terminalCells = blockCells(68, 11);
    return normalizeLogicPattern(
      [
        primitiveCells(left ? "inputTrue" : "inputFalse", 0, 0),
        primitiveCells(right ? "inputTrue" : "inputFalse", -42, 1),
        primitiveCells("gun", -88, 0),
        primitiveCells("gun", 41, 0, true),
        primitiveCells("eater", 20, 50),
        terminalCells,
      ],
      {
        gate: "OR",
        inputs: [Number(left), Number(right)],
        inputOrigins: [[0, 0], [1, -42]],
        expected: Number(left || right),
        observeGeneration: 243,
        signalCells: [[66, -8], [67, -7], [67, -6], [68, -8], [68, -7]],
        signalDelta: [1, 1],
        terminalCells,
      },
    );
  }

  function logicPreset(definition, pattern) {
    return definePreset({ ...definition, ...pattern });
  }

  const INPUT_SIGNAL_GENERATION = 41;
  const INPUT_SIGNAL_CELLS = Object.freeze([
    [16, 29], [16, 31], [17, 30], [17, 31], [18, 30],
  ].map((coordinate) => Object.freeze(coordinate)));

  function freezeCoordinates(coordinates) {
    return Object.freeze(coordinates.map((coordinate) => Object.freeze([...coordinate])));
  }

  function logicGateKit(gate) {
    const builders = { NOT: () => logicNot(false), AND: () => logicAnd(false, false), OR: () => logicOr(false, false) };
    const rawOrigins = gate === "NOT" ? [[0, 0]] : [[0, 0], [1, -42]];
    const build = builders[gate];
    if (!build) return null;
    const pattern = build();
    const rowShift = pattern.logic.inputOrigins[0][0] - rawOrigins[0][0];
    const columnShift = pattern.logic.inputOrigins[0][1] - rawOrigins[0][1];
    const inputCellKeys = new Set();
    for (const [rawRow, rawColumn] of rawOrigins) {
      for (const [row, column] of primitiveCells("inputFalse", rawColumn, rawRow)) {
        inputCellKeys.add(`${row + rowShift},${column + columnShift}`);
      }
    }
    const bodyCells = pattern.cells.filter(([row, column]) => !inputCellKeys.has(`${row},${column}`));
    const eaterCells = gate === "OR"
      ? primitiveCells("eater", 20, 50).map(([row, column]) => [row + rowShift, column + columnShift])
      : [];
    const rawBodyGuns = gate === "OR"
      ? [primitiveCells("gun", -88, 0), primitiveCells("gun", 41, 0, true)]
      : [primitiveCells("gun", 41, 0, true)];
    const bodyGunGroups = rawBodyGuns.map((cells) => cells.map(
      ([row, column]) => [row + rowShift, column + columnShift],
    ));
    return Object.freeze({
      gate,
      bodyCells: freezeCoordinates(bodyCells),
      inputFalseCells: freezeCoordinates(primitiveCells("inputFalse", 0, 0)),
      inputTrueCells: freezeCoordinates(primitiveCells("inputTrue", 0, 0)),
      inputGunCells: freezeCoordinates(primitiveCells("gun", 0, 0)),
      bodyGunGroups: Object.freeze(bodyGunGroups.map(freezeCoordinates)),
      inputOrigins: freezeCoordinates(pattern.logic.inputOrigins),
      inputSignalGeneration: INPUT_SIGNAL_GENERATION,
      inputSignalCells: INPUT_SIGNAL_CELLS,
      observeGeneration: pattern.logic.observeGeneration,
      signalCells: freezeCoordinates(pattern.logic.signalCells),
      signalDelta: Object.freeze([...pattern.logic.signalDelta]),
      terminalCells: freezeCoordinates(pattern.logic.terminalCells),
      eaterCells: freezeCoordinates(eaterCells),
    });
  }

  const LOGIC_GATE_KITS = Object.freeze({
    NOT: logicGateKit("NOT"),
    AND: logicGateKit("AND"),
    OR: logicGateKit("OR"),
  });

  const presets = Object.freeze([
    definePreset({
      id: "glider",
      name: "滑翔机",
      description: "每 4 代向右下移动一格",
      width: 3,
      height: 3,
      cells: [[0, 1], [1, 2], [2, 0], [2, 1], [2, 2]],
    }),
    definePreset({
      id: "block",
      name: "方块",
      description: "最小且最常见的静物",
      width: 2,
      height: 2,
      cells: [[0, 0], [0, 1], [1, 0], [1, 1]],
    }),
    definePreset({
      id: "beehive",
      name: "蜂巢",
      description: "六个细胞组成的常见静物",
      width: 4,
      height: 3,
      cells: [[0, 1], [0, 2], [1, 0], [1, 3], [2, 1], [2, 2]],
    }),
    definePreset({
      id: "loaf",
      name: "面包",
      description: "七个细胞组成的不对称静物",
      width: 4,
      height: 4,
      cells: [[0, 1], [0, 2], [1, 0], [1, 3], [2, 1], [2, 3], [3, 2]],
    }),
    definePreset({
      id: "boat",
      name: "小船",
      description: "五个细胞组成的紧凑静物",
      width: 3,
      height: 3,
      cells: [[0, 0], [0, 1], [1, 0], [1, 2], [2, 1]],
    }),
    definePreset({
      id: "blinker",
      name: "闪烁器",
      description: "周期为 2 的最小振荡器",
      width: 3,
      height: 1,
      cells: [[0, 0], [0, 1], [0, 2]],
    }),
    definePreset({
      id: "toad",
      name: "蟾蜍",
      description: "六个细胞组成的周期 2 振荡器",
      width: 4,
      height: 2,
      cells: [[0, 1], [0, 2], [0, 3], [1, 0], [1, 1], [1, 2]],
    }),
    definePreset({
      id: "beacon",
      name: "信标",
      description: "两组方块构成的周期 2 振荡器",
      width: 4,
      height: 4,
      cells: [[0, 0], [0, 1], [1, 0], [1, 1], [2, 2], [2, 3], [3, 2], [3, 3]],
    }),
    definePreset({
      id: "pulsar",
      name: "脉冲星",
      description: "周期为 3 的大型振荡器",
      width: 13,
      height: 13,
      cells: [
        [0,2],[0,3],[0,4],[0,8],[0,9],[0,10],
        [2,0],[2,5],[2,7],[2,12],[3,0],[3,5],[3,7],[3,12],[4,0],[4,5],[4,7],[4,12],
        [5,2],[5,3],[5,4],[5,8],[5,9],[5,10],
        [7,2],[7,3],[7,4],[7,8],[7,9],[7,10],
        [8,0],[8,5],[8,7],[8,12],[9,0],[9,5],[9,7],[9,12],[10,0],[10,5],[10,7],[10,12],
        [12,2],[12,3],[12,4],[12,8],[12,9],[12,10],
      ],
    }),
    definePreset({
      id: "lightweight-spaceship",
      name: "轻量级飞船",
      description: "每 4 代向右移动两格",
      width: 5,
      height: 4,
      cells: [
        [0, 1], [0, 4],
        [1, 0],
        [2, 0], [2, 4],
        [3, 0], [3, 1], [3, 2], [3, 3],
      ],
    }),
    definePreset({
      id: "r-pentomino",
      name: "R-五连块",
      description: "会长时间剧烈演化的经典五细胞图案",
      width: 3,
      height: 3,
      cells: [[0, 1], [0, 2], [1, 0], [1, 1], [2, 1]],
    }),
    definePreset({
      id: "acorn",
      name: "橡果",
      description: "仅七个细胞，却会演化数千代",
      width: 7,
      height: 3,
      cells: [[0, 1], [1, 3], [2, 0], [2, 1], [2, 4], [2, 5], [2, 6]],
    }),
    definePreset({
      id: "diehard",
      name: "顽强者",
      description: "活跃 130 代后完全消失",
      width: 8,
      height: 3,
      cells: [[0, 6], [1, 0], [1, 1], [2, 1], [2, 5], [2, 6], [2, 7]],
    }),
    definePreset({
      id: "gosper-glider-gun",
      name: "高斯帕滑翔机枪",
      description: "周期为 30，持续向外发射滑翔机",
      width: 36,
      height: 9,
      cells: [
        [0, 24],
        [1, 22], [1, 24],
        [2, 12], [2, 13], [2, 20], [2, 21], [2, 34], [2, 35],
        [3, 11], [3, 15], [3, 20], [3, 21], [3, 34], [3, 35],
        [4, 0], [4, 1], [4, 10], [4, 16], [4, 20], [4, 21],
        [5, 0], [5, 1], [5, 10], [5, 14], [5, 16], [5, 17], [5, 22], [5, 24],
        [6, 10], [6, 16], [6, 24],
        [7, 11], [7, 15],
        [8, 12], [8, 13],
      ],
    }),
    logicPreset({
      id: "logic-not-0",
      name: "逻辑 · 非门（0→1）",
      description: "输入 A=0；输出端方块保持静止，第 83 代探针锁存 O=1",
    }, logicNot(false)),
    logicPreset({
      id: "logic-not-1",
      name: "逻辑 · 非门（1→0）",
      description: "输入 A=1；输出端方块保持静止，第 83 代探针锁存 O=0",
    }, logicNot(true)),
    logicPreset({
      id: "logic-and-00",
      name: "逻辑 · 与门（0∧0→0）",
      description: "输入 A=0、B=0；错位碰撞后，第 150 代探针锁存 O=0",
    }, logicAnd(false, false)),
    logicPreset({
      id: "logic-and-01",
      name: "逻辑 · 与门（0∧1→0）",
      description: "输入 A=0、B=1；错位碰撞后，第 150 代探针锁存 O=0",
    }, logicAnd(false, true)),
    logicPreset({
      id: "logic-and-10",
      name: "逻辑 · 与门（1∧0→0）",
      description: "输入 A=1、B=0；错位碰撞后，第 150 代探针锁存 O=0",
    }, logicAnd(true, false)),
    logicPreset({
      id: "logic-and-11",
      name: "逻辑 · 与门（1∧1→1）",
      description: "输入 A=1、B=1；错位碰撞后，第 150 代探针锁存 O=1",
    }, logicAnd(true, true)),
    logicPreset({
      id: "logic-or-00",
      name: "逻辑 · 或门（0∨0→0）",
      description: "输入 A=0、B=0；错位碰撞后，第 243 代探针锁存 O=0",
    }, logicOr(false, false)),
    logicPreset({
      id: "logic-or-01",
      name: "逻辑 · 或门（0∨1→1）",
      description: "输入 A=0、B=1；错位碰撞后，第 243 代探针锁存 O=1",
    }, logicOr(false, true)),
    logicPreset({
      id: "logic-or-10",
      name: "逻辑 · 或门（1∨0→1）",
      description: "输入 A=1、B=0；错位碰撞后，第 243 代探针锁存 O=1",
    }, logicOr(true, false)),
    logicPreset({
      id: "logic-or-11",
      name: "逻辑 · 或门（1∨1→1）",
      description: "输入 A=1、B=1；错位碰撞后，第 243 代探针锁存 O=1",
    }, logicOr(true, true)),
  ]);

  function getPreset(id) {
    return presets.find((preset) => preset.id === id) || null;
  }

  function getLogicGateKit(gate) {
    return LOGIC_GATE_KITS[String(gate || "").toUpperCase()] || null;
  }

  function rotatePattern(pattern) {
    return definePreset({
      ...pattern,
      width: pattern.height,
      height: pattern.width,
      cells: pattern.cells.map(([row, column]) => [column, pattern.height - 1 - row]),
      logic: pattern.logic ? {
        ...pattern.logic,
        inputOrigins: pattern.logic.inputOrigins.map(([row, column]) => [column, pattern.height - 1 - row]),
        signalCells: pattern.logic.signalCells.map(([row, column]) => [column, pattern.height - 1 - row]),
        signalDelta: [pattern.logic.signalDelta[1], -pattern.logic.signalDelta[0]],
        terminalCells: pattern.logic.terminalCells.map(([row, column]) => [column, pattern.height - 1 - row]),
      } : undefined,
    });
  }

  function flipPattern(pattern) {
    return definePreset({
      ...pattern,
      cells: pattern.cells.map(([row, column]) => [row, pattern.width - 1 - column]),
      logic: pattern.logic ? {
        ...pattern.logic,
        inputOrigins: pattern.logic.inputOrigins.map(([row, column]) => [row, pattern.width - 1 - column]),
        signalCells: pattern.logic.signalCells.map(([row, column]) => [row, pattern.width - 1 - column]),
        signalDelta: [pattern.logic.signalDelta[0], -pattern.logic.signalDelta[1]],
        terminalCells: pattern.logic.terminalCells.map(([row, column]) => [row, pattern.width - 1 - column]),
      } : undefined,
    });
  }

  return Object.freeze({ flipPattern, getLogicGateKit, getPreset, presets, rotatePattern });
});
