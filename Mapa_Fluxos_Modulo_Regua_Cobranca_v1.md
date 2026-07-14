# Mapa de Fluxos — Módulo Régua de Cobrança (COB-F3)

**Versão:** v1 (Fase Mapa — pré-implementação)
**Data:** 14/07/2026
**Sprint:** COB-F3 · Régua de Cobrança
**Status:** RASCUNHO PARA APROVAÇÃO — nenhum código nem DDL será escrito antes do aval do Flávio sobre este documento.

---

## 0. Posicionamento

O **motor de boleto Safra** (F1+F2a+F2b) está fechado: ele **registra, reemite, prorroga, baixa e concilia retornos**. Ele responde à pergunta "**o boleto existe e está vivo no banco?**".

A **Régua de Cobrança** opera **uma camada acima**: dado que o título existe, **o que a Fetely deve fazer com ele em cada dia da vida dele**, com foco no ciclo pós-vencimento. Ela responde a "**qual é a próxima ação humana a executar sobre este título?**".

**Doutrinas herdadas** (não rediscutir nesta fase):

- **SISTEMA-SUGERE / HUMANO-DECIDE**: régua nunca dispara comunicação externa sozinha. Ela agenda `data_proxima_acao_regua` e propõe a ação; o humano executa com um clique consciente.
- **BANCO-CONFIRMA / HUMANO-COMUNICA**: coerente com o motor Safra — retorno banco atualiza estado interno; e-mail/WhatsApp/ligação ao cliente é sempre ato humano.
- **DIMENSÃO-VIA-TABELA**: os *quandos* (D+1, D+5…), *canais* (e-mail, WhatsApp, telefone, carta), *templates* e *ações sugeridas* nascem em tabela editável, não em `CASE` no código.
- **CAMPO-DERIVADO-RECALCULA**: subestado de atraso, próxima ação e badges derivam do estado bruto (`data_vencimento_atual`, `status`, flags) — nunca são gravados sem gatilho explícito.
- **SIMULAÇÃO-ESTRUTURAL-ANTES-DO-BANCO**: qualquer transição da régua tem que ser reproduzível em teste local sem depender de Safra.

---

## 1. Fundação já disponível no schema

Levantado do schema atual de `titulo_a_receber` e `vw_titulos_cobranca`:

| Campo | Papel na régua |
|---|---|
| `status` | verdade contábil: `pendente`, `pago`, `cancelado`, `cancelado_recuperacao` |
| `data_vencimento_atual` | eixo do tempo para derivar `dias_atraso` |
| `data_liquidacao_real` | fecha o ciclo — dispara transição para família "pago" |
| `subestado_atraso` (default `em_dia`) | **estado de negócio** da régua (ver §3) |
| `data_proxima_acao_regua` | quando o título volta para a fila do humano |
| `pausa_regua_automatica` (default false) | congela avanço de subestado; humano decide manualmente |
| `email_cobranca_enviado_em` | rastro de comunicação já feita |
| `vip_relacionamento` | modifica tom/canal (nunca cancela a régua, ver §4) |
| `flag_bandeira_amarela` | herança da análise de crédito — endurece a régua (ver §2) |
| `flag_grupo_economico_inadimplente` | portão para novos pedidos do grupo (ver §7) |
| `modalidade_renegociacao` (smallint) | tipo da renegociação quando o título é reoriginado (ver §5) |
| `justificativa_renegociacao` | texto livre justificando a modalidade |
| `titulo_renegociado_origem_id` | aponta do **novo** título para o antigo |
| `titulo_pai_id` | usado para parcelamento — não confundir com renegociação |
| `vw_titulos_cobranca.status_gestao` | derivação atual: `a_vencer / vence_hoje / atrasado / pago / cancelado` |
| `vw_titulos_cobranca.dias_atraso` | inteiro derivado |

**O que a régua precisa e ainda não existe** — antecipando §8:

- Tabela-dimensão das **etapas da régua** (o "livro de regras" editável).
- Log de **ações executadas** pelo humano na régua (auditoria de "quem clicou em enviar cobrança quando").
- Provavelmente **família estendida** de `status_gestao` na view (`pago_com_atraso`, `pago_judicial`) — pendência herdada da F2b.

---

## 2. ENTRADA na régua

