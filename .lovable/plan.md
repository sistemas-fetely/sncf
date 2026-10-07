# Porta única de produto e funil de entrada

- Renomear o botão e o diálogo para “Nascer produto”, mantendo o gate existente.
- Adicionar Origem (Nacional padrão / Importado), enviar para `fn_nascer_produto` e exibir na prévia. Ajustar indicação e helper de inner conforme origem, preservando a validação e os erros do banco.
- Reorganizar Chegada em Painel, Pendências, Documentos de entrada, Novo pedido, Importação (PI) e Ferramentas. As duas últimas terão sub-abas com os conteúdos atuais intactos.
- Preservar links antigos e guardar seleção das sub-abas na URL sem colisão com os conteúdos embutidos.
- Validar navegação e formulário sem criar produtos reais. Não alterar banco, RPCs, fluxos existentes nem publicar.

## Detalhes técnicos
- Mudanças restritas ao botão, diálogo e casca de abas; testes pequenos para payload e compatibilidade da seleção.