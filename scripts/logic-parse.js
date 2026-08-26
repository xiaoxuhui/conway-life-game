(function exposeLogicParse(root, factory) {
  const api = factory(...(typeof module === "object" && module.exports ? [] : []));
  if (typeof module === "object" && module.exports) module.exports = api;
  root.LogicParse = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function createLogicParse() {
  "use strict";

  class LogicCodeError extends Error {
    constructor(message) {
      super(message);
      this.name = "LogicCodeError";
    }
  }

  const MAX_SOURCE_LENGTH = 200;
  const MAX_EXPANDED_LENGTH = 5000;
  const SAFETY_SLICE_BUDGET_MS = 40;

  function gateName(token) {
    const normalized = token.toUpperCase();
    if (["AND", "与", "和", "&&"].includes(normalized)) return "AND";
    if (["OR", "或", "||"].includes(normalized)) return "OR";
    if (["NOT", "非", "!"].includes(normalized)) return "NOT";
    return null;
  }

  function resultFor(gate, inputs) {
    if (gate === "NOT") return Number(!inputs[0]);
    if (gate === "AND") return Number(Boolean(inputs[0] && inputs[1]));
    return Number(Boolean(inputs[0] || inputs[1]));
  }

  function buildResult(gate, inputs) {
    const expected = resultFor(gate, inputs);
    const bits = inputs.join("");
    return Object.freeze({
      gate,
      inputs: Object.freeze([...inputs]),
      expected,
      presetId: `logic-${gate.toLowerCase()}-${bits}`,
      expression: gate === "NOT" ? `NOT ${bits}` : `${inputs[0]} ${gate} ${inputs[1]}`,
    });
  }

  function buildStep(gate, inputs, expression) {
    return Object.freeze({ ...buildResult(gate, inputs), expression });
  }

  function splitProgram(source) {
    const segments = [];
    let depth = 0;
    let start = 0;
    for (let index = 0; index < source.length; index += 1) {
      const character = source[index];
      if (character === "(") depth += 1;
      if (character === ")") depth -= 1;
      if ((character === "," || character === "，") && depth === 0) {
        segments.push(source.slice(start, index).trim());
        start = index + 1;
      }
    }
    segments.push(source.slice(start).trim());
    const expression = segments.shift();
    const assignments = new Map();
    for (const segment of segments) {
      const match = segment.match(/^([A-Za-z][A-Za-z0-9_]*)\s*=\s*([01])$/);
      if (!match) {
        if (!segment.includes("=")) {
          throw new LogicCodeError(`赋值段“${segment}”缺少赋值符号“=”；每段应为「变量=值」形式`);
        }
        const equalsIndex = segment.indexOf("=");
        const name = segment.slice(0, equalsIndex).trim();
        const value = segment.slice(equalsIndex + 1).trim();
        if (!/^[A-Za-z][A-Za-z0-9_]*$/.test(name)) {
          throw new LogicCodeError(`变量名“${name}”无效；必须以字母开头，仅含字母、数字与下划线`);
        }
        throw new LogicCodeError(`变量 ${name} 的赋值值“${value}”无效；逻辑变量只能为 0 或 1`);
      }
      const name = match[1].toUpperCase();
      if (assignments.has(name)) throw new LogicCodeError(`变量 ${name} 重复赋值`);
      assignments.set(name, Number(match[2]));
    }
    return { expression, assignments };
  }

  function parseFunctionExpression(source, assignments = new Map()) {
    let index = 0;
    const referencedVariables = new Set();

    function skipWhitespace() {
      while (/\s/.test(source[index] || "")) index += 1;
    }

    function expect(character) {
      skipWhitespace();
      if (source[index] !== character) throw new LogicCodeError("无法识别嵌套表达式，请检查括号和逗号");
      index += 1;
    }

    function expectComma() {
      skipWhitespace();
      if (source[index] !== "," && source[index] !== "，") {
        throw new LogicCodeError("无法识别嵌套表达式，请检查括号和逗号");
      }
      index += 1;
    }

    function childText(node) {
      return node.gate && node.gate !== "NOT" ? `(${node.expression})` : node.expression;
    }

    function logicDepth(node) {
      if (!node.gate) return 0;
      return 1 + Math.max(...node.children.map(logicDepth));
    }

    function leaf(value, expression, variable) {
      return Object.freeze({
        value, expression, ...(variable ? { variable } : {}), gate: null,
        children: Object.freeze([]), steps: Object.freeze([]),
      });
    }

    function gateNode(gate, left, right = null) {
      const children = gate === "NOT" ? [left] : [left, right];
      if (1 + Math.max(...children.map(logicDepth)) > 8) {
        throw new LogicCodeError("嵌套太深，最多支持 8 层逻辑门");
      }
      const inputs = children.map((child) => child.value);
      const expression = gate === "NOT"
        ? (left.gate ? `NOT(${left.expression})` : `NOT ${left.expression}`)
        : `${childText(left)} ${gate} ${childText(right)}`;
      const steps = children.flatMap((child) => child.steps);
      const step = buildStep(gate, inputs, expression);
      steps.push(step);
      return Object.freeze({
        value: step.expected,
        expression,
        gate,
        children: Object.freeze(children),
        steps: Object.freeze(steps),
        step,
      });
    }

    function wordAtCursor(word) {
      const candidate = source.slice(index, index + word.length);
      if (candidate.toUpperCase() !== word) return false;
      return !/[A-Za-z0-9_]/.test(source[index + word.length] || "");
    }

    function consumeOperator(words, symbols = []) {
      skipWhitespace();
      for (const symbol of symbols) {
        if (source.startsWith(symbol, index)) {
          index += symbol.length;
          return true;
        }
      }
      for (const word of words) {
        if (word.length === 1 && /[^A-Za-z]/.test(word)) {
          if (source[index] === word) {
            index += 1;
            return true;
          }
        } else if (wordAtCursor(word)) {
          index += word.length;
          return true;
        }
      }
      return false;
    }

    function parseGateCall(gate) {
      expect("(");
      const left = parseOr();
      if (gate === "NOT") {
        expect(")");
        return gateNode(gate, left);
      }
      expectComma();
      const right = parseOr();
      expect(")");
      return gateNode(gate, left, right);
    }

    function parsePrimary() {
      skipWhitespace();
      if (source[index] === "(") {
        index += 1;
        const grouped = parseOr();
        expect(")");
        return grouped;
      }

      const bit = source[index];
      if (bit === "0" || bit === "1") {
        index += 1;
        return leaf(Number(bit), bit);
      }

      if (["与", "和", "或"].includes(source[index])) {
        const token = source[index];
        index += 1;
        skipWhitespace();
        if (source[index] === "(") return parseGateCall(gateName(token));
        throw new LogicCodeError("无法识别嵌套表达式中的变量或运算符");
      }

      const start = index;
      if (/[A-Za-z]/.test(source[index] || "")) {
        index += 1;
        while (/[A-Za-z0-9_]/.test(source[index] || "")) index += 1;
      }
      const token = source.slice(start, index);
      if (!token) throw new LogicCodeError("无法识别嵌套表达式中的变量或运算符");
      skipWhitespace();
      if (source[index] === "(") {
        const gate = gateName(token);
        if (!gate) throw new LogicCodeError(`没有找到函数 ${token.toUpperCase()}；请检查“我的函数”中的调用名`);
        return parseGateCall(gate);
      }

      const variable = token.toUpperCase();
      if (!assignments.has(variable)) throw new LogicCodeError(`无法识别：变量 ${variable} 尚未赋值`);
      referencedVariables.add(variable);
      return leaf(assignments.get(variable), variable, variable);
    }

    function parseNot() {
      if (consumeOperator(["NOT", "非"], ["!"])) return gateNode("NOT", parseNot());
      return parsePrimary();
    }

    function parseAnd() {
      let node = parseNot();
      while (consumeOperator(["AND", "与", "和"], ["&&"])) {
        node = gateNode("AND", node, parseNot());
      }
      return node;
    }

    function parseOr() {
      let node = parseAnd();
      while (consumeOperator(["OR", "或"], ["||"])) {
        node = gateNode("OR", node, parseAnd());
      }
      return node;
    }

    const root = parseOr();
    skipWhitespace();
    if (index !== source.length || !root.gate) throw new LogicCodeError("无法识别嵌套表达式，请检查多余内容");
    for (const variable of assignments.keys()) {
      if (!referencedVariables.has(variable)) throw new LogicCodeError(`变量 ${variable} 已赋值但未使用`);
    }
    const variables = Object.freeze(Object.fromEntries(assignments));
    if (root.steps.length === 1 && assignments.size === 0) return root.step;
    return Object.freeze({
      ...root.step,
      steps: Object.freeze([...root.steps]),
      tree: root,
      ...(assignments.size > 0 ? { variables } : {}),
    });
  }

  function parseWithLimit(value, maxLength, tooLongMessage) {
    const source = typeof value === "string" ? value.trim() : "";
    if (!source) throw new LogicCodeError("请输入逻辑代码，例如 1 AND 0 或 NOT 1");
    if (source.length > maxLength) throw new LogicCodeError(tooLongMessage);
    const program = splitProgram(source);
    return parseFunctionExpression(program.expression, program.assignments);
  }

  function parse(value) {
    return parseWithLimit(value, MAX_SOURCE_LENGTH, "逻辑代码过长，最多支持 200 个字符");
  }

  function parseExpanded(value) {
    return parseWithLimit(value, MAX_EXPANDED_LENGTH, "函数展开后的逻辑代码过长，最多支持 5000 个字符");
  }

  function collectVariableNames(source) {
    const names = [];
    const seen = new Set();
    const matcher = /[A-Za-z][A-Za-z0-9_]*/g;
    let match;
    while ((match = matcher.exec(source))) {
      const token = match[0];
      if (gateName(token)) continue;
      const name = token.toUpperCase();
      if (!seen.has(name)) {
        seen.add(name);
        names.push(name);
      }
    }
    return names;
  }

  return Object.freeze({ LogicCodeError, MAX_SOURCE_LENGTH, MAX_EXPANDED_LENGTH, SAFETY_SLICE_BUDGET_MS, gateName, splitProgram, parseFunctionExpression, parse, parseExpanded, collectVariableNames });
});
