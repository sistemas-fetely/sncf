# Catalog daily review
- Daily catalog decisions use the atomic catalog resolver and existing product-format validation/audit log; do not perform client-side product writes in the daily section.
- Keep the newest read status visible while pending work follows the latest comparable read, so an unchanged daily download does not hide unreviewed cells.
- Group and filter daily review cells through the tested pure selector; use matrix labels and identify spreadsheet-name fallbacks without writing product names.
- Conciliação tabs share read-only catalog queries for badges and default selection; explicit URL tabs override the legacy daily hash, and missing names query the same reading regardless of owner or resolution status.
- Synchronization sections reuse BlocoSincronizacao with explicit routine lists and PainelSyncEstoque's shared status query/rendering, so moving routines never duplicates status, timing or count rules; unscoped callers retain the full panel.