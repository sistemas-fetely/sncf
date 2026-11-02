import { useMemo, useRef, useState } from "react";
import * as XLSX from "xlsx";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Loader2, Upload, AlertCircle, AlertTriangle, ArrowLeft, Search } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import {
  useImportarTabelaPrecoV2,
  type ResultadoImportacaoV2,
  type LadoComparativo,
} from "@/hooks/logistica/useTabelasPreco";
import {
  lerPlanilhaTabelaPreco,
  nomeSugerido,
  payloadTarifa,
  variacaoDestacada,
  variacaoPct,
  type PlanilhaLida,
} from "@/lib/logistica/planilhaTabelaPreco";

const BRL = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
const fmtR = (v: number | null | undefined) => (v === null || v === undefined ? "—" : BRL.format(Number(v)));
const fmtP = (v: number | null | undefined) =>
  v === null || v === undefined ? "—" : `${Number(v).toLocaleString("pt-BR", { maximumFractionDigits: 3 })}%`;
const fmtN = (v: number | null | undefined) => (v === null || v === undefined ? "—" : String(v));

function Celula({ a, b, fmt }: { a: number | null | undefined; b: number | null | undefined; fmt: (v: number | null | undefined) => string }) {
  const v = variacaoPct(a ?? null, b ?? null);
  const destaque = variacaoDestacada(v);
  return (
    <td className={cn("px-2 py-1 text-right tabular-nums align-top", destaque && "bg-warning/15")}>
      <div className="text-muted-foreground">{fmt(a)}</div>
      <div className="font-medium">{fmt(b)}</div>
      {v !== null && Math.abs(v) >= 0.05 && (
        <div className={cn("text-[10px]", destaque ? "text-warning font-semibold" : "text-muted-foreground")}>
          {v > 0 ? "+" : ""}{v.toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%
        </div>
      )}
    </td>
  );
}

const am = (l: LadoComparativo | null | undefined) => l?.amostra ?? null;

export function ImportarTabelaPrecoDialog({
  open,
  onOpenChange,
  transportadoraId,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  transportadoraId: string;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [nome, setNome] = useState("");
  const [vigenciaInicio, setVigenciaInicio] = useState("");
  const [vigenciaDescricao, setVigenciaDescricao] = useState("");
  const [modo, setModo] = useState<"parcial" | "completa">("parcial");
  const [aplicarPrazo, setAplicarPrazo] = useState(true);
  const [lida, setLida] = useState<PlanilhaLida | null>(null);
  const [fileName, setFileName] = useState("");
  const [conferencia, setConferencia] = useState<ResultadoImportacaoV2 | null>(null);

  const mut = useImportarTabelaPrecoV2();

  const comErro = useMemo(() => lida?.tarifas.filter((t) => t.erros.length).length ?? 0, [lida]);
  const comAviso = useMemo(() => lida?.tarifas.filter((t) => t.avisos.length).length ?? 0, [lida]);
  const temPrazo = !!lida?.tarifas.some((t) => t.prazo !== null);
  const hoje = new Date().toISOString().slice(0, 10);
  const vigenciaFutura = !!vigenciaInicio && vigenciaInicio > hoje;

  function reset() {
    setNome(""); setVigenciaInicio(""); setVigenciaDescricao(""); setModo("parcial");
    setAplicarPrazo(true); setLida(null); setFileName(""); setConferencia(null);
    if (fileRef.current) fileRef.current.value = "";
  }

  async function handleFile(f: File) {
    setFileName(f.name);
    setConferencia(null);
    try {
      const wb = XLSX.read(await f.arrayBuffer(), { type: "array" });
      const sheet = wb.Sheets[wb.SheetNames[0]];
      const linhas = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, defval: "", raw: true });
      setLida(lerPlanilhaTabelaPreco(linhas));
      if (!nome.trim()) setNome(nomeSugerido(f.name));
      if (!vigenciaDescricao.trim()) setVigenciaDescricao(`Importada de ${f.name}`);
    } catch (e) {
      setLida(null);
      toast.error("Falha ao ler arquivo: " + (e instanceof Error ? e.message : String(e)));
    }
  }

  const bloqueioPlanilha = !lida || lida.erros.length > 0 || lida.tarifas.length === 0 || comErro > 0;
  const podeConferir = !!nome.trim() && !!vigenciaInicio && !bloqueioPlanilha && !mut.isPending;

  async function enviar(simular: boolean) {
    if (!lida) return;
    try {
      const res = await mut.mutateAsync({
        transportadora_id: transportadoraId,
        nome: nome.trim(),
        vigencia_inicio: vigenciaInicio,
        vigencia_descricao: vigenciaDescricao.trim() || null,
        modo,
        aplicar_prazo: temPrazo && aplicarPrazo,
        tarifas: lida.tarifas.map(payloadTarifa),
        simular,
      });
      if (simular) {
        setConferencia(res);
      } else {
        toast.success(
          `Versão publicada: ${res.resumo.tarifas_trocadas} tarifas trocadas, ${res.resumo.tarifas_mantidas} mantidas, ${res.resumo.ceps_copiados} CEPs`,
        );
        reset();
        onOpenChange(false);
      }
    } catch (e) {
      toast.error((simular ? "Erro na conferência: " : "Erro ao publicar: ") + (e instanceof Error ? e.message : String(e)));
    }
  }

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) reset(); onOpenChange(v); }}>
      <DialogContent className="max-w-6xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{conferencia ? "Conferência antes × depois" : "Nova versão de tabela de preço"}</DialogTitle>
        </DialogHeader>

        {!conferencia ? (
          <div className="space-y-4">
            <section className="rounded-md border p-3 space-y-2">
              <div className="text-sm font-medium">Planilha</div>
              <div className="text-xs text-muted-foreground">
                Aceita o layout de faixas (tarifa_code, uf, zona_nome, ate_10…, fpk, fv_pct, txa) ou o layout por kg
                (código CAPITAL/INTERIOR-UF, prazo, pesos 1…N kg, VALOR EXCEDENTE, ADV, GRIS). O formato é detectado sozinho.
              </div>
              <div className="flex items-center gap-2">
                <Input
                  ref={fileRef}
                  type="file"
                  accept=".xlsx,.xls,.csv"
                  onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); }}
                />
                {fileName && <span className="text-xs text-muted-foreground">{fileName}</span>}
              </div>
            </section>

            <section className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <div>
                <Label>Nome *</Label>
                <Input value={nome} onChange={(e) => setNome(e.target.value)} placeholder="Ex: Reajuste Norte 2026" />
              </div>
              <div>
                <Label>Vigência início *</Label>
                <Input type="date" value={vigenciaInicio} onChange={(e) => setVigenciaInicio(e.target.value)} />
              </div>
              <div>
                <Label>Descrição</Label>
                <Input value={vigenciaDescricao} onChange={(e) => setVigenciaDescricao(e.target.value)} />
              </div>
            </section>

            <section className="rounded-md border p-3 space-y-3">
              <div className="text-sm font-medium">Modo de atualização</div>
              <RadioGroup value={modo} onValueChange={(v) => setModo(v as "parcial" | "completa")} className="space-y-2">
                <label className="flex items-start gap-2 text-sm cursor-pointer">
                  <RadioGroupItem value="parcial" className="mt-0.5" />
                  <span>
                    <span className="font-medium">Atualização parcial</span>
                    <span className="block text-xs text-muted-foreground">
                      Copia a versão ativa inteira (taxas, tarifas, faixas de CEP) e troca só as tarifas que vieram na planilha.
                    </span>
                  </span>
                </label>
                <label className="flex items-start gap-2 text-sm cursor-pointer">
                  <RadioGroupItem value="completa" className="mt-0.5" />
                  <span>
                    <span className="font-medium">Versão completa</span>
                    <span className="block text-xs text-muted-foreground">
                      Substitui todas as tarifas; as faixas de CEP vêm da versão ativa só para os códigos que casarem.
                    </span>
                  </span>
                </label>
              </RadioGroup>
              {temPrazo && (
                <label className="flex items-center gap-2 text-sm cursor-pointer">
                  <Checkbox checked={aplicarPrazo} onCheckedChange={(v) => setAplicarPrazo(v === true)} />
                  Aplicar prazo da planilha às faixas de CEP desse código
                </label>
              )}
            </section>

            {vigenciaFutura && (
              <div className="flex items-start gap-2 rounded-md border border-warning/50 bg-warning/10 p-3 text-sm">
                <AlertTriangle className="h-4 w-4 text-warning mt-0.5 shrink-0" />
                <span>
                  A vigência é futura, mas publicar <strong>ativa hoje</strong> e desliga a versão atual. Até a data de
                  vigência a cotação desta transportadora fica sem tabela válida.
                </span>
              </div>
            )}

            {lida && (
              <section className="space-y-2">
                {lida.erros.map((e) => (
                  <div key={e} className="text-sm text-destructive flex items-center gap-1">
                    <AlertCircle className="h-4 w-4" /> {e}
                  </div>
                ))}
                {lida.layout && (
                  <div className="flex items-center gap-2 text-sm flex-wrap">
                    <Badge variant="outline">Layout: {lida.layout === "por_kg" ? "por kg" : "faixas fixas"}</Badge>
                    <Badge className="bg-success hover:bg-success">{lida.tarifas.length - comErro} válidas</Badge>
                    {comErro > 0 && <Badge variant="destructive">{comErro} com erro — corrija a planilha</Badge>}
                    {comAviso > 0 && <Badge variant="outline" className="border-warning text-warning">{comAviso} com aviso</Badge>}
                  </div>
                )}
                {lida.tarifas.length > 0 && (
                  <div className="max-h-72 overflow-auto border rounded">
                    <table className="w-full text-xs">
                      <thead className="bg-muted/50 sticky top-0">
                        <tr>
                          <th className="text-left px-2 py-1">Linha</th>
                          <th className="text-left px-2 py-1">Código</th>
                          <th className="text-left px-2 py-1">tarifa_code</th>
                          <th className="text-right px-2 py-1">Prazo</th>
                          <th className="text-right px-2 py-1">Faixas</th>
                          <th className="text-right px-2 py-1">Excedente</th>
                          <th className="text-right px-2 py-1">ADV</th>
                          <th className="text-right px-2 py-1">GRIS</th>
                          <th className="text-left px-2 py-1">Erros / avisos</th>
                        </tr>
                      </thead>
                      <tbody>
                        {lida.tarifas.map((t) => (
                          <tr key={t.linha} className={cn("border-t", t.erros.length && "bg-destructive/10")}>
                            <td className="px-2 py-1">{t.linha}</td>
                            <td className="px-2 py-1 font-mono">{t.codigo_original}</td>
                            <td className="px-2 py-1 font-mono">{t.tarifa_code}</td>
                            <td className="px-2 py-1 text-right">{fmtN(t.prazo)}</td>
                            <td className="px-2 py-1 text-right">{Object.keys(t.pesos).length}</td>
                            <td className="px-2 py-1 text-right tabular-nums">{fmtR(t.kg_adicional)}</td>
                            <td className="px-2 py-1 text-right">{fmtP(t.adv_pct)}</td>
                            <td className="px-2 py-1 text-right">{fmtP(t.gris_pct)}</td>
                            <td className="px-2 py-1">
                              {t.erros.map((e) => <div key={e} className="text-destructive">{e}</div>)}
                              {t.avisos.map((e) => <div key={e} className="text-warning">{e}</div>)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </section>
            )}
          </div>
        ) : (
          <div className="space-y-4">
            <div className="text-sm text-muted-foreground">
              Vigente: <span className="text-foreground">{conferencia.vigente_nome}</span> → Nova:{" "}
              <span className="text-foreground">{nome}</span> ({modo === "parcial" ? "atualização parcial" : "versão completa"}).
              Nada foi gravado ainda. Em cada célula: vigente em cinza, nova embaixo; destaque acima de ±20%.
            </div>
            <div className="flex gap-2 flex-wrap text-sm">
              <Badge variant="outline">{conferencia.resumo.tarifas_trocadas} tarifas trocadas</Badge>
              <Badge variant="outline">{conferencia.resumo.tarifas_mantidas} mantidas</Badge>
              <Badge variant="outline">{conferencia.resumo.ceps_copiados} faixas de CEP copiadas</Badge>
              <Badge variant="outline">{conferencia.resumo.prazos_alterados} prazos alterados</Badge>
            </div>
            {conferencia.resumo.codigos_sem_cep.length > 0 && (
              <div className="flex items-start gap-2 rounded-md border border-warning/50 bg-warning/10 p-3 text-sm">
                <AlertTriangle className="h-4 w-4 text-warning mt-0.5 shrink-0" />
                <span>
                  Sem faixa de CEP (ficam sem cotação): <span className="font-mono">{conferencia.resumo.codigos_sem_cep.join(", ")}</span>
                </span>
              </div>
            )}
            {conferencia.vigencia_futura && (
              <div className="flex items-start gap-2 rounded-md border border-warning/50 bg-warning/10 p-3 text-sm">
                <AlertTriangle className="h-4 w-4 text-warning mt-0.5 shrink-0" />
                <span>Vigência futura: publicar ativa hoje e a cotação fica sem tabela válida até a data de vigência.</span>
              </div>
            )}
            <div className="max-h-[50vh] overflow-auto border rounded">
              <table className="w-full text-xs">
                <thead className="bg-muted/50 sticky top-0">
                  <tr>
                    <th className="text-left px-2 py-1">tarifa_code</th>
                    <th className="text-right px-2 py-1">1 kg</th>
                    <th className="text-right px-2 py-1">10 kg</th>
                    <th className="text-right px-2 py-1">30 kg</th>
                    <th className="text-right px-2 py-1">100 kg</th>
                    <th className="text-right px-2 py-1">Excedente/kg</th>
                    <th className="text-right px-2 py-1">ADV</th>
                    <th className="text-right px-2 py-1">GRIS</th>
                    <th className="text-right px-2 py-1">Prazo</th>
                    <th className="text-right px-2 py-1">Frete 10 kg · NF R$ 1.000</th>
                    <th className="text-right px-2 py-1">Frete 50 kg · NF R$ 5.000</th>
                  </tr>
                </thead>
                <tbody>
                  {conferencia.comparativo.map((c) => {
                    const va = am(c.vigente);
                    const na = am(c.nova);
                    return (
                      <tr key={c.tarifa_code} className="border-t">
                        <td className="px-2 py-1 align-top">
                          <div className="font-mono">{c.tarifa_code}</div>
                          <div className="text-[10px] text-muted-foreground">
                            {c.cep ? `CEP simulado ${c.cep.slice(0, 5)}-${c.cep.slice(5)}` : "sem CEP — não simulado"}
                          </div>
                          {c.vigente.existe === false && <div className="text-[10px] text-info">código novo</div>}
                          {(va?.erro || na?.erro) && <div className="text-[10px] text-destructive">{na?.erro ?? va?.erro}</div>}
                        </td>
                        <Celula a={va?.p1} b={na?.p1} fmt={fmtR} />
                        <Celula a={va?.p10} b={na?.p10} fmt={fmtR} />
                        <Celula a={va?.p30} b={na?.p30} fmt={fmtR} />
                        <Celula a={va?.p100} b={na?.p100} fmt={fmtR} />
                        <Celula a={c.vigente.excedente} b={c.nova.excedente} fmt={fmtR} />
                        <Celula a={c.vigente.adv} b={c.nova.adv} fmt={fmtP} />
                        <Celula a={c.vigente.gris} b={c.nova.gris} fmt={fmtP} />
                        <Celula a={va?.prazo} b={na?.prazo} fmt={fmtN} />
                        <Celula a={va?.frete_10} b={na?.frete_10} fmt={fmtR} />
                        <Celula a={va?.frete_50} b={na?.frete_50} fmt={fmtR} />
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <div className="text-[11px] text-muted-foreground">
              Preços e fretes calculados pelo mesmo cálculo da calculadora de frete (preço base por peso; frete total com
              taxas e ICMS). A versão anterior fica no histórico como inativa.
            </div>
          </div>
        )}

        <DialogFooter>
          {conferencia ? (
            <>
              <Button variant="outline" onClick={() => setConferencia(null)} disabled={mut.isPending}>
                <ArrowLeft className="h-4 w-4 mr-1" /> Voltar
              </Button>
              <Button onClick={() => enviar(false)} disabled={mut.isPending}>
                {mut.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <Upload className="h-4 w-4 mr-1" />}
                Publicar e ativar hoje
              </Button>
            </>
          ) : (
            <>
              <Button variant="outline" onClick={() => onOpenChange(false)} disabled={mut.isPending}>Cancelar</Button>
              <Button onClick={() => enviar(true)} disabled={!podeConferir}>
                {mut.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <Search className="h-4 w-4 mr-1" />}
                Conferir antes × depois
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
