// Mesa de Declarações — DECLARACAO-NAO-E-CORRECAO
// O operador declara um FATO FÍSICO que o sistema não consegue observar.
// Cada declaração viva é uma DÍVIDA DE INTEGRAÇÃO em aberto.
import { useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Loader2, ShieldAlert, AlertTriangle, CheckCircle2, Search, ArrowRight } from "lucide-react";

import { PageShell } from "@/components/layout/PageShell";
import { PageHeader } from "@/components/layout/PageHeader";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

import { usePermissaoAcao } from "@/hooks/usePermissaoAcao";
import { useAuth } from "@/contexts/AuthContext";
import { formatError } from "@/lib/format-error";
import { fmtData, fmtDataHora, hojeISO, paraDataISO } from "@/lib/data";

type Tipo = {
  codigo: string;
  entidade: string;
  label: string;
  o_que_afirma: string;
  grava_em: string;
  exige_valor: boolean;
  ordem: number;
};

type Motivo = {
  codigo: string;
  label: string;
  o_que_significa: string;
  valida_contra: string | null;
  ordem: number;
};

type Declaracao = {
  id: string;
  entidade: string;
  entidade_id: string;
  id_externo: string | null;
  tipo_codigo: string;
  motivo_codigo: string;
  observacao: string | null;
  valor_declarado: unknown;
  declarado_por_nome: string | null;
  declarado_em: string;
  aposentada_em: string | null;
  aposentada_por_nome: string | null;
  aposentada_motivo: string | null;
};

/** Dias vividos desde uma data (Brasília). Nunca negativo. */
function diasDesde(v: string | null | undefined): number {
  const iso = paraDataISO(v);
  if (!iso) return 0;
  const [a, m, d] = iso.split("-").map(Number);
  const [ha, hm, hd] = hojeISO().split("-").map(Number);
  const dias = Math.round((Date.UTC(ha, hm - 1, hd) - Date.UTC(a, m - 1, d)) / 86400000);
  return dias > 0 ? dias : 0;
}

function AcessoNegado() {
  return (
    <PageShell variant="leitura">
      <Card className="border-warning/40">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <ShieldAlert className="h-4 w-4 text-warning" />
            Mesa restrita por desenho
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm text-muted-foreground">
          <p>
            A Mesa de Declarações permite afirmar fatos que o sistema não consegue observar. Por
            isso o acesso é nominal: só quem tem a ação <code className="text-xs">acao.declarar_realidade</code>{" "}
            entra aqui.
          </p>
          <p>
            Isso não é um erro de configuração — é intencional. Se você precisa declarar um fato,
            fale com quem administra as ações nomeadas.
          </p>
        </CardContent>
      </Card>
    </PageShell>
  );
}

export default function MesaDeclaracoes() {
  const { permitido, carregando } = usePermissaoAcao("acao.declarar_realidade");

  if (carregando) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }
  if (!permitido) return <AcessoNegado />;
  return <MesaConteudo />;
}

