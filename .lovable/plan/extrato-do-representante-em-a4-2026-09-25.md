# Extrato do representante em A4

## Resultado
Substituir a impressão da ficha interna por um documento Fetély dedicado, com duas páginas A4 e somente informações apropriadas ao representante.

## Implementação
1. Criar a tela de impressão em `/comercial/representantes/:vendedorId/extrato-impressao`, autenticada e fora do `VendasLayout` e do `CasaLayout`, sem cabeçalho, sidebar ou controles do sistema.
2. Alterar “Baixar PDF” na ficha para abrir essa rota em nova aba, preservando `?competencia=AAAA-MM` quando informado; sem competência, usar o mês corrente de Brasília.
3. Montar a página 1 com:
   - marca FETÉLY em Cormorant Garamond e restante em DM Sans;
   - identificação, região, relacionamento e emissão;
   - situação financeira, desempenho e carteira;
   - histórico dos seis meses em uma tabela compacta de mês, vendido e comissão, evitando gráficos frágeis na impressão.
4. Montar a página 2 com o extrato da competência, usando `vw_comissao_detalhe` filtrada por representante e competência. Para garantir legibilidade em A4, usar as oito colunas prioritárias: NF, Pedido, Cliente, Comissão da nota, Parcela, Vencimento, Situação e Comissão da parcela.
5. Exibir totais apurado, liberado e a liberar; consultar estornos ligados às apurações da competência e mostrá-los como valores negativos com tipo e motivo.
6. Aplicar estilos próprios de papel: dois contêineres A4, quebra obrigatória antes da página 2, `@page { size: A4; margin: 15mm }`, rodapés institucionais e numeração fixa. Somente “FETÉLY” usa dourado; cores vêm dos tokens.
7. Remover da ficha a versão antiga de impressão embutida, mantendo as abas e demais conteúdos normais sem alteração.

## Comportamento e erros
- A tela dispara `window.print()` somente depois de todas as consultas terminarem e as fontes estarem prontas.
- Falhas de consulta aparecem claramente com a mensagem real; a impressão não abre com dados incompletos.
- Competência inválida mostra erro explícito; mês sem movimento mostra “Nenhuma comissão apurada nesta competência.”
- O documento não mostra prontidão, dados operacionais, URLs ou controles internos.

## Validação
- Rodar `bunx tsgo --noEmit -p tsconfig.app.json`.
- Abrir a ficha com sessão real e confirmar que “Baixar PDF” leva à tela limpa.
- Validar visualmente em modo de impressão A4 e gerar um PDF de teste.
- Renderizar as duas páginas do PDF como imagens e revisar cortes, sobreposições, moedas, datas, rodapés, numeração e ausência de conteúdo interno.

## Observação de governança
Esta é uma rota nova. Como o pedido proíbe mudança de banco, a implementação não chamará `fn_nascer_tela`; a rota usará temporariamente o portão comercial existente. O nascimento canônico com slug próprio e status `em_construcao` ficará pendente para uma solicitação explícita de banco.

## Premissa de volume
A página 2 será compactada sem cortar conteúdo. O desenho assume o volume mensal atual cabe em uma página A4; se uma competência excepcional ultrapassar esse limite, preservar legibilidade e conteúdo entra em conflito com a exigência de exatamente duas páginas e exigirá uma regra de continuação.
