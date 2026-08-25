(function exposeSpeedControl(root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  root.SpeedControl = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function createSpeedControl() {
  "use strict";

  const MIN_SPEED = 1;
  const MAX_SPEED = 1000;
  const DEFAULT_SPEED = 5;
  const FRAME_COMPUTE_BUDGET_MS = 10;
  const MAX_FRAME_DELTA_MS = 250;
  const MAX_BACKLOG_SECONDS = 0.25;
  const ACTUAL_SPEED_WINDOW_MS = 500;

  function numericValue(value) {
    if (typeof value === "string" && value.trim() === "") return null;
    const number = Number(value);
    return Number.isFinite(number) ? number : null;
  }

  function isValidInput(value) {
    const number = numericValue(value);
    return number !== null
      && Number.isInteger(number)
      && number >= MIN_SPEED
      && number <= MAX_SPEED;
  }

  function normalize(value, fallback = DEFAULT_SPEED) {
    const number = numericValue(value);
    if (number === null) return isValidInput(fallback) ? Number(fallback) : DEFAULT_SPEED;
    return Math.min(MAX_SPEED, Math.max(MIN_SPEED, Math.round(number)));
  }

  function accumulate(current, elapsedMs, speed) {
    const accumulator = Number.isFinite(current) ? Math.max(0, current) : 0;
    const elapsed = Number.isFinite(elapsedMs)
      ? Math.min(MAX_FRAME_DELTA_MS, Math.max(0, elapsedMs))
      : 0;
    const target = normalize(speed, DEFAULT_SPEED);
    const backlogLimit = Math.max(1, target * MAX_BACKLOG_SECONDS);
    return Math.min(backlogLimit, accumulator + elapsed * target / 1000);
  }

  return Object.freeze({
    ACTUAL_SPEED_WINDOW_MS, DEFAULT_SPEED, FRAME_COMPUTE_BUDGET_MS,
    MAX_BACKLOG_SECONDS, MAX_FRAME_DELTA_MS, MAX_SPEED, MIN_SPEED,
    accumulate, isValidInput, normalize,
  });
});