function MesaConteudo() {
  const qc = useQueryClient();
  const { user, profile } = useAuth();
  const nomeAtual = profile?.full_name ?? user?.email ?? "Sem nome";

  const [visao, setVisao] = useState<"vivas" | "aposentadas">("vivas");
  const [fTipo, setFTipo] = useState("todos");
  const [fMotivo, setFMotivo] = useState("todos");

  const { data: tipos } = useQuery({
    queryKey: ["declaracao-tipos"],
    staleTime: 5 * 60 * 1000,
    queryFn: async (): Promise<Tipo[]> => {
      const { data, error } = await supabase
        .from("declaracao_tipo")
        .select("codigo, entidade, label, o_que_afirma, grava_em, exige_valor, ordem")
        .eq("ativo", true)
        .order("ordem");
      if (error) throw error;
      return (data ?? []) as Tipo[];
    },
  });

  const { data: motivos } = useQuery({
    queryKey: ["declaracao-motivos"],
    staleTime: 5 * 60 * 1000,
    queryFn: async (): Promise<Motivo[]> => {
      const { data, error } = await supabase
        .from("declaracao_motivo")
        .select("codigo, label, o_que_significa, valida_contra, ordem")
        .eq("ativo", true)
        .order("ordem");
      if (error) throw error;
      return (data ?? []) as Motivo[];
    },
  });

  const { data: declaracoes, isLoading } = useQuery({
    queryKey: ["declaracoes-realidade", visao],
    queryFn: async (): Promise<Declaracao[]> => {
      let q = supabase
        .from("declaracao_realidade")
        .select(
          "id, entidade, entidade_id, id_externo, tipo_codigo, motivo_codigo, observacao, valor_declarado, declarado_por_nome, declarado_em, aposentada_em, aposentada_por_nome, aposentada_motivo"
        );
      q = visao === "vivas" ? q.is("aposentada_em", null) : q.not("aposentada_em", "is", null);
      const { data, error } = await q.order("declarado_em", { ascending: true });
      if (error) throw error;
      return (data ?? []) as Declaracao[];
    },
  });

  const { data: totalVivas } = useQuery({
    queryKey: ["declaracoes-vivas-contador"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("declaracao_realidade")
        .select("declarado_em")
        .is("aposentada_em", null)
        .order("declarado_em", { ascending: true });
      if (error) throw error;
      const linhas = data ?? [];
      return {
        total: linhas.length,
        maisAntiga: linhas[0]?.declarado_em ?? null,
      };
    },
  });

  const labelTipo = (codigo: string) =>
    tipos?.find((t) => t.codigo === codigo)?.label ?? codigo;
  const labelMotivo = (codigo: string) =>
    motivos?.find((m) => m.codigo === codigo)?.label ?? codigo;

  const lista = useMemo(() => {
    return (declaracoes ?? []).filter(
      (d) =>
        (fTipo === "todos" || d.tipo_codigo === fTipo) &&
        (fMotivo === "todos" || d.motivo_codigo === fMotivo)
    );
  }, [declaracoes, fTipo, fMotivo]);

  // ── Aposentar ──────────────────────────────────────────────
  const [aposentando, setAposentando] = useState<Declaracao | null>(null);
  const [motivoAposentar, setMotivoAposentar] = useState("");

  const aposentar = useMutation({
    mutationFn: async ({ id, motivo }: { id: string; motivo: string }) => {
      const { error } = await supabase
        .from("declaracao_realidade")
        .update({
          aposentada_em: new Date().toISOString(),
          aposentada_por: user?.id ?? null,
          aposentada_por_nome: nomeAtual,
          aposentada_motivo: motivo,
        })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["declaracoes-realidade"] });
      qc.invalidateQueries({ queryKey: ["declaracoes-vivas-contador"] });
      setAposentando(null);
      setMotivoAposentar("");
      toast.success("Declaração aposentada. O sistema volta a decidir sozinho.");
    },
    onError: (e) => toast.error(formatError(e)),
  });

  const contador = totalVivas?.total ?? 0;
  const diasAntiga = diasDesde(totalVivas?.maisAntiga);

  return (
    <PageShell variant="leitura">
      <PageHeader
        titulo="Mesa de Declarações"
        estado="Declaração não é correção: o dado original permanece, e as automações passam a ceder ao fato declarado até que ele seja aposentado."
      />

      {/* 1 ─ Contador */}
      <Card className={contador > 5 ? "border-destructive/50" : contador > 0 ? "border-warning/40" : undefined}>
        <CardContent className="flex flex-wrap items-center gap-4 py-5">
          <div className="flex items-center gap-3">
            {contador === 0 ? (
              <CheckCircle2 className="h-6 w-6 text-success" />
            ) : contador > 5 ? (
              <AlertTriangle className="h-6 w-6 text-destructive" />
            ) : (
              <AlertTriangle className="h-6 w-6 text-warning" />
            )}
            <div>
              <p
                className={
                  contador > 5
                    ? "text-3xl font-medium text-destructive"
                    : contador > 0
                      ? "text-3xl font-medium text-warning"
                      : "text-3xl font-medium text-success"
                }
              >
                {contador}
              </p>
              <p className="text-xs text-muted-foreground">
                declarações vivas — cada uma é uma integração faltando
              </p>
            </div>
          </div>
          <div className="text-sm text-muted-foreground">
            {contador === 0 ? (
              <span>Nenhuma dívida de integração em aberto. O sistema está observando a realidade sozinho.</span>
            ) : (
              <span>
                A mais antiga está viva há <strong>{diasAntiga}</strong>{" "}
                {diasAntiga === 1 ? "dia" : "dias"}
                {contador > 5 && " — o volume está alto: há pernas de integração faltando."}
              </span>
            )}
          </div>
        </CardContent>
      </Card>

      {/* 2 ─ Lista */}
      <Card>
        <CardHeader className="gap-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <CardTitle className="text-base">
              {visao === "vivas" ? "Declarações vivas" : "Histórico de declarações aposentadas"}
            </CardTitle>
            <div className="flex flex-wrap items-center gap-2">
              <Select value={fTipo} onValueChange={setFTipo}>
                <SelectTrigger className="h-8 w-[200px] text-xs">
                  <SelectValue placeholder="Tipo" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="todos">Todos os tipos</SelectItem>
                  {(tipos ?? []).map((t) => (
                    <SelectItem key={t.codigo} value={t.codigo}>
                      {t.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select value={fMotivo} onValueChange={setFMotivo}>
                <SelectTrigger className="h-8 w-[200px] text-xs">
                  <SelectValue placeholder="Motivo" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="todos">Todos os motivos</SelectItem>
                  {(motivos ?? []).map((m) => (
                    <SelectItem key={m.codigo} value={m.codigo}>
                      {m.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setVisao(visao === "vivas" ? "aposentadas" : "vivas")}
              >
                {visao === "vivas" ? "Ver histórico" : "Ver vivas"}
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex justify-center py-10">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          ) : lista.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">
              {visao === "vivas"
                ? "Nenhuma declaração viva."
                : "Nenhuma declaração aposentada até agora."}
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Alvo</TableHead>
                  <TableHead>Tipo</TableHead>
                  <TableHead>Motivo</TableHead>
                  <TableHead>Declarou</TableHead>
                  <TableHead>Viva há</TableHead>
                  <TableHead>Observação</TableHead>
                  {visao === "aposentadas" && <TableHead>Aposentada</TableHead>}
                  {visao === "vivas" && <TableHead className="text-right">Ação</TableHead>}
                </TableRow>
              </TableHeader>
              <TableBody>
                {lista.map((d) => {
                  const dias = diasDesde(d.declarado_em);
                  return (
                    <TableRow key={d.id}>
                      <TableCell>
                        <p className="text-sm">{d.id_externo ?? d.entidade_id}</p>
                        <p className="text-xs text-muted-foreground">{d.entidade}</p>
                      </TableCell>
                      <TableCell className="text-sm">{labelTipo(d.tipo_codigo)}</TableCell>
                      <TableCell className="text-sm">{labelMotivo(d.motivo_codigo)}</TableCell>
                      <TableCell>
                        <p className="text-sm">{d.declarado_por_nome ?? "—"}</p>
                        <p className="text-xs text-muted-foreground">{fmtData(d.declarado_em)}</p>
                      </TableCell>
                      <TableCell>
                        <Badge variant={dias > 30 ? "destructive" : "outline"} className="text-xs">
                          {dias} {dias === 1 ? "dia" : "dias"}
                        </Badge>
                      </TableCell>
                      <TableCell className="max-w-[280px] text-xs text-muted-foreground">
                        {d.observacao ?? "—"}
                      </TableCell>
                      {visao === "aposentadas" && (
                        <TableCell className="max-w-[240px] text-xs text-muted-foreground">
                          <p>{fmtDataHora(d.aposentada_em)}</p>
                          <p>
                            {d.aposentada_por_nome ?? "—"}: {d.aposentada_motivo ?? "—"}
                          </p>
                        </TableCell>
                      )}
                      {visao === "vivas" && (
                        <TableCell className="text-right">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => {
                              setAposentando(d);
                              setMotivoAposentar("");
                            }}
                          >
                            Aposentar
                          </Button>
                        </TableCell>
                      )}
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* 3 ─ Nova declaração */}
      <NovaDeclaracaoForm
        tipos={tipos ?? []}
        motivos={motivos ?? []}
        userId={user?.id ?? null}
        nome={nomeAtual}
        onGravou={() => {
          qc.invalidateQueries({ queryKey: ["declaracoes-realidade"] });
          qc.invalidateQueries({ queryKey: ["declaracoes-vivas-contador"] });
        }}
      />

      {/* Diálogo de aposentadoria */}
      <Dialog open={!!aposentando} onOpenChange={(o) => !o && setAposentando(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Aposentar declaração</DialogTitle>
            <DialogDescription>
              A declaração não é apagada: ela passa a constar como encerrada, e o sistema volta a
              decidir por conta própria. Conte por que ela não é mais necessária.
            </DialogDescription>
          </DialogHeader>
          {aposentando && (
            <div className="space-y-3">
              <div className="rounded-md border border-border/60 bg-muted/40 p-3 text-xs">
                <p className="font-medium">
                  {aposentando.id_externo ?? aposentando.entidade_id} ·{" "}
                  {labelTipo(aposentando.tipo_codigo)}
                </p>
                <p className="text-muted-foreground">{aposentando.observacao ?? "—"}</p>
              </div>
              <div className="space-y-1">
                <Label htmlFor="motivo-aposentar">Motivo da aposentadoria *</Label>
                <Textarea
                  id="motivo-aposentar"
                  value={motivoAposentar}
                  onChange={(e) => setMotivoAposentar(e.target.value)}
                  placeholder="Ex.: integração da São Miguel entrou no ar"
                  rows={3}
                />
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setAposentando(null)}>
              Cancelar
            </Button>
            <Button
              disabled={motivoAposentar.trim().length < 5 || aposentar.isPending}
              onClick={() =>
                aposentando &&
                aposentar.mutate({ id: aposentando.id, motivo: motivoAposentar.trim() })
              }
            >
              {aposentar.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Aposentar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </PageShell>
  );
}

// ═══════════════════════════════════════════════════════════
// Formulário de nova declaração
// ═══════════════════════════════════════════════════════════

type Alvo = { entidade_id: string; id_externo: string; descricao: string };

function NovaDeclaracaoForm({
  tipos,
  motivos,
  userId,
  nome,
  onGravou,
}: {
  tipos: Tipo[];
  motivos: Motivo[];
  userId: string | null;
  nome: string;
  onGravou: () => void;
}) {
  const [tipoCodigo, setTipoCodigo] = useState("");
  const [motivoCodigo, setMotivoCodigo] = useState("");
  const [alvo, setAlvo] = useState<Alvo | null>(null);
  const [busca, setBusca] = useState("");
  const [dataFato, setDataFato] = useState("");
  const [transportadoraId, setTransportadoraId] = useState("");
  const [observacao, setObservacao] = useState("");
  const [confirmando, setConfirmando] = useState(false);

  const tipo = tipos.find((t) => t.codigo === tipoCodigo) ?? null;
  const motivo = motivos.find((m) => m.codigo === motivoCodigo) ?? null;
  const entidade = tipo?.entidade ?? null;

  const pedeData =
    !!tipo?.exige_valor &&
    (tipo.codigo === "entrega_confirmada" || tipo.codigo === "embarque_confirmado");
  const pedeTransportadora = !!tipo?.exige_valor && tipo.codigo === "transportadora_definida";
  const pedeValorGenerico = !!tipo?.exige_valor && !pedeData && !pedeTransportadora;

  // Busca de alvo
  const { data: resultados, isFetching } = useQuery({
    queryKey: ["declaracao-busca-alvo", entidade, busca],
    enabled: !!entidade && busca.trim().length >= 2 && !alvo,
    queryFn: async (): Promise<Alvo[]> => {
      const termo = `%${busca.trim()}%`;
      if (entidade === "pedido") {
        const { data, error } = await supabase
          .from("pedidos")
          .select("id, id_externo, cliente_nome_snapshot")
          .ilike("id_externo", termo)
          .order("id_externo", { ascending: false })
          .limit(10);
        if (error) throw error;
        return (data ?? []).map((p) => ({
          entidade_id: p.id,
          id_externo: p.id_externo ?? p.id,
          descricao: p.cliente_nome_snapshot ?? "Sem cliente",
        }));
      }
      const { data, error } = await supabase
        .from("xpm_expedicao")
        .select("codigo, destinatario_nome")
        .ilike("codigo", termo)
        .order("codigo", { ascending: false })
        .limit(10);
      if (error) throw error;
      return (data ?? []).map((x) => ({
        entidade_id: x.codigo,
        id_externo: x.codigo,
        descricao: x.destinatario_nome ?? "Sem destinatário",
      }));
    },
  });

  // Transportadoras
  const { data: transportadoras } = useQuery({
    queryKey: ["declaracao-transportadoras"],
    enabled: pedeTransportadora,
    staleTime: 5 * 60 * 1000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("parceiros_comerciais")
        .select("id, nome_fantasia, razao_social")
        .contains("tipos", ["transportadora"])
        .order("nome_fantasia")
        .limit(200);
      if (error) throw error;
      return data ?? [];
    },
  });

  const valorDeclarado = () => {
    if (pedeData) return { data: dataFato };
    if (pedeTransportadora) return { transportadora_id: transportadoraId };
    if (pedeValorGenerico) return { valor: dataFato };
    return null;
  };

  const podeConfirmar =
    !!tipo &&
    !!motivo &&
    !!alvo &&
    observacao.trim().length >= 10 &&
    (!pedeData || !!dataFato) &&
    (!pedeTransportadora || !!transportadoraId) &&
    (!pedeValorGenerico || !!dataFato);

  const gravar = useMutation({
    mutationFn: async () => {
      if (!tipo || !motivo || !alvo) throw new Error("Formulário incompleto");
      const { error } = await supabase.from("declaracao_realidade").insert({
        entidade: tipo.entidade,
        entidade_id: alvo.entidade_id,
        id_externo: alvo.id_externo,
        tipo_codigo: tipo.codigo,
        motivo_codigo: motivo.codigo,
        valor_declarado: valorDeclarado(),
        observacao: observacao.trim(),
        declarado_por: userId,
        declarado_por_nome: nome,
      });
      if (error) {
        if (error.code === "23505" || /duplicat|unique/i.test(error.message ?? "")) {
          throw new Error(
            "Já existe uma declaração viva desse tipo para este alvo. Aposente a anterior antes de declarar de novo."
          );
        }
        throw error;
      }
    },
    onSuccess: () => {
      toast.success("Declaração registrada. As automações passam a ceder a ela.");
      setConfirmando(false);
      setTipoCodigo("");
      setMotivoCodigo("");
      setAlvo(null);
      setBusca("");
      setDataFato("");
      setTransportadoraId("");
      setObservacao("");
      onGravou();
    },
    onError: (e) => toast.error(formatError(e)),
  });

  const nomeTransportadora =
    transportadoras?.find((t) => t.id === transportadoraId)?.nome_fantasia ?? "";

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Nova declaração</CardTitle>
      </CardHeader>
      <CardContent className="space-y-5">
        {/* Tipo */}
        <div className="space-y-1">
          <Label>Tipo da declaração *</Label>
          <Select
            value={tipoCodigo}
            onValueChange={(v) => {
              setTipoCodigo(v);
              setAlvo(null);
              setBusca("");
              setDataFato("");
              setTransportadoraId("");
            }}
          >
            <SelectTrigger>
              <SelectValue placeholder="Escolha o que você está afirmando" />
            </SelectTrigger>
            <SelectContent>
              {tipos.map((t) => (
                <SelectItem key={t.codigo} value={t.codigo}>
                  {t.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {tipo && (
            <p className="text-xs text-muted-foreground">
              Você afirma que: <strong>{tipo.o_que_afirma}</strong>
            </p>
          )}
        </div>

        {/* Alvo */}
        {tipo && (
          <div className="space-y-1">
            <Label>
              {entidade === "pedido" ? "Pedido (busque pelo número)" : "Expedição XPM (busque pelo código)"} *
            </Label>
            {alvo ? (
              <div className="flex items-center justify-between gap-3 rounded-md border border-border/60 bg-muted/40 px-3 py-2">
                <div className="min-w-0">
                  <p className="truncate text-sm">{alvo.id_externo}</p>
                  <p className="truncate text-xs text-muted-foreground">{alvo.descricao}</p>
                </div>
                <Button variant="ghost" size="sm" onClick={() => setAlvo(null)}>
                  Trocar
                </Button>
              </div>
            ) : (
              <>
                <div className="relative">
                  <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                  <Input
                    className="pl-8"
                    value={busca}
                    onChange={(e) => setBusca(e.target.value)}
                    placeholder={entidade === "pedido" ? "Ex.: 12345" : "Ex.: EXP-0099"}
                  />
                </div>
                {busca.trim().length >= 2 && (
                  <div className="mt-1 max-h-52 overflow-y-auto rounded-md border border-border/60">
                    {isFetching ? (
                      <p className="p-3 text-xs text-muted-foreground">Buscando…</p>
                    ) : (resultados ?? []).length === 0 ? (
                      <p className="p-3 text-xs text-muted-foreground">Nada encontrado.</p>
                    ) : (
                      (resultados ?? []).map((r) => (
                        <button
                          key={r.entidade_id}
                          type="button"
                          onClick={() => setAlvo(r)}
                          className="flex w-full items-center justify-between gap-2 border-b border-border/40 px-3 py-2 text-left last:border-0 hover:bg-muted/50"
                        >
                          <span className="text-sm">{r.id_externo}</span>
                          <span className="truncate text-xs text-muted-foreground">
                            {r.descricao}
                          </span>
                        </button>
                      ))
                    )}
                  </div>
                )}
              </>
            )}
          </div>
        )}

        {/* Motivo */}
        {tipo && (
          <div className="space-y-1">
            <Label>Motivo *</Label>
            <Select value={motivoCodigo} onValueChange={setMotivoCodigo}>
              <SelectTrigger>
                <SelectValue placeholder="Por que o sistema não sabe disso sozinho?" />
              </SelectTrigger>
              <SelectContent>
                {motivos.map((m) => (
                  <SelectItem key={m.codigo} value={m.codigo}>
                    {m.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {motivo && (
              <p className="text-xs text-muted-foreground">{motivo.o_que_significa}</p>
            )}
          </div>
        )}

        {/* Valor declarado */}
        {tipo?.exige_valor && (
          <div className="space-y-1">
            {pedeTransportadora ? (
              <>
                <Label>Transportadora *</Label>
                <Select value={transportadoraId} onValueChange={setTransportadoraId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Escolha a transportadora" />
                  </SelectTrigger>
                  <SelectContent>
                    {(transportadoras ?? []).map((t) => (
                      <SelectItem key={t.id} value={t.id}>
                        {t.nome_fantasia ?? t.razao_social ?? t.id}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </>
            ) : pedeData ? (
              <>
                <Label>Data do fato *</Label>
                <Input
                  type="date"
                  value={dataFato}
                  max={hojeISO()}
                  onChange={(e) => setDataFato(e.target.value)}
                />
                <p className="text-xs text-muted-foreground">
                  Data em que o fato aconteceu de verdade — não a data de hoje.
                </p>
              </>
            ) : (
              <>
                <Label>Valor declarado *</Label>
                <Input value={dataFato} onChange={(e) => setDataFato(e.target.value)} />
              </>
            )}
          </div>
        )}

        {/* Observação */}
        {tipo && (
          <div className="space-y-1">
            <Label>Observação *</Label>
            <Textarea
              rows={3}
              value={observacao}
              onChange={(e) => setObservacao(e.target.value)}
              placeholder="Conte a história para quem ler daqui a seis meses: como você soube, quem informou, o que comprova."
            />
          </div>
        )}

        <div className="flex justify-end">
          <Button disabled={!podeConfirmar} onClick={() => setConfirmando(true)}>
            Revisar declaração
            <ArrowRight className="ml-2 h-4 w-4" />
          </Button>
        </div>
      </CardContent>

      {/* Confirmação */}
      <Dialog open={confirmando} onOpenChange={(o) => !o && setConfirmando(false)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Confirmar declaração</DialogTitle>
          </DialogHeader>
          <p className="text-sm">
            Você está declarando que <strong>{tipo?.o_que_afirma}</strong> para{" "}
            <strong>{alvo?.id_externo}</strong>, porque <strong>{motivo?.label}</strong>. Isso fará
            as automações do sistema cederem a essa afirmação até que ela seja aposentada.
          </p>
          {pedeData && dataFato && (
            <p className="text-xs text-muted-foreground">Data do fato: {fmtData(dataFato)}</p>
          )}
          {pedeTransportadora && nomeTransportadora && (
            <p className="text-xs text-muted-foreground">
              Transportadora: {nomeTransportadora}
            </p>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmando(false)}>
              Voltar e revisar
            </Button>
            <Button disabled={gravar.isPending} onClick={() => gravar.mutate()}>
              {gravar.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Declarar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
