(function exposeLifeStack(root, factory) {
  const isNode = typeof module === "object" && module.exports;
  const api = factory(
    isNode ? require("./life-engine.js") : root.LifeEngine,
    isNode ? require("./life-tiles.js") : root.LifeTiles,
  );
  if (isNode) module.exports = api;
  else root.LifeStack = api;
})(globalThis, function createLifeStack(Life, Tiles) {
  "use strict";

  const MAX_SIDE = 64;
  const MAX_STEPS = 32;
  const MOVE_KEYS = ["KeyW", "KeyA", "KeyS", "KeyD", "Space", "KeyF"];

  function coordinates(key) {
    return key.split(",").map(Number);
  }

  function cellBounds(world) {
    const tiled = Tiles.describeWorld(world);
    if (!tiled) return Life.bounds(world);
    if (!tiled.population) return null;
    const { minRow, maxRow, minColumn, maxColumn } = tiled.bounds;
    const size = Tiles.TILE_SIZE;
    return {
      minRow: minRow * size,
      maxRow: (maxRow + 1) * size - 1,
      minColumn: minColumn * size,
      maxColumn: (maxColumn + 1) * size - 1,
    };
  }

  function mergeBounds(earlier, current) {
    if (!earlier || !current) return earlier ?? current;
    return {
      minRow: Math.min(earlier.minRow, current.minRow),
      maxRow: Math.max(earlier.maxRow, current.maxRow),
      minColumn: Math.min(earlier.minColumn, current.minColumn),
      maxColumn: Math.max(earlier.maxColumn, current.maxColumn),
    };
  }

  function blockBounds(bounds, pitch) {
    return {
      minRow: Math.floor(bounds.minRow / pitch),
      maxRow: Math.floor(bounds.maxRow / pitch),
      minColumn: Math.floor(bounds.minColumn / pitch),
      maxColumn: Math.floor(bounds.maxColumn / pitch),
    };
  }

  function blockKey(row, column, pitch) {
    return Math.floor(row / pitch) + "," + Math.floor(column / pitch);
  }

  function collectBlocks(world, bounds, pitch) {
    const blocks = new Set();
    const visit = (row, column) => blocks.add(blockKey(row, column, pitch));
    if (bounds && world.visitVisibleCells) {
      world.visitVisibleCells(bounds, visit, (row, column, size) => {
        // Both sizes are powers of two and share the same origin.
        if (pitch < size) return false;
        visit(row, column);
        return true;
      });
    } else if (bounds) {
      for (const key of world.cells) visit(...coordinates(key));
    }
    return blocks;
  }

  async function buildStack(snapshot, steps, {
    isCurrent = () => true, onProgress = () => {}, yieldFrame = () => Promise.resolve(),
  } = {}) {
    if (!Number.isInteger(steps) || steps < 1 || steps > MAX_STEPS) {
      throw new RangeError("后续代数须为 1–" + MAX_STEPS + " 的整数。");
    }

    const { generation, rule, pruneGliders } = snapshot;
    const useTiles = rule === Life.DEFAULT_RULE;
    let world = snapshot.world;
    let bounds = null;
    let pitch = 1;
    const frames = [];
    for (let index = 0; index <= steps; index += 1) {
      await yieldFrame();
      if (!isCurrent()) return null;
      if (index) {
        world = (useTiles ? Tiles.nextGeneration(world) : null) ?? Life.nextGeneration(world, rule);
        if (useTiles && pruneGliders) {
          world = Tiles.pruneOutlyingGliders(world) ?? Life.pruneOutlyingGliders(world);
        }
      }
      const current = cellBounds(world);
      bounds = mergeBounds(bounds, current);
      if (bounds) {
        const previousPitch = pitch;
        let blocks = blockBounds(bounds, pitch);
        while (blocks.maxRow - blocks.minRow >= MAX_SIDE || blocks.maxColumn - blocks.minColumn >= MAX_SIDE) {
          pitch *= 2;
          blocks = blockBounds(bounds, pitch);
        }
        if (pitch !== previousPitch) {
          const ratio = pitch / previousPitch;
          for (let earlier = 0; earlier < frames.length; earlier += 1) {
            frames[earlier] = new Set(Array.from(frames[earlier], (key) => blockKey(...coordinates(key), ratio)));
          }
        }
      }
      frames.push(collectBlocks(world, current, pitch));
      // The first frame uses the original world. Prepare a tiled copy for subsequent generations.
      if (!index && useTiles) world = Tiles.prepare(world);
      onProgress(index + 1);
    }

    return {
      generation,
      pitch,
      bounds: bounds ? blockBounds(bounds, pitch) : { minRow: 0, maxRow: 2, minColumn: 0, maxColumn: 2 },
      layers: frames.map((blocks) => Array.from(blocks, coordinates)),
    };
  }

  function createDialog({ dialog, form, closeButton, resetViewButton, canvas, status, steps, rotation, elevation }) {
    const view = { x: 0, y: 0, z: 0, yaw: 0, tilt: 0 };
    const held = new Set();
    let snapshot;
    let stack;
    let renderer;
    let request = 0;
    let pendingDraw = false;
    let lastFrame = null;
    let drag;

    function move(seconds) {
      const forward = Number(held.has("KeyW")) - Number(held.has("KeyS"));
      const right = Number(held.has("KeyD")) - Number(held.has("KeyA"));
      const up = Number(held.has("Space")) - Number(held.has("KeyF"));
      const length = Math.hypot(forward, right, up);
      if (!length) return;
      const distance = seconds * Math.max(2, renderer.radius * 0.8) / length;
      const sin = Math.sin(view.yaw);
      const cos = Math.cos(view.yaw);
      view.x += distance * (right * cos - forward * sin);
      view.y += distance * up;
      view.z -= distance * (right * sin + forward * cos);
    }

    function updateView() {
      if (!renderer || !dialog.open || pendingDraw) return;
      pendingDraw = true;
      window.requestAnimationFrame((time) => {
        pendingDraw = false;
        if (!renderer || !dialog.open) return;
        view.yaw = rotation.valueAsNumber * Math.PI / 180;
        view.tilt = elevation.valueAsNumber * Math.PI / 180;
        if (stack && held.size) {
          move(Math.max(0, Math.min((time - lastFrame) / 1000, 0.05)));
          lastFrame = time;
          updateView();
        }
        renderer.draw(view);
      });
    }

    function stopMoving() {
      held.clear();
      lastFrame = null;
    }

    function resetView() {
      stopMoving();
      view.x = view.y = view.z = 0;
      rotation.value = rotation.defaultValue;
      elevation.value = elevation.defaultValue;
      updateView();
    }

    function showStackStatus() {
      if (!renderer) {
        status.textContent = "此浏览器未能启动 WebGL 2，无法显示立方体。";
      } else if (stack) {
        const count = stack.layers.length;
        const detail = stack.pitch > 1 ? ` · 每个区块 ${stack.pitch} × ${stack.pitch} 格` : "";
        status.textContent = `第 ${stack.generation}–${stack.generation + count - 1} 代 · ${count} 层${detail}`;
      }
    }

    async function generate() {
      if (!renderer) {
        showStackStatus();
        return;
      }
      const token = ++request;
      const count = steps.valueAsNumber;
      const isCurrent = () => token === request && dialog.open;
      stack = null;
      renderer.setStack(null);
      stopMoving();
      updateView();
      status.textContent = "正在生成…";
      try {
        const result = await buildStack(snapshot, count, {
          isCurrent,
          onProgress: (done) => { status.textContent = `正在生成 ${done}/${count + 1} 层…`; },
          yieldFrame: () => new Promise((resolve) => window.setTimeout(resolve, 0)),
        });
        if (!result || !isCurrent()) return;
        stack = result;
        renderer?.setStack(stack);
        showStackStatus();
        updateView();
      } catch (error) {
        if (isCurrent()) status.textContent = "生成失败。" + error.message;
      }
    }

    form.addEventListener("submit", (event) => {
      event.preventDefault();
      canvas.focus({ preventScroll: true });
      void generate();
    });
    closeButton.addEventListener("click", () => dialog.close());
    resetViewButton.addEventListener("click", () => {
      resetView();
      canvas.focus({ preventScroll: true });
    });
    dialog.addEventListener("close", () => {
      if (dialog.open) return;
      request += 1;
      snapshot = null;
      stack = null;
      drag = null;
      stopMoving();
      renderer?.setStack(null);
    });
    rotation.addEventListener("input", updateView);
    elevation.addEventListener("input", updateView);
    new ResizeObserver(updateView).observe(canvas);
    canvas.addEventListener("keydown", (event) => {
      if (!MOVE_KEYS.includes(event.code) || event.ctrlKey || event.altKey || event.metaKey || event.isComposing) return;
      event.preventDefault();
      if (!stack || !renderer || event.repeat) return;
      held.add(event.code);
      if (lastFrame === null) {
        move(0.06);
        lastFrame = window.performance.now();
      }
      updateView();
    });
    canvas.addEventListener("keyup", (event) => {
      if (!held.delete(event.code)) return;
      event.preventDefault();
      if (!held.size) lastFrame = null;
    });
    canvas.addEventListener("blur", stopMoving);
    window.addEventListener("blur", stopMoving);
    canvas.addEventListener("webglcontextlost", (event) => {
      event.preventDefault();
      stopMoving();
      renderer = null;
      if (dialog.open) status.textContent = "正在恢复三维图形…";
    });
    canvas.addEventListener("webglcontextrestored", () => {
      renderer = window.LifeStackRenderer.create(canvas);
      renderer?.setStack(stack);
      if (dialog.open) showStackStatus();
      updateView();
    });
    canvas.addEventListener("pointerdown", (event) => {
      if (!event.isPrimary || event.button !== 0) return;
      canvas.focus({ preventScroll: true });
      canvas.setPointerCapture(event.pointerId);
      drag = { pointerId: event.pointerId, x: event.clientX, y: event.clientY };
    });
    canvas.addEventListener("pointermove", (event) => {
      if (drag?.pointerId !== event.pointerId) return;
      const angle = rotation.valueAsNumber + (event.clientX - drag.x);
      rotation.value = String(Math.round((angle % 360 + 360) % 360));
      elevation.value = String(Math.round(elevation.valueAsNumber + (event.clientY - drag.y) / 2));
      drag.x = event.clientX;
      drag.y = event.clientY;
      updateView();
    });
    canvas.addEventListener("lostpointercapture", () => { drag = null; });

    return {
      open(current) {
        snapshot = current;
        dialog.showModal();
        canvas.focus({ preventScroll: true });
        renderer ??= window.LifeStackRenderer.create(canvas);
        resetView();
        void generate();
      },
    };
  }

  return Object.freeze({ buildStack, createDialog });
});
