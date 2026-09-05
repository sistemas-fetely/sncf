// Atribuições e Carga — CATALOGO-DE-QUEM-RESPONDE
// Quem responde por qual trabalho, de onde vem o volume e quanto custa cada unidade.
//
// REGRA DURA: minutos_fluxo_dia e minutos_estoque NUNCA se somam.
//  - fluxo   = trabalho que entra por dia   → dimensiona equipe
//  - estoque = acumulado parado na fila     → dívida operacional
// Vínculo estrutural (fonte_volume, fila_id, recorrencia_id) NÃO se edita aqui:
// tem CHECK de coerência no banco.
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { AlertTriangle, Info, Loader2, Pencil, Users } from "lucide-react";

import { PageShell } from "@/components/layout/PageShell";
import { PageHeader } from "@/components/layout/PageHeader";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Selo } from "@/components/ui/selo";
import { Skeleton } from "@/components/ui/skeleton";
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

import { useAuth } from "@/contexts/AuthContext";
import { formatError } from "@/lib/format-error";
import { hojeISO } from "@/lib/data";

const QK = ["atribuicoes-carga"] as const;

interface LinhaCarga {
  atribuicao_id: string;
  chave: string;
  nome: string;
  fonte_volume: string;
  cargo_id: string | null;
  cargo_nome: string | null;
  departamento_id: string | null;
  departamento_nome: string | null;
  pessoa_id: string | null;
  pessoa_nome: string | null;
  gestor_nome: string | null;
  tempo_unitario_min: number | null;
  fluxo_diario_estimado: number | null;
  origem_medida: string | null;
  estoque_atual: number | null;
  minutos_fluxo_dia: number | null;
  minutos_estoque: number | null;
  furo_sem_dono: boolean | null;
  furo_dono_sem_acesso: boolean | null;
  furo_sem_numero: boolean | null;
  ativo: boolean | null;
}

interface FonteDim {
  codigo: string;
  nome: string;
  descricao: string | null;
  tem_estoque: boolean | null;
}

/**
 * Confronto entre o que o líder declarou e o piso que já se sabe que entra.
 * O piso é PISO: conta só o que entrou e ainda está pendente. Nunca é oferecido
 * como preenchimento automático — quem declara é o líder.
 */
interface FluxoConfronto {
  atribuicao_id: string;
  fluxo_declarado: number | null;
  fluxo_piso_medido: number | null;
  entradas_ainda_pendentes: number | null;
  dias_uteis: number | null;
  veredito: string | null;
}

interface FuroFila {
  fila_id: string;
  chave: string;
  nome: string;
  area: string | null;
  itens_parados: number | null;
}

function num(v: number | null | undefined, sufixo = "") {
  if (v == null) return "—";
  const n = Number(v);
  if (!Number.isFinite(n)) return "—";
  const txt = Number.isInteger(n) ? String(n) : n.toFixed(1);
  return sufixo ? `${txt} ${sufixo}` : txt;
}

/** Minutos → "2h 30min". Nunca soma fluxo com estoque. */
function minutos(v: number | null | undefined) {
  if (v == null) return "—";
  const n = Math.round(Number(v));
  if (!Number.isFinite(n)) return "—";
  if (n < 60) return `${n} min`;
  const h = Math.floor(n / 60);
  const m = n % 60;
  return m ? `${h}h ${m}min` : `${h}h`;
}

