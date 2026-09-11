"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const LogicCode = require("../scripts/logic-code.js");
const LogicParse = require("../scripts/logic-parse.js");
const LogicExpand = require("../scripts/logic-expand.js");
const LogicCompile = require("../scripts/logic-compile.js");
const LogicSafety = require("../scripts/logic-safety.js");
const Presets = require("../scripts/presets.js");
const Life = require("../scripts/life-engine.js");

test("逻辑代码门面由解析、展开、编译和安全验证模块组成", () => {
  assert.equal(LogicCode.parse, LogicParse.parse);
  assert.equal(LogicCode.expandFunctions, LogicExpand.expandFunctions);
  assert.equal(typeof LogicCompile.compileCircuit, "function");
  assert.equal(LogicCode.validateGunSafety, LogicSafety.validateGunSafety);
});

test("电路相位预演同步推进输出探针与终端元数据", () => {
  const signalCells = [[0, 1], [1, 2], [2, 0], [2, 1], [2, 2]];
  const terminalCells = [[10, 9], [10, 10], [10, 11]];
  const shifted = LogicCompile.phaseShiftCircuit({
    cells: [...signalCells, ...terminalCells],
    inputOrigins: [],
    signalCells,
    signalDelta: [1, 1],
    terminalCells,
    gunGroups: [],
    observeGeneration: 20,
    connections: [{ alignGeneration: 12, cells: signalCells }],
  }, 1);
  const keys = (coordinates) => new Set(coordinates.map((coordinate) => coordinate.join(",")));

  assert.deepEqual(keys(shifted.signalCells), Life.nextCellSet(keys(signalCells)));
  assert.deepEqual(keys(shifted.terminalCells), Life.nextCellSet(keys(terminalCells)));
  assert.deepEqual(keys(shifted.connections[0].cells), Life.nextCellSet(keys(signalCells)));
  assert.equal(shifted.observeGeneration, 20);
  assert.equal(shifted.connections[0].alignGeneration, 12);
});

test("电路 D4 变形同步传递端口、方向、枪体和连接元数据", () => {
  const source = {
    cells: [[1, 2]], inputOrigins: [[3, 4]], signalCells: [[5, 6]],
    signalDelta: [1, -1], terminalCells: [[7, 8]], gateAnchors: [[9, 10]],
    gunGroups: [{ zoneCells: [[11, 12]], referenceCells: [[13, 14]] }],
    connections: [{ cells: [[15, 16]] }],
  };
  const expected = {
    I: [1, 2], R90: [2, -1], R180: [-1, -2], R270: [-2, 1],
    FH: [1, -2], T: [2, 1], FV: [-1, 2], AT: [-2, -1],
  };

  for (const [transform, cell] of Object.entries(expected)) {
    const result = LogicCompile.transformCircuit(source, transform);
    assert.deepEqual(result.cells[0], cell, transform);
    assert.equal(result.inputOrigins.length, 1, transform);
    assert.equal(result.gunGroups[0].zoneCells.length, 1, transform);
    assert.equal(result.connections[0].cells.length, 1, transform);
    assert.equal(result.gateAnchors.length, 1, transform);
  }
  assert.deepEqual(LogicCompile.transformCircuit(source, "R90").signalDelta, [-1, -1]);
  assert.throws(() => LogicCompile.transformCircuit(source, "UNKNOWN"), /变形/);
});

test("嵌套逻辑门可选择变形与相位并在连接元数据中保留设置", () => {
  const command = LogicCode.parse("NOT(NOT(1))");
  const transformed = LogicCompile.compileCircuit(
    command.tree, Presets.getLogicGateKit, 240, 0, 20, 0,
    { nestedTransform: () => ({ name: "T", phase: 0 }) },
  );

  assert.equal(transformed.connections[0].transform, "T");
  assert.equal(transformed.connections[0].transformPhase, 0);
  assert.equal(transformed.gateAnchors.length, 2);
  assert.throws(
    () => LogicCompile.compileCircuit(
      command.tree, Presets.getLogicGateKit, 240, 0, 20, 0,
      { nestedTransform: () => ({ name: "R90", phase: 4 }) },
    ),
    /0 到 3/,
  );
});

