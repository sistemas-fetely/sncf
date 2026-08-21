import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { descreverPreview, parseQuickAdd, type TokenTipo } from "@/lib/tarefas/quickAddParser";
import { useCriarTarefaQuickAdd } from "@/hooks/tarefas/useTarefaMutations";
import { useAuth } from "@/contexts/AuthContext";
import {
  casarPessoa,
  casarPorNome,
  handlePessoa,
  sugerirPessoas,
  usePessoasSistema,
  useProjetos,
  useSecoes,
  type PessoaSistema,
} from "@/hooks/tarefas/useTarefasCatalogos";

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
  const { user } = useAuth();
  const [valor, setValor] = useState("");
  const [cursor, setCursor] = useState(0);
  const [indice, setIndice] = useState(0);
  const [suprimido, setSuprimido] = useState(false);
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

  const fragmento = useMemo(() => {
    const ate = valor.slice(0, cursor);
    const m = /(?:^|\s)@([^\s]*)$/.exec(ate);
    if (!m) return null;
    return { termo: m[1], inicio: cursor - m[1].length };
  }, [valor, cursor]);

  const candidatos = useMemo(
    () => (fragmento ? sugerirPessoas(pessoas, fragmento.termo) : []),
    [fragmento, pessoas]
  );

  const dropdownAberto = !!fragmento && candidatos.length > 0 && !suprimido;

  useEffect(() => {
    setIndice(0);
    setSuprimido(false);
  }, [fragmento?.termo]);

  const pessoaResolvida = useMemo(
    () => casarPessoa(pessoas, resultado.responsavelNome),
    [pessoas, resultado.responsavelNome]
  );

  const escolher = (p: PessoaSistema) => {
    const h = handlePessoa(p);
    if (!h || !fragmento) return;
    const novo = valor.slice(0, fragmento.inicio) + h + " " + valor.slice(cursor);
    const pos = fragmento.inicio + h.length + 1;
    setValor(novo);
    requestAnimationFrame(() => {
      inputRef.current?.focus();
      inputRef.current?.setSelectionRange(pos, pos);
      setCursor(pos);
    });
  };

  const criar = async () => {
    if (!valor.trim() || isPending) return;
    const r = parseQuickAdd(valor);
    const projeto_id = casarPorNome(projetos, r.projetoNome);
    const secao_id = casarPorNome(
      projeto_id ? secoes?.filter((s) => s.projeto_id === projeto_id) : secoes,
      r.secaoNome
    );
    // Sem @pessoa, ou com @pessoa que não casou: a tarefa nasce no nome de quem criou.
    // Nunca nasce órfã — sem responsável ela não gera papel e some de todas as listas.
    const responsavel_id = casarPessoa(pessoas, r.responsavelNome)?.id ?? user?.id ?? null;
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
            onChange={(e) => {
              setValor(e.target.value);
              setCursor(e.currentTarget.selectionStart ?? 0);
            }}
            onKeyUp={(e) => setCursor(e.currentTarget.selectionStart ?? 0)}
            onClick={(e) => setCursor(e.currentTarget.selectionStart ?? 0)}
            onSelect={(e) => setCursor(e.currentTarget.selectionStart ?? 0)}
            onKeyDown={(e) => {
              if (dropdownAberto) {
                if (e.key === "ArrowDown") {
                  e.preventDefault();
                  setIndice((i) => (i + 1) % candidatos.length);
                  return;
                }
                if (e.key === "ArrowUp") {
                  e.preventDefault();
                  setIndice((i) => (i - 1 + candidatos.length) % candidatos.length);
                  return;
                }
                if (e.key === "Enter" || e.key === "Tab") {
                  e.preventDefault();
                  escolher(candidatos[indice]);
                  return;
                }
                if (e.key === "Escape") {
                  e.preventDefault();
                  setSuprimido(true);
                  return;
                }
              }
              if (e.key === "Enter") {
                e.preventDefault();
                void criar();
              }
            }}
            placeholder="Adicionar tarefa… ex: Revisar contrato #Jurídico amanhã 15h"
            className={cn("relative bg-transparent", CLASSES_TEXTO)}
            disabled={isPending}
          />
          {dropdownAberto && (
            <ul className="absolute left-0 right-0 top-full z-50 mt-1 max-h-64 overflow-y-auto rounded-md border border-border bg-popover py-1 shadow-md">
              {candidatos.map((p, i) => (
                <li key={p.id}>
                  <button
                    type="button"
                    onMouseDown={(e) => {
                      e.preventDefault();
                      escolher(p);
                    }}
                    onMouseEnter={() => setIndice(i)}
                    className={cn(
                      "flex w-full flex-col items-start px-3 py-1.5 text-left",
                      i === indice && "bg-accent"
                    )}
                  >
                    <span className="text-sm">{p.nome}</span>
                    <span className="text-[11px] text-muted-foreground">
                      @{handlePessoa(p)}{p.cargo ? ` · ${p.cargo}` : ""}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
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

      {resultado.responsavelNome && (
        pessoaResolvida ? (
          <p className="text-xs text-muted-foreground">→ responsável: {pessoaResolvida.nome}</p>
        ) : (
          <p className="text-xs text-warning">
            Ninguém chamado "{resultado.responsavelNome}" — a tarefa vai nascer sem responsável.
          </p>
        )
      )}

      <p className="text-[11px] text-muted-foreground/80">
        #projeto @pessoa (digite @ e escolha) +etiqueta /seção !prioridade · datas em português: amanhã, sexta, dia 15, em 3 dias
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