Um título **entra na régua** quando passa a ter potencial ou realidade de atraso. Regras propostas:

### 2.1. Gatilho principal

- Todo título com `status = 'pendente'` está **implicitamente** na régua desde o registro.
- Enquanto `data_vencimento_atual > hoje` e sem sinal de risco, o subestado é `em_dia` e a régua não sugere ação de cobrança — apenas pode sugerir **lembrete pré-vencimento** (D-3 / D-1) se a tabela-dimensão configurar isso.

### 2.2. Dia da virada

- No dia `D0` (`data_vencimento_atual = hoje`): subestado permanece `em_dia`, mas `status_gestao` da view já reporta `vence_hoje`. A régua pode sugerir "lembrete de vencimento hoje" — ainda **cortesia**, não cobrança.
- Em `D+1` (primeiro dia após vencimento sem baixa): subestado transiciona para **primeira faixa de atraso** (nome exato em §3), `data_proxima_acao_regua` é populada.

### 2.3. Papel dos meios de pagamento

- **Boleto**: a régua depende do estado do motor. Se o boleto está `vencido` no motor mas ainda **pagável** (dentro da janela de recuperação técnica antes da prorrogação/reemissão), a régua sugere **prorrogar/reemitir antes de cobrar** — nunca cobra um título cujo instrumento está morto.
- **PIX / cartão / transferência**: a régua entra direto, sem intermediação do motor Safra.
- **Cartão recorrente falhado**: entra na régua com subestado específico de "falha de captura" (a decidir se merece linha própria na tabela-dimensão).

### 2.4. Papel de `flag_bandeira_amarela`

- Não muda o **quando** o título entra na régua, muda o **ritmo**: cadência mais curta (ex.: D+1 e D+3 em vez de D+5) e/ou canal escalado antes (telefone antes de e-mail). Fica **codificado na tabela-dimensão** como "perfil de cadência", não hardcoded.

---

## 3. ETAPAS — subestados de atraso propostos

Sequência **candidata** para `subestado_atraso` (nomes finais a validar antes do DDL — hoje o campo é livre em texto/enum a definir):

```text
em_dia
  │
  │  D+1
  ▼
lembrete_amistoso           ─┐
  │  D+5                     │  Faixa 1 — Mariana, tom cordial
  ▼                          │
cobranca_ativa              ─┘
  │  D+15
  ▼
cobranca_formal             ─┐
  │  D+30                    │  Faixa 2 — Mariana + supervisão Patrícia
  ▼                          │
pre_juridico                ─┘
  │  D+45
  ▼
notificacao_extrajudicial   ─┐
  │  D+60                    │  Faixa 3 — decisão Flávio
  ▼                          │
protesto_solicitado         ─┤
  │  D+90                    │
  ▼                          │
juridico                    ─┘
  │
  ▼
(saída — ver §6)
```

**Observações estruturais:**

- Os **dias exatos** (D+1, D+5, D+15…) e **quais etapas existem** vivem na tabela-dimensão, não neste diagrama. O diagrama é a **proposta de default** — pode ser reconfigurado sem migração.
- Cada etapa tem N **ações sugeridas** (uma ou mais linhas na tabela): canal, template de mensagem, responsável, se aciona custo externo (protesto tem taxa) etc.
- Transição entre etapas é **automática por vencimento de `data_proxima_acao_regua`**, mas a **execução da ação** é sempre humana. O sistema move o título de "próxima ação em 15/07" para "atrasado na fila do dia 15/07" — Mariana abre a fila e decide.

### 3.1. O que cada etapa SUGERE (esboço da tabela-dimensão)

| Etapa | Canal padrão | Ação sugerida | Responsável | Efeito colateral |
|---|---|---|---|---|
| `lembrete_amistoso` | E-mail | "Notamos que o boleto venceu ontem, segue novo link" | Mariana | Nenhum externo |
| `cobranca_ativa` | E-mail + WhatsApp | Cobrança padrão + tentativa telefone | Mariana | Nenhum externo |
| `cobranca_formal` | Telefone + carta digital | Escalada de tom | Mariana + Patrícia ciente | Nenhum externo |
| `pre_juridico` | E-mail com aviso de protesto | Alerta último recurso | Patrícia | Prepara `flag_grupo_economico_inadimplente` |
| `notificacao_extrajudicial` | Carta registrada | Envio físico | Patrícia + Flávio ciente | Custo externo (correios) |
| `protesto_solicitado` | Cartório | Protesto | Flávio decide | Custo externo + impacto em bureau |
| `juridico` | Advogado externo | Transferência do caso | Flávio | Título pode virar `cancelado_recuperacao` |

