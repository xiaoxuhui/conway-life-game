# Configurable two-state rules

- **Status**: PENDING
- **Approved**: 2026-10-20 用户要求添加规则设置，支持 B3/S23、S3/B23/C2 等格式切换。
- **Type**: feature

## R1 Rules engine and world archive `[VERIFIED]`

- **Objective**: Parse B/S in either order with optional C2, format three notations, evolve with explicit rules and preserve rules in v3 world archives while reading v1/v2 as Conway.
- **Definition of Done**: `node --test tests/rules.test.js` and `node tools/verify-rules.cjs` pass; enumerate all 512 3×3 neighborhoods against an independent dense oracle, including every supported birth/survival neighbor count.
- **Files**: scripts/life-engine.js, tests/rules.test.js, tools/verify-rules.cjs, package.json.
- **Evidence**: `node --test tests/rules.test.js`: 6/6 pass. `node tools/verify-rules.cjs`: 22 rules × 512 neighborhoods = 11,264 transitions, all match the independent dense oracle. Before implementation all six new tests failed.

## R2 Settings UI and logic safety `[COMPLETE]`

- **Objective**: Explicitly apply/reset a rule, switch display notation without changing active semantics, pause while preserving cells/generation, update summaries/export/import, and prevent Conway-only logic assertions under a custom rule.
- **Definition of Done**: `node --test tests/static-app.test.js tests/rules.test.js` passes; desktop/mobile `e2e/rules.spec.js` verifies format switching, actual evolution, invalid input, running/undo state, archives and logic guards with no page errors/overflow.
- **Files**: index.html, styles/main.css, scripts/app.js, tests/static-app.test.js, e2e/rules.spec.js.

## R3 Acceptance and delivery `[PENDING]`

- **Objective**: Verify existing gameplay/backup behavior and document limitations before normal short-branch merge/push/cleanup.
- **Definition of Done**: All web Node tests (Android excluded), full desktop/mobile Playwright, syntax/lint/diff checks pass; screenshots inspected; remote main checked and preserved, push verified with `git ls-remote` before deleting only this branch.
- **Files**: README.md, CHANGELOG.md, docs/requirements.md, docs/technical-design.md, docs/configurable-rules-plan.md, docs/configurable-rules-test-report.md.

## Boundaries

- Two states only (C2); reject C>2 and B0 explicitly, since the sparse infinite-world representation cannot enumerate infinite births on an empty background.
- World save format v3 includes canonical rule; old clients must reject v3 rather than silently running it as Conway. Libraries and their combined backup remain independent of world rules.
- Default is B3/S23; switching preserves cells and generation, pauses, cancels pending placement/generation and clears obsolete logic annotations/clear-undo. No local-storage preference write is added; importing a world restores its rule.
- Logic generation requires default Conway rule; built-in pattern placement is still possible as an experiment but does not latch logic results under custom rules. UI clearly warns about validity.
- Web first: no Android assets/APK, tags or user browser-data changes.
