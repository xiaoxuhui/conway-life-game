"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const Life = require("../scripts/life-engine.js");
const {
  flipPattern, getLogicGateKit, getLogicReflectorKit, getPreset, presets, rotatePattern,
} = require("../scripts/presets.js");

function coordinates(world) {
  return Life.aliveCoordinates(world).map((cell) => cell.join(","));
}

function advance(world, steps) {
  let result = world;
  for (let step = 0; step < steps; step += 1) result = Life.nextGeneration(result);
  return result;
}

test("空世界和单细胞按规则死亡", () => {
  assert.equal(Life.countAlive(Life.nextGeneration(Life.createWorld())), 0);
  assert.equal(Life.countAlive(Life.nextGeneration(Life.createWorld([[-200, 700]]))), 0);
});

test("负坐标上的 2×2 方块是稳定静物", () => {
  const block = Life.createWorld([[-3, -3], [-3, -2], [-2, -3], [-2, -2]]);
  assert.deepEqual(coordinates(Life.nextGeneration(block)), coordinates(block));
});

test("远离原点的闪烁器周期为 2", () => {
  const horizontal = Life.createWorld([[1_000_000, -1], [1_000_000, 0], [1_000_000, 1]]);
  const vertical = Life.nextGeneration(horizontal);
  assert.deepEqual(coordinates(vertical), ["999999,0", "1000000,0", "1000001,0"]);
  assert.deepEqual(coordinates(Life.nextGeneration(vertical)), coordinates(horizontal));
});

test("滑翔机跨越原固定边界后仍向右下移动", () => {
  const preset = getPreset("glider");
  let world = Life.placePattern(Life.createWorld(), preset.cells, -41, 59);
  for (let step = 0; step < 4; step += 1) world = Life.nextGeneration(world);
  assert.deepEqual(coordinates(world), ["-40,61", "-39,62", "-38,60", "-38,61", "-38,62"]);
});

test("计算下一代不会修改输入世界", () => {
  const world = Life.createWorld([[1, 2], [2, 2], [3, 2]]);
  const snapshot = coordinates(world);
  const next = Life.nextGeneration(world);
  assert.deepEqual(coordinates(world), snapshot);
  assert.notStrictEqual(next.cells, world.cells);
});

test("细胞集合演化核心与世界演化结果一致且不修改输入", () => {
  const cells = new Set(["0,0", "0,1", "0,2"]);
  const original = new Set(cells);

  const nextCells = Life.nextCellSet(cells);
  const nextWorld = Life.nextGeneration({ cells });

  assert.deepEqual(nextCells, nextWorld.cells);
  assert.deepEqual(cells, original);
  assert.notEqual(nextCells, cells);
});

test("重复坐标只保存一个活细胞", () => {
  const world = Life.createWorld([[0, 0], [0, 0], [0, 0]]);
  assert.equal(Life.countAlive(world), 1);
});

test("随机区域以指定世界位置为中心且可注入随机源", () => {
  const values = [0.1, 0.3, 0.2, 0.9];
  const world = Life.randomWorld(2, 2, 0.25, () => values.shift(), -10, 20);
  assert.deepEqual(coordinates(world), ["-11,19", "-10,19"]);
});

test("图案可放置在负坐标且不受棋盘边界限制", () => {
  const world = Life.placePattern(Life.createWorld([[0, 0]]), [[0, 0], [0, 1]], -500, 900, true);
  assert.deepEqual(coordinates(world), ["-500,900", "-500,901"]);
});

test("多个图案可追加到同一世界且重叠细胞不会重复", () => {
  let world = Life.createWorld([[100, 100]]);
  world = Life.placePattern(world, [[0, 0], [0, 1]], 10, 20, false);
  world = Life.placePattern(world, [[0, 0], [1, 0]], 10, 20, false);
  assert.deepEqual(coordinates(world), ["10,20", "10,21", "11,20", "100,100"]);
});

test("非正方形图案顺时针旋转后宽高与坐标正确", () => {
  const rotated = rotatePattern({
    id: "sample",
    name: "示例",
    description: "",
    width: 3,
    height: 2,
    cells: [[0, 0], [0, 2], [1, 1]],
  });
  assert.deepEqual({ width: rotated.width, height: rotated.height }, { width: 2, height: 3 });
  assert.deepEqual(rotated.cells, [[0, 1], [2, 1], [1, 0]]);
});

