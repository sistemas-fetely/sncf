import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  Boxes,
  CreditCard,
  FileText,
  Headphones,
  LibraryBig,
  MonitorCog,
  Package,
  Pencil,
  PlusCircle,
  Receipt,
  Settings,
  Truck,
  Users,
  Wrench,
  type LucideIcon,
} from "lucide-react";

import { supabase } from "@/integrations/supabase/client";
import { formatError } from "@/lib/format-error";
import { cn } from "@/lib/utils";

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { EstadoVazio } from "@/components/ui/estado-vazio";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

import { PageShell } from "@/components/layout/PageShell";
import { PageHeader } from "@/components/layout/PageHeader";
import {
  PermissaoTelaProvider,
  usePermissaoTelaContext,
  AvisoSomenteLeitura,
} from "@/contexts/PermissaoTelaContext";

/**
 * Catálogo de Serviços — administração da árvore de dois níveis
 * FILA → SERVIÇO que a tela de abrir chamado consome.
 *
 * Vocabulário de tela: "Fila" (chamado_fila) e "Serviço" (demanda_assunto).
 * A cadeira dona aparece como "Área responsável".
 *
 * Escrita direto nas tabelas — a RLS decide (escrita só super_admin). Nada é
 * apagado: desligar é `ativo = false`.
 *
 * MODO-LEITURA-NAO-ESCONDE-DADO: sem `pode_editar` tudo continua visível; só
 * os botões de escrita desligam.
 */

/** Ícones oferecidos para uma fila. Mapa estático — `import *` mata o tree-shaking. */
export const ICONES_FILA: Record<string, LucideIcon> = {
  Package,
  Truck,
  CreditCard,
  FileText,
  MonitorCog,
  Receipt,
  Headphones,
  Users,
  Wrench,
  Boxes,
  Settings,
};

export function iconeDaFila(nome: string | null | undefined): LucideIcon {
  if (!nome) return LibraryBig;
  return ICONES_FILA[nome] ?? LibraryBig;
}

interface Fila {
  id: string;
  codigo: string;
  nome: string;
  descricao: string | null;
  icone: string | null;
  ordem: number;
  visivel_para: string;
  ativo: boolean;
}

interface CampoExtra {
  chave: string;
  rotulo: string;
  tipo: string;
}

interface Servico {
  id: string;
  codigo: string;
  nome: string;
  descricao: string | null;
  descricao_solicitante: string | null;
  cadeira_id: string;
  fila_id: string | null;
  camada_esperada: string;
  entidade_tipo_exigida: string | null;
  libera_refaturamento: boolean | null;
  campos_extras: CampoExtra[] | null;
  prazo_primeira_resposta_h: number;
  prazo_dias: number | null;
  visivel_para: string;
  ordem: number | null;
  ativo: boolean;
}

interface Departamento {
  id: string;
  nome: string;
}

const QK = {
  filas: ["chamado_fila", "catalogo"] as const,
  servicos: ["demanda_assunto", "catalogo"] as const,
  departamentos: ["departamentos", "catalogo-chamados"] as const,
};

const CAMADAS = ["C1", "C2", "C3"];
const VISIBILIDADES = [
  { valor: "interno", rotulo: "Interno" },
  { valor: "cliente", rotulo: "Cliente" },
  { valor: "todos", rotulo: "Todos" },
];
const ENTIDADES = [
  { valor: "nenhuma", rotulo: "Nenhuma" },
  { valor: "pedido", rotulo: "Pedido (obrigatório)" },
];

function ErroQuery({ o_que, erro, onTentar }: { o_que: string; erro: unknown; onTentar?: () => void }) {
  return (
    <Alert variant="destructive">
      <AlertDescription>
        Não foi possível carregar {o_que}: {formatError(erro)}
      </AlertDescription>
      {onTentar && (
        <Button variant="outline" size="sm" className="mt-3" onClick={onTentar}>
          Tentar de novo
        </Button>
      )}
    </Alert>
  );
}

export default function ChamadosCatalogo() {
  return (
    <PermissaoTelaProvider slug="tela.chamados_catalogo">
      <ChamadosCatalogoConteudo />
    </PermissaoTelaProvider>
  );
}

