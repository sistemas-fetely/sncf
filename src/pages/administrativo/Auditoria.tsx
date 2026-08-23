/**
 * Auditoria — motor de "regra como dado".
 *
 * Doutrina: cada monitoria é uma linha em `auditoria_regra` com o SQL que o
 * motor executa. O sistema ACHA; o humano TRATA. A tela não resolve o problema:
 * ela leva para a tela que resolve (`rota_acao`).
 *
 * Fontes: vw_auditoria_achado (aba Achados) e vw_auditoria_painel (aba Painel).
 * Escrita SEMPRE por RPC — nunca UPDATE direto no achado.
 */
import { useState } from "react";
import { useAbaUrl } from "@/hooks/useAbaUrl";
import { PageHeader } from "@/components/layout/PageHeader";
import { PageShell } from "@/components/layout/PageShell";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import AchadosTab from "@/components/auditoria/AchadosTab";
import PainelAuditoriaTab from "@/components/auditoria/PainelAuditoriaTab";
import { useExecucoesAuditoria } from "@/hooks/auditoria/useAuditoria";
import { ShieldAlert } from "lucide-react";

export default function Auditoria() {
  const [aba, setAba] = useAbaUrl("achados");
  const [regraFiltro, setRegraFiltro] = useState<string | null>(null);
  const execucoes = useExecucoesAuditoria();
  const ultimaExecucaoEm = execucoes.data?.[0]?.iniciado_em ?? null;

  return (
    <PageShell>
      <PageHeader
        titulo="Auditoria"
        icone={ShieldAlert}
        estado="O motor acha; o humano trata. Cada monitoria é uma regra com SQL versionado."
      />

      <Tabs value={aba} onValueChange={setAba}>
        <TabsList>
          <TabsTrigger value="achados">Achados</TabsTrigger>
          <TabsTrigger value="painel">Painel</TabsTrigger>
        </TabsList>

        <TabsContent value="achados" className="mt-4">
          <AchadosTab
            regraFiltro={regraFiltro}
            onLimparRegra={() => setRegraFiltro(null)}
            ultimaExecucaoEm={ultimaExecucaoEm}
          />
        </TabsContent>

        <TabsContent value="painel" className="mt-4">
          <PainelAuditoriaTab
            onVerAchadosDaRegra={(slug) => {
              setRegraFiltro(slug);
              setAba("achados");
            }}
          />
        </TabsContent>
      </Tabs>
    </PageShell>
  );
}
