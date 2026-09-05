/**
 * PAINEL DO CLIENTE — uma tela só para "como está o dinheiro deste CNPJ?".
 *
 * Consolida cinco telas divergentes. Cada aba tem sua própria concessão
 * (PERMISSÃO-SEGUE-O-DADO): aba sem concessão NÃO aparece, nem desabilitada.
 * A aba padrão é a primeira que a pessoa pode ver; sem nenhuma, a tela mostra
 * o estado de sem-permissão do projeto.
 */
import { useEffect, useMemo } from "react";
import { useNavigate, useParams, useSearchParams, useLocation } from "react-router-dom";
import { ArrowLeft, Users } from "lucide-react";
import { PageShell } from "@/components/layout/PageShell";
import { PageHeader } from "@/components/layout/PageHeader";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { AcessoBloqueado } from "@/components/AcessoBloqueado";
import { usePodeVerAba } from "@/components/AbaGate";
import { useClienteCadastro } from "@/hooks/clientes/useClientePainel";
import { ClienteAbaPosicao } from "@/components/clientes/ClienteAbaPosicao";
import { ClienteAbaExtrato } from "@/components/clientes/ClienteAbaExtrato";
import { ClienteAbaCadastro } from "@/components/clientes/ClienteAbaCadastro";
import { ClienteAbaPendencias } from "@/components/clientes/ClienteAbaPendencias";
import { PedidosDoParceiroSection } from "@/components/parceiros/PedidosDoParceiroSection";

const ABAS = [
  { value: "posicao", label: "Posição e Crédito", slug: "tela.cliente_posicao" },
  { value: "extrato", label: "Extrato", slug: "tela.cliente_extrato" },
  { value: "pedidos", label: "Pedidos", slug: "tela.cliente_pedidos" },
  { value: "cadastro", label: "Cadastro", slug: "tela.cliente_cadastro" },
  { value: "pendencias", label: "Pendências", slug: "tela.cliente_auditoria" },
] as const;

export default function ClientePainel() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  const [params, setParams] = useSearchParams();

  const cadastro = useClienteCadastro(id);

  // Um hook por aba, em ordem fixa — a regra dos hooks continua obedecida.
  const p0 = usePodeVerAba(ABAS[0].slug);
  const p1 = usePodeVerAba(ABAS[1].slug);
  const p2 = usePodeVerAba(ABAS[2].slug);
  const p3 = usePodeVerAba(ABAS[3].slug);
  const p4 = usePodeVerAba(ABAS[4].slug);
  const permissoes = [p0, p1, p2, p3, p4];

  const carregandoPermissoes = permissoes.some((p) => p.carregando);
  const visiveis = useMemo(
    () => ABAS.filter((_, i) => permissoes[i].podeVer),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [p0.podeVer, p1.podeVer, p2.podeVer, p3.podeVer, p4.podeVer],
  );

  const abaUrl = params.get("aba");
  const abaAtiva =
    visiveis.find((a) => a.value === abaUrl)?.value ?? visiveis[0]?.value ?? "";

  // Aba pedida na URL que a pessoa não pode ver cai na primeira visível.
  useEffect(() => {
    if (!abaAtiva) return;
    if (abaUrl !== abaAtiva) {
      const next = new URLSearchParams(params);
      next.set("aba", abaAtiva);
      setParams(next, { replace: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [abaAtiva]);

  function voltar() {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const from = (location.state as any)?.from as string | undefined;
    navigate(from ?? "/cliente");
  }

  if (!id) {
    return (
      <PageShell>
        <p className="text-sm text-muted-foreground">Cliente não informado.</p>
      </PageShell>
    );
  }

  if (carregandoPermissoes) {
    return (
      <PageShell>
        <Skeleton className="h-8 w-56" />
        <Skeleton className="h-32 w-full" />
      </PageShell>
    );
  }

  if (visiveis.length === 0) {
    return (
      <PageShell className="flex min-h-[60vh] items-center justify-center">
        <AcessoBloqueado tipo="sem-permissao" onVoltar={voltar} />
      </PageShell>
    );
  }

  const cliente = cadastro.data;
  const nome = cliente?.nome_fantasia || cliente?.razao_social || "Cliente";
  const documento = cliente?.cnpj || cliente?.cpf || null;

  return (
    <PageShell>
      <PageHeader
        titulo={nome}
        icone={Users}
        estado={
          cadastro.isLoading
            ? "carregando"
            : [cliente?.razao_social, documento].filter(Boolean).join(" · ") || undefined
        }
        acoes={
          <Button variant="ghost" size="sm" className="gap-1.5" onClick={voltar}>
            <ArrowLeft className="h-3.5 w-3.5" /> Voltar
          </Button>
        }
      />

      <Tabs
        value={abaAtiva}
        onValueChange={(v) => {
          const next = new URLSearchParams(params);
          next.set("aba", v);
          setParams(next);
        }}
        className="space-y-4"
      >
        <TabsList className="bg-transparent border-b border-border rounded-none w-full justify-start h-auto p-0 gap-6">
          {visiveis.map((a) => (
            <TabsTrigger
              key={a.value}
              value={a.value}
              className="rounded-none border-b-2 border-transparent bg-transparent px-0 pb-2 pt-0 text-sm data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:shadow-none"
            >
              {a.label}
            </TabsTrigger>
          ))}
        </TabsList>

        {visiveis.some((a) => a.value === "posicao") && (
          <TabsContent value="posicao">
            <ClienteAbaPosicao parceiroId={id} />
          </TabsContent>
        )}
        {visiveis.some((a) => a.value === "extrato") && (
          <TabsContent value="extrato">
            <ClienteAbaExtrato parceiroId={id} clienteNome={nome} />
          </TabsContent>
        )}
        {visiveis.some((a) => a.value === "pedidos") && (
          <TabsContent value="pedidos">
            <PedidosDoParceiroSection parceiroId={id} />
          </TabsContent>
        )}
        {visiveis.some((a) => a.value === "cadastro") && (
          <TabsContent value="cadastro">
            <ClienteAbaCadastro parceiroId={id} />
          </TabsContent>
        )}
        {visiveis.some((a) => a.value === "pendencias") && (
          <TabsContent value="pendencias">
            <ClienteAbaPendencias parceiroId={id} />
          </TabsContent>
        )}
      </Tabs>
    </PageShell>
  );
}
