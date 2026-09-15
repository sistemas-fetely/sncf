# Mesa de gestão de consignados

## Resultado
Reorganizar a tela de detalhe do consignado para destacar a situação financeira na primeira dobra e distribuir a operação em abas, sem alterar regras, ações ou banco.

## Implementação
- Trocar o cabeçalho atual por identificação completa do parceiro, modelo/cadência e um indicador compacto de crédito; manter o bloqueio operacional e seu texto logo abaixo.
- Ler `vw_consignado_parceiro_resumo` e montar cinco cartões de gestão usando exclusivamente os valores prontos da view.
- Controlar as seções pela URL em `?secao=`, com “Ciclo de acerto” como padrão e fallback seguro para valores inválidos.
- Mover a mecânica existente de acerto e histórico para a primeira aba, sem alterar mutações, validações ou o diálogo de importação.
- Criar a leitura de remessas em `nfs_emitidas`, associar visualmente as duplicidades já consultadas e mover o extrato atual para a mesma aba, exibindo o mais recente primeiro.
- Reorganizar o estoque existente em aba própria, com busca, filtro de movimento, ordenação pedida e totais, respeitando os dois modelos fiscais.
- Mostrar a seção de retorno existente em aba exclusiva apenas para consignação fiscal.

## Limites
- Alteração concentrada em `src/pages/Comercial/ConsignadoDetalhe.tsx`; nenhum SQL, RPC, view ou regra de negócio será modificado.
- Consultas novas serão apenas de leitura e erros continuarão visíveis na própria tela.
- Ao final, validar tipos e a renderização da tela em desktop e celular.
