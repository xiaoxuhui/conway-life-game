(function exposeGollyImport(root, factory) {
  if (typeof module === "object" && module.exports) {
    module.exports = factory(require("./life-engine.js"), require("./pattern-library.js"));
  } else {
    root.GollyImport = factory(root.LifeEngine, root.PatternLibrary);
  }
})(globalThis, function createGollyImport(Life, PatternLibrary) {
  "use strict";

  const MAX_BYTES = 4_000_000;
  const MAX_CELLS = PatternLibrary.MAX_PATTERN_CELLS;

  function checkPopulation(count) {
    if (count > MAX_CELLS) throw new Error("图案最多支持 5 万个活细胞");
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
    const cells = [];
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
          checkPopulation(cells.length + count);
          for (; column < nextColumn; column += 1) cells.push([row, column]);
        }
        column = nextColumn;
      }
      if (row > Life.MAX_COORDINATE) throw new Error("RLE 图案坐标超出范围");
    }
    return { cells, rule };
  }

  function macrocellLeaf(line) {
    const cells = [];
    let row = 0;
    let column = 0;
    for (const symbol of line) {
      if (symbol === "$" && row < 8) {
        row += 1;
        column = 0;
      } else if ((symbol === "." || symbol === "*") && row < 8 && column < 8) {
        if (symbol === "*") cells.push([row, column]);
        column += 1;
      } else {
        throw new Error("Macrocell 的 8×8 节点无效");
      }
    }
    return { level: 3, count: cells.length, cells };
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
      const count = children.reduce((total, id) => total + (nodes[id]?.count ?? 0), 0);
      nodes.push({ level, count: Math.min(count, MAX_CELLS + 1), children });
    }

    const root = nodes.at(-1);
    checkPopulation(root?.count ?? 0);
    const cells = [];
    function collect(node, row, column) {
      if (!node?.count) return;
      if (node.cells) {
        for (const [y, x] of node.cells) cells.push([row + y, column + x]);
        return;
      }
      const half = 2 ** (node.level - 1);
      collect(nodes[node.children[0]], row, column);
      collect(nodes[node.children[1]], row, column + half);
      collect(nodes[node.children[2]], row + half, column);
      collect(nodes[node.children[3]], row + half, column + half);
    }
    collect(root, 0, 0);
    return { cells, rule };
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

    const { cells, rule } = parsed;
    if (!cells.length) throw new Error("图案没有活细胞");
    let minRow = Infinity;
    let minColumn = Infinity;
    let maxRow = 0;
    let maxColumn = 0;
    for (const [row, column] of cells) {
      minRow = Math.min(minRow, row);
      minColumn = Math.min(minColumn, column);
      maxRow = Math.max(maxRow, row);
      maxColumn = Math.max(maxColumn, column);
    }
    return {
      name: (name || fallbackName).slice(0, 80),
      rule,
      cells: cells.map(([row, column]) => [row - minRow, column - minColumn]),
      width: maxColumn - minColumn + 1,
      height: maxRow - minRow + 1,
    };
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

  return { parsePattern, readFile };
});
