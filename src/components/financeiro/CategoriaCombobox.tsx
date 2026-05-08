import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Check, ChevronsUpDown, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  Command,
  CommandEmpty,
  CommandInput,
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

  const matchDireto = new Set<string>();
  options.forEach((cat) => {
    const hay = (cat.codigo + " " + cat.nome).toLowerCase();
    if (hay.includes(termo)) matchDireto.add(cat.id);
  });

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
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
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

  // Doutrina #07.6: lançamento SOMENTE em nó folha.
  const idsComFilhos = useMemo(() => {
    const set = new Set<string>();
    options.forEach((o) => {
      if (o.parent_id) set.add(o.parent_id);
    });
    return set;
  }, [options]);

  // Map id -> opção (para subir ancestrais rapidamente)
  const byId = useMemo(
    () => new Map(options.map((o) => [o.id, o])),
    [options],
  );

  const { visiveis, matchDireto } = useMemo(
    () => filtrarHierarquico(sorted, search),
    [sorted, search],
  );

  const buscando = search.trim().length > 0;

  // Conjunto de nós efetivamente expandidos:
  //  - Em modo busca: TUDO que está visível é considerado "expandido"
  //  - Em modo normal: só o que está em `expanded`
  const efetivamenteExpandidos = useMemo(() => {
    if (buscando) {
      return new Set(visiveis.map((v) => v.id));
    }
    return expanded;
  }, [buscando, visiveis, expanded]);

  // Determina se um nó deve ser renderizado (parent expandido ou raiz)
  function nodeRenderizavel(opt: CategoriaOption): boolean {
    if (opt.parent_id === null) return true;
    if (!byId.has(opt.parent_id)) return true;
    let parentId: string | null = opt.parent_id;
    while (parentId) {
      if (!efetivamenteExpandidos.has(parentId)) return false;
      parentId = byId.get(parentId)?.parent_id ?? null;
    }
    return true;
  }

  function toggle(id: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  // Ao abrir o popover com um valor já selecionado, expandir os ancestrais
  useEffect(() => {
    if (!open || !value) return;
    const selectedOpt = byId.get(value);
    if (!selectedOpt) return;
    setExpanded((prev) => {
      const next = new Set(prev);
      let parentId: string | null = selectedOpt.parent_id;
      while (parentId) {
        next.add(parentId);
        parentId = byId.get(parentId)?.parent_id ?? null;
      }
      return next;
    });
  }, [open, value, byId]);

  // Scroll para o item selecionado quando abre
  useEffect(() => {
    if (!open || !value) return;
    let tentativas = 0;
    const interval = setInterval(() => {
      tentativas++;
      const sizer = document.querySelector("[cmdk-list-sizer]") as HTMLElement | null;
      const container = sizer?.parentElement as HTMLElement | null;
      const selectedEl = container?.querySelector<HTMLElement>(
        "[data-selected-item='true']",
      );
      if (container && selectedEl) {
        const containerRect = container.getBoundingClientRect();
        const itemRect = selectedEl.getBoundingClientRect();
        const offset =
          itemRect.top - containerRect.top - containerRect.height / 2 + itemRect.height / 2;
        container.scrollTop = container.scrollTop + offset;
        clearInterval(interval);
      } else if (selectedRef.current) {
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

  // Filtra nós renderizáveis
  const nodesRender = useMemo(
    () => visiveis.filter((opt) => nodeRenderizavel(opt)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [visiveis, efetivamenteExpandidos, byId],
  );

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
            <div className="p-1">
              {allowNull && (
                <button
                  type="button"
                  onClick={() => {
                    onChange(null);
                    setOpen(false);
                  }}
                  className="flex w-full items-center px-2 py-1.5 text-sm rounded-sm hover:bg-accent"
                >
                  <Check
                    className={cn(
                      "mr-2 h-4 w-4",
                      value === null ? "opacity-100" : "opacity-0",
                    )}
                  />
                  <span className="text-muted-foreground italic">Nenhum (raiz)</span>
                </button>
              )}
              {nodesRender.map((opt) => {
                const isSelected = opt.id === value;
                const isMatch = matchDireto.has(opt.id);
                const temFilhos = idsComFilhos.has(opt.id);
                const isExpandido = efetivamenteExpandidos.has(opt.id);

                const handleClick = () => {
                  if (temFilhos) {
                    if (!buscando) toggle(opt.id);
                    return;
                  }
                  onChange(opt.id);
                  setOpen(false);
                };

                return (
                  <div
                    key={opt.id}
                    role="button"
                    tabIndex={0}
                    onClick={handleClick}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        handleClick();
                      }
                    }}
                    className={cn(
                      "flex items-center px-2 py-1.5 text-sm rounded-sm outline-none",
                      temFilhos
                        ? "cursor-pointer hover:bg-muted/60 font-semibold text-foreground/70"
                        : "cursor-pointer hover:bg-accent",
                      isSelected && "bg-admin/10 font-medium",
                    )}
                    style={{ paddingLeft: `${8 + (opt.nivel - 1) * 12}px` }}
                  >
                    {temFilhos ? (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          if (!buscando) toggle(opt.id);
                        }}
                        className="p-0.5 hover:bg-muted rounded mr-1 shrink-0 disabled:opacity-50"
                        aria-label={isExpandido ? "Recolher" : "Expandir"}
                        disabled={buscando}
                      >
                        <ChevronRight
                          className={cn(
                            "h-3.5 w-3.5 transition-transform",
                            isExpandido && "rotate-90",
                          )}
                        />
                      </button>
                    ) : (
                      <span className="w-[22px] shrink-0" />
                    )}

                    <Check
                      className={cn(
                        "mr-2 h-4 w-4 shrink-0",
                        isSelected ? "opacity-100 text-admin" : "opacity-0",
                      )}
                    />

                    <div
                      ref={isSelected ? selectedRef : undefined}
                      data-selected-item={isSelected ? "true" : undefined}
                      className="flex-1 truncate"
                    >
                      <span
                        className={cn(
                          "font-mono text-xs mr-2",
                          temFilhos ? "text-foreground/60" : "text-muted-foreground",
                        )}
                      >
                        {isMatch ? highlightText(opt.codigo, search) : opt.codigo}
                      </span>
                      <span>
                        {isMatch ? highlightText(opt.nome, search) : opt.nome}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