test("英文与符号 NOT 表达式映射到对应内置结构", () => {
  assert.deepEqual(LogicCode.parse("NOT 0"), {
    gate: "NOT", inputs: [0], expected: 1, presetId: "logic-not-0", expression: "NOT 0",
  });
  assert.equal(LogicCode.parse("!1").presetId, "logic-not-1");
  assert.equal(LogicCode.parse("NOT(0)").expected, 1);
});

test("AND 支持英文、中文、符号和函数形式", () => {
  for (const expression of ["1 AND 0", "1 与 0", "1 和 0", "1 && 0", "AND(1,0)"]) {
    assert.deepEqual(LogicCode.parse(expression).inputs, [1, 0], expression);
    assert.equal(LogicCode.parse(expression).presetId, "logic-and-10", expression);
    assert.equal(LogicCode.parse(expression).expected, 0, expression);
  }
});

test("OR 支持英文、中文、符号和函数形式", () => {
  for (const expression of ["0 OR 1", "0 或 1", "0 || 1", "OR(0,1)"]) {
    assert.deepEqual(LogicCode.parse(expression).inputs, [0, 1], expression);
    assert.equal(LogicCode.parse(expression).presetId, "logic-or-01", expression);
    assert.equal(LogicCode.parse(expression).expected, 1, expression);
  }
});

test("函数表达式支持顶层变量赋值并保留符号表达式", () => {
  const command = LogicCode.parse(
    "OR(AND(A,NOT(B)),AND(NOT(A),B)),A=1,B=1",
  );
  assert.equal(command.expected, 0);
  assert.equal(command.expression, "(A AND NOT B) OR (NOT A AND B)");
  assert.deepEqual(command.variables, { A: 1, B: 1 });
  assert.deepEqual(command.steps.map((step) => step.presetId), [
    "logic-not-1", "logic-and-10", "logic-not-1", "logic-and-01", "logic-or-00",
  ]);
});

test("参数函数会识别输入、默认值并实例化为可执行代码", () => {
  const bare = LogicCode.createFunctionDefinition("OR(AND(A,NOT(B)),AND(NOT(A),B))");
  assert.equal(bare.code, "OR(AND(A,NOT(B)),AND(NOT(A),B))");
  assert.deepEqual(bare.inputs, [
    { name: "A", defaultValue: 0 }, { name: "B", defaultValue: 0 },
  ]);
  assert.equal(
    LogicCode.instantiateFunction(bare, { A: 1, B: 0 }),
    "OR(AND(A,NOT(B)),AND(NOT(A),B)),A=1,B=0",
  );

  const assigned = LogicCode.createFunctionDefinition("AND(A,B),A=1,B=0");
  assert.deepEqual(assigned.inputs, [
    { name: "A", defaultValue: 1 }, { name: "B", defaultValue: 0 },
  ]);
  assert.throws(() => LogicCode.instantiateFunction(assigned, { A: 1 }), /B/);
  assert.throws(() => LogicCode.instantiateFunction(assigned, { A: 1, B: 2 }), /0 或 1/);
});

test("保存函数可以作为表达式嵌套调用并检测错误引用", () => {
  const xor = {
    callName: "XOR", code: "OR(AND(A,NOT(B)),AND(NOT(A),B))",
    inputs: [{ name: "A", defaultValue: 0 }, { name: "B", defaultValue: 0 }],
  };
  const same = {
    callName: "SAME", code: "NOT(XOR(A,B))",
    inputs: [{ name: "A", defaultValue: 0 }, { name: "B", defaultValue: 0 }],
  };
  const expanded = LogicCode.expandFunctions("NOT(XOR(1,0))", [xor]);
  assert.equal(LogicCode.parse(expanded).expected, 0);
  assert.equal(LogicCode.parse(LogicCode.expandFunctions("SAME(1,1)", [xor, same])).expected, 1);
  assert.throws(() => LogicCode.expandFunctions("XOR(1)", [xor]), /2 个参数/);
  assert.throws(
    () => LogicCode.expandFunctions("LOOP(1)", [{ callName: "LOOP", code: "LOOP(A)", inputs: [{ name: "A", defaultValue: 0 }] }]),
    /循环引用/,
  );
});

