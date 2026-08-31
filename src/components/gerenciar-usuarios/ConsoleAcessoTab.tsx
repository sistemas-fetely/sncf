import { Fragment, useEffect, useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  ChevronDown,
  ChevronRight,
  Loader2,
  MoreHorizontal,
  Search,
  ShieldAlert,
  ShieldCheck,
  Sparkles,
  Users,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { formatError } from "@/lib/format-error";
import { useAuth } from "@/contexts/AuthContext";
import { useTogglePermissao } from "@/hooks/useGruposAcessoV2";
import PainelGrupo from "./PainelGrupo";
import DeclararAcaoDialog from "./DeclararAcaoDialog";
import CelulaConcessao from "./CelulaConcessao";
import {
  CHAVE_MATRIZ_GRUPO_PERMISSOES,
  useConsoleAcesso,
  useGruposConsole,
  useLiberarParaGrupo,
  useMarcarConferido,
  useMatrizGrupoPermissoes,
  usePapeisNivel,
  useDefinirNivelMinimo,
  type ConsoleAcessoRow,
  type GrupoConsole,
} from "@/hooks/useConsoleAcesso";
import { useQueryClient } from "@tanstack/react-query";

/**
 * CONSOLE DE ACESSO ÚNICO — fusão das antigas abas "Grupos de Acesso" e
 * "Ações". Fonte única: `vw_console_acesso` (DIMENSÃO-VIA-TABELA: nenhum
 * rótulo, ordem de módulo ou nome de tela é hardcoded no front).
 *
 * Esquerda: árvore Módulo → Tela. Direita: grade linhas × grupos de acesso.
 * A linha `tipo = 'tela'` é o acesso de entrar na tela; as linhas
 * `tipo = 'acao'` são os botões daquela tela.
 *
 * APRESENTAÇÃO: a grade carrega a decisão (Linha · Risco · Guarda atual · concessão ·
 * Conferido). "Dispara" e "arquivo" permanecem no painel lateral de detalhe, aberto ao
 * clicar na linha.
 *
 * PREPARADO PARA DEPOIS: `gruposVisiveis` é o único ponto que decide quais
 * colunas de grupo aparecem — basta filtrá-lo para ganhar um seletor de
 * colunas sem tocar no resto da grade.
 */

function badgeRisco(risco: string | null) {
  const r = (risco ?? "").toUpperCase();
  if (!r) return null;
  if (r === "ALTO") return <Badge variant="destructive">ALTO</Badge>;
  if (r === "MEDIO" || r === "MÉDIO")
    return <Badge className="bg-warning/10 text-warning hover:bg-warning/10">MÉDIO</Badge>;
  return <Badge variant="outline">{r}</Badge>;
}

const semGuarda = (l: ConsoleAcessoRow) => l.sem_guarda === true;
const naoDeclarada = (l: ConsoleAcessoRow) => l.declarada !== true;
const portaoPorFlag = (l: ConsoleAcessoRow) => l.apenas_super_admin === true;
const ehAltoSemGuarda = (l: ConsoleAcessoRow) =>
  semGuarda(l) && (l.risco ?? "").toUpperCase() === "ALTO";


function renderGuarda(guarda: string | null) {
  const g = (guarda ?? "").trim();
  const gUpper = g.toUpperCase();
  if (!g) return "—";
  if (gUpper.startsWith("NENHUMA")) {
    return <span className="font-medium text-destructive">{g}</span>;
  }
  if (gUpper.startsWith("NIVEL") || gUpper.startsWith("SUPER_ADMIN")) {
    return (
      <Badge variant="outline" className="font-normal">
        {g}
      </Badge>
    );
  }
  return <span className="text-muted-foreground">{g}</span>;
}

function BadgeAltoSemGuarda({ n }: { n: number }) {
  if (n === 0) return null;
  return (
    <Badge variant="destructive" className="px-1.5 py-0 text-[10px]">
      {n} ALTO sem guarda
    </Badge>
  );
}

/** Número clicável da faixa fina de contadores. Ativo fica destacado. */
function NumeroFaixa({
  valor,
  rotulo,
  ativo,
  tom,
  onClick,
}: {
  valor: number;
  rotulo: string;
  ativo?: boolean;
  tom?: "warning" | "destructive" | "muted";
  onClick?: () => void;
}) {
  const cor =
    tom === "warning"
      ? "text-warning"
      : tom === "destructive"
        ? "text-destructive"
        : "text-muted-foreground";
  const Conteudo = (
    <>
      <span className={cn("font-medium tabular-nums", cor)}>{valor}</span>{" "}
      <span className="text-muted-foreground">{rotulo}</span>
    </>
  );
  if (!onClick) return <span className="text-xs">{Conteudo}</span>;
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={ativo}
      className={cn(
        "rounded-md px-1.5 py-0.5 text-xs transition-colors hover:bg-accent",
        ativo && "bg-accent ring-1 ring-border",
      )}
    >
      {Conteudo}
    </button>
  );
}

interface TelaNodo {
  chave: string;
  telaLabel: string;
  linhas: ConsoleAcessoRow[];
  total: number;
  altoSemGuarda: number;
}

interface ModuloNodo {
  appChave: string;
  appLabel: string;
  appOrdem: number;
  telas: TelaNodo[];
  totalLinhas: number;
  altoSemGuarda: number;
  /** app_ordem 9999 — rotas fora da navegação. */
  semModulo: boolean;
}

