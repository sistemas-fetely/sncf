# CONTA DO CLIENTE — tela final `/cliente/:id` (consolidação de 5 telas em 1)

Somente UI. Nenhuma migration, nenhum SQL, nenhuma RLS, nada inserido em `sncf_navegacao`.
Nenhuma tela antiga desativada ou redirecionada.

## Verificado no repo/banco antes deste plano

- As 6 linhas de aba existem em `sncf_navegacao` sob `pai_chave: sops.operacao`, com rotas
  `/cliente?aba=posicao|extrato|credito|pedidos|cadastro|furos` e os slugs
  `tela.cliente_posicao / _extrato / _credito / _pedidos / _cadastro / _auditoria`.
- O portão de rota (`RotaGate` + `resolverRegraNavegacao`) casa por **pathname**; rotas com
  querystring (`/cliente?aba=...`) **não casam** `/cliente/<uuid>`, então a rota nova cai no
  fallback `rotasRegistry.ts` e precisa de uma entrada lá.
- Padrão de aba por permissão já existe: `AbaPermitida` / `ConteudoAba` (`src/components/AbaGate.tsx`),
  usado em `CobrancaFila.tsx` (aba Banco = `tela.cobranca_remessa`, aba Crédito = `tela.credito`).
- Pedidos do parceiro já têm componente pronto: `PedidosDoParceiroSection({ parceiroId })`.
- Cobertura, saldo, extrato e furos já têm hooks prontos em `src/hooks/financeiro/useContaCliente.ts`.
- `RegistrarRecebimentoDialog` já aceita `parceiroId` / `parceiroNome` (pré-seleção).

## Decisão que preciso confirmar (porta da rota)

O portão de rota avalia **um** slug. Se eu registrar `/cliente` com `tela.cliente_posicao`,
quem tiver só Extrato bate na porta e nem entra — contradiz a regra das abas.

**Proposta:** registrar `/cliente` em `rotasRegistry.ts` como porta aberta
(`tela_slug: "tela.self"`, que é pública para qualquer usuário aprovado) e deixar TODO o
controle nas abas, que são fail-closed: sem nenhuma aba visível, a tela mostra o estado de
sem-permissão e não consulta nada. Alternativa, se preferir porta fechada: uso
`tela.cliente_posicao` e quem não tiver essa concessão não acessa a tela por nenhuma aba.

## Arquivos

### Novos

- `src/pages/clientes/ClientePainel.tsx`
  - `useParams` (`id`), aba na URL via `?aba=` (padrão do projeto), `PageShell` + `PageHeader`.
  - Cabeçalho: razão social, nome fantasia, CNPJ (de `parceiros_comerciais`).
  - Lista de abas com slug; monta as visíveis com `usePodeVerAba`; default = primeira visível;
    aba pedida na URL sem concessão cai na primeira visível. Nenhuma aba visível → estado de
    sem-permissão do projeto (`AcessoBloqueado tipo="sem-permissao"`).
  - `TabsTrigger` envolvido em `AbaPermitida`, conteúdo em `ConteudoAba` (dupla trava).
- `src/components/clientes/ClienteAbaPosicao.tsx`
  - `vw_conta_cliente_saldo` (via hook existente, filtrando o parceiro) + `fn_conta_cliente_cobertura`.
  - Rótulos separados e explícitos: **Saldo da conta** (dinheiro do cliente) e
    **Crédito disponível** (limite), com uma linha de apoio dizendo que são perguntas diferentes.
  - Mais: vencido em aberto, a vencer, crédito futuro; card de cobertura (fonte 1 saldo,
    fonte 3 limite, total), somente leitura.
- `src/components/clientes/ClienteAbaExtrato.tsx`
  - `useContaClienteLancamentos(parceiroId)`, data desc, sinal +/− colorido, nível de prova.
  - Botão "Registrar recebimento" → `RegistrarRecebimentoDialog` com cliente pré-selecionado.
- `src/components/clientes/ClienteAbaCredito.tsx`
  - Última análise vigente de `analises_credito` (novo hook), campos `status_final`,
    `limite_concedido`, prazo, `validade_ate`, ressalva/parecer + limite disponível da RPC de
    cobertura. Somente leitura.
- `src/components/clientes/ClienteAbaCadastro.tsx`
  - Campos de `parceiros_comerciais`: razão social, fantasia, CNPJ, IE, telefone, e-mail,
    endereço, programa de parceiros, perfil de crédito. Somente leitura (reusa o padrão de
    linha rótulo/valor do `ParceiroDetalhe`).
- `src/components/clientes/ClienteAbaFuros.tsx`
  - `useContaClienteFuros(parceiroId)` em tom de alerta, mostrando o campo `detalhe`.
- `src/hooks/clientes/useClientePainel.ts`
  - `useClienteCabecalho(id)` — razão social, fantasia, CNPJ e demais campos de cadastro.
  - `useAnaliseCreditoVigente(id)` — última linha de `analises_credito` do parceiro com decisão,
    ordenada por `decidido_em`/`criado_em` desc, `maybeSingle`.

### Existentes (edições cirúrgicas)

- `src/App.tsx` — `lazy` import + `<Route path="/cliente/:id" element={<ClientePainel />} />`
  no mesmo bloco onde vive `/parceiros/:id`. Nada mais.
- `src/config/rotasRegistry.ts` — uma linha nova para `/cliente` (slug conforme a decisão acima).
- `src/pages/administrativo/ContaCliente.tsx` — o clique na linha passa a `navigate("/cliente/" + id, { state: { from } })`
  em vez de abrir o drawer. Lista e aba "Entradas a reconhecer" ficam como estão.

### Não toco

`ContaClienteDrawer.tsx` (fica no repo, sem uso na lista), `src/lib/db.ts`, `src/lib/cacheKeys.ts`,
`PessoaForm.tsx`, formulários de tarefas/recorrência — territórios da outra sessão. Telas antigas
(Vencimentos x Cliente, Crédito do Cliente, Parceiro detalhe) intactas.

## Reaproveitamento

`AbaPermitida`/`ConteudoAba`, `PageShell`/`PageHeader`, `Tabs`, `Table`, `Card`, `Selo`, `Badge`,
`Skeleton`, `Alert`, `formatBRL`, `PedidosDoParceiroSection`, `RegistrarRecebimentoDialog`,
`useContaCliente*`. Sem cor nova, sem componente de tabela novo.

## Verificação

`bunx tsc --noEmit` limpo. Antes de editar cada arquivo existente, confiro se ele mudou pela
outra sessão; se tiver mudado, paro e aviso em vez de sobrescrever.
