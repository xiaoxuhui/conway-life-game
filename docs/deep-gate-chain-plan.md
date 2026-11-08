# Deep logic gate chains

- **Status**: VERIFIED
- **Approved**: 2026-11-08 用户确认独立门体逐级相接，并要求实现。
- **Type**: feature

## DG1 Expand the nesting limits `[VERIFIED]`

- **Objective**: Allow up to 32 layers of basic gates and 32 nested saved definitions; keep the existing source and expansion size limits and reject cyclic calls.
- **Definition of Done**: Run the parser/expander regressions in `node --test tests/logic-code.test.js`; cover 8, 9, 16 and 32 layers and the failure at 33.
- **Files**: scripts/logic-parse.js, scripts/logic-expand.js, tests/logic-code.test.js.
- **Evidence**: Both new parser tests failed at the former limit before implementation and then passed at 32. Layer 33 and a circular saved definition were rejected.

## DG2 Connect independent gates along one row `[VERIFIED]`

- **Objective**: Build single-path gate chains from individual gate kits, using real direct glider routes when possible and compatible reflectors otherwise. Keep the existing branch routing for expressions with two gate-valued inputs.
- **Definition of Done**: Regression tests in `tests/logic-code.test.js` must evolve a three-gate chain and a chain beyond eight layers, verify one ordered anchor per gate, one probe per edge, the final output and safety. Removing an upstream signal source must alter a downstream connection.
- **Files**: scripts/logic-compile.js, scripts/logic-code.js, scripts/logic-safety.js, tests/logic-code.test.js.
- **Evidence**: The 9, 16 and 32 stage direct chains passed actual evolution, with 8, 15 and 31 links respectively. Removing only the source gun broke the first link in the nine-stage case. A mixed nine-stage chain used four reflectors and passed both inputs.

## DG3 Verify the web version `[VERIFIED]`

- **Objective**: Confirm generation and cancellation on desktop and mobile, including the existing XOR and larger branched cases.
- **Definition of Done**: Run syntax/lint checks, the web Node suite and desktop/mobile Playwright. Report the depths actually simulated. Android follows web acceptance.
- **Files**: e2e/app.smoke.spec.js, index.html, scripts/app.js, README.md, CHANGELOG.md, docs/requirements.md, docs/technical-design.md, docs/deep-gate-chain-test-report.md.
- **Evidence**: Web Node 163/163 and desktop/mobile Chromium 158/158; syntax, lint and diff checks passed. See [test report](deep-gate-chain-test-report.md).
