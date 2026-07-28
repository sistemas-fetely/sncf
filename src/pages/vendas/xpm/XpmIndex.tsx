import { useState } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import RecebimentoXpm from "./RecebimentoXpm";
import EstoqueXpm from "./EstoqueXpm";

const TABS = [
  { value: "recebimento", label: "Recebimento XPM", component: <RecebimentoXpm /> },
  { value: "estoque", label: "Estoque XPM", component: <EstoqueXpm /> },
];

export default function XpmIndex() {
  const [tab, setTab] = useState(TABS[0].value);

  return (
    <div className="flex flex-col h-full">
      <div className="border-b bg-card px-4 pt-4">
        <h1 className="text-2xl font-semibold tracking-tight mb-3">XPM</h1>
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
