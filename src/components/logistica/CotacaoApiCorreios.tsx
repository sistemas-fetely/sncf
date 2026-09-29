import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Calculator, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

type Centro = { codigo: string; nome: string | null; cep: string };
type Cotacao = { servico: string; preco: number | null; prazo_dias: number | null; erro: string | null };
type Resultado = { contrato: string | null; cotacoes: Cotacao[] };

const BRL = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
const digitos = (valor: string) => valor.replace(/\D/g, "");

export function CotacaoApiCorreios() {
  const [origem, setOrigem] = useState("");
  const [destino, setDestino] = useState("");
  const [peso, setPeso] = useState("");
  const [comprimento, setComprimento] = useState("");
  const [largura, setLargura] = useState("");
  const [altura, setAltura] = useState("");
  const [cotando, setCotando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [resultado, setResultado] = useState<Resultado | null>(null);

  const centrosQ = useQuery({
    queryKey: ["centros-distribuicao-cotacao"],
    queryFn: async (): Promise<Centro[]> => {
      const { data, error } = await (supabase as any)
        .from("centro_distribuicao")
        .select("codigo, nome, cep")
        .not("cep", "is", null)
        .order("codigo");
      if (error) throw error;
      return (data ?? []).filter((r: any) => digitos(String(r.cep ?? "")).length === 8) as Centro[];
    },
    staleTime: 30 * 60_000,
  });

  useEffect(() => {
    if (origem || !centrosQ.data?.length) return;
    setOrigem(centrosQ.data.find((c) => c.codigo === "XPM-SC")?.codigo ?? centrosQ.data[0].codigo);
  }, [centrosQ.data, origem]);

  const centro = useMemo(() => centrosQ.data?.find((c) => c.codigo === origem) ?? null, [centrosQ.data, origem]);

  async function cotar() {
    setErro(null);
    setResultado(null);
    const cepDestino = digitos(destino);
    const pesoKg = Number(peso.replace(",", "."));
    if (!centro) { setErro("Selecione uma origem válida."); return; }
    if (cepDestino.length !== 8) { setErro("Informe um CEP de destino com 8 dígitos."); return; }
    if (!Number.isFinite(pesoKg) || pesoKg <= 0) { setErro("Informe um peso maior que zero."); return; }

    const dimensao = (valor: string) => valor.trim() ? Number(valor.replace(",", ".")) : undefined;
    setCotando(true);
    try {
      const { data, error } = await supabase.functions.invoke("correios-cotar", {
        body: {
          cep_origem: digitos(centro.cep),
          cep_destino: cepDestino,
          peso_g: Math.round(pesoKg * 1000),
          comprimento_cm: dimensao(comprimento),
          largura_cm: dimensao(largura),
          altura_cm: dimensao(altura),
        },
      });
      if (error) {
        let mensagem = error.message;
        try {
          const contexto = (error as any).context;
          if (contexto && typeof contexto.json === "function") mensagem = (await contexto.json())?.erro ?? mensagem;
        } catch { /* mantém a mensagem original */ }
        throw new Error(mensagem);
      }
      if (data?.ok !== true) throw new Error(data?.erro ?? "Falha na cotação dos Correios.");
      setResultado({
        contrato: data.contrato ?? null,
        cotacoes: (data.cotacoes ?? []).filter((c: Cotacao) => ["SEDEX", "PAC"].includes(String(c.servico).toUpperCase())),
      });
    } catch (e) {
      setErro(e instanceof Error ? e.message : String(e));
    } finally {
      setCotando(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Cotação via API</CardTitle>
        <CardDescription>Cotado ao vivo no contrato dos Correios — não usa tabela de preço.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {centrosQ.error ? <div className="rounded-md border border-destructive/40 bg-destructive/10 p-2 text-sm text-destructive">{centrosQ.error instanceof Error ? centrosQ.error.message : String(centrosQ.error)}</div> : null}
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          <div className="space-y-1.5 md:col-span-2">
            <Label>Origem</Label>
            <Select value={origem} onValueChange={setOrigem} disabled={centrosQ.isLoading}>
              <SelectTrigger><SelectValue placeholder="Selecione o centro" /></SelectTrigger>
              <SelectContent>{(centrosQ.data ?? []).map((c) => <SelectItem key={c.codigo} value={c.codigo}>{c.codigo} · {c.cep}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5"><Label htmlFor="cotacao-cep">CEP destino</Label><Input id="cotacao-cep" value={destino} onChange={(e) => setDestino(e.target.value)} inputMode="numeric" /></div>
          <div className="space-y-1.5"><Label htmlFor="cotacao-peso">Peso (kg)</Label><Input id="cotacao-peso" value={peso} onChange={(e) => setPeso(e.target.value)} inputMode="decimal" /></div>
          <div className="space-y-1.5"><Label htmlFor="cotacao-comprimento">Comprimento (cm)</Label><Input id="cotacao-comprimento" placeholder="20" value={comprimento} onChange={(e) => setComprimento(e.target.value)} inputMode="decimal" /></div>
          <div className="space-y-1.5"><Label htmlFor="cotacao-largura">Largura (cm)</Label><Input id="cotacao-largura" placeholder="15" value={largura} onChange={(e) => setLargura(e.target.value)} inputMode="decimal" /></div>
          <div className="space-y-1.5"><Label htmlFor="cotacao-altura">Altura (cm)</Label><Input id="cotacao-altura" placeholder="10" value={altura} onChange={(e) => setAltura(e.target.value)} inputMode="decimal" /></div>
        </div>
        <Button onClick={() => void cotar()} disabled={cotando || centrosQ.isLoading}>
          {cotando ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Calculator className="mr-2 h-4 w-4" />}Cotar
        </Button>
        {erro ? <div className="rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">Correios: {erro}</div> : null}
        {resultado ? (
          <div className="space-y-2">
            <div className="text-xs text-muted-foreground">Contrato: {resultado.contrato ?? "—"}</div>
            <div className="grid gap-2 md:grid-cols-2">
              {resultado.cotacoes.map((c) => (
                <div key={c.servico} className="rounded-md border p-3">
                  <div className="text-sm font-medium">{c.servico}</div>
                  {c.erro ? <div className="mt-1 text-xs text-destructive">{c.erro}</div> : (
                    <div className="mt-1 flex items-baseline justify-between gap-3"><span className="text-lg font-medium">{c.preco == null ? "—" : BRL.format(c.preco)}</span><span className="text-xs text-muted-foreground">{c.prazo_dias == null ? "prazo indisponível" : `${c.prazo_dias} dias`}</span></div>
                  )}
                </div>
              ))}
              {resultado.cotacoes.length === 0 ? <div className="text-sm text-muted-foreground">Nenhuma cotação SEDEX ou PAC retornada.</div> : null}
            </div>
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}