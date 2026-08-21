import { useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { ArrowLeft, CheckCircle2, Gavel, ListPlus, Lock, Plus, ShieldAlert, Trash2 } from "lucide-react";
import { PageShell } from "@/components/layout/PageShell";
import { PageTitle } from "@/components/layout/PageTitle";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
// IDENTIDADE-DA-GESTAO-E-PESSOA_ID (20/08/2026): membros/participantes usam pessoa_id
// (pessoas.id) — nomes resolvem por vw_gestao_pessoa, nunca por v_pessoas_sistema.
import { useNomeDaPessoa, usePessoasGestao } from "@/hooks/gestao/usePessoasGestao";
import { PainelMembrosSala } from "@/components/gestao/PainelMembrosSala";
import { PainelEscopoSala } from "@/components/gestao/PainelEscopoSala";
import { useProjetos } from "@/hooks/tarefas/useTarefasCatalogos";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  useEhFacilitador, useEscopoDaSala, useMembrosDaSala, useSala, useSalasCiclo,
} from "@/hooks/gestao/useGestaoSalas";
import {
  SAUDE_ROTULO, useAta, useAtaCabecalho, useAtualizarItemReuniao, useFecharReuniao,
  useItensReuniao, useMarcarPresenca, useParticipantes, usePauta, useRemoverItemReuniao,
  useReunioesDaSala, useTrazerItemParaReuniao, type ItemTipo, type LinhaPauta,
} from "@/hooks/gestao/useReuniao";
import { useRegistrarDecisao } from "@/hooks/gestao/useDecisoes";
import { useRegistrarRisco } from "@/hooks/gestao/useRiscos";
import { KEY_GESTAO } from "@/hooks/gestao/useGestaoSalas";

const SEM_PROJETO = "__sem__";

function dataBR(iso: string | null | undefined) {
  if (!iso) return "—";
  return iso.slice(0, 10).split("-").reverse().join("/");
}

/** Tarefa criada na reunião mora na tabela de tarefas normal, ligada ao projeto. */
function useCriarTarefaDaReuniao() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      titulo,
      projetoId,
      responsavelId,
      dataLimite,
    }: {
      titulo: string;
      projetoId: string | null;
      responsavelId: string | null;
      dataLimite: string | null;
    }): Promise<string> => {
      const { data: auth } = await supabase.auth.getUser();
      const uid = auth.user?.id ?? null;
      const { data, error } = await supabase
        .from("tarefas")
        .insert({
          titulo,
          projeto_id: projetoId,
          responsavel_id: responsavelId ?? uid,
          criado_por: uid,
          status: "pendente",
          prioridade: "media",
          data_limite: dataLimite,
          visibilidade: "publica",
        })
        .select("id")
        .single();
      if (error) throw error;
      return data.id;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: KEY_GESTAO });
      qc.invalidateQueries({ queryKey: ["tarefas"] });
      toast.success("Tarefa criada");
    },
    onError: (e: Error) => toast.error(`Não foi possível criar a tarefa: ${e.message}`),
  });
}

