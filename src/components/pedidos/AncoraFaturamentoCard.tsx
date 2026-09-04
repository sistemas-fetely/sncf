import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { AlertTriangle, CalendarCheck, Info, Loader2 } from "lucide-react";
import { PRE_FATURAMENTO_CHECKLIST_KEY } from "@/components/pedidos/PreFaturamentoCard";
import { usePermissaoAcaoOuSuperAdmin } from "@/hooks/usePermissaoAcao";

/**
 * ÂNCORA DE FATURAMENTO — SISTEMA SUGERE / HUMANO DECIDE.
 *
 * REGRA-NÃO-MORA-EM-TELA: tudo (cronograma, alertas, pode_declarar, gordura
 * sugerida) vem de `fn_sugerir_ancora_faturamento`. A tela só desenha.
 */

const fmtBRL = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });

function fmtDate(d?: string | null) {
  if (!d) return "—";
  const [a, m, dia] = String(d).slice(0, 10).split("-");
  if (!a || !m || !dia) return String(d);
  return `${dia}/${m}/${a}`;
}

function fmtDiaMes(d?: string | null) {
  if (!d) return "—";
  const [, m, dia] = String(d).slice(0, 10).split("-");
  return m && dia ? `${dia}/${m}` : String(d);
}

function hojeISO() {
  const agora = new Date();
  const off = agora.getTimezoneOffset() * 60000;
  return new Date(agora.getTime() - off).toISOString().slice(0, 10);
}

const MIN_MOTIVO_FORCA = 15;

interface LinhaAncora {
  provisao_id: string;
  parcela: number;
  valor: number;
  tipo: string;
  eh_portao: boolean;
  pago_em: string | null;
  dias_nominais: number | null;
  data_vencimento: string | null;
  papel: "duplicata" | "recibo" | "portao_aberto";
  origem_data?: string | null;
}

interface AlertaAncora {
  codigo: string;
  bloqueia: boolean;
  detalhe: string;
}

interface Sugestao {
  id_externo: string;
  condicao: string | null;
  condicao_confiavel: boolean;
  prazo_1a_parcela_nominal: number | null;
  data_faturamento: string;
  gordura_dias: number | null;
  gordura_sugerida: boolean;
  gordura_parametro: number;
  venc_parcela1_declarado: string | null;
  linhas_a_prazo: number;
  linhas_portao: number;
  linhas: LinhaAncora[];
  cronograma: { parcela: number; provisao_id: string; data: string }[];
  venc_max: string | null;
  alertas: AlertaAncora[];
  pode_declarar: boolean;
  pode_forcar: boolean;
  bloqueios: string[];
}

interface Vigente {
  valor_declarado: {
    data_faturamento: string;
    gordura_dias: number | null;
    cronograma?: { parcela: number; data: string }[];
    linhas?: LinhaAncora[];
  };
  declarado_por_nome: string | null;
  declarado_em: string;
}

const PAPEL_ROTULO: Record<string, string> = {
  duplicata: "duplicata",
  recibo: "recibo",
  portao_aberto: "portão aberto",
};

