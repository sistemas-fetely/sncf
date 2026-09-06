import { useMemo, useState } from "react";
import { ChevronsUpDown, MoreHorizontal, Plus, Trash2, Users } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { usePodeGerenciarProjeto, useProjeto } from "@/hooks/tarefas/useProjetosTarefas";
import {
  useAdicionarMembro, useAdicionarMembrosEmMassa, useMembrosProjeto, usePapeisProjeto,
  usePessoasParaProjeto, useRemoverMembro, useTrocarPapelMembro,
} from "@/hooks/tarefas/useProjetoMembros";
import type { PessoaParaProjeto } from "@/hooks/tarefas/useProjetoMembros";
import { cn } from "@/lib/utils";

const ROTULO_NIVEL: Record<string, string> = {
  c_level: "C-level",
  coordenacao: "Coordenação",
  especialista: "Especialista",
  sr: "Sênior",
  pl: "Pleno",
  jr: "Júnior",
};
const rotuloNivel = (nivel: string) => ROTULO_NIVEL[nivel] ?? nivel;

type ModoAdicao = "uma" | "massa";

const dataBr = (iso: string | null | undefined) =>
  iso ? iso.slice(0, 10).split("-").reverse().join("/") : "—";

interface Props {
  projetoId: string;
}

function iniciais(nome: string) {
  const partes = nome.trim().split(/\s+/);
  if (partes.length === 0) return "?";
  if (partes.length === 1) return partes[0].slice(0, 2).toUpperCase();
  return (partes[0][0] + partes[partes.length - 1][0]).toUpperCase();
}

