# F1: exportar a planilha de cadastro de produto a partir do FOP

## Bloqueio a resolver antes de construir

Hoje o SNCF conversa com o FOP só por portas prontas, autenticadas pelo token `FOP_INBOUND_TOKEN` (que vem do vault):
- `sincronizar-catalogo` com `modo: "gravar_produto"` (só escrita), usada pela `gravar-produto-fop`;
- RPCs do tipo `fn_representantes_para_sncf(p_token)`, chamadas com a chave pública do FOP.

Não existe uma porta de LEITURA que devolva a tabela `products` do FOP, nem a `fn_produto_fase_pendencias`. A chave de serviço do FOP nunca foi configurada, como diz um comentário na própria `gravar-produto-fop`. Sem uma porta nova no FOP, a edge do SNCF não tem como ler o mestre.

**Suposição (a confirmar):** o FOP passa a expor uma RPC de leitura no mesmo padrão dos representantes, por exemplo:

```text
fn_produtos_para_sncf(p_token text, p_colecoes text[] default null)
  -> [{ cod_cadastro, <campos da ficha>..., fase_atual, proxima_fase,
        pendencias_proxima_fase: text[] }]
```

As pendências saem de dentro do FOP, via `fn_produto_fase_pendencias(p, próxima fase)`. Essa RPC é trabalho no projeto FOP, fora deste projeto. Se já existir outra porta de leitura (por exemplo, um `modo` de leitura no `sincronizar-catalogo`), me diga o nome e o formato, e eu uso essa.

## O que será construído (depois que a porta do FOP existir)

### 1. Edge `exportar-planilha-produto` (nova)
- Login obrigatório. A permissão é a mesma da Mesa do Produto: hoje a rota da Mesa só exige estar logado (`ProtectedRoute`), sem slug próprio.
- Entrada: `{ colecoes?: string[] }`. Se vier vazio, exporta o catálogo inteiro.
- Lê o token `FOP_INBOUND_TOKEN` com `get_vault_secret`, nunca com `Deno.env`. Chama a RPC de leitura do FOP e repassa o erro dela tal como vier.
- Monta o "espelho" a partir do SNCF, só para leitura:
  - `sncf_produtos`: valor sugerido para cada campo da ficha que está vazio no FOP, mais o `nome_operacional`;
  - `cartorio_codigo.inner_qtd`.
- Lê a ficha em `produto_ficha_nascimento`, sem os blocos `estado` e `foto`, ordenada por bloco e ordem. As opções de lista vêm de `fn_ficha_opcoes`.
- Resposta: `{ ok, ficha[], opcoes{campo: string[]}, produtos[{ valores, sugestoes{campo: valor}, fase_atual, proxima_fase, pendencias[] }] }`.
- Não grava nada no banco.

### 2. Geração do arquivo no navegador (exceljs, que já está instalado)
- **Colunas:** uma por campo da ficha, mais "Fase atual" e "Falta para <próxima fase>" no fim.
- **Cabeçalho:**
  - linha 1 oculta com o slug do campo;
  - linha 2 com uma faixa colorida por bloco (identidade, fiscal/físico, classificação, comercial);
  - linha 3 com "Rótulo · dono".
  - Cabeçalho congelado e autofiltro.
- **Listas:** aba oculta "listas", com dropdown real do Excel apontando para intervalos dessa aba.
- **Campos travados:** os que têm `importavel_planilha = false` ficam bloqueados. A planilha fica protegida sem senha, e as demais células continuam editáveis.
- **Sugestão do espelho:** a célula vem preenchida com o valor do SNCF, com fundo amarelo e o comentário "valor só no SNCF — confirme ou corrija".
- **Nome do arquivo:** `cadastro_produto_<colecao|catalogo>_<AAAA-MM-DD>.xlsx`.

### 3. Mesa do Produto
- Botão "Exportar planilha de cadastro" no cabeçalho, ao lado de "Exportar CSV".
- Ao clicar, abre uma janela para escolher as coleções (todas, uma ou várias), com a lista de coleções que a Mesa já carrega. Depois é só confirmar para gerar o arquivo.
- Se der erro, a mensagem real do FOP ou do banco aparece na janela e num aviso, sem estado vazio disfarçado.

## Teste
- Exportar a coleção "Esprit d'Halloween".
- Conferir que os produtos de 02032 a 02041 trazem embalagem e material em amarelo, como "a confirmar".
- Conferir que a coluna "Falta para…" bate com o FOP.

## Fora do escopo
- `PlanilhaPendencias.tsx`, a importação (F2) e as outras telas.
- Nenhuma tabela nova e nenhuma alteração em `produto_ficha_nascimento`.
- Sem publicação.

## Detalhes técnicos
- **Arquivos novos:**
  - `supabase/functions/exportar-planilha-produto/index.ts`;
  - `src/lib/acervo/planilha-cadastro-xlsx.ts`, que monta o arquivo;
  - `src/components/acervo/ExportarPlanilhaCadastroDialog.tsx`.
- **Arquivo alterado:** `src/pages/acervo/MesaProduto.tsx`, só para incluir o botão e a janela.
- **Ação nova:** a exportação é uma ação de botão nova. Pela regra do projeto, ela precisa ser registrada em `acao_superficie` com um slug `acao.*`, e isso é feito no banco por você. Até lá, o botão fica visível para quem entra na Mesa.
