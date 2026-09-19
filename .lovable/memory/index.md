# Project Memory

## Core
SNCF — sistema interno da Fetély (marca de celebração e lifestyle). Cobre pessoas (CLT + PJ),
financeiro, compras, logística, comercial e estoque. Interface em português do Brasil.
Tema: cream, ouro mostarda e marrom escuro — NÃO é azul corporativo.
Valores monetários em BRL (R$). Conformidade com a CLT (Lei 13.467/2017) na parte de pessoas.

## Regra de interface
Antes de criar ou alterar tela, leia `docs/sistema-visual.md` — cor, tipografia, espaçamento, componentes existentes e as regras §3 a §14. Valores dos tokens: `src/index.css` (fonte da verdade).

## Memories
- [Design system](mem://design/tokens) — Paleta Fetély: cream, ouro mostarda e marrom escuro; status com variante `-strong` para texto
- [Permissions](mem://features/permissions) — Role-based permission system with 17 modules, CRUD + special actions
- [Admin RH role](mem://features/admin-rh-role) — admin_rh role with gestor_direto auto-management trigger
- [Grupos de acesso](mem://features/grupos-acesso) — Access groups that auto-assign roles on portal activation
- [Super admin bypass](mem://features/super-admin-bypass) — super_admin bypasses all permission checks
- [Onboarding checklist](mem://features/onboarding-checklist) — Auto-created checklist on activation with role-based views
- [Fala Fetely favoritas](mem://features/fala-fetely-favoritas) — Conversas fixáveis (favorita), tom de marca nas frases/sugestões
- [Sistema reportes imagem](mem://features/sistema-reportes-imagem) — Upload opcional de print no botão Reportar (bucket sistema-reportes)
