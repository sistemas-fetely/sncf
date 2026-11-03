# Pacote do Contador v2

Objetivo: o escritório recebe num único pacote a planilha do mês, os XML/PDF das NFs e os arquivos bancários originais, com um manifesto que lista o que falta. Tudo fica em preview, sem publicar.

## O que já confirmei no código

- **Importações bancárias:** só duas telas gravam em `extrato_importacoes`, e nenhuma função do backend grava direto nela:
  - `src/pages/administrativo/ExtratoImportacao.tsx`: um único fluxo para os 13 tipos de arquivo, com insert provisório na linha 457 e troca do `fonte_tipo` na linha 502.
  - `src/components/financeiro/ImportarFaturaCartaoDialog.tsx`: `itau_fatura_cartao`, linha 164.
- **Retorno Safra:** o arquivo vai como texto para a função `processar-retorno-safra`, chamada na linha 1467 da tela. O registro na tabela de importações sai da própria tela.
- **Pacote atual:** a tela `PacoteContador.tsx` gera o arquivo, sobe para o bucket `pacotes-contador` e chama a função `gerar-pacote-contabil`.
  - Essa função grava `destinatarios` na linha 123, cria o link assinado de 30 dias e envia o e-mail.
  - Ainda existe uma segunda função parecida, `enviar-pacote-contador`, que usa ZIP montado no navegador. Vou verificar se ela ainda é chamada por `FechamentoContabil` ou `DocumentosPendentes`.
- **NFs:** o arquivo `_shared/bling/nf-anexo.ts` já busca link novo do PDF/XML no Bling e confere se o arquivo veio de verdade, porque o `pdf_url` expira em cerca de 48h. A cópia das NFs vai reutilizar esse código.

## O "—" em Destinatários: causa ainda não confirmada

A função grava o campo, então o problema está em outro lugar. Três suspeitas:
- a tela manda a lista vazia;
- as remessas antigas foram criadas por `enviar-pacote-contador` ou por outro caminho;
- a coluna exibida na tela não é a mesma que foi gravada.

**Primeiro passo da Fase 1:** consultar as remessas existentes e a origem de cada uma, e só então corrigir. Se o dado nunca foi gravado, ele não volta: as remessas antigas continuam com "—".

## Fase 1: guardar os originais (blocos 1 e 2), com retrofit só de 11/2026

### Bloco 1: arquivos bancários
- **Bucket privado `contabil`**, com caminho `bancos/<AAAA-MM>/<conta_bancaria_id>/<fonte_tipo>/<nome_arquivo>`.
  - Se já existir um arquivo com o mesmo nome, entra o sufixo `-<sha8>`.
  - Quem lê e grava é definido por `has_role_with_level`, com o mesmo nível que já libera a tela de importações.
- **Novas colunas em `extrato_importacoes`:** `arquivo_storage_path`, `arquivo_sha256`, `arquivo_bytes`, `arquivo_anexado_em`, `arquivo_anexado_por`.
- **Novo helper `src/lib/contabil/arquivoOriginal.ts`**, com teste:
  - calcula o sha256 e monta o caminho;
  - sobe o arquivo e depois grava as colunas.
  - Se a subida falhar, a importação para com o erro na tela (fail-loud). O arquivo sobe antes de qualquer linha ser processada.
- **Quem usa o helper:**
  - a tela de importações, depois do insert provisório (vale para todos os tipos, inclusive o retorno Safra);
  - a importação da fatura do cartão Itaú.
- **Nova RPC `fn_extrato_importacao_anexar_original`:** guarda o arquivo de uma importação antiga. Não reprocessa nada e recusa se a importação já tiver arquivo.
- **Na tela, aba Histórico:**
  - selo "sem arquivo" nas linhas sem original;
  - ação "Anexar arquivo original" nessas linhas;
  - aviso quando o sha do anexo bater com o de outra importação.

