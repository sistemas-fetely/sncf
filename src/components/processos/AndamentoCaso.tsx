import { useState } from "react";
import { MessageSquarePlus, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { useAndamentoCaso, useRegistrarAndamento, podeRegistrarAndamento, hojeAndamento, type CasoAndamento } from "@/hooks/processos/useAndamentoCaso";
import { formatError } from "@/lib/format-error";
import { fmtPrazoCurto } from "@/hooks/processos/useProcessoTarefas";

export function RegistrarAndamento({ caso }: { caso: CasoAndamento }) {
  const [aberto, setAberto] = useState(false);
  const [texto, setTexto] = useState("");
  const [data, setData] = useState("");
  const registrar = useRegistrarAndamento();
  const valido = podeRegistrarAndamento(texto, data);
  return <>
    <Button size="sm" variant="ghost" onClick={() => { setTexto(""); setData(""); setAberto(true); }}>
      <MessageSquarePlus className="mr-1 h-3.5 w-3.5" />Registrar andamento
    </Button>
    <Dialog open={aberto} onOpenChange={(v) => { if (!registrar.isPending) setAberto(v); }}>
      <DialogContent>
        <DialogHeader><DialogTitle>Registrar andamento</DialogTitle><DialogDescription>Andamento do caso</DialogDescription></DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5"><Label htmlFor="andamento-texto">O que aconteceu</Label>
            <Textarea id="andamento-texto" required minLength={3} rows={4} value={texto} onChange={(e) => setTexto(e.target.value)} disabled={registrar.isPending} /></div>
          <div className="space-y-1.5"><Label htmlFor="andamento-data">Volto a olhar em</Label>
            <Input id="andamento-data" type="date" min={hojeAndamento()} value={data} onChange={(e) => setData(e.target.value)} disabled={registrar.isPending} />
            <p className="text-xs text-muted-foreground">Até essa data a tarefa fica aguardando e não conta como atrasada.</p>
            {data && data < hojeAndamento() && <p className="text-xs text-destructive">A data não pode estar no passado.</p>}
          </div>
        </div>
        <DialogFooter><Button variant="outline" disabled={registrar.isPending} onClick={() => setAberto(false)}>Voltar</Button>
          <Button disabled={!valido || registrar.isPending} onClick={() => {
            if (!valido) return;
            registrar.mutate({ caso, texto, retomarEm: data }, { onSuccess: () => setAberto(false) });
          }}>{registrar.isPending && <Loader2 className="mr-1 h-4 w-4 animate-spin" />}Confirmar</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  </>;
}

export function AndamentoCaso({ caso, mostrarBotao = true }: { caso: CasoAndamento; mostrarBotao?: boolean }) {
  const q = useAndamentoCaso(caso);
  return <div className="space-y-3 text-sm">
    {mostrarBotao && <RegistrarAndamento caso={caso} />}
    {q.isLoading ? <Skeleton className="h-16 w-full" /> : q.isError ? <p className="text-destructive">{formatError(q.error)}</p> :
      !q.data?.length ? <p className="text-xs text-muted-foreground">Nenhum andamento registrado.</p> :
      <ol className="space-y-3 border-l pl-3">
        {q.data.map((r) => <li key={r.id} className="space-y-1">
          <div className="flex flex-wrap gap-x-2 text-xs">
            <time className="text-muted-foreground">{new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }).format(new Date(r.criado_em)).replace(",", "")}</time>
            <span className="font-medium">{r.autor_nome ?? "Sistema"}</span>
            {r.passo_nome && <span className="text-muted-foreground">{r.passo_nome}</span>}
            {r.retomar_em && <span className="text-muted-foreground">volta em {fmtPrazoCurto(r.retomar_em)}</span>}
          </div>
          <p className="whitespace-pre-line break-words">{r.texto}</p>
        </li>)}
      </ol>}
  </div>;
}