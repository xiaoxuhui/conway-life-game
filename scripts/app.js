(function startApplication() {
  "use strict";

  const Life = window.LifeEngine;
  const Tiles = window.LifeTiles;
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
  const TAB_HOLD_MS = 350;

  const elements = {
    ruleForm: document.querySelector("#ruleForm"),
    ruleInput: document.querySelector("#ruleInput"),
    ruleNotation: document.querySelector("#ruleNotationSelect"),
    ruleError: document.querySelector("#ruleError"),
    ruleNotice: document.querySelector("#ruleNotice"),
    resetRule: document.querySelector("#resetRuleButton"),
    activeRule: document.querySelector("#activeRule"),
    ruleBirth: document.querySelector("#ruleBirth"),
    ruleSurvival: document.querySelector("#ruleSurvival"),
    actualSpeed: document.querySelector("#actualSpeedValue"),
    alive: document.querySelector("#aliveValue"),
    boardHint: document.querySelector("#boardHint"),
    canvas: document.querySelector("#lifeCanvas"),
    clear: document.querySelector("#clearButton"),
    export: document.querySelector("#exportButton"),
    exportDeleteAllRecords: document.querySelector("#exportDeleteAllRecordsButton"),
    exportAllRecordsDialog: document.querySelector("#exportAllRecordsDialog"),
    exportAllRecordsProgress: document.querySelector("#exportAllRecordsProgress"),
    exportAllRecordsError: document.querySelector("#exportAllRecordsError"),
    importAllRecords: document.querySelector("#importAllRecordsButton"),
    importAllRecordsInput: document.querySelector("#importAllRecordsInput"),
    importAllRecordsDialog: document.querySelector("#importAllRecordsDialog"),
    importAllRecordsForm: document.querySelector("#importAllRecordsForm"),
    importAllRecordsSummary: document.querySelector("#importAllRecordsSummary"),
    importAllRecordsError: document.querySelector("#importAllRecordsError"),
    confirmImportAllRecords: document.querySelector("#confirmImportAllRecordsButton"),
    cancelImportAllRecords: document.querySelector("#cancelImportAllRecordsButton"),
    closeImportAllRecords: document.querySelector("#closeImportAllRecordsButton"),
    fitView: document.querySelector("#fitViewButton"),
    generation: document.querySelector("#generationValue"),
    cycleReadout: document.querySelector("#cycleReadout"),
    cyclePeriod: document.querySelector("#cyclePeriodValue"),
    pruneGliders: document.querySelector("#pruneGliders"),
    importButton: document.querySelector("#importButton"),
    importInput: document.querySelector("#importInput"),
    importGollyButton: document.querySelector("#importGollyButton"),
    importGollyInput: document.querySelector("#importGollyInput"),
    loadPreset: document.querySelector("#loadPresetButton"),
    logicCodeButton: document.querySelector("#logicCodeButton"),
    logicCodeFeedback: document.querySelector("#logicCodeFeedback"),
    logicCodeForm: document.querySelector("#logicCodeForm"),
    logicCodeInput: document.querySelector("#logicCodeInput"),
    verifyLogicSafety: document.querySelector("#verifyLogicSafety"),
    logicFunctionSelect: document.querySelector("#logicFunctionSelect"),
    logicFunctionInputs: document.querySelector("#logicFunctionInputs"),
    loadLogicFunction: document.querySelector("#loadLogicFunctionButton"),
    saveLogicFunction: document.querySelector("#saveLogicFunctionButton"),
    manageLogicFunctions: document.querySelector("#manageLogicFunctionsButton"),
    exportLogicFunctions: document.querySelector("#exportLogicFunctionsButton"),
    importLogicFunctions: document.querySelector("#importLogicFunctionsButton"),
    importLogicFunctionsInput: document.querySelector("#importLogicFunctionsInput"),
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
    exportDeleteLogicFunction: document.querySelector("#exportDeleteLogicFunctionButton"),
    importLogicFunctionsDialog: document.querySelector("#importLogicFunctionsDialog"),
    importLogicFunctionsForm: document.querySelector("#importLogicFunctionsForm"),
    importLogicFunctionsSummary: document.querySelector("#importLogicFunctionsSummary"),
    importLogicFunctionsError: document.querySelector("#importLogicFunctionsError"),
    confirmImportLogicFunctions: document.querySelector("#confirmImportLogicFunctionsButton"),
    closeImportLogicFunctions: document.querySelector("#closeImportLogicFunctionsButton"),
    cancelImportLogicFunctions: document.querySelector("#cancelImportLogicFunctionsButton"),
    managePatternDescription: document.querySelector("#managePatternDescriptionInput"),
    managePatternError: document.querySelector("#managePatternError"),
    managePatternMeta: document.querySelector("#managePatternMeta"),
    managePatternName: document.querySelector("#managePatternNameInput"),
    managePatterns: document.querySelector("#managePatternsButton"),
    exportPatterns: document.querySelector("#exportPatternsButton"),
    importPatterns: document.querySelector("#importPatternsButton"),
    importPatternsInput: document.querySelector("#importPatternsInput"),
    importPatternsDialog: document.querySelector("#importPatternsDialog"),
    importPatternsForm: document.querySelector("#importPatternsForm"),
    importPatternsSummary: document.querySelector("#importPatternsSummary"),
    importPatternsError: document.querySelector("#importPatternsError"),
    confirmImportPatterns: document.querySelector("#confirmImportPatternsButton"),
    closeImportPatterns: document.querySelector("#closeImportPatternsButton"),
    cancelImportPatterns: document.querySelector("#cancelImportPatternsButton"),
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
    jumpSize: document.querySelector("#jumpSizeInput"),
    toast: document.querySelector("#toast"),
    toastMessage: document.querySelector("#toastMessage"),
    undo: document.querySelector("#undoButton"),
    updateExistingPattern: document.querySelector("#updateExistingPatternButton"),
    worldPosition: document.querySelector("#worldPosition"),
    zoomIn: document.querySelector("#zoomInButton"),
    zoomOut: document.querySelector("#zoomOutButton"),
    zoomValue: document.querySelector("#zoomValue"),
    cancelManagePatterns: document.querySelector("#cancelManagePatternsButton"),
    cancelSavePattern: document.querySelector("#cancelSavePatternButton"),
    closeManagePatterns: document.querySelector("#closeManagePatternsButton"),
    closeSavePattern: document.querySelector("#closeSavePatternButton"),
    deletePattern: document.querySelector("#deletePatternButton"),
    exportDeletePattern: document.querySelector("#exportDeletePatternButton"),
    patternPreview: document.querySelector("#patternPreview"),
  };

  const renderer = RendererModule.create(elements.canvas);
  const cycleTracker = Life.createCycleTracker({ describeWorld: Tiles.describeWorld, sameWorld: Tiles.sameWorld });
  let displayedFrame;
  let tabHoldTimer = null;
  let runningFromTab = false;
  let pendingPlacement = null;
  // 状态按职责分为 world（演化/视图）/ pointer（指针与手势）/ dialogs（对话框与瞬时 UI 模式）/ storage（持久化库）四个子对象，
  // 便于维护；所有访问点已同步改为 state.<group>.<field>，行为与原扁平结构完全一致。
  const state = {
    world: {
      rule: Life.DEFAULT_RULE,
      cells: Life.createWorld(),
      generation: 0,
      running: false,
      pruneGliders: false,
      speed: SpeedControl.DEFAULT_SPEED,
      jumpSize: 1,
      jumpProgress: 0,
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
      logicFunctionImportDraft: null,
      duplicatePatternId: null,
      patternImportDraft: null,
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
    RecordImport: window.LifeRecordImport,
    FileBackup: window.LifeFileBackup,
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

  function logicAnnotations(generation) {
    return state.world.logicOutputs.map((output) => ({
      observeGeneration: output.observeGeneration,
      result: generation < output.observeGeneration ? null : output.result,
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

  function logicOutputSummary(generation) {
    if (state.world.logicOutputs.length === 0) return "";
    return state.world.logicOutputs
      .map((output) => generation < output.observeGeneration || output.result === null
        ? `O=?（第 ${output.observeGeneration} 代读取）`
        : `O=${output.result}`)
      .join("；");
  }

  function renderEvolutionReadouts() {
    const period = cycleTracker.period;
    elements.cycleReadout.hidden = period === null;
    const periodText = period === null ? "" : `${formatNumber(period)} 代`;
    if (elements.cyclePeriod.textContent !== periodText) elements.cyclePeriod.textContent = periodText;
    elements.actualSpeed.textContent = `${formatNumber(state.world.actualSpeed)}/s`;
  }

  function render(cells = state.world.cells, generation = state.world.generation) {
    displayedFrame = { cells, generation };
    const rule = Life.parseRule(state.world.rule);
    elements.pruneGliders.disabled = rule.canonical !== Life.DEFAULT_RULE;
    elements.pruneGliders.checked = state.world.pruneGliders;
    elements.activeRule.textContent = Life.formatRule(state.world.rule, elements.ruleNotation.value);
    elements.ruleBirth.textContent = [...rule.birth].join("、") || "无";
    elements.ruleSurvival.textContent = [...rule.survival].join("、") || "无";
    elements.ruleNotice.textContent = state.world.rule === Life.DEFAULT_RULE
      ? "当前为康威规则，逻辑电路可正常验证。"
      : "当前为自定义规则：内置图案的行为可能改变；逻辑电路仅适用于 B3/S23，已停用生成与输出锁存。";
    elements.logicCodeButton.disabled = state.world.rule !== Life.DEFAULT_RULE && !state.dialogs.logicGenerationController;
    const alive = Tiles.describeWorld(cells)?.population ?? Life.countAlive(cells);
    const logicSummary = logicOutputSummary(generation);
    renderer.draw(cells, state.world.camera, state.world.running, state.dialogs.placement, logicAnnotations(generation));
    elements.generation.textContent = formatNumber(generation);
    elements.alive.textContent = formatNumber(alive);
    renderEvolutionReadouts();
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
    elements.exportPatterns.disabled = state.storage.patternLibrary.patterns.length === 0;
    elements.exportDeleteAllRecords.disabled = elements.exportAllRecordsDialog.open
      || elements.importAllRecordsDialog.open
      || state.storage.patternLibrary.patterns.length + state.storage.logicFunctionLibrary.functions.length === 0;
    elements.importAllRecords.disabled = elements.exportAllRecordsDialog.open || elements.importAllRecordsDialog.open;
    elements.loadPreset.textContent = state.dialogs.placement ? "完成" : "放置";
    elements.loadPreset.setAttribute("aria-pressed", String(Boolean(state.dialogs.placement)));
    elements.rotatePattern.disabled = !state.dialogs.placement;
    elements.flipPattern.disabled = !state.dialogs.placement;
    elements.canvas.setAttribute(
      "aria-label",
      `无限大的康威生命游戏世界；规则 ${state.world.rule}；视图中心列 ${formatCoordinate(state.world.camera.centerColumn)}、行 ${formatCoordinate(state.world.camera.centerRow)}；第 ${generation} 代，${alive} 个活细胞，${state.dialogs.placement ? `正在放置${state.dialogs.placement.pattern.name}` : state.world.running ? "正在运行" : "已暂停"}${logicSummary ? `；逻辑输出：${logicSummary}` : ""}。`,
    );
    elements.boardHint.textContent = state.dialogs.placement
      ? "拖动预览，松开或单击放置；R 旋转 · F 翻转 · Esc 完成。"
      : logicSummary
        ? `方框中的 2×2 方块是静物输出端；${logicSummary}。`
      : state.world.running
        ? "正在演化；仍可拖动和缩放，暂停后可继续绘制。"
        : "左键绘制；中键、右键或按住空格拖动；滚轮缩放。";
    elements.worldPosition.textContent = `WORLD ∞ · CENTER ${formatCoordinate(state.world.camera.centerColumn)}, ${formatCoordinate(state.world.camera.centerRow)}`;
    document.body.classList.toggle("is-running", state.world.running);
    document.body.classList.toggle("is-placing", Boolean(state.dialogs.placement));
    updateCursorClasses();
  }

  function viewFrame() {
    return state.world.running ? displayedFrame : state.world;
  }

  function redrawView() {
    const { cells, generation } = viewFrame();
    render(cells, generation);
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
    cycleTracker.observe(state.world.cells, state.world.generation);
    const tiled = state.world.running && state.world.rule === Life.DEFAULT_RULE
      ? Tiles.nextGeneration(state.world.cells)
      : null;
    state.world.cells = tiled ?? Life.nextGeneration(state.world.cells, state.world.rule);
    if (state.world.pruneGliders && state.world.rule === Life.DEFAULT_RULE) {
      state.world.cells = Tiles.pruneOutlyingGliders(state.world.cells) ?? Life.pruneOutlyingGliders(state.world.cells);
    }
    state.world.generation += 1;
    cycleTracker.observe(state.world.cells, state.world.generation);
    updateLogicOutputs();
  }

  function advance() {
    evolveOneGeneration();
    render();
  }

  function advanceFrameGenerations() {
    if (cycleTracker.period !== null) {
      const { cells, generation, frameAccumulator, jumpSize, jumpProgress, logicOutputs } = state.world;
      let limit = Math.floor(frameAccumulator);
      if (jumpSize > 1) limit = Math.min(limit, jumpSize - jumpProgress);
      for (const output of logicOutputs) {
        if (output.result === null) limit = Math.min(limit, Math.max(1, output.observeGeneration - generation));
      }
      const forwarded = cycleTracker.fastForward(cells, generation, limit);
      if (forwarded) {
        state.world.cells = forwarded.world;
        state.world.generation += forwarded.generations;
        updateLogicOutputs();
        return forwarded.generations;
      }
    }
    evolveOneGeneration();
    return 1;
  }

  function runAnimationFrame(timestamp) {
    if (!state.world.running) return;
    let cellsToRender;
    let generationToRender;
    const previousPeriod = cycleTracker.period;
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
        const generations = advanceFrameGenerations();
        state.world.frameAccumulator -= generations;
        state.world.speedWindowGenerations += generations;
        state.world.jumpProgress += generations;
        if (state.world.jumpProgress >= state.world.jumpSize) {
          state.world.jumpProgress = 0;
          cellsToRender = state.world.cells;
          generationToRender = state.world.generation;
        }
        if (performance.now() - computeStarted >= SpeedControl.FRAME_COMPUTE_BUDGET_MS) break;
      }
    }

    const windowElapsed = timestamp - state.world.speedWindowStarted;
    const updateSpeed = windowElapsed >= SpeedControl.ACTUAL_SPEED_WINDOW_MS;
    if (updateSpeed) {
      state.world.actualSpeed = Math.round(state.world.speedWindowGenerations * 1000 / windowElapsed);
      state.world.speedWindowStarted = timestamp;
      state.world.speedWindowGenerations = 0;
    }
    if (cellsToRender) render(cellsToRender, generationToRender);
    else if (updateSpeed || cycleTracker.period !== previousPeriod) renderEvolutionReadouts();
    state.world.animationFrame = window.requestAnimationFrame(runAnimationFrame);
  }

  function clearTabHold() {
    if (tabHoldTimer !== null) window.clearTimeout(tabHoldTimer);
    tabHoldTimer = null;
    runningFromTab = false;
  }

  function endTabHold(stepOnTap = false) {
    if (runningFromTab) {
      stop();
    } else if (tabHoldTimer !== null) {
      clearTabHold();
      if (stepOnTap) advance();
    }
  }

  function stop(options = {}) {
    clearTabHold();
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
    clearTabHold();
    endDrawing();
    state.dialogs.placement = null;
    if (state.world.rule === Life.DEFAULT_RULE) {
      state.world.cells = Tiles.prepare(state.world.cells);
    }
    state.world.running = true;
    state.world.jumpProgress = 0;
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
    state.world.camera = renderer.fit(Life.bounds(viewFrame().cells));
    redrawView();
  }

  function resetWith(world, message, shouldFit = true) {
    stop();
    cycleTracker.reset();
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
    cycleTracker.reset();
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
    cycleTracker.reset();
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
    elements.verifyLogicSafety.disabled = running;
    elements.logicCodeButton.disabled = !running && state.world.rule !== Life.DEFAULT_RULE;
  }

  function clearRuleError() {
    elements.ruleError.textContent = "";
    elements.ruleError.hidden = true;
    elements.ruleInput.setAttribute("aria-invalid", "false");
  }

  function syncRuleDraft() {
    elements.ruleInput.value = Life.formatRule(state.world.rule, elements.ruleNotation.value);
    clearRuleError();
  }

  function showRuleError(error) {
    elements.ruleError.textContent = error.message;
    elements.ruleError.hidden = false;
    elements.ruleInput.setAttribute("aria-invalid", "true");
  }

  function cancelLogicForRuleChange() {
    const controller = state.dialogs.logicGenerationController;
    state.dialogs.logicGenerationController = null;
    if (controller) controller.abort();
    setLogicGenerationState(false);
    setLogicCodeFeedback();
    state.dialogs.placement = null;
    state.world.logicOutputs = [];
    state.world.undoSnapshot = null;
  }

  function applyRule(event) {
    event.preventDefault();
    let rule;
    try { rule = Life.parseRule(elements.ruleInput.value); }
    catch (error) { showRuleError(error); return; }
    stop();
    if (state.world.rule !== rule.canonical) cycleTracker.reset();
    state.world.rule = rule.canonical;
    cancelLogicForRuleChange();
    syncRuleDraft();
    render();
    showToast(`已应用 ${rule.canonical}，演化已暂停，当前细胞与代数已保留。`);
  }

  function changeRuleNotation() {
    try {
      elements.ruleInput.value = Life.formatRule(elements.ruleInput.value, elements.ruleNotation.value);
      clearRuleError();
    } catch (error) { showRuleError(error); }
    render();
  }

  function logicGenerationProgress(controller, progress) {
    if (state.dialogs.logicGenerationController !== controller || controller.signal.aborted) return;
    if (progress.layoutMode === "axial-chain") {
      const route = progress.routeStage === "reflected" ? "反射路线" : "直连路线";
      const gates = `${formatNumber(progress.gateCount)} 个门`;
      const generation = Number.isFinite(progress.generation)
        ? `，第 ${formatNumber(progress.generation)} / ${formatNumber(progress.horizon)} 代`
        : "";
      const action = progress.phase === "routing" ? "正在同排布线"
        : progress.phase === "rejected" ? "此路线未通过，正在换一条" : "正在验证同排线路";
      setLogicCodeFeedback(`${action}（${gates}，${route}${generation}）…`, "progress");
      return;
    }
    if (progress.routeStage === "reflected") {
      const edge = progress.reflectedEdgePath
        ? `连接 ${progress.reflectedEdgePath}（${formatNumber((progress.edgeIndex || 0) + 1)} / ${formatNumber(progress.edgeCount || 1)}）`
        : "同轴连接";
      const generation = Number.isFinite(progress.generation)
        ? `，第 ${formatNumber(progress.generation)} / ${formatNumber(progress.horizon)} 代`
        : "";
      setLogicCodeFeedback(
        `正常线路均未通过，正在验证${edge}的双反射后备${generation}…页面仍可操作。`,
        "progress",
      );
      return;
    }
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
    if (state.world.rule !== Life.DEFAULT_RULE) {
      setLogicCodeFeedback("逻辑电路只适用于 B3/S23，请先恢复康威规则。", "error");
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
        command, Presets.getPreset, Presets.getLogicGateKit, Presets.getLogicReflectorKit,
        {
          signal: controller.signal,
          verifySafety: elements.verifyLogicSafety.checked,
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
      const chainSummary = pattern.routing?.mode === "axial-chain"
        ? `${pattern.gateAnchors.length} 个独立门体同排放置，`
        : "";
      const connectionSummary = connected ? `${pattern.connectionCount} 条滑翔机线路，` : "";
      const verificationNote = connected && !pattern.gunSafety ? "线路未经安全验证，" : "";
      setLogicCodeFeedback(
        `${command.expression} → 预期 O=${command.expected}。${chainSummary}${connectionSummary}${verificationNote}放置后运行至第 ${pattern.logic.observeGeneration} 代读取最终输出。`,
        "success",
      );
      render();
      showToast(`代码已识别：${command.expression}。请在观察区选择位置。`, { duration: 5000 });
    } catch (error) {
      if (state.dialogs.logicGenerationController !== controller) return;
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

  function transformPlacement(operation) {
    const placement = state.dialogs.placement;
    if (!placement || placement === pendingPlacement) return;
    const { pattern } = placement;
    const transform = operation === "rotate" ? Presets.rotatePattern : Presets.flipPattern;
    replacePlacementPattern(pattern[operation]?.() ?? transform(pattern));
  }

  function closeDialog(dialog) {
    if (dialog.open) dialog.close();
    if (!elements.exportAllRecordsDialog.open
      && !elements.importAllRecordsDialog.open
      && !elements.savePatternDialog.open
      && !elements.managePatternsDialog.open
      && !elements.saveLogicFunctionDialog.open
      && !elements.manageLogicFunctionsDialog.open) {
      document.body.classList.remove("has-dialog");
    }
  }

  function exportWorld() {
    if (Life.countAlive(state.world.cells) === 0) return;
    const contents = JSON.stringify(Life.serialize(state.world.cells, state.world.generation, state.world.camera, state.world.rule), null, 2);
    const blob = new Blob([contents], { type: "application/json;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `life-infinite-generation-${state.world.generation}.json`;
    document.body.append(anchor);
    anchor.click();
    anchor.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 0);
    showToast("世界、规则与当前视图已导出");
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
      cycleTracker.reset();
      state.world.rule = restored.rule;
      cancelLogicForRuleChange();
      syncRuleDraft();
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

  async function importGollyPattern(file) {
    if (!file) return;
    elements.importGollyButton.disabled = true;
    try {
      const pattern = await window.GollyImport.readFile(file);
      if (pattern.rule && pattern.rule !== state.world.rule) {
        throw new Error(`图案使用 ${pattern.rule}，请先切换棋盘规则再导入`);
      }
      if (state.dialogs.logicGenerationController) throw new Error("请先完成或取消正在生成的逻辑结构");
      state.dialogs.placement = placementAtCameraCenter(pattern);
      stop();
      showToast(`已读取 ${pattern.name}（${formatNumber(pattern.cellCount)} 个活细胞），请在观察区选择放置位置。`, { duration: 5000 });
    } catch (error) {
      showToast(`Golly 图案导入失败。${error.message}`, { duration: 5000 });
    } finally {
      elements.importGollyButton.disabled = false;
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
    if (state.pointer.strokeOriginal.get(key) !== state.pointer.drawAlive) cycleTracker.reset();
    Life.setCell(state.world.cells, coordinate.row, coordinate.column, state.pointer.drawAlive);
    state.world.logicOutputs = [];
    state.world.undoSnapshot = null;
    render();
  }

  function updatePlacementFromEvent(event) {
    if (!state.dialogs.placement || state.dialogs.placement === pendingPlacement) return;
    const coordinate = renderer.coordinateFromPointer(event, state.world.camera);
    const row = coordinate.row - Math.floor(state.dialogs.placement.pattern.height / 2);
    const column = coordinate.column - Math.floor(state.dialogs.placement.pattern.width / 2);
    if (row === state.dialogs.placement.row && column === state.dialogs.placement.column) return;
    state.dialogs.placement.row = row;
    state.dialogs.placement.column = column;
    render();
  }

  function beginPlacementDrag(event) {
    if (!state.dialogs.placement || state.dialogs.placement === pendingPlacement) return;
    state.dialogs.placement.pointerId = event.pointerId;
    updatePlacementFromEvent(event);
  }

  async function commitPlacement() {
    const placement = state.dialogs.placement;
    if (!placement || pendingPlacement) return;
    const { pattern, row, column } = placement;
    const originalWorld = state.world.cells;
    const isCurrent = () => state.dialogs.placement === placement && state.world.cells === originalWorld;
    try {
      let placed;
      if (pattern.cellsIn) {
        pendingPlacement = placement;
        elements.canvas.setAttribute("aria-busy", "true");
        showToast("正在放置图案，按 Esc 可取消。", { duration: 10000 });
        placed = await window.GollyImport.placePattern(originalWorld, pattern, row, column, isCurrent);
        if (!placed || !isCurrent()) return;
      } else {
        placed = Life.placePattern(originalWorld, pattern.cells, row, column, false);
      }
      if (state.world.generation !== 0) state.world.logicOutputs = [];
      state.world.cells = placed;
      cycleTracker.reset();
      state.world.generation = 0;
      const logic = state.world.rule === Life.DEFAULT_RULE ? pattern.logic : null;
      if (logic) {
        state.world.logicOutputs.push({
          row,
          column,
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
          ? `已放置：${pattern.name}；第 ${logic.observeGeneration} 代锁存输出`
          : `已放置：${pattern.name}，可继续放置`,
        { duration: logic ? 4200 : 2400 },
      );
    } catch (error) {
      if (isCurrent()) showToast(error.message);
    } finally {
      if (pendingPlacement === placement) {
        pendingPlacement = null;
        elements.canvas.removeAttribute("aria-busy");
      }
    }
  }

  function beginDrawing(event) {
    if (state.world.running) {
      showToast("请先暂停，再绘制细胞");
      return;
    }
    state.world.cells = Tiles.editableWorld(state.world.cells);
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
      cycleTracker.reset();
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

  function focusBoard() {
    elements.canvas.focus({ preventScroll: true });
  }

  function focusBoardAfterClick(event) {
    if (event.detail > 0) focusBoard();
  }

  function handlePointerDown(event) {
    if (![0, 1, 2].includes(event.button) && event.pointerType !== "touch") return;
    event.preventDefault();
    focusBoard();

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
    redrawView();
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
      redrawView();
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
      if (!cancelled) void commitPlacement();
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
    redrawView();
  }

  function handleWheel(event) {
    event.preventDefault();
    const factor = Math.exp(-event.deltaY * 0.0015);
    state.world.camera = renderer.zoomAtPointer(event, state.world.camera, factor);
    redrawView();
  }

  function ignoresGlobalShortcut() {
    return ["INPUT", "SELECT", "TEXTAREA"].includes(document.activeElement?.tagName);
  }

  function handleKeyDown(event) {
    if (ignoresGlobalShortcut()) return;
    if (document.activeElement?.tagName === "BUTTON" && event.code === "Space") return;
    const plainKey = !event.ctrlKey && !event.altKey && !event.metaKey && !event.isComposing;
    if (state.dialogs.placement && event.key === "Escape") {
      event.preventDefault();
      finishPlacement();
    } else if (state.dialogs.placement && event.key.toLowerCase() === "r") {
      event.preventDefault();
      transformPlacement("rotate");
    } else if (state.dialogs.placement && event.key.toLowerCase() === "f") {
      event.preventDefault();
      transformPlacement("flip");
    } else if (plainKey && event.key.toLowerCase() === "t" && !document.activeElement?.closest("dialog")) {
      event.preventDefault();
      if (!event.repeat) toggleRun();
    } else if (plainKey && event.key === "Tab" && !event.shiftKey
      && (event.target === elements.canvas || event.target === document.body)) {
      event.preventDefault();
      focusBoard();
      if (!event.repeat && !state.world.running && tabHoldTimer === null) {
        tabHoldTimer = window.setTimeout(() => {
          start();
          runningFromTab = true;
        }, TAB_HOLD_MS);
      }
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
    if (event.key === "Tab" && (tabHoldTimer !== null || runningFromTab)) {
      event.preventDefault();
      endTabHold(true);
      return;
    }
    if (event.code !== "Space" || !state.pointer.spaceDown) return;
    event.preventDefault();
    state.pointer.spaceDown = false;
    const shouldToggle = !state.pointer.spaceDragged && !state.pointer.panGesture && !state.dialogs.placement;
    updateCursorClasses();
    if (shouldToggle) toggleRun();
  }

  elements.run.addEventListener("click", toggleRun);
  elements.run.addEventListener("click", focusBoardAfterClick);
  elements.exportDeleteAllRecords.addEventListener("click", Dialog.exportAndDeleteAllRecords);
  elements.importAllRecords.addEventListener("click", () => elements.importAllRecordsInput.click());
  elements.importAllRecordsInput.addEventListener("change", async () => {
    const files = [...elements.importAllRecordsInput.files];
    elements.importAllRecordsInput.value = "";
    await Dialog.openAllRecordsImport(files);
  });
  elements.importAllRecordsForm.addEventListener("submit", Dialog.importAllRecords);
  elements.cancelImportAllRecords.addEventListener("click", Dialog.closeAllRecordsImport);
  elements.closeImportAllRecords.addEventListener("click", Dialog.closeAllRecordsImport);
  elements.importAllRecordsDialog.addEventListener("close", () => {
    if (!elements.importAllRecordsDialog.open) Dialog.resetAllRecordsImport();
  });
  elements.step.addEventListener("click", advance);
  elements.step.addEventListener("click", focusBoardAfterClick);
  elements.pruneGliders.addEventListener("click", focusBoardAfterClick);
  elements.pruneGliders.addEventListener("change", () => {
    state.world.pruneGliders = elements.pruneGliders.checked;
    cycleTracker.reset();
    if (state.world.pruneGliders && state.world.rule === Life.DEFAULT_RULE) {
      state.world.cells = Tiles.pruneOutlyingGliders(state.world.cells) ?? Life.pruneOutlyingGliders(state.world.cells);
    }
    if (state.world.running && state.world.rule === Life.DEFAULT_RULE) {
      state.world.cells = Tiles.prepare(state.world.cells);
    }
    render();
  });
  elements.ruleForm.addEventListener("submit", applyRule);
  elements.ruleNotation.addEventListener("change", changeRuleNotation);
  elements.ruleInput.addEventListener("input", clearRuleError);
  elements.resetRule.addEventListener("click", () => {
    elements.ruleInput.value = Life.DEFAULT_RULE;
    elements.ruleForm.requestSubmit();
  });
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
  elements.exportDeleteLogicFunction.addEventListener("click", Dialog.exportAndDeleteManagedLogicFunction);
  elements.closeManageLogicFunctions.addEventListener("click", () => closeDialog(elements.manageLogicFunctionsDialog));
  elements.cancelManageLogicFunctions.addEventListener("click", () => closeDialog(elements.manageLogicFunctionsDialog));
  elements.exportLogicFunctions.addEventListener("click", Dialog.exportLogicFunctionLibrary);
  elements.importLogicFunctions.addEventListener("click", () => elements.importLogicFunctionsInput.click());
  elements.importLogicFunctionsInput.addEventListener("change", async () => {
    await Dialog.openLogicFunctionImport(elements.importLogicFunctionsInput.files?.[0]);
    elements.importLogicFunctionsInput.value = "";
  });
  elements.importLogicFunctionsForm.addEventListener("submit", Dialog.importLogicFunctionLibrary);
  elements.closeImportLogicFunctions.addEventListener("click", Dialog.closeLogicFunctionImport);
  elements.cancelImportLogicFunctions.addEventListener("click", Dialog.closeLogicFunctionImport);
  elements.rotatePattern.addEventListener("click", () => transformPlacement("rotate"));
  elements.flipPattern.addEventListener("click", () => transformPlacement("flip"));
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
  elements.exportDeletePattern.addEventListener("click", Dialog.exportAndDeleteManagedPattern);
  elements.closeManagePatterns.addEventListener("click", () => closeDialog(elements.managePatternsDialog));
  elements.cancelManagePatterns.addEventListener("click", () => closeDialog(elements.managePatternsDialog));
  elements.exportPatterns.addEventListener("click", Dialog.exportPatternLibrary);
  elements.importPatterns.addEventListener("click", () => elements.importPatternsInput.click());
  elements.importPatternsInput.addEventListener("change", async () => {
    await Dialog.openPatternImport(elements.importPatternsInput.files?.[0]);
    elements.importPatternsInput.value = "";
  });
  elements.importPatternsForm.addEventListener("submit", Dialog.importPatternLibrary);
  elements.closeImportPatterns.addEventListener("click", Dialog.closePatternImport);
  elements.cancelImportPatterns.addEventListener("click", Dialog.closePatternImport);
  for (const dialog of [
    elements.exportAllRecordsDialog,
    elements.importAllRecordsDialog,
    elements.savePatternDialog,
    elements.managePatternsDialog,
    elements.importPatternsDialog,
    elements.saveLogicFunctionDialog,
    elements.manageLogicFunctionsDialog,
    elements.importLogicFunctionsDialog,
  ]) {
    dialog.addEventListener("close", () => {
      if (!elements.exportAllRecordsDialog.open
        && !elements.importAllRecordsDialog.open
        && !elements.savePatternDialog.open
        && !elements.managePatternsDialog.open
        && !elements.importPatternsDialog.open
        && !elements.saveLogicFunctionDialog.open
        && !elements.manageLogicFunctionsDialog.open
        && !elements.importLogicFunctionsDialog.open) {
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
  elements.importGollyButton.addEventListener("click", () => elements.importGollyInput.click());
  elements.importGollyInput.addEventListener("change", () => {
    const file = elements.importGollyInput.files?.[0];
    elements.importGollyInput.value = "";
    void importGollyPattern(file);
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
  function applyJumpSize() {
    const input = elements.jumpSize;
    const value = input.valueAsNumber;
    const nextSize = Number.isFinite(value)
      ? Math.min(Number(input.max), Math.max(Number(input.min), Math.round(value)))
      : state.world.jumpSize;
    input.value = String(nextSize);
    if (nextSize === state.world.jumpSize) return;
    state.world.jumpSize = nextSize;
    state.world.jumpProgress = 0;
    if (state.world.running) render();
  }

  elements.jumpSize.addEventListener("change", applyJumpSize);
  elements.jumpSize.addEventListener("blur", applyJumpSize);
  elements.canvas.addEventListener("blur", () => endTabHold());
  elements.canvas.addEventListener("pointerdown", handlePointerDown);
  elements.canvas.addEventListener("pointermove", handlePointerMove);
  elements.canvas.addEventListener("pointerup", (event) => releasePointer(event));
  elements.canvas.addEventListener("pointercancel", (event) => releasePointer(event, true));
  elements.canvas.addEventListener("contextmenu", (event) => event.preventDefault());
  elements.canvas.addEventListener("wheel", handleWheel, { passive: false });
  document.addEventListener("keydown", handleKeyDown);
  document.addEventListener("keyup", handleKeyUp);
  window.addEventListener("blur", () => {
    endTabHold();
    state.pointer.spaceDown = false;
    state.pointer.spaceDragged = false;
    updateCursorClasses();
  });
  document.addEventListener("visibilitychange", () => {
    if (!document.hidden) return;
    if (state.world.running) stop({ message: "页面隐藏，已自动暂停" });
    else endTabHold();
  });

  Dialog.initializePatternLibrary();
  Dialog.initializeLogicFunctionLibrary();
  render();
})();