test("GF_2 四输入函数的长展开结果使用独立安全上限", () => {
  const xor = {
    callName: "XOR", code: "OR(AND(A,NOT(B)),AND(NOT(A),B))",
    inputs: [{ name: "A" }, { name: "B" }],
  };
  const gf2 = {
    callName: "GF_2",
    code: "OR(XOR(XOR(A,B),XOR(C,D)),XOR(XOR(A,B),XOR(C,D)))",
    inputs: [{ name: "A" }, { name: "B" }, { name: "C" }, { name: "D" }],
  };
  const expanded = LogicCode.expandFunctions("GF_2(1,0,1,0)", [xor, gf2]);

  assert.ok(expanded.length > 200, `测试展开长度应超过 200，实际为 ${expanded.length}`);
  assert.equal(LogicCode.parseExpanded(expanded).expected, 0);
  assert.throws(() => LogicCode.expandFunctions("1".repeat(201), [xor, gf2]), /200/);
  assert.throws(() => LogicCode.parseExpanded("1".repeat(5001)), /5000/);
});

test("GF_2 展开后支持括号内中缀运算符与明确的未知函数错误", () => {
  const gf2 = {
    callName: "GF_2", code: "OR((A AND B),NOT(C OR D))",
    inputs: [{ name: "A" }, { name: "B" }, { name: "C" }, { name: "D" }],
  };
  const expanded = LogicCode.expandFunctions("GF_2(1,0,1,0)", [gf2]);

  assert.equal(expanded, "OR((1 AND 0),NOT(1 OR 0))");
  assert.equal(LogicCode.parseExpanded(expanded).expected, 0);
  assert.equal(LogicCode.parseExpanded("0 OR 1 AND NOT 0").expected, 1);
  assert.deepEqual(
    LogicCode.createFunctionDefinition("(A AND NOT(B)) OR (NOT(A) AND B)").inputs.map(({ name }) => name),
    ["A", "B"],
  );
  assert.throws(() => LogicCode.parseExpanded("MISSING(1,0)"), /MISSING/);
});

test("变量赋值拒绝缺失、重复、非法值和未使用变量", () => {
  const invalid = [
    ["AND(A,B),A=1", /变量 B.*赋值/],
    ["AND(A,B),A=1,A=0,B=1", /变量 A.*重复/],
    ["AND(A,B),A=2,B=1", /A=2|0 或 1/],
    ["AND(A,B),A=1,B=0,C=1", /变量 C.*未使用/],
  ];
  for (const [expression, message] of invalid) {
    assert.throws(() => LogicCode.parse(expression), message, expression);
  }
});

test("非法逻辑代码给出可识别错误且不猜测输入", () => {
  for (const expression of ["", "A AND B", "1 XOR 0", "NOT 2", "1 AND", "AND(1,0,1)"]) {
    assert.throws(() => LogicCode.parse(expression), (error) => {
      assert.equal(error.name, "LogicCodeError");
      assert.match(error.message, /请输入|无法识别/);
      return true;
    }, expression);
  }
});

test("全部 10 种布尔输入都映射到真值一致的现有结构", () => {
  const expressions = ["NOT 0", "NOT 1"];
  for (const left of [0, 1]) {
    for (const right of [0, 1]) {
      expressions.push(`${left} AND ${right}`, `${left} OR ${right}`);
    }
  }
  for (const expression of expressions) {
    const command = LogicCode.parse(expression);
    const preset = Presets.getPreset(command.presetId);
    assert.ok(preset, `${expression} 缺少对应结构`);
    assert.deepEqual(preset.logic.inputs, command.inputs);
    assert.equal(preset.logic.expected, command.expected);
  }
});

function advance(world, generations) {
  let result = world;
  for (let generation = 0; generation < generations; generation += 1) {
    result = Life.nextGeneration(result);
  }
  return result;
}

test("NOT(AND(0,0)) 用 AND 输出线路真实连接 NOT 输入并得到 1", () => {
  const command = LogicCode.parse("NOT(AND(0,0))");
  assert.equal(command.expression, "NOT(0 AND 0)");
  assert.equal(command.expected, 1);
  assert.equal(command.presetId, "logic-not-0");
  assert.deepEqual(command.steps.map((step) => step.presetId), ["logic-and-00", "logic-not-0"]);

  const pattern = LogicCode.composePattern(command, Presets.getPreset, Presets.getLogicGateKit);
  assert.equal(pattern.logic.expected, 1);
  assert.equal(pattern.connectionCount, 1);
  assert.ok(pattern.gunSafety.verifiedThrough >= 4 * Math.max(pattern.width, pattern.height));
  assert.match(pattern.description, /真实级联/);
  assert.ok(pattern.width > Presets.getPreset("logic-and-00").width);
  assert.ok(pattern.cells.length > Presets.getPreset("logic-and-00").cells.length);

  const world = advance(Life.createWorld(pattern.cells), pattern.logic.observeGeneration);
  assert.equal(
    Number(pattern.logic.signalCells.every(([row, column]) => Life.isAlive(world, row, column))),
    1,
    "AND=0 的空线路进入 NOT 后应产生真实输出滑翔机",
  );
});

