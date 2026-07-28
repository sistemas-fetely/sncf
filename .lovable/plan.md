Nenhuma alteração proposta — foi só investigação. Resposta detalhada já está no chat acima.

Resumo:
1. `materializar_cobranca` é chamada em `src/pages/Credito/CobrancaDetalhe.tsx` via `useMaterializarCobranca`. As parcelas NÃO são digitadas do zero: vêm da RPC `propor_cobranca` (hook `usePropostaCobranca`), com primeira data e cascata aplicadas pelos parâmetros `dias_primeiro_pagamento` e `intervalo_entre_parcelas`. O operador pode editar antes de materializar.
2. `fn_sugerir_cobranca_molde_pai` não é chamada em nenhum arquivo `.ts/.tsx` (só aparece em `types.ts` gerado).
3. O portão de entrada é gerado na própria `CobrancaDetalhe.tsx` via `useCriarPortaoProvisorio` (RPC `criar_portao_provisorio`), a partir do estágio `cobranca`. Não existe RPC `gerar_portao` — é só uma string retornada por `liberar_pedido_estoque` para orientar o toast na Triagem/Detalhe do Pedido.

Me diga se quer que eu proponha algum ajuste a partir daí.