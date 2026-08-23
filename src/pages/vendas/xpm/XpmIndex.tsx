import { useAbaUrl } from "@/hooks/useAbaUrl";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { PageHeader } from "@/components/layout/PageHeader";
import RecebimentoXpm from "./RecebimentoXpm";
import EstoqueXpm from "./EstoqueXpm";
import ExpedicoesXpm from "./ExpedicoesXpm";
import PainelXpm from "./PainelXpm";

const TABS = [
  { value: "expedicoes", label: "Expedições", component: <ExpedicoesXpm /> },
  { value: "painel", label: "Painel XPM", component: <PainelXpm /> },
  { value: "recebimento", label: "Recebimento XPM", component: <RecebimentoXpm /> },
  { value: "estoque", label: "Estoque XPM", component: <EstoqueXpm /> },
];

export default function XpmIndex() {
  const [tab, setTab] = useAbaUrl(TABS[0].value);

  return (
    <div className="flex flex-col h-full">
      <div className="border-b bg-card px-4 pt-4">
        <PageHeader titulo="XPM" className="mb-3" />
        <Tabs value={tab} onValueChange={setTab}>
          <TabsList>
            {TABS.map((t) => (
              <TabsTrigger key={t.value} value={t.value}>
                {t.label}
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>
      </div>
      <div className="flex-1 overflow-auto">
        <Tabs value={tab}>
          {TABS.map((t) => (
            <TabsContent key={t.value} value={t.value} className="mt-0">
              {t.component}
            </TabsContent>
          ))}
        </Tabs>
      </div>
    </div>
  );
}
