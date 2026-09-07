// "Divergências" — o que está documentado sem dono e o que é executado sem documentação.
// Fonte única: vw_processo_divergencia. São duas listas porque significam coisas opostas.
import { useState } from "react";
import { GitCompareArrows, Link2, Plus } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { formatError } from "@/lib/format-error";
import {
  useProcessoDivergencias,
  useProcessoPassos,
  type DivergenciaProcesso,
} from "@/hooks/processos/useProcessoPassos";
import { DialogLigarAtribuicao } from "@/components/processos/DialogLigarAtribuicao";
import { DialogPasso } from "@/components/processos/PassosProcesso";


export function DivergenciasProcesso({ processoId }: { processoId: string }) {
  const divergencias = useProcessoDivergencias(processoId);
  const [ligar, setLigar] = useState<DivergenciaProcesso | null>(null);
  const [documentar, setDocumentar] = useState<DivergenciaProcesso | null>(null);

  const lista = divergencias.data ?? [];
  const semAtribuicao = lista.filter((d) => d.tipo === "passo_sem_atribuicao");
  const semPasso = lista.filter((d) => d.tipo === "atribuicao_sem_passo");

  return (
    <Card>
      <CardContent className="space-y-3 p-6">
        <div className="flex items-center gap-2">
          <GitCompareArrows className="h-4 w-4 text-muted-foreground" />
          <h2 className="text-sm font-medium">Divergências</h2>
          {lista.length > 0 && (
            <span className="text-xs text-muted-foreground">({lista.length})</span>
          )}
        </div>

        {divergencias.isLoading && <Skeleton className="h-20 w-full" />}
        {divergencias.isError && (
          <p className="text-sm text-destructive">{formatError(divergencias.error)}</p>
        )}

        {!divergencias.isLoading && lista.length === 0 && (
          <p className="text-xs text-muted-foreground">
            Nada divergindo: cada passo tem atribuição e cada atribuição do processo tem passo.
          </p>
        )}

        {semAtribuicao.length > 0 && (
          <div className="space-y-2">
            <h3 className="text-xs font-medium">
              Passo sem atribuição ({semAtribuicao.length}) — documentado, ninguém declarado
              executando
            </h3>
            <div className="grid gap-3 [grid-template-columns:repeat(auto-fill,minmax(260px,1fr))]">
              {semAtribuicao.map((d) => (
                <div key={`p-${d.passo_id}`} className="space-y-2 rounded-lg border bg-card p-3">
                  <p className="text-sm font-medium">
                    {d.passo_ordem != null ? `${d.passo_ordem}. ` : ""}
                    {d.item_nome ?? "sem nome"}
                  </p>
                  {d.significado && (
                    <p className="text-[11px] text-muted-foreground">{d.significado}</p>
                  )}
                  <Button
                    size="sm"
                    variant="outline"
                    className="w-full gap-1"
                    onClick={() => setLigar(d)}
                  >
                    <Link2 className="h-3.5 w-3.5" /> Ligar a uma atribuição
                  </Button>
                </div>
              ))}
            </div>
          </div>
        )}

        {semPasso.length > 0 && (
          <div className="space-y-2">
            <h3 className="text-xs font-medium">
              Atribuição sem passo ({semPasso.length}) — executado, não documentado
            </h3>
            <div className="grid gap-3 [grid-template-columns:repeat(auto-fill,minmax(260px,1fr))]">
              {semPasso.map((d) => (
                <div key={`a-${d.atribuicao_id}`} className="space-y-2 rounded-lg border bg-card p-3">
                  <p className="text-sm font-medium">{d.item_nome ?? "sem nome"}</p>
                  <p className="text-[11px] text-muted-foreground">
                    {d.pessoa_nome ?? "sem dono"}
                  </p>
                  {d.significado && (
                    <p className="text-[11px] text-muted-foreground">{d.significado}</p>
                  )}
                  <Button
                    size="sm"
                    variant="outline"
                    className="w-full gap-1"
                    onClick={() => setDocumentar(d)}
                  >
                    <Plus className="h-3.5 w-3.5" /> Criar passo para isso
                  </Button>
                </div>
              ))}
            </div>
          </div>
        )}

        {ligar?.passo_id && (
          <DialogLigarAtribuicao
            processoId={processoId}
            passoId={ligar.passo_id}
            passoNome={ligar.item_nome ?? "sem nome"}
            quemExecuta={passoDoCatalogo(ligar.passo_id)}
            onFechar={() => setLigar(null)}
          />
        )}

        {documentar && (
          <DialogPasso
            processoId={processoId}
            nomeInicial={documentar.item_nome ?? ""}
            atribuicaoInicial={documentar.atribuicao_id}
            onFechar={() => setDocumentar(null)}
          />
        )}
      </CardContent>
    </Card>
  );
}

