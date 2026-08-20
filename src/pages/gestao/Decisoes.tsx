import { useState } from "react";
import { Gavel, Lock } from "lucide-react";
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
import { useProjetos } from "@/hooks/tarefas/useTarefasCatalogos";
import {
  STATUS_DECISAO_ROTULO, useDecisoes, useRegistrarRevisaoDecisao, type Decisao,
} from "@/hooks/gestao/useDecisoes";

const TODOS = "__todos__";

function dataBR(iso: string | null | undefined) {
  if (!iso) return "—";
  return iso.slice(0, 10).split("-").reverse().join("/");
}

export default function Decisoes() {
  const [status, setStatus] = useState(TODOS);
  const [projeto, setProjeto] = useState(TODOS);
  const { data: decisoes, isLoading, error } = useDecisoes({
    status: status === TODOS ? null : status,
    projetoId: projeto === TODOS ? null : projeto,
  });
  const { data: projetos } = useProjetos();
  const revisar = useRegistrarRevisaoDecisao();

  const [alvo, setAlvo] = useState<Decisao | null>(null);
  const [titulo, setTitulo] = useState("");
  const [contexto, setContexto] = useState("");
  const [texto, setTexto] = useState("");
  const [reversivel, setReversivel] = useState(true);

  function abrirRevisao(d: Decisao) {
    setAlvo(d);
    setTitulo(`Revisão — ${d.titulo}`);
    setContexto(d.contexto ?? "");
    setTexto("");
    setReversivel(d.reversivel ?? true);
  }

  const nomeProjeto = (id: string | null) =>
    (id && (projetos ?? []).find((p) => p.id === id)?.nome) || null;

  return (
    <PageShell>
      <PageTitle
        titulo="Decisões"
        icone={Gavel}
        estado="Histórico do que foi decidido, por qual sala e quando. Decisão carimbada em reunião fechada não se edita — se revisa."
      />

      <div className="flex flex-wrap items-center gap-2">
        <Select value={status} onValueChange={setStatus}>
          <SelectTrigger className="h-8 w-[180px]"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value={TODOS}>Todos os status</SelectItem>
            {Object.entries(STATUS_DECISAO_ROTULO).map(([v, r]) => (
              <SelectItem key={v} value={v}>{r}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={projeto} onValueChange={setProjeto}>
          <SelectTrigger className="h-8 w-[220px]"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value={TODOS}>Todos os projetos</SelectItem>
            {(projetos ?? []).map((p) => (
              <SelectItem key={p.id} value={p.id}>{p.nome}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {error ? (
        <p className="text-sm text-destructive">
          Não foi possível carregar as decisões: {(error as Error).message}
        </p>
      ) : isLoading ? (
        <p className="text-sm text-muted-foreground">Carregando decisões…</p>
      ) : (decisoes ?? []).length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-2 p-10 text-center">
            <Gavel className="h-8 w-8 text-muted-foreground" />
            <p className="text-sm text-muted-foreground">
              Nenhuma decisão registrada. Decisões nascem dentro da reunião, em "Registrar decisão" —
              é assim que elas ficam ligadas à sala e à ata.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {(decisoes ?? []).map((d) => {
            const carimbada = !!d.reuniao_id;
            return (
              <Card key={d.id}>
                <CardContent className="space-y-2 p-3">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <p className="min-w-0 flex-1 truncate font-medium">{d.titulo}</p>
                    <Badge variant="outline" className="rounded px-1.5 py-0 text-[10px]">
                      {STATUS_DECISAO_ROTULO[d.status] ?? d.status}
                    </Badge>
                    {d.reversivel === false && (
                      <Badge variant="destructive" className="rounded px-1.5 py-0 text-[10px]">
                        Irreversível
                      </Badge>
                    )}
                    {carimbada && (
                      <Badge variant="outline" className="rounded px-1.5 py-0 text-[10px]">
                        <Lock className="mr-1 h-3 w-3" /> Carimbada em reunião
                      </Badge>
                    )}
                    {d.revisao_de_id && (
                      <Badge variant="secondary" className="rounded px-1.5 py-0 text-[10px]">
                        Revisão de decisão anterior
                      </Badge>
                    )}
                  </div>

                  <p className="text-sm">{d.decisao}</p>
                  {d.contexto && <p className="text-xs text-muted-foreground">{d.contexto}</p>}
                  <p className="text-[11px] text-muted-foreground">
                    Decidida em {dataBR(d.decidida_em)}
                    {nomeProjeto(d.projeto_id) ? ` · ${nomeProjeto(d.projeto_id)}` : ""}
                    {d.revisitar_em ? ` · revisitar em ${dataBR(d.revisitar_em)}` : ""}
                  </p>

                  {d.status === "vigente" && (
                    <Button size="sm" variant="outline" onClick={() => abrirRevisao(d)}>
                      Registrar revisão
                    </Button>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      <Dialog open={!!alvo} onOpenChange={(v) => !v && setAlvo(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Registrar revisão</DialogTitle>
            <DialogDescription>
              Nasce uma decisão nova apontando para a antiga, e a antiga passa a "Revista". A decisão
              original continua no histórico, intacta.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label>Título</Label>
              <Input value={titulo} onChange={(e) => setTitulo(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>Contexto</Label>
              <Textarea rows={2} value={contexto} onChange={(e) => setContexto(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>Nova decisão</Label>
              <Textarea rows={3} value={texto} onChange={(e) => setTexto(e.target.value)} />
            </div>
            <div className="flex items-center justify-between rounded border border-border p-2">
              <Label>Reversível</Label>
              <Switch checked={reversivel} onCheckedChange={setReversivel} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAlvo(null)}>Voltar</Button>
            <Button
              disabled={!titulo.trim() || !texto.trim() || revisar.isPending}
              onClick={() => {
                if (!alvo) return;
                revisar.mutate(
                  {
                    original: alvo,
                    valores: {
                      titulo: titulo.trim(),
                      contexto: contexto.trim() || null,
                      decisao: texto.trim(),
                      projeto_id: alvo.projeto_id,
                      reversivel,
                      revisitar_em: null,
                    },
                  },
                  { onSuccess: () => setAlvo(null) },
                );
              }}
            >
              Registrar revisão
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </PageShell>
  );
}
