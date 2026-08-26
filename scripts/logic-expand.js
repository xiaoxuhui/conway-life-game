(function exposeLogicExpand(root, factory) {
  const api = factory(...(typeof module === "object" && module.exports ? [require("./logic-parse.js")] : [root.LogicParse]));
  if (typeof module === "object" && module.exports) module.exports = api;
  root.LogicExpand = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function createLogicExpand(LogicParse) {
  "use strict";

  const { LogicCodeError, MAX_SOURCE_LENGTH, MAX_EXPANDED_LENGTH, splitProgram,
    parseFunctionExpression, parse, parseExpanded, collectVariableNames } = LogicParse;

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

  return Object.freeze({ expandFunctions, createFunctionDefinition, instantiateFunction });
});
