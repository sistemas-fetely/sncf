# Pacote do Contador — Etapa 2: Despesas e Retenções

Preview, sem publicar. Prazo da fase 1: fechamento de 09/11.

## 1. Mapa de fontes (conferido no banco, out/2026)

| Item | Onde nasce hoje | Arquivo guardado? | O que falta |
|---|---|---|---|
| (a) NF-e de despesa | `nfs_stage` Qive (91 NF-e) + Bling entrada (10) | XML sim (91/91, 9/10) | Separar despesa de mercadoria (por `destino_codigo`/plano de contas da despesa ligada) |
| (b) NFS-e tomadas | `nfs_stage` Qive (38 NFS-e) | XML sim (38/38); PDF não (`resumo_pdf_storage_path` a gerar) | Leitura das retenções do XML; vínculo com pagamento |
| (c) Cupons (NFC-e) | Nada. A captura Qive só busca `nfe/received`, `cte/taker`, `nfse/received` | — | Confirmar se a API Qive expõe NFC-e; até lá, entrada manual |
| (d) Aluguel | Só a conta a pagar "Aluguel cobrado à parte — SIS II PARTICIPACOES — 10/2026" e o aluguel da Casa 22 (venda fora). `pasta_contratos` vazia; `ged_documentos` só tem 199 docs de bureau de crédito, nenhum contrato | Nenhum contrato nem recibo guardado | Contrato e recibos: entrada manual (e depois GED) |
| (e) Energia/água/telefone | Nada. Qive sync não busca NF3e (energia) nem NFCom (telecom) | — | Confirmar se a Qive capta NF3e/NFCom; até lá, entrada manual |
| Outros | Reembolsos (0 comprovantes em out), faturas de cartão, `contas_pagar_documentos` (0 linhas no total) | Não há arquivos | — |

Pagamento: nenhuma das 101 despesas de out tem `data_pagamento`; nenhuma conta a pagar tem anexos; nenhuma movimentação de out–nov está conciliada a conta a pagar. Ou seja, hoje a data/valor do pagamento quase nunca será localizada.

Pontos ainda não confirmados (primeiro passo da fase 1):
- Se o XML das NFS-e (ADN e municipais) traz IR e INSS retidos (o parser manual só lê PIS/COFINS/CSLL/ISS).
- Se a API da Qive tem rotas para NF3e, NFCom e NFC-e e se a conta Fetely tem acesso.

## 2. Planilha de retenções (automática)

- Ler cada NFS-e do mês do XML guardado: valor bruto, IR, PIS, COFINS, CSLL, INSS (alíquota e valor), valor líquido. Leitura num helper compartilhado testado (ADN + ABRASF), mesma base do `_shared/nfse-xml.ts`.
- Só entram notas com alguma retenção > 0.
- Pagamento, em ordem: (1) `despesas.data_pagamento` + `movimentacao_bancaria_id`; (2) conta a pagar ligada (`nfs_stage.conta_pagar_id`) paga/conciliada; (3) movimentação bancária conciliada à conta. Sem nenhum → "pagamento não localizado" na Observação.
- Divergência valor líquido do XML × valor pago → anotado na Observação.
- Saída xlsx em `01_relatorios/Pagamentos_NFS-e_Servicos_Tomados_MM-AAAA.xlsx` no layout exato das 15 colunas do escritório; Sim/Não calculados.
- Prévia na tela do pacote (contagem de notas com retenção e de "pagamento não localizado").

## 3. Pasta `05_despesas/` no ZIP

- `nfse/`: PDF (Resumo gerado do XML, como já fazemos com NF-e). XML não duplica: fica em `03_nfs_entrada`, e o manifesto aponta o caminho.
- `consumo/`, `aluguel/` (contrato + recibos), `cupons/`, `outros/`: arquivos do bloco manual (item 4) e, no futuro, das capturas automáticas.
- Manifesto: seção FALTANTES de despesas, uma linha por tipo esperado sem arquivo (ex.: "Energia Site SP — fatura de 10/2026 não encontrada").

