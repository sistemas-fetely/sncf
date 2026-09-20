import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Ship, Plus, Trash2, Pencil, Check, AlertTriangle } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Selo, type EstadoSelo } from "@/components/ui/selo";
import { CardIndicador } from "@/components/ui/card-indicador";
import { EstadoVazio } from "@/components/ui/estado-vazio";
import { FilterInput } from "@/components/ui/filter-input";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";

/* ────────────────────────────── modelo ──────────────────────────────
 * importacao_embarque = o que CRUZA O OCEANO (REF D###/AA da Rocabella).
 * importacao_pedido   = o que se COMPRA da fabrica.
 * Relacao N:N por importacao_embarque_pedido; conteiner pendura no EMBARQUE.
 * Os campos ref_rocabella/etd/eta/porto/total_conteineres do PEDIDO sao
 * espelho mantido por trigger: esta aba nunca le nem escreve eles.
 * ------------------------------------------------------------------ */

const CHAVE_EMBARQUES = ["importacao-embarques"] as const;
const CHAVE_DIMENSOES = ["importacao-dimensoes"] as const;

interface DimStatus {
  id: number;
  codigo: string;
  descricao: string | null;
  ordem: number | null;
}
interface DimPorto {
  id: number;
  codigo: string;
  nome: string;
  uf: string | null;
}
interface DimTipo {
  id: number;
  codigo: string;
  descricao: string;
  cbm_nominal: number | null;
}
interface DimFabrica {
  id: number;
  codigo: string;
  nome: string | null;
}

interface ConteinerRow {
  id: number;
  embarque_id: number;
  tipo_id: number;
  quantidade: number;
  numero_conteiner: string | null;
  lacre: string | null;
  qtd_caixas: number | null;
  cbm: number | null;
  peso_liquido: number | null;
  peso_bruto: number | null;
  observacao: string | null;
}

interface PedidoVinculado {
  id: number;
  numero_pedido: string | null;
  fabrica_id: number | null;
  valor_fob_total: number | null;
  cbm_total: number | null;
}

interface VinculoRow {
  id: number;
  parcial: boolean;
  observacao: string | null;
  pedido: PedidoVinculado | null;
}

interface EmbarqueRow {
  id: number;
  ref_rocabella: string;
  status_id: number | null;
  etd: string | null;
  eta: string | null;
  eta_precisao: string;
  data_chegada: string | null;
  porto_chegada_id: number | null;
  numero_bl: string | null;
  armador: string | null;
  observacao: string | null;
  total_conteineres: number | null;
  conteineres: ConteinerRow[];
  vinculos: VinculoRow[];
}

/* ───────────────────────── formatacao ───────────────────────── */

function fmtData(v: string | null | undefined): string {
  if (!v) return "—";
  const [a, m, d] = v.slice(0, 10).split("-");
  if (!a || !m || !d) return "—";
  return `${d}/${m}/${a}`;
}

function fmtDataCurta(v: string | null | undefined): string {
  if (!v) return "—";
  const [, m, d] = v.slice(0, 10).split("-");
  return m && d ? `${d}/${m}` : "—";
}

