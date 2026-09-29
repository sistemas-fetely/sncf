import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { formatError } from "@/lib/format-error";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { BotaoGuardado } from "@/components/acesso/BotaoGuardado";

export interface LinhaConflito {
  sku: string;
  cod_cadastro: string | null;
  nome_comercial: string | null;
  nome_operacional: string | null;
  conflito_nome: string | null;
}

interface Props {
  aberto: boolean;
  onFechar: () => void;
  linhas: LinhaConflito[];
  onResolvido: () => void;
}

interface Extra {
  ean: string | null;
  estampa: string | null;
  cor_nome: string | null;
  nome_comercial: string | null;
  foto: string | null;
}

interface Retorno {
  ok: boolean;
  resultado?: { sku: string; nome_operacional: string }[];
  ainda_repetidos?: { sku: string; nome_operacional: string; igual_a: string }[];
  erro?: string;
}

function montarNome(atual: string, estampa: string): string {
  const m = atual.match(/^(.*?)\s*(\([^)]*\))\s*$/);
  const base = (m ? m[1] : atual).trim();
  const sufixo = m ? ` ${m[2]}` : "";
  const e = estampa.trim();
  return e ? `${base}, ${e}${sufixo}` : `${base}${sufixo}`;
}

export function ResolverNomeDialog({ aberto, onFechar, linhas, onResolvido }: Props) {
  const [extras, setExtras] = useState<Record<string, Extra>>({});
  const [estampa, setEstampa] = useState<Record<string, string>>({});
  const [nome, setNome] = useState<Record<string, string>>({});
  const [conferido, setConferido] = useState<Retorno | null>(null);
  const [conferindo, setConferindo] = useState(false);
  const [gravando, setGravando] = useState(false);
  const [fop, setFop] = useState<Record<string, string>>({});

  useEffect(() => {
    if (!aberto || linhas.length === 0) return;
    setConferido(null);
    setFop({});
    const skus = linhas.map((l) => l.sku);
    const cods = linhas.map((l) => l.cod_cadastro).filter(Boolean) as string[];
    (async () => {
      const [p, f] = await Promise.all([
        (supabase as any).from("sncf_produtos").select("sku, cod_cadastro, ean, estampa, cor_nome, nome_comercial").in("sku", skus),
        cods.length
          ? (supabase as any).from("produto_foto").select("cod_cadastro, url, principal, ordem").in("cod_cadastro", cods)
              .order("principal", { ascending: false }).order("ordem", { ascending: true })
          : Promise.resolve({ data: [], error: null }),
      ]);
      if (p.error) { toast.error(formatError(p.error)); return; }
      if (f.error) { toast.error(formatError(f.error)); return; }
      const fotoPor = new Map<string, string>();
      for (const r of f.data ?? []) if (!fotoPor.has(r.cod_cadastro)) fotoPor.set(r.cod_cadastro, r.url);
      const ex: Record<string, Extra> = {};
      const es: Record<string, string> = {};
      const no: Record<string, string> = {};
      for (const l of linhas) {
        const r = (p.data ?? []).find((x: any) => x.sku === l.sku);
        ex[l.sku] = {
          ean: r?.ean ?? null, estampa: r?.estampa ?? null, cor_nome: r?.cor_nome ?? null,
          nome_comercial: r?.nome_comercial ?? l.nome_comercial,
          foto: l.cod_cadastro ? fotoPor.get(l.cod_cadastro) ?? null : null,
        };
        es[l.sku] = r?.estampa ?? "";
        no[l.sku] = r?.nome_comercial ?? l.nome_comercial ?? "";
      }
      setExtras(ex); setEstampa(es); setNome(no);
    })();
  }, [aberto, linhas]);

  const itens = () => linhas.map((l) => ({ sku: l.sku, nome_comercial: nome[l.sku] ?? "", estampa: estampa[l.sku] ?? "" }));

  const conferir = async () => {
    setConferindo(true);
    try {
      const { data, error } = await (supabase as any).rpc("fn_produto_resolver_nome", { p_itens: itens(), p_dry_run: true });
      if (error) throw error;
      const r = data as Retorno;
      if (r?.ok === false && !(r.ainda_repetidos ?? []).length) throw new Error(r.erro ?? "Conferência recusada sem detalhe");
      setConferido(r);
    } catch (e) {
      toast.error(formatError(e));
    } finally {
      setConferindo(false);
    }
  };

  const gravar = async () => {
    setGravando(true);
    try {
      const { data, error } = await (supabase as any).rpc("fn_produto_resolver_nome", { p_itens: itens(), p_dry_run: false });
      if (error) throw error;
      const r = data as Retorno;
      if (r?.ok !== true) throw new Error(r?.erro ?? "Gravação recusada sem detalhe");
      if ((r.ainda_repetidos ?? []).length) throw new Error("Ainda há nomes repetidos — nada foi gravado");
      toast.success("Nome resolvido — gravado no SNCF; FOP em envio");
      await new Promise((res) => setTimeout(res, 4000));
      const c = await (supabase as any).rpc("fn_fop_campo_conferir");
      if (c.error) throw c.error;
      const cods = linhas.map((l) => l.cod_cadastro).filter(Boolean) as string[];
      if (cods.length) {
        const { data: env, error: eEnv } = await (supabase as any)
          .from("fop_campo_envio").select("cod_cadastro, situacao, resposta, enviado_em")
          .in("cod_cadastro", cods).order("enviado_em", { ascending: false });
        if (eEnv) throw eEnv;
        const out: Record<string, string> = {};
        for (const e of env ?? []) {
          if (out[e.cod_cadastro]) continue;
          const resp = typeof e.resposta === "string" ? e.resposta : JSON.stringify(e.resposta);
          out[e.cod_cadastro] = e.situacao === "ok" ? "FOP: ok" : e.situacao === "erro" ? `FOP: erro — ${resp}` : "FOP: enviado";
        }
        setFop(out);
      }
      onResolvido();
    } catch (e) {
      toast.error(formatError(e));
    } finally {
      setGravando(false);
    }
  };

  const repetidos = conferido?.ainda_repetidos ?? [];
  const podeGravar = !!conferido && conferido.ok === true && repetidos.length === 0 && !gravando;

  return (
    <Dialog open={aberto} onOpenChange={(o) => !o && !gravando && onFechar()}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Resolver nome repetido</DialogTitle>
          <DialogDescription>
            O nome no Bling sai do nome comercial. Informe o que diferencia cada produto (ex.: a estampa) — o nome
            comercial é montado no padrão e gravado no SNCF e no FOP.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4 md:grid-cols-2">
          {linhas.map((l) => {
            const ex = extras[l.sku];
            const res = conferido?.resultado?.find((x) => x.sku === l.sku);
            const fopMsg = l.cod_cadastro ? fop[l.cod_cadastro] : undefined;
            return (
              <div key={l.sku} className="space-y-3 rounded-md border p-3">
                <div className="flex gap-3">
                  {ex?.foto ? (
                    <img src={ex.foto} alt={l.sku} className="h-20 w-20 shrink-0 rounded object-cover" />
                  ) : (
                    <div className="flex h-20 w-20 shrink-0 items-center justify-center rounded border border-dashed text-[10px] text-muted-foreground">sem foto</div>
                  )}
                  <div className="min-w-0 text-xs space-y-0.5">
                    <div>Cód. <span className="font-mono">{l.cod_cadastro ?? "—"}</span></div>
                    <div>SKU <span className="font-mono">{l.sku}</span></div>
                    <div>EAN <span className="font-mono">{ex?.ean ?? "—"}</span></div>
                    <div className="text-sm">{ex?.nome_comercial ?? l.nome_comercial ?? "—"}</div>
                    {l.conflito_nome && <div className="text-destructive">igual a: {l.conflito_nome}</div>}
                  </div>
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Estampa / o que diferencia</Label>
                  <Input
                    value={estampa[l.sku] ?? ""}
                    onChange={(e) => {
                      const v = e.target.value;
                      setEstampa((s) => ({ ...s, [l.sku]: v }));
                      setNome((s) => ({ ...s, [l.sku]: montarNome(ex?.nome_comercial ?? l.nome_comercial ?? "", v) }));
                      setConferido(null);
                    }}
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Nome comercial</Label>
                  <Input
                    value={nome[l.sku] ?? ""}
                    onChange={(e) => {
                      const v = e.target.value;
                      setNome((s) => ({ ...s, [l.sku]: v }));
                      setConferido(null);
                    }}
                  />
                </div>
                {res && (
                  <div className="text-xs">
                    Nome no Bling: <span className="font-medium">{res.nome_operacional}</span>
                  </div>
                )}
                {fopMsg && (
                  <div className={`text-xs ${fopMsg.startsWith("FOP: erro") ? "text-destructive" : "text-success"}`}>{fopMsg}</div>
                )}
              </div>
            );
          })}
        </div>

        {repetidos.length > 0 && (
          <Alert variant="destructive">
            <AlertTitle>Ainda há nomes repetidos</AlertTitle>
            <AlertDescription>
              <ul className="list-disc pl-4">
                {repetidos.map((r) => (
                  <li key={r.sku}>{r.nome_operacional} — igual a {r.igual_a}</li>
                ))}
              </ul>
            </AlertDescription>
          </Alert>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={conferir} disabled={conferindo || gravando}>
            {conferindo && <Loader2 className="h-4 w-4 animate-spin" />} Conferir
          </Button>
          <BotaoGuardado slug="acao.produto_nome_editar" rotuloAcao="Gravar nome comercial" onClick={gravar} disabled={!podeGravar}>
            {gravando && <Loader2 className="h-4 w-4 animate-spin" />} Gravar
          </BotaoGuardado>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default ResolverNomeDialog;