test("NOT(AND(1,1)) 的 AND 输出滑翔机进入 NOT 并将输出抵消为 0", () => {
  const command = LogicCode.parse("NOT(AND(1,1))");
  const pattern = LogicCode.composePattern(command, Presets.getPreset, Presets.getLogicGateKit);
  const [connection] = pattern.connections;
  assert.equal(pattern.connectionCount, 1);
  assert.equal(connection.expected, 1, "连接线应携带 AND 的真值 1");

  const connected = advance(Life.createWorld(pattern.cells), connection.alignGeneration);
  assert.ok(
    connection.cells.every(([row, column]) => Life.isAlive(connected, row, column)),
    "连接时刻必须在 NOT 输入线上出现 AND 产生的完整五细胞滑翔机",
  );

  const observed = advance(connected, pattern.logic.observeGeneration - connection.alignGeneration);
  assert.equal(
    Number(pattern.logic.signalCells.every(([row, column]) => Life.isAlive(observed, row, column))),
    0,
    "AND 的输出滑翔机必须实际抵消 NOT 的输出",
  );
});

test("AX01：AND 与后继 NOT 同轴放置并由双反射器真实连接", () => {
  for (const [left, right] of [[0, 0], [1, 1]]) {
    const command = LogicCode.parse(`NOT(AND(${left},${right}))`);
    const pattern = LogicCode.composePattern(
      command, Presets.getPreset, Presets.getLogicGateKit, Presets.getLogicReflectorKit,
    );
    const [connection] = pattern.connections;

    assert.deepEqual(pattern.routing, {
      mode: "axial",
      routeStage: "reflected",
      reflectorCount: 2,
      directGeometryAttempts: 2048,
      directCandidateCount: 0,
      directCandidatesTested: 0,
      reflectedCandidatesTested: 1,
    });
    assert.equal(new Set(pattern.gateAnchors.map(([row]) => row)).size, 1);
    assert.ok(pattern.gateAnchors[1][1] < pattern.gateAnchors[0][1]);
    assert.equal(connection.routeMode, "double-reflector");
    assert.equal(connection.reflectors.length, 2);

    let world = Life.createWorld(pattern.cells);
    let connected = null;
    let output = null;
    for (let generation = 0; generation <= pattern.logic.observeGeneration; generation += 1) {
      if (generation === connection.alignGeneration) {
        connected = Number(connection.cells.every(
          ([row, column]) => Life.isAlive(world, row, column),
        ));
      }
      if (generation === pattern.logic.observeGeneration) {
        output = Number(pattern.logic.signalCells.every(
          ([row, column]) => Life.isAlive(world, row, column),
        ));
      }
      if (generation < pattern.logic.observeGeneration) world = Life.nextGeneration(world);
    }
    assert.equal(connected, Number(Boolean(left && right)));
    assert.equal(output, Number(!(left && right)));
    assert.ok(pattern.gunSafety.verifiedThrough > pattern.logic.observeGeneration);
  }
});

test("AX01 异步生成保留同轴布局、进度和完整安全验证", async () => {
  const phases = [];
  const pattern = await LogicCode.composePatternAsync(
    LogicCode.parse("NOT(AND(1,1))"),
    Presets.getPreset,
    Presets.getLogicGateKit,
    Presets.getLogicReflectorKit,
    {
      sliceBudgetMs: 0,
      yieldControl: async () => {},
      onProgress: (progress) => phases.push(progress),
    },
  );

  assert.equal(pattern.routing.routeStage, "reflected");
  assert.equal(pattern.routing.directGeometryAttempts, 2048);
  const directIndex = phases.findIndex(
    ({ phase, routeStage }) => phase === "routing" && routeStage === "direct",
  );
  const reflectedIndex = phases.findIndex(
    ({ phase, routeStage }) => phase === "routing" && routeStage === "reflected",
  );
  assert.ok(directIndex >= 0, "必须先报告正常直连搜索");
  assert.ok(reflectedIndex > directIndex, "反射搜索必须晚于正常直连搜索");
  assert.equal(phases[directIndex].reflectorCount, 0);
  assert.equal(phases[directIndex].geometryAttempts, 2048);
  assert.ok(phases.some(
    ({ phase, routeStage }) => phase === "safety" && routeStage === "reflected",
  ));
});

