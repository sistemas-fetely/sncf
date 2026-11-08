# Daily catalog reconciliation
- Keep spreadsheet layout, field ownership and three-way comparison in the shared catalog module; never write status/identity fields or create products from this feed.
- Test reads use isolated reading records and synthetic snapshots, never update the official cell base or live products.
- Microsoft credentials and FOP machine authentication come only from Vault through the service-role client; do not return tokens or raw OAuth errors.