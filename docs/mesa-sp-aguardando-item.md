# MESA-SP-AGUARDANDO-ITEM

- Migration aplicada: `drizzle/migrations/0099_mesa_sp_aguardando_item.sql`.
- Eventos novos: `mesa_aguardando_item`, `mesa_item_chegou`; lista anterior preservada e constraint `NOT VALID`.
- RPCs novas: `fn_mesa_sp_aguardar_item`, `fn_mesa_sp_item_chegou`, com a ação existente `acao.expedicao_sp_operar`, trava de cancelamento e lock do pedido.
- A espera só grava eventos: não altera `pedidos.estagio`, reservas, marcações ou movimentação de estoque; não usa `aguardando_estoque`.
- A view mantém suas 32 colunas originais e acrescenta `itens_faltando` e `item_pode_ter_chegado`. O aviso exige aumento estrito do físico sadio de todos os SKUs no CD do pedido; nunca faz transição automática.
- Cada SKU aparece uma vez na seleção, somando linhas repetidas do pedido. Quantidade faltante validada no banco contra o total daquele SKU.
- Ajustes em funções existentes: `fn_mesa_sp_iniciar_conferencia` aceita `mesa_item_chegou` (não aceita `mesa_aguardando_item`); `fn_mesa_sp_registrar_conferencia`, `fn_mesa_sp_embalar`, `fn_mesa_sp_entregar_transferencia` recusam avanço durante espera. Embalagem e entrega exigem conferência posterior ao ciclo de espera, evitando uso de uma conferência antiga.
- `fn_mesa_sp_devolver_fila`, `fn_mesa_sp_encerrar_cancelado` e `fn_mesa_sp_voltar_separacao` permanecem intactas; seus guardas já comportam o novo estado.
- Dados registrados separadamente da migration pelo executor de dados: três linhas de `mesa_sp_etapa` (B2B, B2C, interno), código/coluna `aguardando_item`, ordem 25, sem limite, descrição solicitada; dois registros em `acao_superficie` ligados ao slug existente, sem novas concessões.
- `types.ts` e o journal foram atualizados automaticamente pela ferramenta de migration. A nova inferência gerada revelou um ciclo em `RegularizacaoLoteDetalhe.tsx`; apenas a tipagem do cliente da consulta aninhada foi estreitada, sem mudar consulta ou comportamento.
- Sem publicação do aplicativo; nenhum pedido real foi parado ou liberado para testes.
- Validação: 23 testes Vitest; SQL executado em PostgreSQL isolado com as RPCs extraídas da migration e guardas lidas do banco; regra de todos os saldos, limites, motivos, permissões, cancelamento e reservas aprovados. Preview autenticado com PED-2423 real e gravações simuladas conferiu erro → espera → retorno à separação em computador/celular, claro/escuro. RPC hospedada recusou motivo de 4 caracteres com HTTP 400, sem efeitos. Compilação automática OK.