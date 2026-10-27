import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Loader2, Info } from "lucide-react";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { importarCteXml, type CteXmlResultado } from "@/hooks/logistica/cteXmlImportar";

type Linha = { nome: string; xml: string; r: CteXmlResultado };

const brl = (v: number | null) =>
  v == null ? "—" : v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const dataBR = (s: string | null) => {
  if (!s) return "—";
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? s : d.toLocaleDateString("pt-BR");
};

function erroLinha(nome: string, e: unknown): CteXmlResultado {
  return {
    ok: false, status: "erro", erro: e instanceof Error ? e.message : String(e), arquivo: nome,
    transportadora: null, cte_numero: null, cte_serie: null, emissao: null, tipo_frete: null,
    origem: null, destino: null, destinatario: null, frete_total: null, frete_peso: null,
    peso_taxado: null, volumes: null, valor_nf: null, nfs: null, pedido: null,
    componentes: null, componentes_nao_mapeados: null,
  };
}

function SeloAmbar({ texto, tip }: { texto: string; tip: string }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span className="inline-flex items-center gap-1">
          <Badge variant="outline" className="border-warning/40 text-warning text-[10px] px-1.5 py-0">{texto}</Badge>
          <Info className="h-3 w-3 text-muted-foreground" />
        </span>
      </TooltipTrigger>
      <TooltipContent className="max-w-xs">{tip}</TooltipContent>
    </Tooltip>
  );
}

function SeloStatus({ r }: { r: CteXmlResultado }) {
  if (r.status === "previa") return <Badge variant="outline" className="border-info/40 text-info">Novo</Badge>;
  if (r.status === "importado") return <Badge variant="outline" className="border-success/40 text-success">Importado</Badge>;
  if (r.status === "duplicado") return <Badge variant="secondary" className="text-muted-foreground">Já importado</Badge>;
  return (
    <div className="space-y-1">
      <Badge variant="destructive">Erro</Badge>
      {r.erro && <div className="text-xs text-destructive">{r.erro}</div>}
    </div>
  );
}

export function ImportarCteXmlDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
  const qc = useQueryClient();
  const [linhas, setLinhas] = useState<Linha[]>([]);
  const [lendo, setLendo] = useState(false);
  const [importando, setImportando] = useState(false);
  const [concluido, setConcluido] = useState(false);

  const novos = linhas.filter((l) => l.r.status === "previa");

  async function selecionar(files: FileList | null) {
    if (!files?.length) return;
    setLendo(true);
    setConcluido(false);
    const out: Linha[] = [];
    for (const f of Array.from(files)) {
      let xml = "";
      try {
        xml = await f.text();
        out.push({ nome: f.name, xml, r: await importarCteXml(xml, f.name, true) });
      } catch (e) {
        out.push({ nome: f.name, xml, r: erroLinha(f.name, e) });
      }
    }
    setLinhas(out);
    setLendo(false);
  }

  async function confirmar() {
    setImportando(true);
    const out = [...linhas];
    let ok = 0, falhas = 0;
    for (let i = 0; i < out.length; i++) {
      if (out[i].r.status !== "previa") continue;
      try {
        const r = await importarCteXml(out[i].xml, out[i].nome, false);
        out[i] = { ...out[i], r };
        if (r.status === "importado") ok++; else if (r.status === "erro") falhas++;
      } catch (e) {
        out[i] = { ...out[i], r: erroLinha(out[i].nome, e) };
        falhas++;
      }
    }
    setLinhas(out);
    setImportando(false);
    setConcluido(true);
    await qc.invalidateQueries({ queryKey: ["logistica", "fretes"] });
    if (falhas) toast.error(`${ok} CT-e(s) importado(s), ${falhas} com erro.`);
    else toast.success(`${ok} CT-e(s) importado(s).`);
  }

  function fechar(v: boolean) {
    if (!v) { setLinhas([]); setConcluido(false); }
    onOpenChange(v);
  }

  return (
    <Dialog open={open} onOpenChange={fechar}>
      <DialogContent className="max-w-6xl">
        <DialogHeader>
          <DialogTitle>Importar XML de CT-e</DialogTitle>
          <DialogDescription>A transportadora é identificada pelo CNPJ do emitente de cada CT-e.</DialogDescription>
        </DialogHeader>

        <input type="file" multiple accept=".xml" disabled={lendo || importando}
          onChange={(e) => { selecionar(e.target.files); e.target.value = ""; }}
          className="text-sm" />

        {lendo && <div className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Lendo arquivos…</div>}

        {linhas.length > 0 && (
          <TooltipProvider>
            <div className="rounded-md border bg-card max-h-[55vh] overflow-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Arquivo</TableHead>
                    <TableHead>Transportadora</TableHead>
                    <TableHead>CT-e</TableHead>
                    <TableHead>Emissão</TableHead>
                    <TableHead>Destino</TableHead>
                    <TableHead className="text-right">Peso taxado</TableHead>
                    <TableHead className="text-right">Frete peso</TableHead>
                    <TableHead className="text-right">Frete total</TableHead>
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {linhas.map((l, i) => {
                    const r = l.r;
                    const naoMap = r.componentes_nao_mapeados ?? [];
                    return (
                      <TableRow key={i}>
                        <TableCell className="text-xs max-w-[180px] truncate" title={l.nome}>{l.nome}</TableCell>
                        <TableCell>{r.transportadora ?? "—"}</TableCell>
                        <TableCell>{r.cte_numero ? `${r.cte_numero}/${r.cte_serie ?? "—"}` : "—"}</TableCell>
                        <TableCell>{dataBR(r.emissao)}</TableCell>
                        <TableCell>{r.destino ?? "—"}</TableCell>
                        <TableCell className="text-right">{r.peso_taxado == null ? "—" : `${r.peso_taxado.toLocaleString("pt-BR")} kg`}</TableCell>
                        <TableCell className="text-right">{brl(r.frete_peso)}</TableCell>
                        <TableCell className="text-right">{brl(r.frete_total)}</TableCell>
                        <TableCell>
                          <div className="flex flex-col gap-1 items-start">
                            <SeloStatus r={r} />
                            {r.pedido && <span className="text-xs text-muted-foreground">Pedido {r.pedido}</span>}
                            {naoMap.length > 0 && (
                              <SeloAmbar texto="Componente não mapeado"
                                tip={`${naoMap.join(", ")} — entram em "outros valores".`} />
                            )}
                            {r.status === "previa" && r.frete_peso == null && (
                              <SeloAmbar texto="Sem frete-peso" tip="Esse CT-e não entra na calibração da tabela" />
                            )}
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          </TooltipProvider>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => fechar(false)} disabled={importando}>
            {concluido ? "Fechar" : "Cancelar"}
          </Button>
          {!concluido && (
            <Button onClick={confirmar} disabled={novos.length === 0 || importando || lendo}>
              {importando && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
              Importar {novos.length} CT-e{novos.length === 1 ? "" : "s"}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
