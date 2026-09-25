/**
 * Meus extratos — o representante vê cada mês de referência e envia a nota fiscal.
 *
 * Linguagem do representante: "mês de referência", "comissão calculada",
 * "comissão disponível para pagamento". Nunca "competência", "apuração" ou "liberação".
 */
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Check, Copy, Loader2, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { chamarPortal, enviarDocumentoPortal, fmtBRL, fmtCompetencia, fmtData } from "@/lib/portal/api";

const TOMADOR = "FETELY COMERCIO IMPORTACAO E EXPORTACAO LTDA";
const CNPJ = "63.591.078/0001-48";

function descricaoSugerida(competencia: string) {
  return `Serviços de representação comercial — comissão do mês de referência ${fmtCompetencia(competencia)}`;
}

function Copiar({ texto, rotulo }: { texto: string; rotulo: string }) {
  const [copiado, setCopiado] = useState(false);
  return (
    <Button
      type="button"
      variant="ghost"
      size="sm"
      className="h-7 px-2 text-xs"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(texto);
          setCopiado(true);
          window.setTimeout(() => setCopiado(false), 1500);
        } catch {
          toast.error("Seu navegador não permitiu copiar. Selecione o texto e copie à mão.");
        }
      }}
    >
      {copiado ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
      {copiado ? "Copiado" : `Copiar ${rotulo}`}
    </Button>
  );
}

function situacaoDocumento(e: any): { txt: string; cls: string } {
  const st = e?.documento?.status ?? null;
  if (e.pago) return { txt: `Pago em ${fmtData(e.pago_em)}`, cls: "text-success" };
  if (!st) return { txt: "Aguardando sua nota fiscal", cls: "text-warning" };
  if (st === "divergente") return { txt: "Nota em análise (valor diferente)", cls: "text-warning" };
  if (st === "conferido") return { txt: "Nota conferida — pagamento programado", cls: "text-success" };
  if (st === "recusado") return { txt: "Nota recusada — envie novamente", cls: "text-destructive" };
  return { txt: "Nota recebida — em conferência", cls: "text-muted-foreground" };
}

function FormularioNota({ sessao, extrato, onEnviado }: { sessao: string; extrato: any; onEnviado: () => void }) {
  const [tipo, setTipo] = useState<"nf_servico" | "rpa">("nf_servico");
  const [numero, setNumero] = useState("");
  const [emissao, setEmissao] = useState(new Date().toISOString().slice(0, 10));
  const [valor, setValor] = useState(String(Number(extrato.valor_total ?? 0).toFixed(2)));
  const [arquivo, setArquivo] = useState<File | null>(null);
  const [enviando, setEnviando] = useState(false);
  const [resposta, setResposta] = useState<any>(null);

  async function enviar(ev: React.FormEvent) {
    ev.preventDefault();
    if (!numero.trim()) return toast.error("Informe o número da nota.");
    if (!arquivo) return toast.error("Anexe o arquivo da nota (PDF, JPG, PNG ou XML).");
    setEnviando(true);
    try {
      const r = await enviarDocumentoPortal({
        sessao,
        extrato_id: extrato.extrato_id,
        tipo,
        numero: numero.trim(),
        data_emissao: emissao,
        valor: String(Number(valor.replace(",", ".")) || 0),
        arquivo,
      });
      setResposta(r);
      toast.success(r?.mensagem ?? "Nota recebida.");
      onEnviado();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e));
    } finally {
      setEnviando(false);
    }
  }

  return (
    <form onSubmit={enviar} className="mt-3 space-y-3 border-t border-border/60 pt-3">
      <div className="rounded-md border border-border/60 bg-muted/40 p-3 text-sm">
        <p className="text-xs uppercase tracking-wide text-muted-foreground">Valor a faturar</p>
        <p className="text-2xl font-medium">{fmtBRL(extrato.valor_total)}</p>
        <div className="mt-2 space-y-1 text-xs text-muted-foreground">
          <p className="flex flex-wrap items-center gap-1">
            Tomador: <span className="text-foreground">{TOMADOR}</span>
            <Copiar texto={TOMADOR} rotulo="nome" />
          </p>
          <p className="flex flex-wrap items-center gap-1">
            CNPJ: <span className="text-foreground">{CNPJ}</span>
            <Copiar texto={CNPJ} rotulo="CNPJ" />
          </p>
          <p className="flex flex-wrap items-center gap-1">
            Descrição sugerida: <span className="text-foreground">{descricaoSugerida(extrato.competencia)}</span>
            <Copiar texto={descricaoSugerida(extrato.competencia)} rotulo="descrição" />
          </p>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="grid gap-1">
          <Label className="text-xs">Tipo de documento</Label>
          <select
            className="h-10 rounded-md border border-input bg-background px-2 text-sm"
            value={tipo}
            onChange={(e) => setTipo(e.target.value as "nf_servico" | "rpa")}
          >
            <option value="nf_servico">Nota fiscal de serviço</option>
            <option value="rpa">RPA</option>
          </select>
        </div>
        <div className="grid gap-1">
          <Label className="text-xs">Número</Label>
          <Input value={numero} onChange={(e) => setNumero(e.target.value)} placeholder="Ex.: 1345" />
        </div>
        <div className="grid gap-1">
          <Label className="text-xs">Data de emissão</Label>
          <Input type="date" value={emissao} onChange={(e) => setEmissao(e.target.value)} />
        </div>
        <div className="grid gap-1">
          <Label className="text-xs">Valor da nota</Label>
          <Input value={valor} onChange={(e) => setValor(e.target.value)} />
        </div>
      </div>

      <div className="grid gap-1">
        <Label className="text-xs">Arquivo da nota (PDF, JPG, PNG ou XML, até 10 MB)</Label>
        <Input type="file" accept=".pdf,.jpg,.jpeg,.png,.xml" onChange={(e) => setArquivo(e.target.files?.[0] ?? null)} />
      </div>

      <Button type="submit" disabled={enviando}>
        {enviando ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
        Enviar minha nota fiscal
      </Button>

      {resposta && (
        <div className="rounded-md border border-border/60 p-3 text-sm">
          <p>{resposta.mensagem ?? "Nota recebida."}</p>
          {resposta.status === "divergente" && (
            <p className="mt-1 text-muted-foreground">
              O valor da sua nota ({fmtBRL(resposta.valor ?? valor)}) ficou diferente do valor a faturar
              ({fmtBRL(extrato.valor_total)}) — diferença de {fmtBRL(resposta.diferenca)}. Nossa equipe financeira
              vai analisar e falar com você. Você não precisa fazer mais nada agora.
            </p>
          )}
        </div>
      )}
    </form>
  );
}

