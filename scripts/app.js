(function startApplication() {
  "use strict";

  const Life = window.LifeEngine;
  const RendererModule = window.LifeRenderer;
  const Presets = window.LifePresets;
  const PatternStore = window.PatternLibrary;
  const SpeedControl = window.SpeedControl;
  const LogicCode = window.LogicCode;
  const FunctionStore = window.LogicFunctionLibrary;
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
    zoomValue: document.querySelector("#zoomValue"),
    cancelManagePatterns: document.querySelector("#cancelManagePatternsButton"),
    cancelSavePattern: document.querySelector("#cancelSavePatternButton"),
    closeManagePatterns: document.querySelector("#closeManagePatternsButton"),
    closeSavePattern: document.querySelector("#closeSavePatternButton"),
    deletePattern: document.querySelector("#deletePatternButton"),
    patternPreview: document.querySelector("#patternPreview"),
  };

  const renderer = RendererModule.create(elements.canvas);
  const state = {
    world: Life.createWorld(),
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
    drawingPointerId: null,
    drawAlive: true,
    painted: new Set(),
    strokeOriginal: new Map(),
    panGesture: null,
    touchGesture: null,
    activePointers: new Map(),
    spaceDown: false,
    spaceDragged: false,
    undoSnapshot: null,
    toastTimer: null,
    patternLibrary: PatternStore.createLibrary(),
    logicFunctionLibrary: FunctionStore.createLibrary(),
    logicFunctionDraft: null,
    logicGenerationController: null,
    logicFunctionStorageBlocked: false,
    functionDeleteArmed: false,
    functionDeleteArmTimer: null,
    saveDraftWorld: null,
    duplicatePatternId: null,
    deleteArmed: false,
    deleteArmTimer: null,
    patternStorageBlocked: false,
    placement: null,
    logicOutputs: [],
  };

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
    document.body.classList.toggle("pan-ready", state.spaceDown);
    document.body.classList.toggle("is-panning", Boolean(state.panGesture || state.touchGesture));
  }

  function absoluteLogicCells(output, key) {
    return output[key].map(([row, column]) => [output.row + row, output.column + column]);
  }

  function logicAnnotations() {
    return state.logicOutputs.map((output) => ({
      observeGeneration: output.observeGeneration,
      result: output.result,
      terminalCells: absoluteLogicCells(output, "terminalCells"),
    }));
  }

  function updateLogicOutputs() {
    for (const output of state.logicOutputs) {
      if (output.result !== null || state.generation < output.observeGeneration) continue;
      output.result = Number(absoluteLogicCells(output, "signalCells")
        .every(([row, column]) => Life.isAlive(state.world, row, column)));
    }
  }

  function logicOutputSummary() {
    if (state.logicOutputs.length === 0) return "";
    return state.logicOutputs
      .map((output) => output.result === null ? `O=?（第 ${output.observeGeneration} 代读取）` : `O=${output.result}`)
      .join("；");
  }

  function render() {
    const alive = Life.countAlive(state.world);
    renderer.draw(state.world, state.camera, state.running, state.placement, logicAnnotations());
    elements.generation.textContent = formatNumber(state.generation);
    elements.alive.textContent = formatNumber(alive);
    elements.actualSpeed.textContent = `${formatNumber(state.actualSpeed)}/s`;
    elements.zoomValue.textContent = formatZoom(state.camera.cellSize);
    elements.status.textContent = state.placement ? "放置中" : state.running ? "演化中" : "已暂停";
    elements.run.querySelector(".button-icon").textContent = state.running ? "Ⅱ" : "▶";
    elements.run.querySelector(".button-label").textContent = state.running ? "暂停" : "开始";
    elements.run.setAttribute("aria-pressed", String(state.running));
    elements.step.disabled = state.running;
    elements.clear.disabled = alive === 0;
    elements.export.disabled = alive === 0;
    elements.savePattern.disabled = alive === 0;
    elements.managePatterns.disabled = state.patternLibrary.patterns.length === 0;
    elements.loadPreset.textContent = state.placement ? "完成" : "放置";
    elements.loadPreset.setAttribute("aria-pressed", String(Boolean(state.placement)));
    elements.rotatePattern.disabled = !state.placement;
    elements.flipPattern.disabled = !state.placement;
    elements.canvas.setAttribute(
      "aria-label",
      `无限大的康威生命游戏世界；视图中心列 ${formatCoordinate(state.camera.centerColumn)}、行 ${formatCoordinate(state.camera.centerRow)}；第 ${state.generation} 代，${alive} 个活细胞，${state.placement ? `正在放置${state.placement.pattern.name}` : state.running ? "正在运行" : "已暂停"}${state.logicOutputs.length ? `；逻辑输出：${logicOutputSummary()}` : ""}。`,
    );
    elements.boardHint.textContent = state.placement
      ? "拖动预览，松开或单击放置；R 旋转 · F 翻转 · Esc 完成。"
      : state.logicOutputs.length
        ? `方框中的 2×2 方块是静物输出端；${logicOutputSummary()}。`
      : state.running
        ? "正在演化；仍可拖动和缩放，暂停后可继续绘制。"
        : "左键绘制；中键、右键或按住空格拖动；滚轮缩放。";
    elements.worldPosition.textContent = `WORLD ∞ · CENTER ${formatCoordinate(state.camera.centerColumn)}, ${formatCoordinate(state.camera.centerRow)}`;
    document.body.classList.toggle("is-running", state.running);
    document.body.classList.toggle("is-placing", Boolean(state.placement));
    updateCursorClasses();
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

  function evolveOneGeneration() {
    if (state.placement) state.placement = null;
    state.world = Life.nextGeneration(state.world);
    state.generation += 1;
    updateLogicOutputs();
  }

  function advance() {
    evolveOneGeneration();
    render();
  }

  function runAnimationFrame(timestamp) {
    if (!state.running) return;
    let shouldRender = false;
    if (state.lastFrameTimestamp === null) {
      state.lastFrameTimestamp = timestamp;
      state.speedWindowStarted = timestamp;
    } else {
      state.frameAccumulator = SpeedControl.accumulate(
        state.frameAccumulator,
        timestamp - state.lastFrameTimestamp,
        state.speed,
      );
      state.lastFrameTimestamp = timestamp;
      const computeStarted = performance.now();
      while (state.frameAccumulator >= 1) {
        evolveOneGeneration();
        state.frameAccumulator -= 1;
        state.speedWindowGenerations += 1;
        shouldRender = true;
        if (performance.now() - computeStarted >= SpeedControl.FRAME_COMPUTE_BUDGET_MS) break;
      }
    }

    const windowElapsed = timestamp - state.speedWindowStarted;
    if (windowElapsed >= SpeedControl.ACTUAL_SPEED_WINDOW_MS) {
      state.actualSpeed = Math.round(state.speedWindowGenerations * 1000 / windowElapsed);
      state.speedWindowStarted = timestamp;
      state.speedWindowGenerations = 0;
      shouldRender = true;
    }
    if (shouldRender) render();
    state.animationFrame = window.requestAnimationFrame(runAnimationFrame);
  }

  function stop(options = {}) {
    if (state.animationFrame !== null) {
      window.cancelAnimationFrame(state.animationFrame);
      state.animationFrame = null;
    }
    const changed = state.running;
    state.running = false;
    state.frameAccumulator = 0;
    state.lastFrameTimestamp = null;
    state.speedWindowStarted = null;
    state.speedWindowGenerations = 0;
    state.actualSpeed = 0;
    if (changed && options.message) showToast(options.message);
    render();
  }

  function start() {
    if (state.running) return;
    state.placement = null;
    state.running = true;
    state.frameAccumulator = 0;
    state.lastFrameTimestamp = null;
    state.speedWindowStarted = null;
    state.speedWindowGenerations = 0;
    state.actualSpeed = 0;
    state.animationFrame = window.requestAnimationFrame(runAnimationFrame);
    render();
  }

  function resetAnimationPacing() {
    if (!state.running) return;
    state.frameAccumulator = 0;
    state.lastFrameTimestamp = null;
    state.speedWindowStarted = null;
    state.speedWindowGenerations = 0;
    state.actualSpeed = 0;
    render();
  }

  function toggleRun() {
    if (state.running) stop();
    else start();
  }

  function fitView() {
    state.camera = renderer.fit(Life.bounds(state.world));
    render();
  }

  function resetWith(world, message, shouldFit = true) {
    stop();
    state.placement = null;
    state.world = world;
    state.generation = 0;
    state.logicOutputs = [];
    state.undoSnapshot = null;
    if (shouldFit) state.camera = renderer.fit(Life.bounds(world));
    render();
    if (message) showToast(message);
  }

  function clearWorld() {
    if (Life.countAlive(state.world) === 0) return;
    const wasRunning = state.running;
    stop();
    state.placement = null;
    state.undoSnapshot = {
      world: Life.cloneWorld(state.world),
      generation: state.generation,
      camera: RendererModule.createCamera(state.camera),
      wasRunning,
      logicOutputs: state.logicOutputs.map((output) => ({ ...output })),
    };
    state.world = Life.createWorld();
    state.generation = 0;
    state.logicOutputs = [];
    render();
    showToast("世界已清空", { undo: true, duration: 7000 });
  }

  function undoClear() {
    if (!state.undoSnapshot) return;
    const snapshot = state.undoSnapshot;
    state.undoSnapshot = null;
    state.world = snapshot.world;
    state.generation = snapshot.generation;
    state.camera = snapshot.camera;
    state.logicOutputs = snapshot.logicOutputs || [];
    hideToast();
    render();
    showToast("已恢复清空前的世界");
  }

  function fillRandom() {
    const centerRow = Math.floor(state.camera.centerRow);
    const centerColumn = Math.floor(state.camera.centerColumn);
    resetWith(
      Life.randomWorld(RANDOM_ROWS, RANDOM_COLUMNS, RANDOM_DENSITY, Math.random, centerRow, centerColumn),
      "已在视图中心生成 25% 密度的随机世界",
    );
  }

  function rebuildPatternOptions(preferredValue = elements.presetSelect.value) {
    elements.presetSelect.replaceChildren();
    const builtInGroup = document.createElement("optgroup");
    builtInGroup.label = "经典图案";
    for (const preset of Presets.presets) {
      const option = document.createElement("option");
      option.value = `builtin:${preset.id}`;
      option.textContent = preset.name;
      builtInGroup.append(option);
    }
    elements.presetSelect.append(builtInGroup);

    if (state.patternLibrary.patterns.length > 0) {
      const customGroup = document.createElement("optgroup");
      customGroup.label = "我的图案";
      for (const pattern of state.patternLibrary.patterns) {
        const option = document.createElement("option");
        option.value = `custom:${pattern.id}`;
        option.textContent = pattern.name;
        customGroup.append(option);
      }
      elements.presetSelect.append(customGroup);
    }

    const hasPreferred = [...elements.presetSelect.options].some((option) => option.value === preferredValue);
    if (hasPreferred) elements.presetSelect.value = preferredValue;
    updatePresetDescription();
  }

  function selectedPattern() {
    const [source, id] = elements.presetSelect.value.split(":");
    if (source === "builtin") return { source, pattern: Presets.getPreset(id) };
    if (source === "custom") {
      return { source, pattern: state.patternLibrary.patterns.find((item) => item.id === id) || null };
    }
    return { source: null, pattern: null };
  }

  function updatePresetDescription() {
    const { source, pattern } = selectedPattern();
    if (!pattern) {
      elements.presetDescription.textContent = "";
      return;
    }
    const details = `${pattern.width} × ${pattern.height} · ${formatNumber(pattern.cells.length)} 个活细胞`;
    elements.presetDescription.textContent = source === "custom"
      ? `${pattern.description || "我的自定义图案"} · ${details}`
      : `${pattern.description} · ${details}`;
    if (state.placement) replacePlacementPattern(pattern);
  }

  function placementAtCameraCenter(pattern) {
    return {
      pattern,
      row: Math.floor(state.camera.centerRow) - Math.floor(pattern.height / 2),
      column: Math.floor(state.camera.centerColumn) - Math.floor(pattern.width / 2),
      pointerId: null,
    };
  }

  function replacePlacementPattern(pattern) {
    if (!state.placement || !pattern) return;
    const centerRow = state.placement.row + (state.placement.pattern.height - 1) / 2;
    const centerColumn = state.placement.column + (state.placement.pattern.width - 1) / 2;
    state.placement = {
      pattern,
      row: Math.round(centerRow - (pattern.height - 1) / 2),
      column: Math.round(centerColumn - (pattern.width - 1) / 2),
      pointerId: null,
    };
    render();
  }

  function finishPlacement(message = "已完成图案放置") {
    if (!state.placement) return;
    state.placement = null;
    render();
    if (message) showToast(message);
  }

  function startPlacement() {
    const { pattern } = selectedPattern();
    if (!pattern) return;
    stop();
    state.placement = placementAtCameraCenter(pattern);
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
    if (state.logicGenerationController !== controller || controller.signal.aborted) return;
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
    if (state.logicGenerationController) {
      state.logicGenerationController.abort();
      setLogicCodeFeedback("正在取消生成…", "progress");
      return;
    }
    const controller = new AbortController();
    state.logicGenerationController = controller;
    setLogicGenerationState(true);
    setLogicCodeFeedback("正在解析并准备结构…页面仍可操作。", "progress");
    try {
      const expanded = LogicCode.expandFunctions(elements.logicCodeInput.value, callableLogicFunctions());
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
      updatePresetDescription();
      state.placement = placementAtCameraCenter(pattern);
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
      if (state.logicGenerationController === controller) {
        state.logicGenerationController = null;
        setLogicGenerationState(false);
      }
    }
  }

  function selectedLogicFunction() {
    return state.logicFunctionLibrary.functions.find(
      (item) => item.id === elements.logicFunctionSelect.value,
    ) || null;
  }

  function callableLogicFunctions() {
    const used = new Set(["AND", "OR", "NOT"]);
    return state.logicFunctionLibrary.functions.map((item, index) => {
      const normalized = /^[A-Za-z][A-Za-z0-9_]*$/.test(item.name)
        ? item.name.toUpperCase()
        : `FUNC${index + 1}`;
      let callName = normalized;
      let suffix = 2;
      while (used.has(callName)) {
        callName = `${normalized}_${suffix}`;
        suffix += 1;
      }
      used.add(callName);
      return { ...item, callName };
    });
  }

  function updateLogicFunctionButtons() {
    const hasFunctions = state.logicFunctionLibrary.functions.length > 0;
    elements.logicFunctionSelect.disabled = !hasFunctions;
    elements.loadLogicFunction.disabled = !hasFunctions;
    elements.manageLogicFunctions.disabled = !hasFunctions;
    elements.saveLogicFunction.disabled = !elements.logicCodeInput.value.trim();
  }

  function rebuildLogicFunctionOptions(preferredId) {
    elements.logicFunctionSelect.replaceChildren();
    if (state.logicFunctionLibrary.functions.length === 0) {
      const option = document.createElement("option");
      option.value = "";
      option.textContent = "我的函数（暂无）";
      elements.logicFunctionSelect.append(option);
    } else {
      const callables = callableLogicFunctions();
      for (const item of state.logicFunctionLibrary.functions) {
        const option = document.createElement("option");
        option.value = item.id;
        const callable = callables.find((entry) => entry.id === item.id);
        option.textContent = `${item.name} · ${callable.callName}`;
        elements.logicFunctionSelect.append(option);
      }
      if (preferredId && state.logicFunctionLibrary.functions.some((item) => item.id === preferredId)) {
        elements.logicFunctionSelect.value = preferredId;
      }
    }
    updateLogicFunctionButtons();
    renderLogicFunctionInputs();
  }

  function renderLogicFunctionInputs() {
    elements.logicFunctionInputs.replaceChildren();
    const item = selectedLogicFunction();
    elements.logicFunctionInputs.hidden = !item || item.inputs.length === 0;
    if (!item) return;
    for (const input of item.inputs) {
      const label = document.createElement("label");
      label.textContent = input.name;
      const select = document.createElement("select");
      select.dataset.inputName = input.name;
      select.setAttribute("aria-label", `输入 ${input.name}`);
      for (const value of [0, 1]) {
        const option = document.createElement("option");
        option.value = String(value);
        option.textContent = String(value);
        select.append(option);
      }
      select.value = String(input.defaultValue);
      label.append(select);
      elements.logicFunctionInputs.append(label);
    }
  }

  function loadSelectedLogicFunction() {
    const item = selectedLogicFunction();
    if (!item) return;
    const values = Object.fromEntries(
      [...elements.logicFunctionInputs.querySelectorAll("select")]
        .map((select) => [select.dataset.inputName, Number(select.value)]),
    );
    elements.logicCodeInput.value = LogicCode.instantiateFunction(item, values);
    updateLogicFunctionButtons();
    setLogicCodeFeedback(`已载入“${item.name}”；点击“生成结构”后才会放入观察区。`, "success");
    elements.logicCodeInput.focus();
  }

  function suggestedLogicFunctionName() {
    const used = new Set(state.logicFunctionLibrary.functions.map((item) => FunctionStore.normalizeName(item.name)));
    let index = state.logicFunctionLibrary.functions.length + 1;
    while (used.has(FunctionStore.normalizeName(`我的函数 ${index}`))) index += 1;
    return `我的函数 ${index}`;
  }

  function commitLogicFunctionLibrary(nextLibrary) {
    if (state.logicFunctionStorageBlocked) {
      throw new FunctionStore.LogicFunctionLibraryError(
        "STORAGE_BLOCKED",
        "原有本地函数库已损坏。为防止覆盖原数据，本页面已停止写入。",
      );
    }
    const saved = FunctionStore.saveLibrary(window.localStorage, nextLibrary);
    state.logicFunctionLibrary = saved;
    return saved;
  }

  function openSaveLogicFunctionDialog() {
    try {
      const definition = LogicCode.createFunctionDefinition(
        elements.logicCodeInput.value, callableLogicFunctions(),
      );
      state.logicFunctionDraft = definition;
      elements.saveLogicFunctionForm.reset();
      elements.logicFunctionName.value = suggestedLogicFunctionName();
      elements.saveLogicFunctionCode.textContent = definition.code;
      elements.saveLogicFunctionInputs.textContent = definition.inputs.length
        ? `输入：${definition.inputs.map((input) => `${input.name}=${input.defaultValue}`).join("，")}`
        : "输入：无";
      setDialogError(elements.saveLogicFunctionError);
      openDialog(elements.saveLogicFunctionDialog);
      window.setTimeout(() => elements.logicFunctionName.select(), 0);
    } catch (error) {
      setLogicCodeFeedback(error.message || "请先输入可识别的逻辑代码", "error");
    }
  }

  function saveNewLogicFunction(event) {
    event.preventDefault();
    setDialogError(elements.saveLogicFunctionError);
    try {
      if (!state.logicFunctionDraft) throw new LogicCode.LogicCodeError("函数定义无效");
      const item = FunctionStore.createFunction({
        name: elements.logicFunctionName.value,
        code: state.logicFunctionDraft.code,
        inputs: state.logicFunctionDraft.inputs,
      });
      const next = FunctionStore.addFunction(state.logicFunctionLibrary, item);
      commitLogicFunctionLibrary(next);
      rebuildLogicFunctionOptions(item.id);
      closeDialog(elements.saveLogicFunctionDialog);
      state.logicFunctionDraft = null;
      showToast(`已保存到“我的函数”：${item.name}`);
    } catch (error) {
      setDialogError(elements.saveLogicFunctionError, error.message || "函数保存失败");
    }
  }

  function rebuildManageLogicFunctionOptions(preferredId) {
    elements.manageLogicFunctionSelect.replaceChildren();
    for (const item of state.logicFunctionLibrary.functions) {
      const option = document.createElement("option");
      option.value = item.id;
      option.textContent = item.name;
      elements.manageLogicFunctionSelect.append(option);
    }
    if (preferredId && state.logicFunctionLibrary.functions.some((item) => item.id === preferredId)) {
      elements.manageLogicFunctionSelect.value = preferredId;
    }
    fillManageLogicFunctionForm();
  }

  function managedLogicFunction() {
    return state.logicFunctionLibrary.functions.find(
      (item) => item.id === elements.manageLogicFunctionSelect.value,
    ) || null;
  }

  function resetFunctionDeleteConfirmation() {
    state.functionDeleteArmed = false;
    window.clearTimeout(state.functionDeleteArmTimer);
    state.functionDeleteArmTimer = null;
    elements.deleteLogicFunction.textContent = "删除函数";
  }

  function fillManageLogicFunctionForm() {
    const item = managedLogicFunction();
    resetFunctionDeleteConfirmation();
    setDialogError(elements.manageLogicFunctionError);
    if (!item) return;
    elements.manageLogicFunctionName.value = item.name;
    elements.manageLogicFunctionCode.value = item.code;
  }

  function openManageLogicFunctionsDialog() {
    if (state.logicFunctionLibrary.functions.length === 0) return;
    rebuildManageLogicFunctionOptions(selectedLogicFunction()?.id || state.logicFunctionLibrary.functions[0].id);
    openDialog(elements.manageLogicFunctionsDialog);
    window.setTimeout(() => elements.manageLogicFunctionSelect.focus(), 0);
  }

  function saveManagedLogicFunction(event) {
    event.preventDefault();
    const item = managedLogicFunction();
    if (!item) return;
    try {
      const definition = LogicCode.createFunctionDefinition(
        elements.manageLogicFunctionCode.value, callableLogicFunctions(),
      );
      const previousDefaults = new Map(item.inputs.map((input) => [input.name, input.defaultValue]));
      const next = FunctionStore.updateFunction(state.logicFunctionLibrary, item.id, {
        name: elements.manageLogicFunctionName.value,
        code: definition.code,
        inputs: definition.inputs.map((input) => ({
          name: input.name,
          defaultValue: previousDefaults.has(input.name)
            ? previousDefaults.get(input.name)
            : input.defaultValue,
        })),
      });
      commitLogicFunctionLibrary(next);
      const updated = next.functions.find((entry) => entry.id === item.id);
      rebuildLogicFunctionOptions(updated.id);
      rebuildManageLogicFunctionOptions(updated.id);
      showToast(`已保存函数修改：${updated.name}`);
    } catch (error) {
      setDialogError(elements.manageLogicFunctionError, error.message || "函数修改失败");
    }
  }

  function deleteManagedLogicFunction() {
    const item = managedLogicFunction();
    if (!item) return;
    if (!state.functionDeleteArmed) {
      state.functionDeleteArmed = true;
      elements.deleteLogicFunction.textContent = "再次点击确认删除";
      setDialogError(elements.manageLogicFunctionError, `即将永久删除“${item.name}”。`);
      state.functionDeleteArmTimer = window.setTimeout(() => {
        resetFunctionDeleteConfirmation();
        setDialogError(elements.manageLogicFunctionError);
      }, 5000);
      return;
    }
    try {
      const next = FunctionStore.deleteFunction(state.logicFunctionLibrary, item.id);
      commitLogicFunctionLibrary(next);
      rebuildLogicFunctionOptions();
      resetFunctionDeleteConfirmation();
      if (next.functions.length === 0) closeDialog(elements.manageLogicFunctionsDialog);
      else rebuildManageLogicFunctionOptions(next.functions[0].id);
      showToast(`已删除函数：${item.name}`);
    } catch (error) {
      setDialogError(elements.manageLogicFunctionError, error.message || "函数删除失败");
    }
  }

  function initializeLogicFunctionLibrary() {
    try {
      state.logicFunctionLibrary = FunctionStore.loadLibrary(window.localStorage);
    } catch (error) {
      state.logicFunctionStorageBlocked = true;
      state.logicFunctionLibrary = FunctionStore.createLibrary();
      window.setTimeout(() => showToast(error.message || "无法读取本地函数库", { duration: 7000 }), 0);
    }
    rebuildLogicFunctionOptions();
  }

  function togglePlacement() {
    if (state.placement) finishPlacement();
    else startPlacement();
  }

  function transformPlacement(transform) {
    if (!state.placement) return;
    replacePlacementPattern(transform(state.placement.pattern));
  }

  function setDialogError(element, message = "") {
    element.textContent = message;
    element.hidden = !message;
  }

  function openDialog(dialog) {
    document.body.classList.add("has-dialog");
    dialog.showModal();
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

  function drawPatternPreview(pattern) {
    const canvas = elements.patternPreview;
    const context = canvas.getContext("2d");
    const padding = 16;
    const availableWidth = canvas.width - padding * 2;
    const availableHeight = canvas.height - padding * 2;
    const cellSize = Math.min(availableWidth / pattern.width, availableHeight / pattern.height, 24);
    const originX = (canvas.width - pattern.width * cellSize) / 2;
    const originY = (canvas.height - pattern.height * cellSize) / 2;
    context.fillStyle = "#080d0c";
    context.fillRect(0, 0, canvas.width, canvas.height);

    if (cellSize >= 8) {
      context.beginPath();
      context.strokeStyle = "rgba(74, 103, 94, 0.46)";
      context.lineWidth = 1;
      for (let column = 0; column <= pattern.width; column += 1) {
        const x = originX + column * cellSize;
        context.moveTo(x, originY);
        context.lineTo(x, originY + pattern.height * cellSize);
      }
      for (let row = 0; row <= pattern.height; row += 1) {
        const y = originY + row * cellSize;
        context.moveTo(originX, y);
        context.lineTo(originX + pattern.width * cellSize, y);
      }
      context.stroke();
    }

    context.fillStyle = "#76f2bc";
    const drawSize = Math.max(1, cellSize - (cellSize >= 4 ? 1 : 0));
    for (const [row, column] of pattern.cells) {
      context.fillRect(originX + column * cellSize, originY + row * cellSize, drawSize, drawSize);
    }
  }

  function suggestedPatternName() {
    const used = new Set(state.patternLibrary.patterns.map((pattern) => PatternStore.normalizeName(pattern.name)));
    let index = state.patternLibrary.patterns.length + 1;
    while (used.has(PatternStore.normalizeName(`我的图案 ${index}`))) index += 1;
    return `我的图案 ${index}`;
  }

  function openSavePatternDialog() {
    if (Life.countAlive(state.world) === 0) return;
    stop();
    state.placement = null;
    render();
    try {
      state.saveDraftWorld = Life.cloneWorld(state.world);
      const preview = PatternStore.normalizeWorld(state.saveDraftWorld);
      drawPatternPreview(preview);
      elements.savePatternStats.textContent = `${formatNumber(preview.width)} × ${formatNumber(preview.height)} · ${formatNumber(preview.cells.length)} 个活细胞`;
      elements.savePatternForm.reset();
      elements.savePatternName.value = suggestedPatternName();
      state.duplicatePatternId = null;
      elements.updateExistingPattern.hidden = true;
      setDialogError(elements.savePatternError);
      openDialog(elements.savePatternDialog);
      window.setTimeout(() => elements.savePatternName.select(), 0);
    } catch (error) {
      showToast(error.message);
    }
  }

  function commitPatternLibrary(nextLibrary) {
    if (state.patternStorageBlocked) {
      throw new PatternStore.PatternLibraryError(
        "STORAGE_BLOCKED",
        "原有本地图案库已损坏。为防止覆盖原数据，本页面已停止写入。",
      );
    }
    const saved = PatternStore.saveLibrary(window.localStorage, nextLibrary);
    state.patternLibrary = saved;
    return saved;
  }

  function patternChangesFromDraft() {
    const draft = PatternStore.createPatternFromWorld(state.saveDraftWorld, {
      name: elements.savePatternName.value,
      description: elements.savePatternDescription.value,
    });
    return {
      name: draft.name,
      description: draft.description,
      width: draft.width,
      height: draft.height,
      cells: draft.cells,
    };
  }

  function finishPatternSave(pattern, message) {
    rebuildPatternOptions(`custom:${pattern.id}`);
    closeDialog(elements.savePatternDialog);
    state.saveDraftWorld = null;
    state.duplicatePatternId = null;
    render();
    showToast(message);
  }

  function saveNewPattern(event) {
    event.preventDefault();
    setDialogError(elements.savePatternError);
    elements.updateExistingPattern.hidden = true;
    try {
      const pattern = PatternStore.createPatternFromWorld(state.saveDraftWorld, {
        name: elements.savePatternName.value,
        description: elements.savePatternDescription.value,
      });
      const next = PatternStore.addPattern(state.patternLibrary, pattern);
      commitPatternLibrary(next);
      finishPatternSave(pattern, `已保存到“我的图案”：${pattern.name}`);
    } catch (error) {
      if (error.code === "DUPLICATE_NAME") {
        state.duplicatePatternId = error.patternId;
        elements.updateExistingPattern.hidden = false;
        setDialogError(elements.savePatternError, `${error.message}。可以修改名称，或明确更新原图案。`);
      } else {
        setDialogError(elements.savePatternError, error.message || "图案保存失败");
      }
    }
  }

  function updateExistingPattern() {
    if (!state.duplicatePatternId) return;
    try {
      const changes = patternChangesFromDraft();
      const next = PatternStore.updatePattern(state.patternLibrary, state.duplicatePatternId, changes);
      commitPatternLibrary(next);
      const updated = next.patterns.find((pattern) => pattern.id === state.duplicatePatternId);
      finishPatternSave(updated, `已更新自定义图案：${updated.name}`);
    } catch (error) {
      setDialogError(elements.savePatternError, error.message || "图案更新失败");
    }
  }

  function resetDuplicateChoice() {
    state.duplicatePatternId = null;
    elements.updateExistingPattern.hidden = true;
    setDialogError(elements.savePatternError);
  }

  function rebuildManageOptions(preferredId) {
    elements.managePatternSelect.replaceChildren();
    for (const pattern of state.patternLibrary.patterns) {
      const option = document.createElement("option");
      option.value = pattern.id;
      option.textContent = pattern.name;
      elements.managePatternSelect.append(option);
    }
    if (preferredId && state.patternLibrary.patterns.some((pattern) => pattern.id === preferredId)) {
      elements.managePatternSelect.value = preferredId;
    }
    fillManageForm();
  }

  function managedPattern() {
    return state.patternLibrary.patterns.find((pattern) => pattern.id === elements.managePatternSelect.value) || null;
  }

  function resetDeleteConfirmation() {
    state.deleteArmed = false;
    window.clearTimeout(state.deleteArmTimer);
    state.deleteArmTimer = null;
    elements.deletePattern.textContent = "删除图案";
  }

  function fillManageForm() {
    const pattern = managedPattern();
    resetDeleteConfirmation();
    setDialogError(elements.managePatternError);
    if (!pattern) return;
    elements.managePatternName.value = pattern.name;
    elements.managePatternDescription.value = pattern.description;
    elements.managePatternMeta.textContent = `${formatNumber(pattern.width)} × ${formatNumber(pattern.height)} · ${formatNumber(pattern.cells.length)} 个活细胞`;
  }

  function openManagePatternsDialog() {
    if (state.patternLibrary.patterns.length === 0) return;
    if (state.placement) {
      state.placement = null;
      render();
    }
    const { source, pattern } = selectedPattern();
    rebuildManageOptions(source === "custom" ? pattern?.id : state.patternLibrary.patterns[0].id);
    openDialog(elements.managePatternsDialog);
    window.setTimeout(() => elements.managePatternSelect.focus(), 0);
  }

  function saveManagedPattern(event) {
    event.preventDefault();
    const pattern = managedPattern();
    if (!pattern) return;
    try {
      const next = PatternStore.updatePattern(state.patternLibrary, pattern.id, {
        name: elements.managePatternName.value,
        description: elements.managePatternDescription.value,
      });
      commitPatternLibrary(next);
      const updated = next.patterns.find((item) => item.id === pattern.id);
      rebuildPatternOptions(`custom:${updated.id}`);
      rebuildManageOptions(updated.id);
      render();
      showToast(`已保存修改：${updated.name}`);
    } catch (error) {
      setDialogError(elements.managePatternError, error.message || "修改保存失败");
    }
  }

  function deleteManagedPattern() {
    const pattern = managedPattern();
    if (!pattern) return;
    if (!state.deleteArmed) {
      state.deleteArmed = true;
      elements.deletePattern.textContent = "再次点击确认删除";
      setDialogError(elements.managePatternError, `即将永久删除“${pattern.name}”，当前世界不会改变。`);
      state.deleteArmTimer = window.setTimeout(() => {
        resetDeleteConfirmation();
        setDialogError(elements.managePatternError);
      }, 5000);
      return;
    }
    try {
      const next = PatternStore.deletePattern(state.patternLibrary, pattern.id);
      commitPatternLibrary(next);
      rebuildPatternOptions();
      resetDeleteConfirmation();
      render();
      if (next.patterns.length === 0) closeDialog(elements.managePatternsDialog);
      else rebuildManageOptions(next.patterns[0].id);
      showToast(`已删除自定义图案：${pattern.name}`);
    } catch (error) {
      setDialogError(elements.managePatternError, error.message || "删除失败");
    }
  }

  function initializePatternLibrary() {
    try {
      state.patternLibrary = PatternStore.loadLibrary(window.localStorage);
    } catch (error) {
      state.patternStorageBlocked = true;
      state.patternLibrary = PatternStore.createLibrary();
      window.setTimeout(() => showToast(error.message || "无法读取本地图案库", { duration: 7000 }), 0);
    }
    rebuildPatternOptions();
  }

  function exportWorld() {
    if (Life.countAlive(state.world) === 0) return;
    const contents = JSON.stringify(Life.serialize(state.world, state.generation, state.camera), null, 2);
    const blob = new Blob([contents], { type: "application/json;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `life-infinite-generation-${state.generation}.json`;
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
      state.placement = null;
      state.world = restored.world;
      state.generation = restored.generation;
      state.logicOutputs = [];
      state.camera = RendererModule.createCamera(restored.view);
      state.undoSnapshot = null;
      render();
      showToast(restored.migratedFrom === 1 ? "旧版存档已导入并升级" : "世界与视图导入成功");
    } catch (error) {
      showToast(`导入失败：${error.message}`);
    }
  }

  function rememberStrokeCell(row, column) {
    const key = Life.coordinateKey(row, column);
    if (!state.strokeOriginal.has(key)) {
      state.strokeOriginal.set(key, Life.isAlive(state.world, row, column));
    }
    return key;
  }

  function paintPointer(event) {
    const coordinate = renderer.coordinateFromPointer(event, state.camera);
    const key = Life.coordinateKey(coordinate.row, coordinate.column);
    if (state.painted.has(key)) return;
    rememberStrokeCell(coordinate.row, coordinate.column);
    state.painted.add(key);
    Life.setCell(state.world, coordinate.row, coordinate.column, state.drawAlive);
    state.logicOutputs = [];
    state.undoSnapshot = null;
    render();
  }

  function updatePlacementFromEvent(event) {
    if (!state.placement) return;
    const coordinate = renderer.coordinateFromPointer(event, state.camera);
    const row = coordinate.row - Math.floor(state.placement.pattern.height / 2);
    const column = coordinate.column - Math.floor(state.placement.pattern.width / 2);
    if (row === state.placement.row && column === state.placement.column) return;
    state.placement.row = row;
    state.placement.column = column;
    render();
  }

  function beginPlacementDrag(event) {
    if (!state.placement) return;
    state.placement.pointerId = event.pointerId;
    updatePlacementFromEvent(event);
  }

  function commitPlacement() {
    if (!state.placement) return;
    try {
      if (state.generation !== 0) state.logicOutputs = [];
      state.world = Life.placePattern(
        state.world,
        state.placement.pattern.cells,
        state.placement.row,
        state.placement.column,
        false,
      );
      state.generation = 0;
      const logic = state.placement.pattern.logic;
      if (logic) {
        state.logicOutputs.push({
          row: state.placement.row,
          column: state.placement.column,
          gate: logic.gate,
          inputs: [...logic.inputs],
          expected: logic.expected,
          observeGeneration: logic.observeGeneration,
          signalCells: logic.signalCells.map((coordinate) => [...coordinate]),
          terminalCells: logic.terminalCells.map((coordinate) => [...coordinate]),
          result: null,
        });
      }
      state.undoSnapshot = null;
      render();
      showToast(
        logic
          ? `已放置：${state.placement.pattern.name}；第 ${logic.observeGeneration} 代锁存输出`
          : `已放置：${state.placement.pattern.name}，可继续放置`,
        { duration: logic ? 4200 : 2400 },
      );
    } catch (error) {
      showToast(error.message);
    }
  }

  function beginDrawing(event) {
    if (state.running) {
      showToast("请先暂停，再绘制细胞");
      return;
    }
    const coordinate = renderer.coordinateFromPointer(event, state.camera);
    state.drawingPointerId = event.pointerId;
    state.drawAlive = !Life.isAlive(state.world, coordinate.row, coordinate.column);
    state.painted.clear();
    state.strokeOriginal.clear();
    paintPointer(event);
  }

  function endDrawing(revert = false) {
    if (state.drawingPointerId === null) return;
    if (revert) {
      for (const [key, alive] of state.strokeOriginal) {
        const separator = key.indexOf(",");
        const row = Number(key.slice(0, separator));
        const column = Number(key.slice(separator + 1));
        Life.setCell(state.world, row, column, alive);
      }
    }
    state.drawingPointerId = null;
    state.painted.clear();
    state.strokeOriginal.clear();
    if (revert) render();
  }

  function beginPan(event, usesSpace = false) {
    const point = renderer.localPoint(event);
    state.panGesture = {
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
    const entries = [...state.activePointers.entries()].slice(0, 2);
    if (entries.length < 2) return;
    endDrawing(true);
    if (state.placement) state.placement.pointerId = null;
    state.panGesture = null;
    const [left, right] = entries.map(([, point]) => point);
    state.touchGesture = {
      pointerIds: entries.map(([pointerId]) => pointerId),
      startCamera: RendererModule.createCamera(state.camera),
      startMidpoint: midpoint(left, right),
      startDistance: Math.max(1, distance(left, right)),
    };
    updateCursorClasses();
  }

  function handlePointerDown(event) {
    if (![0, 1, 2].includes(event.button) && event.pointerType !== "touch") return;
    event.preventDefault();
    elements.canvas.focus({ preventScroll: true });

    if (state.placement && event.pointerType !== "touch" && event.button === 2) {
      finishPlacement();
      return;
    }

    const point = renderer.localPoint(event);
    state.activePointers.set(event.pointerId, point);
    elements.canvas.setPointerCapture(event.pointerId);

    if (event.pointerType === "touch") {
      if (state.activePointers.size >= 2) beginTouchGesture();
      else if (state.placement) beginPlacementDrag(event);
      else if (state.running) beginPan(event);
      else beginDrawing(event);
      return;
    }

    if (event.button === 1 || (!state.placement && event.button === 2) || (event.button === 0 && state.spaceDown)) {
      beginPan(event, event.button === 0 && state.spaceDown);
    } else if (event.button === 0 && state.placement) {
      beginPlacementDrag(event);
    } else if (event.button === 0) {
      beginDrawing(event);
    }
  }

  function updateTouchGesture() {
    const gesture = state.touchGesture;
    if (!gesture) return;
    const left = state.activePointers.get(gesture.pointerIds[0]);
    const right = state.activePointers.get(gesture.pointerIds[1]);
    if (!left || !right) return;
    const currentMidpoint = midpoint(left, right);
    const factor = Math.max(0.01, distance(left, right) / gesture.startDistance);
    const zoomed = RendererModule.zoomCameraAt(
      gesture.startCamera,
      gesture.startMidpoint,
      renderer.viewport(),
      factor,
    );
    state.camera = RendererModule.panCamera(
      zoomed,
      currentMidpoint.x - gesture.startMidpoint.x,
      currentMidpoint.y - gesture.startMidpoint.y,
    );
    render();
  }

  function handlePointerMove(event) {
    if (!state.activePointers.has(event.pointerId)) {
      if (state.placement && event.pointerType !== "touch") updatePlacementFromEvent(event);
      return;
    }
    event.preventDefault();
    const point = renderer.localPoint(event);
    state.activePointers.set(event.pointerId, point);

    if (state.touchGesture) {
      updateTouchGesture();
      return;
    }

    if (state.panGesture?.pointerId === event.pointerId) {
      const deltaX = point.x - state.panGesture.lastX;
      const deltaY = point.y - state.panGesture.lastY;
      if (state.panGesture.usesSpace && Math.hypot(deltaX, deltaY) >= 2) state.spaceDragged = true;
      state.camera = RendererModule.panCamera(state.camera, deltaX, deltaY);
      state.panGesture.lastX = point.x;
      state.panGesture.lastY = point.y;
      render();
      return;
    }

    if (state.placement?.pointerId === event.pointerId) {
      updatePlacementFromEvent(event);
      return;
    }

    if (state.drawingPointerId === event.pointerId) paintPointer(event);
  }

  function releasePointer(event, cancelled = false) {
    const wasTouchGesture = state.touchGesture?.pointerIds.includes(event.pointerId);
    const wasPlacement = state.placement?.pointerId === event.pointerId;
    state.activePointers.delete(event.pointerId);
    if (wasTouchGesture) state.touchGesture = null;
    if (state.panGesture?.pointerId === event.pointerId) state.panGesture = null;
    if (state.drawingPointerId === event.pointerId) endDrawing(cancelled);
    if (wasPlacement && state.placement) {
      state.placement.pointerId = null;
      if (!cancelled) commitPlacement();
      else render();
    }
    if (elements.canvas.hasPointerCapture(event.pointerId)) elements.canvas.releasePointerCapture(event.pointerId);
    updateCursorClasses();
  }

  function zoomAtCenter(factor) {
    const viewport = renderer.viewport();
    state.camera = RendererModule.zoomCameraAt(
      state.camera,
      { x: viewport.width / 2, y: viewport.height / 2 },
      viewport,
      factor,
    );
    render();
  }

  function handleWheel(event) {
    event.preventDefault();
    const factor = Math.exp(-event.deltaY * 0.0015);
    state.camera = renderer.zoomAtPointer(event, state.camera, factor);
    render();
  }

  function ignoresGlobalShortcut() {
    return ["INPUT", "SELECT", "TEXTAREA"].includes(document.activeElement?.tagName);
  }

  function handleKeyDown(event) {
    if (ignoresGlobalShortcut()) return;
    if (document.activeElement?.tagName === "BUTTON" && event.code === "Space") return;
    if (state.placement && event.key === "Escape") {
      event.preventDefault();
      finishPlacement();
    } else if (state.placement && event.key.toLowerCase() === "r") {
      event.preventDefault();
      transformPlacement(Presets.rotatePattern);
    } else if (state.placement && event.key.toLowerCase() === "f") {
      event.preventDefault();
      transformPlacement(Presets.flipPattern);
    } else if (event.code === "Space") {
      event.preventDefault();
      if (event.repeat) return;
      state.spaceDown = true;
      state.spaceDragged = false;
      updateCursorClasses();
    } else if (event.code === "ArrowRight") {
      event.preventDefault();
      if (!state.running) advance();
    } else if (event.key.toLowerCase() === "c") {
      event.preventDefault();
      clearWorld();
    } else if (event.code === "Digit0" || event.code === "Numpad0") {
      event.preventDefault();
      fitView();
    }
  }

  function handleKeyUp(event) {
    if (event.code !== "Space" || !state.spaceDown) return;
    event.preventDefault();
    state.spaceDown = false;
    const shouldToggle = !state.spaceDragged && !state.panGesture && !state.placement;
    updateCursorClasses();
    if (shouldToggle) toggleRun();
  }

  elements.run.addEventListener("click", toggleRun);
  elements.step.addEventListener("click", advance);
  elements.clear.addEventListener("click", clearWorld);
  elements.random.addEventListener("click", fillRandom);
  elements.undo.addEventListener("click", undoClear);
  elements.presetSelect.addEventListener("change", updatePresetDescription);
  elements.loadPreset.addEventListener("click", togglePlacement);
  elements.logicCodeForm.addEventListener("submit", generateLogicStructure);
  elements.logicCodeInput.addEventListener("input", () => {
    if (elements.logicCodeFeedback.dataset.state === "error") setLogicCodeFeedback();
    updateLogicFunctionButtons();
  });
  elements.loadLogicFunction.addEventListener("click", loadSelectedLogicFunction);
  elements.logicFunctionSelect.addEventListener("change", renderLogicFunctionInputs);
  elements.saveLogicFunction.addEventListener("click", openSaveLogicFunctionDialog);
  elements.manageLogicFunctions.addEventListener("click", openManageLogicFunctionsDialog);
  elements.saveLogicFunctionForm.addEventListener("submit", saveNewLogicFunction);
  elements.closeSaveLogicFunction.addEventListener("click", () => closeDialog(elements.saveLogicFunctionDialog));
  elements.cancelSaveLogicFunction.addEventListener("click", () => closeDialog(elements.saveLogicFunctionDialog));
  elements.manageLogicFunctionsForm.addEventListener("submit", saveManagedLogicFunction);
  elements.manageLogicFunctionSelect.addEventListener("change", fillManageLogicFunctionForm);
  elements.manageLogicFunctionName.addEventListener("input", resetFunctionDeleteConfirmation);
  elements.manageLogicFunctionCode.addEventListener("input", resetFunctionDeleteConfirmation);
  elements.deleteLogicFunction.addEventListener("click", deleteManagedLogicFunction);
  elements.closeManageLogicFunctions.addEventListener("click", () => closeDialog(elements.manageLogicFunctionsDialog));
  elements.cancelManageLogicFunctions.addEventListener("click", () => closeDialog(elements.manageLogicFunctionsDialog));
  elements.rotatePattern.addEventListener("click", () => transformPlacement(Presets.rotatePattern));
  elements.flipPattern.addEventListener("click", () => transformPlacement(Presets.flipPattern));
  elements.savePattern.addEventListener("click", openSavePatternDialog);
  elements.managePatterns.addEventListener("click", openManagePatternsDialog);
  elements.savePatternForm.addEventListener("submit", saveNewPattern);
  elements.updateExistingPattern.addEventListener("click", updateExistingPattern);
  elements.savePatternName.addEventListener("input", resetDuplicateChoice);
  elements.closeSavePattern.addEventListener("click", () => closeDialog(elements.savePatternDialog));
  elements.cancelSavePattern.addEventListener("click", () => closeDialog(elements.savePatternDialog));
  elements.managePatternsForm.addEventListener("submit", saveManagedPattern);
  elements.managePatternSelect.addEventListener("change", fillManageForm);
  elements.managePatternName.addEventListener("input", resetDeleteConfirmation);
  elements.managePatternDescription.addEventListener("input", resetDeleteConfirmation);
  elements.deletePattern.addEventListener("click", deleteManagedPattern);
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
    const nextSpeed = SpeedControl.normalize(elements.speed.value, state.speed);
    if (normalizeField) elements.speed.value = String(nextSpeed);
    if (nextSpeed === state.speed) return;
    state.speed = nextSpeed;
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
    state.spaceDown = false;
    state.spaceDragged = false;
    updateCursorClasses();
  });
  document.addEventListener("visibilitychange", () => {
    if (document.hidden && state.running) stop({ message: "页面隐藏，已自动暂停" });
  });

  initializePatternLibrary();
  initializeLogicFunctionLibrary();
  render();
})();
