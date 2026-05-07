import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Check, ChevronsUpDown } from "lucide-react";
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

export type CategoriaOption = {
  id: string;
  codigo: string;
  nome: string;
  nivel: number;
  parent_id: string | null;
};

interface Props {
  options: CategoriaOption[];
  value: string | null;
  onChange: (id: string | null) => void;
  placeholder?: string;
  disabled?: boolean;
  /** Se true, permite valor null (raiz). */
  allowNull?: boolean;
}

/**
 * Filtro hierárquico: quando o usuário digita "investimento", retorna o grupo
 * que dá match + todos os descendentes + os ancestrais (pra manter a árvore).
 */
function filtrarHierarquico(
  options: CategoriaOption[],
  search: string,
): { visiveis: CategoriaOption[]; matchDireto: Set<string> } {
  if (!search || search.trim() === "") {
    return { visiveis: options, matchDireto: new Set() };
  }
  const termo = search.toLowerCase();

  // 1) IDs com match direto (texto bate em código ou nome)
  const matchDireto = new Set<string>();
  options.forEach((cat) => {
    const hay = (cat.codigo + " " + cat.nome).toLowerCase();
    if (hay.includes(termo)) matchDireto.add(cat.id);
  });

  // 2) Incluir descendentes de cada match
  const comDescendentes = new Set(matchDireto);
  let changed = true;
  while (changed) {
    changed = false;
    options.forEach((cat) => {
      if (
        !comDescendentes.has(cat.id) &&
        cat.parent_id &&
        comDescendentes.has(cat.parent_id)
      ) {
        comDescendentes.add(cat.id);
        changed = true;
      }
    });
  }

  // 3) Subir e incluir ancestrais (pra manter hierarquia visível)
  const idsFinal = new Set(comDescendentes);
  const byId = new Map(options.map((o) => [o.id, o]));
  comDescendentes.forEach((id) => {
    let parentId = byId.get(id)?.parent_id ?? null;
    while (parentId) {
      idsFinal.add(parentId);
      parentId = byId.get(parentId)?.parent_id ?? null;
    }
  });

  return {
    visiveis: options.filter((c) => idsFinal.has(c.id)),
    matchDireto,
  };
}

function highlightText(text: string, search: string): ReactNode {
  if (!search) return text;
  const idx = text.toLowerCase().indexOf(search.toLowerCase());
  if (idx === -1) return text;
  return (
    <>
      {text.substring(0, idx)}
      <strong className="text-admin font-semibold">
        {text.substring(idx, idx + search.length)}
      </strong>
      {text.substring(idx + search.length)}
    </>
  );
}

export function CategoriaCombobox({
  options,
  value,
  onChange,
  placeholder = "Selecione uma categoria",
  disabled,
  allowNull,
}: Props) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const selectedRef = useRef<HTMLDivElement | null>(null);

  const selected = options.find((o) => o.id === value);

  // Sort por código pra manter ordem hierárquica
  const sorted = useMemo(
    () =>
      [...options].sort((a, b) =>
        a.codigo.localeCompare(b.codigo, "pt-BR", { numeric: true }),
      ),
    [options],
  );

  // Doutrina #07.6 (07/05/2026): lançamento SOMENTE em nó folha.
  // Nós intermediários (que aparecem como parent_id de algum outro) são
  // cabeçalhos visuais — visíveis na árvore, mas não selecionáveis.
  const idsComFilhos = useMemo(() => {
    const set = new Set<string>();
    options.forEach((o) => {
      if (o.parent_id) set.add(o.parent_id);
    });
    return set;
  }, [options]);

  const { visiveis, matchDireto } = useMemo(
    () => filtrarHierarquico(sorted, search),
    [sorted, search],
  );

  // Scroll para o item selecionado quando abre.
  // Usa interval porque o CommandList (cmdk) renderiza em duas etapas:
  // primeiro o Popover, depois o sizer interno do cmdk. Tenta a cada 100ms
  // até conseguir scrollar (máx ~1.5s). Faz scroll direto no container do
  // cmdk porque scrollIntoView dentro de Popover pode mover a página inteira.
  useEffect(() => {
    if (!open || !value) return;
    let tentativas = 0;
    const interval = setInterval(() => {
      tentativas++;
      const sizer = document.querySelector("[cmdk-list-sizer]") as HTMLElement | null;
      const container = sizer?.parentElement as HTMLElement | null;
      const selectedEl = container?.querySelector<HTMLElement>("[data-selected-item='true']");
      if (container && selectedEl) {
        const containerRect = container.getBoundingClientRect();
        const itemRect = selectedEl.getBoundingClientRect();
        const offset =
          itemRect.top - containerRect.top - containerRect.height / 2 + itemRect.height / 2;
        container.scrollTop = container.scrollTop + offset;
        clearInterval(interval);
      } else if (selectedRef.current) {
        // Fallback: scrollIntoView caso o seletor cmdk mude
        selectedRef.current.scrollIntoView({ block: "center" });
        clearInterval(interval);
      }
      if (tentativas > 15) clearInterval(interval);
    }, 100);
    return () => clearInterval(interval);
  }, [open, value]);

  // Resetar busca quando fecha
  useEffect(() => {
    if (!open) setSearch("");
  }, [open]);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          role="combobox"
          aria-expanded={open}
          disabled={disabled}
          className="w-full justify-between font-normal"
        >
          {selected ? (
            <span className="truncate">
              <span className="font-mono text-xs text-muted-foreground mr-2">
                {selected.codigo}
              </span>
              {selected.nome}
            </span>
          ) : (
            <span className="text-muted-foreground">{placeholder}</span>
          )}
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[420px] p-0" align="start">
        <Command shouldFilter={false}>
          <CommandInput
            placeholder="Buscar por código ou nome..."
            className="h-9"
            value={search}
            onValueChange={setSearch}
          />
          <CommandList>
            <CommandEmpty>Nenhuma categoria encontrada.</CommandEmpty>
            <CommandGroup>
              {allowNull && (
                <CommandItem
                  value="__null__"
                  onSelect={() => {
                    onChange(null);
                    setOpen(false);
                  }}
                >
                  <Check
                    className={cn(
                      "mr-2 h-4 w-4",
                      value === null ? "opacity-100" : "opacity-0",
                    )}
                  />
                  <span className="text-muted-foreground italic">Nenhum (raiz)</span>
                </CommandItem>
              )}
              {visiveis.map((opt) => {
                const isSelected = opt.id === value;
                const isMatch = matchDireto.has(opt.id);
                return (
                  <CommandItem
                    key={opt.id}
                    value={opt.id}
                    onSelect={() => {
                      onChange(opt.id);
                      setOpen(false);
                    }}
                    className={cn(
                      isSelected && "bg-admin/10 font-medium",
                    )}
                  >
                    <div
                      ref={isSelected ? selectedRef : undefined}
                      data-selected-item={isSelected ? "true" : undefined}
                      className="flex items-center w-full"
                    >
                      <Check
                        className={cn(
                          "mr-2 h-4 w-4 shrink-0",
                          isSelected ? "opacity-100 text-admin" : "opacity-0",
                        )}
                      />
                      <div
                        className="flex-1 truncate"
                        style={{ paddingLeft: `${(opt.nivel - 1) * 12}px` }}
                      >
                        <span className="font-mono text-xs text-muted-foreground mr-2">
                          {isMatch ? highlightText(opt.codigo, search) : opt.codigo}
                        </span>
                        {isMatch ? highlightText(opt.nome, search) : opt.nome}
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
