import { PageShell } from "@/components/layout/PageShell";
import { PageHeader } from "@/components/layout/PageHeader";
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Upload, Loader2, FileText, Link2, CreditCard } from "lucide-react";
import { toast } from "sonner";
import { ImportadorItauPagamentos } from "@/components/financeiro/ImportadorItauPagamentos";
import { ImportarFaturaCartaoDialog } from "@/components/financeiro/ImportarFaturaCartaoDialog";
import { parseOFX } from "@/lib/financeiro/ofx-parser";
import { parseXlsxSafraLancamentos } from "@/lib/financeiro/xlsx-safra-lancamentos-parser";
import { parseXlsxMpWithdraw } from "@/lib/financeiro/xlsx-mp-withdraw-parser";
import { parseCsvSafraPayTipo2 } from "@/lib/financeiro/csv-safrapay-tipo2-parser";
import {
  gravarLiquidacaoSafraPay,
  resolverLotesDoDia,
} from "@/lib/financeiro/gravar-liquidacao-safrapay";
import { parseCsvSafraPayTipo1 } from "@/lib/financeiro/csv-safrapay-tipo1-parser";
import { parseCsvSafraPayTipo3 } from "@/lib/financeiro/csv-safrapay-tipo3-parser";
import { detectarCsvSafraPay } from "@/lib/financeiro/csv-safrapay-detect";
import { parseCsvSafraPayLink } from "@/lib/financeiro/csv-safrapay-link-parser";
import { parseXlsxMpSettlement } from "@/lib/financeiro/xlsx-mp-settlement-parser";
import { parseXlsxMpReserveRelease } from "@/lib/financeiro/xlsx-mp-reserve-release-parser";
import { parseXlsxSafraInstrucoes2Via } from "@/lib/financeiro/xlsx-safra-instrucoes-parser";
import { parseXlsxSafraFrancesinha } from "@/lib/financeiro/xlsx-safra-francesinha-parser";
import { temTitulo, textoPrimeirasLinhas } from "@/lib/financeiro/xlsx-titulo";
import { detectarAssinaturaSafraXlsx } from "@/lib/financeiro/xlsx-safra-assinatura";
import { parseXlsxSafraPixLancamentos } from "@/lib/financeiro/xlsx-safra-pix-lancamentos-parser";
import { parseXlsxSafraPayRecebiveis } from "@/lib/financeiro/xlsx-safrapay-recebiveis-parser";


import { ehRetornoSafra } from "@/lib/financeiro/cnab-retorno-safra-parser";

import { ResumoSafraCarteira } from "@/components/financeiro/ResumoSafraCarteira";
import * as XLSX from "xlsx";
import { gerarHashMov, identidadeMovOfx } from "@/lib/financeiro/hash-mov";
import { ContagemImportacao } from "@/lib/financeiro/contagem-importacao";
import { inserirMovimentacao, inserirMovimentacoes } from "@/lib/financeiro/inserir-mov";
import { VereditoImportacao, type VereditoArquivo } from "@/components/financeiro/VereditoImportacao";

import { formatDateBR } from "@/lib/format-currency";
import { formatError, rawMessage } from "@/lib/format-error";
import { BlocoErroBoundary } from "@/components/BlocoErroBoundary";
import { useInvalidarRecebivel } from "@/hooks/recebivel/useInvalidarRecebivel";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const sb = supabase as any;

type Conta = { id: string; nome_exibicao: string };
type Importacao = {
  id: string;
  conta_bancaria_id: string | null;
  fonte_tipo: string;
  nome_arquivo: string;
  periodo_inicio: string | null;
  periodo_fim: string | null;
  status: string;
  linhas_lidas: number | null;
  linhas_novas: number | null;
  linhas_enriquecidas: number | null;
  linhas_duplicadas: number | null;
  linhas_ignoradas: number | null;
  ignoradas_detalhe: Record<string, number> | null;
  divergencia_saldo: number | null;
  erro_detalhe: string | null;
  created_at: string;
};

type Fonte =
  | "ofx"
  | "safra_lancamentos"
  | "safra_pix_lancamentos"
  | "safrapay_agenda_vendas"
  | "safrapay_recebiveis"
  | "mp_withdraw"
  | "safrapay_vendas"
  | "safrapay_liquidacao"
  | "safrapay_ajustes"
  | "safrapay_link"
  | "super_agenda"
  | "mp_settlement"
  | "mp_release"
  | "safra_instrucoes_2via"
  | "safra_francesinha"
  | "retorno_safra";

/** Fontes reconhecidas que não importam nada — redundantes com outra porta. */
const FONTE_REDUNDANTE: Partial<Record<Fonte, string>> = {
  safrapay_agenda_vendas:
    "Agenda de Vendas é a AUTORIZAÇÃO — os 55 NSUs já vivem em safrapay_venda. Nada importado.",
};

function detectarFonteBase(file: File): "ofx" | "xlsx" | "csv" | "txt" | null {
  const nome = file.name.toLowerCase();
  if (nome.endsWith(".ofx")) return "ofx";
  if (nome.endsWith(".xlsx")) return "xlsx";
  if (nome.endsWith(".csv")) return "csv";
  if (nome.endsWith(".txt") || nome.endsWith(".ret")) return "txt";
  return null;
}