test("旋转四次和水平翻转两次都恢复原图案", () => {
  const original = getPreset("lightweight-spaceship");
  let rotated = original;
  for (let step = 0; step < 4; step += 1) rotated = rotatePattern(rotated);
  assert.deepEqual(rotated.cells, original.cells);
  assert.deepEqual({ width: rotated.width, height: rotated.height }, { width: original.width, height: original.height });

  const flippedTwice = flipPattern(flipPattern(original));
  assert.deepEqual(flippedTwice.cells, original.cells);
  assert.deepEqual({ width: flippedTwice.width, height: flippedTwice.height }, { width: original.width, height: original.height });
});

test("JSON v2 保存有符号坐标与相机并可无损往返", () => {
  const original = Life.createWorld([[-8, 9], [0, 0], [700, -900]]);
  const view = { centerRow: -2.5, centerColumn: 18.25, cellSize: 3.5 };
  const restored = Life.deserialize(JSON.stringify(Life.serialize(original, 42, view)));
  assert.equal(restored.generation, 42);
  assert.deepEqual(restored.view, view);
  assert.deepEqual(coordinates(restored.world), coordinates(original));
  assert.equal(restored.migratedFrom, null);
});

test("JSON v1 固定棋盘可迁移到无限世界", () => {
  const restored = Life.deserialize({
    format: Life.FORMAT,
    version: 1,
    rows: 40,
    columns: 60,
    generation: 7,
    alive: [[0, 0], [39, 59]],
  });
  assert.deepEqual(coordinates(restored.world), ["0,0", "39,59"]);
  assert.equal(restored.generation, 7);
  assert.deepEqual(restored.view, { centerRow: 20, centerColumn: 30, cellSize: 16 });
  assert.equal(restored.migratedFrom, 1);
});

test("非法、越界和非安全整数坐标会被拒绝", () => {
  assert.throws(() => Life.deserialize("not-json"), /有效的 JSON/);
  assert.throws(() => Life.deserialize({ format: "other", version: 2 }), /格式不受支持/);
  assert.throws(() => Life.createWorld([[Number.MAX_SAFE_INTEGER, 0]]), /安全整数/);
  assert.throws(() => Life.deserialize({
    format: Life.FORMAT,
    version: 1,
    rows: 3,
    columns: 3,
    generation: 0,
    alive: [[3, 0]],
  }), /超出棋盘范围/);
});

test("世界包围盒支持负坐标且空世界返回 null", () => {
  assert.equal(Life.bounds(Life.createWorld()), null);
  assert.deepEqual(Life.bounds(Life.createWorld([[-5, 8], [9, -3], [2, 4]])), {
    minRow: -5,
    maxRow: 9,
    minColumn: -3,
    maxColumn: 8,
  });
});

test("所有预设坐标都位于声明尺寸内", () => {
  assert.ok(presets.length >= 24);
  for (const preset of presets) {
    const unique = new Set();
    for (const [row, column] of preset.cells) {
      assert.ok(row >= 0 && row < preset.height, `${preset.name} 行坐标越界`);
      assert.ok(column >= 0 && column < preset.width, `${preset.name} 列坐标越界`);
      unique.add(`${row}:${column}`);
    }
    assert.equal(unique.size, preset.cells.length, `${preset.name} 不应有重复坐标`);
  }
});

test("新增的四种常见静物在下一代保持不变", () => {
  for (const id of ["block", "beehive", "loaf", "boat"]) {
    const preset = getPreset(id);
    assert.ok(preset, `缺少静物 ${id}`);
    const world = Life.placePattern(Life.createWorld(), preset.cells, -20, 40);
    assert.deepEqual(coordinates(Life.nextGeneration(world)), coordinates(world), `${preset.name} 应保持稳定`);
  }
});

test("蟾蜍和信标都是周期为 2 的振荡器", () => {
  for (const id of ["toad", "beacon"]) {
    const preset = getPreset(id);
    assert.ok(preset, `缺少振荡器 ${id}`);
    const world = Life.placePattern(Life.createWorld(), preset.cells, 100, -100);
    const next = Life.nextGeneration(world);
    assert.notDeepEqual(coordinates(next), coordinates(world), `${preset.name} 第一代应发生变化`);
    assert.deepEqual(coordinates(Life.nextGeneration(next)), coordinates(world), `${preset.name} 两代后应复原`);
  }
});