export default function AtribuicoesCarga() {
  const qc = useQueryClient();
  const { user } = useAuth();
  const [emEdicao, setEmEdicao] = useState<LinhaCarga | null>(null);

  const carga = useQuery({
    queryKey: [...QK, "lista"],
    queryFn: async (): Promise<LinhaCarga[]> => {
      const { data, error } = await (supabase as any)
        .from("vw_carga_atribuicao")
        .select("*")
        .order("departamento_nome", { ascending: true, nullsFirst: false })
        .order("nome", { ascending: true });
      if (error) throw error;
      return (data ?? []) as LinhaCarga[];
    },
  });

  const fontes = useQuery({
    queryKey: [...QK, "fontes"],
    staleTime: 5 * 60 * 1000,
    queryFn: async (): Promise<FonteDim[]> => {
      const { data, error } = await (supabase as any)
        .from("atribuicao_fonte_volume_dim")
        .select("codigo, nome, descricao, tem_estoque")
        .order("ordem");
      if (error) throw error;
      return (data ?? []) as FonteDim[];
    },
  });

  const confronto = useQuery({
    queryKey: [...QK, "fluxo-confronto"],
    queryFn: async (): Promise<FluxoConfronto[]> => {
      const { data, error } = await (supabase as any)
        .from("vw_atribuicao_fluxo_confronto")
        .select(
          "atribuicao_id, fluxo_declarado, fluxo_piso_medido, entradas_ainda_pendentes, dias_uteis, veredito",
        );
      if (error) throw error;
      return (data ?? []) as FluxoConfronto[];
    },
  });

  const filasSemDono = useQuery({
    queryKey: [...QK, "furo-fila"],
    queryFn: async (): Promise<FuroFila[]> => {
      const { data, error } = await (supabase as any)
        .from("vw_atribuicao_furo_fila")
        .select("fila_id, chave, nome, area, itens_parados")
        .order("itens_parados", { ascending: false });
      if (error) throw error;
      return (data ?? []) as FuroFila[];
    },
  });

  const fonteDe = (codigo: string) => fontes.data?.find((f) => f.codigo === codigo) ?? null;

  const confrontoDe = (atribuicaoId: string) =>
    confronto.data?.find((c) => c.atribuicao_id === atribuicaoId) ?? null;

  const grupos = useMemo(() => {
    const mapa = new Map<string, LinhaCarga[]>();
    for (const l of carga.data ?? []) {
      const k = l.departamento_nome ?? "Sem departamento";
      const atual = mapa.get(k) ?? [];
      atual.push(l);
      mapa.set(k, atual);
    }
    return [...mapa.entries()];
  }, [carga.data]);

  const totais = useMemo(() => {
    const linhas = carga.data ?? [];
    return {
      total: linhas.length,
      semDono: linhas.filter((l) => l.furo_sem_dono).length,
      semNumero: linhas.filter((l) => l.furo_sem_numero).length,
      semAcesso: linhas.filter((l) => l.furo_dono_sem_acesso).length,
    };
  }, [carga.data]);

  const itensParados = (filasSemDono.data ?? []).reduce(
    (s, f) => s + Number(f.itens_parados ?? 0),
    0,
  );

  return (
    <PageShell>
      <PageHeader
        titulo="Atribuições e Carga"
        icone={Users}
        estado={
          carga.isLoading
            ? "carregando"
            : `${totais.total} atribuições · ${totais.semDono} sem dono · ${totais.semNumero} sem número declarado`
        }
      />

      <p className="text-xs text-muted-foreground">
        Catálogo de quem responde por qual tipo de trabalho, de onde vem o volume e quanto custa
        cada unidade. As duas medidas de carga vivem separadas de propósito: <strong>Por dia</strong>{" "}
        é o trabalho que entra e dimensiona equipe; <strong>Acumulado na fila</strong> é a dívida
        operacional já parada. Elas nunca se somam.
      </p>

      {carga.isError && (
        <p className="text-sm text-destructive">{formatError(carga.error)}</p>
      )}

      {carga.isLoading && (
        <div className="space-y-2">
          <Skeleton className="h-8 w-64" />
          <Skeleton className="h-40 w-full" />
        </div>
      )}

      <TooltipProvider>
        {grupos.map(([departamento, linhas]) => (
          <Card key={departamento}>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">
                {departamento}{" "}
                <span className="font-normal text-muted-foreground">({linhas.length})</span>
              </CardTitle>
            </CardHeader>
            <CardContent className="px-0 pb-2">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Atribuição</TableHead>
                    <TableHead>Cargo</TableHead>
                    <TableHead>Responsável</TableHead>
                    <TableHead>Fonte de volume</TableHead>
                    <TableHead className="text-right">Tempo unitário</TableHead>
                    <TableHead className="text-right">Fluxo diário</TableHead>
                    <TableHead className="text-right">Carga por dia</TableHead>
                    <TableHead className="text-right">Acumulado na fila</TableHead>
                    <TableHead className="w-10" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {linhas.map((l) => {
                    const fonte = fonteDe(l.fonte_volume);
                    const conf = confrontoDe(l.atribuicao_id);
                    const abaixoDoPiso = conf?.veredito === "declarado ABAIXO do piso";
                    return (
                      <TableRow key={l.atribuicao_id} className={l.ativo === false ? "opacity-60" : ""}>
                        <TableCell className="align-top">
                          <div className="font-medium">{l.nome}</div>
                          <div className="text-[11px] text-muted-foreground">{l.chave}</div>
                          <div className="mt-1 flex flex-wrap gap-1">
                            {l.ativo === false && <Selo estado="muted">inativa</Selo>}
                            {l.furo_sem_dono && <Selo estado="destructive">sem dono</Selo>}
                            {l.furo_dono_sem_acesso && (
                              <Selo estado="warning">dono sem acesso</Selo>
                            )}
                            {l.furo_sem_numero && <Selo estado="warning">sem número</Selo>}
                            {abaixoDoPiso && (
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <span className="cursor-help">
                                    <Selo estado="warning">abaixo do piso</Selo>
                                  </span>
                                </TooltipTrigger>
                                <TooltipContent className="max-w-xs text-[11px]">
                                  O fluxo declarado ({num(conf?.fluxo_declarado)}/dia) é menor que o
                                  piso já medido ({num(conf?.fluxo_piso_medido)}/dia). A carga desta
                                  atribuição está subestimada.
                                </TooltipContent>
                              </Tooltip>
                            )}
                          </div>
                        </TableCell>
                        <TableCell className="align-top text-sm">{l.cargo_nome ?? "—"}</TableCell>
                        <TableCell className="align-top text-sm">
                          {l.pessoa_nome ?? <span className="text-muted-foreground">—</span>}
                          {l.gestor_nome && (
                            <div className="text-[11px] text-muted-foreground">
                              gestor: {l.gestor_nome}
                            </div>
                          )}
                        </TableCell>
                        <TableCell className="align-top text-sm">
                          <span className="inline-flex items-center gap-1">
                            {fonte?.nome ?? l.fonte_volume}
                            {fonte?.descricao && (
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <span className="cursor-help text-muted-foreground">
                                    <Info className="h-3 w-3" />
                                  </span>
                                </TooltipTrigger>
                                <TooltipContent className="max-w-xs text-[11px]">
                                  {fonte.descricao}
                                </TooltipContent>
                              </Tooltip>
                            )}
                          </span>
                          {fonte?.tem_estoque && (
                            <div className="text-[11px] text-muted-foreground">
                              estoque atual: {num(l.estoque_atual)} itens
                            </div>
                          )}
                        </TableCell>
                        <TableCell className="align-top text-right text-sm">
                          {num(l.tempo_unitario_min, "min")}
                          {l.origem_medida && (
                            <div className="text-[11px] text-muted-foreground">
                              {l.origem_medida}
                            </div>
                          )}
                        </TableCell>
                        <TableCell className="align-top text-right text-sm">
                          {num(l.fluxo_diario_estimado, "/dia")}
                        </TableCell>
                        <TableCell className="align-top text-right text-sm">
                          {minutos(l.minutos_fluxo_dia)}
                          <div className="text-[11px] text-muted-foreground">entra por dia</div>
                        </TableCell>
                        <TableCell className="align-top text-right text-sm">
                          {fonte?.tem_estoque ? (
                            <>
                              {minutos(l.minutos_estoque)}
                              <div className="text-[11px] text-muted-foreground">
                                dívida parada
                              </div>
                            </>
                          ) : (
                            <span className="text-muted-foreground">não acumula</span>
                          )}
                        </TableCell>
                        <TableCell className="align-top">
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7"
                            onClick={() => setEmEdicao(l)}
                            aria-label={`Editar ${l.nome}`}
                          >
                            <Pencil className="h-3.5 w-3.5" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        ))}
      </TooltipProvider>

      {/* Filas ativas que ninguém assumiu. Informação de gestão, não erro. */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2 text-sm">
            <AlertTriangle className="h-4 w-4 text-warning" />
            Trabalho sem dono declarado
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          <p className="text-xs text-muted-foreground">
            Filas vivas que nenhuma atribuição assumiu ainda.
            {filasSemDono.data && filasSemDono.data.length > 0 && (
              <>
                {" "}
                {filasSemDono.data.length} filas · {itensParados} itens parados.
              </>
            )}
          </p>
          {filasSemDono.isLoading && <Skeleton className="h-20 w-full" />}
          {filasSemDono.isError && (
            <p className="text-sm text-destructive">{formatError(filasSemDono.error)}</p>
          )}
          {filasSemDono.data && filasSemDono.data.length === 0 && (
            <p className="text-xs text-muted-foreground">Toda fila viva tem dono declarado.</p>
          )}
          {filasSemDono.data && filasSemDono.data.length > 0 && (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Fila</TableHead>
                  <TableHead>Área</TableHead>
                  <TableHead className="text-right">Itens parados</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filasSemDono.data.map((f) => (
                  <TableRow key={f.fila_id}>
                    <TableCell>
                      <div className="text-sm">{f.nome}</div>
                      <div className="text-[11px] text-muted-foreground">{f.chave}</div>
                    </TableCell>
                    <TableCell className="text-sm">{f.area ?? "—"}</TableCell>
                    <TableCell className="text-right text-sm">{num(f.itens_parados)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {emEdicao && (
        <DialogEdicao
          linha={emEdicao}
          fonte={fonteDe(emEdicao.fonte_volume)}
          confronto={confrontoDe(emEdicao.atribuicao_id)}
          userId={user?.id ?? null}
          onFechar={() => setEmEdicao(null)}
          onSalvo={() => {
            setEmEdicao(null);
            qc.invalidateQueries({ queryKey: QK });
          }}
        />
      )}
    </PageShell>
  );
}

/* ---------------------------------------------------------------- edição */

interface OpcaoCargo {
  id: string;
  nome: string;
}
interface OpcaoPessoa {
  pessoa_id: string;
  nome: string;
  cargo: string | null;
  tem_login: boolean;
}

const SEM = "__sem__";

function DialogEdicao({
  linha,
  fonte,
  confronto,
  userId,
  onFechar,
  onSalvo,
}: {
  linha: LinhaCarga;
  fonte: FonteDim | null;
  confronto: FluxoConfronto | null;
  userId: string | null;
  onFechar: () => void;
  onSalvo: () => void;
}) {
  const [cargoId, setCargoId] = useState<string>(linha.cargo_id ?? SEM);
  const [pessoaId, setPessoaId] = useState<string>(linha.pessoa_id ?? SEM);
  const [tempo, setTempo] = useState<string>(
    linha.tempo_unitario_min == null ? "" : String(linha.tempo_unitario_min),
  );
  const [fluxo, setFluxo] = useState<string>(
    linha.fluxo_diario_estimado == null ? "" : String(linha.fluxo_diario_estimado),
  );
  const [ativo, setAtivo] = useState<boolean>(linha.ativo !== false);

  const cargos = useQuery({
    queryKey: [...QK, "cargos"],
    staleTime: 5 * 60 * 1000,
    queryFn: async (): Promise<OpcaoCargo[]> => {
      const { data, error } = await (supabase as any)
        .from("cargos")
        .select("id, nome")
        .eq("ativo", true)
        .order("nome");
      if (error) throw error;
      return (data ?? []) as OpcaoCargo[];
    },
  });

  const pessoas = useQuery({
    queryKey: [...QK, "pessoas"],
    staleTime: 5 * 60 * 1000,
    queryFn: async (): Promise<OpcaoPessoa[]> => {
      const { data, error } = await (supabase as any)
        .from("vw_gestao_pessoa")
        .select("pessoa_id, nome, cargo, tem_login, tipo_vinculo")
        .order("nome");
      if (error) throw error;
      return (data ?? [])
        .filter((p: any) => p.pessoa_id && p.nome)
        .map((p: any) => ({
          pessoa_id: p.pessoa_id as string,
          nome: p.nome as string,
          cargo: p.cargo ?? null,
          tem_login: !!p.tem_login,
        })) as OpcaoPessoa[];
    },
  });

  const salvar = useMutation({
    mutationFn: async () => {
      const tempoNum = tempo.trim() === "" ? null : Number(tempo.replace(",", "."));
      const fluxoNum = fluxo.trim() === "" ? null : Number(fluxo.replace(",", "."));
      if (tempoNum != null && (!Number.isFinite(tempoNum) || tempoNum < 0)) {
        throw new Error("Tempo unitário inválido.");
      }
      if (fluxoNum != null && (!Number.isFinite(fluxoNum) || fluxoNum < 0)) {
        throw new Error("Fluxo diário inválido.");
      }
      if (tempoNum != null && !userId) {
        throw new Error("Sem usuário logado: o banco exige autor da declaração do tempo.");
      }

      // 1) O catálogo. Tempo declarado exige autor e data — há CHECK no banco.
      const patch: Record<string, unknown> = {
        cargo_id: cargoId === SEM ? null : cargoId,
        tempo_unitario_min: tempoNum,
        fluxo_diario_estimado: fluxoNum,
        ativo,
      };
      if (tempoNum != null) {
        patch.origem_medida = "declarado";
        patch.declarado_por = userId;
        patch.declarado_em = new Date().toISOString();
      }
      const { error: erroCat } = await (supabase as any)
        .from("atribuicao_catalogo")
        .update(patch)
        .eq("id", linha.atribuicao_id);
      if (erroCat) throw erroCat;

      // 2) Responsável principal. Índice único impede duas principais vivas:
      //    encerra a anterior ANTES de inserir a nova.
      const novoDono = pessoaId === SEM ? null : pessoaId;
      if (novoDono !== (linha.pessoa_id ?? null)) {
        const hoje = hojeISO();
        const { data: vivas, error: erroBusca } = await (supabase as any)
          .from("atribuicao_pessoa")
          .select("id, pessoa_id")
          .eq("atribuicao_id", linha.atribuicao_id)
          .eq("principal", true)
          .is("ate", null);
        if (erroBusca) throw erroBusca;

        for (const v of (vivas ?? []) as { id: string }[]) {
          const { error: erroFim } = await (supabase as any)
            .from("atribuicao_pessoa")
            .update({ ate: hoje })
            .eq("id", v.id);
          if (erroFim) throw erroFim;
        }

        if (novoDono) {
          const { error: erroIns } = await (supabase as any)
            .from("atribuicao_pessoa")
            .insert({
              atribuicao_id: linha.atribuicao_id,
              pessoa_id: novoDono,
              principal: true,
              desde: hoje,
            });
          if (erroIns) throw erroIns;
        }
      }
    },
    onSuccess: () => {
      toast.success("Atribuição atualizada.");
      onSalvo();
    },
    onError: (e) => {
      toast.error("Não salvou", { description: formatError(e) });
    },
  });

  return (
    <Dialog open onOpenChange={(o) => !o && !salvar.isPending && onFechar()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{linha.nome}</DialogTitle>
          <DialogDescription>
            {fonte?.nome ?? linha.fonte_volume} — {fonte?.descricao ?? "sem descrição da fonte"}
            <br />
            A fonte de volume e o vínculo de fila ou recorrência não se editam aqui: são estrutura,
            com regra de coerência no banco.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label>Cargo</Label>
            <Select value={cargoId} onValueChange={setCargoId}>
              <SelectTrigger>
                <SelectValue placeholder="Selecione" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={SEM}>Sem cargo</SelectItem>
                {(cargos.data ?? []).map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.nome}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label>Responsável principal</Label>
            <Select value={pessoaId} onValueChange={setPessoaId}>
              <SelectTrigger>
                <SelectValue placeholder="Selecione" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={SEM}>Sem responsável</SelectItem>
                {(pessoas.data ?? []).map((p) => (
                  <SelectItem key={p.pessoa_id} value={p.pessoa_id}>
                    {p.nome}
                    {p.cargo ? ` · ${p.cargo}` : ""}
                    {p.tem_login ? "" : " · sem acesso"}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-[11px] text-muted-foreground">
              Trocar o responsável encerra hoje o vínculo anterior e abre o novo.
            </p>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label>Tempo unitário (minutos)</Label>
              <Input
                inputMode="decimal"
                value={tempo}
                onChange={(e) => setTempo(e.target.value)}
                placeholder="ex.: 8"
              />
              <p className="text-[11px] text-muted-foreground">
                Ao salvar, fica registrado como declarado por você, com data.
              </p>
            </div>
            <div className="space-y-1.5">
              <Label>Fluxo diário estimado</Label>
              <Input
                inputMode="decimal"
                value={fluxo}
                onChange={(e) => setFluxo(e.target.value)}
                placeholder="ex.: 12"
              />
              <p className="text-[11px] text-muted-foreground">
                Unidades que entram por dia — não é o acumulado da fila.
              </p>
              {confronto?.fluxo_piso_medido != null && (
                <p className="text-[11px] text-muted-foreground">
                  Piso medido: {num(confronto.fluxo_piso_medido)}/dia. Conta só o que entrou e ainda
                  está pendente, então subestima o fluxo real — use como piso, não como resposta.
                </p>
              )}
            </div>
          </div>

          <div className="flex items-center justify-between rounded-md border border-border/60 p-3">
            <div>
              <p className="text-sm">Atribuição ativa</p>
              <p className="text-[11px] text-muted-foreground">
                Inativa sai das contas de carga.
              </p>
            </div>
            <Switch checked={ativo} onCheckedChange={setAtivo} />
          </div>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={onFechar} disabled={salvar.isPending}>
            Cancelar
          </Button>
          <Button onClick={() => salvar.mutate()} disabled={salvar.isPending}>
            {salvar.isPending && <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />}
            Salvar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
