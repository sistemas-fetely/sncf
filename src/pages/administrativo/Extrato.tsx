import { useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { Inbox, Loader2 } from "lucide-react";
import { PageShell } from "@/components/layout/PageShell";
import { PageHeader } from "@/components/layout/PageHeader";
import { AbaPermitida, ConteudoAba, usePodeVerAba } from "@/components/AbaGate";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useAbaUrl } from "@/hooks/useAbaUrl";
import { sb, useFilaExtrato } from "@/components/extrato/dados";
import FilaTab from "@/components/extrato/FilaTab";
import RegrasTab from "@/components/extrato/RegrasTab";
import ParesTab from "@/components/extrato/ParesTab";

export default function Extrato() {
  const [aba, setAba] = useAbaUrl("fila");
  const filaPerm = usePodeVerAba("tela.fin_extrato_inbox");
  const regrasPerm = usePodeVerAba("tela.fin_extrato_regras");
  const paresPerm = usePodeVerAba("tela.fin_extrato_pares");
  const filaQ = useFilaExtrato(filaPerm.podeVer && !filaPerm.carregando);
  const paresQ = useQuery<number>({
    queryKey: ["extrato-pares-count"], enabled: paresPerm.podeVer && !paresPerm.carregando,
    queryFn: async () => {
      const { count, error } = await sb.from("vw_pares_transferencia_sugeridos").select("*", { count: "exact", head: true });
      if (error) throw error;
      return count ?? 0;
    },
  });
  const abas = [
    { value: "fila", slug: "tela.fin_extrato_inbox", label: `A classificar${filaQ.isSuccess ? ` · ${filaQ.data.length}` : ""}`, perm: filaPerm, conteudo: <FilaTab /> },
    { value: "regras", slug: "tela.fin_extrato_regras", label: "Regras", perm: regrasPerm, conteudo: <RegrasTab /> },
    { value: "pares", slug: "tela.fin_extrato_pares", label: `Pares${paresQ.data ? ` · ${paresQ.data}` : ""}`, perm: paresPerm, conteudo: <ParesTab /> },
  ];
  const carregando = abas.some(a => a.perm.carregando);
  const solicitada = abas.find(a => a.value === aba) ?? abas[0];
  const efetiva = solicitada.perm.podeVer ? solicitada : abas.find(a => a.perm.podeVer);
  const valorEfetivo = efetiva?.value;
  useEffect(() => { if (!carregando && valorEfetivo && valorEfetivo !== aba) setAba(valorEfetivo); }, [carregando, valorEfetivo, aba, setAba]);
  return <PageShell><PageHeader titulo="Extrato" icone={Inbox} estado="Movimentações do banco que ainda não têm classe: classifique, mantenha as regras e confirme transferências entre contas." />
    {carregando ? <Loader2 className="h-5 w-5 animate-spin" /> : !efetiva ? <p className="py-6 text-center text-muted-foreground">Você não tem acesso a nenhuma aba desta tela.</p> :
      <Tabs value={efetiva.value} onValueChange={setAba} className="space-y-4"><TabsList className="h-auto w-full justify-start gap-6 rounded-none border-b border-border bg-background px-0">
        {abas.map(a => <AbaPermitida key={a.value} slug={a.slug}><TabsTrigger value={a.value} className="rounded-none border-b-2 border-transparent px-0 py-3 text-muted-foreground data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:text-foreground data-[state=active]:shadow-none">{a.label}</TabsTrigger></AbaPermitida>)}
      </TabsList>{abas.map(a => <TabsContent key={a.value} value={a.value}><ConteudoAba slug={a.slug}>{a.conteudo}</ConteudoAba></TabsContent>)}</Tabs>}
  </PageShell>;
}