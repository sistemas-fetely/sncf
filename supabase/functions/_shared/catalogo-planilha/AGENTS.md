# Daily catalog reconciliation
- Keep spreadsheet layout, field ownership and three-way comparison in the shared catalog module; never write status/identity fields or create products from this feed.
- Test reads use isolated reading records and synthetic snapshots, never update the official cell base or live products.
- Microsoft credentials and FOP machine authentication come only from Vault through the service-role client; do not return tokens or raw OAuth errors.
- Product-owned cells are written only in the FOP via `aplicar-fop.ts` (tested with a fake FOP); a cell is marked applied only after the FOP answers `aplicada`, and a transport failure leaves the whole batch untouched.