const FMT_USD = new Intl.NumberFormat("pt-BR", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

function fmtUsd(v: number | null | undefined): string {
  if (v === null || v === undefined) return "—";
  return `USD ${FMT_USD.format(v)}`;
}

function fmtNum(v: number | null | undefined, casas = 2): string {
  if (v === null || v === undefined || v === 0) return "—";
  return v.toLocaleString("pt-BR", { minimumFractionDigits: 0, maximumFractionDigits: casas });
}

function hojeIso(): string {
  const d = new Date();
  const mes = String(d.getMonth() + 1).padStart(2, "0");
  const dia = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${mes}-${dia}`;
}

/** diferenca em dias entre a data e hoje, em fuso neutro (data pura). */
function diasAte(iso: string | null | undefined): number | null {
  if (!iso) return null;
  const alvo = Date.parse(`${iso.slice(0, 10)}T00:00:00Z`);
  const hoje = Date.parse(`${hojeIso()}T00:00:00Z`);
  if (Number.isNaN(alvo)) return null;
  return Math.round((alvo - hoje) / 86_400_000);
}

function relativo(iso: string | null | undefined): string | null {
  const d = diasAte(iso);
  if (d === null) return null;
  if (d === 0) return "hoje";
  if (d > 0) return d === 1 ? "amanhã" : `em ${d} dias`;
  const abs = Math.abs(d);
  return abs === 1 ? "há 1 dia" : `há ${abs} dias`;
}

/**
 * Tom do selo de status — APENAS apresentacao. A lista de status vem sempre de
 * importacao_status (filtros, edicao e rotulos). Status desconhecido cai em muted,
 * nunca deixa de aparecer.
 */
const TOM_STATUS: Record<string, EstadoSelo> = {
  "Pedido colocado": "muted",
  Embarcado: "info",
  "Aguardando IV": "warning",
  "Agendado p/ Entrega": "warning",
  Entregue: "success",
  "Entrega declarada completa": "success",
};

function tomDoStatus(codigo: string | undefined): EstadoSelo {
  return (codigo && TOM_STATUS[codigo]) || "muted";
}

/** Erro de escrita: policy hoje libera apenas super_admin. */
function mensagemErro(err: unknown): string {
  const e = err as { message?: string; code?: string; details?: string } | null;
  const msg = e?.message ?? "Erro desconhecido do banco";
  const negado =
    e?.code === "42501" ||
    /row-level security|permission denied|violates row-level/i.test(`${msg} ${e?.details ?? ""}`);
  if (negado) {
    return "Sem permissão para gravar embarque: hoje só super_admin escreve nesta área. Peça a liberação do acesso.";
  }
  return msg;
}

/* ───────────────────────── leitura ───────────────────────── */

const SELECT_EMBARQUE = `
  id, ref_rocabella, status_id, etd, eta, eta_precisao, data_chegada,
  porto_chegada_id, numero_bl, armador, observacao, total_conteineres,
  conteineres:importacao_conteiner (
    id, embarque_id, tipo_id, quantidade, numero_conteiner, lacre,
    qtd_caixas, cbm, peso_liquido, peso_bruto, observacao
  ),
  vinculos:importacao_embarque_pedido (
    id, parcial, observacao,
    pedido:importacao_pedido ( id, numero_pedido, fabrica_id, valor_fob_total, cbm_total )
  )
`;

function useDimensoes() {
  return useQuery({
    queryKey: CHAVE_DIMENSOES,
    queryFn: async () => {
      const [status, portos, tipos, fabricas] = await Promise.all([
        supabase.from("importacao_status").select("id, codigo, descricao, ordem").order("ordem"),
        supabase.from("importacao_porto").select("id, codigo, nome, uf").order("nome"),
        supabase
          .from("importacao_conteiner_tipo")
          .select("id, codigo, descricao, cbm_nominal")
          .order("codigo"),
        supabase.from("importacao_fabrica").select("id, codigo, nome").order("codigo"),
      ]);
      if (status.error) throw status.error;
      if (portos.error) throw portos.error;
      if (tipos.error) throw tipos.error;
      if (fabricas.error) throw fabricas.error;
      return {
        status: (status.data ?? []) as DimStatus[],
        portos: (portos.data ?? []) as DimPorto[],
        tipos: (tipos.data ?? []) as DimTipo[],
        fabricas: (fabricas.data ?? []) as DimFabrica[],
      };
    },
  });
}

function useEmbarques() {
  return useQuery({
    queryKey: CHAVE_EMBARQUES,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("importacao_embarque")
        .select(SELECT_EMBARQUE)
        .order("eta", { ascending: true, nullsFirst: false });
      if (error) throw error;
      return (data ?? []) as unknown as EmbarqueRow[];
    },
  });
}

/* ───────────────────────── celulas ───────────────────────── */

function resumoConteineres(cs: ConteinerRow[], tipos: DimTipo[]): string {
  if (cs.length === 0) return "sem contêiner declarado";
  const porTipo = new Map<number, number>();
  for (const c of cs) porTipo.set(c.tipo_id, (porTipo.get(c.tipo_id) ?? 0) + (c.quantidade ?? 0));
  const partes: string[] = [];
  for (const [tipoId, qtd] of porTipo) {
    const tipo = tipos.find((t) => t.id === tipoId);
    // Tipo indefinido aparece explicitamente: nunca inventar tamanho.
    partes.push(
      tipo && !ehTipoIndefinido(tipo.codigo)
        ? `${qtd}x${tipo.codigo}`
        : `${qtd}x (tipo não informado)`,
    );
  }
  return partes.join(" · ");
}

function ehTipoIndefinido(codigo: string | undefined): boolean {
  return (codigo ?? "").toUpperCase() === "IND";
}

/* ───────────────────────── painel de edicao ───────────────────────── */

interface FormConteiner {
  id: number | null;
  tipo_id: string;
  quantidade: string;
  numero_conteiner: string;
  lacre: string;
  qtd_caixas: string;
  cbm: string;
  peso_liquido: string;
  peso_bruto: string;
}

function conteinerParaForm(c: ConteinerRow): FormConteiner {
  return {
    id: c.id,
    tipo_id: String(c.tipo_id),
    quantidade: String(c.quantidade ?? 1),
    numero_conteiner: c.numero_conteiner ?? "",
    lacre: c.lacre ?? "",
    qtd_caixas: c.qtd_caixas === null || c.qtd_caixas === undefined ? "" : String(c.qtd_caixas),
    cbm: c.cbm === null || c.cbm === undefined ? "" : String(c.cbm),
    peso_liquido:
      c.peso_liquido === null || c.peso_liquido === undefined ? "" : String(c.peso_liquido),
    peso_bruto: c.peso_bruto === null || c.peso_bruto === undefined ? "" : String(c.peso_bruto),
  };
}

function numeroOuNulo(v: string): number | null {
  const t = v.trim();
  if (t === "") return null;
  const n = Number(t.replace(",", "."));
  return Number.isFinite(n) ? n : null;
}

function textoOuNulo(v: string): string | null {
  const t = v.trim();
  return t === "" ? null : t;
}

interface PainelProps {
  embarque: EmbarqueRow;
  tipos: DimTipo[];
  portos: DimPorto[];
  status: DimStatus[];
  aoFechar: () => void;
}

function PainelEdicao({ embarque, tipos, portos, status, aoFechar }: PainelProps) {
  const qc = useQueryClient();
  const [etd, setEtd] = useState(embarque.etd ?? "");
  const [eta, setEta] = useState(embarque.eta ?? "");
  const [etaPrecisao, setEtaPrecisao] = useState(embarque.eta_precisao || "dia");
  const [dataChegada, setDataChegada] = useState(embarque.data_chegada ?? "");
  const [portoId, setPortoId] = useState(
    embarque.porto_chegada_id ? String(embarque.porto_chegada_id) : "",
  );
  const [statusId, setStatusId] = useState(embarque.status_id ? String(embarque.status_id) : "");
  const [numeroBl, setNumeroBl] = useState(embarque.numero_bl ?? "");
  const [armador, setArmador] = useState(embarque.armador ?? "");
  const [observacao, setObservacao] = useState(embarque.observacao ?? "");

  const [emEdicao, setEmEdicao] = useState<FormConteiner | null>(null);

  const invalidar = async () => {
    await qc.invalidateQueries({ queryKey: CHAVE_EMBARQUES });
  };

  const salvarEmbarque = useMutation({
    mutationFn: async () => {
      const { error } = await supabase
        .from("importacao_embarque")
        .update({
          etd: textoOuNulo(etd),
          eta: textoOuNulo(eta),
          eta_precisao: etaPrecisao,
          data_chegada: textoOuNulo(dataChegada),
          porto_chegada_id: portoId === "" ? null : Number(portoId),
          status_id: statusId === "" ? null : Number(statusId),
          numero_bl: textoOuNulo(numeroBl),
          armador: textoOuNulo(armador),
          observacao: textoOuNulo(observacao),
        })
        .eq("id", embarque.id);
      if (error) throw error;
    },
    onSuccess: async () => {
      await invalidar();
      toast.success(`Embarque ${embarque.ref_rocabella} salvo`);
      aoFechar();
    },
    onError: (err) => toast.error(mensagemErro(err)),
  });

  const salvarConteiner = useMutation({
    mutationFn: async (form: FormConteiner) => {
      const quantidade = Number(form.quantidade);
      const numero = textoOuNulo(form.numero_conteiner);
      if (!form.tipo_id) throw new Error("Escolha o tipo do contêiner.");
      if (!Number.isFinite(quantidade) || quantidade < 1) {
        throw new Error("Quantidade tem de ser um número maior que zero.");
      }
      if (numero && quantidade !== 1) {
        throw new Error(
          "Com número de contêiner preenchido, a quantidade tem de ser 1: o número identifica uma unidade específica. Para vários contêineres sem número, deixe o número em branco.",
        );
      }
      const payload = {
        embarque_id: embarque.id,
        tipo_id: Number(form.tipo_id),
        quantidade,
        numero_conteiner: numero,
        lacre: textoOuNulo(form.lacre),
        qtd_caixas: numeroOuNulo(form.qtd_caixas),
        cbm: numeroOuNulo(form.cbm),
        peso_liquido: numeroOuNulo(form.peso_liquido),
        peso_bruto: numeroOuNulo(form.peso_bruto),
      };
      if (form.id === null) {
        const { error } = await supabase.from("importacao_conteiner").insert(payload);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from("importacao_conteiner")
          .update(payload)
          .eq("id", form.id);
        if (error) throw error;
      }
    },
    onSuccess: async () => {
      // total_conteineres e derivado por trigger: volta do banco na invalidacao.
      await invalidar();
      setEmEdicao(null);
      toast.success("Contêiner gravado");
    },
    onError: (err) => toast.error(mensagemErro(err)),
  });

  const removerConteiner = useMutation({
    mutationFn: async (id: number) => {
      const { error } = await supabase.from("importacao_conteiner").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: async () => {
      await invalidar();
      toast.success("Contêiner removido");
    },
    onError: (err) => toast.error(mensagemErro(err)),
  });

  const salvando = salvarEmbarque.isPending;

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1">
          <Label htmlFor="etd">ETD</Label>
          <Input id="etd" type="date" value={etd} onChange={(e) => setEtd(e.target.value)} />
        </div>
        <div className="space-y-1">
          <Label htmlFor="eta">ETA</Label>
          <Input id="eta" type="date" value={eta} onChange={(e) => setEta(e.target.value)} />
        </div>
        <div className="space-y-1">
          <Label>Precisão da ETA</Label>
          <Select value={etaPrecisao} onValueChange={setEtaPrecisao}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="dia">dia</SelectItem>
              <SelectItem value="semana">semana</SelectItem>
              <SelectItem value="mes">mês</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1">
          <Label htmlFor="chegada">Data de chegada</Label>
          <Input
            id="chegada"
            type="date"
            value={dataChegada}
            onChange={(e) => setDataChegada(e.target.value)}
          />
        </div>
        <div className="space-y-1">
          <Label>Porto de chegada</Label>
          <Select value={portoId} onValueChange={setPortoId}>
            <SelectTrigger>
              <SelectValue placeholder="Não informado" />
            </SelectTrigger>
            <SelectContent>
              {portos.map((p) => (
                <SelectItem key={p.id} value={String(p.id)}>
                  {p.nome}
                  {p.uf ? ` — ${p.uf}` : ""}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1">
          <Label>Status</Label>
          <Select value={statusId} onValueChange={setStatusId}>
            <SelectTrigger>
              <SelectValue placeholder="Não informado" />
            </SelectTrigger>
            <SelectContent>
              {status.map((s) => (
                <SelectItem key={s.id} value={String(s.id)}>
                  {s.codigo}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1">
          <Label htmlFor="bl">Nº do BL</Label>
          <Input id="bl" value={numeroBl} onChange={(e) => setNumeroBl(e.target.value)} />
        </div>
        <div className="space-y-1">
          <Label htmlFor="armador">Armador</Label>
          <Input id="armador" value={armador} onChange={(e) => setArmador(e.target.value)} />
        </div>
      </div>

      <div className="space-y-1">
        <Label htmlFor="obs">Observação</Label>
        <Textarea
          id="obs"
          value={observacao}
          onChange={(e) => setObservacao(e.target.value)}
          rows={3}
        />
      </div>

      <div className="flex justify-end">
        <Button onClick={() => salvarEmbarque.mutate()} disabled={salvando}>
          {salvando ? "Salvando…" : "Salvar embarque"}
        </Button>
      </div>

      {/* ── contêineres ── */}
      <div className="space-y-3 border-t pt-4">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-medium">Contêineres</p>
            <p className="text-xs text-muted-foreground">
              O total do embarque é calculado pelo banco a partir destas linhas.
            </p>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() =>
              setEmEdicao({
                id: null,
                tipo_id: "",
                quantidade: "1",
                numero_conteiner: "",
                lacre: "",
                qtd_caixas: "",
                cbm: "",
                peso_liquido: "",
                peso_bruto: "",
              })
            }
          >
            <Plus className="mr-1 h-4 w-4" /> Adicionar
          </Button>
        </div>

        {embarque.conteineres.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Nenhum contêiner declarado neste embarque.
          </p>
        ) : (
          <div className="space-y-1">
            {embarque.conteineres.map((c) => {
              const tipo = tipos.find((t) => t.id === c.tipo_id);
              return (
                <div
                  key={c.id}
                  className="flex items-center justify-between rounded-md border px-3 py-2 text-sm"
                >
                  <span>
                    {c.quantidade}x{" "}
                    {tipo ? (
                      ehTipoIndefinido(tipo.codigo) ? (
                        <span className="text-muted-foreground">(tipo não informado)</span>
                      ) : (
                        tipo.codigo
                      )
                    ) : (
                      <span className="text-muted-foreground">(tipo não informado)</span>
                    )}
                    {c.numero_conteiner ? (
                      <span className="ml-2 font-mono text-xs">{c.numero_conteiner}</span>
                    ) : null}
                  </span>
                  <span className="flex items-center gap-1">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setEmEdicao(conteinerParaForm(c))}
                    >
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      disabled={removerConteiner.isPending}
                      onClick={() => removerConteiner.mutate(c.id)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </span>
                </div>
              );
            })}
          </div>
        )}

        {emEdicao ? (
          <Card>
            <CardContent className="space-y-3 pt-4">
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label>Tipo</Label>
                  <Select
                    value={emEdicao.tipo_id}
                    onValueChange={(v) => setEmEdicao({ ...emEdicao, tipo_id: v })}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Escolha" />
                    </SelectTrigger>
                    <SelectContent>
                      {tipos.map((t) => (
                        <SelectItem key={t.id} value={String(t.id)}>
                          {t.codigo} — {t.descricao}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <Label>Quantidade</Label>
                  <Input
                    inputMode="numeric"
                    value={emEdicao.quantidade}
                    onChange={(e) => setEmEdicao({ ...emEdicao, quantidade: e.target.value })}
                  />
                </div>
                <div className="space-y-1">
                  <Label>Número do contêiner</Label>
                  <Input
                    value={emEdicao.numero_conteiner}
                    onChange={(e) =>
                      setEmEdicao({ ...emEdicao, numero_conteiner: e.target.value })
                    }
                  />
                </div>
                <div className="space-y-1">
                  <Label>Lacre</Label>
                  <Input
                    value={emEdicao.lacre}
                    onChange={(e) => setEmEdicao({ ...emEdicao, lacre: e.target.value })}
                  />
                </div>
                <div className="space-y-1">
                  <Label>Caixas</Label>
                  <Input
                    inputMode="numeric"
                    value={emEdicao.qtd_caixas}
                    onChange={(e) => setEmEdicao({ ...emEdicao, qtd_caixas: e.target.value })}
                  />
                </div>
                <div className="space-y-1">
                  <Label>CBM</Label>
                  <Input
                    inputMode="decimal"
                    value={emEdicao.cbm}
                    onChange={(e) => setEmEdicao({ ...emEdicao, cbm: e.target.value })}
                  />
                </div>
                <div className="space-y-1">
                  <Label>Peso líquido</Label>
                  <Input
                    inputMode="decimal"
                    value={emEdicao.peso_liquido}
                    onChange={(e) => setEmEdicao({ ...emEdicao, peso_liquido: e.target.value })}
                  />
                </div>
                <div className="space-y-1">
                  <Label>Peso bruto</Label>
                  <Input
                    inputMode="decimal"
                    value={emEdicao.peso_bruto}
                    onChange={(e) => setEmEdicao({ ...emEdicao, peso_bruto: e.target.value })}
                  />
                </div>
              </div>
              {emEdicao.numero_conteiner.trim() !== "" && emEdicao.quantidade.trim() !== "1" ? (
                <p className="text-xs text-warning">
                  Com número de contêiner preenchido, a quantidade tem de ser 1 — o número
                  identifica uma unidade específica.
                </p>
              ) : null}
              <div className="flex justify-end gap-2">
                <Button variant="ghost" size="sm" onClick={() => setEmEdicao(null)}>
                  Cancelar
                </Button>
                <Button
                  size="sm"
                  disabled={salvarConteiner.isPending}
                  onClick={() => salvarConteiner.mutate(emEdicao)}
                >
                  {salvarConteiner.isPending ? "Gravando…" : "Gravar contêiner"}
                </Button>
              </div>
            </CardContent>
          </Card>
        ) : null}
      </div>
    </div>
  );
}

/* ───────────────────────── aba ───────────────────────── */

export default function EmbarquesTab() {
  const qc = useQueryClient();
  const dimQ = useDimensoes();
  const embarquesQ = useEmbarques();

  const [busca, setBusca] = useState("");
  const [statusSel, setStatusSel] = useState<string[]>([]);
  const [portoSel, setPortoSel] = useState("todos");
  const [fabricaSel, setFabricaSel] = useState("todas");
  const [soTransito, setSoTransito] = useState(false);
  const [editando, setEditando] = useState<number | null>(null);

  const status = useMemo<DimStatus[]>(() => dimQ.data?.status ?? [], [dimQ.data]);
  const portos = useMemo<DimPorto[]>(() => dimQ.data?.portos ?? [], [dimQ.data]);
  const tipos = useMemo<DimTipo[]>(() => dimQ.data?.tipos ?? [], [dimQ.data]);
  const fabricas = useMemo<DimFabrica[]>(() => dimQ.data?.fabricas ?? [], [dimQ.data]);

  const statusPorId = useMemo(() => new Map(status.map((s) => [s.id, s])), [status]);
  const portoPorId = useMemo(() => new Map(portos.map((p) => [p.id, p])), [portos]);
  const fabricaPorId = useMemo(() => new Map(fabricas.map((f) => [f.id, f])), [fabricas]);

  const embarques = useMemo<EmbarqueRow[]>(() => embarquesQ.data ?? [], [embarquesQ.data]);

  const registrarChegada = useMutation({
    mutationFn: async (emb: EmbarqueRow) => {
      // "Entregue" vem da dimensao, nunca de id fixo no codigo.
      const entregue = status.find((s) => s.codigo === "Entregue");
      if (!entregue) {
        throw new Error(
          "Status de entrega não encontrado em importacao_status — não é possível registrar a chegada.",
        );
      }
      const { error } = await supabase
        .from("importacao_embarque")
        .update({ data_chegada: emb.data_chegada ?? hojeIso(), status_id: entregue.id })
        .eq("id", emb.id);
      if (error) throw error;
    },
    onSuccess: async (_d, emb) => {
      await qc.invalidateQueries({ queryKey: CHAVE_EMBARQUES });
      toast.success(`Chegada registrada para ${emb.ref_rocabella}`);
    },
    onError: (err) => toast.error(mensagemErro(err)),
  });

  const fobDoEmbarque = (e: EmbarqueRow): number | null => {
    const vals = e.vinculos
      .map((v) => v.pedido?.valor_fob_total)
      .filter((v): v is number => typeof v === "number");
    return vals.length === 0 ? null : vals.reduce((a, b) => a + b, 0);
  };

  const contDoEmbarque = (e: EmbarqueRow): number =>
    e.conteineres.reduce((a, c) => a + (c.quantidade ?? 0), 0);

  // ── resumo ──
  const resumo = useMemo(() => {
    const embarcado = status.find((s) => s.codigo === "Embarcado");
    const noMar = embarcado ? embarques.filter((e) => e.status_id === embarcado.id) : [];
    const conteineres = noMar.reduce((a, e) => a + contDoEmbarque(e), 0);
    const valor = noMar.reduce((a, e) => a + (fobDoEmbarque(e) ?? 0), 0);
    const proxima = embarques
      .filter((e) => !e.data_chegada && e.eta)
      .filter((e) => (diasAte(e.eta) ?? -1) >= 0)
      .sort((a, b) => (a.eta ?? "").localeCompare(b.eta ?? ""))[0];
    return { noMar, conteineres, valor, proxima };
  }, [embarques, status]);

  // ── filtro ──
  const filtrados = useMemo(() => {
    const termo = busca.trim().toLowerCase();
    const hoje = hojeIso();
    return embarques.filter((e) => {
      if (statusSel.length > 0 && !statusSel.includes(String(e.status_id))) return false;
      if (portoSel !== "todos" && String(e.porto_chegada_id) !== portoSel) return false;
      if (fabricaSel !== "todas") {
        const tem = e.vinculos.some((v) => String(v.pedido?.fabrica_id) === fabricaSel);
        if (!tem) return false;
      }
      if (soTransito) {
        if (e.data_chegada) return false;
        if (!e.eta || e.eta.slice(0, 10) < hoje) return false;
      }
      if (termo) {
        const alvo = [
          e.ref_rocabella,
          ...e.conteineres.flatMap((c) => [c.numero_conteiner ?? "", c.lacre ?? ""]),
          ...e.vinculos.map((v) => v.pedido?.numero_pedido ?? ""),
        ]
          .join(" ")
          .toLowerCase();
        if (!alvo.includes(termo)) return false;
      }
      return true;
    });
  }, [embarques, busca, statusSel, portoSel, fabricaSel, soTransito]);

  const ordenados = useMemo(
    () =>
      [...filtrados].sort((a, b) => {
        if (!a.eta && !b.eta) return a.ref_rocabella.localeCompare(b.ref_rocabella);
        if (!a.eta) return 1;
        if (!b.eta) return -1;
        return a.eta.localeCompare(b.eta);
      }),
    [filtrados],
  );

  const embarqueEmEdicao = embarques.find((e) => e.id === editando) ?? null;

  if (embarquesQ.isError || dimQ.isError) {
    const err = embarquesQ.error ?? dimQ.error;
    return (
      <Card>
        <CardContent className="space-y-3 pt-6">
          <p className="text-sm text-destructive">
            Não foi possível carregar os embarques: {mensagemErro(err)}
          </p>
          <Button
            variant="outline"
            onClick={() => {
              void embarquesQ.refetch();
              void dimQ.refetch();
            }}
          >
            Tentar de novo
          </Button>
        </CardContent>
      </Card>
    );
  }

  if (embarquesQ.isLoading || dimQ.isLoading) {
    return (
      <div className="space-y-3">
        <Skeleton className="h-20 w-full" />
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-24 w-full" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* faixa de resumo */}
      <div className="grid gap-3 sm:grid-cols-3">
        <CardIndicador
          rotulo="No mar"
          valor={resumo.noMar.length}
          nota={`${resumo.conteineres} contêiner(es) embarcado(s)`}
          compacto
        />
        <CardIndicador
          rotulo="Valor embarcado"
          valor={fmtUsd(resumo.valor)}
          nota="soma do FOB dos pedidos no mar"
          compacto
        />
        <CardIndicador
          rotulo="Próxima chegada"
          valor={
            resumo.proxima
              ? `${resumo.proxima.ref_rocabella} · ${fmtDataCurta(resumo.proxima.eta)}`
              : "—"
          }
          nota={resumo.proxima ? relativo(resumo.proxima.eta) : "nenhuma ETA futura em aberto"}
          compacto
        />
      </div>

      {/* filtros */}
      <div className="flex flex-wrap items-center gap-2">
        <FilterInput
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
          placeholder="REF, contêiner, lacre ou pedido"
          className="w-64"
        />
        <Select value={portoSel} onValueChange={setPortoSel}>
          <SelectTrigger className="w-48">
            <SelectValue placeholder="Porto" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="todos">Todos os portos</SelectItem>
            {portos.map((p) => (
              <SelectItem key={p.id} value={String(p.id)}>
                {p.nome}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={fabricaSel} onValueChange={setFabricaSel}>
          <SelectTrigger className="w-48">
            <SelectValue placeholder="Fábrica" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="todas">Todas as fábricas</SelectItem>
            {fabricas.map((f) => (
              <SelectItem key={f.id} value={String(f.id)}>
                {f.codigo}
                {f.nome ? ` — ${f.nome}` : ""}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <div className="flex items-center gap-2">
          <Switch id="transito" checked={soTransito} onCheckedChange={setSoTransito} />
          <Label htmlFor="transito" className="text-sm font-normal">
            Só em trânsito
          </Label>
        </div>
        <ToggleGroup
          type="multiple"
          value={statusSel}
          onValueChange={setStatusSel}
          className="flex-wrap justify-start"
        >
          {status.map((s) => (
            <ToggleGroupItem key={s.id} value={String(s.id)} size="sm" className="text-xs">
              {s.codigo}
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
      </div>

      <p className="text-xs text-muted-foreground">
        {ordenados.length} de {embarques.length} embarque(s)
      </p>

      {embarques.length === 0 ? (
        <EstadoVazio
          icone={Ship}
          titulo="Nenhum embarque registrado"
          mensagem="Quando a trading abrir um processo com REF D###/AA, ele aparece aqui com ETD, ETA e contêineres."
        />
      ) : ordenados.length === 0 ? (
        <EstadoVazio
          icone={Ship}
          mensagem="Nenhum embarque bate com este filtro. Limpe a busca ou solte o filtro de status."
        />
      ) : (
        <Accordion type="multiple" className="space-y-2">
          {ordenados.map((e) => {
            const st = e.status_id ? statusPorId.get(e.status_id) : undefined;
            const porto = e.porto_chegada_id ? portoPorId.get(e.porto_chegada_id) : undefined;
            const fob = fobDoEmbarque(e);
            const rel = relativo(e.eta);
            const cbmConteiner = e.conteineres.reduce((a, c) => a + (c.cbm ?? 0), 0);
            const cbmPedidos = e.vinculos.reduce((a, v) => a + (v.pedido?.cbm_total ?? 0), 0);
            const temAmbos = cbmConteiner > 0 && cbmPedidos > 0;
            const diferenca = Math.abs(cbmConteiner - cbmPedidos);

            return (
              <AccordionItem
                key={e.id}
                value={String(e.id)}
                className="rounded-lg border px-4 data-[state=open]:bg-muted/30"
              >
                <AccordionTrigger className="hover:no-underline">
                  <div className="flex w-full flex-col gap-2 pr-2 text-left">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-mono text-sm font-medium">{e.ref_rocabella}</span>
                      <Selo estado={tomDoStatus(st?.codigo)}>{st?.codigo ?? "sem status"}</Selo>
                      <span className="text-xs text-muted-foreground">
                        ETD {fmtData(e.etd)} · ETA {fmtData(e.eta)}
                      </span>
                      {e.data_chegada ? (
                        <span className="text-xs text-success">
                          chegou em {fmtDataCurta(e.data_chegada)}
                        </span>
                      ) : rel ? (
                        <span className="text-xs text-muted-foreground">{rel}</span>
                      ) : null}
                      {e.eta_precisao && e.eta_precisao !== "dia" ? (
                        <span className="text-xs text-muted-foreground">
                          ETA aproximada ({e.eta_precisao})
                        </span>
                      ) : null}
                    </div>
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                      <span>{porto ? porto.nome : "porto não informado"}</span>
                      {e.armador ? <span>{e.armador}</span> : null}
                      {e.numero_bl ? <span className="font-mono">BL {e.numero_bl}</span> : null}
                      <span>{resumoConteineres(e.conteineres, tipos)}</span>
                      <span className="tabular-nums">{fmtUsd(fob)}</span>
                    </div>
                    <div className="flex flex-wrap gap-1">
                      {e.vinculos.map((v) => {
                        const fab = v.pedido?.fabrica_id
                          ? fabricaPorId.get(v.pedido.fabrica_id)
                          : undefined;
                        return (
                          <span
                            key={v.id}
                            className={cn(
                              "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px]",
                              v.parcial && "border-warning/50",
                            )}
                          >
                            {v.pedido?.numero_pedido ?? "pedido removido"}
                            {fab ? (
                              <span className="text-muted-foreground">{fab.codigo}</span>
                            ) : null}
                            {v.parcial ? <span className="text-warning">parcial</span> : null}
                          </span>
                        );
                      })}
                    </div>
                  </div>
                </AccordionTrigger>

                <AccordionContent className="space-y-4 pb-4">
                  <div className="flex flex-wrap gap-2">
                    <Button variant="outline" size="sm" onClick={() => setEditando(e.id)}>
                      <Pencil className="mr-1 h-4 w-4" /> Editar
                    </Button>
                    {!e.data_chegada ? (
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={registrarChegada.isPending}
                        onClick={() => registrarChegada.mutate(e)}
                      >
                        <Check className="mr-1 h-4 w-4" /> Registrar chegada
                      </Button>
                    ) : null}
                  </div>

                  {e.conteineres.length === 0 ? (
                    <p className="text-sm text-muted-foreground">
                      Nenhum contêiner declarado neste embarque.
                    </p>
                  ) : (
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Número</TableHead>
                          <TableHead>Lacre</TableHead>
                          <TableHead>Tipo</TableHead>
                          <TableHead className="text-right">Qtd</TableHead>
                          <TableHead className="text-right">Caixas</TableHead>
                          <TableHead className="text-right">CBM</TableHead>
                          <TableHead className="text-right">Peso líq.</TableHead>
                          <TableHead className="text-right">Peso bruto</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {e.conteineres.map((c) => {
                          const tipo = tipos.find((t) => t.id === c.tipo_id);
                          return (
                            <TableRow key={c.id}>
                              <TableCell className="font-mono text-xs">
                                {c.numero_conteiner ?? "—"}
                              </TableCell>
                              <TableCell className="font-mono text-xs">
                                {c.lacre ?? "—"}
                              </TableCell>
                              <TableCell>
                                {!tipo || ehTipoIndefinido(tipo.codigo) ? (
                                  <span className="text-muted-foreground">
                                    tipo não informado
                                  </span>
                                ) : (
                                  tipo.codigo
                                )}
                              </TableCell>
                              <TableCell className="text-right tabular-nums">
                                {c.quantidade}
                              </TableCell>
                              <TableCell className="text-right tabular-nums">
                                {fmtNum(c.qtd_caixas, 0)}
                              </TableCell>
                              <TableCell className="text-right tabular-nums">
                                {fmtNum(c.cbm, 3)}
                              </TableCell>
                              <TableCell className="text-right tabular-nums">
                                {fmtNum(c.peso_liquido)}
                              </TableCell>
                              <TableCell className="text-right tabular-nums">
                                {fmtNum(c.peso_bruto)}
                              </TableCell>
                            </TableRow>
                          );
                        })}
                      </TableBody>
                    </Table>
                  )}

                  {/* conferencia de CBM: so fala quando os dois lados existem */}
                  {temAmbos ? (
                    diferenca > 0.5 ? (
                      <p className="flex items-center gap-1 text-xs text-warning">
                        <AlertTriangle className="h-3.5 w-3.5" />
                        CBM divergente: contêineres somam {fmtNum(cbmConteiner, 3)} m³ e os pedidos{" "}
                        {fmtNum(cbmPedidos, 3)} m³ (diferença de {fmtNum(diferenca, 3)} m³).
                      </p>
                    ) : (
                      <p className="flex items-center gap-1 text-xs text-muted-foreground">
                        <Check className="h-3.5 w-3.5" /> CBM confere com os pedidos (
                        {fmtNum(cbmConteiner, 3)} m³).
                      </p>
                    )
                  ) : null}

                  {e.observacao ? (
                    <p className="text-xs text-muted-foreground">Observação: {e.observacao}</p>
                  ) : null}
                  {e.vinculos
                    .filter((v) => v.observacao)
                    .map((v) => (
                      <p key={v.id} className="text-xs text-muted-foreground">
                        {v.pedido?.numero_pedido ?? "pedido"}: {v.observacao}
                      </p>
                    ))}
                </AccordionContent>
              </AccordionItem>
            );
          })}
        </Accordion>
      )}

      <Sheet
        open={embarqueEmEdicao !== null}
        onOpenChange={(aberto) => {
          if (!aberto) setEditando(null);
        }}
      >
        <SheetContent className="w-full overflow-y-auto sm:max-w-xl">
          {embarqueEmEdicao ? (
            <>
              <SheetHeader>
                <SheetTitle className="font-mono">{embarqueEmEdicao.ref_rocabella}</SheetTitle>
                <SheetDescription>
                  Dados do embarque e seus contêineres. O total de contêineres é derivado pelo
                  banco.
                </SheetDescription>
              </SheetHeader>
              <div className="mt-4">
                <PainelEdicao
                  embarque={embarqueEmEdicao}
                  tipos={tipos}
                  portos={portos}
                  status={status}
                  aoFechar={() => setEditando(null)}
                />
              </div>
            </>
          ) : null}
        </SheetContent>
      </Sheet>
    </div>
  );
}