test("三种长寿型初始图案具有标准尺寸和细胞数", () => {
  const expected = {
    "r-pentomino": { width: 3, height: 3, cells: 5 },
    acorn: { width: 7, height: 3, cells: 7 },
    diehard: { width: 8, height: 3, cells: 7 },
  };
  for (const [id, shape] of Object.entries(expected)) {
    const preset = getPreset(id);
    assert.ok(preset, `缺少长寿图案 ${id}`);
    assert.deepEqual(
      { width: preset.width, height: preset.height, cells: preset.cells.length },
      shape,
    );
  }
  const diehard = Life.placePattern(Life.createWorld(), getPreset("diehard").cells, 0, 0);
  assert.equal(Life.countAlive(advance(diehard, 130)), 0, "Diehard 应在第 130 代消失");
});

test("高斯帕滑翔机枪是 36×9、36 细胞并在 30 代后发射滑翔机", () => {
  const preset = getPreset("gosper-glider-gun");
  assert.ok(preset);
  assert.deepEqual({ width: preset.width, height: preset.height, cells: preset.cells.length }, {
    width: 36,
    height: 9,
    cells: 36,
  });
  const initial = Life.placePattern(Life.createWorld(), preset.cells, 0, 0);
  const afterThirty = advance(initial, 30);
  assert.equal(Life.countAlive(afterThirty), 41);
  assert.ok(Life.bounds(afterThirty).maxRow > preset.height - 1, "发射出的滑翔机应离开枪体包围盒");
});

test("经典逻辑门覆盖 NOT、AND、OR 的完整真值表并在推荐代数给出正确输出", () => {
  const cases = [
    ["logic-not-0", "NOT", [0], 1],
    ["logic-not-1", "NOT", [1], 0],
    ["logic-and-00", "AND", [0, 0], 0],
    ["logic-and-01", "AND", [0, 1], 0],
    ["logic-and-10", "AND", [1, 0], 0],
    ["logic-and-11", "AND", [1, 1], 1],
    ["logic-or-00", "OR", [0, 0], 0],
    ["logic-or-01", "OR", [0, 1], 1],
    ["logic-or-10", "OR", [1, 0], 1],
    ["logic-or-11", "OR", [1, 1], 1],
  ];

  for (const [id, gate, inputs, expected] of cases) {
    const preset = getPreset(id);
    assert.ok(preset, `缺少逻辑门图案 ${id}`);
    assert.deepEqual(preset.logic.inputs, inputs);
    assert.equal(preset.logic.gate, gate);
    assert.equal(preset.logic.expected, expected);
    assert.match(preset.name, /逻辑/);
    assert.match(preset.description, new RegExp(`第 ${preset.logic.observeGeneration} 代`));

    const initial = Life.placePattern(Life.createWorld(), preset.cells, 0, 0);
    const observed = advance(initial, preset.logic.observeGeneration);
    assert.equal(
      Number(preset.logic.signalCells.every(([row, column]) => Life.isAlive(observed, row, column))),
      expected,
      `${preset.name} 的输出不符合真值`,
    );
  }
});

test("可连接门体加常量输入可无损还原全部经典逻辑门", () => {
  const cases = [
    ["logic-not-0", "NOT", [0]], ["logic-not-1", "NOT", [1]],
    ["logic-and-00", "AND", [0, 0]], ["logic-and-01", "AND", [0, 1]],
    ["logic-and-10", "AND", [1, 0]], ["logic-and-11", "AND", [1, 1]],
    ["logic-or-00", "OR", [0, 0]], ["logic-or-01", "OR", [0, 1]],
    ["logic-or-10", "OR", [1, 0]], ["logic-or-11", "OR", [1, 1]],
  ];
  for (const [presetId, gate, inputs] of cases) {
    const kit = getLogicGateKit(gate);
    const assembled = [...kit.bodyCells];
    inputs.forEach((input, index) => {
      const [originRow, originColumn] = kit.inputOrigins[index];
      const source = input ? kit.inputTrueCells : kit.inputFalseCells;
      assembled.push(...source.map(([row, column]) => [row + originRow, column + originColumn]));
    });
    assert.deepEqual(
      coordinates(Life.createWorld(assembled)),
      coordinates(Life.createWorld(getPreset(presetId).cells)),
      `${presetId} 必须能由门体和输入部件无损还原`,
    );
  }
});

