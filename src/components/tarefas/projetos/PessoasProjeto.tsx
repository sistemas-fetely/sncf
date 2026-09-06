import { useState } from "react";
import { Plus, Search, Trash2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
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
  const [buscaPessoa, setBuscaPessoa] = useState("");

  const papelEscolhido = papeis?.find((p) => p.codigo === novoPapel);
  const pessoaEscolhida = pessoas?.find((p) => p.user_id === novaPessoa);
  const rotuloPapel = (codigo: string) => papeis?.find((p) => p.codigo === codigo)?.nome ?? codigo;
  const pessoaPorUsuario = (userId: string) => pessoas?.find((p) => p.user_id === userId);
  const detalhePessoa = (userId: string) => {
    const pessoa = pessoaPorUsuario(userId);
    return [pessoa?.cargo, pessoa?.departamento].filter(Boolean).join(" · ") || "Cargo e departamento não informados";
  };

  // responsável e criador têm acesso por outra via — aparecem fixos, sem remover
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
  const buscaNormalizada = buscaPessoa.trim().toLocaleLowerCase("pt-BR");
  const disponiveis = candidatos.filter((p) => p.nome.toLocaleLowerCase("pt-BR").includes(buscaNormalizada));
  const haPessoaComAcesso = candidatos.some((p) => p.tem_acesso && p.user_id);

  return (
    <div className="space-y-6">
      <section className="space-y-2">
        <h3 className="text-sm font-medium">Participantes</h3>
        {!podeGerenciar && (
          <p className="text-xs text-muted-foreground">
            Você só pode consultar esta lista — quem gerencia o projeto pode alterá-la.
          </p>
        )}

        {fixos.map((f) => (
          <Card key={`fixo-${f.id}`}>
            <CardContent className="flex flex-wrap items-center gap-4 p-3">
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">{pessoaPorUsuario(f.id)?.nome ?? "Pessoa fora do catálogo"}</p>
                <p className="text-xs text-muted-foreground">{detalhePessoa(f.id)}</p>
                <p className="text-[11px] text-muted-foreground">Acesso pelo próprio vínculo com o projeto</p>
              </div>
              <Badge variant="outline" className="text-[10px]">{f.vinculo}</Badge>
            </CardContent>
          </Card>
        ))}

        {(membros ?? []).length === 0 && fixos.length === 0 && (
          <p className="text-sm text-muted-foreground">Ninguém participa deste projeto ainda.</p>
        )}

        {(membros ?? []).map((m) => (
          <Card key={m.id}>
            <CardContent className="flex flex-wrap items-center gap-4 p-3">
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">{pessoaPorUsuario(m.user_id)?.nome ?? "Pessoa fora do catálogo"}</p>
                <p className="text-xs text-muted-foreground">{detalhePessoa(m.user_id)}</p>
                <p className="text-xs text-muted-foreground">
                  {rotuloPapel(m.papel)} · desde {dataBr(m.desde)}
                </p>
              </div>
              <Select
                value={m.papel}
                disabled={!podeGerenciar}
                onValueChange={(v) => trocar.mutate({ id: m.id, papel: v })}
              >
                <SelectTrigger className="h-8 w-48 text-sm">
                  <SelectValue>{rotuloPapel(m.papel)}</SelectValue>
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
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8"
                disabled={!podeGerenciar}
                onClick={() => remover.mutate(m.id)}
              >
                <Trash2 className="h-4 w-4 text-destructive" />
              </Button>
            </CardContent>
          </Card>
        ))}
      </section>

      <section className="space-y-2 border-t pt-4">
        <h3 className="text-sm font-medium">Adicionar participante</h3>
        <div className="space-y-5">
          <div className="space-y-2">
            <Label htmlFor="buscar-pessoa-projeto">Pessoa</Label>
            <div className="relative max-w-md">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                id="buscar-pessoa-projeto"
                value={buscaPessoa}
                onChange={(e) => setBuscaPessoa(e.target.value)}
                placeholder="Buscar por nome"
                className="pl-9"
                disabled={!podeGerenciar}
              />
            </div>

            {candidatos.length === 0 ? (
              <p className="text-sm text-muted-foreground">Todos já participam deste projeto.</p>
            ) : !haPessoaComAcesso ? (
              <p className="text-sm text-muted-foreground">Ninguém mais com acesso ao sistema.</p>
            ) : disponiveis.length === 0 ? (
              <p className="text-sm text-muted-foreground">Nenhuma pessoa encontrada para esta busca.</p>
            ) : null}

            {disponiveis.length > 0 && (
              <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
                {disponiveis.map((p) => {
                  const selecionada = novaPessoa === p.user_id;
                  const desabilitada = !p.tem_acesso || !p.user_id || !podeGerenciar;
                  return (
                    <Button
                      key={p.pessoa_id}
                      type="button"
                      variant="outline"
                      disabled={desabilitada}
                      onClick={() => p.user_id && setNovaPessoa(p.user_id)}
                      className={cn(
                        "h-auto min-h-24 items-start justify-start whitespace-normal p-3 text-left",
                        selecionada && "border-primary bg-primary/5 ring-1 ring-primary/30",
                        !p.tem_acesso && "disabled:opacity-60"
                      )}
                    >
                      <span className="min-w-0 space-y-1">
                        <span className="block truncate text-sm font-medium">{p.nome}</span>
                        <span className="block text-xs font-normal text-muted-foreground">
                          {[p.cargo, p.departamento].filter(Boolean).join(" · ") || "Cargo e departamento não informados"}
                        </span>
                        {p.gestor_nome && (
                          <span className="block text-[11px] font-normal text-muted-foreground">reporta a {p.gestor_nome}</span>
                        )}
                        {!p.tem_acesso && (
                          <span className="block text-[11px] font-medium text-destructive">sem acesso ao sistema</span>
                        )}
                      </span>
                    </Button>
                  );
                })}
              </div>
            )}
          </div>

          <div className="space-y-2">
            <Label>Papel</Label>
            <div className="grid gap-2 md:grid-cols-3">
              {(papeis ?? []).map((p) => (
                <Button
                  key={p.codigo}
                  type="button"
                  variant="outline"
                  disabled={!podeGerenciar}
                  onClick={() => setNovoPapel(p.codigo)}
                  className={cn(
                    "h-auto min-h-24 items-start justify-start whitespace-normal p-3 text-left",
                    novoPapel === p.codigo && "border-primary bg-primary/5 ring-1 ring-primary/30"
                  )}
                >
                  <span className="space-y-1">
                    <span className="block text-sm font-medium">{p.nome}</span>
                    <span className="block text-xs font-normal text-muted-foreground">
                      {p.descricao || "Sem descrição cadastrada."}
                    </span>
                  </span>
                </Button>
              ))}
            </div>
          </div>

          <Button
            size="sm"
            disabled={!podeGerenciar || !novaPessoa || !novoPapel || adicionar.isPending}
            onClick={async () => {
              await adicionar.mutateAsync({ userId: novaPessoa, papel: novoPapel });
              setNovaPessoa(""); setNovoPapel(""); setBuscaPessoa("");
            }}
          >
            <Plus className="mr-1 h-4 w-4" />
            {pessoaEscolhida && papelEscolhido
              ? `Adicionar ${pessoaEscolhida.nome} como ${papelEscolhido.nome}`
              : "Escolha uma pessoa e um papel"}
          </Button>
        </div>
      </section>
    </div>
  );
}
