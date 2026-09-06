import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  casarPrioridade,
  descreverPreview,
  parseQuickAdd,
  OPCOES_PRIORIDADE,
  type TokenTipo,
} from "@/lib/tarefas/quickAddParser";
import { useCriarTarefaQuickAdd } from "@/hooks/tarefas/useTarefaMutations";
import { useAuth } from "@/contexts/AuthContext";
import {
  casarPessoa,
  casarPorNome,
  handlePessoa,
  sugerirPessoas,
  useEtiquetas,
  usePessoasSistema,
  useProjetos,
  useSecoes,
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

type Prefixo = "@" | "!" | "#" | "/" | "+";

/** uma linha do dropdown; `inserir` é o texto que entra DEPOIS do prefixo */
interface Sugestao {
  chave: string;
  rotulo: string;
  detalhe?: string;
  inserir: string;
}

const semAcento = (s: string) =>
  s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();

/** o parser corta o token no espaço: nome composto vira "Financeiro-Interno" */
const paraToken = (nome: string) => nome.trim().replace(/\s+/g, "-");

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
  const { data: etiquetas } = useEtiquetas();

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
    const m = /(?:^|\s)([@!#/+])([^\s]*)$/.exec(ate);
    if (!m) return null;
    return { prefixo: m[1] as Prefixo, termo: m[2], inicio: cursor - m[2].length };
  }, [valor, cursor]);

  /** projeto já escolhido nesta mesma entrada — a seção depende dele */
  const projetoIdEntrada = useMemo(
    () => casarPorNome(projetos, resultado.projetoNome),
    [projetos, resultado.projetoNome]
  );

  const { candidatos, dica } = useMemo<{ candidatos: Sugestao[]; dica: string | null }>(() => {
    if (!fragmento) return { candidatos: [], dica: null };
    const termo = semAcento(fragmento.termo).replace(/[-_]+/g, " ");
    const casa = (nome: string) => semAcento(nome).replace(/[-_]+/g, " ").includes(termo);

    if (fragmento.prefixo === "@") {
      return {
        candidatos: sugerirPessoas(pessoas, fragmento.termo).map((p) => ({
          chave: p.id,
          rotulo: p.nome,
          detalhe: `@${handlePessoa(p)}${p.cargo ? ` · ${p.cargo}` : ""}`,
          inserir: handlePessoa(p) ?? "",
        })),
        dica: null,
      };
    }

    if (fragmento.prefixo === "!") {
      return {
        candidatos: OPCOES_PRIORIDADE.filter((o) => !termo || casa(o.valor) || casa(o.rotulo)).map(
          (o) => ({ chave: o.valor, rotulo: o.rotulo, detalhe: `!${o.valor}`, inserir: o.valor })
        ),
        dica: null,
      };
    }

    if (fragmento.prefixo === "#") {
      return {
        candidatos: (projetos ?? [])
          .filter((p) => !termo || casa(p.nome))
          .slice(0, 8)
          .map((p) => ({ chave: p.id, rotulo: p.nome, inserir: paraToken(p.nome) })),
        dica: null,
      };
    }

    if (fragmento.prefixo === "/") {
      if (!projetoIdEntrada) {
        return { candidatos: [], dica: "Escolha o projeto com # primeiro — a seção pertence a um projeto." };
      }
      const doProjeto = (secoes ?? []).filter((s) => s.projeto_id === projetoIdEntrada);
      if (!doProjeto.length) {
        return { candidatos: [], dica: "Este projeto ainda não tem seções." };
      }
      return {
        candidatos: doProjeto
          .filter((s) => !termo || casa(s.nome))
          .slice(0, 8)
          .map((s) => ({ chave: s.id, rotulo: s.nome, inserir: paraToken(s.nome) })),
        dica: null,
      };
    }

    // "+" etiqueta: existentes + criar nova quando o nome não existe
    const existentes = (etiquetas ?? []).filter((e) => !termo || casa(e.nome)).slice(0, 8);
    const lista: Sugestao[] = existentes.map((e) => ({
      chave: e.id,
      rotulo: e.nome,
      inserir: paraToken(e.nome),
    }));
    const exata = (etiquetas ?? []).some((e) => semAcento(e.nome) === semAcento(fragmento.termo));
    if (fragmento.termo && !exata) {
      lista.unshift({
        chave: "__nova__",
        rotulo: `Criar etiqueta ${fragmento.termo}`,
        detalhe: "ainda não existe — será criada ao salvar",
        inserir: paraToken(fragmento.termo),
      });
    }
    return { candidatos: lista, dica: null };
  }, [fragmento, pessoas, projetos, secoes, etiquetas, projetoIdEntrada]);

  const dropdownAberto = !!fragmento && !suprimido && (candidatos.length > 0 || !!dica);
  const navegavel = dropdownAberto && candidatos.length > 0;

  useEffect(() => {
    setIndice(0);
    setSuprimido(false);
  }, [fragmento?.termo, fragmento?.prefixo]);

  const pessoaResolvida = useMemo(
    () => casarPessoa(pessoas, resultado.responsavelNome),
    [pessoas, resultado.responsavelNome]
  );

  /** trechos digitados que o parser NÃO reconheceu — viram texto do título */
  const naoReconhecidos = useMemo(() => {
    const avisos: string[] = [];
    // "!" só é consumido pelo parser quando casa com uma prioridade conhecida
    const re = /(?:^|\s)!([^\s]+)/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(valor)) !== null) {
      if (!casarPrioridade(m[1])) avisos.push(`!${m[1]} não é prioridade`);
    }
    if (resultado.projetoNome && !projetoIdEntrada) {
      avisos.push(`#${resultado.projetoNome} não é um projeto ativo`);
    }
    if (resultado.secaoNome) {
      const secaoId = casarPorNome(
        projetoIdEntrada ? secoes?.filter((s) => s.projeto_id === projetoIdEntrada) : secoes,
        resultado.secaoNome
      );
      if (!secaoId) avisos.push(`/${resultado.secaoNome} não é uma seção deste projeto`);
    }
    return avisos;
  }, [valor, resultado.projetoNome, resultado.secaoNome, projetoIdEntrada, secoes]);

  const escolher = (s: Sugestao) => {
    if (!s.inserir || !fragmento) return;
    const novo = valor.slice(0, fragmento.inicio) + s.inserir + " " + valor.slice(cursor);
    const pos = fragmento.inicio + s.inserir.length + 1;
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
                if (e.key === "Escape") {
                  e.preventDefault();
                  setSuprimido(true);
                  return;
                }
                if (navegavel) {
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
            <div className="absolute left-0 right-0 top-full z-50 mt-1 max-h-64 overflow-y-auto rounded-md border border-border bg-popover py-1 shadow-md">
              {dica && <p className="px-3 py-1.5 text-[11px] text-muted-foreground">{dica}</p>}
              {candidatos.length > 0 && (
                <ul>
                  {candidatos.map((c, i) => (
                    <li key={c.chave}>
                      <button
                        type="button"
                        onMouseDown={(e) => {
                          e.preventDefault();
                          escolher(c);
                        }}
                        onMouseEnter={() => setIndice(i)}
                        className={cn(
                          "flex w-full flex-col items-start px-3 py-1.5 text-left",
                          i === indice && "bg-accent"
                        )}
                      >
                        <span className="text-sm">{c.rotulo}</span>
                        {c.detalhe && (
                          <span className="text-[11px] text-muted-foreground">{c.detalhe}</span>
                        )}
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
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
            Ninguém chamado "{resultado.responsavelNome}" — a tarefa vai nascer no seu nome.
          </p>
        )
      )}

      {naoReconhecidos.length > 0 && (
        <p className="text-xs text-warning">
          Não reconhecido: {naoReconhecidos.join(" · ")} — vai ficar como texto do título.
        </p>
      )}

      <p className="text-[11px] text-muted-foreground/80">
        #projeto @pessoa +etiqueta /seção !prioridade (digite o símbolo e escolha na lista) · datas em português: amanhã, sexta, dia 15, em 3 dias
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