### Bloco 2: XML/PDF das NFs
- **NFs de saída (`nfs_emitidas`)**, novas colunas: `xml_storage_path`, `pdf_storage_path`, `arquivos_sincronizados_em`, `arquivos_erro`.
- **NFs de entrada (`nfs_stage`):** passam a usar o `arquivo_storage_path` que já existe, mais as colunas novas `xml_storage_path` e `arquivos_sincronizados_em`.
- **Novo código compartilhado `_shared/nf-cache-storage.ts`:**
  - baixa o arquivo pelo `nf-anexo.ts` e valida os bytes (o PDF tem que começar com `%PDF`, o XML com `<`);
  - grava em `nfs/<AAAA-MM>/saida/<numero>-<serie>.xml|.pdf`, e em `.../entrada/<chave>.xml` para as de entrada.
- **No sync das NFs:**
  - `sync-bling-financeiro/sync-nfe.ts` e `vd-nf-sync` chamam o cache quando a NF está autorizada ou cancelada.
  - É best-effort: um erro grava `arquivos_erro` e não derruba o sync.
- **NFs de entrada:** `sync-qive-dfe` guarda o XML que já recebe. O PDF de entrada só existe se a origem tiver; quando não tiver, isso entra no manifesto como faltante.
- **Nova função `nf-arquivos-retrofit`:** processa em lotes, com parâmetros de competência e tipo (saída/entrada). Ganha um botão "Buscar arquivos das NFs do mês" na tela do Pacote.
  - Roda só para 11/2026 nesta fase. 10/2026 fica para quando você autorizar.
- **Cancelamento e CC-e:**
  - O XML do cancelamento e da CC-e só entra se a API v3 do Bling expuser esses eventos. Isso ainda não está confirmado.
  - O primeiro passo do bloco 2 é testar uma NF cancelada real e um endpoint de eventos.
  - Se o Bling não expuser, o pacote leva só o XML da NF com a situação "cancelada", e o manifesto marca "evento de cancelamento/CC-e indisponível na origem".

**Teste da Fase 1:**
- importar um OFX e um retorno Safra e conferir que o arquivo e o sha foram gravados;
- anexar o original numa importação antiga;
- rodar o retrofit de 11/2026 e conferir as contagens e os erros com o corpo da resposta.

## Fase 2: o pacote como tarefa em segundo plano, a remessa e o reenvio (blocos 3 e 4)

### Bloco 3: gerar o pacote
- **Novas colunas em `remessas_contador`:**
  - `status` (`gerando` | `pronto` | `erro`), `progresso` (jsonb com etapa e contadores), `erro_mensagem`;
  - `versao`, `observacao`, `gerado_por`, `gerado_em`, `partes` (jsonb com a lista de arquivos e seus tamanhos), `manifesto` (jsonb).
  - Regra de unicidade: competência + versão.
- **Nova RPC `fn_remessa_contador_iniciar(competencia, destinatarios, observacao)`:**
  - checa a competência fechada (regra que já existe) e a permissão;
  - calcula a próxima versão e cria a remessa como `gerando`.
- **Nova função `gerar-pacote-contador-v2`, que roda em segundo plano** (`EdgeRuntime.waitUntil`):
  1. **Busca os arquivos:**
     - planilha atual e PDF em `01_relatorios/`;
     - NFs de saída em `02_nfs_saida/`, nas pastas `autorizadas/`, `canceladas/`, `cce/` e `devolucoes/`;
     - NFs de entrada em `03_nfs_entrada/`;
     - extratos em `04_bancos/<nome da conta>/<fonte_tipo>/`.
  2. **Monta `manifesto.json` e `manifesto.pdf`:**
     - contagens e totais por pasta;
     - NFs × vendas, reaproveitando `fn_contabil_posicao`;
     - por conta, o que foi importado × o que foi conciliado: saldo inicial e final, linhas, não conciliadas;
     - lista de faltantes: NF sem XML e importação sem arquivo original.
  3. **Escreve o ZIP aos poucos**, com fflate, em `contabil/pacotes/<AAAA-MM>/v<N>/pacote-contador-<AAAA-MM>-v<N>[-parteK].zip`.
  4. **Atualiza o progresso** a cada etapa e marca `pronto` ou `erro` com a mensagem real.
