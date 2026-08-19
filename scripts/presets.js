(function exposePresets(root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) {
    module.exports = api;
  }
  root.LifePresets = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function createPresets() {
  "use strict";

  const presets = Object.freeze([
    Object.freeze({
      id: "glider",
      name: "滑翔机",
      description: "每 4 代向右下移动一格",
      width: 3,
      height: 3,
      cells: Object.freeze([[0, 1], [1, 2], [2, 0], [2, 1], [2, 2]]),
    }),
    Object.freeze({
      id: "blinker",
      name: "闪烁器",
      description: "周期为 2 的振荡器",
      width: 3,
      height: 1,
      cells: Object.freeze([[0, 0], [0, 1], [0, 2]]),
    }),
    Object.freeze({
      id: "lightweight-spaceship",
      name: "轻量级飞船",
      description: "向右移动的小型飞船",
      width: 5,
      height: 4,
      cells: Object.freeze([
        [0, 1], [0, 4],
        [1, 0],
        [2, 0], [2, 4],
        [3, 0], [3, 1], [3, 2], [3, 3],
      ]),
    }),
    Object.freeze({
      id: "pulsar",
      name: "脉冲星",
      description: "周期为 3 的大型振荡器",
      width: 13,
      height: 13,
      cells: Object.freeze([
        [0,2],[0,3],[0,4],[0,8],[0,9],[0,10],
        [2,0],[2,5],[2,7],[2,12],[3,0],[3,5],[3,7],[3,12],[4,0],[4,5],[4,7],[4,12],
        [5,2],[5,3],[5,4],[5,8],[5,9],[5,10],
        [7,2],[7,3],[7,4],[7,8],[7,9],[7,10],
        [8,0],[8,5],[8,7],[8,12],[9,0],[9,5],[9,7],[9,12],[10,0],[10,5],[10,7],[10,12],
        [12,2],[12,3],[12,4],[12,8],[12,9],[12,10],
      ]),
    }),
  ]);

  function getPreset(id) {
    return presets.find((preset) => preset.id === id) || null;
  }

  return Object.freeze({ presets, getPreset });
});
