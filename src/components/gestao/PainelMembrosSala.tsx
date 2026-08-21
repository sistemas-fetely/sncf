import { useMemo, useState } from "react";
import { Check, ChevronsUpDown, Trash2, UserPlus } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList,
} from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import {
  PAPEL_ROTULO, useAdicionarMembro, useRemoverMembro, useTrocarPapelMembro,
  type PapelMembro, type SalaMembro,
} from "@/hooks/gestao/useGestaoSalas";
import { usePessoasGestao, type PessoaGestao } from "@/hooks/gestao/usePessoasGestao";

const MSG_ULTIMO_FACILITADOR =
  "A sala ficaria sem facilitador e ninguém conseguiria fechar reunião.";

const PAPEIS: PapelMembro[] = ["facilitador", "membro", "convidado"];

interface Props {
  salaId: string;
  membros: SalaMembro[];
  ehFacilitador: boolean;
}

/** Painel de membros: visível a todos da sala, editável só pelo facilitador. */
export function PainelMembrosSala({ salaId, membros, ehFacilitador }: Props) {
  const { data: pessoas } = usePessoasGestao();
  const adicionar = useAdicionarMembro();
  const trocarPapel = useTrocarPapelMembro();
  const remover = useRemoverMembro();

  const [popoverAberto, setPopoverAberto] = useState(false);
  const [novoId, setNovoId] = useState<string | null>(null);
  const [novoPapel, setNovoPapel] = useState<PapelMembro>("membro");
  const [removendo, setRemovendo] = useState<SalaMembro | null>(null);

  const pessoaPorId = useMemo(() => {
    const m = new Map<string, PessoaGestao>();
    (pessoas ?? []).forEach((p) => m.set(p.pessoa_id, p));
    return m;
  }, [pessoas]);

  const candidatos = useMemo(() => {
    const jaMembros = new Set(membros.map((m) => m.pessoa_id));
    return (pessoas ?? []).filter((p) => !jaMembros.has(p.pessoa_id));
  }, [pessoas, membros]);

  const totalFacilitadores = membros.filter((m) => m.papel === "facilitador").length;
  // ULTIMO-FACILITADOR-NAO-SAI (20/08/2026): remover ou rebaixar o último
  // facilitador trava a sala — ninguém mais consegue fechar reunião.
  const ehUltimoFacilitador = (m: SalaMembro) =>
    m.papel === "facilitador" && totalFacilitadores === 1;

  const novoSelecionado = novoId ? pessoaPorId.get(novoId) : null;

  return (
    <Card>
      <CardContent className="space-y-3 p-4">
        <div className="flex items-center justify-between gap-2">
          <p className="text-sm font-medium">Membros da sala ({membros.length})</p>
          {!ehFacilitador && (
            <p className="text-[11px] text-muted-foreground">Só o facilitador gerencia membros.</p>
          )}
        </div>

        {membros.length === 0 ? (
          <p className="text-xs text-muted-foreground">
            Sala sem membros: sem membros não há presença para marcar nem ata para quem enviar.
            {ehFacilitador ? " Adicione abaixo quem participa do rito." : ""}
          </p>
        ) : (
          <div className="space-y-1.5">
            {membros.map((m) => {
              const p = pessoaPorId.get(m.pessoa_id);
              const nome = p?.nome ?? "Pessoa fora do catálogo";
              return (
                <div
                  key={m.pessoa_id}
                  className="flex items-center gap-2 rounded border border-border px-2 py-1.5"
                >
                  <Avatar className="h-6 w-6 shrink-0">
                    {p?.avatar_url && <AvatarImage src={p.avatar_url} alt={nome} />}
                    <AvatarFallback className="text-[10px]">
                      {nome.slice(0, 2).toUpperCase()}
                    </AvatarFallback>
                  </Avatar>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm">{nome}</p>
                    <p className="truncate text-[11px] text-muted-foreground">
                      {p?.cargo ?? "—"}
                      {p?.departamento ? ` · ${p.departamento}` : ""}
                    </p>
                  </div>
                  {p && !p.tem_login && (
                    <Badge variant="outline" className="rounded px-1.5 py-0 text-[10px]">
                      sem login
                    </Badge>
                  )}
                  {ehFacilitador ? (
                    <>
                      <Select
                        value={m.papel}
                        onValueChange={(v) => {
                          if (ehUltimoFacilitador(m) && v !== "facilitador") {
                            toast.error(MSG_ULTIMO_FACILITADOR);
                            return;
                          }
                          if (v !== m.papel)
                            trocarPapel.mutate({ salaId, pessoaId: m.pessoa_id, papel: v as PapelMembro });
                        }}
                      >
                        <SelectTrigger className="h-8 w-[130px]">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {PAPEIS.map((papel) => (
                            <SelectItem key={papel} value={papel}>
                              {PAPEL_ROTULO[papel]}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <Button
                        size="icon"
                        variant="ghost"
                        aria-label={`Remover ${nome}`}
                        onClick={() => {
                          if (ehUltimoFacilitador(m)) {
                            toast.error(MSG_ULTIMO_FACILITADOR);
                            return;
                          }
                          setRemovendo(m);
                        }}
                      >
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    </>
                  ) : (
                    <Badge variant="secondary" className="rounded px-1.5 py-0 text-[10px]">
                      {PAPEL_ROTULO[m.papel] ?? m.papel}
                    </Badge>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {ehFacilitador && (
          <div className="flex flex-wrap items-center gap-2 border-t border-border pt-3">
            <Popover open={popoverAberto} onOpenChange={setPopoverAberto}>
              <PopoverTrigger asChild>
                <Button variant="outline" role="combobox" className="h-8 min-w-[220px] justify-between font-normal">
                  {novoSelecionado ? (
                    <span className="truncate">
                      {novoSelecionado.nome}
                      {novoSelecionado.cargo && (
                        <span className="ml-1 text-muted-foreground">· {novoSelecionado.cargo}</span>
                      )}
                    </span>
                  ) : (
                    <span className="text-muted-foreground">Adicionar pessoa…</span>
                  )}
                  <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-[--radix-popover-trigger-width] p-0">
                <Command>
                  <CommandInput placeholder="Buscar pessoa..." />
                  <CommandList>
                    <CommandEmpty>Ninguém encontrado fora da sala.</CommandEmpty>
                    <CommandGroup>
                      {candidatos.map((p) => (
                        <CommandItem
                          key={p.pessoa_id}
                          value={p.nome}
                          onSelect={() => {
                            setNovoId(p.pessoa_id);
                            setPopoverAberto(false);
                          }}
                        >
                          <Check
                            className={cn("mr-2 h-4 w-4", novoId === p.pessoa_id ? "opacity-100" : "opacity-0")}
                          />
                          <span className="flex-1 truncate">
                            {p.nome}
                            {p.cargo && (
                              <span className="ml-1 text-xs text-muted-foreground">· {p.cargo}</span>
                            )}
                          </span>
                          {!p.tem_login && (
                            <span className="text-[10px] text-muted-foreground">sem login</span>
                          )}
                        </CommandItem>
                      ))}
                    </CommandGroup>
                  </CommandList>
                </Command>
              </PopoverContent>
            </Popover>
            <Select value={novoPapel} onValueChange={(v) => setNovoPapel(v as PapelMembro)}>
              <SelectTrigger className="h-8 w-[130px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {PAPEIS.map((papel) => (
                  <SelectItem key={papel} value={papel}>
                    {PAPEL_ROTULO[papel]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button
              size="sm"
              disabled={!novoId || adicionar.isPending}
              onClick={() =>
                adicionar.mutate(
                  { salaId, pessoaId: novoId!, papel: novoPapel },
                  { onSuccess: () => { setNovoId(null); setNovoPapel("membro"); } },
                )
              }
            >
              <UserPlus className="mr-1 h-3.5 w-3.5" /> Adicionar
            </Button>
          </div>
        )}

        <p className="text-[11px] text-muted-foreground">
          Quem está “sem login” não abre o sistema nem marca presença, mas recebe a ata por
          e-mail se tiver e-mail corporativo cadastrado.
        </p>
      </CardContent>

      <AlertDialog open={!!removendo} onOpenChange={(v) => !v && setRemovendo(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remover membro?</AlertDialogTitle>
            <AlertDialogDescription>
              {removendo
                ? `${pessoaPorId.get(removendo.pessoa_id)?.nome ?? "Esta pessoa"} sai da sala e deixa de ver o conteúdo confidencial e de receber a ata.`
                : ""}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Voltar</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                if (!removendo) return;
                remover.mutate(
                  { salaId, pessoaId: removendo.pessoa_id },
                  { onSuccess: () => setRemovendo(null) },
                );
              }}
            >
              Remover
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
}