---

## 4. PAPÉIS e modificadores

### 4.1. Quem executa

- **Mariana**: operação diária da régua — faixas 1 e 2 (D+1 até ~D+30). Toca fila da régua todo dia.
- **Patrícia**: escalada — faixa 2 tardia e faixa 3 inicial. Aprovação de renegociações padrão.
- **Flávio**: decisão de protesto, jurídico, renegociação fora-do-padrão, cancelamento por recuperação.

### 4.2. `pausa_regua_automatica`

- Quando `true`: a régua **não** avança `subestado_atraso` nem popula `data_proxima_acao_regua` para o próximo ciclo. O título fica congelado até o humano despausar.
- Casos de uso reais previstos:
  - Cliente em tratativa ativa (aguardando confirmação de pagamento manual).
  - Renegociação em desenho.
  - Feriado interno / decisão executiva de "não cobrar este cliente esta semana".
- **Não** silencia a fila: o título aparece marcado como "pausado" com motivo visível — pausar não é esconder.

### 4.3. `vip_relacionamento`

- **Não** cancela a régua e **não** pausa por si só. Ele muda o **tom e a alçada**:
  - Escalada mais lenta (perfil de cadência VIP na tabela-dimensão).
  - Toda ação de faixa 2+ pede confirmação de Patrícia antes do disparo humano.
  - Bloqueia protesto/negativação sem passar por Flávio, sempre.

### 4.4. `flag_bandeira_amarela`

- Vem da análise de crédito. Efeito oposto ao VIP: **encurta** cadência e escala canal mais cedo. Também é um perfil na tabela-dimensão.

---

## 5. RENEGOCIAÇÃO

### 5.1. O que `modalidade_renegociacao` (smallint) codifica — proposta

| Código | Modalidade | Descrição |
|---|---|---|
| 1 | `prorrogacao_simples` | Novo vencimento, mesmo valor. **NÃO é renegociação** contabilmente — é a prorrogação do motor Safra (F2b). Fica aqui apenas para completude; título original permanece, apenas muda `data_vencimento_atual`. |
| 2 | `parcelamento` | Título original vira `cancelado_recuperacao`; N novos títulos nascem com `titulo_renegociado_origem_id = original.id`. |
| 3 | `desconto_a_vista` | Título original recebe baixa parcial; delta vira desconto formal com justificativa obrigatória. |
| 4 | `troca_instrumento` | Boleto vira PIX/cartão; título original `cancelado_recuperacao`, novo título nasce. |
| 5 | `perdao_parcial` | Baixa parcial + baixa do saldo como perda. Requer aprovação Flávio. |
| 6 | `acordo_juridico` | Renegociação sob jurídico. Novo título nasce com trilha própria. |

*(Códigos definitivos a decidir com Flávio antes do DDL. Este é o esqueleto.)*

### 5.2. Fluxo estrutural de renegociação (modalidades 2, 4, 6)

```text
Título A (pendente, atrasado)
   │
   │  humano abre dialog "Renegociar"
   │  escolhe modalidade + justificativa (obrigatória)
   ▼
Título A recebe:
   status = 'cancelado_recuperacao'
   modalidade_renegociacao = <código>
   justificativa_renegociacao = <texto>
   │
   │  RPC cria N títulos filhos
   ▼
Título(s) B, C… nascem com:
   status = 'pendente'
   titulo_renegociado_origem_id = A.id
   pareamento com previsão nova (PREVISÃO-É-DERIVADA)
   RECEBÍVEL-NASCE-PAREADO respeitado
```

**Regras invioláveis:**

- Título A **nunca** volta a `pendente` — cancelamento por recuperação é terminal.
- Título A **nunca** recebe pagamento — o pagamento sempre entra no novo título.
- Se algum título filho for pago, os KPIs de recuperação devem conseguir **rastrear a árvore** via `titulo_renegociado_origem_id` — isso é responsabilidade do relatório, não do dado.

