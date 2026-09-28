import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { formatError } from "@/lib/format-error";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { AlertTriangle, Loader2 } from "lucide-react";

type LinhaReposicao = {
  centro_id: string;
  origem_centro_id: string | null;
  lead_time_dias: number | null;
  seguranca_dias: number | null;
  janela_oportunidade_dias: number | null;
  teto_dias: number | null;
  cauda_limite_90d: number | null;
  cauda_piso_un: number | null;
  dia_cadencia: number | null;
  ativo: boolean;
  atualizado_em: string | null;
};

type CentroInfo = { id: string; codigo: string; rotulo_curto: string | null; nome: string | null };

type Rascunho = {
  lead_time: string;
  seguranca: string;
  janela: string;
  teto: string;
  cauda_limite: string;
  cauda_piso: string;
  dia_cadencia: string; // "none" quando vazio
  ativo: boolean;
};

const DIAS_SEMANA = [
  { valor: "1", rotulo: "1 — Segunda" },
  { valor: "2", rotulo: "2 — Terça" },
  { valor: "3", rotulo: "3 — Quarta" },
  { valor: "4", rotulo: "4 — Quinta" },
  { valor: "5", rotulo: "5 — Sexta" },
  { valor: "6", rotulo: "6 — Sábado" },
  { valor: "7", rotulo: "7 — Domingo" },
];

function fmtData(v: string | null) {
  if (!v) return "—";
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" });
}

/** Inteiro ≥ 0 (null permitido salvo indicação contrária). */
function inteiro(texto: string, { obrigatorio = false, maiorQueZero = false } = {}): number | null | string {
  const t = (texto ?? "").trim();
  if (t === "") {
    if (obrigatorio) return "Obrigatório";
    return null;
  }
  const n = Number(t);
  if (!Number.isInteger(n) || n < 0) return "Número inteiro ≥ 0";
  if (maiorQueZero && n <= 0) return "Precisa ser maior que zero";
  return n;
}

/** Número (decimal) ≥ 0. */
function numero(texto: string): number | null | string {
  const t = (texto ?? "").trim();
  if (t === "") return null;
  const n = Number(t);
  if (Number.isNaN(n) || n < 0) return "Número ≥ 0";
  return n;
}

function ehErroInteiro(v: number | null | string): v is string {
  return typeof v === "string";
}

