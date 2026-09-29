# Atualizar a aba Correios em Logística

## Implementação
- Ampliar Fretes & entregas para reunir todas as postagens dos Correios, enriquecendo pedido, destino, serviço e canal pela visão de postagens.
- Trocar os indicadores resumidos de Faturas pela tabela de ciclos da fatura, mantendo sincronização e postagens existentes.
- Identificar transportadoras com cotação por API; para elas, substituir a tabela de preços pelo simulador ao vivo e ocultar Ocorrências.
- Criar o simulador dos Correios com origem em centro de distribuição, destino, peso, dimensões opcionais e retorno de SEDEX/PAC.
- Ajustar somente os dois textos solicitados no painel logístico.

## Validação
- Rodar `bunx tsgo --noEmit -p tsconfig.app.json`.
- Não abrir o navegador, chamar a cotação, alterar dados ou publicar.
