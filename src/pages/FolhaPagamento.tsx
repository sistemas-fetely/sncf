import { useState, useEffect } from "react";
import { useAuth } from "@/contexts/AuthContext";
import {
  useCompetencias,
  useHolerites,
  useCriarCompetencia,
  useCalcularFolha,
  useFecharCompetencia,
  type HoleriteComColaborador,
} from "@/hooks/useFolhaPagamento";
import { useParametrosFolha } from "@/hooks/useParametrosFolha";
import { FolhaKPIs } from "@/components/folha-pagamento/FolhaKPIs";
import { FolhaToolbar } from "@/components/folha-pagamento/FolhaToolbar";
import { HoleriteTable } from "@/components/folha-pagamento/HoleriteTable";
import { HoleriteDrawer } from "@/components/folha-pagamento/HoleriteDrawer";
import { exportarExcel, exportarPDF } from "@/lib/exportar-folha";
import { PageShell } from "@/components/layout/PageShell";
import { PageHeader } from "@/components/layout/PageHeader";

export default function FolhaPagamento() {
  const { hasAnyRole } = useAuth();
  const canManage = hasAnyRole(["super_admin", "gestor_rh", "financeiro"]);

  const { data: competencias = [] } = useCompetencias();
  const { data: parametrosFolha } = useParametrosFolha();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const { data: holerites = [] } = useHolerites(selectedId);
  const [drawerHolerite, setDrawerHolerite] = useState<HoleriteComColaborador | null>(null);

  const criarMut = useCriarCompetencia();
  const calcularMut = useCalcularFolha();
  const fecharMut = useFecharCompetencia();

  useEffect(() => {
    if (!selectedId && competencias.length > 0) {
      setSelectedId(competencias[0].id);
    }
  }, [competencias, selectedId]);

  const selected = competencias.find((c) => c.id === selectedId) ?? null;
  const canEditHolerite = canManage && selected?.status !== "fechada";

  const handleExportExcel = () => {
    if (selected && holerites.length > 0) exportarExcel(holerites, selected);
  };
  const handleExportPDF = () => {
    if (selected && holerites.length > 0) exportarPDF(holerites, selected);
  };

  return (
    <PageShell>
      <PageHeader
        titulo="Folha de Pagamento"
        estado="Gestão e cálculo da folha de pagamento CLT"
      />

      <FolhaToolbar
        competencias={competencias}
        selectedId={selectedId}
        onSelect={setSelectedId}
        onCriar={(comp) => criarMut.mutate(comp)}
        onCalcular={() => selectedId && calcularMut.mutate({ competenciaId: selectedId, params: parametrosFolha })}
        onFechar={() => selectedId && fecharMut.mutate(selectedId)}
        onExportExcel={handleExportExcel}
        onExportPDF={handleExportPDF}
        isCalculating={calcularMut.isPending}
        canManage={canManage}
        hasHolerites={holerites.length > 0}
      />

      <FolhaKPIs competencia={selected} />

      <HoleriteTable
        holerites={holerites}
        onSelect={(h) => setDrawerHolerite(h)}
      />

      <HoleriteDrawer
        holerite={drawerHolerite}
        open={!!drawerHolerite}
        onClose={() => setDrawerHolerite(null)}
        competenciaId={selectedId}
        canEdit={canEditHolerite}
      />
    </PageShell>
  );
}
