# F2 de Transferências Internas

## O que será ajustado
- Na aba **Nova transferência**, colocar **Tipo** como primeira escolha, com cartões lado a lado para **Física** e **Regularização**, mantendo Física como padrão.
- Remover o seletor antigo de regularização e preservar o mesmo valor enviado na criação: Física = `false`, Regularização = `true`.
- Exibir **Sugestão do motor** somente para Física; ao trocar para Regularização enquanto esse modo estiver ativo, voltar para **Item a item**.
- Na aba **Receber no destino**, buscar somente naturezas marcadas como exigindo recebimento e aplicar o selo padrão da Casa dos Pedidos aos estágios conhecidos.
- Remover apenas o botão **Nova transferência** do cabeçalho, mantendo as quatro abas e todo o conteúdo existente.

## Validação
- Executar o typecheck.
- Abrir diretamente as abas Nova transferência e Receber no destino no navegador.
- Confirmar os dois cartões, a troca para Regularização, o desaparecimento de Sugestão do motor, a fila esperada e os selos.
- Confirmar que o cabeçalho não possui mais o botão, sem clicar em Criar transferência ou Receber.

## Limites
- Somente frontend; sem banco, migrations, RPCs, navegação cadastrada, permissões, publicação ou mudanças nos quatro componentes explicitamente protegidos.
