import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { ArrowLeft, Network, Loader2, Info } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { supabase } from "@/integrations/supabase/client";
import { humanizeError } from "@/lib/errorMessages";

interface OrgRow {
  vinculo_id: string;
  pessoa_id: string;
  nome: string;
  tipo_vinculo: "CLT" | "PJ";
  status: string;
  data_inicio: string | null;
  cargo: string | null;
  departamento: string | null;
  unidade: string | null;
  gestor_pessoa_id: string | null;
  gestor_nome: string | null;
  eh_topo: boolean;
}

function NoCard({
  row,
  level,
  childrenByGestor,
  visited,
}: {
  row: OrgRow;
  level: number;
  childrenByGestor: Map<string, OrgRow[]>;
  visited: Set<string>;
}) {
  if (visited.has(row.pessoa_id)) return null;
  const nextVisited = new Set(visited);
  nextVisited.add(row.pessoa_id);

  const filhos = childrenByGestor.get(row.pessoa_id) || [];
  const compact = level >= 2;

  return (
    <div className="space-y-2">
      <Card
        className={`card-shadow border-l-4 ${
          level === 0 ? "border-l-primary" : level === 1 ? "border-l-primary/60" : "border-l-primary/30"
        }`}
      >
        <CardContent className={compact ? "p-2.5" : "p-3.5"}>
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <div className="min-w-0">
              <p className={`font-semibold truncate ${compact ? "text-sm" : "text-base"}`}>{row.nome}</p>
              <p className="text-xs text-muted-foreground truncate">
                {row.cargo || "—"} {row.departamento ? `· ${row.departamento}` : ""}
                {row.unidade ? ` · ${row.unidade}` : ""}
              </p>
            </div>
            <Badge variant={row.tipo_vinculo === "CLT" ? "default" : "secondary"} className="shrink-0">
              {row.tipo_vinculo}
            </Badge>
          </div>
        </CardContent>
      </Card>
      {filhos.length > 0 && (
        <div className="ml-6 pl-4 border-l border-border space-y-2">
          {filhos.map((f) => (
            <NoCard
              key={f.vinculo_id}
              row={f}
              level={level + 1}
              childrenByGestor={childrenByGestor}
              visited={nextVisited}
            />
          ))}
        </div>
      )}
    </div>
  );
}

export default function Organograma() {
  const navigate = useNavigate();
  const [rows, setRows] = useState<OrgRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancel = false;
    (async () => {
      setLoading(true);
      const { data, error } = await (supabase as any).from("vw_organograma").select("*");
      if (cancel) return;
      if (error) {
        toast.error(humanizeError(error.message));
        setRows([]);
      } else {
        setRows((data || []) as OrgRow[]);
      }
      setLoading(false);
    })();
    return () => {
      cancel = true;
    };
  }, []);

  const { roots, childrenByGestor, semGestor, total } = useMemo(() => {
    const map = new Map<string, OrgRow[]>();
    const rootsArr: OrgRow[] = [];
    let sem = 0;
    for (const r of rows) {
      if (r.eh_topo || !r.gestor_pessoa_id) {
        rootsArr.push(r);
        sem++;
      } else {
        const arr = map.get(r.gestor_pessoa_id) || [];
        arr.push(r);
        map.set(r.gestor_pessoa_id, arr);
      }
    }
    const cmp = (a: OrgRow, b: OrgRow) => a.nome.localeCompare(b.nome, "pt-BR");
    rootsArr.sort(cmp);
    for (const arr of map.values()) arr.sort(cmp);
    return { roots: rootsArr, childrenByGestor: map, semGestor: sem, total: rows.length };
  }, [rows]);

  const todosTopo = total > 0 && semGestor === total;

  return (
    <div className="space-y-6 p-6">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <Network className="h-5 w-5" />
          </div>
          <div>
            <h1 className="text-2xl font-bold">Organograma</h1>
            <p className="text-sm text-muted-foreground">Hierarquia da equipe</p>
          </div>
        </div>
        <Button variant="outline" className="gap-2" onClick={() => navigate("/pessoas")}>
          <ArrowLeft className="h-4 w-4" /> Voltar
        </Button>
      </div>

      {!loading && todosTopo && (
        <Alert>
          <Info className="h-4 w-4" />
          <AlertTitle>Nenhum gestor definido ainda</AlertTitle>
          <AlertDescription>
            Defina o gestor de cada pessoa no campo "Reporta a" (edição da pessoa) para a árvore se formar.
          </AlertDescription>
        </Alert>
      )}
      {!loading && !todosTopo && semGestor > 1 && (
        <p className="text-xs text-muted-foreground">
          {semGestor} pessoa(s) sem gestor definido (aparecem como raiz).
        </p>
      )}

      {loading ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : rows.length === 0 ? (
        <div className="text-center py-16 text-muted-foreground">Nenhuma pessoa ativa.</div>
      ) : (
        <div className="space-y-3">
          {roots.map((r) => (
            <NoCard
              key={r.vinculo_id}
              row={r}
              level={0}
              childrenByGestor={childrenByGestor}
              visited={new Set()}
            />
          ))}
        </div>
      )}
    </div>
  );
}
