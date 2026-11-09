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

  function draw(canvas, stack, yaw, tilt) {
    const { width, height } = canvas.getBoundingClientRect();
    if (!width || !height) return;
    const density = window.devicePixelRatio || 1;
    canvas.width = Math.round(width * density);
    canvas.height = Math.round(height * density);
    const ctx = canvas.getContext("2d");
    ctx.scale(density, density);
    if (!stack) return;

    const { minRow, maxRow, minColumn, maxColumn } = stack.bounds;
    const rows = maxRow - minRow + 1;
    const columns = maxColumn - minColumn + 1;
    const layerGap = Math.max(1, Math.max(rows, columns) / 20);
    const rise = layerGap * (stack.layers.length - 1);
    const cos = Math.cos(yaw);
    const sin = Math.sin(yaw);
    const slope = Math.sin(tilt);
    const lift = Math.cos(tilt);
    const scale = Math.min(
      width * 0.9 / (Math.abs(cos) * columns + Math.abs(sin) * rows),
      height * 0.9 / (slope * (Math.abs(sin) * columns + Math.abs(cos) * rows) + lift * rise),
      32,
    );
    const centerX = width / 2;
    const centerY = (height + scale * lift * rise) / 2;
    const xColumn = scale * cos;
    const xRow = -scale * sin;
    const yColumn = scale * slope * sin;
    const yRow = scale * slope * cos;
    const originX = centerX - (columns * xColumn + rows * xRow) / 2;
    const originY = centerY - (columns * yColumn + rows * yRow) / 2;

    function quad(x, y, across, down) {
      ctx.moveTo(x, y);
      ctx.lineTo(x + across * xColumn, y + across * yColumn);
      ctx.lineTo(x + across * xColumn + down * xRow, y + across * yColumn + down * yRow);
      ctx.lineTo(x + down * xRow, y + down * yRow);
      ctx.closePath();
    }

    stack.layers.forEach((cells, index) => {
      const y = originY - index * layerGap * lift * scale;
      ctx.strokeStyle = index === 0 || index === stack.layers.length - 1 ? "#638a7e" : "#2c4a44";
      ctx.beginPath();
      quad(originX, y, columns, rows);
      ctx.stroke();

      const age = index / (stack.layers.length - 1);
      ctx.fillStyle = `hsl(${205 - age * 60} 73% ${56 + age * 18}% / 0.92)`;
      const inset = scale < 2 ? 0 : 0.08;
      ctx.beginPath();
      for (const [row, column] of cells) {
        const c = column - minColumn + inset;
        const r = row - minRow + inset;
        quad(originX + c * xColumn + r * xRow, y + c * yColumn + r * yRow, 1 - inset * 2, 1 - inset * 2);
      }
      ctx.fill();
    });
  }

  function createDialog({ dialog, form, closeButton, canvas, status, steps, rotation, elevation }) {
    let snapshot;
    let stack;
    let request = 0;
    let pendingDraw = false;
    let drag;

    function updateView() {
      if (!dialog.open || pendingDraw) return;
      pendingDraw = true;
      window.requestAnimationFrame(() => {
        pendingDraw = false;
        if (dialog.open) draw(canvas, stack, rotation.valueAsNumber * Math.PI / 180, elevation.valueAsNumber * Math.PI / 180);
      });
    }

    async function generate() {
      const token = ++request;
      const count = steps.valueAsNumber;
      const isCurrent = () => token === request && dialog.open;
      stack = null;
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
        const detail = result.pitch > 1 ? ` · 每个区块 ${result.pitch} × ${result.pitch} 格` : "";
        status.textContent = `第 ${result.generation}–${result.generation + count} 代 · ${result.layers.length} 层${detail}`;
        updateView();
      } catch (error) {
        if (isCurrent()) status.textContent = "生成失败。" + error.message;
      }
    }

    form.addEventListener("submit", (event) => {
      event.preventDefault();
      void generate();
    });
    closeButton.addEventListener("click", () => dialog.close());
    dialog.addEventListener("close", () => {
      if (dialog.open) return;
      request += 1;
      snapshot = null;
      stack = null;
      drag = null;
    });
    rotation.addEventListener("input", updateView);
    elevation.addEventListener("input", updateView);
    new ResizeObserver(updateView).observe(canvas);
    canvas.addEventListener("pointerdown", (event) => {
      if (!event.isPrimary || event.button !== 0) return;
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
        void generate();
      },
    };
  }

  return Object.freeze({ buildStack, createDialog });
});
