import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { CasaPageHeader } from "@/components/casa/CasaPageHeader";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  Table, TableBody, TableCell, TableFooter, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { ArrowLeft, Loader2, RefreshCcw, AlertTriangle, Copy, Check } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { usePropostaCobranca } from "@/hooks/credito/usePropostaCobranca";
import { useMaterializarCobranca } from "@/hooks/credito/useMaterializarCobranca";
import { useToast } from "@/hooks/use-toast";
import type { TituloProposto } from "@/types/credito";
import { formatCNPJ } from "@/lib/cnpj";
import { supabase } from "@/integrations/supabase/client";
import { useQuery } from "@tanstack/react-query";

const fmtBRL = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });

function usePedidoMinimo(pedidoId: string | undefined) {
  return useQuery({
    queryKey: ["cobranca-pedido-minimo", pedidoId],
    enabled: !!pedidoId,
    queryFn: async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any)
        .from("pedidos")
        .select(`
          id, id_externo, estagio, data_pedido, valor_liquido, condicao_solicitada,
          parceiro:parceiros_comerciais!parceiro_id(razao_social, nome_fantasia, cnpj, cpf, email, telefone, cep, logradouro, numero, endereco_complemento, bairro, cidade, uf)
        `)
        .eq("id", pedidoId)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });
}

