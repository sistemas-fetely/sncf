import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Loader2,
  Upload,
  FileSpreadsheet,
  CheckCircle2,
  AlertCircle,
} from "lucide-react";
import { toast } from "sonner";
import * as XLSX from "xlsx";

type ContaBancaria = { id: string; nome_exibicao: string };

type ResultadoProcessamento = {
  total_importadas: number;
};

async function gerarHashItau(fields: {
  cnpj_pagador: string;
  tipo_pagamento: string;
  numero_lote: string;
  cnpj_favorecido: string;
  valor_pago: number;
  data_pagamento: string;
  dados_pagamento: string;
}): Promise<string> {
  const base = [
    fields.cnpj_pagador ?? "",
    fields.tipo_pagamento ?? "",
    fields.numero_lote ?? "",
    fields.cnpj_favorecido ?? "",
    fields.valor_pago.toFixed(2),
    fields.data_pagamento ?? "",
    fields.dados_pagamento ?? "",
  ].join("|");
  const buf = new TextEncoder().encode(base);
  const hash = await crypto.subtle.digest("SHA-256", buf);
  return Array.from(new Uint8Array(hash))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function parsearDataItau(valor: any): string | null {
  if (!valor) return null;
  if (valor instanceof Date) {
    return valor.toISOString().split("T")[0];
  }
  const str = String(valor).trim();
  if (/^\d{4}-\d{2}-\d{2}/.test(str)) return str.substring(0, 10);
  const m = str.match(/^(\d{2})\/(\d{2})\/(\d{4})/);
  if (m) return `${m[3]}-${m[2]}-${m[1]}`;
  return null;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function parsearValor(valor: any): number {
  if (valor === null || valor === undefined || valor === "" || valor === "-") return 0;
  if (typeof valor === "number") return valor;
  return parseFloat(String(valor).replace(/\./g, "").replace(",", ".")) || 0;
}

interface ImportadorItauPagamentosProps {
  contaBancariaId?: string;
}

export function ImportadorItauPagamentos({ contaBancariaId: contaBancariaIdProp }: ImportadorItauPagamentosProps = {}) {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [contaBancariaIdInterno, setContaBancariaIdInterno] = useState("");
  const contaBancariaId = contaBancariaIdProp ?? contaBancariaIdInterno;
  const setContaBancariaId = (v: string) => { if (!contaBancariaIdProp) setContaBancariaIdInterno(v); };
  const [enviando, setEnviando] = useState(false);
  const [resultado, setResultado] = useState<ResultadoProcessamento | null>(null);

  const { data: contas } = useQuery({
    queryKey: ["contas-bancarias-itau"],
    queryFn: async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data } = await (supabase as any)
        .from("contas_bancarias")
        .select("id, nome_exibicao")
        .eq("ativo", true)
        .eq("tipo", "corrente")
        .order("nome_exibicao");
      return (data || []) as ContaBancaria[];
    },
  });

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const arquivo = e.target.files?.[0];
    e.target.value = "";
    if (!arquivo) return;
    if (!contaBancariaId) {
      toast.error("Selecione a conta bancária primeiro");
      return;
    }
    setEnviando(true);
    setResultado(null);

    try {
      const buffer = await arquivo.arrayBuffer();
      const wb = XLSX.read(buffer, { type: "array", cellDates: true });
      const ws = wb.Sheets[wb.SheetNames[0]];
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const rows: any[][] = XLSX.utils.sheet_to_json(ws, { header: 1, defval: "" });

      // Header na linha índice 5; dados a partir da linha índice 6
      const dadosLinhas = rows.slice(6).filter((r) => r[7] && String(r[7]).trim() !== "");

      if (dadosLinhas.length === 0) {
        toast.warning("Nenhuma linha de pagamento encontrada no arquivo.");
        return;
      }

      const datas = dadosLinhas
        .map((r) => parsearDataItau(r[12]))
        .filter(Boolean) as string[];
      const periodoInicio = datas.length ? datas.reduce((a, b) => (a < b ? a : b)) : null;
      const periodoFim = datas.length ? datas.reduce((a, b) => (a > b ? a : b)) : null;

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data: imp, error: errImp } = await (supabase as any)
        .from("itau_importacoes_stage")
        .insert({
          conta_bancaria_id: contaBancariaId,
          arquivo_nome: arquivo.name,
          periodo_inicio: periodoInicio,
          periodo_fim: periodoFim,
          total_linhas: dadosLinhas.length,
          status: "pendente",
          criado_por: user?.id ?? null,
        })
        .select("id")
        .single();

      if (errImp || !imp) {
        toast.error("Erro ao criar importação: " + errImp?.message);
        return;
      }

      const linhas = await Promise.all(
        dadosLinhas.map(async (r) => {
          const cnpj_pagador = String(r[0] ?? "").trim();
          const tipo_pagamento = String(r[4] ?? "").trim();
          const numero_lote = String(r[6] ?? "-").trim() || "-";
          const nome_favorecido = String(r[7] ?? "").trim();
          const cnpj_favorecido = String(r[8] ?? "").trim();
          const dados_pagamento = String(r[10] ?? "").trim();
          const data_pagamento = parsearDataItau(r[12]);
          const valor_pago = parsearValor(r[18]);
          const status_banco = String(r[19] ?? "Efetuado").trim();
          const referencia_empresa = String(r[5] ?? "").trim();

          const hash_unico = await gerarHashItau({
            cnpj_pagador,
            tipo_pagamento,
            numero_lote,
            cnpj_favorecido,
            valor_pago,
            data_pagamento: data_pagamento ?? "",
            dados_pagamento,
          });

          return {
            importacao_id: imp.id,
            conta_bancaria_id: contaBancariaId,
            cnpj_pagador,
            tipo_pagamento,
            numero_lote,
            nome_favorecido,
            cnpj_favorecido,
            dados_pagamento,
            data_pagamento,
            valor_pago,
            status_banco,
            referencia_empresa,
            hash_unico,
          };
        })
      );

      for (let i = 0; i < linhas.length; i += 50) {
        const lote = linhas.slice(i, i + 50);
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { error } = await (supabase as any)
          .from("itau_pagamentos_stage")
          .upsert(lote, { onConflict: "hash_unico", ignoreDuplicates: true });
        if (error) {
          toast.error("Erro ao inserir pagamentos: " + error.message);
          return;
        }
      }

      setResultado({ total_importadas: dadosLinhas.length });

      toast.success(`${dadosLinhas.length} pagamento(s) importado(s)`);
      qc.invalidateQueries({ queryKey: ["itau-importacoes"] });
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } catch (e: any) {
      toast.error("Erro: " + (e?.message ?? String(e)));
    } finally {
      setEnviando(false);
    }
  }

  return (
    <Card>
      <CardContent className="pt-6 space-y-4">
        <div className="flex items-start gap-3">
          <FileSpreadsheet className="h-6 w-6 text-admin mt-0.5" />
          <div className="flex-1">
            <div className="font-medium">Relatório de Pagamentos Itaú</div>
            <p className="text-xs text-muted-foreground">
              Exporte do Internet Banking: Pagamentos → Relatório de Pagamentos (XLSX)
            </p>
          </div>
        </div>

        {!contaBancariaIdProp && (
          <div className="space-y-1">
            <Label className="text-xs">Conta bancária</Label>
            <Select value={contaBancariaId} onValueChange={setContaBancariaId}>
              <SelectTrigger>
                <SelectValue placeholder="Para qual conta é este relatório?" />
              </SelectTrigger>
              <SelectContent>
                {(contas ?? []).map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.nome_exibicao}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}

        <div className="flex items-center gap-3">
          <input
            type="file"
            accept=".xlsx"
            id="itau-xlsx-input"
            disabled={enviando || !contaBancariaId}
            onChange={handleFile}
            className="hidden"
          />
          <Button
            variant="outline"
            disabled={enviando || !contaBancariaId}
            onClick={() => document.getElementById("itau-xlsx-input")?.click()}
            className="gap-2"
          >
            {enviando ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Upload className="h-4 w-4" />
            )}
            {enviando ? "Processando..." : "Importar XLSX"}
          </Button>
        </div>

        {resultado && (
          <div className="space-y-2 text-xs pt-2 border-t">
            <div className="flex items-center gap-1.5 text-success">
              <CheckCircle2 className="h-3.5 w-3.5" />
              <span className="font-semibold">
                {resultado.total_importadas} linha(s) importada(s)
              </span>
            </div>
            <div className="text-muted-foreground">
              Próximo passo: ir para{" "}
              <a href="/administrativo/conciliacao" className="underline font-medium">
                Conciliação Bancária
              </a>{" "}
              e vincular cada linha à movimentação correspondente.
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