- **Limite de tamanho:** cada parte tem no máximo **150 MB**.
  - A memória da função no backend fica em torno de 256 MB e o tempo de execução em segundo plano em cerca de 400 s. Por isso cada parte é escrita e liberada antes da próxima.
  - O upload do arquivo aceita peças grandes, mas a memória é o que limita.
  - Se uma competência não couber no tempo, a geração continua num novo pedido, a partir do progresso gravado.
- **Na tela:** o botão "Gerar pacote" é a única forma de gerar e só fica ativo com a competência fechada. A tela consulta a remessa a cada 3 s enquanto ela estiver `gerando` e mostra a barra com a etapa atual.

### Bloco 4: remessa, histórico e reenvio
- **Reabrir a competência e gerar de novo cria a versão seguinte (v+1).** As versões anteriores ficam no histórico, com quem gerou, quando, destinatários e observação.
- **Nova RPC e nova função `remessa-contador-novo-link`:** criam um novo link assinado sobre os mesmos arquivos, sem gerar o pacote de novo. A ação "Gerar novo link" aparece quando o link estiver expirado.
- **E-mail:** sai pelo Resend, de `pedidos@notify.fetelycorp.com.br`, com os links das partes e o resumo do manifesto, e só quando houver destinatários.
  - Primeiro confiro se o envio de hoje já usa o Resend ou o envio de e-mails do próprio sistema, e mantenho o mesmo caminho.
  - Também poderá ser disparado por "Reenviar".
- **Aposentar as funções antigas:** `gerar-pacote-contabil` e `enviar-pacote-contador` só saem depois de eu confirmar quem ainda as chama. Até lá continuam funcionando para o fluxo atual.

**Teste da Fase 2:**
- gerar 11/2026 até o fim;
- baixar e abrir o ZIP e conferir as pastas e o manifesto;
- forçar a divisão em partes com um limite menor;
- gerar um novo link;
- reabrir a competência e gerar a v2.

## O que NÃO dá para recuperar de meses passados
- **Arquivos bancários originais importados antes da Fase 1:** só voltam se alguém tiver o arquivo e anexar à mão. O manifesto vai listá-los como faltantes.
  - Pode valer conferir `ofx_importacoes_stage.arquivo_storage_path` para casar alguns OFX antigos. Fica como passo opcional.
- **Eventos de cancelamento e CC-e:** só se o Bling ainda os fornecer.
- **XML/PDF de NFs que o Bling não devolver mais:** ficam como faltantes.
- **PDF das NFs de entrada** quando a origem não tem.
- **Destinatários das remessas antigas,** se nunca foram gravados.

## Detalhes técnicos

**Migrações** (pela ferramenta, uma por bloco):
1. Colunas de arquivo em `extrato_importacoes` e a RPC de anexar.
2. Colunas de cache em `nfs_emitidas` e `nfs_stage`.
3. Colunas de status e versão em `remessas_contador`, mais as RPCs de iniciar e de novo link.
4. Policies em `storage.objects` para o bucket `contabil`, que é criado pela ferramenta de Storage.

**Arquivos do app:** `ExtratoImportacao.tsx`, `ImportarFaturaCartaoDialog.tsx`, `PacoteContador.tsx`, novo `src/lib/contabil/arquivoOriginal.ts` com teste, novo `src/lib/contabil/estruturaPacote.ts` com teste (caminhos, nomes e divisão em partes).

**Funções do backend:**
- novas: `nf-arquivos-retrofit`, `gerar-pacote-contador-v2`, `remessa-contador-novo-link`, `_shared/nf-cache-storage.ts`, `_shared/pacote-contador/manifesto.ts`;
- alteradas: `sync-bling-financeiro/sync-nfe.ts`, `vd-nf-sync`, `sync-qive-dfe`.

**Regras do projeto:** nada em localStorage, rótulos lidos das tabelas, os botões novos registrados em `acao_superficie` com slug `acao.*`, regra de arquitetura anotada em `AGENTS.md`, nada publicado.