export function PortalMeusExtratos({ sessao, extratoDestacado }: { sessao: string; extratoDestacado?: string | null }) {
  const [dados, setDados] = useState<any>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [aberto, setAberto] = useState<string | null>(extratoDestacado ?? null);
  const refDestaque = useRef<HTMLDivElement | null>(null);

  async function carregar() {
    setCarregando(true);
    try {
      const r = await chamarPortal<any>("extratos", { sessao });
      setDados(r);
      setErro(null);
    } catch (e) {
      setErro(e instanceof Error ? e.message : String(e));
    } finally {
      setCarregando(false);
    }
  }

  useEffect(() => {
    void carregar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessao]);

  useEffect(() => {
    if (extratoDestacado) setAberto(extratoDestacado);
  }, [extratoDestacado]);

  useEffect(() => {
    if (dados && extratoDestacado && refDestaque.current) {
      refDestaque.current.scrollIntoView({ behavior: "smooth", block: "center" });
    }
  }, [dados, extratoDestacado]);

  const extratos: any[] = Array.isArray(dados?.extratos) ? dados.extratos : [];

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base">Meus extratos</CardTitle>
        <CardDescription>
          Um mês de referência por linha, com a comissão disponível para pagamento e o prazo para enviar a nota.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {carregando ? (
          <div className="flex justify-center p-4"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
        ) : erro ? (
          <p className="text-sm text-destructive">{erro}</p>
        ) : extratos.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nenhum mês fechado ainda. Assim que fechar, ele aparece aqui.</p>
        ) : (
          extratos.map((e: any) => {
            const st = situacaoDocumento(e);
            const conferido = e?.documento?.status === "conferido";
            const destaque = extratoDestacado === e.extrato_id;
            const mostrarForm = !conferido && !e.pago && aberto === e.extrato_id;
            return (
              <div
                key={e.extrato_id}
                ref={destaque ? refDestaque : undefined}
                className={`rounded-md border p-3 ${destaque ? "border-gold" : "border-border/60"}`}
              >
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <div>
                    <p className="text-sm font-medium">Mês de referência {fmtCompetencia(e.competencia)}</p>
                    <p className="text-xs text-muted-foreground">
                      Nota até {fmtData(e.prazo_documento)} · pagamento {fmtData(e.pagar_ate)}
                    </p>
                    <p className={`text-xs ${st.cls}`}>{st.txt}</p>
                    {e.documento && (
                      <p className="text-xs text-muted-foreground">
                        {e.documento.tipo === "rpa" ? "RPA" : "Nota fiscal"} {e.documento.numero} · {fmtBRL(e.documento.valor)}
                        {e.documento.enviado_em ? ` · enviada em ${fmtData(e.documento.enviado_em)}` : ""}
                        {e.documento.motivo ? ` · ${e.documento.motivo}` : ""}
                      </p>
                    )}
                  </div>
                  <div className="text-right">
                    <p className="text-lg font-medium">{fmtBRL(e.valor_total)}</p>
                    {!conferido && !e.pago && (
                      <Button
                        variant={mostrarForm ? "ghost" : "outline"}
                        size="sm"
                        onClick={() => setAberto(mostrarForm ? null : e.extrato_id)}
                      >
                        {mostrarForm ? "Fechar" : e.documento ? "Enviar outra nota" : "Enviar nota fiscal"}
                      </Button>
                    )}
                  </div>
                </div>
                {mostrarForm && <FormularioNota sessao={sessao} extrato={e} onEnviado={carregar} />}
              </div>
            );
          })
        )}
      </CardContent>
    </Card>
  );
}
