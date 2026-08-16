import { Tv, Sparkles } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

import { PageShell } from "@/components/layout/PageShell";
export default function GestaoAVista() {
  return (
    <PageShell>
      <div className="space-y-3">
        <div className="flex items-center justify-center w-16 h-16 rounded-2xl bg-primary/10">
          <Tv className="h-8 w-8 text-primary" />
        </div>
        <h1 className="text-3xl font-medium tracking-tight">Gestão à Vista</h1>
        <p className="text-muted-foreground text-lg max-w-2xl">
          O mapa da operação projetado na parede. Indicadores em tempo real por área,
          pensados pra ficar abertos o dia todo — na TV do setor, no monitor da sala,
          no radar do time.
        </p>
        <Badge variant="outline" className="gap-1.5">
          <Sparkles className="h-3 w-3" />
          Em construção
        </Badge>
      </div>

      <Card>
        <CardContent className="p-6 space-y-5">
          <div>
            <h2 className="text-base font-medium mb-2">O que vem aqui</h2>
            <p className="text-sm text-muted-foreground">
              Primeira tela concreta do pilar Fetely em Números.
              Cada área escolhe seus 5-7 indicadores-chave, o painel atualiza sozinho,
              a operação fica visível pra quem precisa ver.
            </p>
          </div>

          <div>
            <h3 className="text-sm font-medium mb-2 flex items-center gap-2">
              <Sparkles className="h-3.5 w-3.5 text-primary" />
              Roadmap
            </h3>
            <ul className="space-y-1.5 text-sm text-muted-foreground">
              <li>• Seleção de área via URL (?area=rh)</li>
              <li>• KPIs em cartões grandes, contraste alto, auto-refresh de 30s</li>
              <li>• Responsividade pensada pra telas de parede (1920×1080 e 4K)</li>
              <li>• Integração com tabelas de KPI (ver pilar Fetely em Números)</li>
            </ul>
          </div>

          <div className="rounded-md border border-dashed bg-muted/30 p-3">
            <p className="text-xs text-muted-foreground">
              <strong>Depende de:</strong> conclusão estrutural do pilar Fetely em Números —
              após ~5 processos reais mapeados em Processos Fetely. Hoje: 2 mapeados.
            </p>
          </div>
        </CardContent>
      </Card>
    </PageShell>
  );
}
