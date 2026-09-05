/**
 * ENTRADAS A RECONHECER — o que a varredura automática não reconheceu.
 *
 * Um clique ensina o sistema: ao dizer "é deste cliente", o pagador passa a
 * ser reconhecido sozinho nas próximas vezes.
 */
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { AlertTriangle, Check, ChevronsUpDown, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { formatBRL } from "@/lib/format-currency";
import { cn } from "@/lib/utils";
import {
  useAtribuirClienteExtrato,
  useClientesBusca,
  useEntradasReconhecer,
  type EntradaReconhecer,
} from "@/hooks/financeiro/useContaCliente";

function dataBR(iso: string | null | undefined) {
  if (!iso) return "—";
  const [a, m, d] = iso.slice(0, 10).split("-");
  return `${d}/${m}/${a}`;
}

function diasNaFila(iso: string) {
  const t = new Date(iso.slice(0, 10) + "T12:00:00").getTime();
  const hoje = new Date(new Date().toLocaleDateString("en-CA") + "T12:00:00").getTime();
  return Math.max(0, Math.round((hoje - t) / 86400000));
}

function AtribuirCliente({ entrada }: { entrada: EntradaReconhecer }) {
  const [open, setOpen] = useState(false);
  const [busca, setBusca] = useState("");
  const { data: opcoes = [], isLoading } = useClientesBusca(busca);
  const atribuir = useAtribuirClienteExtrato();

  async function confirmar(id: string, nome: string) {
    try {
      const res = await atribuir.mutateAsync({ movimentacao_id: entrada.id, parceiro_id: id });
      setOpen(false);
      toast.success(
        `${formatBRL(res.valor ?? entrada.valor)} creditado na conta de ${nome}` +
          (res.pagador_aprendido
            ? " · pagador aprendido — próxima vez é automático"
            : ""),
      );
    } catch (e: any) {
      toast.error("Não foi possível atribuir esta entrada", {
        description: e?.message ?? "Erro desconhecido.",
      });
    }
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button size="sm" variant="outline" className="h-7 gap-1.5 text-xs" disabled={atribuir.isPending}>
          {atribuir.isPending ? (
            <Loader2 className="h-3 w-3 animate-spin" />
          ) : (
            <ChevronsUpDown className="h-3 w-3" />
          )}
          É deste cliente
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[320px] p-0" align="end">
        <Command shouldFilter={false}>
          <CommandInput
            placeholder="Buscar cliente por nome ou CNPJ"
            value={busca}
            onValueChange={setBusca}
          />
          <CommandList>
            {isLoading ? (
              <div className="p-3 text-xs text-muted-foreground flex items-center gap-2">
                <Loader2 className="h-3 w-3 animate-spin" /> buscando
              </div>
            ) : (
              <CommandEmpty>Nenhum cliente encontrado.</CommandEmpty>
            )}
            <CommandGroup>
              {opcoes.map((c) => (
                <CommandItem key={c.id} value={c.id} onSelect={() => confirmar(c.id, c.nome)}>
                  <Check className="mr-2 h-3.5 w-3.5 opacity-0" />
                  <span className="text-xs">{c.nome}</span>
                  {c.cnpj && (
                    <span className="ml-auto text-[10px] text-muted-foreground">{c.cnpj}</span>
                  )}
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

export function EntradasReconhecerTab() {
  const { data: entradas, isLoading, isError, error } = useEntradasReconhecer();

  const total = useMemo(
    () => (entradas ?? []).reduce((s, e) => s + Number(e.valor ?? 0), 0),
    [entradas],
  );

  return (
    <div className="space-y-3">
      <p className="text-[11px] text-muted-foreground leading-relaxed max-w-3xl">
        A varredura automática roda de hora em hora (documento do pagador, pagadores conhecidos e
        chaves de comprovante). O que aparece aqui é o que ela não reconheceu — um clique ensina o
        sistema.
      </p>

      {isError && (
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>Não foi possível carregar a fila</AlertTitle>
          <AlertDescription>{(error as any)?.message ?? "Erro desconhecido."}</AlertDescription>
        </Alert>
      )}

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div className="rounded-md border border-border/60 p-2.5">
          <p className="text-[11px] text-muted-foreground">Entradas na fila</p>
          <p className="text-sm font-medium">{isError ? "—" : (entradas ?? []).length}</p>
        </div>
        <div className="rounded-md border border-border/60 p-2.5">
          <p className="text-[11px] text-muted-foreground">Valor a reconhecer</p>
          <p className="text-sm font-medium text-warning">{isError ? "—" : formatBRL(total)}</p>
        </div>
      </div>

      {isLoading ? (
        <div className="space-y-2">
          {[0, 1, 2, 3, 4].map((i) => (
            <Skeleton key={i} className="h-9 w-full" />
          ))}
        </div>
      ) : (
        <div className="rounded-md border border-border/60">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Data</TableHead>
                <TableHead className="text-right">Valor</TableHead>
                <TableHead>Pagador</TableHead>
                <TableHead>Documento</TableHead>
                <TableHead>Descrição</TableHead>
                <TableHead className="text-right">Dias na fila</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {(entradas ?? []).length === 0 && (
                <TableRow>
                  <TableCell colSpan={7} className="text-center text-xs text-muted-foreground py-6">
                    Nada pendente — a varredura reconheceu tudo.
                  </TableCell>
                </TableRow>
              )}
              {(entradas ?? []).map((e) => {
                const dias = diasNaFila(e.data_transacao);
                return (
                  <TableRow key={e.id}>
                    <TableCell className="text-xs">{dataBR(e.data_transacao)}</TableCell>
                    <TableCell className="text-right text-xs font-medium">
                      {formatBRL(e.valor)}
                    </TableCell>
                    <TableCell className="text-xs">{e.contraparte_nome ?? "—"}</TableCell>
                    <TableCell className="text-xs">{e.contraparte_documento ?? "—"}</TableCell>
                    <TableCell
                      className="text-xs text-muted-foreground max-w-[280px] truncate"
                      title={e.descricao}
                    >
                      {e.descricao}
                    </TableCell>
                    <TableCell
                      className={cn(
                        "text-right text-xs",
                        dias >= 7 ? "text-warning font-medium" : "",
                      )}
                    >
                      {dias}
                    </TableCell>
                    <TableCell className="text-right">
                      <AtribuirCliente entrada={e} />
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}