async function ehRelatorioPagamentosItau(file: File): Promise<boolean> {
  if (!file.name.toLowerCase().endsWith(".xlsx")) return false;
  const buf = await file.arrayBuffer();
  const wb = XLSX.read(buf, { type: "array" });
  const sheet = wb.Sheets[wb.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, defval: null }) as unknown[][];
  const cabecalho = rows.slice(0, 10)
    .map((r) => (r || []).map((c) => String(c ?? "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "")).join("|"))
    .join("|");
  return /tipo de pagamento/.test(cabecalho) && /nome favorecido/.test(cabecalho);
}

async function detectarSubtipoXlsx(file: File): Promise<Exclude<Fonte, "ofx">> {
  const buf = await file.arrayBuffer();
  const wb = XLSX.read(buf, { type: "array" });
  const sheet = wb.Sheets[wb.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, defval: null }) as unknown[][];

  // ASSINATURA-MANDA-NO-NOME: o título que o Safra escreve dentro do arquivo tem
  // precedência sobre qualquer palpite por nome de arquivo ou por cabeçalho.
  const assinatura = detectarAssinaturaSafraXlsx(rows);
  if (assinatura) return assinatura;

  // Fontes de cobrança Safra: título nas primeiras linhas, em qualquer coluna,
  // sem acento e sem caixa. O nome do arquivo NUNCA é critério — ele varia
  // ("Francesinha (8).xlsx").
  if (temTitulo(rows, /recebimentos\s*-\s*instrucoes/)) return "safra_instrucoes_2via";
  if (temTitulo(rows, /francesinha/)) return "safra_francesinha";

  const cabecalho = textoPrimeirasLinhas(rows, 5);

  if (/data de liberacao do dinheiro/.test(cabecalho)) return "mp_settlement";
  if (/valor liquido creditado/.test(cabecalho) && /saldo/.test(cabecalho)) return "mp_release";
  if (/withdraw_id|numero da retirada/.test(cabecalho)) return "mp_withdraw";
  return "safra_lancamentos";
}


/**
 * `extrato_importacoes.fonte_tipo` agora é validado por trigger contra
 * `extrato_fontes` — cada fonte grava o próprio código, sem disfarce.
 * Histórico sempre existe: importação que não aparece no histórico não aconteceu.
 */
const FONTE_TIPO_DB: Record<Fonte, string> = {
  ofx: "ofx",
  safra_lancamentos: "safra_lancamentos",
  // O código `safra_lancamentos` da dimensão JÁ É "Lançamentos e Devoluções (PIX)".
  safra_pix_lancamentos: "safra_lancamentos",
  // Fontes reconhecidas e fora do escopo: a dimensão as trata como agenda (papel `fora`).
  safrapay_agenda_vendas: "agenda_vendas",
  // "Recebiveis de Vendas" é o repasse: a dimensão já tem o código da liquidação.
  safrapay_recebiveis: "safrapay_liquidacao",

  mp_withdraw: "mp_withdraw",
  safrapay_vendas: "safrapay_vendas",
  safrapay_liquidacao: "safrapay_liquidacao",
  safrapay_ajustes: "safrapay_ajustes",
  safrapay_link: "safrapay_link",
  super_agenda: "super_agenda",
  mp_settlement: "mp_settlement",
  mp_release: "mp_release",
  safra_instrucoes_2via: "safra_instrucoes_2via",
  safra_francesinha: "csv_safra",
  retorno_safra: "retorno_safra",
};


type Bloco = "extrato" | "auxiliar";

const BLOCO_DA_FONTE: Record<Fonte, Bloco> = {
  ofx: "extrato",
  safra_lancamentos: "extrato",
  safra_pix_lancamentos: "auxiliar",
  safrapay_agenda_vendas: "auxiliar",
  safrapay_recebiveis: "auxiliar",

  mp_withdraw: "auxiliar",
  safrapay_vendas: "auxiliar",
  safrapay_liquidacao: "auxiliar",
  safrapay_ajustes: "auxiliar",
  safrapay_link: "auxiliar",
  super_agenda: "auxiliar",
  mp_settlement: "auxiliar",
  mp_release: "auxiliar",
  safra_instrucoes_2via: "auxiliar",
  safra_francesinha: "auxiliar",
  retorno_safra: "auxiliar",
};

const NOME_BLOCO: Record<Bloco, string> = {
  extrato: "1. Extratos",
  auxiliar: "2. Relatórios auxiliares",
};

const PARSER_ROTULO: Partial<Record<Fonte, string>> = {
  safra_instrucoes_2via: "Recebimentos - Instruções 2ª via",
  safra_francesinha: "Gestão de Cobrança - Francesinha",
  safrapay_vendas: "SafraPay Tipo 1 - Vendas",
  safrapay_liquidacao: "SafraPay Tipo 2 - Realizado",
  safrapay_ajustes: "SafraPay Tipo 3 - Ajustes",
  safrapay_link: "SafraPay Link de Pagamento",
  super_agenda: "SafraPay SUPER AGENDA (não importável)",
  retorno_safra: "Retorno CNAB 400 Safra (cobrança)",
  safra_pix_lancamentos: "Safra Lançamentos e Devoluções (PIX)",
  safrapay_agenda_vendas: "SafraPay Agenda de Vendas (não importável)",
  safrapay_recebiveis: "SafraPay Recebíveis de Vendas (composição do lote)",
};

/**
 * CONTAGEM-NAO-DIZ-O-EFEITO (01/09/2026)
 *
 * A contagem responde "a conta fecha?". Ela não responde "o que este arquivo
 * faz". Quando os toasts específicos viraram `resumo()`, sumiram frases que
 * eram REGRA e não decoração ("o Settlement não cria movimentação"). Aqui elas
 * voltam presas à fonte, e aparecem no toast E no card do veredito.
 */
const PARSER_EFEITO: Record<Fonte, string> = {
  ofx: "Extrato oficial — cria as movimentações bancárias do período.",
  safra_lancamentos: "Extrato Safra — cria as movimentações bancárias do período.",
  safra_pix_lancamentos:
    "PIX enviados e recebidos — enriquece a linha do extrato com pedido e pagador. Nunca cria movimentação.",
  safrapay_agenda_vendas: FONTE_REDUNDANTE.safrapay_agenda_vendas!,
  safrapay_recebiveis:
    "Composição do lote de cartão — grava NSU, parcela e taxa por repasse. Não cria movimentação bancária.",

  mp_withdraw: "Retiradas Mercado Pago — cria a transferência quando não há par no extrato.",
  safrapay_vendas: "Vendas SafraPay — agenda de recebíveis; o dinheiro entra pelo OFX.",
  safrapay_liquidacao:
    "Liquidação SafraPay — grava a composição do lote (NSU, parcela, MDR = bruto − recebido). A conta é sobre a composição; enriquecer o extrato é efeito secundário.",
  safrapay_ajustes:
    "Ajuste sempre acompanha um crédito que já está no OFX — não cria dinheiro novo.",
  safrapay_link:
    "Link de Pagamento SafraPay — grava a cobrança e amarra ao pedido pela identificação. O dinheiro entra pelo OFX; este arquivo é a prova de origem.",
  super_agenda: "SUPER AGENDA não é importável — é projeção, não movimento.",
  mp_settlement: "O Settlement não cria movimentação — é só enriquecimento da linha do extrato.",
  mp_release: "Liberações Mercado Pago — enriquece a linha do extrato.",
  safra_instrucoes_2via:
    "Conferência da carteira — não gera movimentação nem baixa em título.",
  safra_francesinha:
    "Snapshot diário: enriquece a linha do extrato, nunca insere — o dinheiro do boleto chega pelo OFX. Snapshot repetido não é reaplicado.",
  retorno_safra:
    "Resposta do banco à remessa — registra e aplica ocorrências; não cria movimentação bancária.",
};


export default function ExtratoImportacao() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const invalidarRecebivel = useInvalidarRecebivel();
  const [conta, setConta] = useState<string>("");
  const [contaAux, setContaAux] = useState<string>("");
  const [arquivos, setArquivos] = useState<File[]>([]);
  const [arquivosAux, setArquivosAux] = useState<File[]>([]);
  const [processando, setProcessando] = useState(false);
  const [processandoAux, setProcessandoAux] = useState(false);
  const [reprocessandoItau, setReprocessandoItau] = useState(false);
  const [importarFaturaOpen, setImportarFaturaOpen] = useState(false);
  const [conferencia, setConferencia] = useState<{ contaId: string; dataReferencia: string } | null>(
    null
  );
  // VEREDITO-POR-ARQUIVO (01/09/2026): um toast só escondia arquivo que falhou.
  // Cada arquivo do upload deixa a própria linha, com o parser que o leu e a
  // conta fechada. Erro fica na tela e não desaparece sozinho.
  const [resultados, setResultados] = useState<VereditoArquivo[]>([]);



  async function enriquecerItau() {
    setReprocessandoItau(true);
    try {
      const { data, error } = await sb.rpc("enriquecer_pagamentos_itau");
      if (error) throw error;
      const vinc = data?.vinculados ?? 0;
      const enr = data?.enriquecidas ?? 0;
      const amb = data?.ambiguos ?? 0;
      let msg = `Vínculo: ${vinc} pagamentos ligados ao extrato, ${enr} débitos identificados`;
      if (amb > 0) msg += ` · ${amb} ambíguos — tratar manualmente`;
      toast.success(msg);
      qc.invalidateQueries({ queryKey: ["conciliacao-furos"] });
      qc.invalidateQueries({ queryKey: ["movimentacoes-bancarias"] });
    } catch (e) {
      toast.error("Falha ao enriquecer: " + formatError(e));
    } finally {
      setReprocessandoItau(false);
    }
  }

  const { data: contas = [] } = useQuery({
    queryKey: ["extrato-import-contas"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("contas_bancarias")
        .select("id, nome_exibicao")
        .eq("ativo", true)
        .order("nome_exibicao");
      if (error) throw error;
      return (data || []) as Conta[];
    },
  });

  const { data: historico = [], refetch } = useQuery({
    queryKey: ["extrato-importacoes"],
    queryFn: async () => {
      const { data, error } = await sb
        .from("extrato_importacoes")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(50);
      if (error) throw error;
      return (data || []) as Importacao[];
    },
  });

  async function processarArquivo(
    file: File,
    conta: string,
    bloco: Bloco,
    trilha: {
      fonte?: Fonte;
      resumo?: string;
      contagem?: ContagemImportacao;
      /**
       * Sucesso idempotente: o arquivo não foi lido porque já tinha sido
       * processado antes. Veredito em tom neutro, nem verde nem vermelho.
       */
      neutro?: { resultado: string; contagem?: string; detalhe?: Record<string, number> };
    } = {}
  ) {
    if (!conta || !user) throw new Error("Selecione a conta bancária");
    const base = detectarFonteBase(file);

    // A linha do histórico nasce ANTES de qualquer leitura: se a detecção ou o
    // parser explodir, o erro fica registrado no histórico e não some.
    const tipoProvisorio =
      base === "ofx"
        ? "ofx"
        : base === "csv"
          ? "safrapay_liquidacao"
          : base === "txt"
            ? "retorno_safra"
            : "safra_lancamentos";
    const { data: impRow, error: errImp } = await sb
      .from("extrato_importacoes")
      .insert({
        conta_bancaria_id: conta,
        fonte_tipo: tipoProvisorio,
        nome_arquivo: file.name,
        status: "processando",
        importado_por: user.id,
      })
      .select("id")
      .single();
    if (errImp) throw errImp;
    const impId = impRow.id as string;

    let fonte: Fonte = "safra_lancamentos";
    let textoCsv = "";
    try {
      if (!base) throw new Error(`Extensão não reconhecida: ${file.name} (aceito .ofx, .xlsx, .csv)`);
      if (base === "ofx") {
        fonte = "ofx";
      } else if (base === "txt") {
        textoCsv = await file.text();
        if (!ehRetornoSafra(textoCsv))
          throw new Error(
            "Arquivo .txt não reconhecido como Retorno CNAB 400 do Safra (a primeira linha precisa começar com 02RETORNO01COBRANCA e conter 422SAFRA)."
          );
        fonte = "retorno_safra";
      } else if (base === "csv") {
        // O CSV SafraPay declara o tipo na primeira coluna de cada linha.
        textoCsv = await file.text();
        const det = detectarCsvSafraPay(textoCsv);
        if (!det.tipo)
          throw new Error(
            `CSV não reconhecido como SafraPay (coluna T ausente e nenhuma assinatura conhecida). Primeiras linhas:\n${det.amostra}`
          );
        fonte = det.tipo;
      } else {
        fonte = await detectarSubtipoXlsx(file);
      }
      trilha.fonte = fonte;

      // O rastro grava a fonte real antes de qualquer recusa
      await sb
        .from("extrato_importacoes")
        .update({ fonte_tipo: FONTE_TIPO_DB[fonte] })
        .eq("id", impId);

      if (fonte === "super_agenda") {
        throw new Error(
          "SUPER AGENDA é previsão de recebível, será tratada no Fluxo Futuro — não importada aqui."
        );
      }

      // FONTE-RECONHECIDA-NAO-E-ERRO: a Agenda de Vendas é a AUTORIZAÇÃO e os
      // NSUs dela já vivem em `safrapay_venda`. Reconhecer e recusar com
      // dignidade: registra, tom neutro, invariante 0 = 0 + 0 + 0.
      const redundante = FONTE_REDUNDANTE[fonte];
      if (redundante) {
        await sb
          .from("extrato_importacoes")
          .update({
            status: "concluida",
            linhas_lidas: 0,
            linhas_novas: 0,
            linhas_enriquecidas: 0,
            linhas_duplicadas: 0,
            linhas_ignoradas: 0,
            ignoradas_detalhe: { arquivo_redundante: 1 },
            erro_detalhe: null,
          })
          .eq("id", impId);
        trilha.neutro = {
          resultado: `${PARSER_ROTULO[fonte]} — nada importado`,
          contagem: "arquivo não lido — a autorização já existe em safrapay_venda",
          detalhe: { arquivo_redundante: 1 },
        };
        toast.info(`${file.name}: ${redundante}`);
        return;
      }


      const blocoCerto = BLOCO_DA_FONTE[fonte];
      if (blocoCerto !== bloco) {
        toast.warning(
          `${file.name} foi reconhecido como ${PARSER_ROTULO[fonte] || fonte} — o lugar dele é o bloco "${NOME_BLOCO[blocoCerto]}". Importando de qualquer forma.`
        );
      }

    } catch (e) {
      await sb
        .from("extrato_importacoes")
        .update({ status: "erro", erro_detalhe: rawMessage(e) })
        .eq("id", impId);
      throw e;
    }


    try {
      // CONTA-FECHADA-OU-ERRO: toda linha lida cai em novas, duplicadas ou
      // ignoradas — e ignorada sempre declara motivo. Ver contagem-importacao.ts.
      const cont = new ContagemImportacao();
      trilha.contagem = cont;
      // ORIGEM-FICA-NO-DADO: o CNPJ que o relatório declara no cabeçalho nem
      // sempre é o da Fetely. Fica registrado em `ignoradas_detalhe.cnpj_relatorio`
      // para conferência posterior — nunca bloqueia, nunca alerta.
      let cnpjRelatorio: string | null = null;
      let periodoInicio: string | null = null;

      let periodoFim: string | null = null;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      let respRetorno: any = null;

      if (fonte === "ofx") {
        const text = await file.text();
        const parsed = parseOFX(text, { manterLinhasSaldo: true });
        cont.ler(parsed.movimentacoes.length);
        if (cont.lidas === 0) throw new Error("Nenhuma movimentação no OFX");

        // LEDGERBAL do arquivo → saldo do dia
        if (parsed.saldo != null && parsed.saldoData) {
          const { error: errLb } = await sb.rpc("fn_saldo_diario_registrar", {
            p_conta: conta,
            p_data: parsed.saldoData,
            p_saldo: parsed.saldo,
            p_origem: "ledgerbal",
            p_importacao: impId,
            p_observacao: "LEDGERBAL do arquivo",
          });
          if (errLb) throw errLb;
        }

        // A dimensão extrato_fontes decide o que é linha de saldo — não o código
        const descricoesUnicas = Array.from(
          new Set(parsed.movimentacoes.map((m) => m.descricao))
        );
        const classificacao = new Map<
          string,
          { fonte_codigo: string; papel: string; destino: string } | null
        >();
        for (const desc of descricoesUnicas) {
          const { data: cls, error: errCls } = await sb.rpc("fn_extrato_classificar", {
            p_conta: conta,
            p_descricao: desc,
          });
          if (errCls) throw errCls;
          classificacao.set(desc, Array.isArray(cls) ? cls[0] ?? null : cls ?? null);
        }

        const transacoes: typeof parsed.movimentacoes = [];
        for (const m of parsed.movimentacoes) {
          const cls = classificacao.get(m.descricao);
          if (cls && cls.papel === "informativa") {
            if (cls.destino === "saldo_diario_conta" && m.data_transacao) {
              const { error: errSaldo } = await sb.rpc("fn_saldo_diario_registrar", {
                p_conta: conta,
                p_data: m.data_transacao,
                p_saldo: m.valor,
                p_origem: "linha_saldo_ofx",
                p_importacao: impId,
                p_observacao: cls.fonte_codigo,
              });
              if (errSaldo) throw errSaldo;
            }
            cont.ignorar("linha_de_saldo");
            continue; // informativa nunca vira movimentação
          }
          transacoes.push(m);
        }

        // Linha sem data não pode virar movimentação — e não pode sumir calada.
        const movs = transacoes.filter((m) => m.data_transacao);
        cont.ignorar("sem_data", transacoes.length - movs.length);
        const datas = movs.map((m) => m.data_transacao!).sort();
        periodoInicio = datas[0] || null;
        periodoFim = datas[datas.length - 1] || null;

        // Identidade OFX: EndToEnd manda; sem ele, conteúdo. O sequencial do
        // dia (08313 → 08312) nunca entra no hash. Ver hash-mov.ts.
        const comHash = await Promise.all(
          movs.map(async (m) => ({
            ...m,
            identidade: await identidadeMovOfx({
              contaId: conta,
              data: m.data_transacao!,
              valor: m.valor,
              tipo: m.tipo,
              descricao: m.descricao,
              idTransacaoBanco: m.id_transacao_banco,
            }),
          }))
        );

        const hashes = Array.from(
          new Set(
            comHash.flatMap((m) =>
              [m.identidade.hash, m.identidade.hashLegado].filter(Boolean) as string[]
            )
          )
        );
        const { data: existentes, error: errExist } = await sb
          .from("movimentacoes_bancarias")
          .select("id, hash_unico, contraparte_documento, duplicada_de")
          .in("hash_unico", hashes);
        if (errExist) throw errExist;
        const mapExist = new Map<
          string,
          { id: string; contraparte_documento: string | null; duplicada_de: string | null }
        >();
        for (const e of existentes || []) mapExist.set(e.hash_unico, e);

        const novasRows: Record<string, unknown>[] = [];
        for (const m of comHash) {
          // Uma linha já resolvida como cópia (duplicada_de) não pode ressuscitar.
          const jaExiste =
            mapExist.get(m.identidade.hash) ||
            (m.identidade.hashLegado ? mapExist.get(m.identidade.hashLegado) : undefined);
          if (jaExiste) {
            cont.duplicada();
            // Enriquecer se antes estava null (não mexe em linha marcada como cópia)
            if (
              !jaExiste.duplicada_de &&
              !jaExiste.contraparte_documento &&
              m.contraparte_documento
            ) {
              const { error: errUp } = await sb
                .from("movimentacoes_bancarias")
                .update({
                  contraparte_nome: m.contraparte_nome,
                  contraparte_documento: m.contraparte_documento,
                  tipo_meio: m.tipo_meio,
                })
                .eq("id", jaExiste.id);
              if (errUp) throw errUp;
              cont.enriquecidas++;
            }
            continue;
          }

          novasRows.push({
            conta_bancaria_id: conta,
            data_transacao: m.data_transacao,
            descricao: m.descricao,
            valor: m.valor,
            tipo: m.tipo,
            id_transacao_banco: m.id_transacao_banco,
            hash_unico: m.identidade.hash,

            origem: "ofx",
            contraparte_nome: m.contraparte_nome,
            contraparte_documento: m.contraparte_documento,
            tipo_meio: m.tipo_meio,
            fonte_importacao_id: impId,
          });
        }

        // REIMPORTAR-É-INOFENSIVO: conflito conta como duplicada, não derruba.
        await inserirMovimentacoes(sb, novasRows, cont);
      } else if (fonte === "safra_lancamentos") {
        const buf = await file.arrayBuffer();
        const parsed = parseXlsxSafraLancamentos(buf);
        cont.ler(parsed.movimentacoes.length);
        if (cont.lidas === 0) throw new Error("Nenhuma linha válida na planilha");

        const datas = parsed.movimentacoes
          .map((m) => m.data_transacao!)
          .filter(Boolean)
          .sort();
        periodoInicio = datas[0] || null;
        periodoFim = datas[datas.length - 1] || null;

        for (const m of parsed.movimentacoes) {
          if (!m.data_transacao) {
            cont.ignorar("sem_data");
            continue;
          }
          const valorAssinado = m.tipo === "credito" ? m.valor : -m.valor;
          const hashPrincipal = await gerarHashMov(
            conta,
            m.data_transacao!,
            valorAssinado,
            m.descricao,
            m.id_transacao_banco || undefined
          );

          // Buscar por hash principal (E2E se houver)
          const { data: exist } = await sb
            .from("movimentacoes_bancarias")
            .select("id, hash_unico, contraparte_documento, id_transacao_banco")
            .eq("hash_unico", hashPrincipal)
            .maybeSingle();

          if (exist) {
            cont.duplicada();
            const patch: Record<string, unknown> = {};
            if (!exist.contraparte_documento && m.contraparte_documento) {
              patch.contraparte_nome = m.contraparte_nome;
              patch.contraparte_documento = m.contraparte_documento;
            }
            if (m.id_transacao_banco && !exist.id_transacao_banco) {
              patch.id_transacao_banco = m.id_transacao_banco;
            }
            patch.tipo_meio = "pix";
            if (m.referencia_pedido) patch.referencia_pedido = m.referencia_pedido;
            if (m.data_hora) patch.data_hora = m.data_hora;
            if (Object.keys(patch).length > 0) {
              const { error: errUp } = await sb
                .from("movimentacoes_bancarias")
                .update(patch)
                .eq("id", exist.id);
              if (errUp) throw errUp;
              cont.enriquecidas++;
            }
            continue;
          }

          // Tentar casar com OFX prévio: mesma conta, mesma data, mesmo valor, sem contraparte
          const { data: candidatos } = await sb
            .from("movimentacoes_bancarias")
            .select("id, contraparte_documento")
            .eq("conta_bancaria_id", conta)
            .eq("data_transacao", m.data_transacao)
            .eq("valor", valorAssinado)
            .is("contraparte_documento", null)
            .limit(1);

          if (candidatos && candidatos.length > 0) {
            const alvo = candidatos[0];
            const { error: errUp } = await sb
              .from("movimentacoes_bancarias")
              .update({
                contraparte_nome: m.contraparte_nome,
                contraparte_documento: m.contraparte_documento,
                tipo_meio: "pix",
                referencia_pedido: m.referencia_pedido,
                data_hora: m.data_hora,
                id_transacao_banco: m.id_transacao_banco,
              })
              .eq("id", alvo.id);
            if (errUp) throw errUp;
            // A linha já existia no extrato (veio pelo OFX): é duplicada enriquecida.
            cont.enriquecer();
            continue;
          }

          // Inserir nova
          await inserirMovimentacao(
            sb,
            {
              conta_bancaria_id: conta,
              data_transacao: m.data_transacao,
              data_hora: m.data_hora,
              descricao: m.descricao,
              valor: valorAssinado,
              tipo: m.tipo,
              id_transacao_banco: m.id_transacao_banco,
              hash_unico: hashPrincipal,
              origem: "safra_lancamentos",
              contraparte_nome: m.contraparte_nome,
              contraparte_documento: m.contraparte_documento,
              tipo_meio: "pix",
              referencia_pedido: m.referencia_pedido,
              fonte_importacao_id: impId,
            },
            cont
          );
        }
      } else if (fonte === "safra_pix_lancamentos") {
        // ENRIQUECIMENTO PURO. Os EndToEnd deste arquivo já entraram pelo OFX —
        // inserir aqui é o `duplicate key` que quebrava a importação. O que ele
        // acrescenta é pedido, nome e CPF/CNPJ do pagador, e nada mais.
        const buf = await file.arrayBuffer();
        const parsed = parseXlsxSafraPixLancamentos(buf);
        cont.ler(parsed.linhas.length);
        if (cont.lidas === 0) throw new Error("Nenhuma linha de PIX na planilha");

        const datasPix = parsed.linhas.map((l) => l.data_transacao).filter(Boolean).sort() as string[];
        periodoInicio = datasPix[0] || null;
        periodoFim = datasPix[datasPix.length - 1] || null;
        cnpjRelatorio = parsed.cnpj_relatorio;

        for (const l of parsed.linhas) {
          if (!l.id_transacao_banco) {
            cont.ignorar("sem_identificador");
            continue;
          }
          const { data: alvo, error: errBusca } = await sb
            .from("movimentacoes_bancarias")
            .select("id, referencia_pedido, contraparte_nome, contraparte_documento, data_hora")
            .eq("id_transacao_banco", l.id_transacao_banco)
            .limit(1)
            .maybeSingle();
          if (errBusca) throw errBusca;
          if (!alvo) {
            // Sem par no extrato: NÃO insere. O dinheiro entra pelo OFX.
            cont.ignorar("sem_par_no_extrato");
            continue;
          }

          // Nunca sobrescrever campo já preenchido.
          const patch: Record<string, unknown> = {};
          if (!alvo.referencia_pedido && l.referencia_pedido)
            patch.referencia_pedido = l.referencia_pedido;
          if (!alvo.contraparte_nome && l.contraparte_nome)
            patch.contraparte_nome = l.contraparte_nome;
          if (!alvo.contraparte_documento && l.contraparte_documento)
            patch.contraparte_documento = l.contraparte_documento;
          if (!alvo.data_hora && l.data_hora) patch.data_hora = l.data_hora;

          if (Object.keys(patch).length > 0) {
            const { error: errUp } = await sb
              .from("movimentacoes_bancarias")
              .update(patch)
              .eq("id", alvo.id);
            if (errUp) throw errUp;
          }
          // A linha do arquivo é, por definição, duplicada de algo que já existe.
          cont.enriquecer();
        }
      } else if (fonte === "safrapay_recebiveis") {
        // COMPOSICAO-DO-LOTE: este parser NÃO toca o extrato. Ele grava a
        // composição do repasse (NSU, parcela, taxa) em `safrapay_liquidacao`,
        // que é a chave que liga o lote "RESUMO VENDAS CARTAO" a título.
        const buf = await file.arrayBuffer();
        const parsed = parseXlsxSafraPayRecebiveis(buf);
        cont.ler(parsed.linhas.length);
        if (cont.lidas === 0) throw new Error("Nenhuma linha de recebível na planilha");
        cnpjRelatorio = parsed.cnpj_relatorio;

        const datasPag = parsed.linhas
          .map((l) => l.data_pagamento)
          .filter(Boolean)
          .sort() as string[];
        periodoInicio = datasPag[0] || null;
        periodoFim = datasPag[datasPag.length - 1] || null;

        // Lote do OFX por dia: só vincula quando o dia tem UM lote. Vários lotes
        // no mesmo dia é casamento por subconjunto — decisão humana, não do parser.
        const loteDoDia = await resolverLotesDoDia(sb, conta, datasPag);

        for (const l of parsed.linhas) {
          const r = await gravarLiquidacaoSafraPay(sb, l, {
            conta,
            impId,
            origem: "safrapay_recebiveis",
            loteDoDia,
          });
          if (r === "nova") cont.nova();
          else if (r === "duplicada") cont.duplicada();
          else cont.ignorar(r);
        }

      } else if (fonte === "mp_withdraw") {


        const buf = await file.arrayBuffer();
        const parsed = parseXlsxMpWithdraw(buf);
        cont.ler(parsed.movimentacoes.length);
        if (cont.lidas === 0) throw new Error("Nenhum saque válido na planilha");

        const datas = parsed.movimentacoes
          .map((m) => m.data_transacao!)
          .filter(Boolean)
          .sort();
        periodoInicio = datas[0] || null;
        periodoFim = datas[datas.length - 1] || null;

        for (const m of parsed.movimentacoes) {
          if (!m.data_transacao) {
            cont.ignorar("sem_data");
            continue;
          }
          const valorAssinado = -m.valor; // saque = débito
          const { data: exist } = await sb
            .from("movimentacoes_bancarias")
            .select("id, contraparte_documento, id_transacao_banco")
            .eq("hash_unico", m.hash_unico)
            .maybeSingle();

          if (exist) {
            cont.duplicada();
            const patch: Record<string, unknown> = {};
            if (!exist.contraparte_documento) {
              patch.contraparte_nome = m.contraparte_nome;
              patch.contraparte_documento = m.contraparte_documento;
              patch.tipo_meio = m.tipo_meio;
            }
            if (!exist.id_transacao_banco) patch.id_transacao_banco = m.id_transacao_banco;
            if (Object.keys(patch).length > 0) {
              const { error: errUp } = await sb
                .from("movimentacoes_bancarias")
                .update(patch)
                .eq("id", exist.id);
              if (errUp) throw errUp;
              cont.enriquecidas++;
            }
            continue;
          }

          await inserirMovimentacao(
            sb,
            {
              conta_bancaria_id: conta,
              data_transacao: m.data_transacao,
              descricao: m.descricao,
              valor: valorAssinado,
              tipo: "debito",
              id_transacao_banco: m.id_transacao_banco,
              hash_unico: m.hash_unico,
              origem: "mp_withdraw",
              contraparte_nome: m.contraparte_nome,
              contraparte_documento: m.contraparte_documento,
              tipo_meio: m.tipo_meio,
              fonte_importacao_id: impId,
            },
            cont
          );
        }
      } else if (fonte === "safrapay_vendas") {
        // Tipo 1 — valor integral da venda e NSU na data da autorização.
        // Não é dinheiro na conta: alimenta a prova de pagamento de cartão.
        const parsed = parseCsvSafraPayTipo1(textoCsv || (await file.text()));
        cont.ler(parsed.vendas.length);
        if (cont.lidas === 0) throw new Error("Nenhuma venda no arquivo SafraPay Tipo 1");

        const datasV = parsed.vendas.map((v) => v.data_venda).filter(Boolean).sort();
        periodoInicio = datasV[0] || null;
        periodoFim = datasV[datasV.length - 1] || null;

        // mdr é coluna gerada no banco (valor_bruto - valor_liquido); nunca enviar do front.
        const aproveitaveis = parsed.vendas.filter((v) => v.nsu && v.data_venda);
        for (const v of parsed.vendas) {
          if (!v.nsu) cont.ignorar("sem_identificador");
          else if (!v.data_venda) cont.ignorar("sem_data");
        }
        const linhas = aproveitaveis.map((v) => ({
          nsu: v.nsu,
          ec: parsed.ec || null,
          anomes: parsed.anomes || null,
          terminal: v.terminal || null,
          data_venda: v.data_venda,
          hora: v.hora || null,
          produto: v.produto || null,
          modalidade: v.modalidade || null,
          parcelas: v.parcelas,
          autorizacao: v.autorizacao || null,
          valor_bruto: v.valor_bruto,
          valor_liquido: v.valor_liquido,
          arquivo_origem: file.name,
          importado_em: new Date().toISOString(),
        }));

        const { data, error } = await sb
          .from("safrapay_venda")
          .upsert(linhas, { onConflict: "nsu", ignoreDuplicates: true })
          .select("nsu");
        if (error) throw error;

        cont.nova(data?.length ?? 0);
        cont.duplicada(linhas.length - (data?.length ?? 0));

      } else if (fonte === "safrapay_ajustes") {
        // Tipo 3 — ajuste de adquirência sempre acompanha um crédito que já está
        // no OFX: só enriquece, nunca cria linha nova.
        const parsed = parseCsvSafraPayTipo3(textoCsv || (await file.text()));
        cont.ler(parsed.ajustes.length);
        if (cont.lidas === 0) throw new Error("Nenhum ajuste no arquivo SafraPay Tipo 3");

        const datasA = parsed.ajustes.map((a) => a.dt_ajuste).filter(Boolean).sort();
        periodoInicio = datasA[0] || null;
        periodoFim = datasA[datasA.length - 1] || null;

        for (const a of parsed.ajustes) {
          if (!a.dt_ajuste) {
            cont.ignorar("sem_data");
            continue;
          }
          if (a.valor === 0) {
            cont.ignorar("sem_valor");
            continue;
          }
          const { data: alvoId, error: errEnr } = await sb.rpc("fn_extrato_enriquecer", {
            p_conta: conta,
            p_data: a.dt_ajuste,
            p_valor: a.natureza === "D" ? -Math.abs(a.valor) : Math.abs(a.valor),
            p_contraparte_nome: `SAFRAPAY AJUSTE ${a.descricao}`.trim(),
            p_contraparte_documento: null,
            p_referencia_pedido: null,
            p_tipo_meio: "cartao",
            p_classe: null,
          });
          if (errEnr) throw errEnr;
          if (alvoId) cont.enriquecer();
          else cont.ignorar("sem_par_no_extrato");
        }
      } else if (fonte === "safrapay_liquidacao") {
        const text = textoCsv || (await file.text());
        const parsed = parseCsvSafraPayTipo2(text);

        cont.ler(parsed.parcelas.length);
        if (cont.lidas === 0) throw new Error("Nenhuma parcela liquidada no arquivo SafraPay Tipo 2");

        const datas = parsed.parcelas.map(p => p.dt_efetiva).filter(Boolean).sort();
        periodoInicio = datas[0] || null;
        periodoFim = datas[datas.length - 1] || null;

        // COMPOSICAO-DO-LOTE: mesma gravação do XLSX "Recebíveis de Vendas".
        const loteDoDia = await resolverLotesDoDia(sb, conta, datas);
        // Contagem sombra: o efeito no extrato é secundário e não entra no
        // veredito deste parser, mas o helper de inserção exige um contador.
        const contExtrato = new ContagemImportacao();

        for (const p of parsed.parcelas) {
          if (!p.dt_efetiva) {
            cont.ignorar("sem_data");
            continue;
          }
          if (!p.nsu) {
            cont.ignorar("sem_identificador");
            continue;
          }

          // CONTA-SEGUE-O-EFEITO-PRINCIPAL: o que este parser faz é gravar a
          // composição do lote. Então a linha é NOVA quando entrou composição
          // inédita e DUPLICADA quando já existia. O enriquecimento do extrato
          // é efeito secundário e não manda na contagem.
          const rLiq = await gravarLiquidacaoSafraPay(
            sb,
            {
              nsu: p.nsu,
              parcela: p.parcela_num,
              total_parcelas: p.ncar,
              data_pagamento: p.dt_efetiva,
              data_prevista: p.dt_prevista || null,
              data_venda: p.dt_venda || null,
              valor_bruto_parcela: p.valor_bruto_parcela,
              valor_liquido: p.valor_recebido,
              bandeira: p.produto || null,
              modalidade: p.modalidade || null,
              ec: parsed.ec || null,
              anomes: parsed.anomes || null,
            },
            { conta, impId, origem: "safrapay_tipo2", loteDoDia }
          );
          if (rLiq === "nova") cont.nova();
          else if (rLiq === "duplicada") cont.duplicada();
          else {
            cont.ignorar(rLiq);
            continue;
          }

          const hashKey = `safrapay2|${p.nsu}|${p.dt_efetiva}|${p.parcela_num}`;
          const hash = await gerarHashMov(conta, p.dt_efetiva, p.valor_recebido, hashKey);

          const { data: exist } = await sb
            .from("movimentacoes_bancarias")
            .select("id")
            .eq("hash_unico", hash)
            .maybeSingle();
          if (exist) continue;

          // Antes de inserir: tentar enriquecer a linha do extrato que já
          // representa esse dinheiro. Sem isso, o mesmo valor é contado duas vezes.
          const { data: alvoId, error: errEnr } = await sb.rpc("fn_extrato_enriquecer", {
            p_conta: conta,
            p_data: p.dt_efetiva,
            p_valor: p.valor_recebido,
            p_contraparte_nome: `SAFRAPAY ${p.produto} ${p.modalidade}`.trim(),
            p_contraparte_documento: null,
            p_referencia_pedido: null,
            p_tipo_meio: "cartao",
            p_classe: null,
          });
          if (errEnr) throw errEnr;
          if (alvoId) continue;

          await inserirMovimentacao(
            sb,
            {
              conta_bancaria_id: conta,
              data_transacao: p.dt_efetiva,
              descricao: `SAFRAPAY ${p.produto} ${p.modalidade} PARC ${p.parcela_num}/${p.ncar} NSU ${p.nsu}`,
              valor: p.valor_recebido,
              tipo: "credito",
              id_transacao_banco: p.nsu,
              hash_unico: hash,
              origem: "safrapay_liquidacao",
              tipo_meio: "cartao",
              fonte_importacao_id: impId,
            },
            contExtrato
          );
        }
      } else if (fonte === "safrapay_link") {
        // A fonte mais forte de amarre: a coluna Identificacao traz o numero do
        // pedido. Grava tudo (pago, expirado, cancelado, pendente) porque o
        // historico de tentativas tambem e prova, e liga pedido_id pelo codigo.
        const parsed = parseCsvSafraPayLink(textoCsv);
        cont.ler(parsed.linhas.length + parsed.malformadas);
        if (parsed.malformadas > 0) {
          for (let i = 0; i < parsed.malformadas; i++) cont.ignorar("nao_parseavel");
        }
        if (parsed.linhas.length === 0)
          throw new Error("Nenhuma linha valida no relatorio de Link de Pagamento");

        for (const l of parsed.linhas) {
          if (!l.id_cobranca) {
            cont.ignorar("sem_identificador");
            continue;
          }
          const { error: errUp } = await sb
            .from("safrapay_link_pagamento")
            .upsert(
              {
                id_cobranca: l.id_cobranca,
                id_link: l.id_link,
                identificacao: l.identificacao,
                pedido_codigo: l.pedido_codigo,
                descricao: l.descricao,
                tipo_cobranca: l.tipo_cobranca,
                status_link: l.status_link,
                status_cobranca: l.status_cobranca,
                valor: l.valor,
                data_criacao: l.data_criacao,
                data_expiracao: l.data_expiracao,
                data_pagamento: l.data_pagamento,
                nsu_transacao: l.nsu_transacao,
                portador_nome: l.portador_nome,
                portador_documento: l.portador_documento,
                cartao_mascarado: l.cartao_mascarado,
                cnpj_loja: l.cnpj_loja,
                codigo_loja: l.codigo_loja,
                mensagem_retorno: l.mensagem_retorno,
                fonte_importacao_id: impId,
                updated_at: new Date().toISOString(),
              },
              { onConflict: "id_cobranca" },
            );
          // FAIL-LOUD: erro de gravacao nao entra em silencio.
          if (errUp) throw errUp;
          cont.nova();
        }

        // Liga ao pedido pelo codigo. Sem isso o amarre existe no arquivo e nao no banco.
        const { error: errLig } = await sb.rpc("fn_safrapay_link_ligar_pedidos");
        if (errLig) throw errLig;

        toast.info(
          `${parsed.pagas} pagamento(s) confirmado(s) no relatorio de Link. A coluna Identificacao amarra o pagamento ao pedido — e a prova mais forte para carimbar NSU em titulo de cartao.`,
        );
      } else if (fonte === "mp_settlement") {
        const buf = await file.arrayBuffer();
        const parsed = parseXlsxMpSettlement(buf);
        cont.ler(parsed.transacoes.length);
        if (cont.lidas === 0) throw new Error("Nenhuma transação no Settlement MP");

        const datas = parsed.transacoes.map(t => t.data_liberacao).filter(Boolean).sort();
        periodoInicio = datas[0] || null;
        periodoFim = datas[datas.length - 1] || null;

        // Settlement é ENRIQUECIMENTO, não extrato: não cria movimentação.
        for (const t of parsed.transacoes) {
          if (!t.id_transacao_mp) {
            cont.ignorar("sem_identificador");
            continue;
          }

          const tipoMeio = t.tipo_meio_pagamento.toLowerCase().includes("bancaria") ? "pix" : "cartao";

          // Enriquecer o crédito que já entrou pelo extrato, se existir
          const { data: alvoId, error: errEnr } = await sb.rpc("fn_extrato_enriquecer", {
            p_conta: conta,
            p_data: t.data_liberacao || t.data_aprovacao,
            p_valor: t.valor_liquido,
            p_contraparte_nome: `MP ${t.meio_pagamento.toUpperCase()}`.trim(),
            p_contraparte_documento: null,
            p_referencia_pedido: t.codigo_referencia || null,
            p_tipo_meio: tipoMeio,
            p_classe: null,
          });
          if (errEnr) throw errEnr;
          if (alvoId) cont.enriquecer();
          else cont.ignorar("sem_par_no_extrato");
        }

      } else if (fonte === "mp_release") {
        const buf = await file.arrayBuffer();
        const parsed = parseXlsxMpReserveRelease(buf);
        cont.ler(parsed.liberacoes.length);
        if (cont.lidas === 0) throw new Error("Nenhuma liberação no Reserve-Release MP");

        const datas = parsed.liberacoes.map(l => l.data_liberacao).filter(Boolean).sort();
        periodoInicio = datas[0] || null;
        periodoFim = datas[datas.length - 1] || null;

        // CNPJ próprio vem da dimensão (unidade ativa) — sem hardcode.
        const { data: unidade, error: errUnid } = await sb
          .from("unidades")
          .select("cnpj")
          .eq("ativa", true)
          .not("cnpj", "is", null)
          .limit(1)
          .maybeSingle();
        if (errUnid) throw errUnid;
        const cnpjProprio = (unidade?.cnpj ?? "").replace(/\D/g, "") || null;

        for (const l of parsed.liberacoes) {
          if (!l.id_operacao) {
            cont.ignorar("sem_identificador");
            continue;
          }
          const hash = await gerarHashMov(conta, l.data_liberacao, l.valor_liquido, `mp_rr|${l.id_operacao}`);

          const { data: exist } = await sb
            .from("movimentacoes_bancarias")
            .select("id")
            .eq("hash_unico", hash)
            .maybeSingle();
          if (exist) { cont.duplicada(); continue; }

          const desc = l.descricao_mp
            .normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
          const ehSaque = desc.startsWith("saque");
          const ehDevolucao = desc.startsWith("devolucao");
          const meio = l.meio_pagamento.toUpperCase();

          let descricao: string;
          let tipoMeio: string;
          if (ehSaque) {
            descricao = `MP SAQUE PARA CONTA ${l.conta_destino}`.trim();
            tipoMeio = "transferencia";
          } else if (ehDevolucao) {
            descricao = `MP DEVOLUCAO ${meio}`.trim();
            tipoMeio = "outro";
          } else {
            const meioNorm = l.meio_pagamento
              .normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
            descricao = `MP PAGAMENTO ${meio}`.trim();
            tipoMeio = meioNorm.includes("saldo disponivel")
              ? "outro"
              : (meioNorm.includes("pix") || meioNorm.includes("transferencia bancaria"))
                ? "pix"
                : "cartao";
          }
          const ehPagamento = !ehSaque && !ehDevolucao;

          await inserirMovimentacao(
            sb,
            {
              conta_bancaria_id: conta,
              data_transacao: l.data_liberacao,
              descricao,
              valor: l.valor_liquido,
              tipo: l.valor_liquido < 0 ? "debito" : "credito",
              id_transacao_banco: l.id_operacao,
              hash_unico: hash,
              origem: "mp_release",
              tipo_meio: tipoMeio,
              referencia_pedido: l.codigo_referencia || null,
              classe: ehPagamento ? "recebivel_b2c" : null,
              classe_definida_por: ehPagamento ? "regra_p1" : null,
              contraparte_nome: ehSaque ? "FETELY COMERCIO IMPORTACAO E EXPORTACAO LTDA" : null,
              contraparte_documento: ehSaque ? cnpjProprio : null,
              fonte_importacao_id: impId,
            },
            cont
          );
        }
      } else if (fonte === "safra_instrucoes_2via") {
        // Papel: CONFERÊNCIA. Não escreve no extrato, não dá baixa em título.
        const buf = await file.arrayBuffer();
        const parsed = parseXlsxSafraInstrucoes2Via(buf);
        cont.ler(parsed.linhas.length);
        if (cont.lidas === 0) throw new Error("Nenhum boleto na carteira do relatório");

        if (parsed.data_referencia_inferida) {
          toast.warning(
            `${file.name}: data de geração não encontrada na linha 1 — usando hoje (${formatDateBR(parsed.data_referencia)}) como data de referência.`
          );
        }

        // `rows.length === parsed.linhas.length` POR CONSTRUÇÃO: é `.map` puro,
        // sem filtro nenhum entre o que o parser leu e o que vai ao banco.
        // Se algum dia entrar filtro aqui, cada linha descartada tem que
        // declarar `cont.ignorar(motivo)` ou a conta deixa de fechar.
        const rows = parsed.linhas.map((l) => ({
          conta_bancaria_id: conta,
          data_referencia: parsed.data_referencia,
          nosso_numero: l.nosso_numero,
          numero_documento_truncado: l.numero_documento_truncado,
          pagador: l.pagador,
          data_vencimento: l.data_vencimento,
          data_pagamento: l.data_pagamento,
          valor_boleto: l.valor_boleto,
          valor_recebido: l.valor_recebido,
          diferenca: l.diferenca,
          situacao: l.situacao,
          forma_envio: l.forma_envio,
          fonte_importacao_id: impId,
        }));

        for (let i = 0; i < rows.length; i += 200) {
          const lote = rows.slice(i, i + 200);
          const { error } = await sb
            .from("safra_carteira_conferencia")
            .upsert(lote, {
              onConflict: "conta_bancaria_id,data_referencia,nosso_numero",
            });
          if (error) throw error;
        }
        cont.nova(rows.length);
        periodoInicio = parsed.data_referencia;
        periodoFim = parsed.data_referencia;
        setConferencia({ contaId: conta, dataReferencia: parsed.data_referencia });
        qc.invalidateQueries({ queryKey: ["safra-carteira-conf"] });
        qc.invalidateQueries({ queryKey: ["safra-carteira-divergencia"] });
      } else if (fonte === "safra_francesinha") {
        // Snapshot diário: só enriquece o extrato. O dinheiro do boleto chega
        // pelo OFX — inserir aqui duplicaria.
        const buf = await file.arrayBuffer();
        const parsed = parseXlsxSafraFrancesinha(buf);
        cont.ler(parsed.linhas.length);
        if (cont.lidas === 0) throw new Error("Nenhuma linha detalhada na Francesinha");

        periodoInicio = parsed.data_referencia;
        periodoFim = parsed.data_referencia;

        // Idempotência: mesmo snapshot já processado não conta enriquecimento de novo
        const { data: jaImportado, error: errJa } = await sb
          .from("extrato_importacoes")
          .select("id")
          .eq("conta_bancaria_id", conta)
          .eq("fonte_tipo", FONTE_TIPO_DB.safra_francesinha)
          .eq("periodo_fim", parsed.data_referencia)
          .eq("status", "concluida")
          .neq("id", impId)
          .limit(1);
        if (errJa) throw errJa;

        if (jaImportado && jaImportado.length > 0) {
          // Snapshot repetido é sucesso idempotente, não falha: a conta fecha
          // com tudo em `duplicadas` e o veredito sai em tom neutro.
          cont.duplicada(cont.lidas);
          trilha.neutro = {
            resultado: `Snapshot de ${formatDateBR(parsed.data_referencia)} já importado — nada refeito`,
            contagem: cont.resumo(),
          };
          toast.info(
            `${file.name}: snapshot de ${formatDateBR(parsed.data_referencia)} já importado — nada refeito.`
          );
        } else {
          for (const l of parsed.linhas) {
            if (l.valor_pago <= 0) {
              // Boleto em aberto: a Francesinha traz a carteira inteira, e
              // linha sem pagamento nao tem par no extrato por definicao.
              cont.ignorar("boleto_em_aberto");
              continue;
            }
            const dataPag = l.data_pagamento || parsed.data_referencia;
            const { data: alvoId, error: errEnr } = await sb.rpc("fn_extrato_enriquecer", {
              p_conta: conta,
              p_data: dataPag,
              p_valor: l.valor_pago,
              p_contraparte_nome: l.pagador,
              p_contraparte_documento: null,
              p_referencia_pedido: null,
              p_tipo_meio: "boleto",
              p_classe: "recebivel_titulo",
            });
            if (errEnr) throw errEnr;
            if (alvoId) cont.enriquecer();
            else cont.ignorar("sem_par_no_extrato");
          }
        }
      } else if (fonte === "retorno_safra") {
        // RETORNO-É-RESPOSTA-DO-BANCO, NÃO SUGESTÃO. A tela é só a porta de
        // entrada: o motor é a edge processar-retorno-safra, que registra E
        // aplica (liquidação, baixa, rejeição, prorrogação, movimentação).
        // A chave é o nosso número, 1:1, sem ambiguidade — não há o que
        // sugerir. A decisão humana mora um selo adiante, na conciliação
        // contra o extrato.
        const { data: resp, error: errEdge } = await supabase.functions.invoke(
          "processar-retorno-safra",
          { body: { arquivo_conteudo: textoCsv, arquivo_nome: file.name } }
        );
        if (errEdge) {
          let detalhe = errEdge.message;
          const ctx = (errEdge as { context?: Response }).context;
          if (ctx && typeof ctx.json === "function") {
            try {
              const corpo = await ctx.json();
              if (corpo?.erro) detalhe = corpo.erro;
            } catch { /* corpo não-JSON: fica a mensagem original */ }
          }
          throw new Error(detalhe);
        }
        if (resp?.ok === false) throw new Error(resp.erro ?? "Falha ao processar o retorno.");

        respRetorno = resp;
        if (resp?.ja_processado) {
          // DOIS-ZEROS-DIFERENTES (01/09/2026): zero por OMISSÃO — o parser leu
          // N linhas e contabilizou menos — continua sendo erro alto. Zero
          // porque NADA FOI LIDO — sequencial já processado, a edge nem abre o
          // arquivo — é sucesso idempotente (REIMPORTAR-É-INOFENSIVO), desde
          // que o motivo do zero fique declarado no registro.
          // O motivo vai direto em `ignoradas_detalhe` no update, sem passar
          // pelo contador: `linhas_ignoradas` fica 0 e a invariante
          // lidas = novas + duplicadas + ignoradas (0 = 0 + 0 + 0) segue de pé.
          cont.ler(0);
          const msgJa =
            `Retorno ${resp.nro_sequencial} já processado em ${resp.processado_em} — ` +
            `nada foi reaplicado.`;
          await sb
            .from("extrato_importacoes")
            .update({
              status: "concluida",
              linhas_lidas: 0,
              linhas_novas: 0,
              linhas_enriquecidas: 0,
              linhas_duplicadas: 0,
              linhas_ignoradas: 0,
              ignoradas_detalhe: { arquivo_ja_processado: 1 },
              erro_detalhe: null,
            })
            .eq("id", impId);
          trilha.neutro = {
            resultado: msgJa,
            contagem: "arquivo não lido — sequencial já processado",
            detalhe: { arquivo_ja_processado: 1 },
          };
          toast.info(`${file.name}: ${msgJa}`);
          await invalidarRecebivel();
          return;
        } else {
          cont.ler(resp?.ocorrencias_gravadas ?? 0);
          cont.nova(resp?.ocorrencias_gravadas ?? 0);
        }

        // Fonte única de verdade da invalidação do recebível.
        await invalidarRecebivel();
      }

      // CONTA-FECHADA-OU-ERRO: sem conta fechada não existe "concluida".
      // Prefira falhar visível a passar silencioso.
      if (!cont.fecha()) {
        const detalhe = cont.erroContaAberta();
        await sb
          .from("extrato_importacoes")
          .update({
            status: "erro",
            erro_detalhe: detalhe,
            linhas_lidas: cont.lidas,
            linhas_novas: cont.novas,
            linhas_enriquecidas: cont.enriquecidas,
            linhas_duplicadas: cont.duplicadas,
            linhas_ignoradas: cont.ignoradas,
            ignoradas_detalhe: cnpjRelatorio
              ? { ...cont.detalhe, cnpj_relatorio: cnpjRelatorio }
              : cont.detalhe,
            periodo_inicio: periodoInicio,
            periodo_fim: periodoFim,
          })
          .eq("id", impId);
        throw new Error(detalhe);
      }

      await sb
        .from("extrato_importacoes")
        .update({
          status: "concluida",
          linhas_lidas: cont.lidas,
          linhas_novas: cont.novas,
          linhas_enriquecidas: cont.enriquecidas,
          linhas_duplicadas: cont.duplicadas,
          linhas_ignoradas: cont.ignoradas,
          ignoradas_detalhe: cnpjRelatorio
            ? { ...cont.detalhe, cnpj_relatorio: cnpjRelatorio }
            : cont.detalhe,

          periodo_inicio: periodoInicio,
          periodo_fim: periodoFim,
        })
        .eq("id", impId);

      // O toast diz a conta E o efeito: contagem não responde "o que este
      // arquivo faz". O veredito detalhado por arquivo mora na lista da tela.
      if (fonte === "retorno_safra") {
        // `ja_processado` não chega aqui: fecha antes, em tom neutro.
        const msgRetorno =
          `${PARSER_ROTULO.retorno_safra} — ${file.name}: sequencial ${respRetorno?.nro_sequencial} · ` +
          `${respRetorno?.ocorrencias_gravadas} ocorrência(s) registradas · ` +
          `${respRetorno?.confirmados} confirmado(s) · ${respRetorno?.liquidados} liquidado(s) · ` +
          `${respRetorno?.rejeitados} rejeitado(s)`;
        const qtdErros = Array.isArray(respRetorno?.erros) ? respRetorno.erros.length : 0;
        if (qtdErros > 0) {
          toast.error(`${msgRetorno} · ${qtdErros} erro(s) na resolução de títulos`);
        } else {
          toast.success(msgRetorno, { description: PARSER_EFEITO.retorno_safra });
        }
      } else {
        toast.success(`${file.name}: ${cont.resumo()}`, {
          description: PARSER_EFEITO[fonte],
        });
      }
    } catch (e) {
      console.error("[ExtratoImportacao] falha ao processar", file.name, e);
      await sb
        .from("extrato_importacoes")
        .update({ status: "erro", erro_detalhe: rawMessage(e) })
        .eq("id", impId);
      throw e;
    }
  }

  async function handleImportar(bloco: Bloco) {
    const files = bloco === "extrato" ? arquivos : arquivosAux;
    const setFiles = bloco === "extrato" ? setArquivos : setArquivosAux;
    const setProc = bloco === "extrato" ? setProcessando : setProcessandoAux;
    const contaBloco = bloco === "extrato" ? conta : contaAux;

    if (!contaBloco) {
      toast.error("Selecione a conta bancária");
      return;
    }
    if (files.length === 0) {
      toast.error("Selecione ao menos um arquivo");
      return;
    }
    setProc(true);
    setResultados([]);
    try {
      for (const f of files) {
        const trilha: {
          fonte?: Fonte;
          contagem?: ContagemImportacao;
          neutro?: { resultado: string; contagem?: string; detalhe?: Record<string, number> };
        } = {};
        try {
          if (await ehRelatorioPagamentosItau(f)) {
            toast.error(
              "Este arquivo é o Relatório de Pagamentos Itaú — use o card 'Pagamentos Itaú' no bloco 2 desta mesma página."
            );
            setResultados((r) => [
              ...r,
              {
                arquivo: f.name,
                parser: "itau_pagamentos",
                resultado: "Use o card 'Pagamentos Itaú' no bloco 2",
                tom: "erro",
              },
            ]);
            continue;
          }
          await processarArquivo(f, contaBloco, bloco, trilha);
          setResultados((r) => [
            ...r,
            {
              arquivo: f.name,
              parser: trilha.fonte ? (PARSER_ROTULO[trilha.fonte] ?? trilha.fonte) : "—",
              efeito: trilha.fonte ? PARSER_EFEITO[trilha.fonte] : undefined,
              resultado: trilha.neutro?.resultado ?? "Importado",
              tom: trilha.neutro ? "neutro" : "ok",
              contagem: trilha.neutro?.contagem ?? trilha.contagem?.resumo(),
              ignoradas: trilha.neutro?.detalhe ?? trilha.contagem?.detalhe,
            },
          ]);
        } catch (e) {
          toast.error(`Falha em ${f.name}: ${formatError(e)}`);
          setResultados((r) => [
            ...r,
            {
              arquivo: f.name,
              parser: trilha.fonte ? (PARSER_ROTULO[trilha.fonte] ?? trilha.fonte) : "não reconhecido",
              efeito: trilha.fonte ? PARSER_EFEITO[trilha.fonte] : undefined,
              resultado: formatError(e),
              tom: "erro",
              contagem: trilha.contagem?.resumo(),
              ignoradas: trilha.contagem?.detalhe,
            },
          ]);
        }
      }
      setFiles([]);

      // Aplicar regras automáticas nas linhas novas
      try {
        const { data, error } = await sb.rpc("fn_regras_aplicar");
        if (error) throw error;
        const n = typeof data === "number" ? data : (data ?? 0);
        if (n > 0) toast.success(`Regras aplicadas: ${n} classificações automáticas`);
      } catch (e) {
        toast.error("Falha ao aplicar regras: " + formatError(e));
      }
      qc.invalidateQueries({ queryKey: ["movimentacoes-bancarias"] });
      qc.invalidateQueries({ queryKey: ["extrato-inbox"] });
      refetch();

    } finally {
      setProc(false);
    }
  }

  return (
    <PageShell>
      <PageHeader
        titulo="Importar Extratos"
        icone={Upload}
        estado="Porta única para arquivo de banco: extratos, relatórios auxiliares e faturas de cartão — com um só histórico."
      />

      {/* 1 — EXTRATOS */}
      <div className="space-y-2">
        <div>
          <h2 className="text-lg font-medium">1. Extratos</h2>
          <p className="text-xs text-muted-foreground">
            OFX (Itaú/Safra) e planilhas de lançamento. Linhas de saldo são identificadas pela
            dimensão de fontes e vão para o saldo diário, não para movimentações.
          </p>
        </div>
        <Card>
          <CardContent className="pt-6 space-y-4">
            <div>
              <Label>Conta bancária</Label>
              <Select value={conta} onValueChange={setConta}>
                <SelectTrigger><SelectValue placeholder="Selecione a conta" /></SelectTrigger>
                <SelectContent>
                  {contas.map((c) => (
                    <SelectItem key={c.id} value={c.id}>{c.nome_exibicao}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Arquivos de extrato (.ofx, .xlsx de lançamentos — múltiplos)</Label>
              <Input
                type="file"
                multiple
                accept=".ofx,.xlsx"
                onChange={(e) => setArquivos(Array.from(e.target.files || []))}
              />
              {arquivos.length > 0 && (
                <ul className="mt-2 text-xs text-muted-foreground space-y-1">
                  {arquivos.map((f) => (
                    <li key={f.name} className="flex items-center gap-2">
                      <FileText className="h-3 w-3" />
                      {f.name}
                      <span className="text-[10px] uppercase">
                        {detectarFonteBase(f) || "?"}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
            <Button
              onClick={() => handleImportar("extrato")}
              disabled={processando || !conta || arquivos.length === 0}
              className="bg-admin hover:bg-admin/90 text-admin-foreground gap-2"
            >
              {processando ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
              Importar {arquivos.length > 0 ? `(${arquivos.length})` : ""}
            </Button>

            <VereditoImportacao itens={resultados} />
          </CardContent>
        </Card>
      </div>

      {/* 2 — RELATÓRIOS AUXILIARES */}
      <div className="space-y-2">
        <div>
          <h2 className="text-lg font-medium">2. Relatórios auxiliares</h2>
          <p className="text-xs text-muted-foreground">
            Pagamentos Itaú, SafraPay, Mercado Pago, Safra PIX e as duas fontes de cobrança do Safra.
            Estes arquivos primeiro tentam enriquecer a linha que já existe no extrato — só criam
            movimentação nova quando não existe par.
          </p>
        </div>

        <Card>
          <CardContent className="pt-6 space-y-4">
            <div className="space-y-1 text-xs text-muted-foreground">
              <div className="text-sm font-medium text-foreground">Cobrança Safra</div>
              <div>
                <span className="font-medium text-foreground">Recebimentos - Instruções 2ª via</span>{" "}
                (.xlsx): papel de <span className="font-medium">conferência</span>. Alimenta apenas a
                carteira de conferência — não escreve em movimentações bancárias e não dá baixa em
                título nenhum.
              </div>
              <div>
                <span className="font-medium text-foreground">Gestão de Cobrança - Francesinha</span>{" "}
                (.xlsx): snapshot diário com juros, descontos, comissões, DDA e ocorrência CNAB. Só
                enriquece a linha do extrato — nunca insere linha nova, porque o dinheiro do boleto
                chega pelo OFX.
              </div>
              <div>
                <span className="font-medium text-foreground">Retorno CNAB 400</span> (.txt): a
                resposta do banco à remessa — registros, rejeições e liquidações. Só registra o que
                o banco disse; não dá baixa em título e não cria movimentação bancária.
              </div>
            </div>

            <div>
              <Label>Conta bancária (relatórios auxiliares)</Label>
              <Select value={contaAux} onValueChange={setContaAux}>
                <SelectTrigger><SelectValue placeholder="Selecione a conta" /></SelectTrigger>
                <SelectContent>
                  {contas.map((c) => (
                    <SelectItem key={c.id} value={c.id}>{c.nome_exibicao}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>


            <div>
              <Label>
                Arquivos auxiliares (.xlsx, .csv — Francesinha, Instruções 2ª via, SafraPay,
                Mercado Pago, Retorno CNAB 400 .txt)
              </Label>
              <Input
                type="file"
                multiple
                accept=".xlsx,.csv,.txt,.ret"
                onChange={(e) => setArquivosAux(Array.from(e.target.files || []))}
              />
              {arquivosAux.length > 0 && (
                <ul className="mt-2 text-xs text-muted-foreground space-y-1">
                  {arquivosAux.map((f) => (
                    <li key={f.name} className="flex items-center gap-2">
                      <FileText className="h-3 w-3" />
                      {f.name}
                      <span className="text-[10px] uppercase">
                        {detectarFonteBase(f) || "?"}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
              <p className="mt-1 text-[11px] text-muted-foreground">
                A detecção é automática pelo conteúdo do arquivo. Se o arquivo pertencer ao bloco
                1, o sistema avisa e importa igual.
              </p>
            </div>

            <Button
              onClick={() => handleImportar("auxiliar")}
              disabled={processandoAux || !contaAux || arquivosAux.length === 0}
              className="bg-admin hover:bg-admin/90 text-admin-foreground gap-2"
            >
              {processandoAux ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
              Importar auxiliares {arquivosAux.length > 0 ? `(${arquivosAux.length})` : ""}
            </Button>

            {/* VEREDITO-EM-UM-LUGAR-SO (01/09/2026): a lista mora no card 1,
                que cobre os dois fluxos. Duplicar aqui mostrava tudo em dobro. */}
          </CardContent>
        </Card>


        {conferencia && (
          <BlocoErroBoundary titulo="O resumo da carteira Safra falhou">
            <ResumoSafraCarteira
              contaId={conferencia.contaId}
              dataReferencia={conferencia.dataReferencia}
            />
          </BlocoErroBoundary>
        )}


        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-sm font-medium">Pagamentos Itaú (Consulta de Pagamentos)</h3>
            <p className="text-xs text-muted-foreground">
              Enriquece débitos anônimos (PAG TIT) do extrato cruzando data + valor + conta.
            </p>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={enriquecerItau}
            disabled={reprocessandoItau}
            className="gap-2"
          >
            {reprocessandoItau ? <Loader2 className="h-4 w-4 animate-spin" /> : <Link2 className="h-4 w-4" />}
            Reprocessar vínculos
          </Button>
        </div>
        <ImportadorItauPagamentos
          contaBancariaId={conta || undefined}
          onSuccess={() => { enriquecerItau(); }}
        />
      </div>

      {/* 3 — FATURAS DE CARTÃO */}
      <div className="space-y-2">
        <div>
          <h2 className="text-lg font-medium">3. Faturas de cartão</h2>
          <p className="text-xs text-muted-foreground">
            Fatura de cartão é despesa de cartão, não movimento de conta corrente — por isso vai
            para outro destino (faturas de cartão e seus lançamentos), e não para o extrato.
          </p>
        </div>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between gap-4">
              <div className="flex items-center gap-3">
                <CreditCard className="h-6 w-6 text-admin" />
                <div>
                  <div className="font-medium">Faturas de Cartão</div>
                  <div className="text-xs text-muted-foreground">
                    Selecione cartão, fatura e período
                  </div>
                </div>
              </div>
              <Button onClick={() => setImportarFaturaOpen(true)} className="gap-2">
                <Upload className="h-4 w-4" />
                Importar Fatura
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>

      <ImportarFaturaCartaoDialog
        open={importarFaturaOpen}
        onOpenChange={setImportarFaturaOpen}
      />




      <div>
        <h2 className="text-lg font-medium mb-2">Histórico de importações</h2>
        <Card>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Data</TableHead>
                  <TableHead>Fonte</TableHead>
                  <TableHead>Arquivo</TableHead>
                  <TableHead>Período</TableHead>
                  <TableHead className="text-right">Lidas</TableHead>
                  <TableHead className="text-right">Novas</TableHead>
                  <TableHead className="text-right">Enriq.</TableHead>
                  <TableHead className="text-right">Dup.</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {historico.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={9} className="text-center text-muted-foreground py-6">
                      Nenhuma importação ainda
                    </TableCell>
                  </TableRow>
                )}
                {historico.map((h) => (
                  <TableRow key={h.id}>
                    <TableCell className="text-xs">{formatDateBR(h.created_at)}</TableCell>
                    <TableCell><Badge variant="outline">{h.fonte_tipo}</Badge></TableCell>
                    <TableCell className="max-w-[240px] truncate" title={h.nome_arquivo}>
                      {h.nome_arquivo}
                    </TableCell>
                    <TableCell className="text-xs">
                      {h.periodo_inicio ? formatDateBR(h.periodo_inicio) : "—"}
                      {" → "}
                      {h.periodo_fim ? formatDateBR(h.periodo_fim) : "—"}
                    </TableCell>
                    <TableCell className="text-right">{h.linhas_lidas ?? "—"}</TableCell>
                    <TableCell className="text-right">{h.linhas_novas ?? "—"}</TableCell>
                    <TableCell className="text-right">{h.linhas_enriquecidas ?? "—"}</TableCell>
                    <TableCell className="text-right">{h.linhas_duplicadas ?? "—"}</TableCell>
                    <TableCell>
                      <Badge
                        variant={
                          h.status === "concluida"
                            ? "default"
                            : h.status === "erro"
                            ? "destructive"
                            : "outline"
                        }
                        className={
                          h.status === "concluida"
                            ? "bg-success text-success-foreground"
                            : ""
                        }
                        title={h.erro_detalhe || undefined}
                      >
                        {h.status}
                      </Badge>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>
    </PageShell>
  );
}
