import js from "@eslint/js";
import globals from "globals";
import reactHooks from "eslint-plugin-react-hooks";
import reactRefresh from "eslint-plugin-react-refresh";
import tseslint from "typescript-eslint";

export default tseslint.config(
  { ignores: ["dist"] },
  {
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
    files: ["**/*.{ts,tsx}"],
    languageOptions: {
      ecmaVersion: 2020,
      globals: globals.browser,
    },
    plugins: {
      "react-hooks": reactHooks,
      "react-refresh": reactRefresh,
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      "react-refresh/only-export-components": ["warn", { allowConstantExport: true }],
      "@typescript-eslint/no-unused-vars": "off",
    },
  },
  {
    // Purga concluida em 16/08/2026: a regra vale em todo o src, menos os
    // primitivos do shadcn e o codigo gerado. O que foi limpo nao suja de novo.
    files: ["src/**/*.{ts,tsx}"],
    ignores: ["src/components/ui/**", "src/integrations/**"],
    rules: {
      // ===== ERRO CEGO — proibe o idioma que produz "[object Object]" =====
      // ===== SISTEMA VISUAL Fetely — guardiao das regras de cor/peso/largura =====
      "no-restricted-syntax": [
        "error",
        {
          selector:
            "ConditionalExpression > BinaryExpression.test[operator='instanceof'][right.name='Error']",
          message:
            "ERRO CEGO: 'e instanceof Error ? e.message : String(e)' produz \"[object Object]\" para erros do Supabase. Use formatError(e) de @/lib/format-error.",
        },
        {
          selector:
            "CallExpression[callee.name='String'][arguments.length=1] > Identifier.arguments[name=/^(e|err|error|ex|erro)$/]",
          message:
            "ERRO CEGO: String(erro) produz \"[object Object]\". Use formatError(e) de @/lib/format-error.",
        },
        {
          selector:
            "JSXAttribute[name.name='className'] Literal[value=/\\b(text|bg|border|ring|divide|from|via|to|fill|stroke)-(red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose|slate|gray|zinc|neutral|stone)-(50|[1-9]00|950)\\b/]",
          message:
            "SISTEMA VISUAL §2: cor crua do Tailwind e proibida. Use token semantico (success, warning, destructive, info, muted, primary, gold). Cor crua quebra o modo escuro e compete com o dourado da marca.",
        },
        {
          selector:
            "JSXAttribute[name.name='className'] Literal[value=/\\bfont-(semibold|bold|extrabold|black)\\b/]",
          message:
            "SISTEMA VISUAL §5: so existem dois pesos, 400 (font-normal) e 500 (font-medium).",
        },
        {
          selector:
            "JSXAttribute[name.name='className'] Literal[value=/(^|\\s)(container|max-w-(4xl|5xl|6xl|7xl)|max-w-\\[1[0-9]{3}px\\])(\\s|$)/]",
          message:
            "SISTEMA VISUAL §7: pagina nao declara largura propria. Use <PageShell variant='dados'|'leitura'|'foco'>.",
        },
        {
          selector:
            "JSXAttribute[name.name='style'] Property > Literal[value=/^#[0-9a-fA-F]{3,8}$/]",
          message:
            "SISTEMA VISUAL §2: cor literal em style inline e proibida. Use classe com token semantico. (Cor vinda do banco e excecao — extraia para variavel antes.)",
        },
      ],
    },
  },
  {
    // ===== RATCHET do ERRO CEGO — divida legada, so pode encolher =====
    // Codigo novo NAO entra nesta lista -> regra e "error" para ele.
    // Quando zerar, remova este bloco inteiro.
    files: [
      "src/components/acervo/SincronizacaoEstoqueShopify.tsx",
      "src/components/compras/ImportarItensDialog.tsx",
      "src/components/compras/ImportarLinhasMercadoriaDialog.tsx",
      "src/components/compras/PedidoCompraDialog.tsx",
      "src/components/credito/BaixaManualDialog.tsx",
      "src/components/credito/BaixasPendentesAlert.tsx",
      "src/components/desligamento/IniciarDesligamentoDialog.tsx",
      "src/components/fala-fetely/AcessarMemoriasOutroDialog.tsx",
      "src/components/fala-fetely/DialogConsentimentoFalaFetely.tsx",
      "src/components/fala-fetely/SugerirProcessoDialog.tsx",
      "src/components/financas/AdicionarDocumentoDialog.tsx",
      "src/components/financeiro/AcaoMassaSuperAdminDialog.tsx",
      "src/components/financeiro/AcoesInlineConta.tsx",
      "src/components/financeiro/AcoesLancamentoCartao.tsx",
      "src/components/financeiro/AgruparLancamentosModal.tsx",
      "src/components/financeiro/BancosLiquidacaoPanel.tsx",
      "src/components/financeiro/BuscarDocumentoDialog.tsx",
      "src/components/financeiro/BuscarMultiplosLancamentosDialog.tsx",
      "src/components/financeiro/ClassificarDiretoDialog.tsx",
      "src/components/financeiro/ConciliarLoteDialog.tsx",
      "src/components/financeiro/ContaPagarDetalheDrawer.tsx",
      "src/components/financeiro/ContaPagarFormEdit.tsx",
      "src/components/financeiro/CriarRegraDialog.tsx",
      "src/components/financeiro/DespesaDiretaDialog.tsx",
      "src/components/financeiro/DialogNovoParceladoManual.tsx",
      "src/components/financeiro/DialogNovoRecorrente.tsx",
      "src/components/financeiro/DocumentosCP.tsx",
      "src/components/financeiro/EditarLancamentoDialog.tsx",
      "src/components/financeiro/EnviarPagamentoDialog.tsx",
      "src/components/financeiro/EnviarPeloSistemaDialog.tsx",
      "src/components/financeiro/FilaRevisaoIADialog.tsx",
      "src/components/financeiro/ImportadorItauPagamentos.tsx",
      "src/components/financeiro/ImportadorNFs.tsx",
      "src/components/financeiro/ImportadorOFX.tsx",
      "src/components/financeiro/ImportarExtratoDialog.tsx",
      "src/components/financeiro/ImportarFaturaCartaoDialog.tsx",
      "src/components/financeiro/ImportarNFDespesaDialog.tsx",
      "src/components/financeiro/ImportarOFXDialog.tsx",
      "src/components/financeiro/MarcarPagoDialog.tsx",
      "src/components/financeiro/NfStageBuscadorModal.tsx",
      "src/components/financeiro/PagamentosAlocacaoSection.tsx",
      "src/components/financeiro/PagarFaturaCartaoDialog.tsx",
      "src/components/financeiro/ParametrosFinanceiroTab.tsx",
      "src/components/financeiro/PlanoPagamentoDialog.tsx",
      "src/components/financeiro/SolicitarDocumentoDialog.tsx",
      "src/components/financeiro/SugestaoIADialog.tsx",
      "src/components/financeiro/UploadEmMassaDialog.tsx",
      "src/components/financeiro/VincularLancamentoModal.tsx",
      "src/components/ged/PastaDetalhe.tsx",
      "src/components/gerenciar-usuarios/CelulaPermissaoEditavel.tsx",
      "src/components/logistica/FaturasConciliacao.tsx",
      "src/components/logistica/ImportarBraspressDialog.tsx",
      "src/components/logistica/ImportarFretesDialog.tsx",
      "src/components/logistica/ImportarRastreioDialog.tsx",
      "src/components/logistica/ImportarTabelaPrecoDialog.tsx",
      "src/components/parametros/ParametrosBeneficiosSection.tsx",
      "src/components/parametros/ParametrosExtrasSection.tsx",
      "src/components/parametros/ParametrosUnidadesSection.tsx",
      "src/components/pedidos/dialogs/EditarCondicaoPagamentoDialog.tsx",
      "src/components/pedidos/dialogs/TabelaCadastroDialog.tsx",
      "src/components/shopify/ImportarCsvShopifyDialog.tsx",
      "src/components/vagas/PreencherVagaDialog.tsx",
      "src/components/wns/ImportarPlanilhaWnsDialog.tsx",
      "src/hooks/logistica/useOcorrenciaDepara.ts",
      "src/hooks/pedidos/useAtualizarUrgencia.ts",
      "src/hooks/pedidos/useCriarSplit.ts",
      "src/hooks/pedidos/useDividirRemessa.ts",
      "src/hooks/pedidos/useSalvarDadosEnvio.ts",
      "src/hooks/shopify/useImportarCsvShopify.ts",
      "src/hooks/useContaWorkflow.ts",
      "src/hooks/useFreteCorreios.ts",
      "src/hooks/useLancamentos.ts",
      "src/hooks/useRastreioCorreios.ts",
      "src/hooks/useReembolso.ts",
      "src/lib/financeiro/compromissos-handler.ts",
      "src/lib/financeiro/fatura-cartao-handler.ts",
      "src/lib/financeiro/stage-handler.ts",
      "src/lib/parceiros/excel-io.ts",
      "src/pages/Compras.tsx",
      "src/pages/Credito/CobrancaFila.tsx",
      "src/pages/FalaFetely.tsx",
      "src/pages/FolhaMensal.tsx",
      "src/pages/Pedidos/PedidoDetalhe.tsx",
      "src/pages/PessoaForm.tsx",
      "src/pages/Pessoas.tsx",
      "src/pages/TarefasDoTime.tsx",
      "src/pages/Vagas.tsx",
      "src/pages/Vendas/NfsDeVenda.tsx",
      "src/pages/administrativo/AnaliseDespesas.tsx",
      "src/pages/administrativo/BancoSafra.tsx",
      "src/pages/administrativo/BlingCallback.tsx",
      "src/pages/administrativo/Compromissos.tsx",
      "src/pages/administrativo/ConciliacaoCartao.tsx",
      "src/pages/administrativo/ConciliacaoDespesas.tsx",
      "src/pages/administrativo/ConfiguracaoIntegracao.tsx",
      "src/pages/administrativo/Contratos.tsx",
      "src/pages/administrativo/DocumentosPendentes.tsx",
      "src/pages/administrativo/ExtratoImportacao.tsx",
      "src/pages/administrativo/ExtratoInbox.tsx",
      "src/pages/administrativo/FaturasCartao.tsx",
      "src/pages/administrativo/FluxoCaixaFuturo.tsx",
      "src/pages/administrativo/GED.tsx",
      "src/pages/administrativo/NFsStage.tsx",
      "src/pages/administrativo/ParesTransferencia.tsx",
      "src/pages/administrativo/RecebimentosConciliar.tsx",
      "src/pages/administrativo/RegrasInbox.tsx",
      "src/pages/pessoas/ReembolsoCiclos.tsx",
      "src/pages/pessoas/ReembolsoSaneamento.tsx",
      "src/pages/ti/TesteEmailTemplate.tsx",
    ],
    rules: {
      "no-restricted-syntax": "warn",
    },
  },
);
