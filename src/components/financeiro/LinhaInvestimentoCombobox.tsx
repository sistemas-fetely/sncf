import { useMemo, useState } from "react";
import { Check, ChevronsUpDown, X } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

interface Props {
  value: string | null;
  onChange: (id: string | null) => void;
  disabled?: boolean;
  placeholder?: string;
}

type Opcao = {
  id: string;
  descricao: string;
  tema_nome: string;
  frente_nome: string;
  label: string;
  searchKey: string;
};

export function LinhaInvestimentoCombobox({
  value,
  onChange,
  disabled,
  placeholder = "Selecionar linha de investimento...",
}: Props) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");

  const { data: opcoes = [], isLoading } = useQuery<Opcao[]>({
    queryKey: ["linhas-investimento-combobox"],
    queryFn: async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const sb = supabase as any;
      const { data: linhas, error: e1 } = await sb
        .from("vw_linhas_investimento_kpis")
        .select("linha_id, descricao, tema_id, frente_id, ativa")
        .eq("ativa", true);
      if (e1) throw e1;

      const temaIds = Array.from(new Set((linhas || []).map((l: any) => l.tema_id).filter(Boolean)));
      const frenteIds = Array.from(new Set((linhas || []).map((l: any) => l.frente_id).filter(Boolean)));

      const [{ data: temas }, { data: frentes }] = await Promise.all([
        sb.from("temas_investimento").select("id, nome").in("id", temaIds.length ? temaIds : ["00000000-0000-0000-0000-000000000000"]),
        sb.from("frentes_investimento").select("id, nome").in("id", frenteIds.length ? frenteIds : ["00000000-0000-0000-0000-000000000000"]),
      ]);

      const tMap = new Map((temas || []).map((t: any) => [t.id, t.nome]));
      const fMap = new Map((frentes || []).map((f: any) => [f.id, f.nome]));

      return (linhas || []).map((l: any) => {
        const tema_nome = tMap.get(l.tema_id) || "—";
        const frente_nome = fMap.get(l.frente_id) || "—";
        return {
          id: l.linha_id,
          descricao: l.descricao,
          tema_nome,
          frente_nome,
          label: `${frente_nome} > ${tema_nome} > ${l.descricao}`,
          searchKey: `${frente_nome} ${tema_nome} ${l.descricao}`.toLowerCase(),
        };
      }).sort((a, b) => a.label.localeCompare(b.label, "pt-BR"));
    },
  });

  const selecionada = opcoes.find((o) => o.id === value);

  const filtradas = useMemo(() => {
    const s = search.trim().toLowerCase();
    if (!s) return opcoes;
    return opcoes.filter((o) => o.searchKey.includes(s));
  }, [opcoes, search]);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          role="combobox"
          disabled={disabled}
          className="w-full justify-between font-normal"
        >
          {selecionada ? (
            <span className="truncate text-left">
              <span className="text-[10px] text-muted-foreground block leading-tight">
                {selecionada.frente_nome} &gt; {selecionada.tema_nome}
              </span>
              <span className="truncate">{selecionada.descricao}</span>
            </span>
          ) : (
            <span className="text-muted-foreground">{placeholder}</span>
          )}
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[440px] p-0" align="start">
        <Command shouldFilter={false}>
          <CommandInput
            placeholder="Buscar por frente, tema ou descrição..."
            value={search}
            onValueChange={setSearch}
            className="h-9"
          />
          <CommandList>
            <CommandEmpty>
              {isLoading ? "Carregando..." : "Nenhuma linha encontrada."}
            </CommandEmpty>
            <CommandGroup>
              {value && (
                <CommandItem
                  value="__clear__"
                  onSelect={() => {
                    onChange(null);
                    setOpen(false);
                  }}
                >
                  <X className="mr-2 h-4 w-4 text-muted-foreground" />
                  <span className="text-muted-foreground italic">Limpar seleção</span>
                </CommandItem>
              )}
              {filtradas.map((o) => {
                const sel = o.id === value;
                return (
                  <CommandItem
                    key={o.id}
                    value={o.id}
                    onSelect={() => {
                      onChange(o.id);
                      setOpen(false);
                    }}
                    className={cn(sel && "bg-admin/10 font-medium")}
                  >
                    <Check className={cn("mr-2 h-4 w-4 shrink-0", sel ? "opacity-100 text-admin" : "opacity-0")} />
                    <div className="flex-1 min-w-0">
                      <div className="truncate text-sm">{o.descricao}</div>
                      <div className="truncate text-[11px] text-muted-foreground">
                        {o.frente_nome} &gt; {o.tema_nome}
                      </div>
                    </div>
                  </CommandItem>
                );
              })}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
