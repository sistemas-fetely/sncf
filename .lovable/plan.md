# Diagnóstico DEV-B2C-1401: NF de devolução 000929 continua como "rascunho"

## O que já foi confirmado (somente leitura)

**Botão "Verificar autorização"**
- Fica em `NfDevolucaoBloco.tsx` e chama a rotina `devolucao-gerar-rascunho-nf` com `acao: "verificar"`.
- A rotina lê `devolucao.nf_dev_bling_id` e consulta `GET /nfe/27251144278` na API v3 do Bling.
- O resultado depende da situação devolvida pelo Bling:
  - **5 ou 6, sem cancelamento:** considera a nota autorizada e grava status, número e chave na devolução.
  - **2, cancelada ou 404:** grava "erro" com a mensagem "cancelada/excluída — gere de novo".
  - **Qualquer outra (1 pendente, 4, 7, 10...):** não grava nada e só mostra "Ainda não autorizada (situação X)".
- Ela olha **só** o id do rascunho e nunca procura outra nota da mesma cliente.

**Estado no SNCF**
- A devolução está assim: `nf_dev_status=rascunho`, bling_id 27251144278, número 000929, sem erro, atualizada em 28/10 21:02.
- Os registros não mostram nenhum clique em "Verificar" desde então.
- O SNCF não tem cópia de nenhuma NF de entrada da Silvane: a sincronização só traz notas de saída.
- A única nota dela no SNCF é a de origem, 000683 (saída, autorizada, 06/10, chave 4226…0428042).

**O que não consegui ver**
- Não consultei o Bling. O único caminho que o sistema tem é o próprio botão, e ele grava na devolução quando a nota está autorizada ou cancelada. Por isso não rodei nada, para respeitar o "só leitura".

## Passo que falta, se você aprovar (sem gravar nada)
Rodar uma consulta avulsa ao Bling com o mesmo acesso das rotinas, sem salvar nada no SNCF e sem publicar:
1. `GET /nfe/27251144278` para obter situação, número, série, chave e situacaoCancelamento.
2. `GET /nfe?tipo=0&dataEmissaoInicial=2026-10-28` filtrando pelo contato da Silvane, ou pela nota referenciada 000683 / chave 4226…0428042, para ver se a Eva emitiu outra nota.

A consulta é apagada logo depois. Também posso rodar a mesma coisa como script local, se você preferir.

## Causas possíveis (o passo 1 decide qual é)
- **A) A Eva emitiu uma nota nova** em vez de transmitir a 000929. O rascunho segue com situação 1 no Bling e o botão nunca enxerga a nota nova. Isso é o mais provável, pelo que o Flávio contou.
- **B) A 000929 foi transmitida, mas ficou numa situação fora de 5/6**, por exemplo 4 (enviada, aguardando o recibo da Sefaz) ou rejeitada. O botão informa "situação X" e não grava nada.
- **C) Ninguém clicou em "Verificar"** depois da transmissão. Os registros não mostram nenhuma chamada, então a tela continua com o estado antigo.

## Correção mínima proposta (não será aplicada agora)
- **Se for C:** só clicar em "Verificar autorização". Não precisa mudar código.
- **Se for B:** acrescentar a situação que o Bling devolver ao critério de autorizada, conferindo antes se ela significa mesmo "autorizada", e mostrar o nome da situação no aviso.
- **Se for A:** na verificação, quando o rascunho continuar pendente, procurar no Bling uma NF de entrada autorizada para o mesmo contato, emitida depois do rascunho, que referencie a nota 000683. Se houver exatamente uma, apontar a devolução para ela e avisar que o rascunho 000929 pode ser excluído. Para esta devolução, a correção pontual é uma migração versionada que troca bling_id, número e chave pela nota nova.
