---
name: Paleta Fetély — cream, ouro mostarda e marrom escuro
description: Paleta oficial do SNCF, espelhando o :root de src/index.css. NUNCA gerar UI em tons de verde como cor primária.
type: design
---
- Primary: ouro escuro `43 58% 39%` (~#9F7E2A) — botões, links, ring
- Background: cream `35 36% 90%` (#F0E7DB)
- Foreground: marrom escuro `30 22% 14%`
- Card / Popover: `36 50% 97%` (#FCF9F4)
- Secondary: `36 35% 84%` (#E5D8C5)
- Muted: `36 30% 86%` · Muted foreground: `36 12% 38%`
- Accent: `43 35% 75%`
- Border / Input: `35 22% 78%` · Ring: `43 58% 39%`
- Radius padrão: `0.375rem` (6px)
- Sidebar (light): bg `36 50% 94%`, foreground `30 22% 18%`, primary `43 58% 39%`
- Dark mode: bg `0 0% 4%` (#0A0A0A), primary ouro brilhante `45 53% 55%` (#C9A84C)
- Status (terrosos, não os defaults do shadcn): destructive `4 55% 41%` (#A33A30) · success `150 33% 36%` (#3D7A5C) · warning `38 70% 41%` (#B07A20) · info `200 50% 40%`
- Verde existe APENAS como cor semântica de sucesso. Nunca como primary, background ou sidebar.
- Fonte da verdade é src/index.css. Se divergir, o CSS manda e este arquivo é que está errado.
