(function exposeGollyImport(root, factory) {
  if (typeof module === "object" && module.exports) {
    module.exports = factory(require("./life-engine.js"));
  } else {
    root.GollyImport = factory(root.LifeEngine);
  }
})(globalThis, function createGollyImport(Life) {
  "use strict";

  const MAX_BYTES = 4_000_000;
  // The board still stores each live coordinate as a separate Set entry.
  const MAX_BOARD_CELLS = 2_000_000;
  const PLACEMENT_CHUNK = 4096;

  function checkBoardCapacity(count) {
    if (count > MAX_BOARD_CELLS) throw new Error("图案已读取，但网页棋盘最多可展开 200 万个活细胞");
  }

  function emptyBounds() {
    return { minRow: Infinity, minColumn: Infinity, maxRow: -Infinity, maxColumn: -Infinity };
  }

  function includeBounds(bounds, minRow, minColumn, maxRow, maxColumn) {
    bounds.minRow = Math.min(bounds.minRow, minRow);
    bounds.minColumn = Math.min(bounds.minColumn, minColumn);
    bounds.maxRow = Math.max(bounds.maxRow, maxRow);
    bounds.maxColumn = Math.max(bounds.maxColumn, maxColumn);
  }

  function readRule(rule) {
    if (!rule) return null;
    const legacy = /^([0-8]*)\/([0-8]*)$/.exec(rule);
    try {
      return Life.parseRule(legacy ? "B" + legacy[2] + "/S" + legacy[1] : rule).canonical;
    } catch {
      throw new Error("不支持图案规则「" + rule.slice(0, 64) + "」，请选择棋盘支持的两状态 B/S 规则图案");
    }
  }

  function parseRle(header, lines, commentRule) {
    const fields = /^x\s*=\s*\d+\s*,\s*y\s*=\s*\d+(?:\s*,\s*rule\s*=\s*(.+))?$/i.exec(header);
    if (!fields) throw new Error("RLE 文件头无效");
    const rule = readRule(fields[1] || commentRule);
    const body = lines.join("\n");
    const token = /\s+|!|([1-9]\d*)?([bo.A$])/gy;
    const runs = [];
    const bounds = emptyBounds();
    let population = 0n;
    let row = 0;
    let column = 0;
    while (token.lastIndex < body.length) {
      const run = token.exec(body);
      if (!run) throw new Error("RLE 数据无效或含有不支持的细胞状态");
      if (run[0] === "!") {
        if (body.slice(token.lastIndex).trim()) throw new Error("RLE 结束标记后有无法识别的数据");
        break;
      }
      const [, countText, symbol] = run;
      if (!symbol) continue;
      const count = countText ? Number(countText) : 1;
      if (symbol === "$") {
        row += count;
        column = 0;
      } else {
        const nextColumn = column + count;
        if (nextColumn > Life.MAX_COORDINATE) throw new Error("RLE 图案坐标超出范围");
        if (symbol === "o" || symbol === "A") {
          runs.push([row, column, nextColumn - 1]);
          includeBounds(bounds, row, column, row, nextColumn - 1);
          population += BigInt(count);
        }
        column = nextColumn;
      }
      if (row > Life.MAX_COORDINATE) throw new Error("RLE 图案坐标超出范围");
    }
    function* read(view) {
      let first = 0;
      let end = runs.length;
      while (first < end) {
        const middle = Math.floor((first + end) / 2);
        if (runs[middle][0] < view.minRow) first = middle + 1;
        else end = middle;
      }
      for (let index = first; index < runs.length; index += 1) {
        const [row, left, right] = runs[index];
        if (row > view.maxRow) break;
        const last = Math.min(right, view.maxColumn);
        for (let column = Math.max(left, view.minColumn); column <= last; column += 1) yield [row, column];
      }
    }
    return { population, rule, bounds, read };
  }

  function macrocellLeaf(line) {
    const cells = [];
    const bounds = emptyBounds();
    let row = 0;
    let column = 0;
    for (const symbol of line) {
      if (symbol === "$" && row < 8) {
        row += 1;
        column = 0;
      } else if ((symbol === "." || symbol === "*") && row < 8 && column < 8) {
        if (symbol === "*") {
          cells.push([row, column]);
          includeBounds(bounds, row, column, row, column);
        }
        column += 1;
      } else {
        throw new Error("Macrocell 的 8×8 节点无效");
      }
    }
    return { level: 3, population: BigInt(cells.length), cells, bounds };
  }

  function parseMacrocell(lines, ruleText) {
    const rule = readRule(ruleText);
    const nodes = [null];
    for (const line of lines) {
      if (/^[.*$]/.test(line)) {
        nodes.push(macrocellLeaf(line));
        continue;
      }
      if (!/^\d+(?:\s+\d+){4}$/.test(line)) throw new Error("Macrocell 节点无效");
      const [level, ...children] = line.split(/\s+/).map(Number);
      if (level < 4 || level > 52 || children.some((id) => id >= nodes.length || (id && nodes[id].level !== level - 1))) {
        throw new Error("Macrocell 节点层级或引用无效，图案须为两状态");
      }
      const bounds = emptyBounds();
      const half = 2 ** (level - 1);
      let population = 0n;
      for (const [index, id] of children.entries()) {
        const child = nodes[id];
        if (!child?.population) continue;
        population += child.population;
        const row = (index >> 1) * half;
        const column = (index & 1) * half;
        includeBounds(bounds, row + child.bounds.minRow, column + child.bounds.minColumn,
          row + child.bounds.maxRow, column + child.bounds.maxColumn);
      }
      nodes.push({ level, population, bounds, children, half });
    }

    const root = nodes.at(-1);
    function* collect(node, row, column, view) {
      if (!node?.population
        || row + node.bounds.maxRow < view.minRow || row + node.bounds.minRow > view.maxRow
        || column + node.bounds.maxColumn < view.minColumn || column + node.bounds.minColumn > view.maxColumn) return;
      if (node.cells) {
        for (const [y, x] of node.cells) {
          const absoluteRow = row + y;
          const absoluteColumn = column + x;
          if (absoluteRow >= view.minRow && absoluteRow <= view.maxRow
            && absoluteColumn >= view.minColumn && absoluteColumn <= view.maxColumn) yield [absoluteRow, absoluteColumn];
        }
        return;
      }
      for (const [index, id] of node.children.entries()) {
        yield* collect(nodes[id], row + (index >> 1) * node.half, column + (index & 1) * node.half, view);
      }
    }
    return {
      population: root?.population ?? 0n,
      rule,
      bounds: root?.bounds,
      read: (view) => collect(root, 0, 0, view),
    };
  }

  function createPattern(name, source, swapped = false, reverseRow = false, reverseColumn = false) {
    const { minRow: top, minColumn: left, maxRow, maxColumn } = source.bounds;
    const width = swapped ? maxRow - top + 1 : maxColumn - left + 1;
    const height = swapped ? maxColumn - left + 1 : maxRow - top + 1;

    function* cellsIn(view = { minRow: 0, maxRow: height - 1, minColumn: 0, maxColumn: width - 1 }) {
      const viewTop = Math.max(0, view.minRow);
      const viewBottom = Math.min(height - 1, view.maxRow);
      const viewLeft = Math.max(0, view.minColumn);
      const viewRight = Math.min(width - 1, view.maxColumn);
      if (viewTop > viewBottom || viewLeft > viewRight) return;
      const rowStart = reverseRow ? height - 1 - viewBottom : viewTop;
      const rowEnd = reverseRow ? height - 1 - viewTop : viewBottom;
      const columnStart = reverseColumn ? width - 1 - viewRight : viewLeft;
      const columnEnd = reverseColumn ? width - 1 - viewLeft : viewRight;
      for (const [row, column] of source.read({
        minRow: top + (swapped ? columnStart : rowStart),
        maxRow: top + (swapped ? columnEnd : rowEnd),
        minColumn: left + (swapped ? rowStart : columnStart),
        maxColumn: left + (swapped ? rowEnd : columnEnd),
      })) {
        const y = swapped ? column - left : row - top;
        const x = swapped ? row - top : column - left;
        yield [reverseRow ? height - 1 - y : y, reverseColumn ? width - 1 - x : x];
      }
    }

    return Object.defineProperties({
      name,
      rule: source.rule,
      get cells() {
        checkBoardCapacity(source.population);
        return [...cellsIn()];
      },
      width,
      height,
    }, {
      cellCount: { value: source.population },
      cellsIn: { value: cellsIn },
      rotate: { value: () => createPattern(name, source, !swapped, reverseColumn, !reverseRow) },
      flip: { value: () => createPattern(name, source, swapped, reverseRow, !reverseColumn) },
    });
  }

  function parsePattern(text, fallbackName = "Golly 图案") {
    const lines = [];
    let name;
    let commentRule;
    for (const rawLine of text.split(/\r\n?|\n/)) {
      const line = rawLine.trim();
      if (/^#N\s+/i.test(line)) name ||= line.slice(2).trim();
      if (/^#R\s+/i.test(line)) commentRule ||= line.slice(2).trim();
      if (line && !line.startsWith("#")) lines.push(line);
    }
    const [header, ...data] = lines;
    let parsed;
    if (/^\[M2\](?:\s|$)/.test(header)) parsed = parseMacrocell(data, commentRule);
    else if (/^x\s*=/i.test(header)) parsed = parseRle(header, data, commentRule);
    else throw new Error("请选择 Golly 的 RLE 或 Macrocell 图案文件");

    if (!parsed.population) throw new Error("图案没有活细胞");
    return createPattern((name || fallbackName).slice(0, 80), parsed);
  }

  async function placePattern(world, pattern, offsetRow, offsetColumn, isCurrent = () => true) {
    checkBoardCapacity(pattern.cellCount);
    const placed = Life.cloneWorld(world);
    let processed = 0;
    for (const [row, column] of pattern.cellsIn()) {
      Life.setCell(placed, offsetRow + row, offsetColumn + column, true);
      if (++processed % PLACEMENT_CHUNK !== 0) continue;
      checkBoardCapacity(placed.cells.size);
      await new Promise((resolve) => globalThis.setTimeout(resolve, 0));
      if (!isCurrent()) return null;
    }
    checkBoardCapacity(placed.cells.size);
    return isCurrent() ? placed : null;
  }

  async function readGzip(file) {
    if (!globalThis.DecompressionStream) throw new Error("此浏览器无法解压 gzip，请解压后再导入");
    const reader = file.stream().pipeThrough(new globalThis.DecompressionStream("gzip")).getReader();
    const decoder = new globalThis.TextDecoder();
    let bytes = 0;
    let text = "";
    try {
      for (;;) {
        const { value, done } = await reader.read();
        if (done) return text + decoder.decode();
        bytes += value.byteLength;
        if (bytes > MAX_BYTES) {
          await reader.cancel();
          throw new Error("解压后的图案不能超过 4 MB");
        }
        text += decoder.decode(value, { stream: true });
      }
    } finally {
      reader.releaseLock();
    }
  }

  async function readFile(file) {
    if (file.size > MAX_BYTES) throw new Error("图案文件不能超过 4 MB");
    const [first, second] = new Uint8Array(await file.slice(0, 2).arrayBuffer());
    const text = first === 0x1f && second === 0x8b ? await readGzip(file) : await file.text();
    const name = file.name.replace(/(?:\.(?:rle|mc))?(?:\.gz)?$/i, "");
    return parsePattern(text, name || "Golly 图案");
  }

  return { parsePattern, readFile, placePattern };
});
