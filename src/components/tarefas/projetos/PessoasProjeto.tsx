import { useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useNomePessoa } from "@/components/tarefas/detalhe/comuns";
import { usePessoasSistema } from "@/hooks/tarefas/useTarefasCatalogos";
import { usePodeGerenciarProjeto, useProjeto } from "@/hooks/tarefas/useProjetosTarefas";
import {
  useAdicionarMembro, useMembrosProjeto, usePapeisProjeto, useRemoverMembro, useTrocarPapelMembro,
} from "@/hooks/tarefas/useProjetoMembros";

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
  const { data: pessoas } = usePessoasSistema();
  const nomePessoa = useNomePessoa();

  const adicionar = useAdicionarMembro(projetoId);
  const trocar = useTrocarPapelMembro(projetoId);
  const remover = useRemoverMembro(projetoId);

  const [novaPessoa, setNovaPessoa] = useState("");
  const [novoPapel, setNovoPapel] = useState("");

  const papelEscolhido = papeis?.find((p) => p.codigo === novoPapel);
  const rotuloPapel = (codigo: string) => papeis?.find((p) => p.codigo === codigo)?.nome ?? codigo;

  // responsável e criador têm acesso por outra via — aparecem fixos, sem remover
  const fixos = [
    { id: projeto?.responsavel_id ?? null, vinculo: "Responsável" },
    { id: projeto?.criado_por ?? null, vinculo: "Criador" },
  ].filter((f, i, arr) => f.id && arr.findIndex((x) => x.id === f.id) === i) as {
    id: string;
    vinculo: string;
  }[];

  const disponiveis = (pessoas ?? []).filter(
    (p) => !(membros ?? []).some((m) => m.user_id === p.id) && !fixos.some((f) => f.id === p.id)
  );

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
                <p className="truncate text-sm font-medium">{nomePessoa(f.id)}</p>
                <p className="text-xs text-muted-foreground">Acesso pelo próprio vínculo com o projeto</p>
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
                <p className="truncate text-sm font-medium">{nomePessoa(m.user_id)}</p>
                <p className="text-xs text-muted-foreground">
                  {rotuloPapel(m.papel)} · desde {dataBr(m.desde)}
                </p>
              </div>
              <Select
                value={m.papel}
                disabled={!podeGerenciar}
                onValueChange={(v) => trocar.mutate({ id: m.id, papel: v })}
              >
                <SelectTrigger className="h-8 w-48 text-sm"><SelectValue /></SelectTrigger>
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
        <div className="flex flex-wrap items-end gap-2">
          <div className="space-y-1">
            <Label>Pessoa</Label>
            <Select value={novaPessoa} onValueChange={setNovaPessoa} disabled={!podeGerenciar}>
              <SelectTrigger className="h-9 w-64">
                <SelectValue placeholder="Escolher pessoa" />
              </SelectTrigger>
              <SelectContent>
                {disponiveis.map((p) => (
                  <SelectItem key={p.id} value={p.id}>{p.nome}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label>Papel</Label>
            <Select value={novoPapel} onValueChange={setNovoPapel} disabled={!podeGerenciar}>
              <SelectTrigger className="h-9 w-56">
                <SelectValue placeholder="Escolher papel" />
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
          </div>
          <Button
            size="sm"
            disabled={!podeGerenciar || !novaPessoa || !novoPapel || adicionar.isPending}
            onClick={async () => {
              await adicionar.mutateAsync({ userId: novaPessoa, papel: novoPapel });
              setNovaPessoa(""); setNovoPapel("");
            }}
          >
            <Plus className="mr-1 h-4 w-4" /> Adicionar
          </Button>
        </div>
        {papelEscolhido?.descricao && (
          <p className="text-xs text-muted-foreground">{papelEscolhido.descricao}</p>
        )}
      </section>
    </div>
  );
}
