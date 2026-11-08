# Catalog daily review
- Daily catalog decisions use the atomic catalog resolver and existing product-format validation/audit log; do not perform client-side product writes in the daily section.
- Keep the newest read status visible while pending work follows the latest comparable read, so an unchanged daily download does not hide unreviewed cells.