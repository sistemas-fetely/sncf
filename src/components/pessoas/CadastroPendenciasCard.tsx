import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, CheckCircle2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { fmtDataBR } from "@/lib/data";

interface PendenciaRow {
  fase_nome: string | null;
  responsavel: string | null;
  prazo_em: string | null;
  situacao: string | null;
}

export default function CadastroPendenciasCard({ vinculoId }: { vinculoId: string }) {
  const { data = [], isLoading } = useQuery({
    queryKey: ["cadastro-pendencia", vinculoId],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("vw_cadastro_pendencia")
        .select("fase_nome, responsavel, prazo_em, situacao")
        .eq("vinculo_id", vinculoId)
        .eq("obrigatorio", true);
      if (error) throw error;
      return (data || []) as PendenciaRow[];
    },
  });

  if (isLoading) return null;

  const grupos = new Map<string, { qtd: number; responsavel: string | null; prazo: string | null; atrasado: boolean }>();
  for (const p of data) {
    const chave = p.fase_nome || "Sem fase";
    const g = grupos.get(chave) || { qtd: 0, responsavel: p.responsavel, prazo: p.prazo_em, atrasado: false };
    g.qtd += 1;
    if (p.prazo_em && (!g.prazo || p.prazo_em < g.prazo)) g.prazo = p.prazo_em;
    if (p.situacao === "atrasado") g.atrasado = true;
    if (!g.responsavel) g.responsavel = p.responsavel;
    grupos.set(chave, g);
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          {data.length === 0 ? <CheckCircle2 className="h-4 w-4 text-success" /> : <AlertTriangle className="h-4 w-4 text-warning" />}
          Pendências do cadastro
        </CardTitle>
      </CardHeader>
      <CardContent>
        {data.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nenhuma pendência obrigatória.</p>
        ) : (
          <ul className="space-y-1 text-sm">
            {Array.from(grupos, ([fase, g]) => (
              <li key={fase} className="flex flex-wrap items-center gap-2">
                <Badge variant={g.atrasado ? "destructive" : "outline"}>{g.qtd}</Badge>
                <span className={g.atrasado ? "text-destructive font-medium" : "font-medium"}>{fase}</span>
                <span className="text-muted-foreground text-xs">
                  {g.responsavel || "sem dono"} · prazo {g.prazo ? fmtDataBR(g.prazo) : "—"}
                </span>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
