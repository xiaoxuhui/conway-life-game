(function exposeLogicCode(root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  root.LogicCode = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function createLogicCode() {
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

  function expandFunctions(value, definitions = []) {
    const source = typeof value === "string" ? value.trim() : "";
    if (source.length > MAX_SOURCE_LENGTH) {
      throw new LogicCodeError("逻辑代码过长，最多支持 200 个字符");
    }
    const program = splitProgram(source);
    const functions = new Map(definitions.map((item) => [item.callName.toUpperCase(), item]));

    function appendExpanded(current, fragment) {
      const next = current + fragment;
      if (next.length > MAX_EXPANDED_LENGTH) {
        throw new LogicCodeError("函数展开后的逻辑代码过长，最多支持 5000 个字符");
      }
      return next;
    }

    function argumentsOf(text) {
      if (!text.trim()) return [];
      const args = [];
      let depth = 0;
      let start = 0;
      for (let index = 0; index < text.length; index += 1) {
        if (text[index] === "(") depth += 1;
        if (text[index] === ")") depth -= 1;
        if (text[index] === "," && depth === 0) {
          args.push(text.slice(start, index).trim());
          start = index + 1;
        }
      }
      args.push(text.slice(start).trim());
      return args;
    }

    function expandExpression(text, stack = []) {
      let result = "";
      let index = 0;
      while (index < text.length) {
        if (!/[A-Za-z]/.test(text[index])) {
          result = appendExpanded(result, text[index]);
          index += 1;
          continue;
        }
        const start = index;
        while (/[A-Za-z0-9_]/.test(text[index] || "")) index += 1;
        const token = text.slice(start, index);
        let open = index;
        while (/\s/.test(text[open] || "")) open += 1;
        if (text[open] !== "(") {
          result = appendExpanded(result, token);
          continue;
        }
        let depth = 1;
        let close = open + 1;
        while (close < text.length && depth > 0) {
          if (text[close] === "(") depth += 1;
          if (text[close] === ")") depth -= 1;
          close += 1;
        }
        if (depth !== 0) throw new LogicCodeError("函数调用括号不完整");
        const args = argumentsOf(text.slice(open + 1, close - 1))
          .map((argument) => expandExpression(argument, stack));
        const callName = token.toUpperCase();
        const custom = functions.get(callName);
        if (!custom) {
          result = appendExpanded(result, `${token}(${args.join(",")})`);
          index = close;
          continue;
        }
        if (stack.includes(callName)) throw new LogicCodeError(`函数 ${callName} 存在循环引用`);
        if (stack.length >= 8) throw new LogicCodeError("保存函数嵌套太深，最多支持 8 层");
        if (args.length !== custom.inputs.length) {
          throw new LogicCodeError(`函数 ${callName} 需要 ${custom.inputs.length} 个参数`);
        }
        let body = custom.code;
        custom.inputs.forEach((input, parameterIndex) => {
          // 用函数式替换，避免实参文本含 $&/$1/$$ 等被 String.prototype.replace 当作特殊序列改写输出
          body = body.replace(new RegExp(`\\b${input.name}\\b`, "g"), () => args[parameterIndex]);
        });
        result = appendExpanded(result, expandExpression(body, [...stack, callName]));
        index = close;
      }
      return result;
    }

    const expression = expandExpression(program.expression);
    const assignments = [...program.assignments].map(([name, value]) => `${name}=${value}`);
    return assignments.length ? appendExpanded(expression, `,${assignments.join(",")}`) : expression;
  }

  function createFunctionDefinition(value, definitions = []) {
    const source = typeof value === "string" ? value.trim() : "";
    if (!source) throw new LogicCodeError("请输入函数代码");
    if (source.length > MAX_SOURCE_LENGTH) throw new LogicCodeError("逻辑代码过长，最多支持 200 个字符");
    const program = splitProgram(source);
    const expandedProgram = splitProgram(expandFunctions(source, definitions));
    const names = collectVariableNames(expandedProgram.expression);
    if (names.length > 8) throw new LogicCodeError("一个函数最多支持 8 个输入");
    if (names.length === 0) {
      parseExpanded(expandedProgram.expression);
      if (program.assignments.size > 0) throw new LogicCodeError("常量函数不能包含变量赋值");
    } else {
      const complete = new Map(program.assignments);
      for (const name of names) if (!complete.has(name)) complete.set(name, 0);
      parseFunctionExpression(expandedProgram.expression, complete);
    }
    return Object.freeze({
      code: program.expression,
      inputs: Object.freeze(names.map((name) => Object.freeze({
        name,
        defaultValue: program.assignments.has(name) ? program.assignments.get(name) : 0,
      }))),
    });
  }

  function instantiateFunction(definition, values = {}) {
    if (!definition || typeof definition.code !== "string" || !Array.isArray(definition.inputs)) {
      throw new LogicCodeError("函数定义无效");
    }
    const assignments = definition.inputs.map(({ name }) => {
      const value = values[name];
      if (value !== 0 && value !== 1) throw new LogicCodeError(`输入 ${name} 只能是 0 或 1`);
      return `${name}=${value}`;
    });
    const source = assignments.length ? `${definition.code},${assignments.join(",")}` : definition.code;
    parse(source);
    return source;
  }

  function shiftCoordinates(coordinates, rowOffset, columnOffset) {
    return coordinates.map(([row, column]) => [row + rowOffset, column + columnOffset]);
  }

  const OR_TO_NOT_GUARD_EATER = Object.freeze([
    [-7, 51], [-7, 52], [-6, 51], [-5, 52], [-5, 53], [-5, 54], [-4, 54],
  ].map((coordinate) => Object.freeze(coordinate)));

  function mirrorCoordinates(coordinates) {
    return coordinates.map(([row, column]) => [row, -column]);
  }

  function advanceCells(coordinates, generations) {
    let cells = new Set(coordinates.map(([row, column]) => `${row},${column}`));
    for (let generation = 0; generation < generations; generation += 1) {
      cells = nextCellSet(cells);
    }
    return [...cells].map((key) => key.split(",").map(Number));
  }

  function nextCellSet(cells) {
      const neighbors = new Map();
      for (const key of cells) {
        const [row, column] = key.split(",").map(Number);
        if (!neighbors.has(key)) neighbors.set(key, 0);
        for (let rowOffset = -1; rowOffset <= 1; rowOffset += 1) {
          for (let columnOffset = -1; columnOffset <= 1; columnOffset += 1) {
            if (rowOffset === 0 && columnOffset === 0) continue;
            const neighbor = `${row + rowOffset},${column + columnOffset}`;
            neighbors.set(neighbor, (neighbors.get(neighbor) || 0) + 1);
          }
        }
      }
      const next = new Set();
      for (const [key, count] of neighbors) {
        if (count === 3 || (count === 2 && cells.has(key))) next.add(key);
      }
      return next;
  }

  function canonicalShape(coordinates) {
    const minRow = Math.min(...coordinates.map(([row]) => row));
    const minColumn = Math.min(...coordinates.map(([, column]) => column));
    return shiftCoordinates(coordinates, -minRow, -minColumn)
      .sort((left, right) => left[0] - right[0] || left[1] - right[1])
      .map(([row, column]) => `${row},${column}`)
      .join(";");
  }

  function alignCoordinates(source, target) {
    if (canonicalShape(source) !== canonicalShape(target)) {
      throw new LogicCodeError("子门输出与父门输入的滑翔机相位不兼容");
    }
    const sourceMinRow = Math.min(...source.map(([row]) => row));
    const sourceMinColumn = Math.min(...source.map(([, column]) => column));
    const targetMinRow = Math.min(...target.map(([row]) => row));
    const targetMinColumn = Math.min(...target.map(([, column]) => column));
    return [targetMinRow - sourceMinRow, targetMinColumn - sourceMinColumn];
  }

  function orientSouthEast(circuit) {
    if (circuit.signalDelta[1] >= 0) return circuit;
    return {
      ...circuit,
      cells: mirrorCoordinates(circuit.cells),
      inputOrigins: mirrorCoordinates(circuit.inputOrigins),
      signalCells: mirrorCoordinates(circuit.signalCells),
      signalDelta: [circuit.signalDelta[0], -circuit.signalDelta[1]],
      terminalCells: mirrorCoordinates(circuit.terminalCells),
      gunGroups: circuit.gunGroups.map((group) => ({
        zoneCells: mirrorCoordinates(group.zoneCells),
        referenceCells: mirrorCoordinates(group.referenceCells),
      })),
      connections: circuit.connections.map((connection) => ({
        ...connection,
        cells: mirrorCoordinates(connection.cells),
      })),
    };
  }

  function transposeCircuit(circuit) {
    const transpose = (coordinates) => coordinates.map(([row, column]) => [column, row]);
    return {
      ...circuit,
      cells: transpose(circuit.cells),
      inputOrigins: transpose(circuit.inputOrigins),
      signalCells: transpose(circuit.signalCells),
      signalDelta: [circuit.signalDelta[1], circuit.signalDelta[0]],
      terminalCells: transpose(circuit.terminalCells),
      gunGroups: circuit.gunGroups.map((group) => ({
        zoneCells: transpose(group.zoneCells),
        referenceCells: transpose(group.referenceCells),
      })),
      connections: circuit.connections.map((connection) => ({
        ...connection,
        cells: transpose(connection.cells),
      })),
    };
  }

  function phaseShiftCircuit(circuit, generations) {
    return {
      ...circuit,
      cells: advanceCells(circuit.cells, generations),
      gunGroups: circuit.gunGroups.map((group) => ({
        zoneCells: group.zoneCells,
        referenceCells: advanceCells(group.referenceCells, generations),
      })),
      observeGeneration: circuit.observeGeneration - generations,
      connections: circuit.connections.map((connection) => ({
        ...connection,
        alignGeneration: connection.alignGeneration - generations,
      })),
    };
  }

  function shouldTransposeNested(layoutVariant, depth, nestedIndex, nestedCount) {
    if (nestedCount < 2) return false;
    if (layoutVariant === 1) return nestedIndex === 0;
    if (layoutVariant === 2) return nestedIndex === depth % 2;
    if (layoutVariant === 3) return nestedIndex === (depth + 1) % 2;
    return nestedIndex === 1;
  }

  function compileCircuit(
    node, resolveGateKit, routePadding = 240, layoutVariant = 0,
    branchPulseSpacing = 20, depth = 0,
  ) {
    const kit = resolveGateKit(node.gate);
    if (!kit) throw new LogicCodeError(`没有找到可连接门体：${node.gate}`);
    const cells = [...kit.bodyCells.map((coordinate) => [...coordinate])];
    const connections = [];
    const gunGroups = kit.bodyGunGroups.map((cells) => ({
      zoneCells: cells.map((coordinate) => [...coordinate]),
      referenceCells: cells.map((coordinate) => [...coordinate]),
    }));
    const nested = [];
    const nestedCount = node.children.filter((child) => child.gate).length;

    node.children.forEach((child, portIndex) => {
      const origin = kit.inputOrigins[portIndex];
      if (!child.gate) {
        const source = child.value ? kit.inputTrueCells : kit.inputFalseCells;
        cells.push(...shiftCoordinates(source, origin[0], origin[1]));
        gunGroups.push({
          zoneCells: shiftCoordinates(kit.inputGunCells, origin[0], origin[1]),
          referenceCells: shiftCoordinates(source, origin[0], origin[1]),
        });
        return;
      }
      let circuit = orientSouthEast(compileCircuit(
        child, resolveGateKit, routePadding, layoutVariant, branchPulseSpacing, depth + 1,
      ));
      if (shouldTransposeNested(layoutVariant, depth, nested.length, nestedCount)) {
        circuit = phaseShiftCircuit(transposeCircuit(circuit), 2);
      }
      nested.push({
        child,
        portIndex,
        origin,
        circuit,
        pulseIndex: nested.length * branchPulseSpacing,
      });
    });

    if (node.gate === "NOT" && nested.some(({ child }) => child.gate === "OR")) {
      cells.push(...OR_TO_NOT_GUARD_EATER.map((coordinate) => [...coordinate]));
    }

    let pulseIndex = 0;
    if (nested.length > 0) {
      const latestSource = Math.max(...nested.map(({ circuit, pulseIndex: sourcePulse }) => (
        circuit.observeGeneration + sourcePulse * 30
      )));
      pulseIndex = Math.max(0, Math.ceil((latestSource + routePadding - kit.inputSignalGeneration) / 30));
      let alignGeneration;
      let compatible = false;
      for (let phaseAttempt = 0; phaseAttempt < 4; phaseAttempt += 1) {
        alignGeneration = kit.inputSignalGeneration + pulseIndex * 30;
        compatible = nested.every((item) => {
          const sourceGeneration = item.circuit.observeGeneration + item.pulseIndex * 30;
          const sourceCells = advanceCells(
            item.circuit.signalCells,
            alignGeneration - sourceGeneration,
          );
          return canonicalShape(sourceCells) === canonicalShape(kit.inputSignalCells);
        });
        if (compatible) break;
        pulseIndex += 1;
      }
      if (!compatible) throw new LogicCodeError("无法为级联线路找到兼容的滑翔机相位");

      for (const item of nested) {
        const sourceGeneration = item.circuit.observeGeneration + item.pulseIndex * 30;
        const sourceCells = advanceCells(
          item.circuit.signalCells,
          alignGeneration - sourceGeneration,
        );
        const targetCells = shiftCoordinates(
          kit.inputSignalCells,
          item.origin[0],
          item.origin[1],
        );
        const [rowOffset, columnOffset] = alignCoordinates(sourceCells, targetCells);
        cells.push(...shiftCoordinates(item.circuit.cells, rowOffset, columnOffset));
        gunGroups.push(...item.circuit.gunGroups.map((group) => ({
          zoneCells: shiftCoordinates(group.zoneCells, rowOffset, columnOffset),
          referenceCells: shiftCoordinates(group.referenceCells, rowOffset, columnOffset),
        })));
        connections.push(...item.circuit.connections.map((connection) => ({
          ...connection,
          cells: shiftCoordinates(connection.cells, rowOffset, columnOffset),
        })));
        connections.push({
          from: item.child.gate,
          to: node.gate,
          portIndex: item.portIndex,
          expected: item.child.value,
          alignGeneration,
          cells: targetCells,
        });
      }
    }

    const unique = new Map();
    for (const [row, column] of cells) unique.set(`${row},${column}`, [row, column]);
    return {
      gate: node.gate,
      expected: node.value,
      cells: [...unique.values()],
      inputOrigins: kit.inputOrigins.map((coordinate) => [...coordinate]),
      observeGeneration: kit.observeGeneration + pulseIndex * 30,
      signalCells: kit.signalCells.map((coordinate) => [...coordinate]),
      signalDelta: [...kit.signalDelta],
      terminalCells: kit.terminalCells.map((coordinate) => [...coordinate]),
      connections,
      gunGroups,
    };
  }

  function normalizeCircuit(circuit) {
    const metadataCells = [
      ...circuit.cells,
      ...circuit.inputOrigins,
      ...circuit.signalCells,
      ...circuit.terminalCells,
      ...circuit.connections.flatMap((connection) => connection.cells),
      ...circuit.gunGroups.flatMap((group) => [...group.zoneCells, ...group.referenceCells]),
    ];
    const minRow = Math.min(...metadataCells.map(([row]) => row));
    const minColumn = Math.min(...metadataCells.map(([, column]) => column));
    const shift = (coordinates) => shiftCoordinates(coordinates, -minRow, -minColumn);
    const cells = shift(circuit.cells);
    const allShifted = [
      ...cells,
      ...shift(circuit.inputOrigins),
      ...shift(circuit.signalCells),
      ...shift(circuit.terminalCells),
      ...circuit.connections.flatMap((connection) => shift(connection.cells)),
      ...circuit.gunGroups.flatMap((group) => [...shift(group.zoneCells), ...shift(group.referenceCells)]),
    ];
    return {
      cells,
      width: Math.max(...allShifted.map(([, column]) => column)) + 1,
      height: Math.max(...allShifted.map(([row]) => row)) + 1,
      inputOrigins: shift(circuit.inputOrigins),
      signalCells: shift(circuit.signalCells),
      terminalCells: shift(circuit.terminalCells),
      connections: circuit.connections.map((connection) => Object.freeze({
        ...connection,
        cells: Object.freeze(shift(connection.cells).map(Object.freeze)),
      })),
      gunGroups: circuit.gunGroups.map((group) => ({
        zoneCells: shift(group.zoneCells),
        referenceCells: shift(group.referenceCells),
      })),
    };
  }

  function createGunSafetyState(candidate, usePhaseCache = false) {
    const zones = candidate.gunGroups.map((group) => {
      const minRow = Math.min(...group.zoneCells.map(([row]) => row));
      const maxRow = Math.max(...group.zoneCells.map(([row]) => row));
      const minColumn = Math.min(...group.zoneCells.map(([, column]) => column));
      const maxColumn = Math.max(...group.zoneCells.map(([, column]) => column));
      const keys = [];
      for (let row = minRow; row <= maxRow; row += 1) {
        for (let column = minColumn; column <= maxColumn; column += 1) keys.push(`${row},${column}`);
      }
      return keys;
    });
    const zoneMembership = new Map();
    for (let groupIndex = 0; groupIndex < zones.length; groupIndex += 1) {
      for (const key of zones[groupIndex]) {
        const groups = zoneMembership.get(key);
        if (groups) groups.push(groupIndex);
        else zoneMembership.set(key, [groupIndex]);
      }
    }
    const references = candidate.gunGroups.map((group, groupIndex) => {
      const initial = new Set(group.referenceCells.map(([row, column]) => `${row},${column}`));
      if (!usePhaseCache) return { phases: null, current: initial };
      let evolving = initial;
      const phases = [];
      for (let phase = 0; phase < 30; phase += 1) {
        phases.push(new Set(zones[groupIndex].filter((key) => evolving.has(key))));
        evolving = nextCellSet(evolving);
      }
      const periodic = zones[groupIndex].every(
        (key) => evolving.has(key) === phases[0].has(key),
      );
      return periodic ? { phases, current: null } : { phases: null, current: initial };
    });
    return {
      horizon: 4 * Math.max(candidate.width, candidate.height) + 120,
      world: new Set(candidate.cells.map(([row, column]) => `${row},${column}`)),
      zones,
      zoneMembership,
      references,
    };
  }

  function referenceAt(reference, generation) {
    return reference.phases ? reference.phases[generation % 30] : reference.current;
  }

  function advanceAperiodicReferences(references) {
    for (const reference of references) {
      if (!reference.phases) reference.current = nextCellSet(reference.current);
    }
  }

  function findGunSafetyMismatch(world, references, zoneMembership, generation) {
    for (let groupIndex = 0; groupIndex < references.length; groupIndex += 1) {
      const reference = referenceAt(references[groupIndex], generation);
      for (const key of reference) {
        if (zoneMembership.get(key)?.includes(groupIndex) && !world.has(key)) return groupIndex;
      }
    }
    for (const key of world) {
      const groups = zoneMembership.get(key);
      if (!groups) continue;
      for (const groupIndex of groups) {
        if (!referenceAt(references[groupIndex], generation).has(key)) return groupIndex;
      }
    }
    return -1;
  }

  function validateGunSafety(candidate) {
    const { horizon, zoneMembership, references, world: initialWorld } = createGunSafetyState(candidate);
    let world = initialWorld;
    for (let generation = 0; generation <= horizon; generation += 1) {
      const groupIndex = findGunSafetyMismatch(world, references, zoneMembership, generation);
      if (groupIndex >= 0) {
        return { safe: false, generation, groupIndex, horizon };
      }
      if (generation < horizon) {
        world = nextCellSet(world);
        advanceAperiodicReferences(references);
      }
    }
    return { safe: true, horizon };
  }

  function abortIfRequested(signal) {
    if (!signal?.aborted) return;
    const error = new LogicCodeError("已取消生成结构");
    error.code = "ABORTED";
    throw error;
  }

  function defaultYieldControl() {
    return new Promise((resolve) => setTimeout(resolve, 0));
  }

  async function validateGunSafetyAsync(candidate, options = {}) {
    const { horizon, zoneMembership, references, world: initialWorld } = createGunSafetyState(candidate, true);
    let world = initialWorld;
    const clock = typeof options.clock === "function"
      ? options.clock
      : () => (typeof performance === "object" ? performance.now() : Date.now());
    const yieldControl = typeof options.yieldControl === "function"
      ? options.yieldControl
      : defaultYieldControl;
    const sliceBudgetMs = Number.isFinite(options.sliceBudgetMs)
      ? Math.max(0, options.sliceBudgetMs)
      : SAFETY_SLICE_BUDGET_MS;
    let sliceStarted = clock();

    for (let generation = 0; generation <= horizon; generation += 1) {
      abortIfRequested(options.signal);
      const groupIndex = findGunSafetyMismatch(world, references, zoneMembership, generation);
      if (groupIndex >= 0) {
        return { safe: false, generation, groupIndex, horizon };
      }
      if (generation < horizon) {
        world = nextCellSet(world);
        advanceAperiodicReferences(references);
      }
      if (generation < horizon && clock() - sliceStarted >= sliceBudgetMs) {
        options.onProgress?.({ generation: generation + 1, horizon });
        await yieldControl();
        abortIfRequested(options.signal);
        sliceStarted = clock();
      }
    }
    options.onProgress?.({ generation: horizon, horizon });
    return { safe: true, horizon };
  }

  function assembledPattern(command, circuit, normalized, safety, routing) {
    return Object.freeze({
      id: `logic-code-${command.presetId}`,
      name: `逻辑代码 · ${command.expression}`,
      description: `${normalized.connections.length} 条滑翔机线路真实级联；最终输出 O=${command.expected}`,
      width: normalized.width,
      height: normalized.height,
      cells: Object.freeze(normalized.cells.map((coordinate) => Object.freeze(coordinate))),
      connectionCount: normalized.connections.length,
      gunSafety: Object.freeze({ verifiedThrough: safety.horizon }),
      routing: Object.freeze({ ...routing }),
      connections: Object.freeze(normalized.connections),
      logic: Object.freeze({
        gate: circuit.gate,
        inputs: Object.freeze([...command.inputs]),
        expected: command.expected,
        inputOrigins: Object.freeze(normalized.inputOrigins.map(Object.freeze)),
        observeGeneration: circuit.observeGeneration,
        signalCells: Object.freeze(normalized.signalCells.map(Object.freeze)),
        signalDelta: Object.freeze([...circuit.signalDelta]),
        terminalCells: Object.freeze(normalized.terminalCells.map(Object.freeze)),
      }),
    });
  }

  function routePaddingCandidates(command) {
    const gateCount = Math.max(1, command.steps?.length || 1);
    const scale = Math.max(1, Math.ceil(gateCount / 5));
    const candidates = [240, 360, 480, 720];
    if (scale > 1) candidates.push(960, 720 * scale, 1080 * scale);
    return [...new Set(candidates)].sort((left, right) => left - right);
  }

  function layoutVariantCandidates(command) {
    return (command.steps?.length || 1) > 5 ? [3, 0, 1, 2] : [0];
  }

  function branchSpacingCandidates(command) {
    return (command.steps?.length || 1) > 5 ? [20, 40, 80] : [20];
  }

  function correctRootOutputDirection(command, circuit, branchPulseSpacing) {
    const usesChannelLayout = (command.steps?.length || 1) > 5 || branchPulseSpacing > 20;
    return usesChannelLayout ? orientSouthEast(circuit) : circuit;
  }

  function composePattern(command, resolvePreset, resolveGateKit) {
    if (!command.steps || command.steps.length <= 1) return resolvePreset(command.presetId);
    if (!command.tree || typeof resolveGateKit !== "function") {
      throw new LogicCodeError("当前环境缺少真实级联门体");
    }
    let circuit;
    let normalized;
    let safety;
    let routing;
    for (const layoutVariant of layoutVariantCandidates(command)) {
      for (const branchPulseSpacing of branchSpacingCandidates(command)) {
        for (const routePadding of routePaddingCandidates(command)) {
          circuit = correctRootOutputDirection(command, compileCircuit(
            command.tree, resolveGateKit, routePadding, layoutVariant, branchPulseSpacing,
          ), branchPulseSpacing);
          normalized = normalizeCircuit(circuit);
          safety = validateGunSafety(normalized);
          routing = { layoutVariant, routePadding, branchPulseSpacing };
          if (safety.safe) break;
        }
        if (safety?.safe) break;
      }
      if (safety?.safe) break;
    }
    if (!safety?.safe) {
      const attemptCount = layoutVariantCandidates(command).length
        * branchSpacingCandidates(command).length
        * routePaddingCandidates(command).length;
      throw new LogicCodeError(
        `已尝试 ${attemptCount} 种布局与间距组合，仍无法找到不会撞击滑翔机枪的安全线路`,
      );
    }
    return assembledPattern(command, circuit, normalized, safety, routing);
  }

  async function composePatternAsync(command, resolvePreset, resolveGateKit, options = {}) {
    abortIfRequested(options.signal);
    if (!command.steps || command.steps.length <= 1) return resolvePreset(command.presetId);
    if (!command.tree || typeof resolveGateKit !== "function") {
      throw new LogicCodeError("当前环境缺少真实级联门体");
    }
    let circuit;
    let normalized;
    let safety;
    let routing;
    const routePaddings = routePaddingCandidates(command);
    const layoutVariants = layoutVariantCandidates(command);
    const branchSpacings = Array.isArray(options.branchSpacings)
      ? options.branchSpacings.filter((value) => Number.isInteger(value) && value >= 20 && value <= 160)
      : branchSpacingCandidates(command);
    if (branchSpacings.length === 0) throw new LogicCodeError("通道间隔候选无效");
    let attemptIndex = 0;
    for (const layoutVariant of layoutVariants) {
      for (const branchPulseSpacing of branchSpacings) {
        for (const routePadding of routePaddings) {
          abortIfRequested(options.signal);
          options.onProgress?.({
            phase: "routing", attemptIndex, routePadding, layoutVariant, branchPulseSpacing,
          });
          await (options.yieldControl || defaultYieldControl)();
          abortIfRequested(options.signal);
          circuit = correctRootOutputDirection(command, compileCircuit(
            command.tree, resolveGateKit, routePadding, layoutVariant, branchPulseSpacing,
          ), branchPulseSpacing);
          normalized = normalizeCircuit(circuit);
          routing = { layoutVariant, routePadding, branchPulseSpacing };
          await (options.yieldControl || defaultYieldControl)();
          abortIfRequested(options.signal);
          safety = await validateGunSafetyAsync(normalized, {
            ...options,
            onProgress: (progress) => options.onProgress?.({
              ...progress, phase: "safety", attemptIndex, routePadding,
              layoutVariant, branchPulseSpacing,
            }),
          });
          if (!safety.safe) options.onProgress?.({
            phase: "rejected", attemptIndex, routePadding, layoutVariant, branchPulseSpacing,
            generation: safety.generation, groupIndex: safety.groupIndex, horizon: safety.horizon,
          });
          attemptIndex += 1;
          if (safety.safe) break;
        }
        if (safety?.safe) break;
      }
      if (safety?.safe) break;
    }
    if (!safety?.safe) {
      throw new LogicCodeError(
        `已尝试 ${attemptIndex} 种布局与间距组合，仍无法找到不会撞击滑翔机枪的安全线路`,
      );
    }
    return assembledPattern(command, circuit, normalized, safety, routing);
  }

  return Object.freeze({
    LogicCodeError, composePattern, composePatternAsync, createFunctionDefinition, expandFunctions,
    instantiateFunction, parse, parseExpanded, SAFETY_SLICE_BUDGET_MS,
    validateGunSafety, validateGunSafetyAsync,
  });
});