type FormFila = {
  id: string | null;
  codigo: string;
  nome: string;
  descricao: string;
  icone: string;
  ordem: string;
  visivel_para: string;
};

type FormServico = {
  id: string | null;
  codigo: string;
  nome: string;
  descricao: string;
  descricao_solicitante: string;
  cadeira_id: string;
  fila_id: string;
  camada_esperada: string;
  entidade_tipo_exigida: string;
  libera_refaturamento: boolean;
  prazo_primeira_resposta_h: string;
  prazo_dias: string;
  visivel_para: string;
  ordem: string;
  campos_extras: CampoExtra[];
};

const FILA_VAZIA: FormFila = {
  id: null,
  codigo: "",
  nome: "",
  descricao: "",
  icone: "Package",
  ordem: "0",
  visivel_para: "interno",
};

const SERVICO_VAZIO: FormServico = {
  id: null,
  codigo: "",
  nome: "",
  descricao: "",
  descricao_solicitante: "",
  cadeira_id: "",
  fila_id: "sem_fila",
  camada_esperada: "C1",
  entidade_tipo_exigida: "nenhuma",
  libera_refaturamento: false,
  prazo_primeira_resposta_h: "4",
  prazo_dias: "",
  visivel_para: "interno",
  ordem: "0",
  campos_extras: [],
};