### 5.3. Renegociação vs. parcelamento normal

`titulo_pai_id` é o **parcelamento original** do pedido (uma venda em 3x tem 3 títulos com `titulo_pai_id` comum). `titulo_renegociado_origem_id` é a **reoriginação** por dificuldade de pagamento. **Nunca confundir os dois** — o filtro de "títulos renegociados" no BI usa `titulo_renegociado_origem_id`, não `titulo_pai_id`.

---

## 6. SAÍDA da régua

Um título sai da régua por um destes caminhos:

| Caminho | Como | Status final | Métrica |
|---|---|---|---|
| Pagamento normal antes do vencimento | Retorno banco / conciliação PIX | `pago` (status), `pago` (status_gestao) | On-time |
| Pagamento após vencimento sem escalada judicial | Retorno banco / baixa manual | `pago` (status), **`pago_com_atraso`** (status_gestao) | Recuperado amigável |
| Pagamento via ação judicial | Baixa manual com marcador | `pago` (status), **`pago_judicial`** (status_gestao) | Recuperado jurídico |
| Perda por decisão executiva | Cancelamento por recuperação | `cancelado_recuperacao` | Perda contábil |
| Cancelamento comercial (não é perda) | Cancelamento comum | `cancelado` | Neutro |

### 6.1. Pendência herdada da F2b — `status_gestao` estendido

Hoje a view `vw_titulos_cobranca` calcula `status_gestao` com 5 valores: `a_vencer / vence_hoje / atrasado / pago / cancelado`. A régua **precisa** distinguir `pago` de `pago_com_atraso` e `pago_judicial` para o BI de recuperação fazer sentido.

**Proposta**: no `CASE` da view, quando `status = 'pago'`:
- Se `data_liquidacao_real <= data_vencimento_original` → `pago`
- Se `data_liquidacao_real > data_vencimento_original` **e** existiu passagem por subestado `juridico` → `pago_judicial`
- Caso contrário → `pago_com_atraso`

Isso é view — não requer migração de dado. Vai junto no primeiro DDL da implementação.

---

## 7. GRUPO ECONÔMICO INADIMPLENTE

`flag_grupo_economico_inadimplente` no título é derivada: se **qualquer** parceiro do grupo econômico tem título em subestado `pre_juridico` ou pior, todos os parceiros do grupo ganham a flag.

### 7.1. O que a flag bloqueia

- **Portão comercial**: novo pedido do grupo cai em fila de aprovação obrigatória (Flávio decide caso a caso). Não bloqueia sistemicamente — sinaliza.
- **Análise de crédito**: análises novas dentro do grupo já entram com "bandeira vermelha" (perfil `bandeira_vermelha` na análise), o que a IA-B usa como critério.
- **Renegociação**: modalidade 5 e 6 (perdão parcial, acordo jurídico) para um parceiro do grupo pede visão consolidada dos demais.

### 7.2. O que a flag **não** faz

- Não bloqueia recebimento de pagamento de outros títulos do grupo.
- Não cancela pedidos em andamento — só ergue portão para novos.
- Não é gravada no parceiro — é **derivada** do estado dos títulos (CAMPO-DERIVADO-RECALCULA).

---

## 8. LACUNAS — o que falta no schema para suportar este mapa

Ranqueado por criticidade para a implementação:

### 8.1. Tabela-dimensão das etapas da régua (CRÍTICO — primeiro DDL da COB-F3)

Provisoriamente: `regua_cobranca_etapas`. Colunas mínimas:

- `codigo` (chave, ex.: `lembrete_amistoso`)
- `ordem` (int) — sequência default
- `dias_apos_vencimento` (int) — quando entrar nesta etapa
- `perfil_cadencia` (enum: `padrao` / `bandeira_amarela` / `vip`) — permite N linhas do mesmo `codigo` com dias diferentes
- `canal_sugerido` (enum: `email` / `whatsapp` / `telefone` / `carta` / `cartorio` / `advogado`)
- `template_mensagem_id` (fk opcional)
- `responsavel_default` (enum: `mariana` / `patricia` / `flavio`)
- `requer_aprovacao` (bool)
- `custo_externo_previsto` (numeric, opcional)
- `ativa` (bool)

