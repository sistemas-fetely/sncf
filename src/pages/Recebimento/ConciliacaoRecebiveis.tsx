/**
 * /administrativo/conciliacao-recebiveis — CONCILIAÇÃO DE RECEBÍVEIS.
 *
 * Casa nova da frente conciliacao-recebiveis (F1). Dinheiro que entrou:
 * de quem é (Entradas a reconhecer), contra o quê, com que prova
 * (Conciliação de Cartão).
 *
 * As duas abas são componentes que já existiam em outras telas — nada foi
 * reescrito, só mudou o endereço. Permissão zero-novidade: cada aba usa
 * exatamente o slug que já usava na casa antiga
 * (tela.cliente_entradas / tela.fin_conciliacao). Aba sem concessão não
 * aparece, nem desabilitada.
 *
 * PENDENTE DE NASCIMENTO: esta rota precisa nascer no banco via
 * fn_nascer_tela (nó em sncf_navegacao + slug da casa). Até lá, o portão
 * de rota fail-closed só deixa super_admin entrar.
 */
import { useEffect } from "react";
import { Landmark } from "lucide-react";
import { PageShell } from "@/components/layout/PageShell";
import { PageHeader } from "@/components/layout/PageHeader";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useAbaUrl } from "@/hooks/useAbaUrl";
import { AbaPermitida, ConteudoAba, usePodeVerAba } from "@/components/AbaGate";
import { EntradasReconhecerTab } from "@/components/financeiro/EntradasReconhecerTab";
import { ConciliacaoCartaoConteudo } from "@/pages/administrativo/ConciliacaoCartao";
import { MesaConciliacaoConteudo } from "@/pages/administrativo/ConciliacaoMesa";
import { ConciliacaoPorCliente } from "@/components/financeiro/ConciliacaoPorCliente";

const ABAS = [
  { value: "entradas", label: "Entradas a reconhecer", slug: "tela.cliente_entradas" },
  { value: "creditos", label: "Créditos do banco", slug: "tela.fin_concil_mesa" },
  { value: "por-cliente", label: "Por cliente", slug: "tela.fin_receb_conciliar" },
  { value: "cartao", label: "Cartão", slug: "tela.fin_conciliacao" },
] as const;

type AbaValue = (typeof ABAS)[number]["value"];

export default function ConciliacaoRecebiveis() {
  const [abaUrl, setAba] = useAbaUrl("entradas");
  // Link salvo com a aba antiga "por-pedido" cai em "por-cliente".
  const aba = abaUrl === "por-pedido" ? "por-cliente" : abaUrl;


  const permEntradas = usePodeVerAba("tela.cliente_entradas");
  const permCreditos = usePodeVerAba("tela.fin_concil_mesa");
  const permPorPedido = usePodeVerAba("tela.fin_receb_conciliar");
  const permCartao = usePodeVerAba("tela.fin_conciliacao");
  const permissoes: Record<AbaValue, { podeVer: boolean; carregando: boolean }> = {
    entradas: permEntradas,
    creditos: permCreditos,
    "por-cliente": permPorPedido,
    cartao: permCartao,
  };

  const carregandoPermissoes =
    permEntradas.carregando ||
    permCreditos.carregando ||
    permPorPedido.carregando ||
    permCartao.carregando;

  // Primeira aba permitida vira o fallback quando a URL aponta para uma
  // aba que a pessoa não pode ver (padrão da CobrancaFila).
  const primeiraPermitida = ABAS.find((a) => permissoes[a.value].podeVer)?.value;
  const abaAtiva: AbaValue | null =
    (ABAS as readonly { value: string }[]).some((a) => a.value === aba) &&
    permissoes[aba as AbaValue].podeVer
      ? (aba as AbaValue)
      : primeiraPermitida ?? null;

  useEffect(() => {
    if (carregandoPermissoes) return;
    if (abaAtiva && abaAtiva !== aba) setAba(abaAtiva);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [carregandoPermissoes, abaAtiva, aba]);

  return (
    <PageShell variant="dados" className="animate-casa-fade-in">
      <PageHeader
        titulo="Conciliação de Recebíveis"
        icone={Landmark}
        estado="Dinheiro que entrou: de quem é, contra o quê, com que prova."
      />

      {carregandoPermissoes ? null : !abaAtiva ? (
        <div className="rounded-md border border-border bg-muted/40 px-3 py-6 text-sm text-muted-foreground text-center">
          Você não tem permissão para ver estes dados.
        </div>
      ) : (
        <Tabs value={abaAtiva} onValueChange={setAba}>
          <TabsList>
            {ABAS.map((a) => (
              <AbaPermitida key={a.value} slug={a.slug}>
                <TabsTrigger value={a.value}>{a.label}</TabsTrigger>
              </AbaPermitida>
            ))}
          </TabsList>

          <TabsContent value="entradas" className="mt-4">
            <ConteudoAba slug="tela.cliente_entradas">
              <EntradasReconhecerTab />
            </ConteudoAba>
          </TabsContent>

          <TabsContent value="creditos" className="mt-4">
            <ConteudoAba slug="tela.fin_concil_mesa">
              {/* paramAba="sub": as sub-abas extrato/cartão da Mesa não podem
                  colidir com o ?aba= desta casa. */}
              <MesaConciliacaoConteudo paramAba="sub" />
            </ConteudoAba>
          </TabsContent>

          <TabsContent value="por-cliente" className="mt-4">
            <ConteudoAba slug="tela.fin_receb_conciliar">
              <ConciliacaoPorCliente />
            </ConteudoAba>
          </TabsContent>

          <TabsContent value="cartao" className="mt-4">
            <ConteudoAba slug="tela.fin_conciliacao">
              {/* paramAba="sub": as sub-abas internas (vincular/automática/extrato)
                  não podem colidir com o ?aba= desta casa. */}
              <ConciliacaoCartaoConteudo paramAba="sub" />
            </ConteudoAba>
          </TabsContent>
        </Tabs>
      )}
    </PageShell>
  );
}