export function AncoraFaturamentoCard({
  pedidoId, idExterno, onDeclarada,
}: { pedidoId: string; idExterno: string; onDeclarada?: () => void }) {
  const qc = useQueryClient();
  const hoje = hojeISO();
  const { permitido: podeForcar } = usePermissaoAcaoOuSuperAdmin("acao.pedido_forcar_prazo_credito");

  const [dataFaturamento, setDataFaturamento] = useState(hoje);
  const [gorduraDias, setGorduraDias] = useState<number | "">("");
  const [vencParcela1, setVencParcela1] = useState("");
  const [redeclarando, setRedeclarando] = useState(false);
  const [forcaAberta, setForcaAberta] = useState(false);
  const [motivoForca, setMotivoForca] = useState("");

  const sugestaoQ = useQuery({
    queryKey: ["ancora-sugestao", pedidoId, dataFaturamento, gorduraDias, vencParcela1],
    queryFn: async (): Promise<Sugestao> => {
      const args: Record<string, unknown> = {
        p_pedido_id: pedidoId,
        p_data_faturamento: dataFaturamento || null,
      };
      if (gorduraDias !== "") args.p_gordura_dias = Number(gorduraDias);
      if (vencParcela1) args.p_venc_parcela1 = vencParcela1;
      const { data, error } = await supabase.rpc(
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        "fn_sugerir_ancora_faturamento" as any, args as any,
      );
      if (error) throw error;
      return data as unknown as Sugestao;
    },
  });

  const vigenteQ = useQuery({
    queryKey: ["ancora-vigente", pedidoId],
    queryFn: async (): Promise<Vigente | null> => {
      const { data, error } = await supabase.rpc(
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        "fn_declaracao_vigente" as any,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        { p_entidade: "pedido", p_entidade_id: pedidoId, p_tipo: "ancora_faturamento" } as any,
      );
      if (error) throw error;
      const linhas = (data as unknown as Vigente[]) ?? [];
      return linhas.length > 0 ? linhas[0] : null;
    },
  });

  const sugestao = sugestaoQ.data;

  // Pré-preenchimento editável da gordura: só enquanto o humano não digitou.
  useEffect(() => {
    if (gorduraDias === "" && sugestao && sugestao.gordura_dias != null) {
      setGorduraDias(sugestao.gordura_dias);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sugestao?.gordura_dias]);

  const declarar = useMutation<void, unknown, { forcar?: boolean; motivo?: string } | void>({
    mutationFn: async (opts) => {
      const args: Record<string, unknown> = {
        p_pedido_id: pedidoId,
        p_data_faturamento: dataFaturamento,
        p_gordura_dias: gorduraDias === "" ? 0 : Number(gorduraDias),
      };
      if (vencParcela1) args.p_venc_parcela1 = vencParcela1;
      if (opts && opts.forcar) {
        args.p_forcar = true;
        args.p_motivo_forca = opts.motivo;
      }
      const { error } = await supabase.rpc(
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        "fn_declarar_ancora_faturamento" as any, args as any,
      );
      if (error) throw error;
    },
    onSuccess: async (_data, opts) => {
      toast.success(opts && (opts as { forcar?: boolean }).forcar ? "Âncora declarada (forçada)" : "Âncora declarada");
      setRedeclarando(false);
      setForcaAberta(false);
      setMotivoForca("");
      await Promise.all([
        qc.invalidateQueries({ queryKey: ["ancora-vigente", pedidoId] }),
        qc.invalidateQueries({ queryKey: ["ancora-sugestao", pedidoId] }),
        qc.invalidateQueries({ queryKey: PRE_FATURAMENTO_CHECKLIST_KEY(pedidoId) }),
      ]);
      onDeclarada?.();
    },
    onError: (e: unknown) => {
      toast.error(e instanceof Error ? e.message : "Não foi possível declarar a âncora");
    },
  });

  const vigente = vigenteQ.data ?? null;
  const carregando = sugestaoQ.isLoading || vigenteQ.isLoading;

  const corpo = () => {
    if (carregando) {
      return (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          Calculando o cronograma...
        </div>
      );
    }

    if (sugestaoQ.error || !sugestao) {
      return (
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertDescription>
            Não foi possível calcular a âncora de faturamento do pedido #{idExterno}.
          </AlertDescription>
        </Alert>
      );
    }

    if (sugestao.linhas_a_prazo === 0) {
      return (
        <Alert>
          <Info className="h-4 w-4" />
          <AlertDescription>
            Sem parcela a prazo — não exige âncora. {sugestao.linhas_portao} linha(s) de
            portão ficam como recibo.
          </AlertDescription>
        </Alert>
      );
    }

    const mostrarForm = !vigente || redeclarando;

    return (
      <div className="space-y-4">
        {vigente && (
          <div className="space-y-2 rounded-md border p-3">
            <div className="text-sm">
              Âncora declarada: faturar em{" "}
              <strong>{fmtDate(vigente.valor_declarado?.data_faturamento)}</strong> · gordura{" "}
              {vigente.valor_declarado?.gordura_dias ?? 0} d · por{" "}
              {vigente.declarado_por_nome ?? "—"} em {fmtDate(vigente.declarado_em)}
            </div>

            {(vigente.valor_declarado?.cronograma?.length ?? 0) > 0 && (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Parcela</TableHead>
                    <TableHead>Vencimento</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {vigente.valor_declarado.cronograma!.map((c) => (
                    <TableRow key={`${c.parcela}-${c.data}`}>
                      <TableCell className="tabular-nums">{c.parcela}</TableCell>
                      <TableCell className="tabular-nums">{fmtDate(c.data)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}

            {!redeclarando && (
              <Button variant="secondary" size="sm" onClick={() => setRedeclarando(true)}>
                Redeclarar
              </Button>
            )}
          </div>
        )}

        {mostrarForm && (
          <>
            <div className="grid gap-4 md:grid-cols-3">
              <div className="space-y-1">
                <Label htmlFor="ancora-data">Data de faturamento</Label>
                <Input
                  id="ancora-data"
                  type="date"
                  min={hoje}
                  value={dataFaturamento}
                  onChange={(e) => setDataFaturamento(e.target.value)}
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="ancora-gordura">Gordura em dias</Label>
                <Input
                  id="ancora-gordura"
                  type="number"
                  min={0}
                  value={gorduraDias}
                  onChange={(e) =>
                    setGorduraDias(e.target.value === "" ? "" : Number(e.target.value))
                  }
                />
                <p className="text-xs text-muted-foreground leading-snug">
                  Sugerido: {sugestao.gordura_parametro} quando a 1ª parcela a prazo é à
                  vista; 0 quando já tem prazo
                </p>
              </div>
              <div className="space-y-1">
                <Label htmlFor="ancora-venc1">Vencimento da 1ª parcela</Label>
                <Input
                  id="ancora-venc1"
                  type="date"
                  value={vencParcela1}
                  onChange={(e) => setVencParcela1(e.target.value)}
                />
                <p className="text-xs text-muted-foreground leading-snug">
                  Só se quiser sobrescrever o cálculo
                </p>
              </div>
            </div>

            <div className="overflow-x-auto">
              <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Parcela</TableHead>
                  <TableHead>Tipo</TableHead>
                  <TableHead className="text-right">Valor (R$)</TableHead>
                  <TableHead>Papel</TableHead>
                  <TableHead>Vencimento</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(sugestao.linhas ?? []).map((l) => (
                  <TableRow key={l.provisao_id}>
                    <TableCell className="tabular-nums">{l.parcela}</TableCell>
                    <TableCell>{l.tipo}</TableCell>
                    <TableCell className="text-right tabular-nums">
                      {fmtBRL.format(Number(l.valor) || 0)}
                    </TableCell>
                    <TableCell>
                      <Badge variant={l.papel === "duplicata" ? "default" : "secondary"}>
                        {PAPEL_ROTULO[l.papel] ?? l.papel}
                      </Badge>
                    </TableCell>
                    <TableCell className="tabular-nums">
                      {l.papel === "duplicata"
                        ? fmtDate(l.data_vencimento)
                        : l.papel === "recibo"
                        ? `— (pago em ${fmtDiaMes(l.pago_em)})`
                        : "—"}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            </div>

            {(sugestao.alertas ?? []).map((a) => (
              <Alert key={a.codigo} variant={a.bloqueia ? "destructive" : "default"}>
                <AlertTriangle className="h-4 w-4" />
                <AlertDescription>{a.detalhe}</AlertDescription>
              </Alert>
            ))}

            <div className="flex flex-col sm:flex-row gap-2">
              <Button
                className="gap-1.5"
                disabled={!sugestao.pode_declarar || declarar.isPending}
                onClick={() => declarar.mutate()}
              >
                {declarar.isPending
                  ? <Loader2 className="h-4 w-4 animate-spin" />
                  : <CalendarCheck className="h-4 w-4" />}
                Declarar data de faturamento
              </Button>

              {!sugestao.pode_declarar && sugestao.pode_forcar && podeForcar && (
                <Button
                  variant="outline"
                  className="gap-1.5"
                  onClick={() => setForcaAberta(true)}
                >
                  <AlertTriangle className="h-4 w-4" />
                  Declarar mesmo assim
                </Button>
              )}
            </div>

            <Dialog
              open={forcaAberta}
              onOpenChange={(v) => {
                if (declarar.isPending) return;
                setForcaAberta(v);
                if (!v) setMotivoForca("");
              }}
            >
              <DialogContent>
                <DialogHeader>
                  <DialogTitle className="flex items-center gap-2">
                    <AlertTriangle className="h-5 w-5 text-warning" />
                    Declarar fora do envelope de crédito
                  </DialogTitle>
                  <DialogDescription className="space-y-2">
                    <p>
                      O pedido está bloqueado para faturamento e declarar assim assume o risco sobre
                      os alertas abaixo. O motivo fica registrado e assinado no histórico do pedido.
                    </p>
                    {(sugestao.alertas ?? []).filter((a) => a.bloqueia).length > 0 && (
                      <ul className="list-disc pl-4 space-y-1 text-sm text-foreground">
                        {(sugestao.alertas ?? [])
                          .filter((a) => a.bloqueia)
                          .map((a) => (
                            <li key={a.codigo}>{a.detalhe}</li>
                          ))}
                      </ul>
                    )}
                  </DialogDescription>
                </DialogHeader>

                <Textarea
                  value={motivoForca}
                  onChange={(e) => setMotivoForca(e.target.value)}
                  placeholder="Ex.: cliente estratégico, risco assumido pela diretoria nesta entrega"
                  rows={3}
                />
                <div className="text-xs text-muted-foreground">
                  {motivoForca.trim().length}/{MIN_MOTIVO_FORCA} caracteres
                </div>

                <DialogFooter>
                  <Button
                    variant="ghost"
                    onClick={() => {
                      setForcaAberta(false);
                      setMotivoForca("");
                    }}
                    disabled={declarar.isPending}
                  >
                    Cancelar
                  </Button>
                  <Button
                    disabled={motivoForca.trim().length < MIN_MOTIVO_FORCA || declarar.isPending}
                    onClick={() => declarar.mutate({ forcar: true, motivo: motivoForca.trim() })}
                    className="gap-1.5"
                  >
                    {declarar.isPending
                      ? <Loader2 className="h-4 w-4 animate-spin" />
                      : <AlertTriangle className="h-4 w-4" />}
                    Declarar assumindo o risco
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </>
        )}
      </div>
    );
  };

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-sm font-medium">Data de faturamento</CardTitle>
      </CardHeader>
      <CardContent>{corpo()}</CardContent>
    </Card>
  );
}
