import { Link } from "react-router-dom";
import { Info } from "lucide-react";
import { PageHeader } from "@/components/layout/PageHeader";
import { PageShell } from "@/components/layout/PageShell";
import { Button } from "@/components/ui/button";

/**
 * SAUDE-INCORPORADA (25/09/2026): a Saúde do Estoque foi incorporada ao
 * Cockpit do Estoque. Arquivo e rota mantidos para links antigos.
 */
export default function SaudeEstoque() {
  return (
    <PageShell variant="dados" className="animate-casa-fade-in">
      <PageHeader
        breadcrumb={[
          { label: "Casa", to: "/" },
          { label: "SOPs" },
          { label: "Produto" },
          { label: "Saúde do Estoque" },
        ]}
        titulo="Saúde do Estoque"
      />
      <div className="flex items-start gap-3 rounded-md border bg-card p-4 text-sm">
        <Info className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
        <div className="space-y-3">
          <p>
            A Saúde do Estoque foi incorporada ao Cockpit do Estoque; ajustes e validações estão na
            Conciliação de Estoque.
          </p>
          <div className="flex flex-wrap gap-2">
            <Button asChild size="sm"><Link to="/vendas/produto/estoque/virtual">Abrir Cockpit do Estoque</Link></Button>
            <Button asChild size="sm" variant="outline"><Link to="/vendas/produto/estoque/conciliacao">Abrir Conciliação de Estoque</Link></Button>
          </div>
        </div>
      </div>
    </PageShell>
  );
}
