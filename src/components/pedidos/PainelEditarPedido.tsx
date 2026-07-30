import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import { Lock, Loader2, AlertTriangle, CheckCircle2, Wallet, Package, Percent } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { usePedidoEdicaoCampo, type CampoEdicao, type RegraEdicaoCampo } from "@/hooks/pedidos/usePedidoEdicaoCampo";
import { ESTAGIO_LABELS } from "@/types/pedido";
import { formatError } from "@/lib/format-error";
import { EditarItensDialog } from "@/components/pedidos/dialogs/EditarItensDialog";

const fmtBRL = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
const num = (v: unknown) => Number(v || 0);
const rotuloEstagio = (e: string) =>
  (ESTAGIO_LABELS as Record<string, string>)[e] ?? e.replace(/_/g, " ");

interface Props {
  pedidoId: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  pedido: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  itens: any[];
}

/* ---------------------------------------------------------------- shared */

interface Guarda {
  permitido: boolean;
  exigeMotivo: boolean;
  exigePapel: string[] | null;
  temPapel: boolean;
  rotulo: string | null;
  estagiosPermitidos: string[];
}

function montarGuarda(
  regra: RegraEdicaoCampo | undefined,
  estagiosPermitidos: string[],
  papeis: string[],
): Guarda {
  const exigePapel = regra?.exige_papel ?? null;
  const temPapel =
    !exigePapel || exigePapel.length === 0 || exigePapel.some((p) => papeis.includes(p));
  return {
    permitido: !!regra?.permitido,
    exigeMotivo: !!regra?.exige_motivo,
    exigePapel,
    temPapel,
    rotulo: regra?.rotulo ?? null,
    estagiosPermitidos,
  };
}