/** Verdadeiro a partir do breakpoint lg — decide painel fixo vs Sheet. */
function useTelaLarga() {
  const [larga, setLarga] = useState(false);
  useEffect(() => {
    const mql = window.matchMedia("(min-width: 1024px)");
    const aplicar = () => setLarga(mql.matches);
    aplicar();
    mql.addEventListener("change", aplicar);
    return () => mql.removeEventListener("change", aplicar);
  }, []);
  return larga;
}

/** Detalhe de leitura da linha — mesmo conteúdo no painel fixo e no Sheet. */
function DetalheLinha({
  linha,
  isSuperAdmin,
  onDeclarar,
}: {
  linha: ConsoleAcessoRow;
  isSuperAdmin: boolean;
  onDeclarar: () => void;
}) {
  return (
    <div className="space-y-4 text-sm">
      <div className="flex flex-wrap gap-1.5">
        {badgeRisco(linha.risco)}
        {linha.contem_dado_sensivel && (
          <Badge variant="outline" className="text-[10px]">
            LGPD
          </Badge>
        )}
        {linha.feature_em_teste && (
          <Badge variant="outline" className="bg-warning/10 text-[10px]">
            BETA
          </Badge>
        )}
        {portaoPorFlag(linha) && (
          <Badge variant="outline" className="text-[10px]">
            portão por flag
          </Badge>
        )}
        {naoDeclarada(linha) && linha.tipo === "acao" && (
          <Badge className="bg-warning/10 text-[10px] text-warning hover:bg-warning/10">
            ação não declarada
          </Badge>
        )}
      </div>

      <div>
        <p className="text-[11px] uppercase tracking-wide text-muted-foreground">
          O que dispara
        </p>
        <p className="text-xs">{linha.dispara ?? "—"}</p>
      </div>
      <div>
        <p className="text-[11px] uppercase tracking-wide text-muted-foreground">
          Guarda atual
        </p>
        <p className="text-xs">{renderGuarda(linha.guarda_atual)}</p>
      </div>
      <div>
        <p className="text-[11px] uppercase tracking-wide text-muted-foreground">
          Arquivo
        </p>
        <p className="break-all font-mono text-xs text-muted-foreground">
          {linha.arquivo ?? "—"}
        </p>
      </div>
      <div>
        <p className="text-[11px] uppercase tracking-wide text-muted-foreground">
          Slug da permissão
        </p>
        <p className="break-all font-mono text-xs text-muted-foreground">
          {linha.permissao_slug ?? "—"}
        </p>
      </div>

      {(linha.telas_cobertas ?? 0) > 1 && (
        <div className="rounded-md border bg-muted/30 p-2 text-[11px] leading-snug text-muted-foreground">
          Esta permissão é um pacote: vale para {linha.telas_cobertas} telas. Marcar aqui
          muda todas — <span className="font-medium">{linha.telas_lista ?? "—"}</span>
        </div>
      )}

      {naoDeclarada(linha) && isSuperAdmin && linha.acao_superficie_id && (
        <Button size="sm" variant="outline" onClick={onDeclarar}>
          Declarar no catálogo
        </Button>
      )}
    </div>
  );
}


