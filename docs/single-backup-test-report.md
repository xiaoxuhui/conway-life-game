# Single-file backup verification — 2026-10-15

## Implemented behavior

- Homepage export/delete writes exactly one `conway-life-records-*.json`, containing both complete custom libraries in a `conway-life-record-backup` v1 envelope.
- Close and fresh read-back equality must succeed before clearing. Existing filename protection, bounded state-error retries, concurrent-change checks and cleanup rollback remain in place.
- Homepage import accepts one combined file, or the legacy one/two separate library files. Nested schemas and per-library capacities are checked before any storage write. Existing records win conflicts; repeated imports do not duplicate records.
- Combined input is bounded to 8 MB UTF-8; unknown versions, missing/corrupt libraries, mixed/duplicate sources and over-limit content are rejected.
- Single-library exports, current world, built-in patterns, preferences and Android assets are unchanged.

## Commands and actual evidence

- Red/green: initial `node --test tests/record-import.test.js` before implementation: 5 failures, including `Import.serializeBackup is not a function`; implemented result: 17/17 pass.
- `node --test tests/record-import.test.js tests/file-backup.test.js tests/static-app.test.js tests/logic-function-library.test.js tests/pattern-library.test.js`: 75/75 pass.
- `$webTestPaths = @(rg --files tests | Where-Object { $_ -notlike '*android-shell*' }); & node --test $webTestPaths`: 154/154 pass, 89.4 seconds. Android tests intentionally excluded.
- `node -e "require('node:child_process').execSync(require('./package.json').scripts.check, {stdio:'inherit'})"`: pass.
- `node node_modules/eslint/bin/eslint.js scripts`: pass.
- `git diff --check`: pass.
- Final full browser command: `node node_modules/@playwright/test/cli.js test --max-failures=2 --output=test-results/full-single-backup`: **140/140 passed (2.2m), exit 0**, desktop Chromium and Pixel 7 viewport. Runtime: Node v24.19.0, Playwright 1.62.1.

## Browser interaction coverage

- SB01: click homepage export, hold file close, prove both stores unchanged, block duplicate clicks/Escape, inspect a single actual test-disk JSON, release close/read, clear, import combined backup, reload and compare all fields. Current world remains unchanged through export/import.
- SB02: cancellation/unsupported API, create/write/close/read failures, empty/mismatched read-back, retryable and persistent state errors, storage cleanup failures and rollback, concurrent record changes.
- SB03: one empty library, both empty, old two-file imports and single-library imports, v1 function migration, duplicate import/conflict preservation, combined version/nested validation/mixed-source errors. Core additionally checks byte limits including a fake reported size.
- Native OPFS coverage: 33 patterns and 6 functions in one file larger than 2.5 MB, normal and one injected transient state failure; fresh read-back, existing sentinel unchanged, restore/reload. Tests use isolated browser storage and generated directories.
- Desktop and Pixel 7 screenshots inspected: homepage backup instructions and preview show complete text without horizontal overflow. Artifacts from final run are under `test-results/full-single-backup/`.

## Test orchestration incidents and limits

- First focused restricted-environment browser run reached the 98th test but did not exit normally; no complete-pass claim is made for that run.
- An initial full run reused that server. Stopping the old runner also stopped the reused server: 55 passed, 2 failed with `ERR_CONNECTION_REFUSED`, 83 did not run. This invalidated the run; failure artifacts were preserved under `test-results/interrupted-single-backup/`. Final acceptance uses a fresh independently managed server instead.
- Native OS directory chooser is simulated by the tests; injected file handles either write actual test-disk files or use real OPFS. This does not prove the Codex in-app browser Windows picker issue is fixed. No user browser records, `D:/aiden/conway-life` files or existing backups were edited/deleted.
- No Android build/sync, version bump or release tag.
- Remote main contained two maintenance-workflow commits absent locally (`f1e357f`, `be1fca1`); both were fetched and merged into this feature branch without dropping them.

## Delivery

All local acceptance checks completed. Feature merged to main without dropping the remote maintenance commits; `git push origin main` succeeded and `git ls-remote --heads origin main` matched local `f9cd0da6e7d39d3601fff479259601d6eec331bc`. This evidence-only follow-up is committed on the same feature branch and merged/pushed before deleting that branch. No other branch is cleaned up.