export function BlocoReposicaoCentro() {
  const qc = useQueryClient();
  const [rascunhos, setRascunhos] = useState<Record<string, Rascunho>>({});
  const [erros, setErros] = useState<Record<string, string>>({});
  const [salvando, setSalvando] = useState<string | null>(null);

  const paramQ = useQuery({
    queryKey: ["reposicao-parametro-centro"],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("reposicao_parametro_centro")
        .select(
          "centro_id, origem_centro_id, lead_time_dias, seguranca_dias, janela_oportunidade_dias, teto_dias, cauda_limite_90d, cauda_piso_un, dia_cadencia, ativo, atualizado_em",
        );
      if (error) throw error;
      return (data ?? []) as LinhaReposicao[];
    },
  });

  const centrosQ = useQuery({
    queryKey: ["reposicao-parametro-centros"],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("centro_distribuicao")
        .select("id, codigo, rotulo_curto, nome");
      if (error) throw error;
      return (data ?? []) as CentroInfo[];
    },
  });

  const linhas = useMemo(() => paramQ.data ?? [], [paramQ.data]);
  const centrosPorId = useMemo(
    () => new Map((centrosQ.data ?? []).map((c) => [c.id, c])),
    [centrosQ.data],
  );

  const nomeCentro = (id: string | null | undefined) => {
    if (!id) return "—";
    const c = centrosPorId.get(id);
    if (!c) return "—";
    return c.rotulo_curto || c.nome || c.codigo;
  };

  useEffect(() => {
    setRascunhos(
      Object.fromEntries(
        linhas.map((l) => [
          l.centro_id,
          {
            lead_time: l.lead_time_dias == null ? "" : String(l.lead_time_dias),
            seguranca: l.seguranca_dias == null ? "" : String(l.seguranca_dias),
            janela: l.janela_oportunidade_dias == null ? "" : String(l.janela_oportunidade_dias),
            teto: l.teto_dias == null ? "" : String(l.teto_dias),
            cauda_limite: l.cauda_limite_90d == null ? "" : String(l.cauda_limite_90d),
            cauda_piso: l.cauda_piso_un == null ? "" : String(l.cauda_piso_un),
            dia_cadencia: l.dia_cadencia == null ? "none" : String(l.dia_cadencia),
            ativo: l.ativo,
          },
        ]),
      ),
    );
    setErros({});
  }, [linhas]);

  const salvar = useMutation({
    mutationFn: async (centroId: string) => {
      const r = rascunhos[centroId];
      if (!r) throw new Error("Rascunho não carregado.");
      const lead = inteiro(r.lead_time);
      const seg = inteiro(r.seguranca);
      const janela = inteiro(r.janela);
      const teto = inteiro(r.teto, { obrigatorio: true, maiorQueZero: true });
      const caudaLimite = numero(r.cauda_limite);
      const caudaPiso = inteiro(r.cauda_piso);
      const problemas: Record<string, string> = {};
      if (ehErroInteiro(lead)) problemas.lead_time = lead;
      if (ehErroInteiro(seg)) problemas.seguranca = seg;
      if (ehErroInteiro(janela)) problemas.janela = janela;
      if (ehErroInteiro(teto)) problemas.teto = teto;
      if (ehErroInteiro(caudaLimite)) problemas.cauda_limite = caudaLimite;
      if (ehErroInteiro(caudaPiso)) problemas.cauda_piso = caudaPiso;
      if (Object.keys(problemas).length > 0) {
        setErros((prev) => ({ ...prev, [centroId]: Object.values(problemas)[0] }));
        throw Object.assign(new Error(Object.values(problemas)[0]), { __validacao: true });
      }
      setErros((prev) => {
        const { [centroId]: _, ...resto } = prev;
        return resto;
      });
      const { error } = await (supabase as any)
        .from("reposicao_parametro_centro")
        .update({
          lead_time_dias: lead,
          seguranca_dias: seg,
          janela_oportunidade_dias: janela,
          teto_dias: teto,
          cauda_limite_90d: caudaLimite,
          cauda_piso_un: caudaPiso,
          dia_cadencia: r.dia_cadencia === "none" ? null : Number(r.dia_cadencia),
          ativo: r.ativo,
        })
        .eq("centro_id", centroId);
      if (error) throw error;
      return centroId;
    },
    onMutate: (centroId: string) => setSalvando(centroId),
    onSuccess: () => {
      toast.success("Parâmetros de reposição salvos.");
      qc.invalidateQueries({ queryKey: ["reposicao-parametro-centro"] });
      qc.invalidateQueries({ queryKey: ["reposicao-sugerida"] });
    },
    onError: (e: any) => {
      if (!e?.__validacao) toast.error(formatError(e));
    },
    onSettled: () => setSalvando(null),
  });

  function alterar(centroId: string, patch: Partial<Rascunho>) {
    setRascunhos((prev) => ({ ...prev, [centroId]: { ...prev[centroId], ...patch } }));
  }

  function sujo(l: LinhaReposicao) {
    const r = rascunhos[l.centro_id];
    if (!r) return false;
    const tetoOriginal = l.teto_dias == null ? "" : String(l.teto_dias);
    return (
      r.lead_time.trim() !== (l.lead_time_dias == null ? "" : String(l.lead_time_dias)) ||
      r.seguranca.trim() !== (l.seguranca_dias == null ? "" : String(l.seguranca_dias)) ||
      r.janela.trim() !== (l.janela_oportunidade_dias == null ? "" : String(l.janela_oportunidade_dias)) ||
      r.teto.trim() !== tetoOriginal ||
      r.cauda_limite.trim() !== (l.cauda_limite_90d == null ? "" : String(l.cauda_limite_90d)) ||
      r.cauda_piso.trim() !== (l.cauda_piso_un == null ? "" : String(l.cauda_piso_un)) ||
      r.dia_cadencia !== (l.dia_cadencia == null ? "none" : String(l.dia_cadencia)) ||
      r.ativo !== l.ativo
    );
  }

  const carregando = paramQ.isLoading || centrosQ.isLoading;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Reposição de centro (Transferências)</CardTitle>
        <p className="text-sm text-muted-foreground">
          Dono: Operação/Logística. Controla o motor que sugere a carga de transferência
          (Transferências → Sugestão do motor). Unidade: dias, exceto onde indicado.
        </p>
      </CardHeader>
      <CardContent className="space-y-4">
        {paramQ.isError ? (
          <Card className="border-destructive">
            <CardContent className="pt-6 text-sm text-destructive">
              {formatError(paramQ.error)}
            </CardContent>
          </Card>
        ) : carregando ? (
          <div className="space-y-2">
            {Array.from({ length: 3 }).map((_, i) => (
              <Skeleton key={i} className="h-12 w-full" />
            ))}
          </div>
        ) : (
          <div className="overflow-x-auto rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[150px]">Destino</TableHead>
                  <TableHead className="w-[130px]">Origem</TableHead>
                  <TableHead className="w-[90px]">Prazo de transporte</TableHead>
                  <TableHead className="w-[80px]">Segurança</TableHead>
                  <TableHead className="w-[90px]">Janela de carona</TableHead>
                  <TableHead className="w-[90px]">Teto de cobertura</TableHead>
                  <TableHead className="w-[100px]">Cauda longa (peças/90d)</TableHead>
                  <TableHead className="w-[90px]">Piso da cauda (peças)</TableHead>
                  <TableHead className="w-[150px]">Dia da carga</TableHead>
                  <TableHead className="w-[70px]">Ativo</TableHead>
                  <TableHead className="w-[150px]">Última alteração</TableHead>
                  <TableHead className="w-[110px]" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {linhas.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={12} className="py-8 text-center text-muted-foreground">
                      Nenhum parâmetro de reposição cadastrado.
                    </TableCell>
                  </TableRow>
                ) : (
                  linhas.map((l) => {
                    const r = rascunhos[l.centro_id];
                    const erro = erros[l.centro_id];
                    return (
                      <TableRow key={l.centro_id}>
                        <TableCell className="font-medium">{nomeCentro(l.centro_id)}</TableCell>
                        <TableCell className="text-muted-foreground">
                          {nomeCentro(l.origem_centro_id)}
                        </TableCell>
                        <TableCell>
                          <Input
                            type="number"
                            min={0}
                            step={1}
                            inputMode="numeric"
                            value={r?.lead_time ?? ""}
                            onChange={(e) => alterar(l.centro_id, { lead_time: e.target.value })}
                            className="h-9 tabular-nums"
                          />
                        </TableCell>
                        <TableCell>
                          <Input
                            type="number"
                            min={0}
                            step={1}
                            inputMode="numeric"
                            value={r?.seguranca ?? ""}
                            onChange={(e) => alterar(l.centro_id, { seguranca: e.target.value })}
                            className="h-9 tabular-nums"
                          />
                        </TableCell>
                        <TableCell>
                          <Input
                            type="number"
                            min={0}
                            step={1}
                            inputMode="numeric"
                            value={r?.janela ?? ""}
                            onChange={(e) => alterar(l.centro_id, { janela: e.target.value })}
                            className="h-9 tabular-nums"
                          />
                        </TableCell>
                        <TableCell>
                          <Input
                            type="number"
                            min={1}
                            step={1}
                            inputMode="numeric"
                            value={r?.teto ?? ""}
                            onChange={(e) => alterar(l.centro_id, { teto: e.target.value })}
                            className="h-9 tabular-nums"
                          />
                        </TableCell>
                        <TableCell>
                          <Input
                            type="number"
                            min={0}
                            step="any"
                            inputMode="decimal"
                            value={r?.cauda_limite ?? ""}
                            onChange={(e) => alterar(l.centro_id, { cauda_limite: e.target.value })}
                            className="h-9 tabular-nums"
                          />
                        </TableCell>
                        <TableCell>
                          <Input
                            type="number"
                            min={0}
                            step={1}
                            inputMode="numeric"
                            value={r?.cauda_piso ?? ""}
                            onChange={(e) => alterar(l.centro_id, { cauda_piso: e.target.value })}
                            className="h-9 tabular-nums"
                          />
                        </TableCell>
                        <TableCell>
                          <Select
                            value={r?.dia_cadencia ?? "none"}
                            onValueChange={(v) => alterar(l.centro_id, { dia_cadencia: v })}
                          >
                            <SelectTrigger className="h-9">
                              <SelectValue placeholder="Sem cadência" />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="none">Sem cadência</SelectItem>
                              {DIAS_SEMANA.map((d) => (
                                <SelectItem key={d.valor} value={d.valor}>
                                  {d.rotulo}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </TableCell>
                        <TableCell>
                          <Switch
                            checked={r?.ativo ?? false}
                            onCheckedChange={(v) => alterar(l.centro_id, { ativo: v })}
                          />
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground">
                          Atualizado em {fmtData(l.atualizado_em)}
                        </TableCell>
                        <TableCell className="text-right align-top">
                          <div className="space-y-1">
                            <Button
                              size="sm"
                              variant="outline"
                              disabled={!sujo(l) || salvando === l.centro_id}
                              onClick={() => salvar.mutate(l.centro_id)}
                              className="gap-2"
                            >
                              {salvando === l.centro_id && (
                                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                              )}
                              Salvar
                            </Button>
                            {erro && <p className="text-xs text-destructive">{erro}</p>}
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })
                )}
              </TableBody>
            </Table>
          </div>
        )}

        <p className="text-xs text-muted-foreground">
          Mínimo = demanda/dia × (prazo + segurança) · Carona = … + janela · Teto = demanda/dia ×
          teto. SKU com até N peças em 90 dias usa o piso fixo.
        </p>
      </CardContent>
    </Card>
  );
}
