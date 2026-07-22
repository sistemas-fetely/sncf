import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Plus, Pencil, Trash2, Loader2, Search } from "lucide-react";
import {
  useOcorrenciaDepara,
  type OcorrenciaDeparaRow,
  type OcorrenciaTipoRow,
} from "@/hooks/logistica/useOcorrenciaDepara";

function classeBadge(classe: string | undefined) {
  const map: Record<string, string> = {
    entregue: "bg-success/10 text-success border-success/30",
    em_transito: "bg-info/10 text-info border-info/30",
    coletado: "bg-info/10 text-info border-info/30",
    atencao: "bg-warning/10 text-warning border-warning/30",
  };
  return map[classe ?? ""] ?? "bg-muted text-muted-foreground border-border";
}

interface Props {
  transportadoraId: string;
}

export function OcorrenciasDepara({ transportadoraId }: Props) {
  const { lista, tipos, criar, editar, toggleAtivo, excluir } = useOcorrenciaDepara(transportadoraId);
  const [busca, setBusca] = useState("");
  const [editando, setEditando] = useState<OcorrenciaDeparaRow | null>(null);
  const [abrirNovo, setAbrirNovo] = useState(false);

  const tiposById = useMemo(() => {
    const m = new Map<string, OcorrenciaTipoRow>();
    for (const t of tipos.data ?? []) m.set(t.codigo, t);
    return m;
  }, [tipos.data]);

  const linhas = useMemo(() => {
    const q = busca.trim().toUpperCase();
    return (lista.data ?? []).filter((r) => {
      if (!q) return true;
      return (
        r.texto_padrao.toUpperCase().includes(q) ||
        r.codigo.toUpperCase().includes(q) ||
        (tiposById.get(r.codigo)?.descricao ?? "").toUpperCase().includes(q)
      );
    });
  }, [lista.data, busca, tiposById]);

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Buscar texto, código ou descrição…"
            className="pl-8"
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
          />
        </div>
        <div className="flex-1" />
        <Button onClick={() => setAbrirNovo(true)} className="gap-2">
          <Plus className="h-4 w-4" /> Nova regra
        </Button>
      </div>

      <div className="rounded-lg border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Texto padrão (upper)</TableHead>
              <TableHead>Código</TableHead>
              <TableHead>Descrição</TableHead>
              <TableHead>Classe</TableHead>
              <TableHead>Ativo</TableHead>
              <TableHead className="w-[110px] text-right">Ações</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {lista.isLoading && (
              <TableRow>
                <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin inline mr-2" /> Carregando…
                </TableCell>
              </TableRow>
            )}
            {!lista.isLoading && linhas.length === 0 && (
              <TableRow>
                <TableCell colSpan={6} className="text-center py-8 text-muted-foreground text-sm">
                  Nenhuma regra cadastrada.
                </TableCell>
              </TableRow>
            )}
            {linhas.map((r) => {
              const t = tiposById.get(r.codigo);
              return (
                <TableRow key={r.id}>
                  <TableCell className="font-mono text-xs">{r.texto_padrao}</TableCell>
                  <TableCell className="font-mono">{r.codigo}</TableCell>
                  <TableCell>{t?.descricao ?? <span className="text-muted-foreground">—</span>}</TableCell>
                  <TableCell>
                    {t?.classe ? (
                      <Badge variant="outline" className={classeBadge(t.classe)}>{t.classe}</Badge>
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </TableCell>
                  <TableCell>
                    <Switch
                      checked={r.ativo}
                      onCheckedChange={(v) => toggleAtivo.mutate({ id: r.id, ativo: v })}
                    />
                  </TableCell>
                  <TableCell className="text-right">
                    <Button variant="ghost" size="icon" onClick={() => setEditando(r)}>
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => {
                        if (confirm(`Excluir regra "${r.texto_padrao}"?`)) excluir.mutate(r.id);
                      }}
                    >
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>

      {(abrirNovo || editando) && (
        <FormDialog
          open
          onClose={() => {
            setAbrirNovo(false);
            setEditando(null);
          }}
          tipos={tipos.data ?? []}
          registro={editando}
          salvando={criar.isPending || editar.isPending}
          onSubmit={async (v) => {
            if (editando) {
              await editar.mutateAsync({ id: editando.id, ...v });
            } else {
              await criar.mutateAsync(v);
            }
            setAbrirNovo(false);
            setEditando(null);
          }}
        />
      )}
    </div>
  );
}

function FormDialog({
  open,
  onClose,
  tipos,
  registro,
  salvando,
  onSubmit,
}: {
  open: boolean;
  onClose: () => void;
  tipos: OcorrenciaTipoRow[];
  registro: OcorrenciaDeparaRow | null;
  salvando: boolean;
  onSubmit: (v: { texto_padrao: string; codigo: string; ativo: boolean }) => Promise<void>;
}) {
  const [texto, setTexto] = useState(registro?.texto_padrao ?? "");
  const [codigo, setCodigo] = useState(registro?.codigo ?? "");
  const [ativo, setAtivo] = useState(registro?.ativo ?? true);

  return (
    <Dialog open={open} onOpenChange={(v) => (!v ? onClose() : null)}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{registro ? "Editar regra" : "Nova regra de ocorrência"}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label>Texto padrão (gravado em MAIÚSCULAS)</Label>
            <Input
              value={texto}
              onChange={(e) => setTexto(e.target.value.toUpperCase())}
              placeholder="Ex.: ENTREGA REALIZADA"
              autoFocus
            />
          </div>
          <div className="space-y-1.5">
            <Label>Código</Label>
            <Select value={codigo} onValueChange={setCodigo}>
              <SelectTrigger>
                <SelectValue placeholder="Selecione um código…" />
              </SelectTrigger>
              <SelectContent className="max-h-72">
                {tipos.map((t) => (
                  <SelectItem key={t.id} value={t.codigo}>
                    {t.codigo} — {t.descricao} ({t.classe})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex items-center gap-2">
            <Switch checked={ativo} onCheckedChange={setAtivo} id="ativo-sw" />
            <Label htmlFor="ativo-sw">Ativo</Label>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={salvando}>Cancelar</Button>
          <Button
            disabled={!texto.trim() || !codigo || salvando}
            onClick={() => onSubmit({ texto_padrao: texto, codigo, ativo })}
          >
            {salvando ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
            Salvar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