function ChamadosCatalogoConteudo() {
  const qc = useQueryClient();
  const { podeEditar } = usePermissaoTelaContext();

  const [filaSel, setFilaSel] = useState<string | null>(null);
  const [dlgFila, setDlgFila] = useState<FormFila | null>(null);
  const [dlgServico, setDlgServico] = useState<FormServico | null>(null);
  const [salvando, setSalvando] = useState(false);

  const filas = useQuery({
    queryKey: QK.filas,
    queryFn: async (): Promise<Fila[]> => {
      const { data, error } = await supabase
        .from("chamado_fila")
        .select("*")
        .order("ordem", { ascending: true });
      if (error) throw error;
      return (data ?? []) as unknown as Fila[];
    },
  });

  const servicos = useQuery({
    queryKey: QK.servicos,
    queryFn: async (): Promise<Servico[]> => {
      const { data, error } = await supabase
        .from("demanda_assunto")
        .select(
          "id, codigo, nome, descricao, descricao_solicitante, cadeira_id, fila_id, camada_esperada, entidade_tipo_exigida, libera_refaturamento, campos_extras, prazo_primeira_resposta_h, prazo_dias, visivel_para, ordem, ativo",
        )
        .order("ordem", { ascending: true });
      if (error) throw error;
      return (data ?? []) as unknown as Servico[];
    },
  });

  const departamentos = useQuery({
    queryKey: QK.departamentos,
    queryFn: async (): Promise<Departamento[]> => {
      const { data, error } = await supabase
        .from("departamentos")
        .select("id, nome")
        .eq("ativo", true)
        .order("nome", { ascending: true });
      if (error) throw error;
      return (data ?? []) as unknown as Departamento[];
    },
  });

  const nomeCadeira = useMemo(() => {
    const m = new Map<string, string>();
    for (const d of departamentos.data ?? []) m.set(d.id, d.nome);
    return m;
  }, [departamentos.data]);

  const nomeFila = useMemo(() => {
    const m = new Map<string, string>();
    for (const f of filas.data ?? []) m.set(f.id, f.nome);
    return m;
  }, [filas.data]);

  const contagemAtivos = useMemo(() => {
    const m = new Map<string, number>();
    for (const s of servicos.data ?? []) {
      if (!s.ativo || !s.fila_id) continue;
      m.set(s.fila_id, (m.get(s.fila_id) ?? 0) + 1);
    }
    return m;
  }, [servicos.data]);

  const semFila = useMemo(
    () => (servicos.data ?? []).filter((s) => s.ativo && !s.fila_id),
    [servicos.data],
  );

  const daFila = useMemo(
    () => (servicos.data ?? []).filter((s) => s.fila_id === filaSel),
    [servicos.data, filaSel],
  );

  const filaAtual = (filas.data ?? []).find((f) => f.id === filaSel) ?? null;

  async function invalidar() {
    await Promise.all([
      qc.invalidateQueries({ queryKey: QK.filas }),
      qc.invalidateQueries({ queryKey: QK.servicos }),
      qc.invalidateQueries({ queryKey: ["catalogo-arvore-chamados"] }),
    ]);
  }

  async function alternarFila(f: Fila) {
    try {
      const { error } = await supabase
        .from("chamado_fila")
        .update({ ativo: !f.ativo })
        .eq("id", f.id);
      if (error) throw error;
      await invalidar();
      toast.success(`Fila ${f.nome} ${f.ativo ? "desativada" : "ativada"}.`);
    } catch (e) {
      console.error("[ChamadosCatalogo] alternar fila:", e);
      toast.error(formatError(e));
    }
  }

  async function alternarServico(s: Servico) {
    try {
      const { error } = await supabase
        .from("demanda_assunto")
        .update({ ativo: !s.ativo })
        .eq("id", s.id);
      if (error) throw error;
      await invalidar();
      toast.success(`Serviço ${s.nome} ${s.ativo ? "desativado" : "ativado"}.`);
    } catch (e) {
      console.error("[ChamadosCatalogo] alternar serviço:", e);
      toast.error(formatError(e));
    }
  }

  async function atribuirFila(s: Servico, fila_id: string) {
    try {
      const { error } = await supabase
        .from("demanda_assunto")
        .update({ fila_id })
        .eq("id", s.id);
      if (error) throw error;
      await invalidar();
      toast.success(`${s.nome} movido para ${nomeFila.get(fila_id) ?? "a fila"}.`);
    } catch (e) {
      console.error("[ChamadosCatalogo] atribuir fila:", e);
      toast.error(formatError(e));
    }
  }

  async function salvarFila() {
    if (!dlgFila) return;
    setSalvando(true);
    try {
      const payload = {
        codigo: dlgFila.codigo.trim(),
        nome: dlgFila.nome.trim(),
        descricao: dlgFila.descricao.trim() || null,
        icone: dlgFila.icone || null,
        ordem: Number(dlgFila.ordem) || 0,
        visivel_para: dlgFila.visivel_para,
      };
      if (dlgFila.id) {
        const { error } = await supabase.from("chamado_fila").update(payload).eq("id", dlgFila.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("chamado_fila").insert(payload);
        if (error) throw error;
      }
      await invalidar();
      toast.success("Fila salva.");
      setDlgFila(null);
    } catch (e) {
      console.error("[ChamadosCatalogo] salvar fila:", e);
      toast.error(formatError(e));
    } finally {
      setSalvando(false);
    }
  }

  async function salvarServico() {
    if (!dlgServico) return;
    setSalvando(true);
    try {
      const payload = {
        codigo: dlgServico.codigo.trim(),
        nome: dlgServico.nome.trim(),
        descricao: dlgServico.descricao.trim() || null,
        descricao_solicitante: dlgServico.descricao_solicitante.trim() || null,
        cadeira_id: dlgServico.cadeira_id,
        fila_id: dlgServico.fila_id === "sem_fila" ? null : dlgServico.fila_id,
        camada_esperada: dlgServico.camada_esperada,
        entidade_tipo_exigida:
          dlgServico.entidade_tipo_exigida === "nenhuma" ? null : dlgServico.entidade_tipo_exigida,
        libera_refaturamento: dlgServico.libera_refaturamento,
        prazo_primeira_resposta_h: Number(dlgServico.prazo_primeira_resposta_h) || 0,
        prazo_dias: dlgServico.prazo_dias.trim() === "" ? null : Number(dlgServico.prazo_dias),
        visivel_para: dlgServico.visivel_para,
        ordem: Number(dlgServico.ordem) || 0,
        campos_extras: dlgServico.campos_extras.filter(
          (c) => c.chave.trim() && c.rotulo.trim(),
        ) as unknown as never,
      };
      if (dlgServico.id) {
        const { error } = await supabase
          .from("demanda_assunto")
          .update(payload)
          .eq("id", dlgServico.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("demanda_assunto").insert(payload);
        if (error) throw error;
      }
      await invalidar();
      toast.success("Serviço salvo.");
      setDlgServico(null);
    } catch (e) {
      console.error("[ChamadosCatalogo] salvar serviço:", e);
      toast.error(formatError(e));
    } finally {
      setSalvando(false);
    }
  }

  function abrirNovaFila() {
    const proxima = Math.max(0, ...(filas.data ?? []).map((f) => f.ordem)) + 10;
    setDlgFila({ ...FILA_VAZIA, ordem: String(proxima) });
  }

  function abrirEditarFila(f: Fila) {
    setDlgFila({
      id: f.id,
      codigo: f.codigo,
      nome: f.nome,
      descricao: f.descricao ?? "",
      icone: f.icone ?? "Package",
      ordem: String(f.ordem),
      visivel_para: f.visivel_para,
    });
  }

  function abrirNovoServico() {
    setDlgServico({
      ...SERVICO_VAZIO,
      fila_id: filaSel ?? "sem_fila",
      cadeira_id: departamentos.data?.[0]?.id ?? "",
    });
  }

  function abrirEditarServico(s: Servico) {
    setDlgServico({
      id: s.id,
      codigo: s.codigo,
      nome: s.nome,
      descricao: s.descricao ?? "",
      descricao_solicitante: s.descricao_solicitante ?? "",
      cadeira_id: s.cadeira_id,
      fila_id: s.fila_id ?? "sem_fila",
      camada_esperada: s.camada_esperada,
      entidade_tipo_exigida: s.entidade_tipo_exigida ?? "nenhuma",
      libera_refaturamento: s.libera_refaturamento === true,
      prazo_primeira_resposta_h: String(s.prazo_primeira_resposta_h ?? 4),
      prazo_dias: s.prazo_dias == null ? "" : String(s.prazo_dias),
      visivel_para: s.visivel_para,
      ordem: String(s.ordem ?? 0),
      campos_extras: (s.campos_extras ?? []).map((c) => ({
        chave: c.chave ?? "",
        rotulo: c.rotulo ?? "",
        tipo: c.tipo ?? "texto",
      })),
    });
  }

  const filaInvalida = !dlgFila?.codigo.trim() || !dlgFila?.nome.trim();
  const servicoInvalido =
    !dlgServico?.codigo.trim() || !dlgServico?.nome.trim() || !dlgServico?.cadeira_id;

  const totalAtivos = (servicos.data ?? []).filter((s) => s.ativo).length;
  const filasAtivas = (filas.data ?? []).filter((f) => f.ativo).length;

  return (
    <PageShell>
      <PageHeader
        titulo="Catálogo de Serviços"
        icone={LibraryBig}
        breadcrumb={[{ label: "Chamados", to: "/chamados" }, { label: "Catálogo" }]}
        estado={
          filas.isLoading || servicos.isLoading
            ? "Carregando catálogo..."
            : `${filasAtivas} filas ativas · ${totalAtivos} serviços ativos`
        }
        acoes={
          <Button onClick={abrirNovaFila} disabled={!podeEditar}>
            <PlusCircle className="mr-2 h-4 w-4" />
            Nova fila
          </Button>
        }
      />

      {!podeEditar && <AvisoSomenteLeitura />}

      {filas.isError && (
        <ErroQuery o_que="as filas" erro={filas.error} onTentar={() => filas.refetch()} />
      )}
      {servicos.isError && (
        <ErroQuery o_que="os serviços" erro={servicos.error} onTentar={() => servicos.refetch()} />
      )}
      {departamentos.isError && (
        <ErroQuery
          o_que="as áreas responsáveis"
          erro={departamentos.error}
          onTentar={() => departamentos.refetch()}
        />
      )}

      <div className="grid gap-4 lg:grid-cols-[320px_minmax(0,1fr)]">
        {/* FILAS */}
        <div className="space-y-2">
          {filas.isLoading ? (
            Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-16 w-full" />)
          ) : (filas.data ?? []).length === 0 ? (
            <EstadoVazio
              icone={LibraryBig}
              titulo="Nenhuma fila cadastrada"
              mensagem="Crie a primeira fila para organizar os serviços."
            />
          ) : (
            (filas.data ?? []).map((f) => {
              const Icone = iconeDaFila(f.icone);
              const sel = filaSel === f.id;
              return (
                <div
                  key={f.id}
                  className={cn(
                    "rounded-md border p-3 transition-colors",
                    sel && "border-primary bg-primary/5 ring-1 ring-primary/40",
                    !f.ativo && "opacity-60",
                  )}
                >
                  <button
                    type="button"
                    onClick={() => setFilaSel(f.id)}
                    className="flex w-full items-start gap-2 text-left"
                  >
                    <Icone className="mt-0.5 h-4 w-4 shrink-0 text-gold" aria-hidden="true" />
                    <span className="min-w-0 flex-1">
                      <span className="flex flex-wrap items-center gap-2">
                        <span className="text-sm font-medium">{f.nome}</span>
                        <Badge variant="secondary">{contagemAtivos.get(f.id) ?? 0}</Badge>
                        {!f.ativo && <Badge variant="outline">inativa</Badge>}
                      </span>
                      {f.descricao && (
                        <span className="mt-0.5 block line-clamp-2 text-xs text-muted-foreground">
                          {f.descricao}
                        </span>
                      )}
                      <span className="mt-0.5 block text-[11px] text-muted-foreground">
                        {f.codigo} · ordem {f.ordem}
                      </span>
                    </span>
                  </button>
                  <div className="mt-2 flex items-center justify-between gap-2">
                    <Button
                      variant="ghost"
                      size="sm"
                      disabled={!podeEditar}
                      onClick={() => abrirEditarFila(f)}
                    >
                      <Pencil className="mr-1 h-3.5 w-3.5" />
                      Editar
                    </Button>
                    <div className="flex items-center gap-2">
                      <Label className="text-xs text-muted-foreground">Ativa</Label>
                      <Switch
                        checked={f.ativo}
                        disabled={!podeEditar}
                        onCheckedChange={() => alternarFila(f)}
                      />
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* SERVIÇOS */}
        <div className="space-y-4">
          <Card>
            <CardHeader className="flex flex-row items-start justify-between gap-3 space-y-0">
              <div className="space-y-1">
                <CardTitle className="text-base">
                  {filaAtual ? `Serviços de ${filaAtual.nome}` : "Serviços"}
                </CardTitle>
                <p className="text-sm text-muted-foreground">
                  {filaAtual
                    ? `${daFila.length} serviço(s) nesta fila`
                    : "Escolha uma fila à esquerda para ver seus serviços."}
                </p>
              </div>
              <Button size="sm" disabled={!podeEditar} onClick={abrirNovoServico}>
                <PlusCircle className="mr-2 h-4 w-4" />
                Novo serviço
              </Button>
            </CardHeader>
            <CardContent>
              {servicos.isLoading ? (
                <div className="space-y-2">
                  {Array.from({ length: 4 }).map((_, i) => (
                    <Skeleton key={i} className="h-14 w-full" />
                  ))}
                </div>
              ) : !filaAtual ? (
                <p className="text-sm text-muted-foreground">Nenhuma fila selecionada.</p>
              ) : daFila.length === 0 ? (
                <EstadoVazio
                  icone={LibraryBig}
                  titulo="Fila sem serviços"
                  mensagem="Crie o primeiro serviço desta fila."
                />
              ) : (
                <div className="space-y-2">
                  {daFila.map((s) => (
                    <LinhaServico
                      key={s.id}
                      servico={s}
                      cadeira={nomeCadeira.get(s.cadeira_id) ?? "—"}
                      podeEditar={podeEditar}
                      onEditar={() => abrirEditarServico(s)}
                      onAlternar={() => alternarServico(s)}
                    />
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          {/* SEM FILA */}
          {semFila.length > 0 && (
            <Card>
              <CardHeader className="space-y-1">
                <CardTitle className="text-base">Sem fila</CardTitle>
                <p className="text-sm text-muted-foreground">
                  {semFila.length} serviço(s) ativo(s) fora da árvore — atribua uma fila para que
                  apareçam ao abrir chamado.
                </p>
              </CardHeader>
              <CardContent className="space-y-2">
                {semFila.map((s) => (
                  <LinhaServico
                    key={s.id}
                    servico={s}
                    cadeira={nomeCadeira.get(s.cadeira_id) ?? "—"}
                    podeEditar={podeEditar}
                    onEditar={() => abrirEditarServico(s)}
                    onAlternar={() => alternarServico(s)}
                    atribuir={
                      <Select value="" onValueChange={(v) => atribuirFila(s, v)}>
                        <SelectTrigger className="h-8 w-[190px]" disabled={!podeEditar}>
                          <SelectValue placeholder="Atribuir fila" />
                        </SelectTrigger>
                        <SelectContent>
                          {(filas.data ?? []).map((f) => (
                            <SelectItem key={f.id} value={f.id}>
                              {f.nome}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    }
                  />
                ))}
              </CardContent>
            </Card>
          )}
        </div>
      </div>

      {/* DIÁLOGO — FILA */}
      <Dialog open={!!dlgFila} onOpenChange={(o) => !o && setDlgFila(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{dlgFila?.id ? "Editar fila" : "Nova fila"}</DialogTitle>
            <DialogDescription>
              A fila é o primeiro nível do catálogo — o que a pessoa escolhe antes do serviço.
            </DialogDescription>
          </DialogHeader>
          {dlgFila && (
            <div className="space-y-3">
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label htmlFor="fila-codigo">Código *</Label>
                  <Input
                    id="fila-codigo"
                    value={dlgFila.codigo}
                    onChange={(e) => setDlgFila({ ...dlgFila, codigo: e.target.value })}
                    placeholder="meu_pedido"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="fila-nome">Nome *</Label>
                  <Input
                    id="fila-nome"
                    value={dlgFila.nome}
                    onChange={(e) => setDlgFila({ ...dlgFila, nome: e.target.value })}
                    placeholder="Meu Pedido"
                  />
                </div>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="fila-descricao">Descrição</Label>
                <Textarea
                  id="fila-descricao"
                  rows={2}
                  value={dlgFila.descricao}
                  onChange={(e) => setDlgFila({ ...dlgFila, descricao: e.target.value })}
                />
              </div>
              <div className="grid gap-3 sm:grid-cols-3">
                <div className="space-y-1.5">
                  <Label>Ícone</Label>
                  <Select
                    value={dlgFila.icone}
                    onValueChange={(v) => setDlgFila({ ...dlgFila, icone: v })}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {Object.keys(ICONES_FILA).map((nome) => {
                        const Icone = ICONES_FILA[nome];
                        return (
                          <SelectItem key={nome} value={nome}>
                            <span className="flex items-center gap-2">
                              <Icone className="h-4 w-4" aria-hidden="true" />
                              {nome}
                            </span>
                          </SelectItem>
                        );
                      })}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="fila-ordem">Ordem</Label>
                  <Input
                    id="fila-ordem"
                    type="number"
                    value={dlgFila.ordem}
                    onChange={(e) => setDlgFila({ ...dlgFila, ordem: e.target.value })}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>Visível para</Label>
                  <Select
                    value={dlgFila.visivel_para}
                    onValueChange={(v) => setDlgFila({ ...dlgFila, visivel_para: v })}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {VISIBILIDADES.map((v) => (
                        <SelectItem key={v.valor} value={v.valor}>
                          {v.rotulo}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="ghost" onClick={() => setDlgFila(null)}>
              Cancelar
            </Button>
            <Button onClick={salvarFila} disabled={!podeEditar || filaInvalida || salvando}>
              {salvando ? "Salvando..." : "Salvar fila"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* DIÁLOGO — SERVIÇO */}
      <Dialog open={!!dlgServico} onOpenChange={(o) => !o && setDlgServico(null)}>
        <DialogContent className="max-h-[85vh] max-w-2xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{dlgServico?.id ? "Editar serviço" : "Novo serviço"}</DialogTitle>
            <DialogDescription>
              O serviço é o que a pessoa escolhe dentro da fila para abrir o chamado.
            </DialogDescription>
          </DialogHeader>
          {dlgServico && (
            <div className="space-y-3">
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label htmlFor="srv-codigo">Código *</Label>
                  <Input
                    id="srv-codigo"
                    value={dlgServico.codigo}
                    onChange={(e) => setDlgServico({ ...dlgServico, codigo: e.target.value })}
                    placeholder="pedido_atraso"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="srv-nome">Nome *</Label>
                  <Input
                    id="srv-nome"
                    value={dlgServico.nome}
                    onChange={(e) => setDlgServico({ ...dlgServico, nome: e.target.value })}
                  />
                </div>
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label>Fila</Label>
                  <Select
                    value={dlgServico.fila_id}
                    onValueChange={(v) => setDlgServico({ ...dlgServico, fila_id: v })}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="sem_fila">Sem fila</SelectItem>
                      {(filas.data ?? []).map((f) => (
                        <SelectItem key={f.id} value={f.id}>
                          {f.nome}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label>Área responsável *</Label>
                  <Select
                    value={dlgServico.cadeira_id}
                    onValueChange={(v) => setDlgServico({ ...dlgServico, cadeira_id: v })}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Escolha a área" />
                    </SelectTrigger>
                    <SelectContent>
                      {(departamentos.data ?? []).map((d) => (
                        <SelectItem key={d.id} value={d.id}>
                          {d.nome}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label htmlFor="srv-resposta">Primeira resposta (horas)</Label>
                  <Input
                    id="srv-resposta"
                    type="number"
                    value={dlgServico.prazo_primeira_resposta_h}
                    onChange={(e) =>
                      setDlgServico({ ...dlgServico, prazo_primeira_resposta_h: e.target.value })
                    }
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="srv-dias">Solução (dias úteis)</Label>
                  <Input
                    id="srv-dias"
                    type="number"
                    value={dlgServico.prazo_dias}
                    onChange={(e) => setDlgServico({ ...dlgServico, prazo_dias: e.target.value })}
                    placeholder="vazio = sem prazo"
                  />
                </div>
              </div>

              <div className="grid gap-3 sm:grid-cols-4">
                <div className="space-y-1.5">
                  <Label>Camada</Label>
                  <Select
                    value={dlgServico.camada_esperada}
                    onValueChange={(v) => setDlgServico({ ...dlgServico, camada_esperada: v })}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {CAMADAS.map((c) => (
                        <SelectItem key={c} value={c}>
                          {c}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label>Entidade exigida</Label>
                  <Select
                    value={dlgServico.entidade_tipo_exigida}
                    onValueChange={(v) =>
                      setDlgServico({ ...dlgServico, entidade_tipo_exigida: v })
                    }
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {ENTIDADES.map((e) => (
                        <SelectItem key={e.valor} value={e.valor}>
                          {e.rotulo}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label>Libera refaturamento</Label>
                  <div className="flex items-center gap-2 pt-1">
                    <Switch
                      checked={dlgServico.libera_refaturamento}
                      onCheckedChange={(v) =>
                        setDlgServico({ ...dlgServico, libera_refaturamento: v })
                      }
                    />
                    <span className="text-xs text-muted-foreground">
                      Chamado aberto deste serviço libera o botão de refaturar o pedido
                    </span>
                  </div>
                </div>
                <div className="space-y-1.5">
                  <Label>Visível para</Label>
                  <Select
                    value={dlgServico.visivel_para}
                    onValueChange={(v) => setDlgServico({ ...dlgServico, visivel_para: v })}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {VISIBILIDADES.map((v) => (
                        <SelectItem key={v.valor} value={v.valor}>
                          {v.rotulo}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="srv-ordem">Ordem</Label>
                  <Input
                    id="srv-ordem"
                    type="number"
                    value={dlgServico.ordem}
                    onChange={(e) => setDlgServico({ ...dlgServico, ordem: e.target.value })}
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="srv-descricao">Descrição interna</Label>
                <Textarea
                  id="srv-descricao"
                  rows={2}
                  value={dlgServico.descricao}
                  onChange={(e) => setDlgServico({ ...dlgServico, descricao: e.target.value })}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="srv-descricao-sol">Descrição para quem abre</Label>
                <Textarea
                  id="srv-descricao-sol"
                  rows={2}
                  value={dlgServico.descricao_solicitante}
                  onChange={(e) =>
                    setDlgServico({ ...dlgServico, descricao_solicitante: e.target.value })
                  }
                />
              </div>

              {/* CAMPOS EXTRAS */}
              <div className="space-y-2 rounded-md border border-border p-3">
                <div className="flex items-center justify-between gap-2">
                  <Label>Campos extras pedidos ao solicitante</Label>
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={!podeEditar}
                    onClick={() =>
                      setDlgServico({
                        ...dlgServico,
                        campos_extras: [
                          ...dlgServico.campos_extras,
                          { chave: "", rotulo: "", tipo: "texto" },
                        ],
                      })
                    }
                  >
                    <PlusCircle className="mr-1 h-3.5 w-3.5" />
                    Adicionar campo
                  </Button>
                </div>
                {dlgServico.campos_extras.length === 0 ? (
                  <p className="text-xs text-muted-foreground">Nenhum campo extra.</p>
                ) : (
                  dlgServico.campos_extras.map((c, idx) => (
                    <div key={idx} className="grid gap-2 sm:grid-cols-[1fr_1fr_120px_auto]">
                      <Input
                        value={c.chave}
                        placeholder="chave"
                        onChange={(e) => {
                          const lista = [...dlgServico.campos_extras];
                          lista[idx] = { ...c, chave: e.target.value };
                          setDlgServico({ ...dlgServico, campos_extras: lista });
                        }}
                      />
                      <Input
                        value={c.rotulo}
                        placeholder="Rótulo na tela"
                        onChange={(e) => {
                          const lista = [...dlgServico.campos_extras];
                          lista[idx] = { ...c, rotulo: e.target.value };
                          setDlgServico({ ...dlgServico, campos_extras: lista });
                        }}
                      />
                      <Input
                        value={c.tipo}
                        placeholder="texto"
                        onChange={(e) => {
                          const lista = [...dlgServico.campos_extras];
                          lista[idx] = { ...c, tipo: e.target.value };
                          setDlgServico({ ...dlgServico, campos_extras: lista });
                        }}
                      />
                      <Button
                        variant="ghost"
                        size="sm"
                        disabled={!podeEditar}
                        onClick={() =>
                          setDlgServico({
                            ...dlgServico,
                            campos_extras: dlgServico.campos_extras.filter((_, i) => i !== idx),
                          })
                        }
                      >
                        Remover
                      </Button>
                    </div>
                  ))
                )}
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="ghost" onClick={() => setDlgServico(null)}>
              Cancelar
            </Button>
            <Button onClick={salvarServico} disabled={!podeEditar || servicoInvalido || salvando}>
              {salvando ? "Salvando..." : "Salvar serviço"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </PageShell>
  );
}

function LinhaServico({
  servico,
  cadeira,
  podeEditar,
  onEditar,
  onAlternar,
  atribuir,
}: {
  servico: Servico;
  cadeira: string;
  podeEditar: boolean;
  onEditar: () => void;
  onAlternar: () => void;
  atribuir?: React.ReactNode;
}) {
  const detalhes = [
    cadeira,
    `resposta em ${servico.prazo_primeira_resposta_h}h`,
    servico.prazo_dias == null
      ? null
      : servico.prazo_dias === 0
        ? "solução no mesmo dia"
        : `solução em ${servico.prazo_dias} dia(s) úteis`,
    servico.entidade_tipo_exigida === "pedido" ? "exige pedido" : null,
    `visível para ${servico.visivel_para}`,
    `ordem ${servico.ordem ?? 0}`,
  ].filter(Boolean);

  return (
    <div
      className={cn(
        "flex flex-wrap items-center justify-between gap-3 rounded-md border p-3",
        !servico.ativo && "opacity-60",
      )}
    >
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <p className="text-sm font-medium">{servico.nome}</p>
          <Badge variant="outline">{servico.codigo}</Badge>
          {!servico.ativo && <Badge variant="outline">inativo</Badge>}
        </div>
        <p className="mt-1 text-[11px] text-muted-foreground">{detalhes.join(" · ")}</p>
      </div>
      <div className="flex shrink-0 items-center gap-2">
        {atribuir}
        <Button variant="ghost" size="sm" disabled={!podeEditar} onClick={onEditar}>
          <Pencil className="mr-1 h-3.5 w-3.5" />
          Editar
        </Button>
        <Switch checked={servico.ativo} disabled={!podeEditar} onCheckedChange={onAlternar} />
      </div>
    </div>
  );
}
