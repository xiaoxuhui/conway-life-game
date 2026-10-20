# Configurable rules — verification 2026-10-20

## Delivered behavior

- Explicit B/S fields in either order, optional C2, three notation display choices. Whitespace/case/order normalize without swapping birth/survival semantics. Empty sets and S0 work; malformed/duplicate/out-of-range fields, B0 and C>2 are rejected.
- Applying/resetting pauses and preserves cells, generation and camera. Invalid drafts leave active rule, world and running state unchanged. Formatting changes the draft, not active semantics.
- Single-step and RAF evolution use the active rule. Random/placement/clear do not reset the selected rule; switching invalidates obsolete clear-undo and logic metadata. Page reload defaults to Conway (no new local-storage preference writes).
- World archive v3 includes canonical rule; v1/v2 read as Conway. Invalid/missing v3 rules fail before any world mutation. Library/combined backups are unchanged.
- Logic compilation/safety retain default Conway physics. Custom worlds cannot generate circuits; old pending generation is aborted without stale preview, and manual gate placement creates no misleading output latches. Restoring default enables generation again.

## Actual evidence

- Red/green `node --test tests/rules.test.js`: old code fails all 6 new tests (missing API, unchanged evolution and v2 archive); implementation passes 6/6.
- `node tools/verify-rules.cjs`: `{"rules":22,"neighborhoods":512,"transitions":11264}`. Independent dense 5×5 oracle vs sparse engine for every 3×3 layout, each possible supported birth count (1–8), survival count (0–8), empty/full and compound rules. Does not reuse engine parser/counts for expected results.
- `node --test tests/rules.test.js tests/static-app.test.js`: 24/24 pass.
- `node node_modules/@playwright/test/cli.js test e2e/rules.spec.js --max-failures=2 --output=test-results/rules-focused`: 16/16 pass, 24.7s; desktop Chromium and Pixel 7 viewport.
- Syntax checks: existing package check command plus `node --check e2e/rules.spec.js` and `node --check tools/verify-rules.cjs`: pass.
- `node node_modules/eslint/bin/eslint.js scripts`, `git diff --check`: pass.
- All web Node tests (Android excluded) and full browser suite: pending completion when this report was created.

## Browser coverage

- Formats: BS/SB/SBC2 conversions, explicit apply, actual active header/summary/ARIA text, reset, no horizontal overflow, screenshots of desktop/mobile rule settings.
- Evolution: default block remains 4 cells; B23/S3 block becomes 12; B2/S becomes 8; B/S0 single cell survives. Controlled RAF clock verifies apply pauses without advancing, resume uses new rule.
- Invalid rules while running do not stop/change the world; editing in the input does not fire game shortcuts.
- Native download world JSON inspected for exact v3 rule/cells/generation/view; import restores it; old v2 resets default; bad v3 import preserves prior world.
- Logic generation disabled and direct form submission guarded under custom rules; manual placement produces no O=?/O=0/1 metadata; pending real nested validation is cancelled, default generation remains available.
- Clear/undo/random preserve rule; switching clears obsolete undo; refresh defaults to Conway as documented.
- Screenshots: `test-results/rules-focused/**/rule-settings.png` and `rules-homepage.png`. All automated sessions use isolated data, not the user's browser records.

## Boundaries and delivery

- Two-state sparse infinite world only; B0 and C>2 explicitly unsupported. No claims of arbitrary Generations/multistate support.
- No Android asset sync/APK, version tag or user data/backup deletion. Existing browser directory-write issue is unrelated and not claimed fixed.
- Main merge/push verification pending final acceptance.