export default function SalaDetalhe() {
  const { salaId = null } = useParams();
  const navigate = useNavigate();

  const { data: sala } = useSala(salaId);
  const { data: ciclos } = useSalasCiclo();
  const { data: membros } = useMembrosDaSala(salaId);
  const { data: escopo } = useEscopoDaSala(salaId);
  const { data: ehFacilitador } = useEhFacilitador(salaId);
  const { data: reunioes } = useReunioesDaSala(salaId);
  const { data: projetos } = useProjetos();
  const nomePessoa = useNomeDaPessoa();
  const { data: pessoasGestao } = usePessoasGestao();

  const ciclo = (ciclos ?? []).find((c) => c.sala_id === salaId) ?? null;
  const reuniaoAberta = (reunioes ?? []).find((r) => r.status === "aberta") ?? null;
  const ultimaFechada = (reunioes ?? []).find((r) => r.status === "fechada") ?? null;
  // HISTORICO-DE-ATA-E-NAVEGAVEL (20/08/2026): padrão = reunião aberta, senão a última fechada.
  const [reuniaoEscolhidaId, setReuniaoEscolhidaId] = useState<string | null>(null);
  const padrao = reuniaoAberta ?? ultimaFechada;
  const reuniao =
    (reuniaoEscolhidaId && (reunioes ?? []).find((r) => r.id === reuniaoEscolhidaId)) || padrao;
  const fechada = !!reuniao && reuniao.status === "fechada";
  const reuniaoId = reuniao?.id ?? null;


  const { data: pauta } = usePauta(salaId);
  const { data: participantes } = useParticipantes(reuniaoId);
  const { data: itens } = useItensReuniao(fechada ? null : reuniaoId);
  const { data: ataCabecalho } = useAtaCabecalho(fechada ? reuniaoId : null);
  const { data: ata } = useAta(fechada ? reuniaoId : null);

  const trazer = useTrazerItemParaReuniao();
  const atualizarItem = useAtualizarItemReuniao();
  const removerItem = useRemoverItemReuniao();
  const marcarPresenca = useMarcarPresenca();
  const fechar = useFecharReuniao();
  const registrarDecisao = useRegistrarDecisao();
  const registrarRisco = useRegistrarRisco();
  const criarTarefa = useCriarTarefaDaReuniao();

  const [confirmarFechar, setConfirmarFechar] = useState(false);
  const [dialogo, setDialogo] = useState<null | "decisao" | "risco" | "tarefa">(null);

  // decisão
  const [dTitulo, setDTitulo] = useState("");
  const [dContexto, setDContexto] = useState("");
  const [dDecisao, setDDecisao] = useState("");
  const [dProjeto, setDProjeto] = useState(SEM_PROJETO);
  const [dReversivel, setDReversivel] = useState(true);
  // risco
  const [rTitulo, setRTitulo] = useState("");
  const [rDescricao, setRDescricao] = useState("");
  const [rProjeto, setRProjeto] = useState(SEM_PROJETO);
  const [rProb, setRProb] = useState("2");
  const [rImpacto, setRImpacto] = useState("2");
  const [rMitigacao, setRMitigacao] = useState("");
  // tarefa
  const [tTitulo, setTTitulo] = useState("");
  const [tProjeto, setTProjeto] = useState(SEM_PROJETO);
  const [tResponsavel, setTResponsavel] = useState(SEM_PROJETO);
  const [tPrazo, setTPrazo] = useState("");

  const projetosDoEscopo = useMemo(() => {
    const ids = new Set(escopo ?? []);
    const lista = (projetos ?? []).filter((p) => ids.has(p.id));
    return lista.length > 0 ? lista : (projetos ?? []);
  }, [escopo, projetos]);

  const jaNaReuniao = useMemo(() => {
    const s = new Set<string>();
    (itens ?? []).forEach((i) => {
      [i.projeto_id, i.decisao_id, i.risco_id, i.tarefa_id].forEach((v) => v && s.add(v));
    });
    return s;
  }, [itens]);

  const grupos = useMemo(() => {
    const m = new Map<string, { ordem: number; linhas: LinhaPauta[] }>();
    (pauta ?? []).forEach((l) => {
      const chave = l.categoria ?? "Sem categoria";
      const g = m.get(chave) ?? { ordem: l.ordem_grupo ?? 999, linhas: [] };
      g.linhas.push(l);
      m.set(chave, g);
    });
    return [...m.entries()].sort((a, b) => a[1].ordem - b[1].ordem);
  }, [pauta]);

  const nomeProjeto = (id: string | null) =>
    (id && (projetos ?? []).find((p) => p.id === id)?.nome) || "Projeto";

  if (!salaId) return null;

  return (
    <PageShell>
      <PageTitle
        titulo={sala?.nome ?? "Sala"}
        estado={
          reuniao ? (
            <>
              Reunião #{reuniao.numero} · {dataBR(reuniao.data)} ·{" "}
              {fechada ? "fechada (modo leitura)" : "aberta"}
              {ciclo?.confidencial ? " · sala confidencial" : ""}
            </>
          ) : (
            "Nenhuma reunião registrada nesta sala ainda."
          )
        }
        acoes={
          <>
            {(reunioes ?? []).length > 0 && (
              <Select
                value={reuniaoId ?? ""}
                onValueChange={(v) => setReuniaoEscolhidaId(v)}
              >
                <SelectTrigger className="h-9 w-[240px]">
                  <SelectValue placeholder="Histórico de reuniões" />
                </SelectTrigger>
                <SelectContent>
                  {(reunioes ?? []).map((r) => (
                    <SelectItem key={r.id} value={r.id}>
                      #{r.numero} · {dataBR(r.data)} · {r.status}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
            <Button variant="ghost" onClick={() => navigate("/tarefas/gestao")}>
              <ArrowLeft className="mr-1 h-4 w-4" /> Salas
            </Button>
            {!fechada && reuniaoId && ehFacilitador && (
              <Button variant="outline" onClick={() => setConfirmarFechar(true)}>
                <CheckCircle2 className="mr-1 h-4 w-4" /> Fechar reunião
              </Button>
            )}
          </>
        }

      />

      {sala?.confidencial && (
        <div className="rounded border border-warning/40 bg-warning/10 p-2 text-[11px]">
          <p className="flex items-center gap-1 font-medium text-warning">
            <Lock className="h-3 w-3" /> Leitura desta sala
          </p>
          <p className="mt-1 text-muted-foreground">
            {(membros ?? []).map((m) => `${nomePessoa(m.pessoa_id)} (${m.papel})`).join(" · ") || "Nenhum membro cadastrado"}
            {" · "}<strong>todos os sócios</strong>
          </p>
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-2">
        <PainelMembrosSala salaId={salaId} membros={membros ?? []} ehFacilitador={!!ehFacilitador} />
        <PainelEscopoSala salaId={salaId} escopo={escopo ?? []} ehFacilitador={!!ehFacilitador} />
      </div>

      {!reuniao ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-2 p-10 text-center">
            <p className="text-sm text-muted-foreground">
              Sem reunião aberta. A reunião do rito é gerada pela cadência da sala — quando ela
              existir, a pauta automática aparece aqui.
            </p>
          </CardContent>
        </Card>
      ) : fechada ? (
        /* ===== Modo leitura: a ata é DERIVADA, nunca digitada ===== */
        <>
          <Card>
            <CardContent className="space-y-1 p-4 text-sm">
              <p className="font-medium">
                Ata · {ataCabecalho?.sala_nome ?? sala?.nome} #{ataCabecalho?.numero ?? reuniao.numero}
              </p>
              <p className="text-xs text-muted-foreground">
                {dataBR(ataCabecalho?.data ?? reuniao.data)} · fechada em{" "}
                {dataBR(ataCabecalho?.fechada_em ?? reuniao.fechada_em)} ·{" "}
                {ataCabecalho?.total_itens ?? 0} item(ns) · anterior{" "}
                {dataBR(ataCabecalho?.reuniao_anterior_data)}
              </p>
              <p className="text-xs text-muted-foreground">
                Presentes ({ataCabecalho?.presentes ?? 0}): {ataCabecalho?.lista_presentes || "—"}
              </p>
              <p className="text-xs text-muted-foreground">
                Ausentes ({ataCabecalho?.ausentes ?? 0}): {ataCabecalho?.lista_ausentes || "—"}
              </p>
            </CardContent>
          </Card>

          {(ata ?? []).length === 0 ? (
            <Card>
              <CardContent className="p-10 text-center text-sm text-muted-foreground">
                Esta reunião foi fechada sem itens tocados.
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-2">
              {(ata ?? []).map((l) => (
                <Card key={l.item_id ?? `${l.ordem}`}>
                  <CardContent className="space-y-1 p-3">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <Badge variant="secondary" className="rounded px-1.5 py-0 text-[10px]">
                        {l.item_tipo}
                      </Badge>
                      <p className="font-medium">{l.titulo}</p>
                      {l.saude && (
                        <Badge variant="outline" className="rounded px-1.5 py-0 text-[10px]">
                          {SAUDE_ROTULO[l.saude] ?? l.saude}
                        </Badge>
                      )}
                      {l.marcador && (
                        <Badge variant="outline" className="rounded px-1.5 py-0 text-[10px]">
                          {l.marcador}
                        </Badge>
                      )}
                    </div>
                    {l.complemento && <p className="text-xs text-muted-foreground">{l.complemento}</p>}
                    {l.nota && <p className="text-sm">{l.nota}</p>}
                    {l.responsavel && (
                      <p className="text-[11px] text-muted-foreground">Responsável: {l.responsavel}</p>
                    )}
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </>
      ) : (
        /* ===== Reunião aberta ===== */
        <>
          <Card>
            <CardContent className="space-y-2 p-4">
              <p className="text-sm font-medium">Participantes</p>
              {(membros ?? []).length === 0 ? (
                <p className="text-xs text-muted-foreground">
                  Sala sem membros cadastrados — sem membros não há presença para marcar.
                </p>
              ) : (
                <div className="grid gap-2 sm:grid-cols-2">
                  {(membros ?? []).map((m) => {
                    const p = (participantes ?? []).find((x) => x.pessoa_id === m.pessoa_id);
                    return (
                      <div key={m.pessoa_id} className="flex items-center justify-between gap-2 rounded border border-border px-2 py-1.5">
                        <div className="min-w-0">
                          <p className="truncate text-sm">{nomePessoa(m.pessoa_id)}</p>
                          <p className="text-[11px] text-muted-foreground">{m.papel}</p>
                        </div>
                        <Switch
                          checked={!!p?.presente}
                          onCheckedChange={(v) =>
                            marcarPresenca.mutate({ reuniaoId: reuniao.id, pessoaId: m.pessoa_id, presente: v })
                          }
                          aria-label="Presente"
                        />
                      </div>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>

          <div className="flex flex-wrap gap-2">
            <Button size="sm" variant="outline" onClick={() => setDialogo("decisao")}>
              <Gavel className="mr-1 h-3.5 w-3.5" /> Registrar decisão
            </Button>
            <Button size="sm" variant="outline" onClick={() => setDialogo("risco")}>
              <ShieldAlert className="mr-1 h-3.5 w-3.5" /> Registrar risco
            </Button>
            <Button size="sm" variant="outline" onClick={() => setDialogo("tarefa")}>
              <Plus className="mr-1 h-3.5 w-3.5" /> Criar tarefa
            </Button>
          </div>

          <Card>
            <CardContent className="space-y-3 p-4">
              <p className="text-sm font-medium">Pauta automática</p>
              {grupos.length === 0 ? (
                <p className="text-xs text-muted-foreground">
                  A pauta nasce do que está em aberto (projetos sem check-in, riscos, decisões a
                  revisitar, tarefas vencidas). Hoje não há nada pendente para esta sala.
                </p>
              ) : (
                grupos.map(([categoria, grupo]) => (
                  <div key={categoria} className="space-y-1">
                    <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                      {categoria}
                    </p>
                    {grupo.linhas.map((l) => (
                      <div
                        key={`${l.item_tipo}-${l.item_id}`}
                        className="flex flex-wrap items-center gap-2 rounded border border-border px-2 py-1.5"
                      >
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm">{l.titulo}</p>
                          <p className="truncate text-[11px] text-muted-foreground">
                            {l.detalhe}
                            {l.marcador ? ` · ${l.marcador}` : ""}
                            {l.dias != null ? ` · ${l.dias} dia(s)` : ""}
                          </p>
                        </div>
                        <Button
                          size="sm"
                          variant="ghost"
                          disabled={!l.item_id || jaNaReuniao.has(l.item_id) || trazer.isPending}
                          onClick={() =>
                            trazer.mutate({
                              reuniaoId: reuniao.id,
                              tipo: (l.item_tipo ?? "projeto") as ItemTipo,
                              itemId: l.item_id!,
                              ordem: (itens ?? []).length + 1,
                            })
                          }
                        >
                          <ListPlus className="mr-1 h-3.5 w-3.5" />
                          {l.item_id && jaNaReuniao.has(l.item_id) ? "Na reunião" : "Trazer para a reunião"}
                        </Button>
                      </div>
                    ))}
                  </div>
                ))
              )}
            </CardContent>
          </Card>

          <Card>
            <CardContent className="space-y-3 p-4">
              <p className="text-sm font-medium">Itens desta reunião ({(itens ?? []).length})</p>
              {(itens ?? []).length === 0 ? (
                <p className="text-xs text-muted-foreground">
                  Nada tocado ainda. A ata é feita do que você trouxer aqui — não existe campo de ata
                  para digitar.
                </p>
              ) : (
                (itens ?? []).map((i) => (
                  <div key={i.id} className="space-y-2 rounded border border-border p-2">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <Badge variant="secondary" className="rounded px-1.5 py-0 text-[10px]">
                        {i.projeto_id ? "projeto" : i.decisao_id ? "decisão" : i.risco_id ? "risco" : "tarefa"}
                      </Badge>
                      <p className="min-w-0 flex-1 truncate text-sm">
                        {i.projeto_id ? nomeProjeto(i.projeto_id) : (i.decisao_id ?? i.risco_id ?? i.tarefa_id)}
                      </p>
                      <Button size="icon" variant="ghost" onClick={() => removerItem.mutate(i.id)} aria-label="Retirar">
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    </div>

                    <Textarea
                      rows={2}
                      defaultValue={i.nota ?? ""}
                      placeholder="Nota do que foi discutido"
                      onBlur={(e) => {
                        if ((i.nota ?? "") !== e.target.value)
                          atualizarItem.mutate({ id: i.id, nota: e.target.value });
                      }}
                    />

                    {i.projeto_id && (
                      <div className="flex items-center gap-2">
                        <Label className="text-[11px] text-muted-foreground">Saúde (vira o check-in)</Label>
                        <Select
                          value={i.saude ?? ""}
                          onValueChange={(v) => atualizarItem.mutate({ id: i.id, saude: v })}
                        >
                          <SelectTrigger className="h-8 w-[170px]">
                            <SelectValue placeholder="Escolher saúde" />
                          </SelectTrigger>
                          <SelectContent>
                            {Object.entries(SAUDE_ROTULO).map(([valor, rotulo]) => (
                              <SelectItem key={valor} value={valor}>{rotulo}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    )}
                  </div>
                ))
              )}
            </CardContent>
          </Card>

          {!ehFacilitador && (
            <p className="text-xs text-muted-foreground">
              Só o facilitador da sala fecha a reunião.
            </p>
          )}
        </>
      )}

      {/* Fechar reunião — irreversível */}
      <AlertDialog open={confirmarFechar} onOpenChange={setConfirmarFechar}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Fechar a reunião?</AlertDialogTitle>
            <AlertDialogDescription>
              {(itens ?? []).length} item(ns) serão carimbados: os check-ins de projeto são gravados,
              as notas congelam, as decisões viram imutáveis e a ata vai por e-mail para todos os
              membros. Isso é irreversível.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Voltar</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                if (!reuniaoId) return;
                const alvo = reuniaoId;
                fechar.mutate(alvo, {
                  onSuccess: () => {
                    setConfirmarFechar(false);
                    // ATA-E-DERIVADA (20/08/2026): fechada a reunião, a leitura é a ata.
                    navigate(`/tarefas/gestao/ata/${alvo}`);
                  },
                });
              }}
            >
              Fechar reunião
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Registrar decisão */}
      <Dialog open={dialogo === "decisao"} onOpenChange={(v) => !v && setDialogo(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Registrar decisão</DialogTitle>
            <DialogDescription>
              Fica ligada a esta reunião. Depois de fechada, a decisão é imutável — só se revisa.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label>Título</Label>
              <Input value={dTitulo} onChange={(e) => setDTitulo(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>Contexto</Label>
              <Textarea rows={2} value={dContexto} onChange={(e) => setDContexto(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>Decisão</Label>
              <Textarea rows={3} value={dDecisao} onChange={(e) => setDDecisao(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>Projeto</Label>
              <Select value={dProjeto} onValueChange={setDProjeto}>
                <SelectTrigger><SelectValue placeholder="Sem projeto" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value={SEM_PROJETO}>Sem projeto</SelectItem>
                  {projetosDoEscopo.map((p) => (
                    <SelectItem key={p.id} value={p.id}>{p.nome}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-center justify-between rounded border border-border p-2">
              <div>
                <Label>Reversível</Label>
                <p className="text-[11px] text-muted-foreground">
                  Desligue quando não houver volta — a decisão fica marcada como irreversível.
                </p>
              </div>
              <Switch checked={dReversivel} onCheckedChange={setDReversivel} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogo(null)}>Voltar</Button>
            <Button
              disabled={!dTitulo.trim() || !dDecisao.trim() || registrarDecisao.isPending}
              onClick={() =>
                registrarDecisao.mutate(
                  {
                    titulo: dTitulo.trim(),
                    contexto: dContexto.trim() || null,
                    decisao: dDecisao.trim(),
                    projeto_id: dProjeto === SEM_PROJETO ? null : dProjeto,
                    sala_origem_id: salaId,
                    reuniao_id: reuniaoId,
                    reversivel: dReversivel,
                    revisitar_em: null,
                  },
                  {
                    onSuccess: (id) => {
                      if (reuniaoId) trazer.mutate({ reuniaoId, tipo: "decisao", itemId: id });
                      setDialogo(null);
                      setDTitulo(""); setDContexto(""); setDDecisao("");
                    },
                  },
                )
              }
            >
              Registrar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Registrar risco */}
      <Dialog open={dialogo === "risco"} onOpenChange={(v) => !v && setDialogo(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Registrar risco</DialogTitle>
            <DialogDescription>
              A severidade é calculada pelo banco a partir de probabilidade × impacto.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label>Título</Label>
              <Input value={rTitulo} onChange={(e) => setRTitulo(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>Descrição</Label>
              <Textarea rows={2} value={rDescricao} onChange={(e) => setRDescricao(e.target.value)} />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1.5">
                <Label>Probabilidade</Label>
                <Select value={rProb} onValueChange={setRProb}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {["1", "2", "3"].map((n) => <SelectItem key={n} value={n}>{n}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Impacto</Label>
                <Select value={rImpacto} onValueChange={setRImpacto}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {["1", "2", "3"].map((n) => <SelectItem key={n} value={n}>{n}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Mitigação</Label>
              <Textarea rows={2} value={rMitigacao} onChange={(e) => setRMitigacao(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>Projeto</Label>
              <Select value={rProjeto} onValueChange={setRProjeto}>
                <SelectTrigger><SelectValue placeholder="Sem projeto" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value={SEM_PROJETO}>Sem projeto</SelectItem>
                  {projetosDoEscopo.map((p) => (
                    <SelectItem key={p.id} value={p.id}>{p.nome}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogo(null)}>Voltar</Button>
            <Button
              disabled={!rTitulo.trim() || registrarRisco.isPending}
              onClick={() =>
                registrarRisco.mutate(
                  {
                    titulo: rTitulo.trim(),
                    descricao: rDescricao.trim() || null,
                    projeto_id: rProjeto === SEM_PROJETO ? null : rProjeto,
                    sala_origem_id: salaId,
                    dono_pessoa_id: null,
                    probabilidade: Number(rProb),
                    impacto: Number(rImpacto),
                    mitigacao: rMitigacao.trim() || null,
                    proxima_revisao: null,
                  },
                  {
                    onSuccess: (id) => {
                      if (reuniaoId) trazer.mutate({ reuniaoId, tipo: "risco", itemId: id });
                      setDialogo(null);
                      setRTitulo(""); setRDescricao(""); setRMitigacao("");
                    },
                  },
                )
              }
            >
              Registrar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Criar tarefa */}
      <Dialog open={dialogo === "tarefa"} onOpenChange={(v) => !v && setDialogo(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Criar tarefa</DialogTitle>
            <DialogDescription>
              Vai para a lista de tarefas normal, ligada ao projeto do escopo desta sala.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label>Título</Label>
              <Input value={tTitulo} onChange={(e) => setTTitulo(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>Projeto</Label>
              <Select value={tProjeto} onValueChange={setTProjeto}>
                <SelectTrigger><SelectValue placeholder="Sem projeto" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value={SEM_PROJETO}>Sem projeto</SelectItem>
                  {projetosDoEscopo.map((p) => (
                    <SelectItem key={p.id} value={p.id}>{p.nome}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Responsável</Label>
              <Select value={tResponsavel} onValueChange={setTResponsavel}>
                <SelectTrigger><SelectValue placeholder="Eu mesmo" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value={SEM_PROJETO}>Eu mesmo</SelectItem>
                  {/* IDENTIDADE: tarefas.responsavel_id é usuario_id (auth), não pessoa_id.
                      Membro sem login não recebe tarefa no sistema. */}
                  {(membros ?? []).map((m) => {
                    const pg = (pessoasGestao ?? []).find((p) => p.pessoa_id === m.pessoa_id);
                    if (!pg?.usuario_id) return null;
                    return (
                      <SelectItem key={pg.usuario_id} value={pg.usuario_id}>{pg.nome}</SelectItem>
                    );
                  })}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Prazo</Label>
              <Input type="date" value={tPrazo} onChange={(e) => setTPrazo(e.target.value)} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogo(null)}>Voltar</Button>
            <Button
              disabled={!tTitulo.trim() || criarTarefa.isPending}
              onClick={() =>
                criarTarefa.mutate(
                  {
                    titulo: tTitulo.trim(),
                    projetoId: tProjeto === SEM_PROJETO ? null : tProjeto,
                    responsavelId: tResponsavel === SEM_PROJETO ? null : tResponsavel,
                    dataLimite: tPrazo || null,
                  },
                  {
                    onSuccess: (id) => {
                      if (reuniaoId) trazer.mutate({ reuniaoId, tipo: "tarefa", itemId: id });
                      setDialogo(null);
                      setTTitulo(""); setTPrazo("");
                    },
                  },
                )
              }
            >
              Criar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </PageShell>
  );
}