## 4. Bloco manual "Documentos de despesa do mês"

- Dimensão de tipos esperados (ex.: Energia Site SP, Água Site SP, Telefone/Internet, Aluguel Site SP — recibo, Aluguel Casa 22 — recibo, Contrato de locação), com pasta do ZIP, periodicidade (mensal / uma vez enquanto vigente para contrato) e ativo.
- Tabela de documentos do mês por tipo, com versão vigente (mesmo padrão de `contabil_extrato_mensal`: substituir preserva o anterior).
- Upload só guarda o arquivo em `contabil/despesas/<AAAA-MM>/<tipo>/<nome>`; escrita por RPC com permissão nova `acao.contabil_documento_despesa.enviar` registrada em `acao_superficie`.
- Cards na tela do Pacote: Falta / Enviado, nome, Enviar/Substituir/Baixar. Botão "Outro documento" para `outros/` e `cupons/`.
- Alerta antes de gerar: "Faltam N documentos de despesa" com "Gerar mesmo assim" (como nos extratos).
- Tipos iniciais: proponho a lista acima; preciso que você confirme quais contas de consumo existem (por local) e quais aluguéis (Site SP, showroom, Casa 22, SIS II).

## 5. Tela ADM › Documentos

Proposta: aposentar. O envio ao contador passa a ser pelo Pacote, e a tela hoje não funciona (RPC lê coluna inexistente; view vazia). A cobrança de fornecedor por documento faltante pode voltar depois, a partir do manifesto do pacote. Até lá, tirar do menu (nó em `sncf_navegacao` marcado como aposentado pelo Claude conectado) e manter a rota com aviso apontando para o Pacote. Alternativa, se preferir: consertar só a aba "Cobrar fornecedor" (corrigir a RPC) — custo maior e sem uso hoje.

## 6. Fases

**Fase 1 (até 09/11)**
1. Confirmar retenções no XML de 3–5 NFS-e reais de out e rotas Qive NF3e/NFCom/NFC-e (só leitura, reporto antes de seguir).
2. Helper de retenções + testes; planilha xlsx em `01_relatorios/`.
3. PDF das 38 NFS-e (Resumo do XML) em `05_despesas/nfse/`.
4. Bloco manual + dimensão + RPC + `05_despesas/` + faltantes no manifesto.
5. Dry-run de 10/2026: notas com retenção, total retido por imposto, pagamentos não localizados, faltantes de despesa. Sem gerar remessa.

**Fase 2 (depois)**
- Captura Qive de NF3e/NFCom/NFC-e (se a API tiver), indo direto para `consumo/` e `cupons/`.
- Separação NF-e despesa × mercadoria em `05_despesas/` (hoje tudo segue em `03`).
- Contrato de locação via GED/`pasta_contratos` e recibos de aluguel recebidos (Casa 22 como locadora? confirmar).
- Melhorar vínculo de pagamento (conciliação despesa ↔ banco) para reduzir "pagamento não localizado".
- Aposentadoria definitiva da tela Documentos ou reconstrução da cobrança.

## Detalhes técnicos

- Migrations novas: dimensão `contabil_documento_despesa_tipo`, tabela `contabil_documento_despesa` (vigente + índice único parcial), RPC de guardar, `acao_superficie`, `leitura_tabela_tela`. Sem tocar `nfs_stage`, `despesas` ou `movimentacoes_bancarias`.
- Edge `gerar-pacote-contador-v2`: gera xlsx de retenções, inclui `05_despesas/`, faltantes de despesa, suporta `simular`.
- PDF NFS-e via `_shared/nfe-resumo-pdf.ts` estendido para layout NFS-e, gravado em `resumo_pdf_storage_path`.
- Front: componente `DocumentosDespesaMes.tsx` em `PacoteContador.tsx`, React Query, fail-loud.
