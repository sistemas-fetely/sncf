# Catalog daily review
- Daily missing FOP dimensions are provisioned automatically by the application edge; the screen only reads the per-reading audit count, because strict matching and creation belong to the FOP application path.
- Daily catalog decisions use the tested `planoCatalogo`: both owners go to the FOP edge (discard/"sistema" never call the FOP); never write products client-side.
- Collection matching is shared with the dimension edge; selection gates individual, product and filtered-batch cells until the active dimension is known, and human registration refetches it.
- Keep the newest read status visible while pending work follows the latest comparable read, so an unchanged daily download does not hide unreviewed cells.
- Group and filter daily review cells through the tested pure selector; use matrix labels and identify spreadsheet-name fallbacks without writing product names.
- Conciliação tabs share read-only catalog queries for badges and default selection; explicit URL tabs override the legacy daily hash, and missing names query the same reading regardless of owner or resolution status.
- Synchronization sections reuse BlocoSincronizacao with explicit routine lists and PainelSyncEstoque's shared status query/rendering, so moving routines never duplicates status, timing or count rules; unscoped callers retain the full panel.