# FOCUS preview iPhone smoke-test results

Date: 2026-11-21

Environment:
- Repository: b6tcvz8dnw-cpu/Focus-preview
- URL: https://b6tcvz8dnw-cpu.github.io/Focus-preview/
- Scope: preview deployment only; the production repository and URL were not changed.

## User-confirmed checks

The user confirmed that the following checks passed on their iPhone:

- Safari preview opens and displays correctly.
- Timer and Study Room interactions work.
- Settings and study records persist after reload.
- Home Screen installation / standalone launch works.
- Timer and records restore after closing and reopening the app.
- Offline launch works after the app has been cached.

## Scope and limitations

- These results are user-reported manual checks, not automated device telemetry.
- They apply to the preview deployment only.
- They do not establish that the production deployment has been migrated or tested.
- Background timer/audio behavior while iOS suspends the app is not guaranteed.
- Keep the production branch and production deployment unchanged until a separate, explicit release approval and production migration checklist are completed.

## Next release checks

1. Review the preview app once more for visual and functional regressions.
2. Confirm backup export/import and recovery behavior on the preview.
3. Review the production migration plan and rollback procedure.
4. Obtain explicit approval before merging or deploying any production changes.


## Additional data-protection hardening

After the iPhone smoke test, the preview import flow was strengthened:
- The pre-import snapshot must be written before study stats are replaced.
- A failed stats write leaves the previous stats intact and keeps the pre-import snapshot.
- Application memory is updated only after the new stats are saved.
- Automated coverage was expanded with three transaction failure-path tests.
- Production remains unchanged.


## PWA asset path follow-up

A later document-head audit found root-relative manifest and icon URLs that are not appropriate for a GitHub Pages project path. These were changed to relative URLs and covered by a regression test. Please recheck Home Screen installation after the corrected deployment; the earlier manual check predates this fix.
