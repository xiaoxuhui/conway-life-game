"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const LogicCode = require("../scripts/logic-code.js");
const Presets = require("../scripts/presets.js");
const Life = require("../scripts/life-engine.js");

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
        command, Presets.getPreset, Presets.getLogicGateKit,
      );
      const expected = Number(left !== right);
      assert.equal(command.expected, expected, `${source} 的解析真值错误`);
      assert.equal(pattern.connectionCount, 4, `${source} 必须包含四条门到门线路`);

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
