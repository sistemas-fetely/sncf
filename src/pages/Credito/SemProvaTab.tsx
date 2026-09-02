import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { TooltipProvider } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { formatBRL } from "@/lib/format-currency";
import { formatCNPJ } from "@/lib/cnpj";
import { apelidoParceiro, nomeCanonico } from "@/lib/parceiros/nome";
import { fmtDataMesa, seloEntrega, seloInstrumento, Selo } from "@/lib/financeiro/mesa-lastros";
import type { LinhaMesa } from "@/lib/financeiro/adaptar-titulo-mesa";
import {
  useSemProvaFila,
  useCartaoConciliarFila,
  useInstrumentoQuebradoFila,
  useNaoCobravelFila,
} from "@/hooks/credito/useSemProvaFila";

/**
 * Aba "Problemas Cobrança" — CARTÃO-NÃO-VENCE-PROVA-VENCE +
 * COBRANCA-SEPARA-CLIENTE-DE-DEFEITO.
 *
 * A Régua cobra PESSOA (EM_CURSO, A_VENCER, A_COBRAR). Aqui mora tudo que
 * impede receber e NÃO é dívida do cliente: prova faltando, instrumento
 * quebrado, liquidação da adquirente pendente. Mais um bloco informativo para
 * o que tem regime próprio e antes não aparecia em nenhuma tela.
 *
 * Esta aba NÃO cobra cliente: não existe "Registrar ação" nem "Renegociar".
 * É visão e navegação. Classificação, gravidade e frase de orientação vêm da
 * view `vw_cobranca_mesa`; a tela só ordena e agrupa.
 */

/** Gravidade decrescente — ordem exata do bloco. */
const ORDEM_CLASSE = ["divergente", "sem_prova", "declarado_humano", "credito_atrasado"] as const;
type ProvaClasse = (typeof ORDEM_CLASSE)[number];

const ROTULO_BLOCO: Record<ProvaClasse, string> = {
  divergente: "DIVERGENTE — o valor da movimentação não fecha",
  sem_prova: "PAGO SEM NENHUMA PROVA",
  declarado_humano: "DECLARADO POR PESSOA, SEM LASTRO",
  credito_atrasado: "CRÉDITO DA ADQUIRENTE ATRASADO",
};

const ROTULO_CARD: Record<ProvaClasse, string> = {
  divergente: "Divergente",
  sem_prova: "Sem nenhuma prova",
  declarado_humano: "Declarado por pessoa",
  credito_atrasado: "Crédito atrasado",
};

const TOM_BLOCO: Record<ProvaClasse, "destructive" | "warning"> = {
  divergente: "destructive",
  sem_prova: "destructive",
  declarado_humano: "warning",
  credito_atrasado: "warning",
};

const BLOCO_CARTAO = "AGUARDANDO LIQUIDAÇÃO DA ADQUIRENTE";
const BLOCO_INSTRUMENTO = "INSTRUMENTO DE COBRANÇA QUEBRADO";
const BLOCO_NAO_COBRAVEL = "REGIME PRÓPRIO — NÃO ENTRA NA RÉGUA";

/**
 * CARD-E-PORTA (02/09/2026): cada card de resumo e a porta do seu bloco.
 * Card sem bloco correspondente vira numero decorativo; bloco sem card vira
 * secao inalcancavel. Por isso a chave e a MESMA lista para os dois.
 */
type ChaveFiltro = ProvaClasse | "instrumento" | "cartao" | "nao_cobravel";

const ROTULO_CARD_EXTRA: Record<"instrumento" | "cartao" | "nao_cobravel", string> = {
  instrumento: "Instrumento quebrado",
  cartao: "Aguardando adquirente",
  nao_cobravel: "Regime próprio",
};

function soma(rows: LinhaMesa[]) {
  return rows.reduce((acc, l) => acc + Number(l.valor_atual ?? 0), 0);
}

function BlocoHeader({
  titulo, qtd, total, tom,
}: {
  titulo: string;
  qtd: number;
  total: number;
  tom: "destructive" | "warning" | "muted";
}) {
  return (
    <div
      className={cn(
        "flex items-center justify-between gap-2 rounded-md border px-3 py-2",
        tom === "destructive" && "border-destructive/40 bg-destructive/5 text-destructive",
        tom === "warning" && "border-warning/40 bg-warning/10 text-warning",
        tom === "muted" && "border-border bg-muted/40 text-muted-foreground",
      )}
    >
      <h3 className="text-sm font-medium uppercase tracking-wide">{titulo}</h3>
      <span className="text-xs tabular-nums">
        {qtd} {qtd === 1 ? "título" : "títulos"} · {formatBRL(total)}
      </span>
    </div>
  );
}