test("双输入逻辑门纵向错开一格且横向间隔为偶数 42", () => {
  for (const preset of presets.filter((item) => ["AND", "OR"].includes(item.logic?.gate))) {
    assert.equal(preset.logic.inputOrigins.length, 2, `${preset.name} 应记录两个输入原点`);
    const [[firstRow, firstColumn], [secondRow, secondColumn]] = preset.logic.inputOrigins;
    assert.equal(Math.abs(firstRow - secondRow), 1, `${preset.name} 的输入 Y 坐标应相差一格`);
    assert.equal(Math.abs(firstColumn - secondColumn), 42, `${preset.name} 的输入 X 间隔应为偶数 42`);
  }
});

test("逻辑门固定探针和静物输出端几何保持稳定", () => {
  assert.deepEqual(
    {
      width: getPreset("logic-not-0").width,
      height: getPreset("logic-not-0").height,
      terminal: getPreset("logic-not-0").logic.terminalCells,
      generation: getPreset("logic-not-0").logic.observeGeneration,
    },
    {
      width: 77,
      height: 28,
      terminal: [[26, 43], [26, 44], [27, 43], [27, 44]],
      generation: 83,
    },
  );
  assert.deepEqual(
    {
      width: getPreset("logic-and-01").width,
      height: getPreset("logic-and-01").height,
      terminal: getPreset("logic-and-01").logic.terminalCells,
      generation: getPreset("logic-and-01").logic.observeGeneration,
    },
    {
      width: 119,
      height: 63,
      terminal: [[61, 57], [61, 58], [62, 57], [62, 58]],
      generation: 150,
    },
  );
  assert.deepEqual(
    {
      width: getPreset("logic-or-10").width,
      height: getPreset("logic-or-10").height,
      terminal: getPreset("logic-or-10").logic.terminalCells,
      generation: getPreset("logic-or-10").logic.observeGeneration,
    },
    {
      width: 165,
      height: 70,
      terminal: [[68, 99], [68, 100], [69, 99], [69, 100]],
      generation: 243,
    },
  );
});

test("逻辑门输出端始终是隔离静物，输出 1 是经过探针的完整滑翔机", () => {
  for (const preset of presets.filter((item) => item.logic)) {
    const terminal = new Set(preset.logic.terminalCells.map((cell) => cell.join(",")));
    const rows = preset.logic.terminalCells.map(([row]) => row);
    const columns = preset.logic.terminalCells.map(([, column]) => column);
    const minRow = Math.min(...rows);
    const maxRow = Math.max(...rows);
    const minColumn = Math.min(...columns);
    const maxColumn = Math.max(...columns);
    let world = Life.createWorld(preset.cells);
    let propagatedWorld = null;

    for (let generation = 0; generation <= 600; generation += 1) {
      for (let row = minRow - 1; row <= maxRow + 1; row += 1) {
        for (let column = minColumn - 1; column <= maxColumn + 1; column += 1) {
          assert.equal(
            Life.isAlive(world, row, column),
            terminal.has(`${row},${column}`),
            `${preset.name} 的静物输出端在第 ${generation} 代被干扰`,
          );
        }
      }

      if (generation === preset.logic.observeGeneration) {
        assert.equal(
          Number(preset.logic.signalCells.every(([row, column]) => Life.isAlive(world, row, column))),
          preset.logic.expected,
          `${preset.name} 的完整滑翔机信号不符合真值`,
        );
      }
      if (generation === preset.logic.observeGeneration + 4) propagatedWorld = world;
      if (generation < 600) world = Life.nextGeneration(world);
    }

    if (preset.logic.expected === 1) {
      for (const [row, column] of preset.logic.signalCells) {
        assert.equal(
          Life.isAlive(
            propagatedWorld,
            row + preset.logic.signalDelta[0],
            column + preset.logic.signalDelta[1],
          ),
          true,
          `${preset.name} 的输出必须是可继续传播的滑翔机`,
        );
      }
    }
  }
});

test("OR 门内部吞噬者在四种输入下连续 900 代保持 p30 完整", () => {
  const eaterCells = getLogicGateKit("OR").eaterCells;
  assert.equal(eaterCells.length, 7, "Eater 1 应由七个活细胞组成");
  for (const id of ["logic-or-00", "logic-or-01", "logic-or-10", "logic-or-11"]) {
    const preset = getPreset(id);
    let world = Life.createWorld(preset.cells);
    for (let generation = 0; generation <= 900; generation += 1) {
      if (generation % 30 === 0) {
        assert.ok(
          eaterCells.every(([row, column]) => Life.isAlive(world, row, column)),
          `${preset.name} 的吞噬者在第 ${generation} 代必须恢复完整结构`,
        );
      }
      if (generation < 900) world = Life.nextGeneration(world);
    }
  }
});

