(function exposeRenderer(root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) {
    module.exports = api;
  }
  root.LifeRenderer = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function createRendererModule() {
  "use strict";

  function create(canvas) {
    if (!(canvas instanceof HTMLCanvasElement)) {
      throw new TypeError("需要有效的 Canvas 元素");
    }
    const context = canvas.getContext("2d", { alpha: false });
    let currentBoard = null;
    let currentDisabled = false;

    function resizeForDisplay(board) {
      const ratio = Math.min(window.devicePixelRatio || 1, 2);
      const bounds = canvas.getBoundingClientRect();
      const width = Math.max(1, Math.round(bounds.width * ratio));
      const height = Math.max(1, Math.round((bounds.width * board.rows / board.columns) * ratio));
      canvas.style.aspectRatio = `${board.columns} / ${board.rows}`;
      if (canvas.width !== width || canvas.height !== height) {
        canvas.width = width;
        canvas.height = height;
      }
    }

    function draw(board, disabled = false) {
      currentBoard = board;
      currentDisabled = disabled;
      resizeForDisplay(board);

      const cellWidth = canvas.width / board.columns;
      const cellHeight = canvas.height / board.rows;
      context.fillStyle = "#080d0c";
      context.fillRect(0, 0, canvas.width, canvas.height);

      context.fillStyle = disabled ? "#78b79b" : "#76f2bc";
      for (let row = 0; row < board.rows; row += 1) {
        for (let column = 0; column < board.columns; column += 1) {
          if (board.cells[row * board.columns + column] === 1) {
            const inset = Math.max(0.55, Math.min(cellWidth, cellHeight) * 0.08);
            context.fillRect(
              column * cellWidth + inset,
              row * cellHeight + inset,
              Math.max(0, cellWidth - inset * 2),
              Math.max(0, cellHeight - inset * 2),
            );
          }
        }
      }

      if (Math.min(cellWidth, cellHeight) >= 5) {
        context.beginPath();
        context.strokeStyle = disabled ? "rgba(74, 103, 94, 0.34)" : "rgba(74, 103, 94, 0.48)";
        context.lineWidth = Math.max(1, window.devicePixelRatio || 1) * 0.5;
        for (let column = 1; column < board.columns; column += 1) {
          const x = Math.round(column * cellWidth) + 0.5;
          context.moveTo(x, 0);
          context.lineTo(x, canvas.height);
        }
        for (let row = 1; row < board.rows; row += 1) {
          const y = Math.round(row * cellHeight) + 0.5;
          context.moveTo(0, y);
          context.lineTo(canvas.width, y);
        }
        context.stroke();
      }

      if (disabled) {
        context.fillStyle = "rgba(5, 12, 9, 0.08)";
        context.fillRect(0, 0, canvas.width, canvas.height);
      }
    }

    function coordinateFromPointer(event, board) {
      const bounds = canvas.getBoundingClientRect();
      if (!bounds.width || !bounds.height) return null;
      const column = Math.floor((event.clientX - bounds.left) / bounds.width * board.columns);
      const row = Math.floor((event.clientY - bounds.top) / bounds.height * board.rows);
      if (row < 0 || row >= board.rows || column < 0 || column >= board.columns) return null;
      return { row, column };
    }

    const observer = new ResizeObserver(() => {
      if (currentBoard) draw(currentBoard, currentDisabled);
    });
    observer.observe(canvas);

    return Object.freeze({ draw, coordinateFromPointer });
  }

  return Object.freeze({ create });
});
