import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Filter } from "lucide-react";
import { PainelLogistica } from "./PainelLogistica";

type Canal = "total" | "b2b" | "b2c";

export function VisaoGeralLogistica() {
  const [canal, setCanal] = useState<Canal>("total");

  const opts: { key: Canal; label: string }[] = [
    { key: "total", label: "Total" },
    { key: "b2b", label: "B2B" },
    { key: "b2c", label: "B2C" },
  ];

  return (
    <div className="space-y-6">
      <section>
        <div className="flex items-center gap-2 mb-2">
          <Filter className="h-4 w-4 text-muted-foreground" />
          <span className="text-xs text-muted-foreground">
            Escopo — re-escopa todo o dashboard por canal
          </span>
        </div>
        <div className="flex flex-wrap gap-2">
          {opts.map((o) => (
            <Button
              key={o.key}
              size="sm"
              variant={canal === o.key ? "default" : "outline"}
              onClick={() => setCanal(o.key)}
              className="h-7 rounded-full text-xs"
            >
              {o.label}
            </Button>
          ))}
        </div>
      </section>

      <PainelLogistica escopo={{ tipo: "canal", canal }} />
    </div>
  );
}