function SecaoBloqueada({ estagiosPermitidos }: { estagiosPermitidos: string[] }) {
  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <div className="flex items-center gap-2 text-sm text-muted-foreground rounded-md border border-dashed p-3 cursor-help">
            <Lock className="h-4 w-4" />
            Não editável neste estágio
          </div>
        </TooltipTrigger>
        <TooltipContent className="max-w-xs">
          {estagiosPermitidos.length > 0
            ? `Permitido em: ${estagiosPermitidos.map(rotuloEstagio).join(", ")}`
            : "Não há estágio com edição liberada para este campo."}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

function BotaoSalvar({
  onClick, disabled, pending, motivoTooltip, children,
}: {
  onClick: () => void;
  disabled: boolean;
  pending: boolean;
  motivoTooltip?: string | null;
  children: React.ReactNode;
}) {
  const btn = (
    <Button
      onClick={onClick}
      disabled={disabled || pending}
      className="bg-[#1A4A3A] hover:bg-[#153d30] text-white"
    >
      {pending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
      {children}
    </Button>
  );
  if (!motivoTooltip) return btn;
  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild><span className="inline-flex">{btn}</span></TooltipTrigger>
        <TooltipContent>{motivoTooltip}</TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

function CampoMotivo({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <div className="space-y-1.5">
      <Label>Motivo <span className="text-destructive">*</span></Label>
      <Textarea rows={2} value={value} onChange={(e) => onChange(e.target.value)} placeholder="Mínimo 3 caracteres" />
    </div>
  );
}

/* ------------------------------------------------------------- pagamento */

interface CondicaoPagamento {
  slug: string;
  rotulo: string | null;
  condicao_canonica: string | null;
  ordem: number | null;
}

function SecaoPagamento({ pedidoId, pedido, guarda }: {
  pedidoId: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  pedido: any;
  guarda: Guarda;
}) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [slug, setSlug] = useState<string>("");
  const [motivo, setMotivo] = useState("");
  const [avisoPortao, setAvisoPortao] = useState(false);

  const condicoesQ = useQuery({
    queryKey: ["condicoes-pagamento-edicao"],
    staleTime: 5 * 60 * 1000,
    queryFn: async (): Promise<CondicaoPagamento[]> => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any)
        .from("condicoes_pagamento")
        .select("slug, rotulo, condicao_canonica, ordem")
        .eq("ativo", true)
        .order("ordem");
      if (error) throw error;
      return (data || []) as CondicaoPagamento[];
    },
  });

  const escolhida = (condicoesQ.data || []).find((c) => c.slug === slug);
  const canonica = escolhida?.condicao_canonica || null;

  const impactoQ = useQuery({
    queryKey: ["impacto-edicao-pagamento", pedidoId, canonica],
    enabled: open && !!canonica,
    retry: false,
    queryFn: async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any).rpc("fn_avaliar_impacto_edicao_pedido", {
        p_pedido_id: pedidoId,
        p_nova_condicao: canonica,
        p_novo_valor_liquido: num(pedido?.valor_liquido),
      });
      if (error) throw error;
      return data as { caminho?: string; motivo?: string | null } | null;
    },
  });

  const caminho = impactoQ.data?.caminho ?? null;
  const bloqueadoPeloImpacto = caminho === "financeiro" || caminho === "bloqueado";

  const salvar = useMutation({
    mutationFn: async () => {
      try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { data, error } = await (supabase as any).rpc("alterar_pagamento_pedido", {
          p_pedido_id: pedidoId,
          p_condicao_slug: slug,
          p_motivo: motivo.trim() || null,
        });
        if (error) throw error;
        return data as Record<string, unknown> | null;
      } catch (e) {
        throw new Error(formatError(e));
      }
    },
    onSuccess: async (data) => {
      toast.success("Condição de pagamento alterada.");
      const exigePortao =
        data && typeof data === "object" ? (data as Record<string, unknown>).exige_portao === true : false;
      setAvisoPortao(!!exigePortao);
      await qc.invalidateQueries({ queryKey: ["pedido-detalhe", pedidoId] });
      qc.invalidateQueries({ queryKey: ["pedidos"] });
      setOpen(false);
      setMotivo("");
    },
    onError: (e: unknown) => toast.error(formatError(e)),
  });

  if (!guarda.permitido) return <SecaoBloqueada estagiosPermitidos={guarda.estagiosPermitidos} />;

  const motivoOk = !guarda.exigeMotivo || motivo.trim().length >= 3;
  const tooltipPapel = !guarda.temPapel ? `Requer papel: ${(guarda.exigePapel || []).join(", ")}` : null;

  return (
    <div className="space-y-3">
      <div className="text-sm">
        <span className="text-muted-foreground">Condição atual: </span>
        <span className="font-medium">{pedido?.condicao_solicitada || "—"}</span>
      </div>
      {avisoPortao && (
        <Alert>
          <AlertTriangle className="h-4 w-4" />
          <AlertDescription>
            Este pedido agora aguarda pagamento no portão antes de ser liberado.
          </AlertDescription>
        </Alert>
      )}
      <Button variant="outline" size="sm" onClick={() => { setSlug(""); setMotivo(""); setOpen(true); }}>
        Alterar condição de pagamento
      </Button>

      <Dialog open={open} onOpenChange={(v) => { if (!salvar.isPending) setOpen(v); }}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Alterar pagamento</DialogTitle>
            <DialogDescription>
              Forma e prazo são uma coisa só: escolha a condição de pagamento.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            {condicoesQ.isError && (
              <Alert variant="destructive">
                <AlertTriangle className="h-4 w-4" />
                <AlertDescription>{formatError(condicoesQ.error)}</AlertDescription>
              </Alert>
            )}
            <div className="space-y-1.5">
              <Label>Condição de pagamento</Label>
              <Select value={slug} onValueChange={setSlug}>
                <SelectTrigger><SelectValue placeholder="Selecione..." /></SelectTrigger>
                <SelectContent>
                  {(condicoesQ.data || []).map((c) => (
                    <SelectItem key={c.slug} value={c.slug}>
                      {c.rotulo || c.condicao_canonica || c.slug}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {impactoQ.isFetching && (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" /> Avaliando impacto...
              </div>
            )}
            {impactoQ.isError && (
              <Alert variant="destructive">
                <AlertTriangle className="h-4 w-4" />
                <AlertDescription>{formatError(impactoQ.error)}</AlertDescription>
              </Alert>
            )}
            {caminho === "reconcilia_no_lugar" && (
              <Alert className="border-emerald-500/40 bg-emerald-500/10">
                <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                <AlertDescription>
                  {impactoQ.data?.motivo || "Ajuste reconciliado no lugar, sem nova análise."}
                </AlertDescription>
              </Alert>
            )}
            {caminho === "re_analise" && (
              <Alert className="border-amber-500/40 bg-amber-500/10">
                <AlertTriangle className="h-4 w-4 text-amber-600" />
                <AlertDescription>
                  Vai exigir nova análise de crédito.
                  {impactoQ.data?.motivo ? ` ${impactoQ.data.motivo}` : ""}
                </AlertDescription>
              </Alert>
            )}
            {bloqueadoPeloImpacto && (
              <Alert variant="destructive">
                <AlertTriangle className="h-4 w-4" />
                <AlertDescription>
                  {impactoQ.data?.motivo || "Alteração bloqueada para esta condição."}
                </AlertDescription>
              </Alert>
            )}

            {guarda.exigeMotivo && <CampoMotivo value={motivo} onChange={setMotivo} />}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)} disabled={salvar.isPending}>Cancelar</Button>
            <BotaoSalvar
              onClick={() => salvar.mutate()}
              disabled={!slug || !motivoOk || !guarda.temPapel || bloqueadoPeloImpacto || impactoQ.isFetching}
              pending={salvar.isPending}
              motivoTooltip={tooltipPapel}
            >
              Salvar
            </BotaoSalvar>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

/* -------------------------------------------------------------- desconto */

function SecaoDesconto({ pedidoId, pedido, guarda }: {
  pedidoId: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  pedido: any;
  guarda: Guarda;
}) {
  const qc = useQueryClient();
  const [tipo, setTipo] = useState<"pct" | "valor">("pct");
  const [valorStr, setValorStr] = useState("");
  const [motivo, setMotivo] = useState("");

  const bruto = num(pedido?.valor_bruto);
  const bonus = num(pedido?.bonus_pix_valor);
  const frete = num(pedido?.valor_frete);
  const valorNum = Number(String(valorStr).replace(",", ".")) || 0;
  const desconto = tipo === "pct" ? (bruto * valorNum) / 100 : valorNum;
  // Fórmula oficial: o frete ENTRA no líquido.
  const liquidoProjetado = bruto - desconto - bonus + frete;

  const salvar = useMutation({
    mutationFn: async () => {
      try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { data, error } = await (supabase as any).rpc("alterar_desconto_pedido", {
          p_pedido_id: pedidoId,
          p_tipo: tipo,
          p_valor: valorNum,
          p_motivo: motivo.trim() || null,
        });
        if (error) throw error;
        return data;
      } catch (e) {
        throw new Error(formatError(e));
      }
    },
    onSuccess: async () => {
      toast.success("Desconto alterado.");
      await qc.invalidateQueries({ queryKey: ["pedido-detalhe", pedidoId] });
      qc.invalidateQueries({ queryKey: ["pedidos"] });
      setValorStr("");
      setMotivo("");
    },
    onError: (e: unknown) => toast.error(formatError(e)),
  });

  if (!guarda.permitido) return <SecaoBloqueada estagiosPermitidos={guarda.estagiosPermitidos} />;

  const motivoOk = !guarda.exigeMotivo || motivo.trim().length >= 3;
  const tooltipPapel = !guarda.temPapel ? `Requer papel: ${(guarda.exigePapel || []).join(", ")}` : null;

  return (
    <div className="space-y-3">
      <div className="flex gap-2">
        <Button size="sm" variant={tipo === "pct" ? "default" : "outline"} onClick={() => setTipo("pct")}>Percentual</Button>
        <Button size="sm" variant={tipo === "valor" ? "default" : "outline"} onClick={() => setTipo("valor")}>Valor (R$)</Button>
      </div>

      <div className="space-y-1.5 max-w-xs">
        <Label>{tipo === "pct" ? "Percentual (%)" : "Valor (R$)"}</Label>
        <Input
          type="number" inputMode="decimal" min="0" step="0.01"
          value={valorStr} onChange={(e) => setValorStr(e.target.value)}
          placeholder={tipo === "pct" ? "Ex.: 5" : "Ex.: 150,00"}
        />
      </div>

      <div className="rounded-md border bg-muted/40 p-3 space-y-1.5 text-sm max-w-sm">
        <div className="flex justify-between"><span className="text-muted-foreground">Bruto</span><span>{fmtBRL.format(bruto)}</span></div>
        <div className="flex justify-between"><span className="text-muted-foreground">Desconto</span><span className="text-destructive">− {fmtBRL.format(desconto)}</span></div>
        <div className="flex justify-between"><span className="text-muted-foreground">Bônus PIX</span><span className="text-destructive">− {fmtBRL.format(bonus)}</span></div>
        <div className="flex justify-between"><span className="text-muted-foreground">Frete</span><span>+ {fmtBRL.format(frete)}</span></div>
        <div className="flex justify-between border-t pt-1.5">
          <span className="text-muted-foreground">Líquido projetado</span>
          <span className={`font-semibold ${liquidoProjetado < 0 ? "text-destructive" : ""}`}>{fmtBRL.format(liquidoProjetado)}</span>
        </div>
      </div>

      {guarda.exigeMotivo && <CampoMotivo value={motivo} onChange={setMotivo} />}

      <div className="flex justify-end">
        <BotaoSalvar
          onClick={() => salvar.mutate()}
          disabled={valorNum <= 0 || !motivoOk || !guarda.temPapel}
          pending={salvar.isPending}
          motivoTooltip={tooltipPapel}
        >
          Salvar desconto
        </BotaoSalvar>
      </div>
    </div>
  );
}

/* ----------------------------------------------------------------- painel */

export function PainelEditarPedido({ pedidoId, pedido, itens }: Props) {
  const estagio = pedido?.estagio as string | undefined;
  const { isLoading, isError, error, regraDe, estagiosPermitidos } = usePedidoEdicaoCampo(estagio);

  const { roles } = useAuth();
  const papeis = (roles ?? []) as string[];
  const guardaDe = (campo: CampoEdicao) =>
    montarGuarda(regraDe(campo), estagiosPermitidos(campo), papeis);

  if (isLoading) return <Skeleton className="h-64 w-full" />;
  if (isError) {
    return (
      <Alert variant="destructive">
        <AlertTriangle className="h-4 w-4" />
        <AlertDescription>Falha ao carregar regras de edição: {formatError(error)}</AlertDescription>
      </Alert>
    );
  }

  const gPag = guardaDe("pagamento");
  const gItens = guardaDe("itens");
  const gDesc = guardaDe("desconto");

  return (
    <div className="space-y-4">
      <Card className="border-border/60">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-semibold flex items-center gap-2">
            <Wallet className="h-4 w-4 text-muted-foreground" />
            {gPag.rotulo || "Pagamento"}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <SecaoPagamento pedidoId={pedidoId} pedido={pedido} guarda={gPag} />
        </CardContent>
      </Card>

      <Card className="border-border/60">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-semibold flex items-center gap-2">
            <Package className="h-4 w-4 text-muted-foreground" />
            {gItens.rotulo || "Itens do pedido"}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {gItens.permitido ? (
            <EditarItensDialog
              pedidoId={pedidoId}
              estagioAtual={String(estagio ?? "")}
              itensAtuais={(itens || []).map((i) => ({
                sku: i.sku ?? null,
                descricao: i.descricao ?? "",
                quantidade: num(i.quantidade),
                valor_unitario: num(i.valor_unitario),
              }))}
            />
          ) : (
            <SecaoBloqueada estagiosPermitidos={gItens.estagiosPermitidos} />
          )}
        </CardContent>
      </Card>

      <Card className="border-border/60">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-semibold flex items-center gap-2">
            <Percent className="h-4 w-4 text-muted-foreground" />
            {gDesc.rotulo || "Desconto"}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <SecaoDesconto pedidoId={pedidoId} pedido={pedido} guarda={gDesc} />
        </CardContent>
      </Card>
    </div>
  );
}