**Sem esta tabela, a régua vira hardcode e viola DIMENSÃO-VIA-TABELA. É o primeiro DDL da fase seguinte.**

### 8.2. Log de ações executadas (CRÍTICO)

Provisoriamente: `regua_cobranca_acoes_log`. Registra cada clique humano de "executei a ação sugerida" ou "pulei a sugestão". Colunas mínimas:

- `titulo_id`, `etapa_codigo`, `perfil_cadencia_usado`, `canal_efetivo`, `mensagem_enviada` (snapshot texto), `executada_por` (user_id), `executada_em`, `resultado` (enum: `enviada` / `pulada` / `pausou_regua` / `abriu_renegociacao`), `observacao`.

Sem isso, não há auditoria de "por que este título furou o SLA".

### 8.3. Ajuste na `vw_titulos_cobranca` (MÉDIO)

Distinção `pago` / `pago_com_atraso` / `pago_judicial` (§6.1). Não é DDL — é view.

### 8.4. Campo em `titulo_a_receber` — opcional (BAIXO)

Um `subestado_atraso_confirmado_em` (timestamp) ajudaria a diferenciar "quando o sistema colocou nesta etapa" de "quando o humano viu". Pode ficar para uma iteração posterior.

### 8.5. O que NÃO precisa mudar

- Nada no motor Safra.
- Nada em `remessas_safra`, `boleto_status`, RPCs de prorrogação/reemissão.
- Nada na análise de crédito.
- Nada em pedidos.

---

## 9. Simulação estrutural — cenários de teste do Mapa

Antes de qualquer DDL, cinco cenários devem ser reproduzíveis em papel para validar o mapa. Se algum não fecha, o mapa volta antes do código.

1. **Título pago em dia**: nasce → `em_dia` → pagamento → `pago`. Régua não age. ✅
2. **Boleto vence, cliente paga em D+3**: nasce → `em_dia` → D+1 vira `lembrete_amistoso`, Mariana envia lembrete → D+3 pagamento → `pago_com_atraso`. Log tem 1 ação. ✅
3. **Título com bandeira amarela vence e não paga por 30 dias**: cadência VIP não aplicada; perfil `bandeira_amarela` → etapas em D+1, D+3, D+7, D+15, D+30 → em D+30 já está em `pre_juridico`. Mariana executa 5 ações, Patrícia entra em D+15. ✅
4. **VIP em atraso de 20 dias com pausa manual**: em D+1 régua sugere lembrete amistoso; Mariana envia. Em D+5 Patrícia pausa (`pausa_regua_automatica = true`, motivo "tratativa direta com CEO do cliente"). Título fica congelado até D+20 quando Flávio despausa. Régua retoma do subestado onde parou. ✅
5. **Renegociação em D+22**: título A em `cobranca_formal`. Humano abre dialog, escolhe `parcelamento` (mod 2), justificativa. RPC transforma A em `cancelado_recuperacao`; nascem B, C, D pareados com previsão. Régua de A encerra; B, C, D começam em `em_dia` com vencimentos futuros. Se B atrasar depois, ele entra na régua **do zero**, mas o BI de recuperação consegue puxar a árvore via `titulo_renegociado_origem_id`. ✅

---

## 10. O que esta sessão **não** decide (fica para a próxima)

- Nomes finais dos códigos de `subestado_atraso` e `modalidade_renegociacao`.
- Dias exatos das etapas por perfil de cadência (Mariana precisa ser ouvida).
- Templates de mensagem (Flávio + Mariana escrevem juntos).
- Custo previsto de protesto / carta registrada (Patrícia levanta).
- UX do drawer da régua (mockup na sessão de implementação).

---

## 11. Fechamento da fase Mapa

Ao aprovar este documento, a próxima sessão abre com:

1. DDL de `regua_cobranca_etapas` + `regua_cobranca_acoes_log` (espelho em `supabase/migrations/`).
2. Ajuste da `vw_titulos_cobranca` para família `pago_com_atraso` / `pago_judicial`.
3. Prepend da Arquitetura v130 com esta seção.
4. Espelho em `sncf_documentacao`.
5. **Depois disso**, código: hook de fila da régua, drawer, dialog de renegociação, tabela editável de etapas na UI de admin.

**Nada disso acontece nesta sessão.** Esta sessão termina aqui, no Mapa aprovado.
