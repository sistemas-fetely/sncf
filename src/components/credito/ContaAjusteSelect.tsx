import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Command, CommandEmpty, CommandInput, CommandItem, CommandList,
} from "@/components/ui/command";
import { Check, ChevronsUpDown } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Conta contábil do ajuste de renegociação/acordo.
 * Lista só contas FOLHA ativas com linha de DRE; Acréscimo → tipo receita,
 * Desconto → tipo diferente de receita (mesma regra que o banco exige).
 */
export function ContaAjusteSelect({
  natureza, value, onChange,
}: {
  natureza: "Acréscimo" | "Desconto";
  value: string | null;
  onChange: (id: string | null) => void;
}) {
  const [aberto, setAberto] = useState(false);
  const { data: folhas = [] } = useQuery({
    queryKey: ["plano-contas-folhas-ajuste-renegociacao"],
    staleTime: 60_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("plano_contas")
        .select("id, codigo, nome, parent_id, ativo, tipo, dre_linha_id")
        .order("codigo");
      if (error) throw new Error(error.message);
      const rows = data ?? [];
      const pais = new Set(rows.map((r) => r.parent_id).filter(Boolean));
      return rows.filter((r) => r.ativo && !pais.has(r.id) && r.dre_linha_id != null);
    },
  });
  const contas = folhas.filter((c) =>
    natureza === "Acréscimo" ? c.tipo === "receita" : c.tipo !== "receita");
  const sel = contas.find((c) => c.id === value);

  return (
    <div className="space-y-1.5">
      <Label className="text-xs">
        Conta contábil do ajuste <span className="text-destructive">*</span>
      </Label>
      <Popover open={aberto} onOpenChange={setAberto}>
        <PopoverTrigger asChild>
          <Button variant="outline" role="combobox" type="button"
            className={cn("w-full justify-between font-normal", !sel && "text-muted-foreground")}>
            <span className="truncate">{sel ? `${sel.codigo} — ${sel.nome}` : "Selecione a conta..."}</span>
            <ChevronsUpDown className="ml-2 h-4 w-4 opacity-50" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
          <Command>
            <CommandInput placeholder="Buscar conta..." />
            <CommandList className="max-h-72">
              <CommandEmpty>Nenhuma conta encontrada.</CommandEmpty>
              {contas.map((c) => (
                <CommandItem key={c.id} value={`${c.codigo} ${c.nome}`}
                  onSelect={() => { onChange(c.id); setAberto(false); }}>
                  <Check className={cn("mr-2 h-4 w-4", value === c.id ? "opacity-100" : "opacity-0")} />
                  <span className="text-sm">{c.codigo} — {c.nome}</span>
                </CommandItem>
              ))}
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>
    </div>
  );
}
