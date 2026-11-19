// COMBO-POR-DIGITACAO: escolhe parceiro buscando no banco (fn_busca_parceiro); nunca carrega a base inteira.
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Check, ChevronsUpDown, Loader2, X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { rawMessage } from "@/lib/format-error";
import { useDebounceValor } from "@/lib/lista/useListaPaginada";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

export interface ParceiroBuscaItem {
  id: string;
  razao_social: string | null;
  nome_fantasia: string | null;
  documento: string | null;
  tipos: string[] | null;
  uf: string | null;
  cidade: string | null;
  ativo: boolean | null;
  bling_id: string | number | null;
}

export async function buscarParceiros(p: {
  q?: string; tipo?: string; com_bling?: boolean; incluir_inativos?: boolean; ids?: string[]; limite?: number;
}): Promise<ParceiroBuscaItem[]> {
  const { data, error } = await supabase.rpc("fn_busca_parceiro" as never, { p } as never);
  if (error) throw error;
  return (data ?? []) as unknown as ParceiroBuscaItem[];
}

const rotuloPadrao = (p: ParceiroBuscaItem) => p.nome_fantasia || p.razao_social || "(sem nome)";

interface Props {
  value: string | null;
  onChange: (id: string | null, parceiro: ParceiroBuscaItem | null) => void;
  tipo?: string;
  comBling?: boolean;
  incluirInativos?: boolean;
  placeholder?: string;
  rotulo?: (p: ParceiroBuscaItem) => string;
  disabled?: boolean;
  permitirLimpar?: boolean;
  id?: string;
}

export function ParceiroBusca({
  value, onChange, tipo, comBling, incluirInativos, placeholder = "Buscar parceiro...", rotulo = rotuloPadrao, disabled, permitirLimpar, id,
}: Props) {
  const [aberto, setAberto] = useState(false);
  const [q, setQ] = useState("");
  const qDeb = useDebounceValor(q, 300);

  const escolhido = useQuery({
    queryKey: ["parceiro-busca-rotulo", value],
    enabled: !!value,
    staleTime: 5 * 60_000,
    queryFn: async () => (await buscarParceiros({ ids: [value as string], limite: 1 }))[0] ?? null,
  });

  const resultados = useQuery({
    queryKey: ["parceiro-busca", qDeb, tipo ?? null, !!comBling, !!incluirInativos],
    enabled: aberto,
    staleTime: 30_000,
    queryFn: () => buscarParceiros({ q: qDeb.trim() || undefined, tipo, com_bling: comBling, incluir_inativos: incluirInativos, limite: 20 }),
  });

  const rotuloAtual = value ? (escolhido.data ? rotulo(escolhido.data) : escolhido.isLoading ? "Carregando..." : "(parceiro não encontrado)") : null;

  return (
    <div className="flex gap-1">
      <Popover open={aberto} onOpenChange={setAberto}>
        <PopoverTrigger asChild>
          <Button id={id} type="button" variant="outline" role="combobox" disabled={disabled} className="w-full justify-between font-normal">
            <span className={cn("truncate", !rotuloAtual && "text-muted-foreground")}>{rotuloAtual ?? placeholder}</span>
            <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="p-0 w-[--radix-popover-trigger-width] min-w-[280px]" align="start">
          <Command shouldFilter={false}>
            <CommandInput placeholder="Digite nome ou CNPJ/CPF..." value={q} onValueChange={setQ} />
            <CommandList>
              {resultados.isFetching && <div className="flex items-center gap-2 p-3 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" />Buscando...</div>}
              {resultados.isError && <div className="p-3 text-sm text-destructive">{rawMessage(resultados.error)}</div>}
              {!resultados.isFetching && !resultados.isError && <CommandEmpty>Nenhum parceiro encontrado.</CommandEmpty>}
              <CommandGroup>
                {(resultados.data ?? []).map((p) => (
                  <CommandItem key={p.id} value={p.id} onSelect={() => { onChange(p.id, p); setAberto(false); }}>
                    <Check className={cn("mr-2 h-4 w-4 shrink-0", value === p.id ? "opacity-100" : "opacity-0")} />
                    <div className="min-w-0">
                      <div className="truncate">{rotulo(p)}</div>
                      <div className="truncate text-xs text-muted-foreground">
                        {[p.documento, [p.cidade, p.uf].filter(Boolean).join("/")].filter(Boolean).join(" · ")}
                      </div>
                    </div>
                  </CommandItem>
                ))}
              </CommandGroup>
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>
      {permitirLimpar && value && (
        <Button type="button" variant="ghost" size="icon" aria-label="Limpar parceiro" disabled={disabled} onClick={() => onChange(null, null)}>
          <X className="h-4 w-4" />
        </Button>
      )}
    </div>
  );
}