test("AX06：任一反射器被移除都会切断同轴 AND→NOT 真信号", () => {
  const command = LogicCode.parse("NOT(AND(1,1))");
  const routes = LogicCompile.compileAxialPairCandidates(
    command.tree, Presets.getLogicGateKit, Presets.getLogicReflectorKit,
  );
  assert.equal(routes.direct.length, 0);
  assert.equal(routes.directGeometryAttempts, 2048);
  const circuit = routes.reflected[0];
  const reflectorGroups = circuit.gunGroups.slice(-2);

  function connectionValue(removedGroups) {
    const removed = new Set(removedGroups.flatMap(({ zoneCells }) => (
      zoneCells.map((cell) => cell.join(","))
    )));
    let world = Life.createWorld(circuit.cells.filter((cell) => !removed.has(cell.join(","))));
    for (let generation = 0; generation < circuit.connections[0].alignGeneration; generation += 1) {
      world = Life.nextGeneration(world);
    }
    return Number(circuit.connections[0].cells.every(
      ([row, column]) => Life.isAlive(world, row, column),
    ));
  }

  assert.equal(connectionValue([]), 1);
  assert.equal(connectionValue([reflectorGroups[0]]), 0);
  assert.equal(connectionValue([reflectorGroups[1]]), 0);
  assert.equal(connectionValue(reflectorGroups), 0);
});

test("AX06：存在安全直连时立即采用且不测试反射候选", () => {
  const glider = [[0, 1], [1, 2], [2, 0], [2, 1], [2, 2]];
  let target = new Set(glider.map((cell) => cell.join(",")));
  for (let generation = 0; generation < 120; generation += 1) {
    target = Life.nextCellSet(target);
  }
  const targetCells = [...target].map((key) => {
    const [row, column] = key.split(",").map(Number);
    return [row, column - 100];
  });
  const emptyKit = (gate) => ({
    gate,
    bodyCells: [], bodyGunGroups: [], inputFalseCells: [], inputTrueCells: [],
    inputGunCells: [], terminalCells: [], signalDelta: [1, 1],
  });
  const kits = {
    AND: {
      ...emptyKit("AND"), inputOrigins: [[0, 0], [0, 0]],
      inputSignalGeneration: 120, inputSignalCells: targetCells,
      observeGeneration: 0, signalCells: glider,
    },
    NOT: {
      ...emptyKit("NOT"), inputOrigins: [[0, 0]],
      inputSignalGeneration: 120, inputSignalCells: targetCells,
      observeGeneration: 20, signalCells: glider,
    },
  };
  const command = LogicCode.parse("NOT(AND(1,1))");
  const pattern = LogicCode.composePattern(
    command,
    () => null,
    (gate) => kits[gate],
    Presets.getLogicReflectorKit,
  );

  assert.equal(pattern.routing.routeStage, "direct");
  assert.equal(pattern.routing.reflectorCount, 0);
  assert.ok(pattern.routing.directCandidateCount > 0);
  assert.equal(pattern.routing.directCandidatesTested, 1);
  assert.equal(pattern.routing.reflectedCandidatesTested, 0);
  assert.equal(pattern.connections[0].routeMode, "direct");
});

