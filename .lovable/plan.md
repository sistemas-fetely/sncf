# Investigação concluída — sem alterações

Resposta entregue na conversa. Nenhuma mudança de código proposta neste turno.

**Pontos-chave apurados:**
- `TELAS_PUBLICAS` = `{ "tela.home", "tela.self" }` (apenas dois).
- `CasaTopNav` tem bypass exclusivo para `super_admin` (linha 16).
- `permitidas` vem da RPC `usuario_telas_permitidas(p_user_id)`.
- Pilar COMERCIAL só está visível hoje via bypass de `super_admin`, já que `tela.comercial` não está em `TELAS_PUBLICAS` nem (segundo você) em `permissoes_catalogo`.

**Próximo passo aguardando decisão sua**, sem plano proposto ainda:
- Confirmar se o novo pilar PRODUTO deve ser cadastrado em `permissoes_catalogo` antes do front referenciá-lo (evitando o mesmo estado do COMERCIAL, que hoje só aparece para `super_admin`), ou se ele nasce como público (`TELAS_PUBLICAS`), ou outro modelo.
- Após essa decisão, monto o plano de criação do pilar (layout tab-bar vs sidebar com grupo "Estoque", rotas, `CommandPalette`, permissões).
