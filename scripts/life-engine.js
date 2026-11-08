(function exposeLifeEngine(root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  root.LifeEngine = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function createLifeEngine() {
  "use strict";

  const FORMAT = "conway-life-game";
  const FORMAT_VERSION = 3;
  const PREVIOUS_VERSION = 2;
  const LEGACY_VERSION = 1;
  const MAX_LEGACY_DIMENSION = 250;
  const MAX_COORDINATE = Number.MAX_SAFE_INTEGER - 2;
  const DEFAULT_VIEW = Object.freeze({ centerRow: 0, centerColumn: 0, cellSize: 16 });
  const DEFAULT_RULE = "B3/S23";
  const LIVE_CELL_BIT = 16;
  const NEIGHBOR_MASK = 15;
  const MAX_DENSE_AREA = 1_000_000;
  const MAX_DENSE_AREA_PER_LIVE_CELL = 24;
  const ruleCache = new Map();

  function parseRule(input) {
    if (typeof input !== "string" || input.length > 64) throw new TypeError("规则须为不超过 64 字符的 B3/S23 或 S23/B3/C2 写法");
    const text = input.replace(/\s/g, "").toUpperCase();
    if (ruleCache.has(text)) return ruleCache.get(text);
    const parts = text.split("/");
    if (parts.length < 2 || parts.length > 3) throw new TypeError("规则必须包含 B 出生条件与 S 存活条件，可附加 C2");
    const fields = new Map();
    for (const part of parts) {
      const match = /^([BS])([0-8]*)$/.exec(part) || /^(C)(\d+)$/.exec(part);
      if (!match) throw new TypeError("规则只允许 B/S、邻居数 0–8 和可选 C2");
      const [, type, values] = match;
      if (fields.has(type)) throw new TypeError("规则字段不能重复");
      if (type === "C") {
        if (values !== "2") throw new RangeError("目前仅支持两状态 C2，不支持多状态规则");
      } else if (new Set(values).size !== values.length) throw new TypeError("邻居数不能重复");
      fields.set(type, [...values].sort().join(""));
    }
    if (!fields.has("B") || !fields.has("S")) throw new TypeError("规则必须同时包含 B 和 S");
    const birth = fields.get("B");
    const survival = fields.get("S");
    if (birth.includes("0")) throw new RangeError("无限稀疏棋盘暂不支持 B0：空白区域会产生无限个细胞");
    const mask = (values) => [...values].reduce((bits, digit) => bits | (1 << Number(digit)), 0);
    const rule = Object.freeze({ birth, survival, states: 2, canonical: `B${birth}/S${survival}`, birthMask: mask(birth), survivalMask: mask(survival) });
    if (ruleCache.size >= 64) ruleCache.delete(ruleCache.keys().next().value);
    ruleCache.set(text, rule);
    return rule;
  }

  function formatRule(input, notation = "bs") {
    const { birth, survival } = parseRule(input);
    if (notation === "bs") return `B${birth}/S${survival}`;
    if (notation === "sb") return `S${survival}/B${birth}`;
    if (notation === "sbc") return `S${survival}/B${birth}/C2`;
    throw new RangeError("不支持的规则显示格式");
  }

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

  function nextCellSet(cells, rule = DEFAULT_RULE) {
    if (!(cells instanceof Set)) throw new TypeError("活细胞集合无效");
    const { birthMask, survivalMask } = parseRule(rule);
    if (!cells.size) return new Set();

    const coordinates = [];
    let minRow = Infinity;
    let maxRow = -Infinity;
    let minColumn = Infinity;
    let maxColumn = -Infinity;
    for (const key of cells) {
      const [row, column] = parseKey(key);
      coordinates.push(row, column);
      minRow = Math.min(minRow, row);
      maxRow = Math.max(maxRow, row);
      minColumn = Math.min(minColumn, column);
      maxColumn = Math.max(maxColumn, column);
    }
    const width = maxColumn - minColumn + 3;
    const height = maxRow - minRow + 3;
    const area = width * height;
    if (area <= MAX_DENSE_AREA && area <= cells.size * MAX_DENSE_AREA_PER_LIVE_CELL
      && minRow > -MAX_COORDINATE && maxRow < MAX_COORDINATE
      && minColumn > -MAX_COORDINATE && maxColumn < MAX_COORDINATE) {
      return nextDenseCellSet(coordinates, minRow - 1, minColumn - 1, width, height, birthMask, survivalMask);
    }
    return nextSparseCellSet(coordinates, birthMask, survivalMask);
  }

  function nextDenseCellSet(coordinates, top, left, width, height, birthMask, survivalMask) {
    // The one-cell margin keeps all eight neighbor indexes inside the array.
    const counts = new Uint8Array(width * height);
    for (let index = 0; index < coordinates.length; index += 2) {
      const center = (coordinates[index] - top) * width + (coordinates[index + 1] - left);
      counts[center - width - 1] += 1;
      counts[center - width] += 1;
      counts[center - width + 1] += 1;
      counts[center - 1] += 1;
      counts[center] |= LIVE_CELL_BIT;
      counts[center + 1] += 1;
      counts[center + width - 1] += 1;
      counts[center + width] += 1;
      counts[center + width + 1] += 1;
    }

    const next = new Set();
    for (let row = 0; row < height; row += 1) {
      const offset = row * width;
      for (let column = 0; column < width; column += 1) {
        const value = counts[offset + column];
        const mask = value & LIVE_CELL_BIT ? survivalMask : birthMask;
        if (mask & (1 << (value & NEIGHBOR_MASK))) next.add(coordinateKey(top + row, left + column));
      }
    }
    return next;
  }

  function countNeighbor(row, column) {
    row.set(column, (row.get(column) || 0) + 1);
  }

  function countSideNeighbors(row, column) {
    if (column > -MAX_COORDINATE) countNeighbor(row, column - 1);
    if (column < MAX_COORDINATE) countNeighbor(row, column + 1);
  }

  function nextSparseCellSet(coordinates, birthMask, survivalMask) {
    const rows = new Map();
    function getRow(row) {
      let counts = rows.get(row);
      if (!counts) {
        counts = new Map();
        rows.set(row, counts);
      }
      return counts;
    }

    for (let index = 0; index < coordinates.length; index += 2) {
      const row = coordinates[index];
      const column = coordinates[index + 1];
      const current = getRow(row);
      current.set(column, (current.get(column) || 0) | LIVE_CELL_BIT);
      countSideNeighbors(current, column);
      if (row > -MAX_COORDINATE) {
        const above = getRow(row - 1);
        countNeighbor(above, column);
        countSideNeighbors(above, column);
      }
      if (row < MAX_COORDINATE) {
        const below = getRow(row + 1);
        countNeighbor(below, column);
        countSideNeighbors(below, column);
      }
    }
    const next = new Set();
    for (const [row, counts] of rows) {
      for (const [column, value] of counts) {
        const mask = value & LIVE_CELL_BIT ? survivalMask : birthMask;
        if (mask & (1 << (value & NEIGHBOR_MASK))) next.add(coordinateKey(row, column));
      }
    }
    return next;
  }

  function nextGeneration(world, rule = DEFAULT_RULE) {
    assertWorld(world);
    return { cells: nextCellSet(world.cells, rule) };
  }

  function gliderMask(coordinates) {
    const top = Math.min(...coordinates.map(([row]) => row));
    const left = Math.min(...coordinates.map(([, column]) => column));
    let mask = 0;
    for (const [row, column] of coordinates) {
      if (row - top > 2 || column - left > 2) return 0;
      mask |= 1 << ((row - top) * 3 + (column - left));
    }
    return mask;
  }

  function createGliderMasks() {
    const masks = new Set();
    let cells = createWorld([[0, 1], [1, 2], [2, 0], [2, 1], [2, 2]]).cells;
    for (let phase = 0; phase < 4; phase += 1) {
      const coordinates = [...cells].map(parseKey);
      for (const rowSign of [-1, 1]) {
        for (const columnSign of [-1, 1]) {
          masks.add(gliderMask(coordinates.map(([row, column]) => [rowSign * row, columnSign * column])));
          masks.add(gliderMask(coordinates.map(([row, column]) => [rowSign * column, columnSign * row])));
        }
      }
      cells = nextCellSet(cells);
    }
    return masks;
  }

  const gliderMasks = createGliderMasks();

  function extremeCellKeys(cells) {
    let minRow = Infinity;
    let maxRow = -Infinity;
    let minColumn = Infinity;
    let maxColumn = -Infinity;
    const keys = {};
    for (const key of cells) {
      const [row, column] = parseKey(key);
      if (row < minRow) {
        minRow = row;
        keys.top = key;
      }
      if (row > maxRow) {
        maxRow = row;
        keys.bottom = key;
      }
      if (column < minColumn) {
        minColumn = column;
        keys.left = key;
      }
      if (column > maxColumn) {
        maxColumn = column;
        keys.right = key;
      }
    }
    return new Set(Object.values(keys));
  }

  function gliderComponent(cells, seed) {
    const component = new Map([[seed, parseKey(seed)]]);
    for (const [row, column] of component.values()) {
      for (let y = row - 1; y <= row + 1; y += 1) {
        for (let x = column - 1; x <= column + 1; x += 1) {
          const key = coordinateKey(y, x);
          if (!cells.has(key) || component.has(key)) continue;
          if (component.size === 5) return null;
          component.set(key, [y, x]);
        }
      }
    }
    return component.size === 5 && gliderMasks.has(gliderMask([...component.values()])) ? component : null;
  }

  function pruneOutlyingGliders(world) {
    assertWorld(world);
    if (world.cells.size <= 5) return world;
    // A glider outside the remainder's bounds must own at least one whole outer edge.
    const seeds = extremeCellKeys(world.cells);
    let remaining = world;
    for (const seed of seeds) {
      const glider = gliderComponent(world.cells, seed);
      if (!glider) continue;
      for (const key of glider.keys()) seeds.delete(key);
      const rectangle = cellBounds(world.cells, glider);
      const hasCellInside = [...glider.values()].some(([row, column]) =>
        row >= rectangle.minRow && row <= rectangle.maxRow
        && column >= rectangle.minColumn && column <= rectangle.maxColumn,
      );
      if (hasCellInside) continue;
      if (remaining === world) remaining = cloneWorld(world);
      for (const key of glider.keys()) remaining.cells.delete(key);
    }
    return remaining;
  }

  function sameCells(left, right) {
    if (left.size !== right.size) return false;
    for (const key of left) {
      if (!right.has(key)) return false;
    }
    return true;
  }

  function cellSignature(cells) {
    let sum = 0;
    let xor = 0;
    for (const key of cells) {
      let hash = 2166136261;
      for (let index = 0; index < key.length; index += 1) {
        hash = Math.imul(hash ^ key.charCodeAt(index), 16777619);
      }
      sum = (sum + hash) | 0;
      xor ^= hash;
    }
    return `${cells.size}:${sum}:${xor}`;
  }

  function createCycleTracker({ maxSnapshots = 256, maxTrackedCells = 160_000 } = {}) {
    const recent = new Map();
    const snapshots = [];
    let trackedCells = 0;
    let checkpoint = null;
    let checkpointWindow = 1;
    let lastGeneration = null;
    let period = null;
    let cycleStart = 0;
    let cycleFrames = null;

    function clearHistory() {
      recent.clear();
      snapshots.length = 0;
      trackedCells = 0;
      checkpoint = null;
    }

    function reset() {
      clearHistory();
      checkpointWindow = 1;
      lastGeneration = null;
      period = null;
      cycleFrames = null;
    }

    function confirm(generation, previousGeneration) {
      period = generation - previousGeneration;
      const first = snapshots.findIndex((snapshot) => snapshot.generation === previousGeneration);
      if (first !== -1 && snapshots[first + period - 1]?.generation === generation - 1) {
        cycleStart = previousGeneration;
        cycleFrames = snapshots.slice(first, first + period).map((snapshot) => snapshot.world);
      }
      clearHistory();
      return period;
    }

    // Recorded and restored phases are read-only until reset.
    function observe(world, generation) {
      if (lastGeneration === generation) return period;
      if (lastGeneration !== null && generation !== lastGeneration + 1) reset();
      lastGeneration = generation;
      if (period !== null) return period;

      const { cells } = world;
      const key = maxSnapshots > 0 && cells.size <= maxTrackedCells ? cellSignature(cells) : null;
      if (key !== null) {
        const matches = recent.get(key) || [];
        for (let index = matches.length - 1; index >= 0; index -= 1) {
          const previous = matches[index];
          if (sameCells(cells, previous.world.cells)) return confirm(generation, previous.generation);
        }
        const snapshot = { world, generation, key };
        matches.push(snapshot);
        recent.set(key, matches);
        snapshots.push(snapshot);
        trackedCells += cells.size;
        while (snapshots.length > maxSnapshots || trackedCells > maxTrackedCells) {
          const oldest = snapshots.shift();
          trackedCells -= oldest.world.cells.size;
          const bucket = recent.get(oldest.key);
          bucket.shift();
          if (bucket.length === 0) recent.delete(oldest.key);
        }
      }

      // Brent's exponentially spaced checkpoints keep looking for longer
      // cycles after their first occurrence leaves the snapshot window.
      if (!checkpoint) checkpoint = { cells, generation };
      else {
        if (sameCells(cells, checkpoint.cells)) return confirm(generation, checkpoint.generation);
        if (generation - checkpoint.generation >= checkpointWindow) {
          checkpoint = { cells, generation };
          checkpointWindow *= 2;
        }
      }
      return period;
    }

    function fastForward(world, generation, maxGenerations) {
      if (period === null || lastGeneration !== generation
        || !Number.isSafeInteger(maxGenerations) || maxGenerations < 1) return null;
      const generations = cycleFrames ? maxGenerations : maxGenerations - maxGenerations % period;
      const target = generation + generations;
      if (!generations || !Number.isSafeInteger(target)) return null;

      lastGeneration = target;
      return {
        world: cycleFrames ? cycleFrames[(target - cycleStart) % period] : world,
        generations,
      };
    }

    return Object.freeze({ observe, fastForward, reset, get period() { return period; } });
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
    return cellBounds(world.cells);
  }

  function cellBounds(cells, excluded) {
    let minRow = Infinity;
    let maxRow = -Infinity;
    let minColumn = Infinity;
    let maxColumn = -Infinity;
    for (const key of cells) {
      if (excluded?.has(key)) continue;
      const [row, column] = parseKey(key);
      minRow = Math.min(minRow, row);
      maxRow = Math.max(maxRow, row);
      minColumn = Math.min(minColumn, column);
      maxColumn = Math.max(maxColumn, column);
    }
    return minRow === Infinity ? null : { minRow, maxRow, minColumn, maxColumn };
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

  function serialize(world, generation = 0, view = DEFAULT_VIEW, rule = DEFAULT_RULE) {
    assertWorld(world);
    assertInteger(generation, "代数", 0, Number.MAX_SAFE_INTEGER);
    return {
      format: FORMAT,
      version: FORMAT_VERSION,
      rule: parseRule(rule).canonical,
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
    if (![LEGACY_VERSION, PREVIOUS_VERSION, FORMAT_VERSION].includes(data.version)) throw new RangeError("文件版本不受支持");
    const rule = data.version === FORMAT_VERSION ? parseRule(data.rule).canonical : DEFAULT_RULE;
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
        rule,
        generation: data.generation,
        view: { centerRow: data.rows / 2, centerColumn: data.columns / 2, cellSize: DEFAULT_VIEW.cellSize },
        migratedFrom: LEGACY_VERSION,
      };
    }

    return {
      world: createWorld(data.alive),
      rule,
      generation: data.generation,
      view: normalizeView(data.view || DEFAULT_VIEW),
      migratedFrom: null,
    };
  }

  return Object.freeze({
    DEFAULT_RULE,
    DEFAULT_VIEW,
    FORMAT,
    FORMAT_VERSION,
    MAX_COORDINATE,
    aliveCoordinates,
    bounds,
    cloneWorld,
    coordinateKey,
    countAlive,
    createCycleTracker,
    createWorld,
    deserialize,
    formatRule,
    isAlive,
    nextCellSet,
    nextGeneration,
    parseRule,
    placePattern,
    pruneOutlyingGliders,
    randomWorld,
    serialize,
    setCell,
  });
});
