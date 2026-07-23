import { useMemo, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { ChevronRight, Search, MailQuestion, Tags, Clock, FileCheck2, Repeat } from "lucide-react";
import { formatBRL, formatDateBR } from "@/lib/format-currency";

export type FuroLike = {
  id: string;
  data_transacao: string;
  banco: string | null;
  valor: number;
  descricao: string | null;
  contraparte_nome: string | null;
  contraparte_documento: string | null;
  doc_solicitado_em: string | null;
  doc_solicitado_nota: string | null;
  fornecedor_tem_doc?: boolean | null;
};

interface Props {
  furos: FuroLike[];
  onBuscar: (f: FuroLike) => void;
  onSolicitar: (f: FuroLike) => void;
  onClassificar: (f: FuroLike) => void;
}

type Grupo = {
  chave: string;
  nome: string;
  documento: string | null;
  itens: FuroLike[];
  total: number;
  primeira: string;
  ultima: string;
  temDoc: boolean;
  nAguardando: number;
};

function normalizarNome(s: string): string {
  const t = s.trim().replace(/\s+/g, " ").toUpperCase();
  return t.startsWith("DIVERSOS ") ? t.slice("DIVERSOS ".length) : t;
}

function digitos(s: string | null | undefined): string {
  return (s || "").replace(/\D/g, "");
}

export function FurosPorFornecedor({ furos, onBuscar, onSolicitar, onClassificar }: Props) {
  const [abertos, setAbertos] = useState<Set<string>>(new Set());

  const grupos = useMemo<Grupo[]>(() => {
    const map = new Map<string, FuroLike[]>();
    for (const f of furos) {
      const doc = digitos(f.contraparte_documento);
      const nome = (f.contraparte_nome || "").trim();
      const chave = doc
        ? `doc:${doc}`
        : nome
          ? `nome:${normalizarNome(nome)}`
          : `desc:${(f.descricao || "sem-descricao").trim().toUpperCase()}`;
      const arr = map.get(chave) || [];
      arr.push(f);
      map.set(chave, arr);
    }

    const out: Grupo[] = [];
    for (const [chave, itens] of map.entries()) {
      // nome mais frequente
      const freq = new Map<string, number>();
      for (const it of itens) {
        const raw = (it.contraparte_nome || it.descricao || "—").trim();
        const n = normalizarNome(raw);
        freq.set(n, (freq.get(n) || 0) + 1);
      }
      let nome = "—";
      let melhor = -1;
      for (const [n, c] of freq.entries()) {
        if (c > melhor) { melhor = c; nome = n; }
      }
      const documento = chave.startsWith("doc:") ? chave.slice(4) : null;
      const datas = itens.map((i) => i.data_transacao).sort();
      const total = itens.reduce((s, i) => s + Number(i.valor || 0), 0);
      const temDoc = itens.some((i) => !!i.fornecedor_tem_doc);
      const nAguardando = itens.filter((i) => !!i.doc_solicitado_em).length;
      out.push({
        chave,
        nome,
        documento,
        itens: itens.sort((a, b) => a.data_transacao.localeCompare(b.data_transacao)),
        total,
        primeira: datas[0],
        ultima: datas[datas.length - 1],
        temDoc,
        nAguardando,
      });
    }
    out.sort((a, b) => b.total - a.total);
    return out;
  }, [furos]);

  function toggle(k: string) {
    setAbertos((prev) => {
      const n = new Set(prev);
      if (n.has(k)) n.delete(k); else n.add(k);
      return n;
    });
  }

  if (grupos.length === 0) {
    return (
      <Card>
        <CardContent className="p-6 text-center text-sm text-muted-foreground">
          Nenhum furo neste filtro
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-2">
      {grupos.map((g) => {
        const aberto = abertos.has(g.chave);
        const recorrente = g.itens.length >= 3;
        return (
          <Card key={g.chave} className="overflow-hidden">
            <Collapsible open={aberto} onOpenChange={() => toggle(g.chave)}>
              <CollapsibleTrigger asChild>
                <button
                  type="button"
                  className="w-full text-left px-4 py-3 hover:bg-muted/40 transition-colors flex items-center gap-3"
                >
                  <ChevronRight
                    className={`h-4 w-4 shrink-0 transition-transform ${aberto ? "rotate-90" : ""}`}
                  />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-medium truncate">{g.nome}</span>
                      {g.temDoc && (
                        <Badge variant="outline" className="text-[10px] border-emerald-500 text-emerald-700 dark:text-emerald-400 gap-1">
                          <FileCheck2 className="h-2.5 w-2.5" /> tem docs no sistema
                        </Badge>
                      )}
                      {recorrente && (
                        <Badge variant="outline" className="text-[10px] border-blue-500 text-blue-700 dark:text-blue-400 gap-1">
                          <Repeat className="h-2.5 w-2.5" /> recorrente
                        </Badge>
                      )}
                      {g.nAguardando > 0 && (
                        <Badge className="text-[10px] bg-amber-500 hover:bg-amber-500 gap-1">
                          <Clock className="h-2.5 w-2.5" /> aguardando doc ({g.nAguardando})
                        </Badge>
                      )}
                    </div>
                    {g.documento && (
                      <div className="text-[11px] text-muted-foreground font-mono mt-0.5">{g.documento}</div>
                    )}
                  </div>
                  <div className="text-right shrink-0">
                    <div className="font-mono font-semibold">{formatBRL(g.total)}</div>
                    <div className="text-[11px] text-muted-foreground">
                      {g.itens.length} pagto{g.itens.length > 1 ? "s" : ""} · {formatDateBR(g.primeira)}–{formatDateBR(g.ultima)}
                    </div>
                  </div>
                </button>
              </CollapsibleTrigger>
              <CollapsibleContent>
                <div className="border-t divide-y">
                  {g.itens.map((f) => {
                    const diasSol = f.doc_solicitado_em
                      ? Math.max(0, Math.floor((Date.now() - new Date(f.doc_solicitado_em).getTime()) / 86400000))
                      : null;
                    return (
                      <div key={f.id} className="px-4 py-2 flex items-center gap-3 text-xs">
                        <div className="w-20 shrink-0 whitespace-nowrap">{formatDateBR(f.data_transacao)}</div>
                        <div className="w-24 shrink-0 text-muted-foreground truncate">{f.banco || "—"}</div>
                        <div className="flex-1 min-w-0 truncate" title={f.descricao || ""}>
                          {f.descricao || "—"}
                        </div>
                        {diasSol !== null && (
                          <Badge
                            variant="outline"
                            className="text-[10px] gap-1 border-amber-400 text-amber-700 dark:text-amber-500"
                            title={f.doc_solicitado_nota || undefined}
                          >
                            <Clock className="h-2.5 w-2.5" /> aguardando · {diasSol}d
                          </Badge>
                        )}
                        <div className="w-28 shrink-0 text-right font-mono">{formatBRL(Number(f.valor))}</div>
                        <div className="flex gap-1 shrink-0">
                          <Button size="sm" variant="outline" className="gap-1 h-7" onClick={() => onBuscar(f)}>
                            <Search className="h-3 w-3" /> Buscar
                          </Button>
                          <Button size="sm" variant="outline" className="gap-1 h-7" onClick={() => onSolicitar(f)}>
                            <MailQuestion className="h-3 w-3" /> Solicitar
                          </Button>
                          <Button size="sm" variant="outline" className="gap-1 h-7" onClick={() => onClassificar(f)}>
                            <Tags className="h-3 w-3" /> Classificar
                          </Button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </CollapsibleContent>
            </Collapsible>
          </Card>
        );
      })}
    </div>
  );
}
