# Catálogo SharePoint diário — F1

## Entrega
- Mapa `mapa-mestre-produto-v4`, bloco aprovado de 08/11/2026, lido antes da implementação.
- Microsoft 365: `/ti/integracoes?aba=microsoft_365`. Tenant/client/secret só no Vault; configuração não secreta em `integracoes_config`.
- Revisão Operações: `/vendas/produto/conciliacao#atualizacao-do-dia`, com leitura, cópia privada, três valores, seleção, confirmação, aplicação/descarte/resolução.
- `catalogo-planilha-ler`: Graph somente leitura, arquivo histórico privado, hash, layout linha 3, dados linha 5, comparação por célula, validação fiscal existente.
- (Mapa v2) `catalogo-planilha-fop` foi retirada. Campos de Produto são aplicados pela edge `catalogo-planilha-aplicar-fop` (sessão do usuário + `acao.produto_importar_planilha_cadastro`), que chama `POST {fop_base_url}/api/public/catalogo-planilha-aplicar` com Bearer `FOP_INBOUND_TOKEN` em lotes de 500; `aplicada` → `fn_catalogo_resolver` (serviço), `conflito`/`erro` (inclusive falha de rede/HTTP, gravada em cada célula do lote) → `fn_catalogo_fop_registrar`. `fop_base_url` fica em `integracoes_config` (sistema `fop`), editável em TI › Integrações › Microsoft 365.
- Nenhuma nova rota; nenhuma publicação do front.

## Banco e agendamento
- Migrations 0080 (tabelas/RPCs/filas), 0081 (Storage), 0082 (alias na conclusão), 0083 (ordem/idempotência).
- Tabelas: `catalogo_planilha_leitura`, `catalogo_planilha_base`, `catalogo_planilha_mudanca`; RLS, grants explícitos, sem escrita direta authenticated.
- Views de pendências de Operações e Produto; duas entradas em `tarefas_filas`; ações censadas sob permissões existentes, sem concessão automática.
- Bucket privado `catalogo-planilha`, histórico por data de São Paulo, limite 30 MB.
- Cron `catalogo-sharepoint-diario-0630`, `30 9 * * *` UTC = 06:30 America/Sao_Paulo; uma vez ao dia pelo chamador Vault existente. Sem credencial, falha explicitamente e registra erro; não modifica produtos.
- Pendências seguem a última leitura comparada; status sem mudança não descarta a fila anterior.
- Descarte e escolha do sistema reconhecem a célula da planilha como revisada, sem sobrescrever o sistema; evita reapresentar a mesma célula ignorada.

## Teste real de pipeline com arquivo fake
- Arquivos privados `testes/fake2.xlsx` e `testes/broken2.xlsx`.
- Leitura `72fec9b7-c5ad-417f-93c6-8c37bbc6cab9`: 2 linhas; 1 mudança, 1 conflito, 1 já igual, 1 sem cadastro; nenhuma violação fiscal.
- Repetição `70753cca-e0fb-43b0-9922-4db1d6535560`: sem mudança.
- Layout inválido `314a8eda-b6f0-4520-bcba-0a9b6a2e4d2e`: layout quebrado, slug desconhecido; erro preservado.
- Leituras de teste excluídas da fila e base oficial. Base oficial permaneceu com zero células; nenhum produto ou fase/ativo foi alterado.
- 11 testes unitários de comparação/regras; telas de Microsoft 365 e Operações conferidas com sessão real.

## Limites / próximo passo
- Sem credencial Microsoft real: Graph/token e arquivo oficial não testados. Cadastrar na aba Microsoft 365, não em variáveis de ambiente.
- App Entra requer aplicação `Sites.Selected` e permissão `read` somente no site Fetely-Produto2. Grant por administrador no Graph: `POST /v1.0/sites/{site-id}/permissions`, body `{"roles":["read"],"grantedToIdentities":[{"application":{"id":"CLIENT_ID_DO_APP","displayName":"SNCF Catálogo (leitura)"}}]}`.
- F2 ainda não existe neste projeto; fila Produto fica `em_construcao` e aponta à revisão SNCF até informar a rota FOP definitiva. Nenhuma edição no FOP.
- Aplicação real de produtos e confirmação FOP não executadas, para não alterar cadastro em teste. Preview com mudanças usa pipeline fake separado, não inventa mudanças oficiais.
- Primeiro cron diário, celular e dark mode não conferidos.