test("AX07：XOR 的每条嵌套边都能生成双反射后备候选", () => {
  const command = LogicCode.parse(
    "OR(AND(A,NOT(B)),AND(NOT(A),B)),A=1,B=0",
  );
  const edges = LogicCompile.collectNestedEdges(command.tree);

  assert.deepEqual(edges, [
    { path: "root.0.1", from: "NOT", to: "AND", portIndex: 1 },
    { path: "root.0", from: "AND", to: "OR", portIndex: 0 },
    { path: "root.1.0", from: "NOT", to: "AND", portIndex: 0 },
    { path: "root.1", from: "AND", to: "OR", portIndex: 1 },
  ]);

  for (const edge of edges) {
    const circuit = LogicCompile.compileCircuit(
      command.tree, Presets.getLogicGateKit, 960, 0, 20, 0,
      {
        reflectedEdgePath: edge.path,
        reflectorRouteVariant: 0,
        resolveReflectorKit: Presets.getLogicReflectorKit,
      },
    );
    const reflected = circuit.connections.find(({ edgePath }) => edgePath === edge.path);
    assert.equal(reflected.routeMode, "double-reflector", edge.path);
    assert.equal(reflected.reflectors.length, 2, edge.path);
    assert.ok(LogicCompile.transformNames.includes(reflected.reflectedChildTransform));
    assert.equal(
      circuit.connections.filter(({ routeMode }) => routeMode === "double-reflector").length,
      1,
      "每个第一阶段候选只能改造一条连接边",
    );
    assert.equal(
      circuit.gunGroups.filter(({ phaseCache }) => phaseCache === false).length,
      2,
      "两座反射器都必须进入完整安全验证",
    );
    const normalized = LogicCompile.normalizeCircuit(circuit);
    const normalizedConnection = normalized.connections.find(
      ({ edgePath }) => edgePath === edge.path,
    );
    for (const { anchor: [row, column] } of normalizedConnection.reflectors) {
      assert.ok(row >= 0 && row < normalized.height, edge.path);
      assert.ok(column >= 0 && column < normalized.width, edge.path);
    }
  }
});

test("AX08/AX09：大型结构仅在正常候选全失败后逐边反射并失败关闭", async () => {
  const command = LogicCode.parse("NOT(NOT(AND(1,1)))");
  const progress = [];
  const unsafeGateKit = (gate) => {
    const kit = Presets.getLogicGateKit(gate);
    return {
      ...kit,
      bodyGunGroups: [...kit.bodyGunGroups, [[5000, 5000]]],
    };
  };

  await assert.rejects(
    LogicCode.composePatternAsync(
      command, Presets.getPreset, unsafeGateKit, Presets.getLogicReflectorKit,
      {
        sliceBudgetMs: 0,
        yieldControl: async () => {},
        onProgress: (value) => progress.push(value),
      },
    ),
    /正常布局与 2 种单边反射线路/,
  );

  const firstReflected = progress.findIndex(({ routeStage }) => routeStage === "reflected");
  const lastNormal = progress.reduce(
    (last, item, index) => (item.routeStage ? last : index), -1,
  );
  assert.ok(firstReflected > lastNormal, "全部正常布局测试结束后才能进入反射阶段");
  assert.deepEqual(
    [...new Set(progress
      .filter(({ phase, routeStage }) => phase === "routing" && routeStage === "reflected")
      .map(({ reflectedEdgePath }) => reflectedEdgePath))],
    ["root.0.0", "root.0"],
  );
  assert.ok(progress
    .filter(({ phase, routeStage }) => phase === "rejected" && routeStage === "reflected")
    .every(({ reflectorCount }) => reflectorCount === 2));
});

test("两条连续门到门线路都由实际滑翔机逐级传递", () => {
  const command = LogicCode.parse("NOT(NOT(AND(1,1)))");
  const pattern = LogicCode.composePattern(command, Presets.getPreset, Presets.getLogicGateKit);
  assert.equal(pattern.connectionCount, 2);

  let world = Life.createWorld(pattern.cells);
  for (let generation = 0; generation <= pattern.logic.observeGeneration; generation += 1) {
    for (const connection of pattern.connections) {
      if (connection.alignGeneration !== generation) continue;
      assert.equal(
        Number(connection.cells.every(([row, column]) => Life.isAlive(world, row, column))),
        connection.expected,
        `${connection.from}→${connection.to} 的连接线应携带子门真值`,
      );
    }
    if (generation < pattern.logic.observeGeneration) world = Life.nextGeneration(world);
  }
  assert.equal(
    Number(pattern.logic.signalCells.every(([row, column]) => Life.isAlive(world, row, column))),
    1,
  );
});