export default function ConsoleAcessoTab() {
  const telaLarga = useTelaLarga();

  const qc = useQueryClient();
  const { roles } = useAuth();
  const isSuperAdmin = (roles ?? []).includes("super_admin");
  const { data: linhas = [], isLoading, isError, error } = useConsoleAcesso();
  const { data: grupos = [] } = useGruposConsole();
  const { data: matriz = [] } = useMatrizGrupoPermissoes();
  const togglePermissao = useTogglePermissao();
  const marcarConferido = useMarcarConferido();
  const liberarParaGrupo = useLiberarParaGrupo();
  const { data: niveis = [] } = usePapeisNivel();
  const definirNivel = useDefinirNivelMinimo();
  const [telaSel, setTelaSel] = useState<string | null>(null);
  const [modulosFechados, setModulosFechados] = useState<Set<string>>(new Set());
  const [declarando, setDeclarando] = useState<ConsoleAcessoRow | null>(null);
  const [detalhe, setDetalhe] = useState<ConsoleAcessoRow | null>(null);
  /** LENTE: mesmo editor, dois eixos. "tela" = escolho a tela e marco grupos;
   *  "grupo" = escolho o grupo e marco as telas. Sem duplicação de editor. */
  const [lente, setLente] = useState<"tela" | "grupo">("tela");
  const [grupoLenteId, setGrupoLenteId] = useState<string | null>(null);

  // ── Filtros (apresentação pura: nunca alteram o que é gravado) ──
  const [busca, setBusca] = useState("");
  const [soSemGuarda, setSoSemGuarda] = useState(false);
  const [soAltoSemGuarda, setSoAltoSemGuarda] = useState(false);
  const [soNaoDeclaradas, setSoNaoDeclaradas] = useState(false);
  const [concedidasGrupoId, setConcedidasGrupoId] = useState<string | null>(null);

  // FAIL-LOUD: erro de query sobe como toast com a mensagem real.
  useEffect(() => {
    if (isError) {
      toast.error("Não consegui carregar o console de acesso.", {
        description: formatError(error),
      });
    }
  }, [isError, error]);

  const concedido = useMemo(() => {
    const set = new Set<string>();
    matriz.forEach((c) => {
      if (c.pode_ver) set.add(`${c.grupo_acesso_id}|${c.permissao_id}`);
    });
    return set;
  }, [matriz]);

  /** Alçada gravada por célula. Ausente/nulo = a concessão do grupo basta. */
  const nivelPorCelula = useMemo(() => {
    const mapa = new Map<string, number | null>();
    matriz.forEach((c) =>
      mapa.set(`${c.grupo_acesso_id}|${c.permissao_id}`, c.nivel_minimo ?? null),
    );
    return mapa;
  }, [matriz]);

  const porGrupo = lente === "grupo";
  const filtroConcedidas = porGrupo ? null : concedidasGrupoId;
  const temFiltro =
    busca.trim().length > 0 ||
    soSemGuarda ||
    soAltoSemGuarda ||
    soNaoDeclaradas ||
    !!filtroConcedidas;

  function limparFiltros() {
    setBusca("");
    setSoSemGuarda(false);
    setSoAltoSemGuarda(false);
    setSoNaoDeclaradas(false);
    setConcedidasGrupoId(null);
  }

  /** Filtros combináveis. Valem para a grade E para os contadores da árvore. */
  const linhasFiltradas = useMemo(() => {
    const termo = busca.trim().toLowerCase();
    return linhas.filter((l) => {
      if (soSemGuarda && !semGuarda(l)) return false;
      if (soAltoSemGuarda && !ehAltoSemGuarda(l)) return false;
      if (soNaoDeclaradas && !(l.tipo === "acao" && naoDeclarada(l))) return false;
      if (filtroConcedidas) {
        if (!l.permissao_id) return false;
        if (!concedido.has(`${filtroConcedidas}|${l.permissao_id}`)) return false;
      }
      if (termo) {
        const alvo = [l.rotulo, l.permissao_slug, l.dispara]
          .filter(Boolean)
          .join(" ")
          .toLowerCase();
        if (!alvo.includes(termo)) return false;
      }
      return true;
    });
  }, [linhas, busca, soSemGuarda, soAltoSemGuarda, soNaoDeclaradas, filtroConcedidas, concedido]);

  const modulos = useMemo<ModuloNodo[]>(() => {
    const porModulo = new Map<string, ModuloNodo>();
    for (const l of linhasFiltradas) {
      const appChave = l.app_chave ?? "__sem_modulo__";
      let mod = porModulo.get(appChave);
      if (!mod) {
        mod = {
          appChave,
          appLabel: l.app_label ?? "Sem módulo",
          appOrdem: l.app_ordem ?? 9999,
          telas: [],
          totalLinhas: 0,
          altoSemGuarda: 0,
          semModulo: (l.app_ordem ?? 9999) === 9999,
        };
        porModulo.set(appChave, mod);
      }
      const telaLabel = l.tela_label ?? l.rota;
      let tela = mod.telas.find((t) => t.telaLabel === telaLabel);
      if (!tela) {
        tela = {
          chave: `${appChave}|${telaLabel}`,
          telaLabel,
          linhas: [],
          total: 0,
          altoSemGuarda: 0,
        };
        mod.telas.push(tela);
      }
      tela.linhas.push(l);
      tela.total += 1;
      mod.totalLinhas += 1;
      if (ehAltoSemGuarda(l)) {
        tela.altoSemGuarda += 1;
        mod.altoSemGuarda += 1;
      }
    }
    const lista = [...porModulo.values()];
    lista.forEach((m) => {
      m.telas.sort((a, b) => a.telaLabel.localeCompare(b.telaLabel, "pt-BR"));
      m.telas.forEach((t) =>
        t.linhas.sort((a, b) => (a.ordem_linha ?? 0) - (b.ordem_linha ?? 0)),
      );
    });
    return lista.sort((a, b) => a.appOrdem - b.appOrdem);
  }, [linhasFiltradas]);

  const telaAtiva = useMemo<TelaNodo | null>(() => {
    for (const m of modulos) {
      const t = m.telas.find((x) => x.chave === telaSel);
      if (t) return t;
    }
    return modulos[0]?.telas[0] ?? null;
  }, [modulos, telaSel]);

  /** Linhas da tela ativa agrupadas por rota (sub-cabeçalho quando > 1 rota). */
  const rotasDaTela = useMemo(() => {
    if (!telaAtiva) return [];
    const porRota = new Map<string, ConsoleAcessoRow[]>();
    telaAtiva.linhas.forEach((l) => {
      const arr = porRota.get(l.rota) ?? [];
      arr.push(l);
      porRota.set(l.rota, arr);
    });
    return [...porRota.entries()]
      .map(([rota, itens]) => ({ rota, itens }))
      .sort((a, b) => a.rota.localeCompare(b.rota, "pt-BR"));
  }, [telaAtiva]);

  const totais = useMemo(() => {
    const semGuardaList = linhas.filter(semGuarda);
    return {
      total: linhas.length,
      semGuarda: semGuardaList.length,
      altoSemGuarda: semGuardaList.filter((l) => (l.risco ?? "").toUpperCase() === "ALTO")
        .length,
      naoDeclaradas: linhas.filter((l) => l.tipo === "acao" && naoDeclarada(l)).length,
    };
  }, [linhas]);

  function alternar(grupoId: string, permissaoId: string, valor: boolean) {
    togglePermissao.mutate(
      { grupoId, permissaoId, campo: "pode_ver", valor },
      {
        onSuccess: () => {
          // Desmarcar limpa a alçada: sem concessão não existe alçada.
          if (!valor && nivelPorCelula.get(`${grupoId}|${permissaoId}`) != null) {
            definirNivel.mutate({ grupoId, permissaoId, nivelMinimo: null });
          }
        },
        onSettled: () => qc.invalidateQueries({ queryKey: CHAVE_MATRIZ_GRUPO_PERMISSOES }),
      },
    );
  }

  /** Ids que ainda faltam liberar — mesma regra usada pela mutation. */
  function idsFaltantes(grupoId: string, alvo: ConsoleAcessoRow[]) {
    const ids = alvo
      .filter((l) => l.permissao_id && !portaoPorFlag(l) && l.declarada === true)
      .map((l) => l.permissao_id as string)
      .filter((id) => !concedido.has(`${grupoId}|${id}`));
    return [...new Set(ids)];
  }

  /** Libera todas as linhas declaradas de um conjunto (tela ou módulo). */
  function liberarLinhas(grupoId: string, alvo: ConsoleAcessoRow[], rotulo: string) {
    const ids = idsFaltantes(grupoId, alvo);
    if (!ids.length) {
      toast.info(`Este grupo já tem tudo ${rotulo}.`);
      return;
    }
    liberarParaGrupo.mutate({ grupoId, permissaoIds: ids });
  }

  function liberarTelaInteira(grupoId: string) {
    if (!telaAtiva) return;
    liberarLinhas(grupoId, telaAtiva.linhas, "desta tela");
  }

  /** Módulo dono da tela ativa — alimenta o escopo "Este módulo". */
  const moduloAtivo = useMemo(
    () => modulos.find((m) => m.telas.some((t) => t.chave === telaAtiva?.chave)) ?? null,
    [modulos, telaAtiva],
  );

  function liberarModuloInteiro(grupoId: string) {
    if (!moduloAtivo) return;
    liberarLinhas(grupoId, moduloAtivo.telas.flatMap((t) => t.linhas), "deste módulo");
  }

  /** Grupo alvo da liberação em massa: travado na lente por grupo. */
  const grupoMassaEfetivo = porGrupo ? grupoLenteId : grupoMassaId;

  /** Quantas linhas a confirmação vai liberar — nada de clique cego. */
  const qtdMassa = useMemo(() => {
    if (!grupoMassaEfetivo) return 0;
    const alvo =
      escopoMassa === "modulo"
        ? (moduloAtivo?.telas.flatMap((t) => t.linhas) ?? [])
        : (telaAtiva?.linhas ?? []);
    return idsFaltantes(grupoMassaEfetivo, alvo).length;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [grupoMassaEfetivo, escopoMassa, moduloAtivo, telaAtiva, concedido]);


  /** Concedidas por tela para o grupo da lente — alimenta o contador "3/14". */
  const concedidasPorTela = useMemo(() => {
    const mapa = new Map<string, number>();
    if (!grupoLenteId) return mapa;
    modulos.forEach((m) =>
      m.telas.forEach((t) => {
        const n = t.linhas.filter(
          (l) => l.permissao_id && concedido.has(`${grupoLenteId}|${l.permissao_id}`),
        ).length;
        mapa.set(t.chave, n);
      }),
    );
    return mapa;
  }, [modulos, concedido, grupoLenteId]);

  function alternarModulo(appChave: string) {
    setModulosFechados((prev) => {
      const prox = new Set(prev);
      if (prox.has(appChave)) prox.delete(appChave);
      else prox.add(appChave);
      return prox;
    });
  }

  if (isLoading) {
    return (
      <div className="flex items-center gap-2 p-6 text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" /> Carregando console de acesso...
      </div>
    );
  }

  if (isError) {
    return (
      <div className="flex items-center gap-2 p-6 text-destructive">
        <ShieldAlert className="h-4 w-4" /> Falha ao carregar o console de acesso: {formatError(error)}
      </div>
    );
  }

  /** PONTO ÚNICO de decisão de colunas de grupo (ver comentário do topo). */
  const gruposVisiveis: GrupoConsole[] = grupos;
  /** Colunas fixas: Linha · Risco · Guarda atual · Conferido. */
  const nColunas = porGrupo ? 5 : 4 + gruposVisiveis.length;
  const grupoConcedidas = grupos.find((g) => g.id === filtroConcedidas) ?? null;

  /** Menu do cabeçalho da coluna: tira o botão gordo de dentro do <th>. */
  const MenuColuna = ({ grupoId, nome }: { grupoId: string; nome: string }) => (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="h-5 w-5"
          aria-label={`Ações em massa para ${nome}`}
        >
          <MoreHorizontal className="h-3.5 w-3.5" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="z-50">
        <DropdownMenuItem
          disabled={liberarParaGrupo.isPending}
          onClick={() => liberarTelaInteira(grupoId)}
        >
          <Sparkles className="mr-2 h-3.5 w-3.5" /> Liberar tela
        </DropdownMenuItem>
        <DropdownMenuItem
          disabled={liberarParaGrupo.isPending || !moduloAtivo}
          onClick={() => liberarModuloInteiro(grupoId)}
        >
          <Sparkles className="mr-2 h-3.5 w-3.5" /> Liberar módulo
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs text-muted-foreground">
          Uma decisão só: quem entra na tela e quem executa cada ação dela.
        </p>
        <div className="inline-flex rounded-md border p-0.5">
          <Button
            variant={porGrupo ? "ghost" : "secondary"}
            size="sm"
            className="h-7 text-xs"
            onClick={() => setLente("tela")}
          >
            Por tela
          </Button>
          <Button
            variant={porGrupo ? "secondary" : "ghost"}
            size="sm"
            className="h-7 text-xs"
            onClick={() => setLente("grupo")}
          >
            <Users className="mr-1.5 h-3.5 w-3.5" /> Por grupo
          </Button>
        </div>
      </div>

      {/* ── Faixa fina de contadores: cada número liga/desliga seu filtro ── */}
      <div className="flex flex-wrap items-center gap-x-1 gap-y-1 rounded-md border px-2 py-1.5">
        <NumeroFaixa valor={totais.total} rotulo="linhas" />
        <span className="text-muted-foreground">·</span>
        <NumeroFaixa
          valor={totais.semGuarda}
          rotulo="sem guarda"
          tom="warning"
          ativo={soSemGuarda}
          onClick={() => setSoSemGuarda((v) => !v)}
        />
        <span className="text-muted-foreground">·</span>
        <NumeroFaixa
          valor={totais.altoSemGuarda}
          rotulo="ALTO sem guarda"
          tom="destructive"
          ativo={soAltoSemGuarda}
          onClick={() => setSoAltoSemGuarda((v) => !v)}
        />
        <span className="text-muted-foreground">·</span>
        <NumeroFaixa
          valor={totais.naoDeclaradas}
          rotulo="não declaradas"
          tom="muted"
          ativo={soNaoDeclaradas}
          onClick={() => setSoNaoDeclaradas((v) => !v)}
        />
      </div>

      {porGrupo && <PainelGrupo grupoId={grupoLenteId} onGrupoChange={setGrupoLenteId} />}

      <div className="grid items-start gap-4 lg:grid-cols-[300px_1fr_320px]">
        {/* ── Árvore Módulo → Tela ── */}
        <Card className="h-fit">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">
              Telas ({modulos.reduce((s, m) => s + m.telas.length, 0)})
            </CardTitle>
          </CardHeader>
          <CardContent className="max-h-[70vh] space-y-1 overflow-auto p-2">
            {modulos.map((m) => {
              const fechado = modulosFechados.has(m.appChave);
              const concedidasModulo = m.telas.reduce(
                (s, t) => s + (concedidasPorTela.get(t.chave) ?? 0),
                0,
              );
              return (
                <div key={m.appChave} className={cn(m.semModulo && "opacity-70")}>
                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() => alternarModulo(m.appChave)}
                      className="flex flex-1 items-center gap-1.5 rounded-md px-2 py-1.5 text-left text-xs font-medium uppercase tracking-wide transition-colors hover:bg-accent"
                    >
                      {fechado ? (
                        <ChevronRight className="h-3.5 w-3.5 shrink-0" />
                      ) : (
                        <ChevronDown className="h-3.5 w-3.5 shrink-0" />
                      )}
                      <span className="truncate">{m.appLabel}</span>
                      <span className="ml-auto flex shrink-0 items-center gap-1.5 text-[10px] font-normal normal-case tracking-normal text-muted-foreground">
                        <span>
                          {porGrupo && grupoLenteId
                            ? `${concedidasModulo}/${m.totalLinhas}`
                            : `${m.telas.length} ${m.telas.length === 1 ? "tela" : "telas"} · ${m.totalLinhas} ${m.totalLinhas === 1 ? "linha" : "linhas"}`}
                        </span>
                        <BadgeAltoSemGuarda n={m.altoSemGuarda} />
                      </span>
                    </button>
                    {porGrupo && grupoLenteId && (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-6 shrink-0 px-1.5 text-[10px]"
                        disabled={liberarParaGrupo.isPending}
                        title="Liberar todas as linhas declaradas deste módulo para o grupo escolhido"
                        onClick={() =>
                          liberarLinhas(
                            grupoLenteId,
                            m.telas.flatMap((t) => t.linhas),
                            "deste módulo",
                          )
                        }
                      >
                        <Sparkles className="mr-1 h-3 w-3" /> Módulo
                      </Button>
                    )}
                  </div>
                  {m.semModulo && !fechado && (
                    <p className="px-2 pb-1 pt-0.5 text-[10px] leading-snug text-muted-foreground">
                      Rotas fora da navegação — não aparecem em nenhum menu e ficam
                      invisíveis para quem não é super_admin.
                    </p>
                  )}
                  {!fechado &&
                    m.telas.map((t) => (
                      <button
                        key={t.chave}
                        type="button"
                        onClick={() => setTelaSel(t.chave)}
                        className={cn(
                          "ml-4 flex w-[calc(100%-1rem)] items-center gap-2 rounded-md px-2 py-1 text-left text-xs transition-colors hover:bg-accent",
                          t.chave === telaAtiva?.chave && "bg-accent",
                        )}
                      >
                        <span className="min-w-0 flex-1 truncate">{t.telaLabel}</span>
                        <span className="flex shrink-0 items-center gap-1.5 text-[10px] text-muted-foreground">
                          <span className="tabular-nums">
                            {porGrupo && grupoLenteId
                              ? `${concedidasPorTela.get(t.chave) ?? 0}/${t.total}`
                              : t.total}
                          </span>
                          <BadgeAltoSemGuarda n={t.altoSemGuarda} />
                        </span>
                      </button>
                    ))}

                </div>
              );
            })}
            {modulos.length === 0 && (
              <p className="p-3 text-xs text-muted-foreground">
                Nenhuma linha bate com os filtros ativos.
              </p>
            )}
          </CardContent>
        </Card>

        {/* ── Grade linhas × grupos ── */}
        <Card>
          <CardHeader className="gap-2 pb-2">
            <CardTitle className="text-sm">
              {telaAtiva ? telaAtiva.telaLabel : "Nenhuma tela"}
            </CardTitle>
            <p className="text-[11px] text-muted-foreground">
              Clique na linha para ver o detalhe. O chip na célula aparece só quando há
              alçada mínima definida — sem chip, qualquer pessoa do grupo executa.
            </p>

            {/* ── Barra de filtro ── */}
            <div className="flex flex-wrap items-center gap-2 pt-1">
              <div className="relative w-56">
                <Search className="pointer-events-none absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
                <Input
                  value={busca}
                  onChange={(e) => setBusca(e.target.value)}
                  placeholder="Buscar rótulo, slug ou o que dispara"
                  className="h-8 pl-7 text-xs"
                  aria-label="Buscar linhas"
                />
              </div>
              <Button
                variant={soAltoSemGuarda ? "secondary" : "outline"}
                size="sm"
                className="h-8 text-xs"
                aria-pressed={soAltoSemGuarda}
                onClick={() => setSoAltoSemGuarda((v) => !v)}
              >
                ALTO sem guarda
              </Button>
              <Button
                variant={soNaoDeclaradas ? "secondary" : "outline"}
                size="sm"
                className="h-8 text-xs"
                aria-pressed={soNaoDeclaradas}
                onClick={() => setSoNaoDeclaradas((v) => !v)}
              >
                Não declaradas
              </Button>
              {!porGrupo && (
                <Select
                  value={concedidasGrupoId ?? "__todos__"}
                  onValueChange={(v) =>
                    setConcedidasGrupoId(v === "__todos__" ? null : v)
                  }
                >
                  <SelectTrigger className="h-8 w-52 text-xs">
                    <SelectValue placeholder="Concedidas a:" />
                  </SelectTrigger>
                  <SelectContent className="z-50">
                    <SelectItem value="__todos__">Concedidas a: qualquer</SelectItem>
                    {grupos.map((g) => (
                      <SelectItem key={g.id} value={g.id}>
                        Concedidas a: {g.nome}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}

              {/* ── Controle único de liberação em massa (era o menu ••• por coluna) ── */}
              <Popover open={massaAberta} onOpenChange={setMassaAberta}>
                <PopoverTrigger asChild>
                  <Button variant="outline" size="sm" className="h-8 text-xs">
                    <Sparkles className="mr-1.5 h-3.5 w-3.5" /> Liberar em massa
                  </Button>
                </PopoverTrigger>
                <PopoverContent align="start" className="z-50 w-72 space-y-3">
                  {!porGrupo && (
                    <div className="space-y-1">
                      <Label className="text-[11px] uppercase tracking-wide text-muted-foreground">
                        Grupo
                      </Label>
                      <Select
                        value={grupoMassaId ?? ""}
                        onValueChange={(v) => setGrupoMassaId(v)}
                      >
                        <SelectTrigger className="h-8 text-xs">
                          <SelectValue placeholder="Escolher o grupo" />
                        </SelectTrigger>
                        <SelectContent className="z-50">
                          {grupos.map((g) => (
                            <SelectItem key={g.id} value={g.id}>
                              {g.nome}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  )}
                  <div className="space-y-1">
                    <Label className="text-[11px] uppercase tracking-wide text-muted-foreground">
                      Escopo
                    </Label>
                    <Select
                      value={escopoMassa}
                      onValueChange={(v) => setEscopoMassa(v as "tela" | "modulo")}
                    >
                      <SelectTrigger className="h-8 text-xs">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent className="z-50">
                        <SelectItem value="tela">Esta tela</SelectItem>
                        <SelectItem value="modulo">Este módulo</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <Button
                    size="sm"
                    className="h-8 w-full text-xs"
                    disabled={
                      !grupoMassaEfetivo ||
                      liberarParaGrupo.isPending ||
                      qtdMassa === 0
                    }
                    onClick={() => {
                      if (!grupoMassaEfetivo) return;
                      if (escopoMassa === "tela") liberarTelaInteira(grupoMassaEfetivo);
                      else liberarModuloInteiro(grupoMassaEfetivo);
                      setMassaAberta(false);
                    }}
                  >
                    {!grupoMassaEfetivo
                      ? "Escolha o grupo"
                      : qtdMassa === 0
                        ? "Nada a liberar aqui"
                        : `Liberar ${qtdMassa} ${qtdMassa === 1 ? "linha" : "linhas"}`}
                  </Button>
                </PopoverContent>
              </Popover>
              {temFiltro && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-8 text-xs"
                  onClick={limparFiltros}
                >
                  <X className="mr-1 h-3.5 w-3.5" /> Limpar filtros
                </Button>
              )}
              {grupoConcedidas && (
                <Badge variant="outline" className="text-[10px]">
                  só o que {grupoConcedidas.nome} já acessa
                </Badge>
              )}
            </div>
          </CardHeader>
          <CardContent className="max-h-[70vh] overflow-auto p-0">
            <Table className="w-auto">
              <TableHeader className="sticky top-0 z-30 bg-card">
                <TableRow>
                  <TableHead className="sticky left-0 z-40 w-[320px] max-w-[320px] bg-card">
                    Linha
                  </TableHead>
                  <TableHead className="w-[90px]">Risco</TableHead>
                  <TableHead className="w-[150px] text-[11px]">Guarda atual</TableHead>
                  {porGrupo ? (
                    <TableHead className="min-w-[120px] text-center">Acessa</TableHead>
                  ) : (
                    gruposVisiveis.map((g) => (
                      <TableHead
                        key={g.id}
                        className="w-[90px] max-w-[90px] px-1 text-center align-bottom"
                      >
                        <span
                          className="block whitespace-normal break-words text-[11px] font-medium leading-tight"
                          title={
                            g.role_automatico ? `${g.nome} (${g.role_automatico})` : g.nome
                          }
                        >
                          {g.nome}
                        </span>
                        {g.role_automatico && (
                          <span className="block text-[9px] font-normal leading-tight text-muted-foreground">
                            {g.role_automatico}
                          </span>
                        )}
                      </TableHead>
                    ))
                  )}
                  <TableHead className="w-[90px] text-center">Conferido</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rotasDaTela.map(({ rota, itens }) => (
                  <Fragment key={rota}>
                    {rotasDaTela.length > 1 && (
                      <TableRow className="bg-muted/40 hover:bg-muted/40">
                        <TableCell colSpan={nColunas} className="py-1.5">
                          <span className="font-mono text-[11px] text-muted-foreground">
                            {rota}
                          </span>
                        </TableCell>
                      </TableRow>
                    )}
                    {itens.map((l) => {
                      const ehTela = l.tipo === "tela";
                      const semDeclaracao = naoDeclarada(l);
                      const porFlag = portaoPorFlag(l);
                      const bloqueado = semDeclaracao || porFlag || !l.permissao_id;
                      return (
                        <TableRow
                          key={l.linha_id}
                          onClick={() =>
                            setDetalhe((atual) =>
                              atual?.linha_id === l.linha_id ? null : l,
                            )
                          }
                          className={cn(
                            "cursor-pointer",
                            ehTela && "bg-muted/60 hover:bg-muted/60",
                            !ehTela && semGuarda(l) && "bg-warning/5",
                            !ehTela && l.conferido && "bg-success/5",
                            detalhe?.linha_id === l.linha_id &&
                              "ring-1 ring-inset ring-primary",
                          )}
                        >

                          <TableCell
                            className={cn(
                              "sticky left-0 z-10 max-w-[320px] align-top",
                              ehTela ? "bg-muted" : "bg-card",
                            )}
                          >
                            {ehTela && (
                              <span className="mb-0.5 block text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                                Acesso à tela
                              </span>
                            )}
                            <span className="flex flex-wrap items-center gap-1.5">
                              {!ehTela && l.conferido && (
                                <ShieldCheck className="h-3.5 w-3.5 text-success" />
                              )}
                              <span
                                className={cn(
                                  "whitespace-normal break-words",
                                  ehTela && "font-medium",
                                )}
                              >
                                {l.rotulo}
                              </span>
                              {semDeclaracao && l.tipo === "acao" && (
                                <Badge className="bg-warning/10 px-1 py-0 text-[9px] text-warning hover:bg-warning/10">
                                  ação não declarada
                                </Badge>
                              )}
                              {porFlag && (
                                <Badge variant="outline" className="px-1 py-0 text-[9px]">
                                  portão por flag
                                </Badge>
                              )}
                            </span>
                          </TableCell>
                          <TableCell className="align-top">{badgeRisco(l.risco)}</TableCell>
                          <TableCell className="align-top text-xs">
                            {renderGuarda(l.guarda_atual)}
                          </TableCell>

                          {bloqueado ? (
                            <TableCell
                              colSpan={porGrupo ? 1 : gruposVisiveis.length}
                              className="align-top text-center"
                              onClick={(e) => e.stopPropagation()}
                            >
                              {porFlag ? (
                                <span className="text-[11px] text-muted-foreground">
                                  Governada por papel
                                </span>
                              ) : (
                                <span className="inline-flex flex-wrap items-center justify-center gap-2">
                                  <span className="inline-flex opacity-40">
                                    <Checkbox disabled />
                                  </span>
                                  {isSuperAdmin && l.acao_superficie_id && (
                                    <Button
                                      size="sm"
                                      variant="outline"
                                      className="h-7 text-xs"
                                      onClick={() => setDeclarando(l)}
                                    >
                                      Declarar
                                    </Button>
                                  )}
                                </span>
                              )}
                            </TableCell>
                          ) : porGrupo ? (
                            <TableCell
                              className="text-center align-top"
                              onClick={(e) => e.stopPropagation()}
                            >
                              {grupoLenteId ? (
                                <CelulaConcessao
                                  concedido={concedido.has(
                                    `${grupoLenteId}|${l.permissao_id}`,
                                  )}
                                  nivelMinimo={
                                    nivelPorCelula.get(
                                      `${grupoLenteId}|${l.permissao_id}`,
                                    ) ?? null
                                  }
                                  niveis={niveis}
                                  desabilitado={
                                    togglePermissao.isPending || definirNivel.isPending
                                  }
                                  rotuloAria={l.rotulo}
                                  onToggle={(v) =>
                                    alternar(grupoLenteId, l.permissao_id as string, v)
                                  }
                                  onNivel={(nivel) =>
                                    definirNivel.mutate({
                                      grupoId: grupoLenteId,
                                      permissaoId: l.permissao_id as string,
                                      nivelMinimo: nivel,
                                    })
                                  }
                                />
                              ) : (
                                <span className="text-[11px] text-muted-foreground">
                                  escolha o grupo
                                </span>
                              )}
                            </TableCell>
                          ) : (
                            gruposVisiveis.map((g) => (
                              <TableCell
                                key={g.id}
                                className="px-1 text-center align-top"
                                onClick={(e) => e.stopPropagation()}
                              >
                                <CelulaConcessao
                                  concedido={concedido.has(`${g.id}|${l.permissao_id}`)}
                                  nivelMinimo={
                                    nivelPorCelula.get(`${g.id}|${l.permissao_id}`) ?? null
                                  }
                                  niveis={niveis}
                                  desabilitado={
                                    togglePermissao.isPending || definirNivel.isPending
                                  }
                                  rotuloAria={`${g.nome} — ${l.rotulo}`}
                                  onToggle={(v) =>
                                    alternar(g.id, l.permissao_id as string, v)
                                  }
                                  onNivel={(nivel) =>
                                    definirNivel.mutate({
                                      grupoId: g.id,
                                      permissaoId: l.permissao_id as string,
                                      nivelMinimo: nivel,
                                    })
                                  }
                                />
                              </TableCell>
                            ))
                          )}

                          <TableCell
                            className="text-center align-top"
                            onClick={(e) => e.stopPropagation()}
                          >
                            {!ehTela && l.acao_superficie_id ? (
                              <Checkbox
                                checked={l.conferido === true}
                                disabled={marcarConferido.isPending}
                                onCheckedChange={(v) =>
                                  marcarConferido.mutate({
                                    acaoId: l.acao_superficie_id as string,
                                    valor: v === true,
                                  })
                                }
                                aria-label={`Marcar ${l.rotulo} como conferido`}
                              />
                            ) : (
                              <span className="text-xs text-muted-foreground">—</span>
                            )}
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </Fragment>
                ))}
                {rotasDaTela.length === 0 && (
                  <TableRow>
                    <TableCell
                      colSpan={nColunas}
                      className="py-6 text-center text-sm text-muted-foreground"
                    >
                      {temFiltro
                        ? "Nenhuma linha bate com os filtros ativos."
                        : "Selecione uma tela na árvore."}
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        {/* ── Terceira coluna: só existe quando há linha selecionada (telas largas) ── */}
        {detalhe && (
          <Card className="hidden h-fit lg:sticky lg:top-4 lg:block">
            <CardHeader className="pb-2">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <CardTitle className="text-sm">{detalhe.rotulo}</CardTitle>
                  <p className="break-all font-mono text-[11px] text-muted-foreground">
                    {detalhe.rota}
                  </p>
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-6 w-6 shrink-0"
                  aria-label="Fechar detalhe"
                  onClick={() => setDetalhe(null)}
                >
                  <X className="h-3.5 w-3.5" />
                </Button>
              </div>
            </CardHeader>
            <CardContent className="max-h-[70vh] overflow-y-auto">
              <DetalheLinha
                linha={detalhe}
                isSuperAdmin={isSuperAdmin}
                onDeclarar={() => setDeclarando(detalhe)}
              />
            </CardContent>
          </Card>
        )}
      </div>


      {/* ── Mobile/estreito: o mesmo detalhe volta como Sheet por cima ── */}
      <Sheet
        open={!!detalhe && !telaLarga}
        onOpenChange={(aberto) => !aberto && setDetalhe(null)}
      >
        <SheetContent className="w-full overflow-y-auto sm:max-w-md">
          {detalhe && (
            <>
              <SheetHeader>
                <SheetTitle className="text-base">{detalhe.rotulo}</SheetTitle>
                <SheetDescription className="font-mono text-xs">
                  {detalhe.rota}
                </SheetDescription>
              </SheetHeader>
              <div className="mt-4">
                <DetalheLinha
                  linha={detalhe}
                  isSuperAdmin={isSuperAdmin}
                  onDeclarar={() => {
                    setDeclarando(detalhe);
                    setDetalhe(null);
                  }}
                />
              </div>
            </>
          )}
        </SheetContent>
      </Sheet>


      <DeclararAcaoDialog
        linha={declarando}
        onOpenChange={(aberto) => {
          if (!aberto) setDeclarando(null);
        }}
      />
    </div>
  );
}