function CardResumo({
  label, qtd, total, tom,
}: {
  label: string;
  qtd: number;
  total: number;
  tom: "destructive" | "warning" | "muted";
}) {
  return (
    <div
      className={cn(
        "text-left p-3 rounded-lg border bg-card",
        tom === "destructive" && "border-destructive/40 text-destructive",
        tom === "warning" && "border-warning/40 text-warning",
        tom === "muted" && "border-border",
      )}
    >
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="text-2xl font-medium mt-1">{qtd}</div>
      <div className="text-xs text-muted-foreground tabular-nums">{formatBRL(total)}</div>
    </div>
  );
}

function CardSemProva({
  l, cartao,
}: {
  l: LinhaMesa;
  /** Bloco da adquirente: data é liquidação prevista, nunca "vence"; sem badge de atraso. */
  cartao?: boolean;
}) {
  const navigate = useNavigate();
  const razao = nomeCanonico(l.nome_exibicao ?? l.nome_canonico, "—");
  const apelido = apelidoParceiro(l.nome_exibicao ?? l.nome_canonico, l.apelido);
  const classe = (l.prova_classe ?? "") as ProvaClasse;
  const grave = classe === "divergente" || classe === "sem_prova";

  return (
    <div
      className={cn(
        "rounded-md border bg-card p-3 space-y-2",
        cartao
          ? "border-l-4 border-l-muted-foreground/40"
          : grave
            ? "border-l-4 border-l-destructive"
            : "border-l-4 border-l-warning",
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-sm font-medium truncate">{razao}</p>
          {apelido && <p className="text-xs text-muted-foreground truncate">{apelido}</p>}
          <p className="text-xs text-muted-foreground">
            {l.parceiro_cnpj ? formatCNPJ(l.parceiro_cnpj) : ""}
          </p>
          <p className="text-xs text-muted-foreground font-mono mt-0.5">
            {[
              l.pedido || null,
              l.numero_titulo,
              (l.total_parcelas ?? 1) > 1 ? `parcela ${l.numero_parcela}/${l.total_parcelas}` : null,
              l.nf_numero ? `NF ${l.nf_numero}` : null,
            ].filter(Boolean).join(" · ")}
          </p>
        </div>
        <div className="text-right shrink-0">
          <div className={cn("font-medium text-base", cartao ? "" : grave ? "text-destructive" : "text-warning")}>
            {formatBRL(Number(l.valor_atual ?? 0))}
          </div>
          {!cartao && classe && (
            <Badge
              className={cn(
                "text-[10px]",
                grave
                  ? "bg-destructive/10 text-destructive hover:bg-destructive/10"
                  : "bg-warning/10 text-warning hover:bg-warning/10",
              )}
            >
              {ROTULO_CARD[classe] ?? classe}
            </Badge>
          )}
        </div>
      </div>

      <p className="text-xs text-muted-foreground">
        {cartao ? "liquidação prevista " : "vence "}
        {fmtDataMesa(l.vencimento)}
        {l.instrumento ? ` · ${l.instrumento}` : ""}
        {l.estagio ? ` · ${l.estagio}` : ""}
      </p>

      {l.acao_sugerida && (
        <div className="rounded-md border border-warning/40 bg-warning/10 px-2 py-1.5 text-[11px] font-medium text-warning">
          <AlertTriangle className="h-3 w-3 inline mr-1 -mt-0.5" />
          {l.acao_sugerida}
        </div>
      )}
      {l.ressalvas && <p className="text-[11px] text-muted-foreground">{l.ressalvas}</p>}

      <TooltipProvider>
        <div className="flex flex-wrap items-center gap-1">
          {seloInstrumento(l)}
          {seloEntrega(l)}
          {l.nivel_prova && (
            <Selo
              texto={`nível de prova: ${l.nivel_prova}`}
              tom={grave ? "vermelho" : "ambar"}
              tooltip="Eixo canônico de prova do título, definido pelo banco."
            />
          )}
        </div>
      </TooltipProvider>

      <div className="flex flex-wrap gap-1.5 pt-1">
        <Button
          size="sm"
          variant="outline"
          className="h-7 text-xs"
          onClick={() => l.pedido_id && navigate(`/pedidos/${l.pedido_id}`)}
        >
          Ver pedido
        </Button>
        <Button
          size="sm"
          variant="ghost"
          className="h-7 text-xs"
          onClick={() => l.pedido_id && navigate(`/recebimento/cobranca/${l.pedido_id}`)}
        >
          Ver título
        </Button>
      </div>
    </div>
  );
}

export default function SemProvaTab() {
  const { data: linhas = [], isLoading } = useSemProvaFila();
  const { data: cartao = [], isLoading: loadingCartao } = useCartaoConciliarFila();
  const { data: instrumento = [], isLoading: loadingInstr } = useInstrumentoQuebradoFila();
  const { data: naoCobravel = [], isLoading: loadingNC } = useNaoCobravelFila();

  const blocos = useMemo(() => {
    return ORDEM_CLASSE.map((classe) => ({
      classe,
      rows: linhas
        .filter((l) => l.prova_classe === classe)
        .sort((a, b) => Number(b.valor_atual ?? 0) - Number(a.valor_atual ?? 0)),
    }));
  }, [linhas]);

  if (isLoading || loadingCartao || loadingInstr || loadingNC) {
    return (
      <div className="space-y-2">
        <Skeleton className="h-16 w-full" />
        <Skeleton className="h-16 w-full" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 max-w-3xl">
        {blocos.map(({ classe, rows }) => (
          <CardResumo
            key={classe}
            label={ROTULO_CARD[classe]}
            qtd={rows.length}
            total={soma(rows)}
            tom={TOM_BLOCO[classe]}
          />
        ))}
        <CardResumo
          label="Instrumento quebrado"
          qtd={instrumento.length}
          total={soma(instrumento)}
          tom="destructive"
        />
      </div>

      {blocos.map(({ classe, rows }) => (
        <section key={classe} className="space-y-2">
          <BlocoHeader
            titulo={ROTULO_BLOCO[classe]}
            qtd={rows.length}
            total={soma(rows)}
            tom={TOM_BLOCO[classe]}
          />
          {rows.length === 0 ? (
            <div className="rounded-md border border-dashed px-3 py-3 text-xs text-muted-foreground">
              Nenhum título nesta classe.
            </div>
          ) : (
            <div className="grid gap-2 md:grid-cols-2 lg:grid-cols-3">
              {rows.map((l) => (
                <CardSemProva key={l.titulo_id} l={l} />
              ))}
            </div>
          )}
        </section>
      ))}

      <section className="space-y-2">
        <BlocoHeader
          titulo={BLOCO_INSTRUMENTO}
          qtd={instrumento.length}
          total={soma(instrumento)}
          tom="destructive"
        />
        <p className="text-xs text-muted-foreground">
          O título é legítimo e o cliente pode estar em dia — o meio de cobrança é que não
          funciona. Não se cobra pessoa por isso: conserta-se o instrumento. Estes títulos saíram
          da Régua.
        </p>
        {instrumento.length === 0 ? (
          <div className="rounded-md border border-dashed px-3 py-3 text-xs text-muted-foreground">
            Nenhum instrumento de cobrança quebrado.
          </div>
        ) : (
          <div className="grid gap-2 md:grid-cols-2 lg:grid-cols-3">
            {instrumento
              .slice()
              .sort((a, b) => Number(b.valor_atual ?? 0) - Number(a.valor_atual ?? 0))
              .map((l) => (
                <CardSemProva key={l.titulo_id} l={l} />
              ))}
          </div>
        )}
      </section>

      <section className="space-y-2">
        <BlocoHeader
          titulo={BLOCO_CARTAO}
          qtd={cartao.length}
          total={soma(cartao)}
          tom="muted"
        />
        {cartao.length === 0 ? (
          <div className="rounded-md border border-dashed px-3 py-3 text-xs text-muted-foreground">
            Nenhum cartão aguardando liquidação da adquirente.
          </div>
        ) : (
          <div className="grid gap-2 md:grid-cols-2 lg:grid-cols-3">
            {cartao
              .slice()
              .sort((a, b) => Number(b.valor_atual ?? 0) - Number(a.valor_atual ?? 0))
              .map((l) => (
                <CardSemProva key={l.titulo_id} l={l} cartao />
              ))}
          </div>
        )}
      </section>

      <section className="space-y-2">
        <BlocoHeader
          titulo={BLOCO_NAO_COBRAVEL}
          qtd={naoCobravel.length}
          total={soma(naoCobravel)}
          tom="muted"
        />
        <p className="text-xs text-muted-foreground">
          Informativo, não é problema: consignado, haver e permuta têm ciclo próprio e por isso
          ficam fora da régua. Aparecem aqui porque antes não apareciam em nenhuma tela — e
          invisível não é o mesmo que resolvido.
        </p>
        {naoCobravel.length === 0 ? (
          <div className="rounded-md border border-dashed px-3 py-3 text-xs text-muted-foreground">
            Nenhum título em regime próprio.
          </div>
        ) : (
          <div className="grid gap-2 md:grid-cols-2 lg:grid-cols-3">
            {naoCobravel
              .slice()
              .sort((a, b) => Number(b.valor_atual ?? 0) - Number(a.valor_atual ?? 0))
              .map((l) => (
                <CardSemProva key={l.titulo_id} l={l} />
              ))}
          </div>
        )}
      </section>
    </div>
  );
}
