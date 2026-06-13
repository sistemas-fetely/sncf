# Arquitetura dos Sistemas Fetely — v80

## ✅ STATUS — SESSÃO 12/06/2026 (FECHAMENTO): PAINEL GERENCIAL SHOPIFY B2C

Tema: Elevação do Módulo Shopify B2C de tela funcional para painel gerencial completo. Commit 7e5feb87 — ShopifyB2c.tsx expandido de 316 → 539 linhas, zero arquivos novos.

### O que foi adicionado na reescrita

#### Bloco D — Gráficos:
- BarChart (recharts) de receita por dia com ResponsiveContainer height 200px, fill #1A4A3A
- PieChart donut de forma de pagamento (PIX / Cartão / Misto) com legenda customizada e percentuais

#### Bloco E — Urgência de envio:
- Tabela compacta de TODOS os pedidos paid + unfulfilled, ordenados por dias sem envio desc
- Linhas coloridas por urgência (vermelho / âmbar / verde), badges destrutivo/âmbar/verde
- Estado vazio com ícone CheckCircle quando não há pendências

#### Bloco F — Métricas logísticas:
- Card Modal de frete: badges PAC / Sedex / Loggi com count — clique filtra a tabela
- Card Tempo médio de preparo: avg(fulfilled_at - paid_at) em horas e minutos
- Card Em trânsito: count status_entrega='em_transito' + alerta de 'vencido'

#### Tabela (Bloco G):
- Filtro de UF adicionado (select dinâmico com UFs dos dados)
- Filtro de modal de frete integrado (via modalFiltro state do Bloco F)

Fonte dos dados dos gráficos: 100% useMemo dentro do componente sobre os dados já carregados por useShopifyPedidos() e useShopifyTopSkus() — zero requisições adicionais ao banco.

### Resultado operacional no primeiro uso

Análise inicial (CSV 02/06–11/06): 9 pedidos críticos · R$ 3.462 em risco. Tela ao vivo (12/06 noite): 2 pedidos críticos · R$ 688 em risco.

7 pedidos foram expedidos entre a análise e o fim do dia. O painel pagou o desenvolvimento no primeiro dia de uso.

Os 2 restantes (#1028 PAC MG 8d · #1037 PAC SP 6d) aparecem em destaque vermelho — ação pendente.

### Estado atual do módulo

| Entregue | Pendente v2 |
|----------|-------------|
| Import CSV client-side (PapaParse) | Webhook Shopify orders/fulfilled UPSERT incremental por shopify_id |
| | Link WNS via wns_pedido_id |
| | Alert banner tempo real |
| | Notificações ativas (inbox/email) |
| | Gráfico receita por dia — Período customizável (date picker) |
| | Donut PIX/Cartão/Misto — Comparativo entre períodos |
| | Urgência de envio por pedido |
| | API Correios para rastreio real |
| | Top 8 SKUs com barras proporcionais |
| | Métricas logísticas (modal, preparo, trânsito) |
| | Filtro UF + filtro modal integrados |

---

# Arquitetura dos Sistemas Fetely — v79

## ✅ STATUS — SESSÃO 12/06/2026 (a): FOP→SNCF — OBS CLIENTE

Gatilho: pedidos vindos do FOP têm dois campos de observação que não apareciam no detalhe do pedido no SNCF.

Diagnóstico:

| Campo FOP | Semântica | Estado antes | Estado depois |
|-----------|-----------|--------------|---------------|
| meta.observacoes | Obs interna Fetély — nunca vai pro cliente | Gravado em pedidos.observacao_pedido desde 03/06, mas nunca renderizado | Renderizado no PedidoDetalhe como "Obs. Fetély interna" (read-only) |
| meta.observacoesCliente | Obs visível ao cliente (impresso no PDF/email do FOP) | Não existia no SNCF | Gravado em pedidos.observacao_cliente; renderizado como "Obs. do Cliente" (read-only) |

Mudança técnica:
- RPC `receber_pedido_externo`: recriada com 36º parâmetro (observacao_cliente)
- Tabela pedidos: 2 colunas novas (observacao_pedido text, observacao_cliente text), ambas nullable
- VIEW-1 validação: ok — coluna nullable não afeta views existentes
- D-Trigger: backfill retornou PED-2000 · Obrigado · Teste Boleto

Decisão arquitetural (os dois campos nunca se misturam):

| Campo | Origem FOP | Destino SNCF | Vai ao Bling? | Editável no SNCF? |
|-------|------------|--------------|---------------|-------------------|
| observacao_pedido | meta.observacoes | pedidos.observacao_pedido | ❌ | ❌ Read-only |
| observacao_cliente | meta.observacoesCliente | pedidos.observacao_cliente | ❌ | ❌ Read-only |
| urgencia_observacao | — (nativo SNCF) | pedidos.urgencia_observacao | ❌ | ✅ Tab Urgência |

