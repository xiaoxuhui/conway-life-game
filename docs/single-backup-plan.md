# Single-file record backup

- **Status**: PENDING
- **Approved**: 2026-10-15 用户要求全部导出默认保存在一个文件中。
- **Type**: feature

## S1 Versioned backup envelope `[VERIFIED]`

- **Objective**: Serialize both custom libraries into one JSON; import that file or the legacy one/two library files without overwriting local records.
- **Definition of Done**: `node --test tests/record-import.test.js` passes; cover round trip, empty libraries, nested validation, unsupported version, size limits and mixed/duplicate files.
- **Files**: scripts/record-import.js, tests/record-import.test.js.
- **Evidence**: `node --test tests/record-import.test.js`: 17/17 pass (2026-10-15). Before implementation: 5 expected failures including missing serializeBackup.

## S2 Homepage integration `[COMPLETE]`

- **Objective**: Export exactly one new file, close and read it back before clearing; preserve cancellation, retry, concurrent-change and rollback protections. Display accurate instructions.
- **Definition of Done**: Related Node tests and desktop/mobile Playwright tests pass, including held close/read, failures, disk contents, restore/reload and large OPFS backup; syntax/lint pass.
- **Files**: scripts/dialogs.js, index.html, tests/static-app.test.js, e2e/bulk-export-delete.spec.js, e2e/bulk-import.spec.js.

## S3 Verification and delivery `[COMPLETE]`

- **Objective**: Record actual evidence and limits, update user documentation, merge/push main and remove only this feature branch after successful acceptance.
- **Definition of Done**: All web Node tests (Android excluded), full desktop/mobile Playwright, syntax/lint and `git diff --check` pass; inspect browser screenshots; verify main using `git ls-remote` after pushing.
- **Files**: README.md, CHANGELOG.md, docs/requirements.md, docs/technical-design.md, docs/single-backup-plan.md, docs/single-backup-test-report.md.

## Scope and safety

- Web first; no Android assets/APK changes or version tag.
- Only custom patterns and functions; no world/preferences/browser records in the backup. Single-library exports remain unchanged.
- Retain directory picker and verified-save helper. A single file does not claim to fix the in-app browser's native picker/write problem.
- Use isolated automated browser contexts; never delete the user's actual records or existing backups.