function LinhaInfo({ label, value, copiavel }: { label: string; value: string; copiavel?: string }) {
  const [copiado, setCopiado] = useState(false);
  function copiar() {
    if (!copiavel) return;
    navigator.clipboard.writeText(copiavel).then(() => {
      setCopiado(true);
      setTimeout(() => setCopiado(false), 1400);
    });
  }
  return (
    <div className="flex justify-between gap-3 text-xs py-1 border-b border-border/40 last:border-0">
      <span className="text-muted-foreground shrink-0">{label}</span>
      <span className="text-right flex items-center gap-1.5 font-medium">
        {value}
        {copiavel && (
          <button
            type="button"
            onClick={copiar}
            className="text-muted-foreground hover:text-foreground transition-colors"
            title="Copiar"
          >
            {copiado ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
          </button>
        )}
      </span>
    </div>
  );
}

export default function CobrancaDetalhe() {
  const { pedidoId } = useParams<{ pedidoId: string }>();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { toast } = useToast();

  const pedidoQ = usePedidoMinimo(pedidoId);
  const propostaQ = usePropostaCobranca(pedidoId);
  const materializar = useMaterializarCobranca();

  const [titulos, setTitulos] = useState<TituloProposto[]>([]);
  const [confirmOpen, setConfirmOpen] = useState(false);

  // hidrata estado local quando a proposta chega
  useEffect(() => {
    if (propostaQ.data?.titulos_propostos) {
      setTitulos(propostaQ.data.titulos_propostos.map((t) => ({ ...t })));
    }
  }, [propostaQ.data]);

  const valorPedido = Number(pedidoQ.data?.valor_liquido ?? propostaQ.data?.valor_total ?? 0);
  const dataPedidoStr: string | undefined = pedidoQ.data?.data_pedido;

  const totalEditado = useMemo(
    () => titulos.reduce((acc, t) => acc + Number(t.valor_bruto || 0), 0),
    [titulos],
  );
  const diff = totalEditado - valorPedido;
  const pctDiff = valorPedido > 0 ? Math.abs(diff) / valorPedido : 0;
  const temDivergenciaLeve = Math.abs(diff) > 0.005 && pctDiff <= 0.01;
  const temDivergenciaGrave = pctDiff > 0.01;

  const temValorInvalido = titulos.some((t) => Number(t.valor_bruto) <= 0);
  const temDataPassada = !!dataPedidoStr && titulos.some(
    (t) => t.data_vencimento < dataPedidoStr,
  );

  const atualizarTitulo = (idx: number, patch: Partial<TituloProposto>) => {
    setTitulos((prev) => prev.map((t, i) => (i === idx ? { ...t, ...patch } : t)));
  };

  const podeMaterializar =
    !!pedidoId && titulos.length > 0 && !temValorInvalido && !temDataPassada;

  const handleAceitar = () => {
    if (temValorInvalido) {
      toast({
        title: "Valores inválidos",
        description: "Todos os títulos devem ter valor maior que zero.",
        variant: "destructive",
      });
      return;
    }
    if (temDataPassada) {
      toast({
        title: "Data de vencimento inválida",
        description: "Vencimentos não podem ser anteriores à data do pedido.",
        variant: "destructive",
      });
      return;
    }
    if (temDivergenciaLeve) {
      toast({
        title: "Divergência de soma",
        description: `Total editado difere em ${fmtBRL.format(diff)} do valor do pedido.`,
      });
    }
    setConfirmOpen(true);
  };

  const handleConfirmar = () => {
    if (!pedidoId) return;
    materializar.mutate(
      { pedidoId, titulosEditados: titulos },
      { onSettled: () => setConfirmOpen(false) },
    );
  };

  const handleRecalcular = () => {
    qc.invalidateQueries({ queryKey: ["cobranca-proposta", pedidoId] });
  };

  // Loading
  if (pedidoQ.isLoading || propostaQ.isLoading) {
    return (
      <div className="max-w-[1400px] mx-auto px-4 md:px-8 py-8 space-y-4">
        <Skeleton className="h-20 w-full" />
        <Skeleton className="h-40 w-full" />
        <Skeleton className="h-96 w-full" />
      </div>
    );
  }

  // Erro ao carregar pedido (query falhou)
  if (pedidoQ.error) {
    return (
      <div className="max-w-[1400px] mx-auto px-4 md:px-8 py-8 space-y-4">
        <Alert variant="destructive">
          <AlertDescription>
            Erro ao carregar pedido: {(pedidoQ.error as Error).message}
          </AlertDescription>
        </Alert>
        <Button variant="ghost" onClick={() => navigate("/recebimento/cobranca")}>
          <ArrowLeft className="h-4 w-4" /> Voltar
        </Button>
      </div>
    );
  }

  // Pedido não encontrado
  if (!pedidoQ.data) {
    return (
      <div className="max-w-[1400px] mx-auto px-4 md:px-8 py-8">
        <Alert variant="destructive">
          <AlertDescription>Pedido não encontrado.</AlertDescription>
        </Alert>
        <Button variant="ghost" className="mt-4" onClick={() => navigate("/recebimento/cobranca")}>
          <ArrowLeft className="h-4 w-4" /> Voltar
        </Button>
      </div>
    );
  }

  // Pedido já saiu de 'cobranca'
  if (pedidoQ.data.estagio !== "cobranca") {
    return (
      <div className="max-w-[1400px] mx-auto px-4 md:px-8 py-8 space-y-4">
        <Alert>
          <AlertTriangle className="h-4 w-4" />
          <AlertDescription>
            Esta cobrança já foi materializada (estágio atual:{" "}
            <strong>{pedidoQ.data.estagio}</strong>).
          </AlertDescription>
        </Alert>
        <Button variant="ghost" onClick={() => navigate("/recebimento/cobranca")}>
          <ArrowLeft className="h-4 w-4" /> Voltar à fila
        </Button>
      </div>
    );
  }

  // Erro na RPC de proposta
  if (propostaQ.error) {
    return (
      <div className="max-w-[1400px] mx-auto px-4 md:px-8 py-8 space-y-4">
        <Alert variant="destructive">
          <AlertDescription>
            Erro ao calcular proposta: {(propostaQ.error as Error).message}
          </AlertDescription>
        </Alert>
        <Button variant="ghost" onClick={() => navigate("/recebimento/cobranca")}>
          <ArrowLeft className="h-4 w-4" /> Voltar
        </Button>
      </div>
    );
  }

  const proposta = propostaQ.data!;
  const pedido = pedidoQ.data;

  return (
    <div className="max-w-[1400px] mx-auto px-4 md:px-8 py-8 space-y-6 animate-casa-fade-in">
      <CasaPageHeader
        breadcrumb={[
          { label: "Casa", to: "/" },
          { label: "Recebimento", to: "/recebimento" },
          { label: "Cobrança", to: "/recebimento/cobranca" },
          { label: pedido.id_externo ?? "—" },
        ]}
        title={`Cobrança — ${pedido.id_externo ?? ""}`}
        subtitle="Edite a proposta de títulos antes de materializar."
      />

      {/* Resumo */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Resumo do pedido</CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
          <div className="md:col-span-2">
            <p className="text-muted-foreground text-xs mb-1">Cliente</p>
            {pedido.parceiro?.razao_social && (
              <LinhaInfo label="Razão social" value={pedido.parceiro.razao_social} copiavel={pedido.parceiro.razao_social} />
            )}
            {pedido.parceiro?.nome_fantasia && pedido.parceiro.nome_fantasia !== pedido.parceiro.razao_social && (
              <LinhaInfo label="Nome fantasia" value={pedido.parceiro.nome_fantasia} copiavel={pedido.parceiro.nome_fantasia} />
            )}
            {pedido.parceiro?.cnpj && (
              <LinhaInfo label="CNPJ" value={formatCNPJ(pedido.parceiro.cnpj)} copiavel={pedido.parceiro.cnpj} />
            )}
            {pedido.parceiro?.cpf && (
              <LinhaInfo label="CPF" value={pedido.parceiro.cpf} copiavel={pedido.parceiro.cpf} />
            )}
            {pedido.parceiro?.email && (
              <LinhaInfo label="E-mail" value={pedido.parceiro.email} copiavel={pedido.parceiro.email} />
            )}
            {pedido.parceiro?.telefone && (
              <LinhaInfo label="Telefone" value={pedido.parceiro.telefone} copiavel={pedido.parceiro.telefone} />
            )}
            {pedido.parceiro?.cep && (
              <LinhaInfo label="CEP" value={pedido.parceiro.cep} copiavel={pedido.parceiro.cep} />
            )}
            {(pedido.parceiro?.logradouro || pedido.parceiro?.numero) && (
              <LinhaInfo
                label="Logradouro"
                value={[pedido.parceiro?.logradouro, pedido.parceiro?.numero, pedido.parceiro?.endereco_complemento].filter(Boolean).join(", ")}
                copiavel={[pedido.parceiro?.logradouro, pedido.parceiro?.numero, pedido.parceiro?.endereco_complemento].filter(Boolean).join(", ")}
              />
            )}
            {pedido.parceiro?.bairro && (
              <LinhaInfo label="Bairro" value={pedido.parceiro.bairro} copiavel={pedido.parceiro.bairro} />
            )}
            {pedido.parceiro?.cidade && (
              <LinhaInfo label="Cidade" value={pedido.parceiro.cidade} copiavel={pedido.parceiro.cidade} />
            )}
            {pedido.parceiro?.uf && (
              <LinhaInfo label="UF" value={pedido.parceiro.uf} copiavel={pedido.parceiro.uf} />
            )}
          </div>
          <div>
            <p className="text-muted-foreground text-xs">Valor total</p>
            <p className="font-medium">{fmtBRL.format(valorPedido)}</p>
          </div>
          <div>
            <p className="text-muted-foreground text-xs">Condição original</p>
            <p className="font-medium">{proposta.condicao_original}</p>
          </div>
          <div>
            <p className="text-muted-foreground text-xs">Tem entrada?</p>
            <p className="font-medium">{proposta.tem_entrada ? "Sim" : "Não"}</p>
          </div>
        </CardContent>
      </Card>

      {/* Proposta editável */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-base">Proposta de títulos</CardTitle>
          <Button variant="outline" size="sm" onClick={handleRecalcular}>
            <RefreshCcw className="h-4 w-4" /> Recalcular
          </Button>
        </CardHeader>
        <CardContent>
          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-16">#</TableHead>
                  <TableHead>Tipo</TableHead>
                  <TableHead>Pagamento</TableHead>
                  <TableHead className="text-right">Valor</TableHead>
                  <TableHead>Vencimento</TableHead>
                  <TableHead>Condição</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {titulos.map((t, idx) => {
                  const dataInvalida = !!dataPedidoStr && t.data_vencimento < dataPedidoStr;
                  const valorInvalido = Number(t.valor_bruto) <= 0;
                  return (
                    <TableRow key={idx}>
                      <TableCell className="font-mono text-xs">
                        {t.numero_parcela}/{t.total_parcelas}
                      </TableCell>
                      <TableCell>
                        {t.eh_entrada ? (
                          <Badge>Entrada</Badge>
                        ) : (
                          <Badge variant="outline">Parcela</Badge>
                        )}
                      </TableCell>
                      <TableCell>
                        <Select
                          value={t.tipo_pagamento}
                          onValueChange={(v) =>
                            atualizarTitulo(idx, {
                              tipo_pagamento: v as TituloProposto["tipo_pagamento"],
                            })
                          }
                        >
                          <SelectTrigger className="h-9 w-[120px]">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="pix">PIX</SelectItem>
                            <SelectItem value="boleto">Boleto</SelectItem>
                            <SelectItem value="cartao">Cartão</SelectItem>
                          </SelectContent>
                        </Select>
                      </TableCell>
                      <TableCell className="text-right">
                        <Input
                          type="number"
                          step="0.01"
                          min="0"
                          value={t.valor_bruto}
                          onChange={(e) =>
                            atualizarTitulo(idx, { valor_bruto: Number(e.target.value) })
                          }
                          className={`h-9 w-32 ml-auto text-right ${valorInvalido ? "border-destructive" : ""}`}
                        />
                      </TableCell>
                      <TableCell>
                        <Input
                          type="date"
                          value={t.data_vencimento}
                          onChange={(e) =>
                            atualizarTitulo(idx, { data_vencimento: e.target.value })
                          }
                          className={`h-9 w-40 ${dataInvalida ? "border-destructive" : ""}`}
                        />
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {t.condicao_pagamento}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
              <TableFooter>
                <TableRow>
                  <TableCell colSpan={3} className="text-right font-medium">
                    Total
                  </TableCell>
                  <TableCell
                    className={`text-right font-semibold ${
                      temDivergenciaGrave
                        ? "text-destructive"
                        : temDivergenciaLeve
                          ? "text-amber-600"
                          : ""
                    }`}
                  >
                    {fmtBRL.format(totalEditado)}
                  </TableCell>
                  <TableCell colSpan={2} className="text-xs text-muted-foreground">
                    Pedido: {fmtBRL.format(valorPedido)}
                    {Math.abs(diff) > 0.005 && (
                      <> · diferença {fmtBRL.format(diff)}</>
                    )}
                  </TableCell>
                </TableRow>
              </TableFooter>
            </Table>
          </div>

          {(temDivergenciaGrave || temValorInvalido || temDataPassada) && (
            <Alert variant="destructive" className="mt-4">
              <AlertTriangle className="h-4 w-4" />
              <AlertDescription>
                {temValorInvalido && <div>Há títulos com valor zero ou negativo.</div>}
                {temDataPassada && (
                  <div>Há vencimentos anteriores à data do pedido.</div>
                )}
                {temDivergenciaGrave && (
                  <div>
                    Total dos títulos diverge em mais de 1% do valor do pedido (
                    {fmtBRL.format(diff)}).
                  </div>
                )}
              </AlertDescription>
            </Alert>
          )}

          <div className="flex justify-end gap-3 mt-6">
            <Button variant="outline" onClick={() => navigate("/recebimento/cobranca")}>
              Cancelar
            </Button>
            <Button
              onClick={handleAceitar}
              disabled={!podeMaterializar || materializar.isPending}
            >
              {materializar.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
              Aceitar e materializar
            </Button>
          </div>
        </CardContent>
      </Card>

      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Confirmar materialização</DialogTitle>
            <DialogDescription>
              Esta operação é irreversível. Serão criados <strong>{titulos.length}</strong>{" "}
              título{titulos.length !== 1 ? "s" : ""} totalizando{" "}
              <strong>{fmtBRL.format(totalEditado)}</strong>.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setConfirmOpen(false)}
              disabled={materializar.isPending}
            >
              Voltar
            </Button>
            <Button onClick={handleConfirmar} disabled={materializar.isPending}>
              {materializar.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
              Confirmar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