export function PessoasProjeto({ projetoId }: Props) {
  const { data: projeto } = useProjeto(projetoId);
  const { data: membros } = useMembrosProjeto(projetoId);
  const { data: papeis } = usePapeisProjeto();
  const { data: podeGerenciar } = usePodeGerenciarProjeto(projetoId);
  const { data: pessoas } = usePessoasParaProjeto();

  const adicionar = useAdicionarMembro(projetoId);
  const adicionarMassa = useAdicionarMembrosEmMassa(projetoId);
  const trocar = useTrocarPapelMembro(projetoId);
  const remover = useRemoverMembro(projetoId);

  const [novaPessoa, setNovaPessoa] = useState("");
  const [novoPapel, setNovoPapel] = useState("");
  const [abertoPessoa, setAbertoPessoa] = useState(false);
  const [modo, setModo] = useState<ModoAdicao>("uma");
  const [buscaMassa, setBuscaMassa] = useState("");
  const [filtroDepto, setFiltroDepto] = useState("todos");
  const [filtroNivel, setFiltroNivel] = useState("todos");
  const [selecionados, setSelecionados] = useState<Set<string>>(new Set());

  const papelEscolhido = papeis?.find((p) => p.codigo === novoPapel);
  const pessoaEscolhida = pessoas?.find((p) => p.user_id === novaPessoa);
  const rotuloPapel = (codigo: string) => papeis?.find((p) => p.codigo === codigo)?.nome ?? codigo;
  const pessoaPorUsuario = (userId: string) => pessoas?.find((p) => p.user_id === userId);

  const fixos = [
    { id: projeto?.responsavel_id ?? null, vinculo: "Responsável" },
    { id: projeto?.criado_por ?? null, vinculo: "Criador" },
  ].filter((f, i, arr) => f.id && arr.findIndex((x) => x.id === f.id) === i) as {
    id: string;
    vinculo: string;
  }[];

  const candidatos = (pessoas ?? []).filter(
    (p) => !(membros ?? []).some((m) => m.user_id === p.user_id) && !fixos.some((f) => f.id === p.user_id)
  );
  const haPessoaComAcesso = candidatos.some((p) => p.tem_acesso && p.user_id);

  // ---- Adição em massa: seleção livre com checkbox ----
  const departamentosMassa = useMemo(() => {
    const mapa = new Map<string, string>();
    for (const p of candidatos) {
      if (p.departamento_id && p.departamento) mapa.set(p.departamento_id, p.departamento);
    }
    return [...mapa.entries()]
      .map(([id, nome]) => ({ id, nome }))
      .sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));
  }, [candidatos]);

  const niveisMassa = useMemo(() => {
    const set = new Set<string>();
    for (const p of candidatos) if (p.nivel_cargo) set.add(p.nivel_cargo);
    return [...set].sort((a, b) => rotuloNivel(a).localeCompare(rotuloNivel(b), "pt-BR"));
  }, [candidatos]);

  const visiveisMassa = useMemo(() => {
    const busca = buscaMassa.trim().toLowerCase();
    return candidatos.filter((p) => {
      if (filtroDepto !== "todos" && p.departamento_id !== filtroDepto) return false;
      if (filtroNivel !== "todos" && p.nivel_cargo !== filtroNivel) return false;
      if (busca) {
        const alvo = `${p.nome} ${p.cargo ?? ""} ${p.departamento ?? ""}`.toLowerCase();
        if (!alvo.includes(busca)) return false;
      }
      return true;
    });
  }, [candidatos, buscaMassa, filtroDepto, filtroNivel]);

  const alternarSelecionado = (userId: string) =>
    setSelecionados((atual) => {
      const proximo = new Set(atual);
      if (proximo.has(userId)) proximo.delete(userId);
      else proximo.add(userId);
      return proximo;
    });

  const selecionarTodosVisiveis = () =>
    setSelecionados((atual) => {
      const proximo = new Set(atual);
      for (const p of visiveisMassa) if (p.tem_acesso && p.user_id) proximo.add(p.user_id);
      return proximo;
    });

  const limparSelecao = () => setSelecionados(new Set());

  const selecionadosValidos = useMemo(
    () =>
      [...selecionados].filter((id) =>
        candidatos.some((p) => p.user_id === id && p.tem_acesso)
      ),
    [selecionados, candidatos]
  );

  const detalhePessoa = (pessoa?: ReturnType<typeof pessoaPorUsuario>) =>
    [pessoa?.cargo, pessoa?.departamento].filter(Boolean).join(" · ") || null;

  const CardPessoa = ({
    userId,
    vinculo,
    papel,
    desde,
    acoes,
  }: {
    userId: string;
    vinculo?: string;
    papel?: string;
    desde?: string | null;
    acoes?: React.ReactNode;
  }) => {
    const pessoa = pessoaPorUsuario(userId);
    const nome = pessoa?.nome ?? "Pessoa fora do catálogo";
    return (
      <Card className="relative">
        {acoes && <div className="absolute right-2 top-2">{acoes}</div>}
        <CardContent className="flex flex-col items-center p-4 text-center">
          <div className="mb-2 flex h-10 w-10 items-center justify-center rounded-full bg-primary/10 text-sm font-semibold text-primary">
            {iniciais(nome)}
          </div>
          <p className="w-full truncate text-sm font-semibold" title={nome}>{nome}</p>
          {detalhePessoa(pessoa) ? (
            <p className="mt-0.5 w-full truncate text-xs text-muted-foreground" title={detalhePessoa(pessoa)!}>
              {detalhePessoa(pessoa)}
            </p>
          ) : (
            <p className="mt-0.5 text-xs text-muted-foreground">Cargo e departamento não informados</p>
          )}
          {pessoa?.gestor_nome && (
            <p className="mt-0.5 text-[11px] text-muted-foreground">reporta a {pessoa.gestor_nome}</p>
          )}
          <div className="mt-2 flex flex-wrap items-center justify-center gap-2">
            {vinculo ? (
              <Badge variant="secondary" className="text-[10px]">{vinculo}</Badge>
            ) : papel ? (
              <Badge variant="secondary" className="text-[10px]">{rotuloPapel(papel)}</Badge>
            ) : null}
          </div>
          {papel && (
            <p className="mt-2 text-[11px] text-muted-foreground">desde {dataBr(desde)}</p>
          )}
        </CardContent>
      </Card>
    );
  };

  return (
    <div className="space-y-4">
      <section className="space-y-2">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-medium">Quem participa</h3>
          {!podeGerenciar && (
            <p className="text-xs text-muted-foreground">
              Você só pode consultar esta lista — quem gerencia o projeto pode alterá-la.
            </p>
          )}
        </div>

        {(membros ?? []).length === 0 && fixos.length === 0 && (
          <p className="text-sm text-muted-foreground">Ninguém participa deste projeto ainda.</p>
        )}

        <div className="grid gap-3 [grid-template-columns:repeat(auto-fill,minmax(220px,1fr))]">
          {fixos.map((f) => (
            <CardPessoa key={`fixo-${f.id}`} userId={f.id} vinculo={f.vinculo} />
          ))}

          {(membros ?? []).map((m) => (
            <CardPessoa
              key={m.id}
              userId={m.user_id}
              papel={m.papel}
              desde={m.desde}
              acoes={
                podeGerenciar ? (
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="icon" className="h-8 w-8">
                        <MoreHorizontal className="h-4 w-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="w-48">
                      <DropdownMenuSub>
                        <DropdownMenuSubTrigger>Alterar papel</DropdownMenuSubTrigger>
                        <DropdownMenuSubContent>
                          {(papeis ?? []).map((p) => (
                            <DropdownMenuItem
                              key={p.codigo}
                              disabled={m.papel === p.codigo}
                              onClick={() => trocar.mutate({ id: m.id, papel: p.codigo })}
                            >
                              {p.nome}
                            </DropdownMenuItem>
                          ))}
                        </DropdownMenuSubContent>
                      </DropdownMenuSub>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem
                        className="text-destructive focus:text-destructive"
                        onClick={() => remover.mutate(m.id)}
                      >
                        <Trash2 className="mr-2 h-4 w-4" />
                        Remover participante
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                ) : null
              }
            />
          ))}
        </div>
      </section>

      <section className="space-y-2 border-t pt-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="text-sm font-medium">Adicionar participante</h3>
          {podeGerenciar && (
            <div className="inline-flex rounded-md border bg-muted/40 p-0.5">
              {(
                [
                  { valor: "uma", rotulo: "Uma pessoa" },
                  { valor: "massa", rotulo: "Vários de uma vez" },
                ] as const
              ).map((op) => (
                <button
                  key={op.valor}
                  type="button"
                  onClick={() => setModo(op.valor)}
                  className={cn(
                    "rounded-sm px-3 py-1 text-xs transition-colors",
                    modo === op.valor
                      ? "bg-background font-medium shadow-sm"
                      : "text-muted-foreground hover:text-foreground"
                  )}
                >
                  {op.rotulo}
                </button>
              ))}
            </div>
          )}
        </div>
        <div className="flex flex-col gap-3">
          {modo === "uma" ? (
            <>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="pessoa-nova">Pessoa</Label>
                  <Popover open={abertoPessoa} onOpenChange={setAbertoPessoa}>
                    <PopoverTrigger asChild>
                      <Button
                        id="pessoa-nova"
                        variant="outline"
                        role="combobox"
                        aria-expanded={abertoPessoa}
                        className="h-10 w-full justify-between px-3 font-normal"
                        disabled={!podeGerenciar || candidatos.length === 0}
                      >
                        <span className="truncate">
                          {pessoaEscolhida ? pessoaEscolhida.nome : "Escolha uma pessoa"}
                        </span>
                        <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
                      <Command>
                        <CommandInput placeholder="Buscar por nome, cargo ou departamento" />
                        <CommandList>
                          <CommandEmpty>Ninguém encontrado</CommandEmpty>
                          <CommandGroup>
                            {candidatos.map((p) => {
                              const desabilitada = !p.tem_acesso || !p.user_id;
                              return (
                                <CommandItem
                                  key={p.pessoa_id}
                                  value={`${p.nome} ${p.cargo ?? ""} ${p.departamento ?? ""}`}
                                  disabled={desabilitada}
                                  onSelect={() => {
                                    if (p.user_id) {
                                      setNovaPessoa(p.user_id);
                                      setAbertoPessoa(false);
                                    }
                                  }}
                                  className={cn(desabilitada && "opacity-60")}
                                >
                                  <span className="flex flex-col">
                                    <span className={cn("text-sm", novaPessoa === p.user_id && "font-medium")}>
                                      {p.nome}
                                    </span>
                                    <span className="text-[11px] text-muted-foreground">
                                      {[p.cargo, p.departamento].filter(Boolean).join(" · ") || "Cargo e departamento não informados"}
                                      {!p.tem_acesso && " · sem acesso ao sistema"}
                                    </span>
                                  </span>
                                </CommandItem>
                              );
                            })}
                          </CommandGroup>
                        </CommandList>
                      </Command>
                    </PopoverContent>
                  </Popover>
                  {candidatos.length === 0 ? (
                    <p className="text-xs text-muted-foreground">Todos já participam deste projeto.</p>
                  ) : !haPessoaComAcesso ? (
                    <p className="text-xs text-muted-foreground">Ninguém mais com acesso ao sistema.</p>
                  ) : null}
                </div>

                <div className="space-y-2">
                  <Label htmlFor="papel-novo">Papel</Label>
                  <Select
                    value={novoPapel}
                    disabled={!podeGerenciar}
                    onValueChange={(v) => setNovoPapel(v)}
                  >
                    <SelectTrigger id="papel-novo" className="w-full">
                      <SelectValue placeholder="Escolha um papel" />
                    </SelectTrigger>
                    <SelectContent>
                      {(papeis ?? []).map((p) => (
                        <SelectItem key={p.codigo} value={p.codigo}>
                          <span className="flex flex-col">
                            <span>{p.nome}</span>
                            {p.descricao && (
                              <span className="text-[11px] text-muted-foreground">{p.descricao}</span>
                            )}
                          </span>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {papelEscolhido?.descricao && (
                    <p className="text-xs text-muted-foreground">{papelEscolhido.descricao}</p>
                  )}
                </div>
              </div>

              <div>
                <Button
                  size="sm"
                  disabled={!podeGerenciar || !novaPessoa || !novoPapel || adicionar.isPending}
                  onClick={async () => {
                    await adicionar.mutateAsync({ userId: novaPessoa, papel: novoPapel });
                    setNovaPessoa("");
                    setNovoPapel("");
                  }}
                >
                  <Plus className="mr-1 h-4 w-4" />
                  {pessoaEscolhida && papelEscolhido
                    ? `Adicionar ${pessoaEscolhida.nome} como ${papelEscolhido.nome}`
                    : "Escolha uma pessoa e um papel"}
                </Button>
              </div>
            </>
          ) : (
            <>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-[1fr_200px_200px]">
                <div className="space-y-2">
                  <Label htmlFor="busca-massa">Buscar</Label>
                  <Input
                    id="busca-massa"
                    placeholder="Nome, cargo ou departamento"
                    value={buscaMassa}
                    onChange={(e) => setBuscaMassa(e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="filtro-depto">Departamento</Label>
                  <Select value={filtroDepto} onValueChange={setFiltroDepto}>
                    <SelectTrigger id="filtro-depto" className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="todos">Todos</SelectItem>
                      {departamentosMassa.map((d) => (
                        <SelectItem key={d.id} value={d.id}>{d.nome}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="filtro-nivel">Nível do cargo</Label>
                  <Select value={filtroNivel} onValueChange={setFiltroNivel}>
                    <SelectTrigger id="filtro-nivel" className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="todos">Todos</SelectItem>
                      {niveisMassa.map((n) => (
                        <SelectItem key={n} value={n}>{rotuloNivel(n)}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-xs text-muted-foreground">
                  {selecionadosValidos.length === 0
                    ? "Ninguém selecionado"
                    : selecionadosValidos.length === 1
                      ? "1 pessoa selecionada"
                      : `${selecionadosValidos.length} pessoas selecionadas`}
                </p>
                <div className="flex gap-1">
                  <Button type="button" variant="ghost" size="sm" onClick={selecionarTodosVisiveis}>
                    Selecionar todos os visíveis
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={limparSelecao}
                    disabled={selecionados.size === 0}
                  >
                    Limpar seleção
                  </Button>
                </div>
              </div>

              <div className="grid max-h-80 gap-2 overflow-y-auto rounded-md border p-2 [grid-template-columns:repeat(auto-fill,minmax(260px,1fr))]">
                {visiveisMassa.length === 0 ? (
                  <p className="col-span-full p-4 text-sm text-muted-foreground">
                    Ninguém encontrado com esses filtros.
                  </p>
                ) : (
                  visiveisMassa.map((p) => {
                    const desabilitada = !p.tem_acesso || !p.user_id;
                    const marcada = p.user_id ? selecionados.has(p.user_id) : false;
                    return (
                      <label
                        key={p.pessoa_id}
                        className={cn(
                          "flex items-start gap-2 rounded-sm border p-2",
                          desabilitada ? "opacity-60" : "cursor-pointer hover:bg-muted/40"
                        )}
                      >
                        <Checkbox
                          checked={marcada}
                          disabled={desabilitada || !podeGerenciar}
                          onCheckedChange={() => p.user_id && alternarSelecionado(p.user_id)}
                          className="mt-0.5"
                        />
                        <span className="flex min-w-0 flex-col">
                          <span className="truncate text-sm font-medium">{p.nome}</span>
                          <span className="truncate text-[11px] text-muted-foreground">
                            {[p.cargo, p.departamento].filter(Boolean).join(" · ") || "Cargo e departamento não informados"}
                            {!p.tem_acesso && " · sem acesso ao sistema"}
                          </span>
                        </span>
                      </label>
                    );
                  })
                )}
              </div>

              <div className="flex flex-wrap items-end gap-3">
                <div className="w-full space-y-1 sm:w-[240px]">
                  <Label htmlFor="papel-novo">Papel</Label>
                  <Select
                    value={novoPapel}
                    disabled={!podeGerenciar}
                    onValueChange={(v) => setNovoPapel(v)}
                  >
                    <SelectTrigger id="papel-novo" className="w-full">
                      <SelectValue placeholder="Escolha um papel" />
                    </SelectTrigger>
                    <SelectContent>
                      {(papeis ?? []).map((p) => (
                        <SelectItem key={p.codigo} value={p.codigo}>
                          <span className="flex flex-col">
                            <span>{p.nome}</span>
                            {p.descricao && (
                              <span className="text-[11px] text-muted-foreground">{p.descricao}</span>
                            )}
                          </span>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {papelEscolhido?.descricao && (
                    <p className="text-xs text-muted-foreground">{papelEscolhido.descricao}</p>
                  )}
                </div>

                <Button
                  size="sm"
                  disabled={
                    !podeGerenciar ||
                    !novoPapel ||
                    selecionadosValidos.length === 0 ||
                    adicionarMassa.isPending
                  }
                  onClick={async () => {
                    await adicionarMassa.mutateAsync({
                      userIds: selecionadosValidos,
                      papel: novoPapel,
                    });
                    limparSelecao();
                    setNovoPapel("");
                  }}
                >
                  <Users className="mr-1 h-4 w-4" />
                  {papelEscolhido
                    ? selecionadosValidos.length === 1
                      ? `Adicionar 1 pessoa como ${papelEscolhido.nome}`
                      : `Adicionar ${selecionadosValidos.length} pessoas como ${papelEscolhido.nome}`
                    : "Selecione pessoas e um papel"}
                </Button>
              </div>
            </>
          )}
        </div>
      </section>
    </div>
  );
}
