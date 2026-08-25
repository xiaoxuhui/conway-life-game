(function exposeRenderer(root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  root.LifeRenderer = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function createRendererModule() {
  "use strict";

  const DEFAULT_CELL_SIZE = 16;
  const MIN_CELL_SIZE = 0.0001;
  const MAX_CELL_SIZE = 1024;

  function clamp(value, minimum, maximum) {
    return Math.min(maximum, Math.max(minimum, value));
  }

  function createCamera(overrides = {}) {
    return {
      centerRow: Number.isFinite(overrides.centerRow) ? overrides.centerRow : 0,
      centerColumn: Number.isFinite(overrides.centerColumn) ? overrides.centerColumn : 0,
      cellSize: clamp(
        Number.isFinite(overrides.cellSize) ? overrides.cellSize : DEFAULT_CELL_SIZE,
        MIN_CELL_SIZE,
        MAX_CELL_SIZE,
      ),
    };
  }

  function screenToWorld(point, viewport, camera) {
    return {
      row: camera.centerRow + (point.y - viewport.height / 2) / camera.cellSize,
      column: camera.centerColumn + (point.x - viewport.width / 2) / camera.cellSize,
    };
  }

  function worldToScreen(coordinate, viewport, camera) {
    return {
      x: (coordinate.column - camera.centerColumn) * camera.cellSize + viewport.width / 2,
      y: (coordinate.row - camera.centerRow) * camera.cellSize + viewport.height / 2,
    };
  }

  function cellAtPoint(point, viewport, camera) {
    const world = screenToWorld(point, viewport, camera);
    return { row: Math.floor(world.row), column: Math.floor(world.column) };
  }

  function zoomCameraAt(camera, point, viewport, factor) {
    if (!Number.isFinite(factor) || factor <= 0) throw new RangeError("缩放比例必须为正数");
    const anchor = screenToWorld(point, viewport, camera);
    const cellSize = clamp(camera.cellSize * factor, MIN_CELL_SIZE, MAX_CELL_SIZE);
    return createCamera({
      centerRow: anchor.row - (point.y - viewport.height / 2) / cellSize,
      centerColumn: anchor.column - (point.x - viewport.width / 2) / cellSize,
      cellSize,
    });
  }

  function panCamera(camera, deltaX, deltaY) {
    return createCamera({
      centerRow: camera.centerRow - deltaY / camera.cellSize,
      centerColumn: camera.centerColumn - deltaX / camera.cellSize,
      cellSize: camera.cellSize,
    });
  }

  function fitCamera(bounds, viewport, paddingRatio = 0.12) {
    if (!bounds) return createCamera();
    const availableWidth = Math.max(1, viewport.width * (1 - paddingRatio * 2));
    const availableHeight = Math.max(1, viewport.height * (1 - paddingRatio * 2));
    const worldWidth = Math.max(1, bounds.maxColumn - bounds.minColumn + 1);
    const worldHeight = Math.max(1, bounds.maxRow - bounds.minRow + 1);
    const comfortableMaximum = 64;
    return createCamera({
      centerRow: (bounds.minRow + bounds.maxRow + 1) / 2,
      centerColumn: (bounds.minColumn + bounds.maxColumn + 1) / 2,
      cellSize: Math.min(availableWidth / worldWidth, availableHeight / worldHeight, comfortableMaximum),
    });
  }

  function logicOutputLabel(output) {
    if (output.result === null || output.result === undefined) {
      return `O=? · 第 ${output.observeGeneration} 代`;
    }
    return `O=${Number(Boolean(output.result))}`;
  }

  function create(canvas) {
    if (!(canvas instanceof HTMLCanvasElement)) throw new TypeError("需要有效的 Canvas 元素");
    const context = canvas.getContext("2d", { alpha: false });
    let latestWorld = null;
    let latestCamera = createCamera();
    let latestDisabled = false;
    let latestPlacement = null;
    let latestLogicOutputs = [];

    function viewport() {
      const bounds = canvas.getBoundingClientRect();
      return { width: Math.max(1, bounds.width), height: Math.max(1, bounds.height) };
    }

    function resizeForDisplay() {
      const ratio = Math.min(window.devicePixelRatio || 1, 2);
      const bounds = viewport();
      const width = Math.max(1, Math.round(bounds.width * ratio));
      const height = Math.max(1, Math.round(bounds.height * ratio));
      if (canvas.width !== width || canvas.height !== height) {
        canvas.width = width;
        canvas.height = height;
      }
      return ratio;
    }

    function drawGrid(camera, ratio) {
      const size = camera.cellSize * ratio;
      if (camera.cellSize < 6) return;
      const viewWidth = canvas.width / ratio;
      const viewHeight = canvas.height / ratio;
      const minColumn = Math.floor(camera.centerColumn - viewWidth / camera.cellSize / 2) - 1;
      const maxColumn = Math.ceil(camera.centerColumn + viewWidth / camera.cellSize / 2) + 1;
      const minRow = Math.floor(camera.centerRow - viewHeight / camera.cellSize / 2) - 1;
      const maxRow = Math.ceil(camera.centerRow + viewHeight / camera.cellSize / 2) + 1;

      context.beginPath();
      context.lineWidth = Math.max(0.5, ratio * 0.5);
      context.strokeStyle = latestDisabled ? "rgba(74, 103, 94, 0.30)" : "rgba(74, 103, 94, 0.46)";
      for (let column = minColumn; column <= maxColumn; column += 1) {
        const x = (column - camera.centerColumn) * size + canvas.width / 2;
        context.moveTo(Math.round(x) + 0.5, 0);
        context.lineTo(Math.round(x) + 0.5, canvas.height);
      }
      for (let row = minRow; row <= maxRow; row += 1) {
        const y = (row - camera.centerRow) * size + canvas.height / 2;
        context.moveTo(0, Math.round(y) + 0.5);
        context.lineTo(canvas.width, Math.round(y) + 0.5);
      }
      context.stroke();

      const originX = (0 - camera.centerColumn) * size + canvas.width / 2;
      const originY = (0 - camera.centerRow) * size + canvas.height / 2;
      context.beginPath();
      context.strokeStyle = "rgba(118, 242, 188, 0.22)";
      context.lineWidth = Math.max(1, ratio);
      if (originX >= 0 && originX <= canvas.width) {
        context.moveTo(originX, 0);
        context.lineTo(originX, canvas.height);
      }
      if (originY >= 0 && originY <= canvas.height) {
        context.moveTo(0, originY);
        context.lineTo(canvas.width, originY);
      }
      context.stroke();
    }

    function drawCells(world, camera, ratio) {
      const size = camera.cellSize * ratio;
      const minimumPixel = Math.max(1, ratio);
      context.fillStyle = latestDisabled ? "#78b79b" : "#76f2bc";

      for (const key of world.cells) {
        const separator = key.indexOf(",");
        const row = Number(key.slice(0, separator));
        const column = Number(key.slice(separator + 1));
        const x = (column - camera.centerColumn) * size + canvas.width / 2;
        const y = (row - camera.centerRow) * size + canvas.height / 2;
        const drawSize = Math.max(minimumPixel, size);
        if (x + drawSize < 0 || y + drawSize < 0 || x > canvas.width || y > canvas.height) continue;

        if (camera.cellSize >= 2) {
          const inset = Math.max(0.45 * ratio, size * 0.07);
          context.fillRect(x + inset, y + inset, Math.max(minimumPixel, size - inset * 2), Math.max(minimumPixel, size - inset * 2));
        } else {
          context.fillRect(Math.round(x), Math.round(y), minimumPixel, minimumPixel);
        }
      }
    }

    function drawPlacementPreview(world, placement, camera, ratio) {
      if (!placement?.pattern) return;
      const size = camera.cellSize * ratio;
      const minimumPixel = Math.max(1, ratio);
      const drawSize = Math.max(minimumPixel, size);

      for (const [relativeRow, relativeColumn] of placement.pattern.cells) {
        const row = placement.row + relativeRow;
        const column = placement.column + relativeColumn;
        const x = (column - camera.centerColumn) * size + canvas.width / 2;
        const y = (row - camera.centerRow) * size + canvas.height / 2;
        if (x + drawSize < 0 || y + drawSize < 0 || x > canvas.width || y > canvas.height) continue;
        const overlaps = world.cells.has(`${row},${column}`);
        context.fillStyle = overlaps ? "rgba(255, 184, 108, 0.76)" : "rgba(118, 242, 188, 0.52)";
        if (camera.cellSize >= 2) {
          const inset = Math.max(0.45 * ratio, size * 0.07);
          context.fillRect(x + inset, y + inset, Math.max(minimumPixel, size - inset * 2), Math.max(minimumPixel, size - inset * 2));
        } else {
          context.fillRect(Math.round(x), Math.round(y), minimumPixel, minimumPixel);
        }
      }

      if (camera.cellSize >= 2) {
        const x = (placement.column - camera.centerColumn) * size + canvas.width / 2;
        const y = (placement.row - camera.centerRow) * size + canvas.height / 2;
        context.strokeStyle = "rgba(118, 242, 188, 0.72)";
        context.lineWidth = Math.max(1, ratio);
        context.setLineDash([Math.max(3, size * 0.28), Math.max(2, size * 0.16)]);
        context.strokeRect(x, y, placement.pattern.width * size, placement.pattern.height * size);
        context.setLineDash([]);
      }
    }

    function drawLogicOutputs(outputs, camera, ratio) {
      const size = camera.cellSize * ratio;
      for (const output of outputs) {
        if (!output.terminalCells?.length) continue;
        const rows = output.terminalCells.map(([row]) => row);
        const columns = output.terminalCells.map(([, column]) => column);
        const minRow = Math.min(...rows);
        const maxRow = Math.max(...rows);
        const minColumn = Math.min(...columns);
        const maxColumn = Math.max(...columns);
        const x = (minColumn - camera.centerColumn) * size + canvas.width / 2;
        const y = (minRow - camera.centerRow) * size + canvas.height / 2;
        const width = (maxColumn - minColumn + 1) * size;
        const height = (maxRow - minRow + 1) * size;
        const waiting = output.result === null || output.result === undefined;
        const color = waiting ? "#ffb86c" : output.result ? "#76f2bc" : "#c4d0ca";

        context.save();
        context.strokeStyle = color;
        context.lineWidth = Math.max(1.5 * ratio, Math.min(size * 0.13, 4 * ratio));
        context.setLineDash(waiting ? [Math.max(3 * ratio, size * 0.24), Math.max(2 * ratio, size * 0.14)] : []);
        context.strokeRect(x - size * 0.3, y - size * 0.3, width + size * 0.6, height + size * 0.6);
        context.setLineDash([]);

        if (camera.cellSize >= 2.5) {
          const fontSize = Math.max(11, Math.min(17, camera.cellSize * 0.72)) * ratio;
          context.font = `600 ${fontSize}px ui-monospace, SFMono-Regular, Consolas, monospace`;
          context.textBaseline = "bottom";
          context.fillStyle = color;
          context.fillText(logicOutputLabel(output), x - size * 0.3, y - size * 0.55);
        }
        context.restore();
      }
    }

    function draw(world, camera, disabled = false, placement = null, logicOutputs = []) {
      latestWorld = world;
      latestCamera = createCamera(camera);
      latestDisabled = disabled;
      latestPlacement = placement;
      latestLogicOutputs = logicOutputs;
      const ratio = resizeForDisplay();
      context.fillStyle = "#080d0c";
      context.fillRect(0, 0, canvas.width, canvas.height);
      drawGrid(latestCamera, ratio);
      drawCells(world, latestCamera, ratio);
      drawPlacementPreview(world, latestPlacement, latestCamera, ratio);
      drawLogicOutputs(latestLogicOutputs, latestCamera, ratio);
      if (disabled) {
        context.fillStyle = "rgba(5, 12, 9, 0.08)";
        context.fillRect(0, 0, canvas.width, canvas.height);
      }
    }

    function localPoint(event) {
      const bounds = canvas.getBoundingClientRect();
      return { x: event.clientX - bounds.left, y: event.clientY - bounds.top };
    }

    function coordinateFromPointer(event, camera) {
      return cellAtPoint(localPoint(event), viewport(), camera);
    }

    function worldFromPointer(event, camera) {
      return screenToWorld(localPoint(event), viewport(), camera);
    }

    function zoomAtPointer(event, camera, factor) {
      return zoomCameraAt(camera, localPoint(event), viewport(), factor);
    }

    const observer = new ResizeObserver(() => {
      if (latestWorld) draw(latestWorld, latestCamera, latestDisabled, latestPlacement, latestLogicOutputs);
    });
    observer.observe(canvas);

    return Object.freeze({
      coordinateFromPointer,
      draw,
      fit: (bounds) => fitCamera(bounds, viewport()),
      localPoint,
      viewport,
      worldFromPointer,
      zoomAtPointer,
    });
  }

  return Object.freeze({
    DEFAULT_CELL_SIZE,
    MAX_CELL_SIZE,
    MIN_CELL_SIZE,
    cellAtPoint,
    create,
    createCamera,
    fitCamera,
    logicOutputLabel,
    panCamera,
    screenToWorld,
    worldToScreen,
    zoomCameraAt,
  });
});
