import { useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { descreverPreview, parseQuickAdd, type TokenTipo } from "@/lib/tarefas/quickAddParser";
import { useCriarTarefaQuickAdd } from "@/hooks/tarefas/useTarefaMutations";
import { casarPorNome, usePessoasSistema, useProjetos, useSecoes } from "@/hooks/tarefas/useTarefasCatalogos";

const COR_TOKEN: Record<TokenTipo, string> = {
  projeto: "bg-primary/20",
  responsavel: "bg-info/20",
  etiqueta: "bg-success/20",
  secao: "bg-info/20",
  prioridade: "bg-destructive/20",
  data: "bg-warning/25",
  hora: "bg-warning/15",
};

/** classes que precisam ser IDÊNTICAS no input e na camada de realce */
const CLASSES_TEXTO = "px-3 py-2 text-sm font-normal leading-[1.25rem] tracking-normal";

export function QuickAddTarefa() {
  const [valor, setValor] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  const { criarDoParse, isPending } = useCriarTarefaQuickAdd();
  const { data: projetos } = useProjetos();
  const { data: secoes } = useSecoes();
  const { data: pessoas } = usePessoasSistema();

  const resultado = useMemo(() => parseQuickAdd(valor), [valor]);
  const preview = useMemo(() => descreverPreview(resultado), [resultado]);

  const pedacos = useMemo(() => {
    const out: Array<{ texto: string; tipo: TokenTipo | null }> = [];
    let cursor = 0;
    for (const t of resultado.tokens) {
      if (t.start > cursor) out.push({ texto: valor.slice(cursor, t.start), tipo: null });
      out.push({ texto: valor.slice(t.start, t.end), tipo: t.tipo });
      cursor = t.end;
    }
    if (cursor < valor.length) out.push({ texto: valor.slice(cursor), tipo: null });
    return out;
  }, [resultado, valor]);

  const criar = async () => {
    if (!valor.trim() || isPending) return;
    const r = parseQuickAdd(valor);
    const projeto_id = casarPorNome(projetos, r.projetoNome);
    const secao_id = casarPorNome(
      projeto_id ? secoes?.filter((s) => s.projeto_id === projeto_id) : secoes,
      r.secaoNome
    );
    const responsavel_id = casarPorNome(
      pessoas?.filter((p): p is typeof p & { id: string; nome: string } => !!p.id && !!p.nome),
      r.responsavelNome
    );
    try {
      await criarDoParse(r, { projeto_id, secao_id, responsavel_id });
      setValor("");
      inputRef.current?.focus();
    } catch {
      /* toast de erro já sai no hook (FAIL-LOUD) */
    }
  };

  const exemplos = [
    "Revisar contrato #Jurídico amanhã 15h",
    "Fechar caixa sexta !alta",
    "Ligar para o Rafael",
  ];

  return (
    <div className="space-y-2">
      <div className="flex items-start gap-2">
        <div className="relative flex-1">
          {/* camada de realce alinhada ao input */}
          <div
            aria-hidden
            className={cn(
              "pointer-events-none absolute inset-0 overflow-hidden whitespace-pre rounded-md border border-transparent text-transparent",
              CLASSES_TEXTO
            )}
          >
            {pedacos.map((p, i) => (
              <span key={i} className={p.tipo ? cn("rounded", COR_TOKEN[p.tipo]) : undefined}>
                {p.texto}
              </span>
            ))}
          </div>
          <Input
            ref={inputRef}
            value={valor}
            onChange={(e) => setValor(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                void criar();
              }
            }}
            placeholder="Adicionar tarefa… ex: Revisar contrato #Jurídico amanhã 15h"
            className={cn("relative bg-transparent", CLASSES_TEXTO)}
            disabled={isPending}
          />
        </div>
        <Button
          variant="link"
          className="h-9 shrink-0 px-1 text-xs text-muted-foreground"
          onClick={() => toast.info("Em breve")}
        >
          mais opções
        </Button>
      </div>

      {preview && <p className="text-xs text-muted-foreground">{preview}</p>}

      <p className="text-[11px] text-muted-foreground/80">
        #projeto @pessoa +etiqueta /seção !prioridade · datas em português: amanhã, sexta, dia 15, em 3 dias
      </p>

      {!valor && (
        <div className="flex flex-wrap gap-2 pt-1">
          {exemplos.map((ex) => (
            <button
              key={ex}
              type="button"
              onClick={() => {
                setValor(ex);
                inputRef.current?.focus();
              }}
              className="rounded-full border border-dashed border-border px-2.5 py-1 text-[11px] text-muted-foreground hover:bg-accent"
            >
              {ex}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
