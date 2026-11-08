(function exposeLifeTiles(root, factory) {
  const Life = typeof module === "object" && module.exports ? require("./life-engine.js") : root.LifeEngine;
  const api = factory(Life);
  if (typeof module === "object" && module.exports) module.exports = api;
  root.LifeTiles = api;
})(globalThis, function createLifeTiles(Life) {
  "use strict";

  const SIZE = 16;
  const ROW_MASK = (1 << SIZE) - 1;
  const RIGHT_EDGE = 1 << (SIZE - 1);
  const STRIDE = 2 ** 22;
  const TILE_LIMIT = 2 ** 20 - 2;
  const MIN_POPULATION = 32;
  const MAX_TILE_STATES = 32_768;
  const MAX_TRANSITIONS = 131_072;
  const MIN_INDEXED_TILES = 2000;
  const MAX_INDEX_AREA = 8_000_000;
  const INDEX_PADDING = 8;
  const worldData = new WeakMap();
  const tileStates = new Map();
  const halo = new Uint32Array(SIZE + 2);
  const empty = {
    rows: new Uint16Array(SIZE), top: 0, bottom: 0, left: 0, right: 0, memo: new Map(),
  };
  let transitionCount = 0;
  let tileIndex = null;

  function firstColumn(bits) {
    return 31 - Math.clz32(bits & -bits);
  }

  function tileExtrema(rows) {
    let occupiedColumns = 0;
    let top = -1;
    let bottom = -1;
    for (let row = 0; row < SIZE; row += 1) {
      if (!rows[row]) continue;
      occupiedColumns |= rows[row];
      if (top === -1) top = row;
      bottom = row;
    }
    if (!occupiedColumns) return null;
    const left = firstColumn(occupiedColumns);
    const right = 31 - Math.clz32(occupiedColumns);
    return {
      top, bottom, left, right,
      topColumn: firstColumn(rows[top]),
      bottomColumn: firstColumn(rows[bottom]),
      leftRow: rows.findIndex((word) => word & (1 << left)),
      rightRow: rows.findIndex((word) => word & (1 << right)),
    };
  }

  function internTile(rows) {
    if (!rows.some(Boolean)) return null;
    const key = rows.join(",");
    const existing = tileStates.get(key);
    if (existing) return existing;

    let population = 0;
    let hash = 2166136261;
    let left = 0;
    let right = 0;
    for (let row = 0; row < SIZE; row += 1) {
      const word = rows[row];
      hash = Math.imul(hash ^ word, 16777619);
      left |= (word & 1) << row;
      right |= (word >>> (SIZE - 1)) << row;
      for (let bits = word; bits; bits &= bits - 1) population += 1;
    }
    const memo = tileStates.size < MAX_TILE_STATES ? new Map() : null;
    const tile = { rows, top: rows[0], bottom: rows[SIZE - 1], left, right, hash, population, memo, extrema: null };
    if (memo) tileStates.set(key, tile);
    return tile;
  }

  function nextTile(center, top, bottom, left, right, corners) {
    const verticalKey = top + bottom * (2 ** SIZE);
    const horizontalKey = left + right * (2 ** SIZE) + corners * (2 ** (2 * SIZE));
    let byHorizontal = center.memo?.get(verticalKey);
    if (byHorizontal?.has(horizontalKey)) return byHorizontal.get(horizontalKey);

    // Each 18-bit row contains the tile row plus one cell on either side.
    halo[0] = (top << 1) | (corners & 1) | ((corners & 2) << SIZE);
    halo[SIZE + 1] = (bottom << 1) | ((corners & 4) >>> 2) | ((corners & 8) << (SIZE - 2));
    for (let row = 0; row < SIZE; row += 1) {
      halo[row + 1] = (center.rows[row] << 1) | ((left >>> row) & 1) | (((right >>> row) & 1) << (SIZE + 1));
    }
    const rows = new Uint16Array(SIZE);
    for (let row = 1; row <= SIZE; row += 1) {
      const above = halo[row - 1];
      const middle = halo[row];
      const below = halo[row + 1];
      if (!(above | middle | below)) continue;
      let ones = 0;
      let twos = 0;
      let fourOrMore = 0;
      for (const word of [above << 1, above, above >>> 1, middle << 1, middle >>> 1, below << 1, below, below >>> 1]) {
        const carry = ones & word;
        ones ^= word;
        fourOrMore |= twos & carry;
        twos ^= carry;
      }
      // Exactly three neighbors give birth. Exactly two preserve a live cell.
      rows[row - 1] = ((twos & ~fourOrMore & (ones | middle)) >>> 1) & ROW_MASK;
    }
    const result = internTile(rows);
    if (center.memo && (!result || result.memo) && transitionCount < MAX_TRANSITIONS) {
      if (!byHorizontal) {
        byHorizontal = new Map();
        center.memo.set(verticalKey, byHorizontal);
      }
      byHorizontal.set(horizontalKey, result);
      transitionCount += 1;
    }
    return result;
  }

  function tileRow(key) {
    return Math.floor((key + STRIDE / 2) / STRIDE);
  }

  function materialize(tiles) {
    const cells = new Set();
    for (const [key, tile] of tiles) {
      const blockRow = tileRow(key);
      const top = blockRow * SIZE;
      const left = (key - blockRow * STRIDE) * SIZE;
      for (let row = 0; row < SIZE; row += 1) {
        for (let bits = tile.rows[row]; bits; bits &= bits - 1) {
          const column = 31 - Math.clz32(bits & -bits);
          cells.add((top + row) + "," + (left + column));
        }
      }
    }
    return cells;
  }

  function visitVisibleCells(tiles, view, visit, visitWholeTile) {
    const firstTileRow = Math.max(-TILE_LIMIT, Math.floor(view.minRow / SIZE));
    const lastTileRow = Math.min(TILE_LIMIT, Math.floor(view.maxRow / SIZE));
    const firstTileColumn = Math.max(-TILE_LIMIT, Math.floor(view.minColumn / SIZE));
    const lastTileColumn = Math.min(TILE_LIMIT, Math.floor(view.maxColumn / SIZE));
    if (firstTileRow > lastTileRow || firstTileColumn > lastTileColumn) return;

    function visitTile(tile, blockRow, blockColumn) {
      const top = blockRow * SIZE;
      const left = blockColumn * SIZE;
      const firstRow = Math.max(0, view.minRow - top);
      const lastRow = Math.min(SIZE - 1, view.maxRow - top);
      const firstColumn = Math.max(0, view.minColumn - left);
      const lastColumn = Math.min(SIZE - 1, view.maxColumn - left);
      if (visitWholeTile && firstRow === 0 && lastRow === SIZE - 1
        && firstColumn === 0 && lastColumn === SIZE - 1 && visitWholeTile(top, left, SIZE)) return;
      const mask = (ROW_MASK << firstColumn) & (ROW_MASK >>> (SIZE - 1 - lastColumn));
      for (let row = firstRow; row <= lastRow; row += 1) {
        for (let bits = tile.rows[row] & mask; bits; bits &= bits - 1) {
          visit(top + row, left + 31 - Math.clz32(bits & -bits));
        }
      }
    }

    const area = (lastTileRow - firstTileRow + 1) * (lastTileColumn - firstTileColumn + 1);
    if (area <= tiles.size) {
      for (let row = firstTileRow; row <= lastTileRow; row += 1) {
        for (let column = firstTileColumn; column <= lastTileColumn; column += 1) {
          const tile = tiles.get(row * STRIDE + column);
          if (tile) visitTile(tile, row, column);
        }
      }
    } else {
      for (const [key, tile] of tiles) {
        const row = tileRow(key);
        const column = key - row * STRIDE;
        if (row >= firstTileRow && row <= lastTileRow && column >= firstTileColumn && column <= lastTileColumn) {
          visitTile(tile, row, column);
        }
      }
    }
  }

  function createWorld(tiles) {
    let population = 0;
    let sum = 0;
    let xor = 0;
    let canAdvance = true;
    const bounds = { minRow: Infinity, maxRow: -Infinity, minColumn: Infinity, maxColumn: -Infinity };
    for (const [key, tile] of tiles) {
      const row = tileRow(key);
      const column = key - row * STRIDE;
      bounds.minRow = Math.min(bounds.minRow, row);
      bounds.maxRow = Math.max(bounds.maxRow, row);
      bounds.minColumn = Math.min(bounds.minColumn, column);
      bounds.maxColumn = Math.max(bounds.maxColumn, column);
      if (Math.abs(row) >= TILE_LIMIT || Math.abs(column) >= TILE_LIMIT) canAdvance = false;
      population += tile.population;
      const positionedHash = Math.imul(tile.hash ^ row, 16777619) ^ Math.imul(column, 0x9e3779b1);
      sum = (sum + positionedHash) | 0;
      xor ^= positionedHash;
    }
    let cells;
    const world = {
      get cells() { return cells ??= materialize(tiles); },
      visitVisibleCells: (view, visit, visitWholeTile) => visitVisibleCells(tiles, view, visit, visitWholeTile),
    };
    worldData.set(world, { tiles, bounds, population, canAdvance, signature: "tiles:" + tiles.size + ":" + population + ":" + sum + ":" + xor });
    return world;
  }

  function prepare(world) {
    if (worldData.has(world) || world.cells.size < MIN_POPULATION) return world;
    const tiles = new Map();
    for (const key of world.cells) {
      const comma = key.indexOf(",");
      const row = Number(key.slice(0, comma));
      const column = Number(key.slice(comma + 1));
      const blockRow = Math.floor(row / SIZE);
      const blockColumn = Math.floor(column / SIZE);
      if (Math.abs(blockRow) >= TILE_LIMIT || Math.abs(blockColumn) >= TILE_LIMIT) return world;
      const blockKey = blockRow * STRIDE + blockColumn;
      let rows = tiles.get(blockKey);
      if (!rows) {
        rows = new Uint16Array(SIZE);
        tiles.set(blockKey, rows);
      }
      rows[row - blockRow * SIZE] |= 1 << (column - blockColumn * SIZE);
    }
    if (tiles.size * 2 > world.cells.size) return world;
    for (const [key, rows] of tiles) tiles.set(key, internTile(rows));
    return createWorld(tiles);
  }

  function addNeighbors(key, tile, stride, add) {
    if (tile.top) add(key - stride);
    if (tile.bottom) add(key + stride);
    if (tile.left) add(key - 1);
    if (tile.right) add(key + 1);
    if (tile.top & 1) add(key - stride - 1);
    if (tile.top & RIGHT_EDGE) add(key - stride + 1);
    if (tile.bottom & 1) add(key + stride - 1);
    if (tile.bottom & RIGHT_EDGE) add(key + stride + 1);
  }

  function evolveAt(key, stride, get) {
    const top = get(key - stride)?.bottom ?? 0;
    const bottom = get(key + stride)?.top ?? 0;
    const left = get(key - 1)?.right ?? 0;
    const right = get(key + 1)?.left ?? 0;
    const corners = ((get(key - stride - 1)?.bottom ?? 0) >>> (SIZE - 1))
      | (((get(key - stride + 1)?.bottom ?? 0) & 1) << 1)
      | (((get(key + stride - 1)?.top ?? 0) >>> (SIZE - 1)) << 2)
      | (((get(key + stride + 1)?.top ?? 0) & 1) << 3);
    return nextTile(get(key) ?? empty, top, bottom, left, right, corners);
  }

  function nextSparseTiles(tiles) {
    const candidates = new Set();
    const next = new Map();
    const add = (key) => candidates.add(key);
    const get = (key) => tiles.get(key);
    for (const [key, tile] of tiles) {
      add(key);
      addNeighbors(key, tile, STRIDE, add);
    }
    for (const key of candidates) {
      const tile = evolveAt(key, STRIDE, get);
      if (tile) next.set(key, tile);
    }
    return next;
  }

  function getTileIndex(bounds) {
    if (tileIndex
      && bounds.minRow >= tileIndex.top + 2 && bounds.maxRow <= tileIndex.bottom - 2
      && bounds.minColumn >= tileIndex.left + 2 && bounds.maxColumn <= tileIndex.right - 2) return tileIndex;

    const top = bounds.minRow - INDEX_PADDING;
    const bottom = bounds.maxRow + INDEX_PADDING;
    const left = bounds.minColumn - INDEX_PADDING;
    const right = bounds.maxColumn + INDEX_PADDING;
    const width = right - left + 1;
    const area = width * (bottom - top + 1);
    if (area > MAX_INDEX_AREA) return null;
    tileIndex = { top, bottom, left, right, width, slots: new Int32Array(area) };
    return tileIndex;
  }

  function nextIndexedTiles(tiles, { top, left, width, slots }) {
    const candidates = [];
    const contents = [];
    const next = new Map();
    function add(index) {
      if (slots[index] !== 0) return;
      slots[index] = -1;
      candidates.push(index);
    }
    function get(index) {
      const slot = slots[index];
      return slot > 0 ? contents[slot - 1] : undefined;
    }
    try {
      for (const [key, tile] of tiles) {
        const row = tileRow(key);
        const index = (row - top) * width + (key - row * STRIDE - left);
        add(index);
        slots[index] = contents.push(tile);
        addNeighbors(index, tile, width, add);
      }
      for (const index of candidates) {
        const tile = evolveAt(index, width, get);
        if (!tile) continue;
        const row = Math.floor(index / width);
        const column = index - row * width;
        next.set((top + row) * STRIDE + left + column, tile);
      }
      return next;
    } finally {
      for (const index of candidates) slots[index] = 0;
    }
  }

  function nextGeneration(world) {
    const data = worldData.get(world);
    if (!data?.canAdvance) return null;
    const { tiles, bounds } = data;
    const index = tiles.size >= MIN_INDEXED_TILES ? getTileIndex(bounds) : null;
    return createWorld(index ? nextIndexedTiles(tiles, index) : nextSparseTiles(tiles));
  }

  function describeWorld(world) {
    return worldData.get(world);
  }

  function scanExtrema(tiles, changed) {
    const bounds = { minRow: Infinity, maxRow: -Infinity, minColumn: Infinity, maxColumn: -Infinity };
    const keys = {};
    for (const [key, tile] of tiles) {
      const replacement = changed?.get(key);
      const extrema = replacement ? tileExtrema(replacement) : (tile.extrema ??= tileExtrema(tile.rows));
      if (!extrema) continue;
      const blockRow = tileRow(key);
      const row = blockRow * SIZE;
      const column = (key - blockRow * STRIDE) * SIZE;
      if (row + extrema.top < bounds.minRow) {
        bounds.minRow = row + extrema.top;
        keys.top = Life.coordinateKey(bounds.minRow, column + extrema.topColumn);
      }
      if (row + extrema.bottom > bounds.maxRow) {
        bounds.maxRow = row + extrema.bottom;
        keys.bottom = Life.coordinateKey(bounds.maxRow, column + extrema.bottomColumn);
      }
      if (column + extrema.left < bounds.minColumn) {
        bounds.minColumn = column + extrema.left;
        keys.left = Life.coordinateKey(row + extrema.leftRow, bounds.minColumn);
      }
      if (column + extrema.right > bounds.maxColumn) {
        bounds.maxColumn = column + extrema.right;
        keys.right = Life.coordinateKey(row + extrema.rightRow, bounds.maxColumn);
      }
    }
    return { bounds: bounds.minRow === Infinity ? null : bounds, keys: new Set(Object.values(keys)) };
  }

  function locateCell(key) {
    const comma = key.indexOf(",");
    const row = Number(key.slice(0, comma));
    const column = Number(key.slice(comma + 1));
    const blockRow = Math.floor(row / SIZE);
    const blockColumn = Math.floor(column / SIZE);
    return { key: blockRow * STRIDE + blockColumn, row: row - blockRow * SIZE, bit: 1 << (column - blockColumn * SIZE) };
  }

  function clearCells(tiles, keys) {
    const changed = new Map();
    for (const key of keys) {
      const cell = locateCell(key);
      let rows = changed.get(cell.key);
      if (!rows) {
        rows = tiles.get(cell.key).rows.slice();
        changed.set(cell.key, rows);
      }
      rows[cell.row] &= ~cell.bit;
    }
    return changed;
  }

  function pruneOutlyingGliders(world) {
    const data = worldData.get(world);
    if (!data) return null;
    if (data.population <= 5) return world;
    const { tiles } = data;
    const removed = Life.findOutlyingGliderKeys(
      (key) => {
        const cell = locateCell(key);
        return Boolean(tiles.get(cell.key)?.rows[cell.row] & cell.bit);
      },
      scanExtrema(tiles).keys,
      (glider) => scanExtrema(tiles, clearCells(tiles, glider.keys())).bounds,
    );
    if (!removed.length) return world;
    const next = new Map(tiles);
    for (const [key, rows] of clearCells(tiles, removed)) {
      const tile = internTile(rows);
      if (tile) next.set(key, tile);
      else next.delete(key);
    }
    return createWorld(next);
  }

  function sameWorld(left, right) {
    const a = worldData.get(left);
    const b = worldData.get(right);
    if (!a || !b) return undefined;
    if (a.signature !== b.signature) return false;
    for (const [key, tile] of a.tiles) {
      const other = b.tiles.get(key);
      if (!other || (other !== tile && tile.rows.some((row, index) => row !== other.rows[index]))) return false;
    }
    return true;
  }

  function editableWorld(world) {
    return worldData.has(world) ? { cells: new Set(world.cells) } : world;
  }

  return Object.freeze({ prepare, nextGeneration, describeWorld, sameWorld, editableWorld, pruneOutlyingGliders });
});
