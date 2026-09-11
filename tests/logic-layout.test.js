"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const LogicCode = require("../scripts/logic-code.js");
const LogicLayout = require("../scripts/logic-layout.js");

test("嵌套表达式按后序扁平化为基础门和有向连接", () => {
  const graph = LogicLayout.flattenCircuit(LogicCode.parse("NOT(AND(1,1))").tree);

  assert.deepEqual(graph.nodes.map(({ id, gate }) => ({ id, gate })), [
    { id: "gate-0", gate: "AND" },
    { id: "gate-1", gate: "NOT" },
  ]);
  assert.deepEqual(graph.edges, [
    { id: "edge-0", from: "gate-0", to: "gate-1", portIndex: 0, expected: 1 },
  ]);
  assert.equal(graph.rootId, "gate-1");
  assert.deepEqual(graph.nodes[0].inputs.map(({ kind, value }) => ({ kind, value })), [
    { kind: "constant", value: 1 }, { kind: "constant", value: 1 },
  ]);
});

test("并行分支保留父门端口和每条门到门边", () => {
  const graph = LogicLayout.flattenCircuit(
    LogicCode.parse("OR(AND(1,0),NOT(0))").tree,
  );

  assert.deepEqual(graph.nodes.map(({ gate }) => gate), ["AND", "NOT", "OR"]);
  assert.deepEqual(graph.edges.map(({ from, to, portIndex, expected }) => (
    { from, to, portIndex, expected }
  )), [
    { from: "gate-0", to: "gate-2", portIndex: 0, expected: 0 },
    { from: "gate-1", to: "gate-2", portIndex: 1, expected: 1 },
  ]);
});

test("任意嵌套深度只影响拓扑顺序而不产生门体纵向层级", () => {
  const expressions = [
    "NOT(AND(1,1))",
    "NOT(NOT(NOT(NOT(AND(1,1)))))",
    "NOT(NOT(NOT(NOT(NOT(NOT(NOT(AND(1,1))))))))",
  ];

  for (const expression of expressions) {
    const graph = LogicLayout.flattenCircuit(LogicCode.parse(expression).tree);
    const layout = LogicLayout.layoutGateBaseline(graph, 320);
    assert.equal(new Set(layout.anchors.map(({ row }) => row)).size, 1, expression);
    assert.deepEqual(
      layout.anchors.map(({ column }) => column),
      graph.nodes.map((node, index) => index * 320),
      expression,
    );
    assert.equal(graph.edges.length, graph.nodes.length - 1, expression);
  }
});

test("同轴布局拒绝空门图和无效间距", () => {
  assert.throws(() => LogicLayout.flattenCircuit({ value: 1 }), /至少一个基础逻辑门/);
  const graph = LogicLayout.flattenCircuit({
    gate: "NOT", value: 1, expression: "NOT 0",
    children: [{ gate: null, value: 0, expression: "0", children: [] }],
  });
  assert.throws(() => LogicLayout.layoutGateBaseline(graph, 0), /正整数/);
});
