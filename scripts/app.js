(function startApplication() {
  "use strict";

  const Life = window.LifeEngine;
  const Presets = window.LifePresets;
  const DEFAULT_ROWS = 40;
  const DEFAULT_COLUMNS = 60;
  const DEFAULT_SPEED = 5;
  const RANDOM_DENSITY = 0.25;
  const MAX_IMPORT_BYTES = 1_000_000;

  const elements = {
    alive: document.querySelector("#aliveValue"),
    boardHint: document.querySelector("#boardHint"),
    canvas: document.querySelector("#lifeCanvas"),
    clear: document.querySelector("#clearButton"),
    export: document.querySelector("#exportButton"),
    generation: document.querySelector("#generationValue"),
    importButton: document.querySelector("#importButton"),
    importInput: document.querySelector("#importInput"),
    loadPreset: document.querySelector("#loadPresetButton"),
    presetDescription: document.querySelector("#presetDescription"),
    presetSelect: document.querySelector("#presetSelect"),
    random: document.querySelector("#randomButton"),
    run: document.querySelector("#runToggle"),
    speed: document.querySelector("#speedRange"),
    speedValue: document.querySelector("#speedValue"),
    status: document.querySelector("#statusText"),
    step: document.querySelector("#stepButton"),
    toast: document.querySelector("#toast"),
    toastMessage: document.querySelector("#toastMessage"),
    undo: document.querySelector("#undoButton"),
  };

  const renderer = window.LifeRenderer.create(elements.canvas);
  const state = {
    board: Life.createBoard(DEFAULT_ROWS, DEFAULT_COLUMNS),
    generation: 0,
    running: false,
    speed: DEFAULT_SPEED,
    timer: null,
    drawing: false,
    drawAlive: true,
    painted: new Set(),
    undoSnapshot: null,
    toastTimer: null,
  };

  function formatNumber(value) {
    return new Intl.NumberFormat("zh-CN").format(value);
  }

  function render() {
    const alive = Life.countAlive(state.board);
    renderer.draw(state.board, state.running);
    elements.generation.textContent = formatNumber(state.generation);
    elements.alive.textContent = formatNumber(alive);
    elements.status.textContent = state.running ? "演化中" : "已暂停";
    elements.run.querySelector(".button-icon").textContent = state.running ? "Ⅱ" : "▶";
    elements.run.querySelector(".button-label").textContent = state.running ? "暂停" : "开始";
    elements.run.setAttribute("aria-pressed", String(state.running));
    elements.step.disabled = state.running;
    elements.clear.disabled = alive === 0;
    elements.export.disabled = alive === 0;
    elements.canvas.setAttribute("aria-disabled", String(state.running));
    elements.canvas.setAttribute(
      "aria-label",
      `${state.board.columns} 列、${state.board.rows} 行的康威生命游戏棋盘；第 ${state.generation} 代，${alive} 个活细胞，${state.running ? "正在运行" : "已暂停"}。`,
    );
    elements.boardHint.textContent = state.running
      ? "正在演化；暂停后可以继续编辑棋盘。"
      : "点击或拖动绘制；从活细胞开始拖动可擦除。";
    document.body.classList.toggle("is-running", state.running);
    const worldLabel = document.querySelector(".board-heading .section-kicker");
    worldLabel.textContent = `WORLD ${state.board.columns} × ${state.board.rows}`;
  }

  function hideToast() {
    elements.toast.hidden = true;
    elements.undo.hidden = true;
    window.clearTimeout(state.toastTimer);
    state.toastTimer = null;
  }

  function showToast(message, options = {}) {
    window.clearTimeout(state.toastTimer);
    elements.toastMessage.textContent = message;
    elements.undo.hidden = !options.undo;
    elements.toast.hidden = false;
    state.toastTimer = window.setTimeout(hideToast, options.duration || 3600);
  }

  function advance() {
    state.board = Life.nextGeneration(state.board);
    state.generation += 1;
    render();
  }

  function stop(options = {}) {
    if (state.timer !== null) {
      window.clearInterval(state.timer);
      state.timer = null;
    }
    const changed = state.running;
    state.running = false;
    if (changed && options.message) showToast(options.message);
    render();
  }

  function start() {
    if (state.running) return;
    state.running = true;
    state.timer = window.setInterval(advance, Math.round(1000 / state.speed));
    render();
  }

  function restartTimer() {
    if (!state.running) return;
    window.clearInterval(state.timer);
    state.timer = window.setInterval(advance, Math.round(1000 / state.speed));
  }

  function toggleRun() {
    if (state.running) stop();
    else start();
  }

  function resetWith(board, message) {
    stop();
    state.board = board;
    state.generation = 0;
    state.undoSnapshot = null;
    render();
    if (message) showToast(message);
  }

  function clearBoard() {
    if (Life.countAlive(state.board) === 0) return;
    const wasRunning = state.running;
    stop();
    state.undoSnapshot = {
      board: Life.cloneBoard(state.board),
      generation: state.generation,
      wasRunning,
    };
    state.board = Life.createBoard(state.board.rows, state.board.columns);
    state.generation = 0;
    render();
    showToast("棋盘已清空", { undo: true, duration: 7000 });
  }

  function undoClear() {
    if (!state.undoSnapshot) return;
    const snapshot = state.undoSnapshot;
    state.undoSnapshot = null;
    state.board = snapshot.board;
    state.generation = snapshot.generation;
    hideToast();
    render();
    showToast("已恢复清空前的局面");
  }

  function fillRandom() {
    resetWith(
      Life.randomBoard(state.board.rows, state.board.columns, RANDOM_DENSITY),
      "已生成 25% 密度的随机世界",
    );
  }

  function populatePresets() {
    for (const preset of Presets.presets) {
      const option = document.createElement("option");
      option.value = preset.id;
      option.textContent = preset.name;
      elements.presetSelect.append(option);
    }
    updatePresetDescription();
  }

  function updatePresetDescription() {
    const preset = Presets.getPreset(elements.presetSelect.value);
    elements.presetDescription.textContent = preset ? preset.description : "";
  }

  function loadPreset() {
    const preset = Presets.getPreset(elements.presetSelect.value);
    if (!preset) return;
    const offsetRow = Math.floor((state.board.rows - preset.height) / 2);
    const offsetColumn = Math.floor((state.board.columns - preset.width) / 2);
    try {
      resetWith(
        Life.placePattern(state.board, preset.cells, offsetRow, offsetColumn, true),
        `已放置：${preset.name}`,
      );
    } catch (error) {
      showToast(error.message);
    }
  }

  function exportBoard() {
    if (Life.countAlive(state.board) === 0) return;
    const contents = JSON.stringify(Life.serialize(state.board, state.generation), null, 2);
    const blob = new Blob([contents], { type: "application/json;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `life-generation-${state.generation}.json`;
    document.body.append(anchor);
    anchor.click();
    anchor.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 0);
    showToast("局面已导出");
  }

  async function importBoard(file) {
    if (!file) return;
    if (file.size > MAX_IMPORT_BYTES) {
      showToast("导入失败：文件不能超过 1 MB");
      return;
    }
    try {
      const restored = Life.deserialize(await file.text());
      stop();
      state.board = restored.board;
      state.generation = restored.generation;
      state.undoSnapshot = null;
      render();
      showToast("局面导入成功");
    } catch (error) {
      showToast(`导入失败：${error.message}`);
    }
  }

  function paintPointer(event) {
    const coordinate = renderer.coordinateFromPointer(event, state.board);
    if (!coordinate) return;
    const key = `${coordinate.row}:${coordinate.column}`;
    if (state.painted.has(key)) return;
    state.painted.add(key);
    Life.setCell(state.board, coordinate.row, coordinate.column, state.drawAlive);
    state.undoSnapshot = null;
    render();
  }

  function beginDrawing(event) {
    if (state.running) {
      showToast("请先暂停，再编辑棋盘");
      return;
    }
    const coordinate = renderer.coordinateFromPointer(event, state.board);
    if (!coordinate) return;
    state.drawing = true;
    state.drawAlive = !Life.isAlive(state.board, coordinate.row, coordinate.column);
    state.painted.clear();
    elements.canvas.setPointerCapture(event.pointerId);
    paintPointer(event);
  }

  function continueDrawing(event) {
    if (!state.drawing) return;
    paintPointer(event);
  }

  function endDrawing(event) {
    if (!state.drawing) return;
    state.drawing = false;
    state.painted.clear();
    if (elements.canvas.hasPointerCapture(event.pointerId)) {
      elements.canvas.releasePointerCapture(event.pointerId);
    }
  }

  function handleKeyboard(event) {
    const tag = document.activeElement?.tagName;
    if (["INPUT", "SELECT", "TEXTAREA"].includes(tag)) return;
    if (tag === "BUTTON" && event.code === "Space") return;
    if (event.code === "Space") {
      event.preventDefault();
      toggleRun();
    } else if (event.code === "ArrowRight") {
      event.preventDefault();
      if (!state.running) advance();
    } else if (event.key.toLowerCase() === "c") {
      event.preventDefault();
      clearBoard();
    }
  }

  elements.run.addEventListener("click", toggleRun);
  elements.step.addEventListener("click", advance);
  elements.clear.addEventListener("click", clearBoard);
  elements.random.addEventListener("click", fillRandom);
  elements.undo.addEventListener("click", undoClear);
  elements.presetSelect.addEventListener("change", updatePresetDescription);
  elements.loadPreset.addEventListener("click", loadPreset);
  elements.export.addEventListener("click", exportBoard);
  elements.importButton.addEventListener("click", () => elements.importInput.click());
  elements.importInput.addEventListener("change", async () => {
    await importBoard(elements.importInput.files?.[0]);
    elements.importInput.value = "";
  });
  elements.speed.addEventListener("input", () => {
    state.speed = Number(elements.speed.value);
    elements.speedValue.textContent = `${state.speed} 代/秒`;
    restartTimer();
  });
  elements.canvas.addEventListener("pointerdown", beginDrawing);
  elements.canvas.addEventListener("pointermove", continueDrawing);
  elements.canvas.addEventListener("pointerup", endDrawing);
  elements.canvas.addEventListener("pointercancel", endDrawing);
  document.addEventListener("keydown", handleKeyboard);
  document.addEventListener("visibilitychange", () => {
    if (document.hidden && state.running) stop({ message: "页面隐藏，已自动暂停" });
  });

  populatePresets();
  render();
})();
