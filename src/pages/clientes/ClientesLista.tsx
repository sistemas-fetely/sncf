/**
 * /cliente — CONTA CORRENTE CLIENTE.
 *
 * Três abas na mesma tela, porque é o mesmo assunto: quanto o cliente deve,
 * o que entrou no banco e ainda não tem dono, e o que ele já recebeu de graça.
 * Antes a fila de entradas morava em Finanças — o usuário tinha que sair do
 * SOps e voltar. Constraint de banco não manda em produto.
 *
 * PERMISSÃO-SEGUE-O-DADO: aba sem concessão não aparece, nem desabilitada.
 * A lista de contas é o conteúdo base da tela e não tem gate próprio.
 */
import { useEffect, useMemo } from "react";
import { useSearchParams } from "react-router-dom";
import { Plus, Users } from "lucide-react";
import { PageHeader } from "@/components/layout/PageHeader";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { usePodeVerAba } from "@/components/AbaGate";
import { ListaContasClientes } from "@/components/clientes/ListaContasClientes";
import { BonificacoesTab } from "@/components/clientes/BonificacoesTab";
import { EntradasReconhecerTab } from "@/components/financeiro/EntradasReconhecerTab";
import { RegistrarRecebimentoDialog } from "@/components/financeiro/RegistrarRecebimentoDialog";

const ABA_ENTRADAS = "tela.cliente_entradas";
const ABA_BONIFICACOES = "tela.cliente_bonificacoes";

export default function ClientesLista() {
  const [params, setParams] = useSearchParams();

  const podeEntradas = usePodeVerAba(ABA_ENTRADAS);
  const podeBonificacoes = usePodeVerAba(ABA_BONIFICACOES);

  const visiveis = useMemo(() => {
    const abas = [{ value: "contas", label: "Contas de clientes" }];
    if (podeEntradas.podeVer) abas.push({ value: "entradas", label: "Entradas a reconhecer" });
    if (podeBonificacoes.podeVer) abas.push({ value: "bonificacoes", label: "Bonificações" });
    return abas;
  }, [podeEntradas.podeVer, podeBonificacoes.podeVer]);

  const abaUrl = params.get("aba");
  const abaAtiva = visiveis.find((a) => a.value === abaUrl)?.value ?? "contas";

  // Aba pedida na URL que a pessoa não pode ver cai na lista de contas.
  useEffect(() => {
    if (abaUrl && abaUrl !== abaAtiva) {
      const next = new URLSearchParams(params);
      next.set("aba", abaAtiva);
      setParams(next, { replace: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [abaAtiva, abaUrl]);

  function trocarAba(valor: string) {
    const next = new URLSearchParams(params);
    next.set("aba", valor);
    setParams(next, { replace: false });
  }

  return (
    <div className="space-y-4">
      <PageHeader
        titulo="Conta Corrente Cliente"
        icone={Users}
        acoes={
          <RegistrarRecebimentoDialog>
            <Button size="sm" className="gap-1.5">
              <Plus className="h-3.5 w-3.5" /> Registrar recebimento
            </Button>
          </RegistrarRecebimentoDialog>
        }
      />

      <Tabs value={abaAtiva} onValueChange={trocarAba}>
        <TabsList>
          {visiveis.map((a) => (
            <TabsTrigger key={a.value} value={a.value}>
              {a.label}
            </TabsTrigger>
          ))}
        </TabsList>

        <TabsContent value="contas" className="mt-4">
          <ListaContasClientes mostrarCabecalho={false} />
        </TabsContent>

        {podeEntradas.podeVer && (
          <TabsContent value="entradas" className="mt-4">
            <EntradasReconhecerTab />
          </TabsContent>
        )}

        {podeBonificacoes.podeVer && (
          <TabsContent value="bonificacoes" className="mt-4">
            <BonificacoesTab />
          </TabsContent>
        )}
      </Tabs>
    </div>
  );
}
