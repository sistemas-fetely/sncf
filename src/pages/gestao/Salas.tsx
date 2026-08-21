import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowRight, Eye, Lock, Plus, Users } from "lucide-react";
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
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
// IDENTIDADE-DA-GESTAO-E-PESSOA_ID (20/08/2026): membros usam pessoa_id — nomes e
// avatares vêm de vw_gestao_pessoa, nunca de v_pessoas_sistema (chave = usuario_id).
import { useNomeDaPessoa, usePessoasGestao } from "@/hooks/gestao/usePessoasGestao";
import {
  CADENCIA_ROTULO, useCriarSala, useMembrosSalas, usePautaContagemPorSala, usePodeCriarSala,
  useSalas, useSalasCiclo,
} from "@/hooks/gestao/useGestaoSalas";

function dataBR(iso: string | null | undefined) {
  if (!iso) return "—";
  return iso.slice(0, 10).split("-").reverse().join("/");
}

export default function Salas() {
  const navigate = useNavigate();
  const { data: salas, isLoading, error } = useSalas();
  const { data: ciclos } = useSalasCiclo();
  const { data: membros } = useMembrosSalas();
  const { data: podeCriar } = usePodeCriarSala();
  const { data: pautaContagem } = usePautaContagemPorSala();
  const { data: pessoas } = usePessoasGestao();
  const nomePessoa = useNomeDaPessoa();
  const criar = useCriarSala();

  const [aberto, setAberto] = useState(false);
  const [codigo, setCodigo] = useState("");
  const [nome, setNome] = useState("");
  const [descricao, setDescricao] = useState("");
  const [cadencia, setCadencia] = useState("semanal");
  const [confidencial, setConfidencial] = useState(false);

  const cicloPorSala = useMemo(() => {
    const m = new Map<string, (typeof ciclos)[number]>();
    (ciclos ?? []).forEach((c) => { if (c.sala_id) m.set(c.sala_id, c); });
    return m;
  }, [ciclos]);

  const membrosPorSala = useMemo(() => {
    const m = new Map<string, { pessoa_id: string; papel: string }[]>();
    (membros ?? []).forEach((mb) => {
      const lista = m.get(mb.sala_id) ?? [];
      lista.push({ pessoa_id: mb.pessoa_id, papel: mb.papel });
      m.set(mb.sala_id, lista);
    });
    return m;
  }, [membros]);

  const podeSalvar = !!codigo.trim() && !!nome.trim();

  return (
    <PageShell>
      <PageTitle
        titulo="Sala de Gestão"
        icone={Users}
        estado="Cada sala é um rito recorrente com membros. A reunião é só o carimbo no tempo — o que fica são projetos, decisões, riscos e tarefas."
        acoes={
          podeCriar ? (
            <Button onClick={() => setAberto(true)}>
              <Plus className="mr-1 h-4 w-4" /> Nova sala
            </Button>
          ) : undefined
        }
      />

      {error ? (
        <p className="text-sm text-destructive">
          Não foi possível carregar as salas: {(error as Error).message}
        </p>
      ) : isLoading ? (
        <p className="text-sm text-muted-foreground">Carregando salas…</p>
      ) : (salas ?? []).length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-3 p-10 text-center">
            <Users className="h-8 w-8 text-muted-foreground" />
            <p className="text-sm text-muted-foreground">
              Nenhuma sala visível para você. Salas são ritos com membros — quem participa vê.
              {podeCriar ? " Crie a primeira sala e adicione os membros do rito." : " Peça ao facilitador do rito para te incluir como membro."}
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-3 md:grid-cols-2">
          {(salas ?? []).map((s) => {
            const ciclo = cicloPorSala.get(s.id);
            const lista = membrosPorSala.get(s.id) ?? [];
            return (
              <Card key={s.id}>
                <CardContent className="space-y-3 p-4">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <p className="truncate font-medium">{s.nome}</p>
                        <Badge variant="outline" className="rounded px-1.5 py-0 text-[10px]">
                          {CADENCIA_ROTULO[s.cadencia] ?? s.cadencia}
                        </Badge>
                        {s.confidencial && (
                          <Badge variant="destructive" className="rounded px-1.5 py-0 text-[10px]">
                            <Lock className="mr-1 h-3 w-3" /> CONFIDENCIAL
                          </Badge>
                        )}
                      </div>
                      <p className="mt-0.5 text-xs text-muted-foreground">
                        {s.codigo} · {lista.length} membro(s) · última fechada {dataBR(ciclo?.ultima_fechada)}
                        {" · "}
                        {pautaContagem?.[s.id] ?? 0} item(ns) de pauta
                      </p>
                      {lista.length > 0 && (
                        <div className="mt-1.5 flex flex-wrap items-center gap-1">
                          {lista.slice(0, 8).map((m) => {
                            const pessoa = (pessoas ?? []).find((p) => p.pessoa_id === m.pessoa_id);
                            const nome = pessoa?.nome ?? nomePessoa(m.pessoa_id);
                            return (
                              <Avatar key={m.pessoa_id} className="h-6 w-6" title={`${nome} · ${m.papel}`}>
                                {pessoa?.avatar_url && <AvatarImage src={pessoa.avatar_url} alt={nome} />}
                                <AvatarFallback className="text-[10px]">
                                  {nome.slice(0, 2).toUpperCase()}
                                </AvatarFallback>
                              </Avatar>
                            );
                          })}
                          {lista.length > 8 && (
                            <span className="text-[11px] text-muted-foreground">+{lista.length - 8}</span>
                          )}
                        </div>
                      )}
                    </div>
                  </div>

                  {s.descricao && <p className="text-xs text-muted-foreground">{s.descricao}</p>}

                  {s.confidencial && (
                    <div className="rounded border border-warning/40 bg-warning/10 p-2 text-[11px]">
                      <p className="flex items-center gap-1 font-medium text-warning">
                        <Eye className="h-3 w-3" /> Quem consegue ler esta sala
                      </p>
                      <p className="mt-1 text-muted-foreground">
                        {lista.length === 0
                          ? "Nenhum membro cadastrado ainda"
                          : lista.map((m) => `${nomePessoa(m.pessoa_id)} (${m.papel})`).join(" · ")}
                        {" · "}
                        <strong>todos os sócios</strong>
                      </p>
                      <p className="mt-1 text-muted-foreground">
                        Escreva aqui sabendo dessa audiência: confidencial não significa invisível para a sociedade.
                      </p>
                    </div>
                  )}

                  <div className="flex items-center justify-between gap-2">
                    <p className="text-xs text-muted-foreground">
                      {ciclo?.reuniao_aberta_id
                        ? `Reunião aberta em ${dataBR(ciclo.reuniao_aberta_data)}`
                        : "Sem reunião aberta"}
                    </p>
                    <Button
                      size="sm"
                      variant={ciclo?.reuniao_aberta_id ? "default" : "outline"}
                      onClick={() => navigate(`/tarefas/gestao/sala/${s.id}`)}
                    >
                      {ciclo?.reuniao_aberta_id ? "Entrar na reunião" : "Abrir sala"}
                      <ArrowRight className="ml-1 h-3.5 w-3.5" />
                    </Button>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      <Dialog open={aberto} onOpenChange={setAberto}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Nova sala</DialogTitle>
            <DialogDescription>
              Uma sala é um rito recorrente. Os membros são adicionados depois, dentro da sala.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label>Código</Label>
              <Input value={codigo} onChange={(e) => setCodigo(e.target.value.toUpperCase())} placeholder="GESTAO_SOPS" />
            </div>
            <div className="space-y-1.5">
              <Label>Nome</Label>
              <Input value={nome} onChange={(e) => setNome(e.target.value)} placeholder="Gestão SOps" />
            </div>
            <div className="space-y-1.5">
              <Label>Descrição</Label>
              <Textarea value={descricao} onChange={(e) => setDescricao(e.target.value)} rows={3} />
            </div>
            <div className="space-y-1.5">
              <Label>Cadência</Label>
              <Select value={cadencia} onValueChange={setCadencia}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {Object.entries(CADENCIA_ROTULO).map(([valor, rotulo]) => (
                    <SelectItem key={valor} value={valor}>{rotulo}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-center justify-between rounded border border-border p-2">
              <div>
                <Label>Confidencial</Label>
                <p className="text-[11px] text-muted-foreground">
                  Leitura restrita a membros — e a todos os sócios.
                </p>
              </div>
              <Switch checked={confidencial} onCheckedChange={setConfidencial} />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setAberto(false)}>Voltar</Button>
            <Button
              disabled={!podeSalvar || criar.isPending}
              onClick={() =>
                criar.mutate(
                  {
                    codigo: codigo.trim(),
                    nome: nome.trim(),
                    descricao: descricao.trim() || null,
                    cadencia,
                    confidencial,
                  },
                  { onSuccess: () => { setAberto(false); setCodigo(""); setNome(""); setDescricao(""); } },
                )
              }
            >
              Criar sala
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </PageShell>
  );
}
