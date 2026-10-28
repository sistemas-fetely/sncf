import { useEstadoTela } from "@/lib/navegacao";
import { PageShell } from "@/components/layout/PageShell";
import { CasaPageHeader } from "@/components/casa/CasaPageHeader";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Lock } from "lucide-react";
import { atalhoPeriodo, SemAcessoIC, useGiro } from "./icDados";
import { AbaGiro } from "./AbaGiro";
import { AbaRanking } from "./AbaRanking";

export default function InteligenciaComercial() {
  const [nav, setNav] = useEstadoTela({ aba: "giro", ini: "", fim: "" });
  const ini = nav.ini || null;
  const fim = nav.fim || null;
  // Mesma chave que a aba de giro usa para os KPIs — sonda de acesso sem chamada extra.
  const sonda = useGiro(ini, fim, "total");
  const semAcesso = sonda.error instanceof SemAcessoIC;
  const aplicar = (t: Parameters<typeof atalhoPeriodo>[0]) => setNav(atalhoPeriodo(t));

  return (
    <PageShell className="min-w-0 max-w-full overflow-x-hidden md:p-8">
      <CasaPageHeader
        breadcrumb={[{ label: "BI" }, { label: "Giro e Ranking" }]}
        title="Giro e Ranking"
        subtitle="Giro por coleção e ranking de vendas"
      />
      {semAcesso ? (
        <Card><CardContent className="flex items-center gap-2 p-6 text-muted-foreground"><Lock className="h-4 w-4" />Você não tem acesso a esta tela.</CardContent></Card>
      ) : (
        <>
          <Card className="mb-4">
            <CardContent className="flex flex-wrap items-end gap-3 p-4">
              <label className="min-w-0 text-xs text-muted-foreground">De
                <Input type="date" className="h-8 w-full sm:w-40" value={nav.ini} onChange={(e) => setNav({ ini: e.target.value })} />
              </label>
              <label className="min-w-0 text-xs text-muted-foreground">Até
                <Input type="date" className="h-8 w-full sm:w-40" value={nav.fim} onChange={(e) => setNav({ fim: e.target.value })} />
              </label>
              <div className="flex flex-wrap gap-1">
                <Button size="sm" variant={!nav.ini && !nav.fim ? "default" : "outline"} onClick={() => aplicar("todo")}>Todo o período</Button>
                <Button size="sm" variant="outline" onClick={() => aplicar("mes")}>Este mês</Button>
                <Button size="sm" variant="outline" onClick={() => aplicar("mes_passado")}>Mês passado</Button>
                <Button size="sm" variant="outline" onClick={() => aplicar("90")}>Últimos 90 dias</Button>
              </div>
            </CardContent>
          </Card>
          <Tabs value={nav.aba} onValueChange={(v) => setNav({ aba: v })} className="min-w-0 max-w-full">
            <TabsList className="h-auto max-w-full flex-wrap justify-start">
              <TabsTrigger value="giro">Giro por coleção</TabsTrigger>
              <TabsTrigger value="ranking">Ranking de vendas</TabsTrigger>
            </TabsList>
            <TabsContent value="giro" className="min-w-0"><AbaGiro ini={ini} fim={fim} /></TabsContent>
            <TabsContent value="ranking" className="min-w-0"><AbaRanking ini={ini} fim={fim} /></TabsContent>
          </Tabs>
        </>
      )}
    </PageShell>
  );
}
