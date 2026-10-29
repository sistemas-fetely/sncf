import { useEffect } from "react";
import { Loader2 } from "lucide-react";
import { useAbaUrl } from "@/hooks/useAbaUrl";
import { AbaPermitida, ConteudoAba, usePodeVerAba } from "@/components/AbaGate";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { PageHeader } from "@/components/layout/PageHeader";
import RecebimentoXpm from "./RecebimentoXpm";
import EstoqueXpm from "./EstoqueXpm";
import ExpedicoesXpm from "./ExpedicoesXpm";
import PainelXpm from "./PainelXpm";
import { ImportarFasesXpm } from "./ImportarFasesXpm";
import { ComparativoFontesXpm } from "./ComparativoFontesXpm";
import FaturamentoXpm from "./FaturamentoXpm";
import OperacaoXpm from "./OperacaoXpm";

// CASCA-E-ABA (12/09/2026): mesmo padrão do PedidosIndex — a rota tem portão
// próprio (tela.wms_casa) e cada aba tem slug próprio.
const TABS = [
  { value: "operacao", slug: "tela.wms_operacao", label: "Operação", component: <OperacaoXpm /> },
  { value: "expedicoes", slug: "tela.wms_expedicoes", label: "Expedições", component: <ExpedicoesXpm /> },
  { value: "painel", slug: "tela.wms_painel", label: "Painel XPM", component: <PainelXpm /> },
  { value: "recebimento", slug: "tela.wms_recebimento", label: "Recebimento XPM", component: <RecebimentoXpm /> },
  { value: "estoque", slug: "tela.wms_estoque", label: "Estoque XPM", component: <EstoqueXpm /> },
  { value: "importar-fases", slug: "tela.wms_expedicoes", label: "Importar fases", component: <ImportarFasesXpm /> },
  { value: "funil", slug: "tela.wms_expedicoes", label: "Funil API × Arquivo", component: <ComparativoFontesXpm /> },
  { value: "faturamento", slug: "tela.wms_faturamento", label: "Faturamento", component: <FaturamentoXpm /> },
] as const;
type AbaXpm = (typeof TABS)[number]["value"];

function CarregandoAba() {
  return (
    <div className="flex items-center justify-center py-16">
      <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
    </div>
  );
}

export default function XpmIndex() {
  const [tab, setTab] = useAbaUrl(TABS[0].value);

  const permExpedicoes = usePodeVerAba("tela.wms_expedicoes");
  const permPainel = usePodeVerAba("tela.wms_painel");
  const permRecebimento = usePodeVerAba("tela.wms_recebimento");
  const permEstoque = usePodeVerAba("tela.wms_estoque");
  const permFaturamento = usePodeVerAba("tela.wms_faturamento");
  const permOperacao = usePodeVerAba("tela.wms_operacao");

  const permissoes: Record<AbaXpm, { podeVer: boolean; carregando: boolean }> = {
    operacao: permOperacao,
    expedicoes: permExpedicoes,
    painel: permPainel,
    recebimento: permRecebimento,
    estoque: permEstoque,
    "importar-fases": permExpedicoes,
    funil: permExpedicoes,
    faturamento: permFaturamento,
  };

  const carregandoPermissoes = TABS.some((t) => permissoes[t.value].carregando);
  const primeiraPermitida = TABS.find((t) => permissoes[t.value].podeVer)?.value;
  const abaSolicitada: AbaXpm = TABS.some((t) => t.value === tab)
    ? (tab as AbaXpm)
    : TABS[0].value;
  const abaEfetiva: AbaXpm | undefined = carregandoPermissoes
    ? abaSolicitada
    : permissoes[abaSolicitada].podeVer
      ? abaSolicitada
      : primeiraPermitida;

  // Redireciona para a primeira aba permitida quando a URL aponta para uma proibida.
  useEffect(() => {
    if (carregandoPermissoes) return;
    if (abaEfetiva && abaEfetiva !== abaSolicitada) setTab(abaEfetiva);
  }, [carregandoPermissoes, abaEfetiva, abaSolicitada, setTab]);

  return (
    <div className="flex flex-col h-full">
      <div className="border-b bg-card px-4 pt-4">
        <PageHeader titulo="XPM" className="mb-3" />
        {carregandoPermissoes ? null : !primeiraPermitida ? null : (
          <Tabs value={abaEfetiva ?? abaSolicitada} onValueChange={setTab}>
            <TabsList>
              {TABS.map((t) => (
                <AbaPermitida key={t.value} slug={t.slug}>
                  <TabsTrigger value={t.value}>{t.label}</TabsTrigger>
                </AbaPermitida>
              ))}
            </TabsList>
          </Tabs>
        )}
      </div>
      <div className="flex-1 overflow-auto">
        {carregandoPermissoes ? (
          <CarregandoAba />
        ) : !primeiraPermitida ? (
          <div className="rounded-md border border-border bg-muted/40 px-3 py-6 m-4 text-sm text-muted-foreground text-center">
            Você não tem acesso a nenhuma aba desta tela.
          </div>
        ) : (
          <Tabs value={abaEfetiva ?? abaSolicitada}>
            {TABS.map((t) => (
              <TabsContent key={t.value} value={t.value} className="mt-0">
                <ConteudoAba slug={t.slug}>{t.component}</ConteudoAba>
              </TabsContent>
            ))}
          </Tabs>
        )}
      </div>
    </div>
  );
}