test("逻辑门旋转和翻转时同步转换输入原点、信号探针与静物输出端", () => {
  const original = getPreset("logic-and-01");
  const rotated = rotatePattern(original);
  const flipped = flipPattern(original);
  assert.deepEqual(
    rotated.logic.inputOrigins,
    original.logic.inputOrigins.map(([row, column]) => [column, original.height - 1 - row]),
  );
  assert.deepEqual(
    rotated.logic.signalCells,
    original.logic.signalCells.map(([row, column]) => [column, original.height - 1 - row]),
  );
  assert.deepEqual(
    flipped.logic.terminalCells,
    original.logic.terminalCells.map(([row, column]) => [row, original.width - 1 - column]),
  );
  assert.deepEqual(
    flipped.logic.inputOrigins,
    original.logic.inputOrigins.map(([row, column]) => [row, original.width - 1 - column]),
  );
  assert.deepEqual(rotated.logic.signalDelta, [
    original.logic.signalDelta[1],
    -original.logic.signalDelta[0],
  ]);
  assert.deepEqual(rotated.logic.inputs, original.logic.inputs);
  assert.equal(rotated.logic.expected, original.logic.expected);
});

test("90 度滑翔机反射器会转向单脉冲并恢复 p30 主体", () => {
  const reflector = getPreset("logic-reflector-90-single");
  assert.ok(reflector, "逻辑组件库应包含 90 度滑翔机反射器");
  assert.equal(reflector.logic.component, "REFLECTOR_90");
  assert.equal(reflector.logic.repeatTime, 60);
  assert.equal(reflector.logic.acceptedSignalPeriod, 60);
  assert.equal(reflector.logic.autoRoute, false, "p30 连续线路不得自动选用 p60 恢复组件");

  const world = advance(Life.createWorld(reflector.cells), reflector.logic.observeGeneration);
  assert.ok(
    reflector.logic.signalCells.every(([row, column]) => Life.isAlive(world, row, column)),
    "入射滑翔机应在第 60 代变成完整的转向输出滑翔机",
  );
  assert.ok(
    reflector.logic.reflectorBaseCells.every(([row, column]) => Life.isAlive(world, row, column)),
    "反射器主体应恢复到初始 p30 相位",
  );
  assert.equal(
    Life.countAlive(world),
    reflector.logic.reflectorBaseCells.length + reflector.logic.signalCells.length,
    "恢复后的世界除输出滑翔机外只应保留反射器主体",
  );
});

test("反射器与基础逻辑门一样支持旋转和翻转放置", () => {
  const original = getPreset("logic-reflector-90-single");
  const rotated = rotatePattern(original);
  const flipped = flipPattern(original);

  assert.deepEqual(
    rotated.logic.signalCells,
    original.logic.signalCells.map(([row, column]) => [column, original.height - 1 - row]),
  );
  assert.deepEqual(rotated.logic.signalDelta, [-1, -1]);
  assert.deepEqual(
    flipped.logic.reflectorBaseCells,
    original.logic.reflectorBaseCells.map(([row, column]) => [row, original.width - 1 - column]),
  );
});

test("p5 反射器可连续转向四枚间隔 30 代的逻辑信号", () => {
  const preset = getPreset("logic-reflector-p5-stream");
  const kit = getLogicReflectorKit("P5_90");
  assert.ok(preset);
  assert.equal(preset.logic.oscillatorPeriod, 5);
  assert.equal(preset.logic.repeatTime, 25);
  assert.equal(preset.logic.acceptedSignalPeriod, 30);
  assert.equal(preset.logic.autoRoute, true);

  const streams = [
    [[46, -18], [47, -17], [48, -18], [47, -16], [46, -17]],
    [[53, -25], [54, -25], [55, -26], [54, -24], [55, -24]],
    [[61, -33], [61, -32], [62, -32], [62, -31], [63, -33]],
    [[68, -40], [69, -40], [70, -41], [69, -39], [70, -39]],
  ];
  const world = advance(Life.createWorld([...kit.bodyCells, ...streams.flat()]), 420);
  const bodyKeys = new Set(kit.bodyCells.map((cell) => cell.join(",")));
  const alive = Life.aliveCoordinates(world);
  assert.ok(kit.bodyCells.every(([row, column]) => Life.isAlive(world, row, column)));
  assert.equal(alive.filter((cell) => !bodyKeys.has(cell.join(","))).length, 20);
  assert.equal(Life.countAlive(world), kit.bodyCells.length + 20);
});
