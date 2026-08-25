(function startApplication() {
  "use strict";

  const Life = window.LifeEngine;
  const RendererModule = window.LifeRenderer;
  const Presets = window.LifePresets;
  const PatternStore = window.PatternLibrary;
  const SpeedControl = window.SpeedControl;
  const LogicCode = window.LogicCode;
  const FunctionStore = window.LogicFunctionLibrary;
  const Dialogs = window.LifeDialogs;
  const RANDOM_ROWS = 40;
  const RANDOM_COLUMNS = 60;
  const RANDOM_DENSITY = 0.25;
  const MAX_IMPORT_BYTES = 1_000_000;
  const ZOOM_STEP = 1.5;

  const elements = {
    actualSpeed: document.querySelector("#actualSpeedValue"),
    alive: document.querySelector("#aliveValue"),
    boardHint: document.querySelector("#boardHint"),
    canvas: document.querySelector("#lifeCanvas"),
    clear: document.querySelector("#clearButton"),
    export: document.querySelector("#exportButton"),
    fitView: document.querySelector("#fitViewButton"),
    generation: document.querySelector("#generationValue"),
    importButton: document.querySelector("#importButton"),
    importInput: document.querySelector("#importInput"),
    loadPreset: document.querySelector("#loadPresetButton"),
    logicCodeButton: document.querySelector("#logicCodeButton"),
    logicCodeFeedback: document.querySelector("#logicCodeFeedback"),
    logicCodeForm: document.querySelector("#logicCodeForm"),
    logicCodeInput: document.querySelector("#logicCodeInput"),
    logicFunctionSelect: document.querySelector("#logicFunctionSelect"),
    logicFunctionInputs: document.querySelector("#logicFunctionInputs"),
    loadLogicFunction: document.querySelector("#loadLogicFunctionButton"),
    saveLogicFunction: document.querySelector("#saveLogicFunctionButton"),
    manageLogicFunctions: document.querySelector("#manageLogicFunctionsButton"),
    saveLogicFunctionDialog: document.querySelector("#saveLogicFunctionDialog"),
    saveLogicFunctionForm: document.querySelector("#saveLogicFunctionForm"),
    logicFunctionName: document.querySelector("#logicFunctionNameInput"),
    saveLogicFunctionCode: document.querySelector("#saveLogicFunctionCode"),
    saveLogicFunctionInputs: document.querySelector("#saveLogicFunctionInputs"),
    saveLogicFunctionError: document.querySelector("#saveLogicFunctionError"),
    closeSaveLogicFunction: document.querySelector("#closeSaveLogicFunctionButton"),
    cancelSaveLogicFunction: document.querySelector("#cancelSaveLogicFunctionButton"),
    manageLogicFunctionsDialog: document.querySelector("#manageLogicFunctionsDialog"),
    manageLogicFunctionsForm: document.querySelector("#manageLogicFunctionsForm"),
    manageLogicFunctionSelect: document.querySelector("#manageLogicFunctionSelect"),
    manageLogicFunctionName: document.querySelector("#manageLogicFunctionName"),
    manageLogicFunctionCode: document.querySelector("#manageLogicFunctionCode"),
    manageLogicFunctionError: document.querySelector("#manageLogicFunctionError"),
    closeManageLogicFunctions: document.querySelector("#closeManageLogicFunctionsButton"),
    cancelManageLogicFunctions: document.querySelector("#cancelManageLogicFunctionsButton"),
    deleteLogicFunction: document.querySelector("#deleteLogicFunctionButton"),
    managePatternDescription: document.querySelector("#managePatternDescriptionInput"),
    managePatternError: document.querySelector("#managePatternError"),
    managePatternMeta: document.querySelector("#managePatternMeta"),
    managePatternName: document.querySelector("#managePatternNameInput"),
    managePatterns: document.querySelector("#managePatternsButton"),
    managePatternsDialog: document.querySelector("#managePatternsDialog"),
    managePatternsForm: document.querySelector("#managePatternsForm"),
    managePatternSelect: document.querySelector("#managePatternSelect"),
    presetDescription: document.querySelector("#presetDescription"),
    presetSelect: document.querySelector("#presetSelect"),
    rotatePattern: document.querySelector("#rotatePatternButton"),
    flipPattern: document.querySelector("#flipPatternButton"),
    random: document.querySelector("#randomButton"),
    run: document.querySelector("#runToggle"),
    savePattern: document.querySelector("#savePatternButton"),
    savePatternDescription: document.querySelector("#patternDescriptionInput"),
    savePatternDialog: document.querySelector("#savePatternDialog"),
    savePatternError: document.querySelector("#savePatternError"),
    savePatternForm: document.querySelector("#savePatternForm"),
    savePatternName: document.querySelector("#patternNameInput"),
    savePatternStats: document.querySelector("#savePatternStats"),
    speed: document.querySelector("#speedInput"),
    status: document.querySelector("#statusText"),
    step: document.querySelector("#stepButton"),
    toast: document.querySelector("#toast"),
    toastMessage: document.querySelector("#toastMessage"),
    undo: document.querySelector("#undoButton"),
    updateExistingPattern: document.querySelector("#updateExistingPatternButton"),
    worldPosition: document.querySelector("#worldPosition"),
    zoomIn: document.querySelector("#zoomInButton"),
    zoomOut: document.querySelector("#zoomOutButton"),
    cancelManagePatterns: document.querySelector("#cancelManagePatternsButton"),
    cancelSavePattern: document.querySelector("#cancelSavePatternButton"),
    closeManagePatterns: document.querySelector("#closeManagePatternsButton"),
    closeSavePattern: document.querySelector("#closeSavePatternButton"),
    deletePattern: document.querySelector("#deletePatternButton"),
    patternPreview: document.querySelector("#patternPreview"),
  };

  const renderer = RendererModule.create(elements.canvas);
  // 状态按职责分为 world（演化/视图）/ pointer（指针与手势）/ dialogs（对话框与瞬时 UI 模式）/ storage（持久化库）四个子对象，
  // 便于维护；所有访问点已同步改为 state.<group>.<field>，行为与原扁平结构完全一致。
  const state = {
    world: {
      cells: Life.createWorld(),
      generation: 0,
      running: false,
      speed: SpeedControl.DEFAULT_SPEED,
      animationFrame: null,
      frameAccumulator: 0,
      lastFrameTimestamp: null,
      actualSpeed: 0,
      speedWindowStarted: null,
      speedWindowGenerations: 0,
      camera: RendererModule.createCamera(),
      undoSnapshot: null,
      logicOutputs: [],
    },
    pointer: {
      drawingPointerId: null,
      drawAlive: true,
      painted: new Set(),
      strokeOriginal: new Map(),
      panGesture: null,
      touchGesture: null,
      activePointers: new Map(),
      spaceDown: false,
      spaceDragged: false,
      saveDraftWorld: null,
    },
    dialogs: {
      toastTimer: null,
      logicFunctionDraft: null,
      logicGenerationController: null,
      functionDeleteArmed: false,
      functionDeleteArmTimer: null,
      duplicatePatternId: null,
      deleteArmed: false,
      deleteArmTimer: null,
      placement: null,
    },
    storage: {
      patternLibrary: PatternStore.createLibrary(),
      logicFunctionLibrary: FunctionStore.createLibrary(),
      logicFunctionStorageBlocked: false,
      patternStorageBlocked: false,
    },
  };

  // 对话框与函数库/图案库管理逻辑已抽至 dialogs.js（LifeDialogs），
  // 通过上下文注入 state / elements / 各 store 与少量 app 层辅助函数。
  const Dialog = Dialogs.create({
    state,
    elements,
    Life,
    PatternStore,
    FunctionStore,
    LogicCode,
    Presets,
    helpers: {
      showToast,
      render,
      stop,
      closeDialog,
      replacePlacementPattern,
      setLogicCodeFeedback,
      formatNumber,
    },
  });

  function formatNumber(value) {
    return new Intl.NumberFormat("zh-CN").format(value);
  }

  function formatCoordinate(value) {
    const absolute = Math.abs(value);
    if (absolute >= 1_000_000) return value.toExponential(2);
    if (absolute >= 100) return formatNumber(Math.round(value));
    return value.toFixed(1).replace(/\.0$/, "");
  }

  function formatZoom(cellSize) {
    const ratio = cellSize / RendererModule.DEFAULT_CELL_SIZE;
    if (ratio >= 1000 || ratio < 0.01) return `×${ratio.toExponential(1)}`;
    if (ratio >= 10) return `×${ratio.toFixed(0)}`;
    return `×${ratio.toFixed(2)}`;
  }

  function updateCursorClasses() {
    document.body.classList.toggle("pan-ready", state.pointer.spaceDown);
    document.body.classList.toggle("is-panning", Boolean(state.pointer.panGesture || state.pointer.touchGesture));
  }

  function absoluteLogicCells(output, key) {
    return output[key].map(([row, column]) => [output.row + row, output.column + column]);
  }

  function logicAnnotations() {
    return state.world.logicOutputs.map((output) => ({
      observeGeneration: output.observeGeneration,
      result: output.result,
      terminalCells: absoluteLogicCells(output, "terminalCells"),
    }));
  }

  function updateLogicOutputs() {
    for (const output of state.world.logicOutputs) {
      if (output.result !== null || state.world.generation < output.observeGeneration) continue;
      output.result = Number(absoluteLogicCells(output, "signalCells")
        .every(([row, column]) => Life.isAlive(state.world.cells, row, column)));
    }
  }

  function logicOutputSummary() {
    if (state.world.logicOutputs.length === 0) return "";
    return state.world.logicOutputs
      .map((output) => output.result === null ? `O=?（第 ${output.observeGeneration} 代读取）` : `O=${output.result}`)
      .join("；");
  }

  function render() {
    const alive = Life.countAlive(state.world.cells);
    renderer.draw(state.world.cells, state.world.camera, state.world.running, state.dialogs.placement, logicAnnotations());
    elements.generation.textContent = formatNumber(state.world.generation);
    elements.alive.textContent = formatNumber(alive);
    elements.actualSpeed.textContent = `${formatNumber(state.world.actualSpeed)}/s`;
    elements.zoomValue.textContent = formatZoom(state.world.camera.cellSize);
    elements.status.textContent = state.dialogs.placement ? "放置中" : state.world.running ? "演化中" : "已暂停";
    elements.run.querySelector(".button-icon").textContent = state.world.running ? "Ⅱ" : "▶";
    elements.run.querySelector(".button-label").textContent = state.world.running ? "暂停" : "开始";
    elements.run.setAttribute("aria-pressed", String(state.world.running));
    elements.step.disabled = state.world.running;
    elements.clear.disabled = alive === 0;
    elements.export.disabled = alive === 0;
    elements.savePattern.disabled = alive === 0;
    elements.managePatterns.disabled = state.storage.patternLibrary.patterns.length === 0;
    elements.loadPreset.textContent = state.dialogs.placement ? "完成" : "放置";
    elements.loadPreset.setAttribute("aria-pressed", String(Boolean(state.dialogs.placement)));
    elements.rotatePattern.disabled = !state.dialogs.placement;
    elements.flipPattern.disabled = !state.dialogs.placement;
    elements.canvas.setAttribute(
      "aria-label",
      `无限大的康威生命游戏世界；视图中心列 ${formatCoordinate(state.world.camera.centerColumn)}、行 ${formatCoordinate(state.world.camera.centerRow)}；第 ${state.world.generation} 代，${alive} 个活细胞，${state.dialogs.placement ? `正在放置${state.dialogs.placement.pattern.name}` : state.world.running ? "正在运行" : "已暂停"}${state.world.logicOutputs.length ? `；逻辑输出：${logicOutputSummary()}` : ""}。`,
    );
    elements.boardHint.textContent = state.dialogs.placement
      ? "拖动预览，松开或单击放置；R 旋转 · F 翻转 · Esc 完成。"
      : state.world.logicOutputs.length
        ? `方框中的 2×2 方块是静物输出端；${logicOutputSummary()}。`
      : state.world.running
        ? "正在演化；仍可拖动和缩放，暂停后可继续绘制。"
        : "左键绘制；中键、右键或按住空格拖动；滚轮缩放。";
    elements.worldPosition.textContent = `WORLD ∞ · CENTER ${formatCoordinate(state.world.camera.centerColumn)}, ${formatCoordinate(state.world.camera.centerRow)}`;
    document.body.classList.toggle("is-running", state.world.running);
    document.body.classList.toggle("is-placing", Boolean(state.dialogs.placement));
    updateCursorClasses();
  }

  function hideToast() {
    elements.toast.hidden = true;
    elements.undo.hidden = true;
    window.clearTimeout(state.dialogs.toastTimer);
    state.dialogs.toastTimer = null;
  }

  function showToast(message, options = {}) {
    window.clearTimeout(state.dialogs.toastTimer);
    elements.toastMessage.textContent = message;
    elements.undo.hidden = !options.undo;
    elements.toast.hidden = false;
    state.dialogs.toastTimer = window.setTimeout(hideToast, options.duration || 3600);
  }

  function evolveOneGeneration() {
    if (state.dialogs.placement) state.dialogs.placement = null;
    state.world.cells = Life.nextGeneration(state.world.cells);
    state.world.generation += 1;
    updateLogicOutputs();
  }

  function advance() {
    evolveOneGeneration();
    render();
  }

  function runAnimationFrame(timestamp) {
    if (!state.world.running) return;
    let shouldRender = false;
    if (state.world.lastFrameTimestamp === null) {
      state.world.lastFrameTimestamp = timestamp;
      state.world.speedWindowStarted = timestamp;
    } else {
      state.world.frameAccumulator = SpeedControl.accumulate(
        state.world.frameAccumulator,
        timestamp - state.world.lastFrameTimestamp,
        state.world.speed,
      );
      state.world.lastFrameTimestamp = timestamp;
      const computeStarted = performance.now();
      while (state.world.frameAccumulator >= 1) {
        evolveOneGeneration();
        state.world.frameAccumulator -= 1;
        state.world.speedWindowGenerations += 1;
        shouldRender = true;
        if (performance.now() - computeStarted >= SpeedControl.FRAME_COMPUTE_BUDGET_MS) break;
      }
    }

    const windowElapsed = timestamp - state.world.speedWindowStarted;
    if (windowElapsed >= SpeedControl.ACTUAL_SPEED_WINDOW_MS) {
      state.world.actualSpeed = Math.round(state.world.speedWindowGenerations * 1000 / windowElapsed);
      state.world.speedWindowStarted = timestamp;
      state.world.speedWindowGenerations = 0;
      shouldRender = true;
    }
    if (shouldRender) render();
    state.world.animationFrame = window.requestAnimationFrame(runAnimationFrame);
  }

  function stop(options = {}) {
    if (state.world.animationFrame !== null) {
      window.cancelAnimationFrame(state.world.animationFrame);
      state.world.animationFrame = null;
    }
    const changed = state.world.running;
    state.world.running = false;
    state.world.frameAccumulator = 0;
    state.world.lastFrameTimestamp = null;
    state.world.speedWindowStarted = null;
    state.world.speedWindowGenerations = 0;
    state.world.actualSpeed = 0;
    if (changed && options.message) showToast(options.message);
    render();
  }

  function start() {
    if (state.world.running) return;
    state.dialogs.placement = null;
    state.world.running = true;
    state.world.frameAccumulator = 0;
    state.world.lastFrameTimestamp = null;
    state.world.speedWindowStarted = null;
    state.world.speedWindowGenerations = 0;
    state.world.actualSpeed = 0;
    state.world.animationFrame = window.requestAnimationFrame(runAnimationFrame);
    render();
  }

  function resetAnimationPacing() {
    if (!state.world.running) return;
    state.world.frameAccumulator = 0;
    state.world.lastFrameTimestamp = null;
    state.world.speedWindowStarted = null;
    state.world.speedWindowGenerations = 0;
    state.world.actualSpeed = 0;
    render();
  }

  function toggleRun() {
    if (state.world.running) stop();
    else start();
  }

  function fitView() {
    state.world.camera = renderer.fit(Life.bounds(state.world.cells));
    render();
  }

  function resetWith(world, message, shouldFit = true) {
    stop();
    state.dialogs.placement = null;
    state.world.cells = world;
    state.world.generation = 0;
    state.world.logicOutputs = [];
    state.world.undoSnapshot = null;
    if (shouldFit) state.world.camera = renderer.fit(Life.bounds(world));
    render();
    if (message) showToast(message);
  }

  function clearWorld() {
    if (Life.countAlive(state.world.cells) === 0) return;
    const wasRunning = state.world.running;
    stop();
    state.dialogs.placement = null;
    state.world.undoSnapshot = {
      world: Life.cloneWorld(state.world.cells),
      generation: state.world.generation,
      camera: RendererModule.createCamera(state.world.camera),
      wasRunning,
      logicOutputs: state.world.logicOutputs.map((output) => ({ ...output })),
    };
    state.world.cells = Life.createWorld();
    state.world.generation = 0;
    state.world.logicOutputs = [];
    render();
    showToast("世界已清空", { undo: true, duration: 7000 });
  }

  function undoClear() {
    if (!state.world.undoSnapshot) return;
    const snapshot = state.world.undoSnapshot;
    state.world.undoSnapshot = null;
    state.world.cells = snapshot.world;
    state.world.generation = snapshot.generation;
    state.world.camera = snapshot.camera;
    state.world.logicOutputs = snapshot.logicOutputs || [];
    if (snapshot.wasRunning) {
      start();
    } else {
      state.world.running = false;
    }
    hideToast();
    render();
    showToast("已恢复清空前的世界");
  }

  function fillRandom() {
    const centerRow = Math.floor(state.world.camera.centerRow);
    const centerColumn = Math.floor(state.world.camera.centerColumn);
    resetWith(
      Life.randomWorld(RANDOM_ROWS, RANDOM_COLUMNS, RANDOM_DENSITY, Math.random, centerRow, centerColumn),
      "已在视图中心生成 25% 密度的随机世界",
    );
  }

  function placementAtCameraCenter(pattern) {
    return {
      pattern,
      row: Math.floor(state.world.camera.centerRow) - Math.floor(pattern.height / 2),
      column: Math.floor(state.world.camera.centerColumn) - Math.floor(pattern.width / 2),
      pointerId: null,
    };
  }

  function replacePlacementPattern(pattern) {
    if (!state.dialogs.placement || !pattern) return;
    const centerRow = state.dialogs.placement.row + (state.dialogs.placement.pattern.height - 1) / 2;
    const centerColumn = state.dialogs.placement.column + (state.dialogs.placement.pattern.width - 1) / 2;
    state.dialogs.placement = {
      pattern,
      row: Math.round(centerRow - (pattern.height - 1) / 2),
      column: Math.round(centerColumn - (pattern.width - 1) / 2),
      pointerId: null,
    };
    render();
  }

  function finishPlacement(message = "已完成图案放置") {
    if (!state.dialogs.placement) return;
    state.dialogs.placement = null;
    render();
    if (message) showToast(message);
  }

  function startPlacement() {
    const { pattern } = Dialog.selectedPattern();
    if (!pattern) return;
    stop();
    state.dialogs.placement = placementAtCameraCenter(pattern);
    render();
    showToast(`正在放置：${pattern.name}。可拖动后松开放置多个。`, { duration: 5000 });
  }

  function setLogicCodeFeedback(message = "", stateName = "") {
    elements.logicCodeFeedback.textContent = message;
    elements.logicCodeFeedback.dataset.state = stateName;
    elements.logicCodeInput.setAttribute("aria-invalid", String(stateName === "error"));
  }

  function setLogicGenerationState(running) {
    elements.logicCodeForm.setAttribute("aria-busy", String(running));
    elements.logicCodeButton.textContent = running ? "取消生成" : "生成结构";
  }

  function logicGenerationProgress(controller, progress) {
    if (state.dialogs.logicGenerationController !== controller || controller.signal.aborted) return;
    const layout = `布局 ${Number(progress.layoutVariant || 0) + 1}`;
    const channel = `通道 ${formatNumber(progress.branchPulseSpacing || 20)}×p30`;
    if (progress.phase === "routing") {
      setLogicCodeFeedback(
        `正在布线（${layout}，${channel}，线路余量 ${progress.routePadding}）…页面仍可操作。`,
        "progress",
      );
      return;
    }
    if (progress.phase === "rejected") {
      setLogicCodeFeedback(
        `${layout}、${channel}、余量 ${progress.routePadding} 在第 ${formatNumber(progress.generation)} 代未通过，正在扩大通道或更换布局…`,
        "progress",
      );
      return;
    }
    setLogicCodeFeedback(
      `正在验证安全线路（${layout}，${channel}，余量 ${progress.routePadding}，第 ${formatNumber(progress.generation)} / ${formatNumber(progress.horizon)} 代）…`,
      "progress",
    );
  }

  async function generateLogicStructure(event) {
    event.preventDefault();
    if (state.dialogs.logicGenerationController) {
      state.dialogs.logicGenerationController.abort();
      setLogicCodeFeedback("正在取消生成…", "progress");
      return;
    }
    const controller = new AbortController();
    state.dialogs.logicGenerationController = controller;
    setLogicGenerationState(true);
    setLogicCodeFeedback("正在解析并准备结构…页面仍可操作。", "progress");
    try {
      const expanded = LogicCode.expandFunctions(elements.logicCodeInput.value, Dialog.callableLogicFunctions());
      const command = LogicCode.parseExpanded(expanded);
      const pattern = await LogicCode.composePatternAsync(
        command, Presets.getPreset, Presets.getLogicGateKit,
        {
          signal: controller.signal,
          onProgress: (progress) => logicGenerationProgress(controller, progress),
        },
      );
      if (!pattern) throw new LogicCode.LogicCodeError("没有找到对应的内置逻辑门结构");
      if (controller.signal.aborted) return;

      stop();
      elements.presetSelect.value = `builtin:${command.presetId}`;
      Dialog.updatePresetDescription();
      state.dialogs.placement = placementAtCameraCenter(pattern);
      const connected = Boolean(pattern.connectionCount);
      setLogicCodeFeedback(
        `${command.expression} → 预期 O=${command.expected}；${connected ? `${pattern.connectionCount} 条滑翔机线路真实级联，` : ""}放置后运行至第 ${pattern.logic.observeGeneration} 代读取最终输出。`,
        "success",
      );
      render();
      showToast(`代码已识别：${command.expression}。请在观察区选择位置。`, { duration: 5000 });
    } catch (error) {
      if (error?.code === "ABORTED") {
        setLogicCodeFeedback("已取消生成；当前世界没有改变。", "");
      } else {
        setLogicCodeFeedback(error.message || "逻辑代码解析失败", "error");
      }
    } finally {
      if (state.dialogs.logicGenerationController === controller) {
        state.dialogs.logicGenerationController = null;
        setLogicGenerationState(false);
      }
    }
  }

  function loadSelectedLogicFunction() {
    const item = Dialog.selectedLogicFunction();
    if (!item) return;
    const values = Object.fromEntries(
      [...elements.logicFunctionInputs.querySelectorAll("select")]
        .map((select) => [select.dataset.inputName, Number(select.value)]),
    );
    elements.logicCodeInput.value = LogicCode.instantiateFunction(item, values);
    Dialog.updateLogicFunctionButtons();
    setLogicCodeFeedback(`已载入“${item.name}”；点击“生成结构”后才会放入观察区。`, "success");
    elements.logicCodeInput.focus();
  }

  function togglePlacement() {
    if (state.dialogs.placement) finishPlacement();
    else startPlacement();
  }

  function transformPlacement(transform) {
    if (!state.dialogs.placement) return;
    replacePlacementPattern(transform(state.dialogs.placement.pattern));
  }

  function closeDialog(dialog) {
    if (dialog.open) dialog.close();
    if (!elements.savePatternDialog.open
      && !elements.managePatternsDialog.open
      && !elements.saveLogicFunctionDialog.open
      && !elements.manageLogicFunctionsDialog.open) {
      document.body.classList.remove("has-dialog");
    }
  }

  function exportWorld() {
    if (Life.countAlive(state.world.cells) === 0) return;
    const contents = JSON.stringify(Life.serialize(state.world.cells, state.world.generation, state.world.camera), null, 2);
    const blob = new Blob([contents], { type: "application/json;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `life-infinite-generation-${state.world.generation}.json`;
    document.body.append(anchor);
    anchor.click();
    anchor.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 0);
    showToast("世界与当前视图已导出");
  }

  async function importWorld(file) {
    if (!file) return;
    if (file.size > MAX_IMPORT_BYTES) {
      showToast("导入失败：文件不能超过 1 MB");
      return;
    }
    try {
      const restored = Life.deserialize(await file.text());
      stop();
      state.dialogs.placement = null;
      state.world.cells = restored.world;
      state.world.generation = restored.generation;
      state.world.logicOutputs = [];
      state.world.camera = RendererModule.createCamera(restored.view);
      state.world.undoSnapshot = null;
      render();
      showToast(restored.migratedFrom === 1 ? "旧版存档已导入并升级" : "世界与视图导入成功");
    } catch (error) {
      showToast(`导入失败：${error.message}`);
    }
  }

  function rememberStrokeCell(row, column) {
    const key = Life.coordinateKey(row, column);
    if (!state.pointer.strokeOriginal.has(key)) {
      state.pointer.strokeOriginal.set(key, Life.isAlive(state.world.cells, row, column));
    }
    return key;
  }

  function paintPointer(event) {
    const coordinate = renderer.coordinateFromPointer(event, state.world.camera);
    const key = Life.coordinateKey(coordinate.row, coordinate.column);
    if (state.pointer.painted.has(key)) return;
    rememberStrokeCell(coordinate.row, coordinate.column);
    state.pointer.painted.add(key);
    Life.setCell(state.world.cells, coordinate.row, coordinate.column, state.pointer.drawAlive);
    state.world.logicOutputs = [];
    state.world.undoSnapshot = null;
    render();
  }

  function updatePlacementFromEvent(event) {
    if (!state.dialogs.placement) return;
    const coordinate = renderer.coordinateFromPointer(event, state.world.camera);
    const row = coordinate.row - Math.floor(state.dialogs.placement.pattern.height / 2);
    const column = coordinate.column - Math.floor(state.dialogs.placement.pattern.width / 2);
    if (row === state.dialogs.placement.row && column === state.dialogs.placement.column) return;
    state.dialogs.placement.row = row;
    state.dialogs.placement.column = column;
    render();
  }

  function beginPlacementDrag(event) {
    if (!state.dialogs.placement) return;
    state.dialogs.placement.pointerId = event.pointerId;
    updatePlacementFromEvent(event);
  }

  function commitPlacement() {
    if (!state.dialogs.placement) return;
    try {
      if (state.world.generation !== 0) state.world.logicOutputs = [];
      state.world.cells = Life.placePattern(
        state.world.cells,
        state.dialogs.placement.pattern.cells,
        state.dialogs.placement.row,
        state.dialogs.placement.column,
        false,
      );
      state.world.generation = 0;
      const logic = state.dialogs.placement.pattern.logic;
      if (logic) {
        state.world.logicOutputs.push({
          row: state.dialogs.placement.row,
          column: state.dialogs.placement.column,
          gate: logic.gate,
          inputs: [...logic.inputs],
          expected: logic.expected,
          observeGeneration: logic.observeGeneration,
          signalCells: logic.signalCells.map((coordinate) => [...coordinate]),
          terminalCells: logic.terminalCells.map((coordinate) => [...coordinate]),
          result: null,
        });
      }
      state.world.undoSnapshot = null;
      render();
      showToast(
        logic
          ? `已放置：${state.dialogs.placement.pattern.name}；第 ${logic.observeGeneration} 代锁存输出`
          : `已放置：${state.dialogs.placement.pattern.name}，可继续放置`,
        { duration: logic ? 4200 : 2400 },
      );
    } catch (error) {
      showToast(error.message);
    }
  }

  function beginDrawing(event) {
    if (state.world.running) {
      showToast("请先暂停，再绘制细胞");
      return;
    }
    const coordinate = renderer.coordinateFromPointer(event, state.world.camera);
    state.pointer.drawingPointerId = event.pointerId;
    state.pointer.drawAlive = !Life.isAlive(state.world.cells, coordinate.row, coordinate.column);
    state.pointer.painted.clear();
    state.pointer.strokeOriginal.clear();
    paintPointer(event);
  }

  function endDrawing(revert = false) {
    if (state.pointer.drawingPointerId === null) return;
    if (revert) {
      for (const [key, alive] of state.pointer.strokeOriginal) {
        const separator = key.indexOf(",");
        const row = Number(key.slice(0, separator));
        const column = Number(key.slice(separator + 1));
        Life.setCell(state.world.cells, row, column, alive);
      }
    }
    state.pointer.drawingPointerId = null;
    state.pointer.painted.clear();
    state.pointer.strokeOriginal.clear();
    if (revert) render();
  }

  function beginPan(event, usesSpace = false) {
    const point = renderer.localPoint(event);
    state.pointer.panGesture = {
      pointerId: event.pointerId,
      lastX: point.x,
      lastY: point.y,
      usesSpace,
    };
    updateCursorClasses();
  }

  function midpoint(left, right) {
    return { x: (left.x + right.x) / 2, y: (left.y + right.y) / 2 };
  }

  function distance(left, right) {
    return Math.hypot(right.x - left.x, right.y - left.y);
  }

  function beginTouchGesture() {
    const entries = [...state.pointer.activePointers.entries()].slice(0, 2);
    if (entries.length < 2) return;
    endDrawing(true);
    if (state.dialogs.placement) state.dialogs.placement.pointerId = null;
    state.pointer.panGesture = null;
    const [left, right] = entries.map(([, point]) => point);
    state.pointer.touchGesture = {
      pointerIds: entries.map(([pointerId]) => pointerId),
      startCamera: RendererModule.createCamera(state.world.camera),
      startMidpoint: midpoint(left, right),
      startDistance: Math.max(1, distance(left, right)),
    };
    updateCursorClasses();
  }

  function handlePointerDown(event) {
    if (![0, 1, 2].includes(event.button) && event.pointerType !== "touch") return;
    event.preventDefault();
    elements.canvas.focus({ preventScroll: true });

    if (state.dialogs.placement && event.pointerType !== "touch" && event.button === 2) {
      finishPlacement();
      return;
    }

    const point = renderer.localPoint(event);
    state.pointer.activePointers.set(event.pointerId, point);
    elements.canvas.setPointerCapture(event.pointerId);

    if (event.pointerType === "touch") {
      if (state.pointer.activePointers.size >= 2) beginTouchGesture();
      else if (state.dialogs.placement) beginPlacementDrag(event);
      else if (state.world.running) beginPan(event);
      else beginDrawing(event);
      return;
    }

    if (event.button === 1 || (!state.dialogs.placement && event.button === 2) || (event.button === 0 && state.pointer.spaceDown)) {
      beginPan(event, event.button === 0 && state.pointer.spaceDown);
    } else if (event.button === 0 && state.dialogs.placement) {
      beginPlacementDrag(event);
    } else if (event.button === 0) {
      beginDrawing(event);
    }
  }

  function updateTouchGesture() {
    const gesture = state.pointer.touchGesture;
    if (!gesture) return;
    const left = state.pointer.activePointers.get(gesture.pointerIds[0]);
    const right = state.pointer.activePointers.get(gesture.pointerIds[1]);
    if (!left || !right) return;
    const currentMidpoint = midpoint(left, right);
    const factor = Math.max(0.01, distance(left, right) / gesture.startDistance);
    const zoomed = RendererModule.zoomCameraAt(
      gesture.startCamera,
      gesture.startMidpoint,
      renderer.viewport(),
      factor,
    );
    state.world.camera = RendererModule.panCamera(
      zoomed,
      currentMidpoint.x - gesture.startMidpoint.x,
      currentMidpoint.y - gesture.startMidpoint.y,
    );
    render();
  }

  function handlePointerMove(event) {
    if (!state.pointer.activePointers.has(event.pointerId)) {
      if (state.dialogs.placement && event.pointerType !== "touch") updatePlacementFromEvent(event);
      return;
    }
    event.preventDefault();
    const point = renderer.localPoint(event);
    state.pointer.activePointers.set(event.pointerId, point);

    if (state.pointer.touchGesture) {
      updateTouchGesture();
      return;
    }

    if (state.pointer.panGesture?.pointerId === event.pointerId) {
      const deltaX = point.x - state.pointer.panGesture.lastX;
      const deltaY = point.y - state.pointer.panGesture.lastY;
      if (state.pointer.panGesture.usesSpace && Math.hypot(deltaX, deltaY) >= 2) state.pointer.spaceDragged = true;
      state.world.camera = RendererModule.panCamera(state.world.camera, deltaX, deltaY);
      state.pointer.panGesture.lastX = point.x;
      state.pointer.panGesture.lastY = point.y;
      render();
      return;
    }

    if (state.dialogs.placement?.pointerId === event.pointerId) {
      updatePlacementFromEvent(event);
      return;
    }

    if (state.pointer.drawingPointerId === event.pointerId) paintPointer(event);
  }

  function releasePointer(event, cancelled = false) {
    const wasTouchGesture = state.pointer.touchGesture?.pointerIds.includes(event.pointerId);
    const wasPlacement = state.dialogs.placement?.pointerId === event.pointerId;
    state.pointer.activePointers.delete(event.pointerId);
    if (wasTouchGesture) state.pointer.touchGesture = null;
    if (state.pointer.panGesture?.pointerId === event.pointerId) state.pointer.panGesture = null;
    if (state.pointer.drawingPointerId === event.pointerId) endDrawing(cancelled);
    if (wasPlacement && state.dialogs.placement) {
      state.dialogs.placement.pointerId = null;
      if (!cancelled) commitPlacement();
      else render();
    }
    if (elements.canvas.hasPointerCapture(event.pointerId)) elements.canvas.releasePointerCapture(event.pointerId);
    updateCursorClasses();
  }

  function zoomAtCenter(factor) {
    const viewport = renderer.viewport();
    state.world.camera = RendererModule.zoomCameraAt(
      state.world.camera,
      { x: viewport.width / 2, y: viewport.height / 2 },
      viewport,
      factor,
    );
    render();
  }

  function handleWheel(event) {
    event.preventDefault();
    const factor = Math.exp(-event.deltaY * 0.0015);
    state.world.camera = renderer.zoomAtPointer(event, state.world.camera, factor);
    render();
  }

  function ignoresGlobalShortcut() {
    return ["INPUT", "SELECT", "TEXTAREA"].includes(document.activeElement?.tagName);
  }

  function handleKeyDown(event) {
    if (ignoresGlobalShortcut()) return;
    if (document.activeElement?.tagName === "BUTTON" && event.code === "Space") return;
    if (state.dialogs.placement && event.key === "Escape") {
      event.preventDefault();
      finishPlacement();
    } else if (state.dialogs.placement && event.key.toLowerCase() === "r") {
      event.preventDefault();
      transformPlacement(Presets.rotatePattern);
    } else if (state.dialogs.placement && event.key.toLowerCase() === "f") {
      event.preventDefault();
      transformPlacement(Presets.flipPattern);
    } else if (event.code === "Space") {
      event.preventDefault();
      if (event.repeat) return;
      state.pointer.spaceDown = true;
      state.pointer.spaceDragged = false;
      updateCursorClasses();
    } else if (event.code === "ArrowRight") {
      event.preventDefault();
      if (!state.world.running) advance();
    } else if (event.key.toLowerCase() === "c") {
      event.preventDefault();
      clearWorld();
    } else if (event.code === "Digit0" || event.code === "Numpad0") {
      event.preventDefault();
      fitView();
    }
  }

  function handleKeyUp(event) {
    if (event.code !== "Space" || !state.pointer.spaceDown) return;
    event.preventDefault();
    state.pointer.spaceDown = false;
    const shouldToggle = !state.pointer.spaceDragged && !state.pointer.panGesture && !state.dialogs.placement;
    updateCursorClasses();
    if (shouldToggle) toggleRun();
  }

  elements.run.addEventListener("click", toggleRun);
  elements.step.addEventListener("click", advance);
  elements.clear.addEventListener("click", clearWorld);
  elements.random.addEventListener("click", fillRandom);
  elements.undo.addEventListener("click", undoClear);
  elements.presetSelect.addEventListener("change", Dialog.updatePresetDescription);
  elements.loadPreset.addEventListener("click", togglePlacement);
  elements.logicCodeForm.addEventListener("submit", generateLogicStructure);
  elements.logicCodeInput.addEventListener("input", () => {
    if (elements.logicCodeFeedback.dataset.state === "error") setLogicCodeFeedback();
    Dialog.updateLogicFunctionButtons();
  });
  elements.loadLogicFunction.addEventListener("click", loadSelectedLogicFunction);
  elements.logicFunctionSelect.addEventListener("change", Dialog.renderLogicFunctionInputs);
  elements.saveLogicFunction.addEventListener("click", Dialog.openSaveLogicFunctionDialog);
  elements.manageLogicFunctions.addEventListener("click", Dialog.openManageLogicFunctionsDialog);
  elements.saveLogicFunctionForm.addEventListener("submit", Dialog.saveNewLogicFunction);
  elements.closeSaveLogicFunction.addEventListener("click", () => closeDialog(elements.saveLogicFunctionDialog));
  elements.cancelSaveLogicFunction.addEventListener("click", () => closeDialog(elements.saveLogicFunctionDialog));
  elements.manageLogicFunctionsForm.addEventListener("submit", Dialog.saveManagedLogicFunction);
  elements.manageLogicFunctionSelect.addEventListener("change", Dialog.fillManageLogicFunctionForm);
  elements.manageLogicFunctionName.addEventListener("input", Dialog.resetFunctionDeleteConfirmation);
  elements.manageLogicFunctionCode.addEventListener("input", Dialog.resetFunctionDeleteConfirmation);
  elements.deleteLogicFunction.addEventListener("click", Dialog.deleteManagedLogicFunction);
  elements.closeManageLogicFunctions.addEventListener("click", () => closeDialog(elements.manageLogicFunctionsDialog));
  elements.cancelManageLogicFunctions.addEventListener("click", () => closeDialog(elements.manageLogicFunctionsDialog));
  elements.rotatePattern.addEventListener("click", () => transformPlacement(Presets.rotatePattern));
  elements.flipPattern.addEventListener("click", () => transformPlacement(Presets.flipPattern));
  elements.savePattern.addEventListener("click", Dialog.openSavePatternDialog);
  elements.managePatterns.addEventListener("click", Dialog.openManagePatternsDialog);
  elements.savePatternForm.addEventListener("submit", Dialog.saveNewPattern);
  elements.updateExistingPattern.addEventListener("click", Dialog.updateExistingPattern);
  elements.savePatternName.addEventListener("input", Dialog.resetDuplicateChoice);
  elements.closeSavePattern.addEventListener("click", () => closeDialog(elements.savePatternDialog));
  elements.cancelSavePattern.addEventListener("click", () => closeDialog(elements.savePatternDialog));
  elements.managePatternsForm.addEventListener("submit", Dialog.saveManagedPattern);
  elements.managePatternSelect.addEventListener("change", Dialog.fillManageForm);
  elements.managePatternName.addEventListener("input", Dialog.resetDeleteConfirmation);
  elements.managePatternDescription.addEventListener("input", Dialog.resetDeleteConfirmation);
  elements.deletePattern.addEventListener("click", Dialog.deleteManagedPattern);
  elements.closeManagePatterns.addEventListener("click", () => closeDialog(elements.managePatternsDialog));
  elements.cancelManagePatterns.addEventListener("click", () => closeDialog(elements.managePatternsDialog));
  for (const dialog of [
    elements.savePatternDialog,
    elements.managePatternsDialog,
    elements.saveLogicFunctionDialog,
    elements.manageLogicFunctionsDialog,
  ]) {
    dialog.addEventListener("close", () => {
      if (!elements.savePatternDialog.open
        && !elements.managePatternsDialog.open
        && !elements.saveLogicFunctionDialog.open
        && !elements.manageLogicFunctionsDialog.open) {
        document.body.classList.remove("has-dialog");
      }
    });
  }
  elements.fitView.addEventListener("click", fitView);
  elements.zoomIn.addEventListener("click", () => zoomAtCenter(ZOOM_STEP));
  elements.zoomOut.addEventListener("click", () => zoomAtCenter(1 / ZOOM_STEP));
  elements.export.addEventListener("click", exportWorld);
  elements.importButton.addEventListener("click", () => elements.importInput.click());
  elements.importInput.addEventListener("change", async () => {
    await importWorld(elements.importInput.files?.[0]);
    elements.importInput.value = "";
  });
  function applySpeedInput(normalizeField = false) {
    if (!normalizeField && !SpeedControl.isValidInput(elements.speed.value)) return;
    const nextSpeed = SpeedControl.normalize(elements.speed.value, state.world.speed);
    if (normalizeField) elements.speed.value = String(nextSpeed);
    if (nextSpeed === state.world.speed) return;
    state.world.speed = nextSpeed;
    resetAnimationPacing();
  }

  elements.speed.addEventListener("input", () => applySpeedInput(false));
  elements.speed.addEventListener("change", () => applySpeedInput(true));
  elements.speed.addEventListener("blur", () => applySpeedInput(true));
  elements.canvas.addEventListener("pointerdown", handlePointerDown);
  elements.canvas.addEventListener("pointermove", handlePointerMove);
  elements.canvas.addEventListener("pointerup", (event) => releasePointer(event));
  elements.canvas.addEventListener("pointercancel", (event) => releasePointer(event, true));
  elements.canvas.addEventListener("contextmenu", (event) => event.preventDefault());
  elements.canvas.addEventListener("wheel", handleWheel, { passive: false });
  document.addEventListener("keydown", handleKeyDown);
  document.addEventListener("keyup", handleKeyUp);
  window.addEventListener("blur", () => {
    state.pointer.spaceDown = false;
    state.pointer.spaceDragged = false;
    updateCursorClasses();
  });
  document.addEventListener("visibilitychange", () => {
    if (document.hidden && state.world.running) stop({ message: "页面隐藏，已自动暂停" });
  });

  Dialog.initializePatternLibrary();
  Dialog.initializeLogicFunctionLibrary();
  render();
})();
