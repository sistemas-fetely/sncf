/**
 * GrupoEmpresarialCombobox — seleção de grupo empresarial + criação inline.
 *
 * Padrão estrutural baseado em CategoriaCombobox (Popover + Command).
 *
 * Comportamento:
 * - Lista grupos ativos ordenados por nome
 * - Permite buscar por nome
 * - Se a busca não bate com nada, mostra opção "+ Criar grupo "X""
 * - Após criar, invalidate queries e auto-seleciona o novo grupo
 * - Sem grupo (null) é estado padrão e válido
 */
import { useMemo, useState } from "react";
import { Check, ChevronsUpDown, Plus, Building2, Loader2 } from "lucide-react";
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
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  useGruposEmpresariais,
  useCriarGrupoRapido,
} from "@/hooks/useGruposEmpresariais";

interface Props {
  value: string | null;
  onChange: (id: string | null) => void;
  placeholder?: string;
  disabled?: boolean;
}

export function GrupoEmpresarialCombobox({
  value,
  onChange,
  placeholder = "Sem grupo",
  disabled = false,
}: Props) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");

  const { data: grupos = [], isLoading } = useGruposEmpresariais(true);
  const criarGrupo = useCriarGrupoRapido();

  const grupoSelecionado = useMemo(
    () => grupos.find((g) => g.id === value) ?? null,
    [grupos, value],
  );

  const filtrados = useMemo(() => {
    const termo = search.trim().toLowerCase();
    if (!termo) return grupos;
    return grupos.filter((g) => g.nome.toLowerCase().includes(termo));
  }, [grupos, search]);

  // Mostra "criar grupo" se busca não bateu com nada e não está vazia
  const mostrarCriar =
    search.trim().length > 0 &&
    !filtrados.some(
      (g) => g.nome.toLowerCase() === search.trim().toLowerCase(),
    );

  async function handleCriar() {
    const nome = search.trim();
    if (!nome) return;
    try {
      const novo = await criarGrupo.mutateAsync(nome);
      onChange(novo.id); // auto-seleciona
      setSearch("");
      setOpen(false);
    } catch {
      // toast já mostrado pelo hook
    }
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          disabled={disabled}
          className="w-full justify-between font-normal"
        >
          <span className="flex items-center gap-2 truncate">
            <Building2 className="h-4 w-4 shrink-0 text-muted-foreground" />
            {grupoSelecionado ? (
              <span className="truncate">{grupoSelecionado.nome}</span>
            ) : (
              <span className="text-muted-foreground">{placeholder}</span>
            )}
          </span>
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent
        className="w-[--radix-popover-trigger-width] p-0"
        align="start"
      >
        <Command shouldFilter={false}>
          <CommandInput
            placeholder="Buscar grupo..."
            value={search}
            onValueChange={setSearch}
          />
          <CommandList>
            {isLoading ? (
              <div className="py-6 text-center text-sm text-muted-foreground flex items-center justify-center gap-2">
                <Loader2 className="h-4 w-4 animate-spin" />
                Carregando grupos...
              </div>
            ) : (
              <>
                <CommandEmpty>
                  {mostrarCriar ? null : "Nenhum grupo encontrado."}
                </CommandEmpty>

                {/* Opção "Sem grupo" sempre disponível */}
                <CommandGroup>
                  <CommandItem
                    value="__sem_grupo__"
                    onSelect={() => {
                      onChange(null);
                      setOpen(false);
                      setSearch("");
                    }}
                  >
                    <Check
                      className={cn(
                        "mr-2 h-4 w-4",
                        value === null ? "opacity-100" : "opacity-0",
                      )}
                    />
                    <span className="text-muted-foreground">
                      Sem grupo
                    </span>
                  </CommandItem>
                </CommandGroup>

                {filtrados.length > 0 && (
                  <CommandGroup heading="Grupos existentes">
                    {filtrados.map((g) => (
                      <CommandItem
                        key={g.id}
                        value={g.id}
                        onSelect={() => {
                          onChange(g.id);
                          setOpen(false);
                          setSearch("");
                        }}
                      >
                        <Check
                          className={cn(
                            "mr-2 h-4 w-4",
                            value === g.id ? "opacity-100" : "opacity-0",
                          )}
                        />
                        <Building2 className="mr-2 h-4 w-4 text-muted-foreground" />
                        <span className="flex-1 truncate">{g.nome}</span>
                      </CommandItem>
                    ))}
                  </CommandGroup>
                )}

                {mostrarCriar && (
                  <CommandGroup heading="Criar novo">
                    <CommandItem
                      value={`__criar_${search}__`}
                      onSelect={handleCriar}
                      disabled={criarGrupo.isPending}
                      className="text-admin"
                    >
                      {criarGrupo.isPending ? (
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      ) : (
                        <Plus className="mr-2 h-4 w-4" />
                      )}
                      <span>
                        Criar grupo{" "}
                        <strong className="font-medium">
                          "{search.trim()}"
                        </strong>
                      </span>
                    </CommandItem>
                  </CommandGroup>
                )}
              </>
            )}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