test("NOT(OR(A,B)) 的辅助滑翔机不会摧毁根 NOT 滑翔机枪", () => {
  for (const [left, right] of [[0, 0], [0, 1], [1, 0], [1, 1]]) {
    const expression = `NOT(OR(${left},${right}))`;
    const pattern = LogicCode.composePattern(
      LogicCode.parse(expression), Presets.getPreset, Presets.getLogicGateKit,
    );
    const rootKit = Presets.getLogicGateKit("NOT");
    const rowOffset = pattern.logic.terminalCells[0][0] - rootKit.terminalCells[0][0];
    const columnOffset = pattern.logic.terminalCells[0][1] - rootKit.terminalCells[0][1];
    const terminal = new Set(rootKit.terminalCells.map((cell) => cell.join(",")));
    const rootGunCells = rootKit.bodyCells
      .filter((cell) => !terminal.has(cell.join(",")))
      .map(([row, column]) => [row + rowOffset, column + columnOffset]);

    let world = Life.createWorld(pattern.cells);
    let connected = null;
    let output = null;
    for (let generation = 0; generation <= 900; generation += 1) {
      if (generation % 30 === 0) {
        assert.ok(
          rootGunCells.every(([row, column]) => Life.isAlive(world, row, column)),
          `${expression} 的根 NOT 滑翔机枪在第 ${generation} 代必须恢复完整 p30 结构`,
        );
      }
      if (generation === pattern.connections[0].alignGeneration) {
        connected = Number(pattern.connections[0].cells
          .every(([row, column]) => Life.isAlive(world, row, column)));
      }
      if (generation === pattern.logic.observeGeneration) {
        output = Number(pattern.logic.signalCells
          .every(([row, column]) => Life.isAlive(world, row, column)));
      }
      if (generation < 900) world = Life.nextGeneration(world);
    }
    assert.equal(connected, Number(Boolean(left || right)), `${expression} 的连接线真值错误`);
    assert.equal(output, Number(!(left || right)), `${expression} 的最终输出错误`);
  }
});

test("变量异或的两条分支均由实际滑翔机接入 OR", () => {
  for (const left of [0, 1]) {
    for (const right of [0, 1]) {
      const source = `OR(AND(A,NOT(B)),AND(NOT(A),B)),A=${left},B=${right}`;
      const command = LogicCode.parse(source);
      const pattern = LogicCode.composePattern(
        command, Presets.getPreset, Presets.getLogicGateKit, Presets.getLogicReflectorKit,
      );
      const expected = Number(left !== right);
      assert.equal(command.expected, expected, `${source} 的解析真值错误`);
      assert.equal(pattern.connectionCount, 4, `${source} 必须包含四条门到门线路`);
      assert.equal(
        pattern.connections.filter(({ routeMode }) => routeMode === "double-reflector").length,
        0,
        `${source} 的正常布局成功时不得提前加入反射器`,
      );

      let world = Life.createWorld(pattern.cells);
      for (let generation = 0; generation <= pattern.logic.observeGeneration; generation += 1) {
        for (const connection of pattern.connections) {
          if (connection.alignGeneration !== generation) continue;
          assert.equal(
            Number(connection.cells.every(([row, column]) => Life.isAlive(world, row, column))),
            connection.expected,
            `${source} 的 ${connection.from}→${connection.to} 线路真值错误`,
          );
        }
        if (generation < pattern.logic.observeGeneration) world = Life.nextGeneration(world);
      }
      assert.equal(
        Number(pattern.logic.signalCells.every(([row, column]) => Life.isAlive(world, row, column))),
        expected,
        `${source} 的最终物理输出错误`,
      );
    }
  }
});

test("多层 AND、OR、NOT 保留后序步骤并限制嵌套深度", () => {
  const command = LogicCode.parse("OR(AND(1,0),NOT(0))");
  assert.equal(command.expected, 1);
  assert.deepEqual(command.steps.map((step) => step.presetId), [
    "logic-and-10", "logic-not-0", "logic-or-01",
  ]);
  const pattern = LogicCode.composePattern(command, Presets.getPreset, Presets.getLogicGateKit);
  assert.equal(pattern.connectionCount, 2);
  assert.throws(
    () => LogicCode.parse("NOT(NOT(NOT(NOT(NOT(NOT(NOT(NOT(NOT(0)))))))))"),
    /最多支持 8 层/,
  );
});

