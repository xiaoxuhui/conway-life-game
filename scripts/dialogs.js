(function exposeDialogs(root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  root.LifeDialogs = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function createDialogs() {
  "use strict";

  // 对话框与函数库/图案库管理模块。
  // 通过 create(context) 注入 app.js 的 state、elements 与各外部 store，并接收少量
  // app 层辅助函数（showToast/render/stop/closeDialog/replacePlacementPattern/
  // setLogicCodeFeedback/formatNumber），从而避免与 app.js 主控制器深度耦合。
  function create(context) {
    const { state, elements, Life, PatternStore, FunctionStore, LogicCode, Presets } = context;
    const {
      showToast, render, stop, closeDialog, replacePlacementPattern, setLogicCodeFeedback, formatNumber,
    } = context.helpers;

    function setDialogError(element, message = "") {
      element.textContent = message;
      element.hidden = !message;
    }

    function openDialog(dialog) {
      document.body.classList.add("has-dialog");
      dialog.showModal();
    }

    // ---- 图案库管理 ----

    function selectedPattern() {
      const [source, id] = elements.presetSelect.value.split(":");
      if (source === "builtin") return { source, pattern: Presets.getPreset(id) };
      if (source === "custom") {
        return { source, pattern: state.storage.patternLibrary.patterns.find((item) => item.id === id) || null };
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
      if (state.dialogs.placement) replacePlacementPattern(pattern);
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

      if (state.storage.patternLibrary.patterns.length > 0) {
        const customGroup = document.createElement("optgroup");
        customGroup.label = "我的图案";
        for (const pattern of state.storage.patternLibrary.patterns) {
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

    function commitPatternLibrary(nextLibrary, options = {}) {
      if (state.storage.patternStorageBlocked && !options.allowRecovery) {
        throw new PatternStore.PatternLibraryError(
          "STORAGE_BLOCKED",
          "原有本地图案库已损坏。为防止覆盖原数据，本页面已停止写入。",
        );
      }
      const saved = PatternStore.saveLibrary(window.localStorage, nextLibrary);
      state.storage.patternLibrary = saved;
      if (options.allowRecovery) state.storage.patternStorageBlocked = false;
      return saved;
    }

    function exportPatternLibrary() {
      try {
        const raw = PatternStore.serializeLibrary(state.storage.patternLibrary, { pretty: true });
        const date = new Date().toISOString().slice(0, 10);
        const blob = new Blob([raw], { type: "application/json;charset=utf-8" });
        const url = URL.createObjectURL(blob);
        const anchor = document.createElement("a");
        anchor.href = url;
        anchor.download = `conway-life-patterns-${date}.json`;
        document.body.append(anchor);
        anchor.click();
        anchor.remove();
        window.setTimeout(() => URL.revokeObjectURL(url), 0);
        showToast(`已全部保存 ${state.storage.patternLibrary.patterns.length} 个自定义图案`);
      } catch (error) {
        showToast(error.message || "图案库保存失败", { duration: 7000 });
      }
    }

    async function openPatternImport(file) {
      if (!file) return;
      state.dialogs.patternImportDraft = null;
      elements.importPatternsForm.reset();
      elements.confirmImportPatterns.disabled = true;
      elements.importPatternsSummary.textContent = `正在读取：${file.name}`;
      setDialogError(elements.importPatternsError);
      try {
        if (file.size > PatternStore.MAX_LIBRARY_BYTES) {
          throw new PatternStore.PatternLibraryError("LIBRARY_SIZE_LIMIT", "图案库文件超过 4 MB 大小上限");
        }
        const library = PatternStore.parseLibrary(await file.text());
        state.dialogs.patternImportDraft = library;
        elements.importPatternsSummary.textContent = `${file.name} · ${library.patterns.length} 个自定义图案 · 格式 v${library.version}`;
        elements.confirmImportPatterns.disabled = false;
      } catch (error) {
        elements.importPatternsSummary.textContent = `无法导入：${file.name}`;
        setDialogError(elements.importPatternsError, error.message || "图案库文件无效");
      }
      openDialog(elements.importPatternsDialog);
      window.setTimeout(() => elements.importPatternsDialog.querySelector("input:checked")?.focus(), 0);
    }

    function closePatternImport() {
      state.dialogs.patternImportDraft = null;
      closeDialog(elements.importPatternsDialog);
    }

    function importPatternLibrary(event) {
      event.preventDefault();
      const imported = state.dialogs.patternImportDraft;
      if (!imported) return;
      const mode = elements.importPatternsForm.elements.patternImportMode.value;
      const currentCount = state.storage.patternLibrary.patterns.length;
      if (mode === "replace" && currentCount > 0 && !window.confirm(
        `这会删除当前 ${currentCount} 个自定义图案，并替换为文件中的 ${imported.patterns.length} 个图案。是否继续？`,
      )) return;

      try {
        let message;
        let preferredValue = elements.presetSelect.value;
        if (mode === "replace") {
          commitPatternLibrary(imported, { allowRecovery: true });
          preferredValue = imported.patterns[0] ? `custom:${imported.patterns[0].id}` : "";
          message = `已整体恢复 ${imported.patterns.length} 个自定义图案`;
        } else {
          const result = PatternStore.mergeLibraries(state.storage.patternLibrary, imported);
          if (result.addedCount > 0) commitPatternLibrary(result.library);
          message = `已导入 ${result.addedCount} 个自定义图案`;
          if (result.skippedCount > 0) message += `，跳过 ${result.skippedCount} 个冲突项`;
        }
        state.dialogs.placement = null;
        rebuildPatternOptions(preferredValue);
        closePatternImport();
        render();
        showToast(message, { duration: 7000 });
      } catch (error) {
        setDialogError(elements.importPatternsError, error.message || "图案库导入失败");
      }
    }

    function suggestedPatternName() {
      const used = new Set(state.storage.patternLibrary.patterns.map((pattern) => PatternStore.normalizeName(pattern.name)));
      let index = state.storage.patternLibrary.patterns.length + 1;
      while (used.has(PatternStore.normalizeName(`我的图案 ${index}`))) index += 1;
      return `我的图案 ${index}`;
    }

    function drawPatternPreview(pattern) {
      const canvas = elements.patternPreview;
      const ctx = canvas.getContext("2d");
      const padding = 16;
      const availableWidth = canvas.width - padding * 2;
      const availableHeight = canvas.height - padding * 2;
      const cellSize = Math.min(availableWidth / pattern.width, availableHeight / pattern.height, 24);
      const originX = (canvas.width - pattern.width * cellSize) / 2;
      const originY = (canvas.height - pattern.height * cellSize) / 2;
      ctx.fillStyle = "#080d0c";
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      if (cellSize >= 8) {
        ctx.beginPath();
        ctx.strokeStyle = "rgba(74, 103, 94, 0.46)";
        ctx.lineWidth = 1;
        for (let column = 0; column <= pattern.width; column += 1) {
          const x = originX + column * cellSize;
          ctx.moveTo(x, originY);
          ctx.lineTo(x, originY + pattern.height * cellSize);
        }
        for (let row = 0; row <= pattern.height; row += 1) {
          const y = originY + row * cellSize;
          ctx.moveTo(originX, y);
          ctx.lineTo(originX + pattern.width * cellSize, y);
        }
        ctx.stroke();
      }

      ctx.fillStyle = "#76f2bc";
      const drawSize = Math.max(1, cellSize - (cellSize >= 4 ? 1 : 0));
      for (const [row, column] of pattern.cells) {
        ctx.fillRect(originX + column * cellSize, originY + row * cellSize, drawSize, drawSize);
      }
    }

    function openSavePatternDialog() {
      if (Life.countAlive(state.world.cells) === 0) return;
      stop();
      state.dialogs.placement = null;
      render();
      try {
        state.pointer.saveDraftWorld = Life.cloneWorld(state.world.cells);
        const preview = PatternStore.normalizeWorld(state.pointer.saveDraftWorld);
        drawPatternPreview(preview);
        elements.savePatternStats.textContent = `${formatNumber(preview.width)} × ${formatNumber(preview.height)} · ${formatNumber(preview.cells.length)} 个活细胞`;
        elements.savePatternForm.reset();
        elements.savePatternName.value = suggestedPatternName();
        state.dialogs.duplicatePatternId = null;
        elements.updateExistingPattern.hidden = true;
        setDialogError(elements.savePatternError);
        openDialog(elements.savePatternDialog);
        window.setTimeout(() => elements.savePatternName.select(), 0);
      } catch (error) {
        showToast(error.message);
      }
    }

    function patternChangesFromDraft() {
      const draft = PatternStore.createPatternFromWorld(state.pointer.saveDraftWorld, {
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
      state.pointer.saveDraftWorld = null;
      state.dialogs.duplicatePatternId = null;
      render();
      showToast(message);
    }

    function saveNewPattern(event) {
      event.preventDefault();
      setDialogError(elements.savePatternError);
      elements.updateExistingPattern.hidden = true;
      try {
        const pattern = PatternStore.createPatternFromWorld(state.pointer.saveDraftWorld, {
          name: elements.savePatternName.value,
          description: elements.savePatternDescription.value,
        });
        const next = PatternStore.addPattern(state.storage.patternLibrary, pattern);
        commitPatternLibrary(next);
        finishPatternSave(pattern, `已保存到“我的图案”：${pattern.name}`);
      } catch (error) {
        if (error.code === "DUPLICATE_NAME") {
          state.dialogs.duplicatePatternId = error.patternId;
          elements.updateExistingPattern.hidden = false;
          setDialogError(elements.savePatternError, `${error.message}。可以修改名称，或明确更新原图案。`);
        } else {
          setDialogError(elements.savePatternError, error.message || "图案保存失败");
        }
      }
    }

    function updateExistingPattern() {
      if (!state.dialogs.duplicatePatternId) return;
      try {
        const changes = patternChangesFromDraft();
        const next = PatternStore.updatePattern(state.storage.patternLibrary, state.dialogs.duplicatePatternId, changes);
        commitPatternLibrary(next);
        const updated = next.patterns.find((pattern) => pattern.id === state.dialogs.duplicatePatternId);
        finishPatternSave(updated, `已更新自定义图案：${updated.name}`);
      } catch (error) {
        setDialogError(elements.savePatternError, error.message || "图案更新失败");
      }
    }

    function resetDuplicateChoice() {
      state.dialogs.duplicatePatternId = null;
      elements.updateExistingPattern.hidden = true;
      setDialogError(elements.savePatternError);
    }

    function rebuildManageOptions(preferredId) {
      elements.managePatternSelect.replaceChildren();
      for (const pattern of state.storage.patternLibrary.patterns) {
        const option = document.createElement("option");
        option.value = pattern.id;
        option.textContent = pattern.name;
        elements.managePatternSelect.append(option);
      }
      if (preferredId && state.storage.patternLibrary.patterns.some((pattern) => pattern.id === preferredId)) {
        elements.managePatternSelect.value = preferredId;
      }
      fillManageForm();
    }

    function managedPattern() {
      return state.storage.patternLibrary.patterns.find((pattern) => pattern.id === elements.managePatternSelect.value) || null;
    }

    function resetDeleteConfirmation() {
      state.dialogs.deleteArmed = false;
      window.clearTimeout(state.dialogs.deleteArmTimer);
      state.dialogs.deleteArmTimer = null;
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
      if (state.storage.patternLibrary.patterns.length === 0) return;
      if (state.dialogs.placement) {
        state.dialogs.placement = null;
        render();
      }
      const { source, pattern } = selectedPattern();
      rebuildManageOptions(source === "custom" ? pattern?.id : state.storage.patternLibrary.patterns[0].id);
      openDialog(elements.managePatternsDialog);
      window.setTimeout(() => elements.managePatternSelect.focus(), 0);
    }

    function saveManagedPattern(event) {
      event.preventDefault();
      const pattern = managedPattern();
      if (!pattern) return;
      try {
        const next = PatternStore.updatePattern(state.storage.patternLibrary, pattern.id, {
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
      if (!state.dialogs.deleteArmed) {
        state.dialogs.deleteArmed = true;
        elements.deletePattern.textContent = "再次点击确认删除";
        setDialogError(elements.managePatternError, `即将永久删除“${pattern.name}”，当前世界不会改变。`);
        state.dialogs.deleteArmTimer = window.setTimeout(() => {
          resetDeleteConfirmation();
          setDialogError(elements.managePatternError);
        }, 5000);
        return;
      }
      try {
        const next = PatternStore.deletePattern(state.storage.patternLibrary, pattern.id);
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
        state.storage.patternLibrary = PatternStore.loadLibrary(window.localStorage);
      } catch (error) {
        state.storage.patternStorageBlocked = true;
        state.storage.patternLibrary = PatternStore.createLibrary();
        window.setTimeout(() => showToast(error.message || "无法读取本地图案库", { duration: 7000 }), 0);
      }
      rebuildPatternOptions();
    }

    // ---- 函数库管理 ----

    function selectedLogicFunction() {
      return state.storage.logicFunctionLibrary.functions.find(
        (item) => item.id === elements.logicFunctionSelect.value,
      ) || null;
    }

    function callableLogicFunctions() {
      const used = new Set(["AND", "OR", "NOT"]);
      return state.storage.logicFunctionLibrary.functions.map((item, index) => {
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
      const hasFunctions = state.storage.logicFunctionLibrary.functions.length > 0;
      elements.logicFunctionSelect.disabled = !hasFunctions;
      elements.loadLogicFunction.disabled = !hasFunctions;
      elements.manageLogicFunctions.disabled = !hasFunctions;
      elements.exportLogicFunctions.disabled = !hasFunctions;
      elements.saveLogicFunction.disabled = !elements.logicCodeInput.value.trim();
    }

    function rebuildLogicFunctionOptions(preferredId) {
      elements.logicFunctionSelect.replaceChildren();
      if (state.storage.logicFunctionLibrary.functions.length === 0) {
        const option = document.createElement("option");
        option.value = "";
        option.textContent = "我的函数（暂无）";
        elements.logicFunctionSelect.append(option);
      } else {
        const callables = callableLogicFunctions();
        for (const item of state.storage.logicFunctionLibrary.functions) {
          const option = document.createElement("option");
          option.value = item.id;
          const callable = callables.find((entry) => entry.id === item.id);
          option.textContent = `${item.name} · ${callable.callName}`;
          elements.logicFunctionSelect.append(option);
        }
        if (preferredId && state.storage.logicFunctionLibrary.functions.some((item) => item.id === preferredId)) {
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

    function suggestedLogicFunctionName() {
      const used = new Set(state.storage.logicFunctionLibrary.functions.map((item) => FunctionStore.normalizeName(item.name)));
      let index = state.storage.logicFunctionLibrary.functions.length + 1;
      while (used.has(FunctionStore.normalizeName(`我的函数 ${index}`))) index += 1;
      return `我的函数 ${index}`;
    }

    function commitLogicFunctionLibrary(nextLibrary, options = {}) {
      if (state.storage.logicFunctionStorageBlocked && !options.allowRecovery) {
        throw new FunctionStore.LogicFunctionLibraryError(
          "STORAGE_BLOCKED",
          "原有本地函数库已损坏。为防止覆盖原数据，本页面已停止写入。",
        );
      }
      const saved = FunctionStore.saveLibrary(window.localStorage, nextLibrary);
      state.storage.logicFunctionLibrary = saved;
      if (options.allowRecovery) state.storage.logicFunctionStorageBlocked = false;
      return saved;
    }

    function exportLogicFunctionLibrary() {
      try {
        const raw = FunctionStore.serializeLibrary(state.storage.logicFunctionLibrary, { pretty: true });
        const date = new Date().toISOString().slice(0, 10);
        const blob = new Blob([raw], { type: "application/json;charset=utf-8" });
        const url = URL.createObjectURL(blob);
        const anchor = document.createElement("a");
        anchor.href = url;
        anchor.download = `conway-life-functions-${date}.json`;
        document.body.append(anchor);
        anchor.click();
        anchor.remove();
        window.setTimeout(() => URL.revokeObjectURL(url), 0);
        showToast(`已导出 ${state.storage.logicFunctionLibrary.functions.length} 个函数`);
      } catch (error) {
        showToast(error.message || "函数库导出失败", { duration: 7000 });
      }
    }

    async function openLogicFunctionImport(file) {
      if (!file) return;
      state.dialogs.logicFunctionImportDraft = null;
      elements.importLogicFunctionsForm.reset();
      elements.confirmImportLogicFunctions.disabled = true;
      elements.importLogicFunctionsSummary.textContent = `正在读取：${file.name}`;
      setDialogError(elements.importLogicFunctionsError);
      try {
        if (file.size > FunctionStore.MAX_LIBRARY_BYTES) {
          throw new FunctionStore.LogicFunctionLibraryError("LIBRARY_SIZE_LIMIT", "函数库文件超过大小上限");
        }
        const library = FunctionStore.parseLibrary(await file.text());
        state.dialogs.logicFunctionImportDraft = library;
        elements.importLogicFunctionsSummary.textContent = `${file.name} · ${library.functions.length} 个函数 · 格式 v${library.version}`;
        elements.confirmImportLogicFunctions.disabled = false;
      } catch (error) {
        elements.importLogicFunctionsSummary.textContent = `无法导入：${file.name}`;
        setDialogError(elements.importLogicFunctionsError, error.message || "函数库文件无效");
      }
      openDialog(elements.importLogicFunctionsDialog);
      window.setTimeout(() => elements.importLogicFunctionsDialog.querySelector("input:checked")?.focus(), 0);
    }

    function closeLogicFunctionImport() {
      state.dialogs.logicFunctionImportDraft = null;
      closeDialog(elements.importLogicFunctionsDialog);
    }

    function importLogicFunctionLibrary(event) {
      event.preventDefault();
      const imported = state.dialogs.logicFunctionImportDraft;
      if (!imported) return;
      const mode = elements.importLogicFunctionsForm.elements.logicFunctionImportMode.value;
      const currentCount = state.storage.logicFunctionLibrary.functions.length;
      if (mode === "replace" && currentCount > 0 && !window.confirm(
        `这会删除当前 ${currentCount} 个函数，并替换为文件中的 ${imported.functions.length} 个函数。是否继续？`,
      )) return;

      try {
        let message;
        if (mode === "replace") {
          commitLogicFunctionLibrary(imported, { allowRecovery: true });
          message = `已用文件恢复 ${imported.functions.length} 个函数`;
        } else {
          const result = FunctionStore.mergeLibraries(state.storage.logicFunctionLibrary, imported);
          if (result.addedCount > 0) commitLogicFunctionLibrary(result.library);
          message = `已导入 ${result.addedCount} 个函数`;
          if (result.skippedCount > 0) message += `，跳过 ${result.skippedCount} 个冲突项`;
        }
        rebuildLogicFunctionOptions(state.storage.logicFunctionLibrary.functions[0]?.id);
        closeLogicFunctionImport();
        showToast(message, { duration: 7000 });
      } catch (error) {
        setDialogError(elements.importLogicFunctionsError, error.message || "函数库导入失败");
      }
    }

    function openSaveLogicFunctionDialog() {
      try {
        const definition = LogicCode.createFunctionDefinition(
          elements.logicCodeInput.value, callableLogicFunctions(),
        );
        state.dialogs.logicFunctionDraft = definition;
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
        if (!state.dialogs.logicFunctionDraft) throw new LogicCode.LogicCodeError("函数定义无效");
        const item = FunctionStore.createFunction({
          name: elements.logicFunctionName.value,
          code: state.dialogs.logicFunctionDraft.code,
          inputs: state.dialogs.logicFunctionDraft.inputs,
        });
        const next = FunctionStore.addFunction(state.storage.logicFunctionLibrary, item);
        commitLogicFunctionLibrary(next);
        rebuildLogicFunctionOptions(item.id);
        closeDialog(elements.saveLogicFunctionDialog);
        state.dialogs.logicFunctionDraft = null;
        showToast(`已保存到“我的函数”：${item.name}`);
      } catch (error) {
        setDialogError(elements.saveLogicFunctionError, error.message || "函数保存失败");
      }
    }

    function rebuildManageLogicFunctionOptions(preferredId) {
      elements.manageLogicFunctionSelect.replaceChildren();
      for (const item of state.storage.logicFunctionLibrary.functions) {
        const option = document.createElement("option");
        option.value = item.id;
        option.textContent = item.name;
        elements.manageLogicFunctionSelect.append(option);
      }
      if (preferredId && state.storage.logicFunctionLibrary.functions.some((item) => item.id === preferredId)) {
        elements.manageLogicFunctionSelect.value = preferredId;
      }
      fillManageLogicFunctionForm();
    }

    function managedLogicFunction() {
      return state.storage.logicFunctionLibrary.functions.find(
        (item) => item.id === elements.manageLogicFunctionSelect.value,
      ) || null;
    }

    function resetFunctionDeleteConfirmation() {
      state.dialogs.functionDeleteArmed = false;
      window.clearTimeout(state.dialogs.functionDeleteArmTimer);
      state.dialogs.functionDeleteArmTimer = null;
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
      if (state.storage.logicFunctionLibrary.functions.length === 0) return;
      rebuildManageLogicFunctionOptions(selectedLogicFunction()?.id || state.storage.logicFunctionLibrary.functions[0].id);
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
        const next = FunctionStore.updateFunction(state.storage.logicFunctionLibrary, item.id, {
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
      if (!state.dialogs.functionDeleteArmed) {
        state.dialogs.functionDeleteArmed = true;
        elements.deleteLogicFunction.textContent = "再次点击确认删除";
        setDialogError(elements.manageLogicFunctionError, `即将永久删除“${item.name}”。`);
        state.dialogs.functionDeleteArmTimer = window.setTimeout(() => {
          resetFunctionDeleteConfirmation();
          setDialogError(elements.manageLogicFunctionError);
        }, 5000);
        return;
      }
      try {
        const next = FunctionStore.deleteFunction(state.storage.logicFunctionLibrary, item.id);
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
        state.storage.logicFunctionLibrary = FunctionStore.loadLibrary(window.localStorage);
      } catch (error) {
        state.storage.logicFunctionStorageBlocked = true;
        state.storage.logicFunctionLibrary = FunctionStore.createLibrary();
        window.setTimeout(() => showToast(error.message || "无法读取本地函数库", { duration: 7000 }), 0);
      }
      rebuildLogicFunctionOptions();
    }

    return Object.freeze({
      // 图案库
      selectedPattern,
      updatePresetDescription,
      rebuildPatternOptions,
      commitPatternLibrary,
      suggestedPatternName,
      openSavePatternDialog,
      patternChangesFromDraft,
      finishPatternSave,
      saveNewPattern,
      updateExistingPattern,
      resetDuplicateChoice,
      rebuildManageOptions,
      managedPattern,
      resetDeleteConfirmation,
      fillManageForm,
      openManagePatternsDialog,
      saveManagedPattern,
      deleteManagedPattern,
      initializePatternLibrary,
      exportPatternLibrary,
      openPatternImport,
      closePatternImport,
      importPatternLibrary,
      // 函数库
      selectedLogicFunction,
      callableLogicFunctions,
      updateLogicFunctionButtons,
      rebuildLogicFunctionOptions,
      renderLogicFunctionInputs,
      suggestedLogicFunctionName,
      commitLogicFunctionLibrary,
      openSaveLogicFunctionDialog,
      saveNewLogicFunction,
      rebuildManageLogicFunctionOptions,
      managedLogicFunction,
      resetFunctionDeleteConfirmation,
      fillManageLogicFunctionForm,
      openManageLogicFunctionsDialog,
      saveManagedLogicFunction,
      deleteManagedLogicFunction,
      exportLogicFunctionLibrary,
      openLogicFunctionImport,
      closeLogicFunctionImport,
      importLogicFunctionLibrary,
      initializeLogicFunctionLibrary,
      // 内部共用
      setDialogError,
      openDialog,
    });
  }

  return Object.freeze({ create });
});
