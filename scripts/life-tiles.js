(function exposeLifeTiles(root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  root.LifeTiles = api;
})(globalThis, function createLifeTiles() {
  "use strict";

  const SIZE = 16;
  const ROW_MASK = (1 << SIZE) - 1;
  const RIGHT_EDGE = 1 << (SIZE - 1);
  const STRIDE = 2 ** 22;
  const TILE_LIMIT = 2 ** 20 - 2;
  const MIN_POPULATION = 32;
  const MAX_TILE_STATES = 4096;
  const MAX_TRANSITIONS = 32_768;
  const worldData = new WeakMap();
  const tileStates = new Map();
  const halo = new Uint32Array(SIZE + 2);
  const empty = {
    rows: new Uint16Array(SIZE), top: 0, bottom: 0, left: 0, right: 0, memo: new Map(),
  };
  let transitionCount = 0;

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
    const tile = { rows, top: rows[0], bottom: rows[SIZE - 1], left, right, hash, population, memo };
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

  function createWorld(tiles) {
    let population = 0;
    let sum = 0;
    let xor = 0;
    let canAdvance = true;
    for (const [key, tile] of tiles) {
      const row = tileRow(key);
      const column = key - row * STRIDE;
      if (Math.abs(row) >= TILE_LIMIT || Math.abs(column) >= TILE_LIMIT) canAdvance = false;
      population += tile.population;
      const positionedHash = Math.imul(tile.hash ^ row, 16777619) ^ Math.imul(column, 0x9e3779b1);
      sum = (sum + positionedHash) | 0;
      xor ^= positionedHash;
    }
    let cells;
    const world = { get cells() { return cells ??= materialize(tiles); } };
    worldData.set(world, { tiles, population, canAdvance, signature: "tiles:" + tiles.size + ":" + population + ":" + sum + ":" + xor });
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

  function nextGeneration(world) {
    const data = worldData.get(world);
    if (!data?.canAdvance) return null;
    const { tiles } = data;
    const candidates = new Set();
    const next = new Map();
    for (const [key, tile] of tiles) {
      candidates.add(key);
      if (tile.top) candidates.add(key - STRIDE);
      if (tile.bottom) candidates.add(key + STRIDE);
      if (tile.left) candidates.add(key - 1);
      if (tile.right) candidates.add(key + 1);
      if (tile.top & 1) candidates.add(key - STRIDE - 1);
      if (tile.top & RIGHT_EDGE) candidates.add(key - STRIDE + 1);
      if (tile.bottom & 1) candidates.add(key + STRIDE - 1);
      if (tile.bottom & RIGHT_EDGE) candidates.add(key + STRIDE + 1);
    }
    for (const key of candidates) {
      const top = tiles.get(key - STRIDE)?.bottom ?? 0;
      const bottom = tiles.get(key + STRIDE)?.top ?? 0;
      const left = tiles.get(key - 1)?.right ?? 0;
      const right = tiles.get(key + 1)?.left ?? 0;
      const corners = ((tiles.get(key - STRIDE - 1)?.bottom ?? 0) >>> (SIZE - 1))
        | (((tiles.get(key - STRIDE + 1)?.bottom ?? 0) & 1) << 1)
        | (((tiles.get(key + STRIDE - 1)?.top ?? 0) >>> (SIZE - 1)) << 2)
        | (((tiles.get(key + STRIDE + 1)?.top ?? 0) & 1) << 3);
      const tile = nextTile(tiles.get(key) ?? empty, top, bottom, left, right, corners);
      if (tile) next.set(key, tile);
    }
    return createWorld(next);
  }

  function describeWorld(world) {
    return worldData.get(world);
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

  return Object.freeze({ prepare, nextGeneration, describeWorld, sameWorld, editableWorld });
});
