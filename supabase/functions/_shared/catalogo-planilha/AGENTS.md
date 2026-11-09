# Daily catalog reconciliation
- Keep spreadsheet layout, field ownership and three-way comparison in the shared catalog module; never write status/identity fields or create products from this feed.
- Test reads use isolated reading records and synthetic snapshots, never update the official cell base or live products.
- Microsoft credentials and FOP machine authentication come only from Vault through the service-role client; do not return tokens or raw OAuth errors.
- Product- and fiscal-owned (operacoes) cells are written only in the FOP via `aplicar-fop.ts` (resolver called per owner) (tested with a fake FOP); mark applied only on `aplicada` or a conflict whose current value matches the requested value, and require the pending-response RPC count to match the batch, so already-applied values and partial registrations cannot become false conflicts or silent success; a transport failure applies nothing and records the error on every cell of that batch.
