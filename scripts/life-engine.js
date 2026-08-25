(function exposeLifeEngine(root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  root.LifeEngine = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function createLifeEngine() {
  "use strict";

  const FORMAT = "conway-life-game";
  const FORMAT_VERSION = 2;
  const LEGACY_VERSION = 1;
  const MAX_LEGACY_DIMENSION = 250;
  const MAX_COORDINATE = Number.MAX_SAFE_INTEGER - 2;
  const DEFAULT_VIEW = Object.freeze({ centerRow: 0, centerColumn: 0, cellSize: 16 });

  function assertInteger(value, name, minimum, maximum) {
    if (!Number.isSafeInteger(value) || value < minimum || value > maximum) {
      throw new RangeError(`${name} 必须是 ${minimum}–${maximum} 之间的安全整数`);
    }
  }

  function assertCoordinate(value, name) {
    assertInteger(value, name, -MAX_COORDINATE, MAX_COORDINATE);
  }

  function coordinateKey(row, column) {
    return `${row},${column}`;
  }

  function parseKey(key) {
    const separator = key.indexOf(",");
    return [Number(key.slice(0, separator)), Number(key.slice(separator + 1))];
  }

  function assertWorld(world) {
    if (!world || typeof world !== "object" || !(world.cells instanceof Set)) {
      throw new TypeError("无限世界数据无效");
    }
  }

  function validateCoordinatePair(coordinate, label = "活细胞坐标") {
    if (!Array.isArray(coordinate) || coordinate.length !== 2) {
      throw new TypeError(`${label}必须是 [行, 列]`);
    }
    assertCoordinate(coordinate[0], `${label}行`);
    assertCoordinate(coordinate[1], `${label}列`);
    return coordinate;
  }

  function createWorld(alive = []) {
    if (!Array.isArray(alive)) throw new TypeError("活细胞坐标列表无效");
    const cells = new Set();
    for (const coordinate of alive) {
      const [row, column] = validateCoordinatePair(coordinate);
      cells.add(coordinateKey(row, column));
    }
    return { cells };
  }

  function cloneWorld(world) {
    assertWorld(world);
    return { cells: new Set(world.cells) };
  }

  function isAlive(world, row, column) {
    assertWorld(world);
    assertCoordinate(row, "行坐标");
    assertCoordinate(column, "列坐标");
    return world.cells.has(coordinateKey(row, column));
  }

  function setCell(world, row, column, alive) {
    assertWorld(world);
    assertCoordinate(row, "行坐标");
    assertCoordinate(column, "列坐标");
    const key = coordinateKey(row, column);
    if (alive) world.cells.add(key);
    else world.cells.delete(key);
    return true;
  }

  function countAlive(world) {
    assertWorld(world);
    return world.cells.size;
  }

  function nextGeneration(world) {
    assertWorld(world);
    const neighborCounts = new Map();

    for (const key of world.cells) {
      const [row, column] = parseKey(key);
      if (!neighborCounts.has(key)) neighborCounts.set(key, 0);
      for (let rowOffset = -1; rowOffset <= 1; rowOffset += 1) {
        for (let columnOffset = -1; columnOffset <= 1; columnOffset += 1) {
          if (rowOffset === 0 && columnOffset === 0) continue;
          const neighborRow = row + rowOffset;
          const neighborColumn = column + columnOffset;
          if (Math.abs(neighborRow) > MAX_COORDINATE || Math.abs(neighborColumn) > MAX_COORDINATE) continue;
          const neighborKey = coordinateKey(neighborRow, neighborColumn);
          neighborCounts.set(neighborKey, (neighborCounts.get(neighborKey) || 0) + 1);
        }
      }
    }

    const next = createWorld();
    for (const [key, count] of neighborCounts) {
      if (count === 3 || (count === 2 && world.cells.has(key))) next.cells.add(key);
    }
    return next;
  }

  function randomWorld(rows = 40, columns = 60, density = 0.25, random = Math.random, centerRow = 0, centerColumn = 0) {
    assertInteger(rows, "随机区域行数", 1, MAX_LEGACY_DIMENSION);
    assertInteger(columns, "随机区域列数", 1, MAX_LEGACY_DIMENSION);
    if (typeof density !== "number" || density < 0 || density > 1) {
      throw new RangeError("随机密度必须在 0–1 之间");
    }
    if (typeof random !== "function") throw new TypeError("随机数来源必须是函数");
    assertCoordinate(centerRow, "中心行");
    assertCoordinate(centerColumn, "中心列");

    const startRow = Math.floor(centerRow - rows / 2);
    const startColumn = Math.floor(centerColumn - columns / 2);
    const world = createWorld();
    for (let rowOffset = 0; rowOffset < rows; rowOffset += 1) {
      for (let columnOffset = 0; columnOffset < columns; columnOffset += 1) {
        if (random() < density) setCell(world, startRow + rowOffset, startColumn + columnOffset, true);
      }
    }
    return world;
  }

  function placePattern(world, patternCells, offsetRow, offsetColumn, replace = true) {
    assertWorld(world);
    assertCoordinate(offsetRow, "起始行");
    assertCoordinate(offsetColumn, "起始列");
    if (!Array.isArray(patternCells)) throw new TypeError("图案坐标无效");

    const placed = replace ? createWorld() : cloneWorld(world);
    for (const coordinate of patternCells) {
      const [relativeRow, relativeColumn] = validateCoordinatePair(coordinate, "图案坐标");
      const row = offsetRow + relativeRow;
      const column = offsetColumn + relativeColumn;
      assertCoordinate(row, "放置后行坐标");
      assertCoordinate(column, "放置后列坐标");
      placed.cells.add(coordinateKey(row, column));
    }
    return placed;
  }

  function aliveCoordinates(world) {
    assertWorld(world);
    return [...world.cells]
      .map(parseKey)
      .sort((left, right) => left[0] - right[0] || left[1] - right[1]);
  }

  function bounds(world) {
    assertWorld(world);
    if (world.cells.size === 0) return null;
    let minRow = Infinity;
    let maxRow = -Infinity;
    let minColumn = Infinity;
    let maxColumn = -Infinity;
    for (const key of world.cells) {
      const [row, column] = parseKey(key);
      minRow = Math.min(minRow, row);
      maxRow = Math.max(maxRow, row);
      minColumn = Math.min(minColumn, column);
      maxColumn = Math.max(maxColumn, column);
    }
    return { minRow, maxRow, minColumn, maxColumn };
  }

  function normalizeView(view = DEFAULT_VIEW) {
    if (!view || typeof view !== "object") throw new TypeError("视图数据无效");
    const centerRow = Number(view.centerRow);
    const centerColumn = Number(view.centerColumn);
    const cellSize = Number(view.cellSize);
    if (!Number.isFinite(centerRow) || Math.abs(centerRow) > MAX_COORDINATE) throw new RangeError("视图中心行无效");
    if (!Number.isFinite(centerColumn) || Math.abs(centerColumn) > MAX_COORDINATE) throw new RangeError("视图中心列无效");
    if (!Number.isFinite(cellSize) || cellSize <= 0 || cellSize > 1_000_000) throw new RangeError("视图倍率无效");
    return { centerRow, centerColumn, cellSize };
  }

  function serialize(world, generation = 0, view = DEFAULT_VIEW) {
    assertWorld(world);
    assertInteger(generation, "代数", 0, Number.MAX_SAFE_INTEGER);
    return {
      format: FORMAT,
      version: FORMAT_VERSION,
      generation,
      alive: aliveCoordinates(world),
      view: normalizeView(view),
    };
  }

  function parseInput(input) {
    try {
      return typeof input === "string" ? JSON.parse(input) : input;
    } catch {
      throw new SyntaxError("文件不是有效的 JSON");
    }
  }

  function deserialize(input) {
    const data = parseInput(input);
    if (!data || typeof data !== "object" || Array.isArray(data)) throw new TypeError("文件内容必须是一个对象");
    if (data.format !== FORMAT) throw new TypeError("文件格式不受支持");
    if (![LEGACY_VERSION, FORMAT_VERSION].includes(data.version)) throw new RangeError("文件版本不受支持");
    assertInteger(data.generation, "代数", 0, Number.MAX_SAFE_INTEGER);
    if (!Array.isArray(data.alive)) throw new TypeError("活细胞坐标列表无效");

    if (data.version === LEGACY_VERSION) {
      assertInteger(data.rows, "行数", 1, MAX_LEGACY_DIMENSION);
      assertInteger(data.columns, "列数", 1, MAX_LEGACY_DIMENSION);
      for (const coordinate of data.alive) {
        const [row, column] = validateCoordinatePair(coordinate);
        if (row < 0 || row >= data.rows || column < 0 || column >= data.columns) {
          throw new RangeError("旧版活细胞坐标超出棋盘范围");
        }
      }
      return {
        world: createWorld(data.alive),
        generation: data.generation,
        view: { centerRow: data.rows / 2, centerColumn: data.columns / 2, cellSize: DEFAULT_VIEW.cellSize },
        migratedFrom: LEGACY_VERSION,
      };
    }

    return {
      world: createWorld(data.alive),
      generation: data.generation,
      view: normalizeView(data.view || DEFAULT_VIEW),
      migratedFrom: null,
    };
  }

  return Object.freeze({
    DEFAULT_VIEW,
    FORMAT,
    FORMAT_VERSION,
    MAX_COORDINATE,
    aliveCoordinates,
    bounds,
    cloneWorld,
    coordinateKey,
    countAlive,
    createWorld,
    deserialize,
    isAlive,
    nextGeneration,
    placePattern,
    randomWorld,
    serialize,
    setCell,
  });
});
