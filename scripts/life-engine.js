(function exposeLifeEngine(root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) {
    module.exports = api;
  }
  root.LifeEngine = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function createLifeEngine() {
  "use strict";

  const FORMAT = "conway-life-game";
  const FORMAT_VERSION = 1;
  const MAX_DIMENSION = 250;

  function assertInteger(value, name, minimum = 1, maximum = MAX_DIMENSION) {
    if (!Number.isInteger(value) || value < minimum || value > maximum) {
      throw new RangeError(`${name} 必须是 ${minimum}–${maximum} 之间的整数`);
    }
  }

  function assertBoard(board) {
    if (!board || typeof board !== "object") {
      throw new TypeError("棋盘数据无效");
    }
    assertInteger(board.rows, "行数");
    assertInteger(board.columns, "列数");
    if (!(board.cells instanceof Uint8Array)) {
      throw new TypeError("棋盘细胞必须使用 Uint8Array");
    }
    if (board.cells.length !== board.rows * board.columns) {
      throw new RangeError("棋盘尺寸与细胞数量不一致");
    }
  }

  function indexOf(board, row, column) {
    return row * board.columns + column;
  }

  function isInside(board, row, column) {
    return row >= 0 && row < board.rows && column >= 0 && column < board.columns;
  }

  function createBoard(rows = 40, columns = 60, alive = []) {
    assertInteger(rows, "行数");
    assertInteger(columns, "列数");
    const board = { rows, columns, cells: new Uint8Array(rows * columns) };

    for (const coordinate of alive) {
      if (!Array.isArray(coordinate) || coordinate.length !== 2) {
        throw new TypeError("活细胞坐标必须是 [行, 列]");
      }
      const [row, column] = coordinate;
      assertInteger(row, "行坐标", 0, rows - 1);
      assertInteger(column, "列坐标", 0, columns - 1);
      board.cells[indexOf(board, row, column)] = 1;
    }

    return board;
  }

  function cloneBoard(board) {
    assertBoard(board);
    return {
      rows: board.rows,
      columns: board.columns,
      cells: new Uint8Array(board.cells),
    };
  }

  function isAlive(board, row, column) {
    assertBoard(board);
    if (!isInside(board, row, column)) return false;
    return board.cells[indexOf(board, row, column)] === 1;
  }

  function setCell(board, row, column, alive) {
    assertBoard(board);
    if (!isInside(board, row, column)) return false;
    board.cells[indexOf(board, row, column)] = alive ? 1 : 0;
    return true;
  }

  function countAlive(board) {
    assertBoard(board);
    let total = 0;
    for (const cell of board.cells) total += cell;
    return total;
  }

  function countNeighbors(board, row, column) {
    let total = 0;
    for (let rowOffset = -1; rowOffset <= 1; rowOffset += 1) {
      for (let columnOffset = -1; columnOffset <= 1; columnOffset += 1) {
        if (rowOffset === 0 && columnOffset === 0) continue;
        const neighborRow = row + rowOffset;
        const neighborColumn = column + columnOffset;
        if (isInside(board, neighborRow, neighborColumn)) {
          total += board.cells[indexOf(board, neighborRow, neighborColumn)];
        }
      }
    }
    return total;
  }

  function nextGeneration(board) {
    assertBoard(board);
    const next = createBoard(board.rows, board.columns);

    for (let row = 0; row < board.rows; row += 1) {
      for (let column = 0; column < board.columns; column += 1) {
        const neighbors = countNeighbors(board, row, column);
        const alive = board.cells[indexOf(board, row, column)] === 1;
        const survives = alive && (neighbors === 2 || neighbors === 3);
        const born = !alive && neighbors === 3;
        if (survives || born) {
          next.cells[indexOf(next, row, column)] = 1;
        }
      }
    }

    return next;
  }

  function randomBoard(rows = 40, columns = 60, density = 0.25, random = Math.random) {
    if (typeof density !== "number" || density < 0 || density > 1) {
      throw new RangeError("随机密度必须在 0–1 之间");
    }
    if (typeof random !== "function") {
      throw new TypeError("随机数来源必须是函数");
    }
    const board = createBoard(rows, columns);
    for (let index = 0; index < board.cells.length; index += 1) {
      board.cells[index] = random() < density ? 1 : 0;
    }
    return board;
  }

  function placePattern(board, patternCells, offsetRow, offsetColumn, replace = true) {
    assertBoard(board);
    assertInteger(offsetRow, "起始行", 0, board.rows - 1);
    assertInteger(offsetColumn, "起始列", 0, board.columns - 1);
    if (!Array.isArray(patternCells)) throw new TypeError("图案坐标无效");

    const placed = replace ? createBoard(board.rows, board.columns) : cloneBoard(board);
    for (const coordinate of patternCells) {
      if (!Array.isArray(coordinate) || coordinate.length !== 2) {
        throw new TypeError("图案坐标必须是 [行, 列]");
      }
      const row = offsetRow + coordinate[0];
      const column = offsetColumn + coordinate[1];
      if (!isInside(placed, row, column)) {
        throw new RangeError("图案无法完整放入棋盘");
      }
      placed.cells[indexOf(placed, row, column)] = 1;
    }
    return placed;
  }

  function aliveCoordinates(board) {
    assertBoard(board);
    const alive = [];
    for (let row = 0; row < board.rows; row += 1) {
      for (let column = 0; column < board.columns; column += 1) {
        if (board.cells[indexOf(board, row, column)] === 1) {
          alive.push([row, column]);
        }
      }
    }
    return alive;
  }

  function serialize(board, generation = 0) {
    assertBoard(board);
    assertInteger(generation, "代数", 0, Number.MAX_SAFE_INTEGER);
    return {
      format: FORMAT,
      version: FORMAT_VERSION,
      rows: board.rows,
      columns: board.columns,
      generation,
      alive: aliveCoordinates(board),
    };
  }

  function deserialize(input) {
    let data;
    try {
      data = typeof input === "string" ? JSON.parse(input) : input;
    } catch {
      throw new SyntaxError("文件不是有效的 JSON");
    }

    if (!data || typeof data !== "object" || Array.isArray(data)) {
      throw new TypeError("文件内容必须是一个对象");
    }
    if (data.format !== FORMAT) throw new TypeError("文件格式不受支持");
    if (data.version !== FORMAT_VERSION) throw new RangeError("文件版本不受支持");
    assertInteger(data.rows, "行数");
    assertInteger(data.columns, "列数");
    assertInteger(data.generation, "代数", 0, Number.MAX_SAFE_INTEGER);
    if (!Array.isArray(data.alive)) throw new TypeError("活细胞坐标列表无效");

    return {
      board: createBoard(data.rows, data.columns, data.alive),
      generation: data.generation,
    };
  }

  return Object.freeze({
    FORMAT,
    FORMAT_VERSION,
    MAX_DIMENSION,
    aliveCoordinates,
    cloneBoard,
    countAlive,
    createBoard,
    deserialize,
    isAlive,
    nextGeneration,
    placePattern,
    randomBoard,
    serialize,
    setCell,
  });
});
