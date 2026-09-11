(function exposeLogicLayout(root, factory) {
  const api = factory(...(typeof module === "object" && module.exports
    ? [require("./logic-parse.js")]
    : [root.LogicParse]));
  if (typeof module === "object" && module.exports) module.exports = api;
  root.LogicLayout = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function createLogicLayout(LogicParse) {
  "use strict";

  const { LogicCodeError } = LogicParse;

  function flattenCircuit(tree) {
    if (!tree?.gate) throw new LogicCodeError("同轴布局需要至少一个基础逻辑门");
    const nodes = [];
    const edges = [];

    function visit(node) {
      if (!node?.gate || !Array.isArray(node.children)) {
        throw new LogicCodeError("逻辑门树结构无效");
      }
      const inputs = node.children.map((child, portIndex) => {
        if (!child?.gate) {
          if (child?.value !== 0 && child?.value !== 1) {
            throw new LogicCodeError("逻辑门常量输入只能是 0 或 1");
          }
          return Object.freeze({ kind: "constant", portIndex, value: child.value });
        }
        const sourceId = visit(child);
        return { kind: "edge", portIndex, sourceId, expected: child.value };
      });
      const id = `gate-${nodes.length}`;
      const targetIndex = nodes.length;
      const normalizedInputs = inputs.map((input) => {
        if (input.kind === "constant") return input;
        const edge = Object.freeze({
          id: `edge-${edges.length}`,
          from: input.sourceId,
          to: id,
          portIndex: input.portIndex,
          expected: input.expected,
        });
        edges.push(edge);
        return Object.freeze({
          kind: "edge", portIndex: input.portIndex, sourceId: input.sourceId, edgeId: edge.id,
        });
      });
      nodes.push(Object.freeze({
        id,
        gate: node.gate,
        expected: node.value,
        expression: node.expression,
        order: targetIndex,
        inputs: Object.freeze(normalizedInputs),
      }));
      return id;
    }

    const rootId = visit(tree);
    return Object.freeze({
      nodes: Object.freeze(nodes),
      edges: Object.freeze(edges),
      rootId,
    });
  }

  function layoutGateBaseline(graph, columnSpacing = 240) {
    if (!graph?.nodes?.length) throw new LogicCodeError("同轴布局缺少逻辑门节点");
    if (!Number.isInteger(columnSpacing) || columnSpacing < 1) {
      throw new LogicCodeError("同轴逻辑门间距必须是正整数");
    }
    const anchors = graph.nodes.map((node, index) => Object.freeze({
      id: node.id,
      row: 0,
      column: index * columnSpacing,
    }));
    return Object.freeze({
      ...graph,
      baselineRow: 0,
      columnSpacing,
      anchors: Object.freeze(anchors),
    });
  }

  return Object.freeze({ flattenCircuit, layoutGateBaseline });
});
