# Stock UI
- Central and Cockpit consume one operational-queue hook and pure SKU selector; keep counts global and intersect SKU sets with each screen's filters so their queue never diverges.
- Alert transfers use the existing navigation-state replenishment payload, never browser storage or automatic order creation, so the operator reviews quantities before creating a TRS.