test("枪体安全验证器对任意候选失败关闭", () => {
  const block = [[0, 0], [0, 1], [1, 0], [1, 1]];
  const safe = LogicCode.validateGunSafety({
    width: 2, height: 2, cells: block,
    gunGroups: [{ zoneCells: block, referenceCells: block }],
  });
  assert.equal(safe.safe, true);
  const unsafe = LogicCode.validateGunSafety({
    width: 2, height: 2, cells: block.slice(1),
    gunGroups: [{ zoneCells: block, referenceCells: block }],
  });
  assert.deepEqual(
    { safe: unsafe.safe, generation: unsafe.generation, groupIndex: unsafe.groupIndex },
    { safe: false, generation: 0, groupIndex: 0 },
  );

  const overlapping = LogicCode.validateGunSafety({
    width: 2, height: 2, cells: block,
    gunGroups: [
      { zoneCells: block, referenceCells: block },
      { zoneCells: block, referenceCells: block.slice(1) },
    ],
  });
  assert.deepEqual(
    { safe: overlapping.safe, generation: overlapping.generation, groupIndex: overlapping.groupIndex },
    { safe: false, generation: 0, groupIndex: 1 },
  );
});

test("异步结构组合会主动让出执行权、报告进度并支持取消", async () => {
  assert.equal(LogicCode.SAFETY_SLICE_BUDGET_MS, 40);
  const command = LogicCode.parse("NOT(AND(0,0))");
  const expected = LogicCode.composePattern(command, Presets.getPreset, Presets.getLogicGateKit);
  let yields = 0;
  const progress = [];
  const actual = await LogicCode.composePatternAsync(
    command, Presets.getPreset, Presets.getLogicGateKit,
    {
      sliceBudgetMs: 0,
      yieldControl: async () => { yields += 1; },
      onProgress: (value) => progress.push(value),
    },
  );

  assert.deepEqual(actual, expected);
  assert.ok(yields > 0, "复杂结构验证必须主动让出执行权");
  assert.ok(progress.some(({ generation, horizon }) => generation < horizon));

  const controller = new AbortController();
  await assert.rejects(
    LogicCode.composePatternAsync(
      command, Presets.getPreset, Presets.getLogicGateKit,
      {
        signal: controller.signal,
        sliceBudgetMs: 0,
        yieldControl: async () => controller.abort(),
      },
    ),
    (error) => error?.code === "ABORTED",
  );
});

test("编译器可以扩大平行通道间隔并统一最终输出方向", async () => {
  const command = LogicCode.parse("NOT(AND(0,0))");
  const pattern = await LogicCode.composePatternAsync(
    command, Presets.getPreset, Presets.getLogicGateKit,
    { branchSpacings: [40] },
  );

  assert.equal(pattern.routing.branchPulseSpacing, 40);
  assert.equal(pattern.connectionCount, 1);
  assert.ok(pattern.logic.signalDelta[1] >= 0);
  assert.ok(pattern.gunSafety.verifiedThrough > pattern.logic.observeGeneration);
});

test("十五门保存函数组合会搜索替代布局而不是误报没有安全线路", async () => {
  const xor = {
    callName: "XOR", code: "OR(AND(A,NOT(B)),AND(NOT(A),B))",
    inputs: [{ name: "A" }, { name: "B" }],
  };
  const outer = {
    callName: "OUTER",
    code: "OR(OR(AND(A,B),AND(XOR(A,B),XOR(C,D))),AND(C,D))",
    inputs: [{ name: "A" }, { name: "B" }, { name: "C" }, { name: "D" }],
  };
  const expanded = LogicCode.expandFunctions("OUTER(0,0,0,0)", [xor, outer]);
  const command = LogicCode.parseExpanded(expanded);
  const attempts = [];
  const pattern = await LogicCode.composePatternAsync(
    command, Presets.getPreset, Presets.getLogicGateKit,
    {
      onProgress: ({ phase, routePadding, layoutVariant }) => {
        if (phase === "routing") attempts.push({ routePadding, layoutVariant });
      },
    },
  );

  assert.equal(command.steps.length, 15);
  assert.equal(pattern.connectionCount, 14);
  assert.deepEqual(pattern.routing, {
    layoutVariant: 3, routePadding: 240, branchPulseSpacing: 20,
  });
  assert.equal(attempts[0].layoutVariant, 3);
  assert.equal(attempts[0].routePadding, 240);
});
