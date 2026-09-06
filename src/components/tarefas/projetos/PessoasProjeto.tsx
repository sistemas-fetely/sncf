import { useState } from "react";
import { MoreHorizontal, Plus, Trash2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { usePodeGerenciarProjeto, useProjeto } from "@/hooks/tarefas/useProjetosTarefas";
import {
  useAdicionarMembro, useMembrosProjeto, usePapeisProjeto, usePessoasParaProjeto,
  useRemoverMembro, useTrocarPapelMembro,
} from "@/hooks/tarefas/useProjetoMembros";
import { cn } from "@/lib/utils";

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
  const trocar = useTrocarPapelMembro(projetoId);
  const remover = useRemoverMembro(projetoId);

  const [novaPessoa, setNovaPessoa] = useState("");
  const [novoPapel, setNovoPapel] = useState("");

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
        <CardContent className="flex flex-col items-center p-5 text-center">
          <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-full bg-primary/10 text-sm font-semibold text-primary">
            {iniciais(nome)}
          </div>
          <p className="w-full truncate text-sm font-semibold" title={nome}>{nome}</p>
          {detalhePessoa(pessoa) ? (
            <p className="mt-1 w-full truncate text-xs text-muted-foreground" title={detalhePessoa(pessoa)!}>
              {detalhePessoa(pessoa)}
            </p>
          ) : (
            <p className="mt-1 text-xs text-muted-foreground">Cargo e departamento não informados</p>
          )}
          {pessoa?.gestor_nome && (
            <p className="mt-1 text-[11px] text-muted-foreground">reporta a {pessoa.gestor_nome}</p>
          )}
          <div className="mt-3 flex flex-wrap items-center justify-center gap-2">
            {vinculo ? (
              <Badge variant="secondary" className="text-[10px]">{vinculo}</Badge>
            ) : papel ? (
              <Badge variant="secondary" className="text-[10px]">{rotuloPapel(papel)}</Badge>
            ) : null}
          </div>
          {papel && (
            <p className="mt-3 text-[11px] text-muted-foreground">desde {dataBr(desde)}</p>
          )}
        </CardContent>
      </Card>
    );
  };

  return (
    <div className="space-y-6">
      <section className="space-y-3">
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

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
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

      <section className="space-y-3 border-t pt-4">
        <h3 className="text-sm font-medium">Adicionar participante</h3>
        <div className="flex flex-col gap-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="pessoa-nova">Pessoa</Label>
              <Select
                value={novaPessoa}
                disabled={!podeGerenciar || candidatos.length === 0}
                onValueChange={(v) => setNovaPessoa(v)}
              >
                <SelectTrigger id="pessoa-nova" className="w-full">
                  <SelectValue placeholder="Escolha uma pessoa" />
                </SelectTrigger>
                <SelectContent>
                  {candidatos.map((p) => {
                    const desabilitada = !p.tem_acesso || !p.user_id;
                    return (
                      <SelectItem
                        key={p.pessoa_id}
                        value={p.user_id ?? p.pessoa_id}
                        disabled={desabilitada}
                        className={cn(desabilitada && "opacity-60")}
                      >
                        <span className="flex flex-col">
                          <span className="text-sm">{p.nome}</span>
                          <span className="text-[11px] text-muted-foreground">
                            {[p.cargo, p.departamento].filter(Boolean).join(" · ") || "Cargo e departamento não informados"}
                            {!p.tem_acesso && " · sem acesso ao sistema"}
                          </span>
                        </span>
                      </SelectItem>
                    );
                  })}
                </SelectContent>
              </Select>
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
        </div>
      </section>
    </div>
  );
}
