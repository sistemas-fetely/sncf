// Conciliação › Ajustes — bloco "Pendências de cadastro" (28/11/2026).
// Regras com superfície 'pendencia_cadastro' (divergencia_regra.superficie):
// cadastro incompleto do próprio SNCF. Só leitura: a correção é na planilha
// ou no lugar que a regra aponta (rota_resolver).
import { useState } from "react";
import { Link } from "react-router-dom";
import { ChevronDown, ChevronRight } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Skeleton } from "@/components/ui/skeleton";
import { agruparPendencias, rotaDaPendencia, type LinhaPendencia } from "@/lib/acervo/conciliacaoSuperficie";

export function PendenciasCadastroConciliacao({ linhas, carregando, erro }: { linhas: LinhaPendencia[]; carregando: boolean; erro: Error | null }) {
  const [aberta, setAberta] = useState<string | null>(null);
  const grupos = agruparPendencias(linhas);
  return <section className="rounded-md border bg-card" aria-label="Pendências de cadastro">
    <div className="border-b px-4 py-3">
      <h3 className="font-semibold">Pendências de cadastro · {carregando ? "…" : linhas.length}</h3>
      <p className="text-xs text-muted-foreground">Cadastro incompleto no próprio SNCF. Corrija na planilha ou no lugar indicado em cada regra.</p>
    </div>
    {erro && <Alert variant="destructive" className="m-3"><AlertDescription>Não foi possível carregar as pendências de cadastro: {erro.message}</AlertDescription></Alert>}
    {carregando ? <div className="p-3"><Skeleton className="h-10 w-full" /></div>
    : !erro && grupos.length === 0 ? <p className="px-4 py-3 text-sm text-muted-foreground">Nenhuma pendência de cadastro.</p>
    : grupos.map(g => <div key={g.regra} className="border-b last:border-b-0">
      <Button variant="ghost" className="h-auto w-full justify-start gap-2 rounded-none px-4 py-2.5 text-left" aria-expanded={aberta === g.regra} onClick={() => setAberta(a => a === g.regra ? null : g.regra)}>
        {aberta === g.regra ? <ChevronDown className="h-4 w-4 shrink-0" /> : <ChevronRight className="h-4 w-4 shrink-0" />}
        <span className="font-medium">{g.nome}</span><Badge variant="secondary">{g.linhas.length}</Badge>
      </Button>
      {aberta === g.regra && <div className="space-y-2 px-4 pb-3">
        {g.o_que_fazer && <p className="text-xs text-muted-foreground">O que fazer: {g.o_que_fazer}</p>}
        <div className="max-h-80 overflow-auto rounded border text-xs">
          {g.linhas.map(l => { const rota = rotaDaPendencia(l.rota_resolver, l.cod_cadastro); const falta = [l.campo_matriz, l.valor_matriz].filter(Boolean).join(": ");
            return <div key={l.linha_id} className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b px-3 py-2 last:border-b-0">
              <span className="font-mono">{l.cod_cadastro ?? l.sku ?? "—"}</span>
              <span className="min-w-0 flex-1 truncate">{l.nome_comercial ?? ""}</span>
              {falta && <span className="text-muted-foreground">{falta}</span>}
              {rota && <Link to={rota} className="text-primary underline-offset-2 hover:underline">Abrir</Link>}
            </div>; })}
        </div>
      </div>}
    </div>)}
  </section>;
}
