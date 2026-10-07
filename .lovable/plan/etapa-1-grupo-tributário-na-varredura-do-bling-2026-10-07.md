# Etapa 1 — Grupo tributário na varredura do Bling

## Como o grupo vem na API v3 (confirmado nas leituras gravadas de 929 cards)
- Fica em `tributacao.grupoProduto`, só com o número: `{ "id": 813636 }`. Sem nome. `{ "id": 0 }` = sem grupo.
- `categoria` é outra coisa (categoria de loja), não serve.
- Distribuição nas leituras gravadas:
  - id 813636 — 249 cards, todos com origem 2 → indica "L1 - Produto Nacional Importado".
  - id 813637 — 7 cards, todos com origem 0 → indica "L2 - Produto Nacional".
  - id 0 (sem grupo) — 673 cards, 654 com origem 2 e 19 com origem 0 (entre eles FER001, FER002, FER003, INS002, INS0001).
- A ligação 813636 = L1 e 813637 = L2 é deduzida dos dados, não lida pelo nome. A edge vai confirmar pelo nome antes de comparar.

## O que muda
1. **Módulo compartilhado** `_shared/bling/montar-valores-produto.ts`: novo extrator `grupo_tributario`.
   - Esperado: origem SNCF 1/2/6/7 → nome "L1 - Produto Nacional Importado"; 0/3/4/5/8 → "L2 - Produto Nacional"; origem vazia → sem valor (não compara como erro, registra vazio igual aos outros campos).
   - No card: `tributacao.grupoProduto.id`, 0 vira vazio.
   - A comparação é feita por id: o nome esperado é traduzido para id pela tabela de grupos.
2. **Tabela de grupos, uma vez por execução** (memória): GET `/grupos-produtos` do Bling (paginado), monta nome → id. Se o endpoint falhar ou os nomes L1/L2 não existirem lá, a execução pára com o erro real (sem inventar id). Mesmo cliente compartilhado, mesmo ritmo de ~3 req/s.
3. **Varredura (detectar)**: o campo entra **mesmo sem linha em `produto_campo_destino`** (por decisão sua ainda não existe), como comparação fixa extra só deste campo. Divergência grava em `produto_destino_divergencia` com campo `grupo_tributario`, `valor_sncf` = "L1 - …"/"L2 - …", `valor_destino` = nome do grupo no card (ou vazio).
4. **Corrigir**: só toca o grupo se existir linha `grupo_tributario` com `sobrescreve = true`. Hoje não existe → corrigir só detecta. Quando ligar, o PUT parte do GET do card e altera apenas `tributacao.grupoProduto = { id }` (id da tabela do passo 2).
5. Nada no banco, sem migração, sem cron, sem publicar o app. `corrigir-produto-bling` intocada.

## Teste (depois do deploy só desta função)
- detectar com `skus: ["CL-FT-DSP-35-FRT","CL-FT-TOP-7-FRT"]` → esperado 0 divergência de grupo (ambos origem 2; o card deve ter o id de L1 após o preenchimento manual de hoje).
- FER001/FER002/FER003/INS002/INS0001: **não estão em `sncf_produtos`** (só no espelho do Bling), então ficam fora do universo da varredura e não podem ser testados por ela. Proposta: testar com alguns dos 654 SKUs de origem 2 sem grupo (escolho 3 da leitura gravada) → esperado divergência "L1 - …" × vazio.
- Ponto de bloqueio já conhecido: a chamada exige o `x-cron-secret` do cofre, que eu não tenho. Você roda as chamadas (ou me autoriza o caminho) e eu confiro o lote no banco.

## Arquivos
- Alterado: `supabase/functions/_shared/bling/montar-valores-produto.ts`
- Alterado: `supabase/functions/varrer-divergencia-bling/index.ts`
