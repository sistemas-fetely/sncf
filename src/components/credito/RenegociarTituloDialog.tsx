import { useState, useMemo } from "react";
import { useMutation } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useInvalidarRecebivel } from "@/hooks/recebivel/useInvalidarRecebivel";
import { usePermissoesTela } from "@/hooks/usePermissoesTela";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Plus, Trash2, Copy } from "lucide-react";
import { QRCodeSVG } from "qrcode.react";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { formatBRL, formatDateBR } from "@/lib/format-currency";
import type { TituloCobranca } from "@/hooks/credito/useTitulosCobranca";
import type { ReguaEtapa } from "@/hooks/credito/useReguaFila";
import { ProrrogarVencimentoDialog } from "@/components/credito/ProrrogarVencimentoDialog";
import { hojeISO } from "@/lib/data";

type Modalidade = 1 | 2 | 3 | 4;
type NovoInstrumento = "pix" | "transferencia";

/** Retorno da RPC `renegociar_titulo` (contrato de 24/08/2026). */
export interface InstrumentoRenegociado {
  ok?: boolean;
  titulo: string | null;
  payload: string;
  txid?: string | null;
  token?: string | null;
  valor?: number | null;
  vencimento?: string | null;
  pedido?: string | null;
  beneficiario?: string | null;
  banco?: string | null;
}

export interface RenegociarResultado {
  ok: boolean;
  modalidade: 2 | 3;
  filhos: string[];
  instrumentos?: InstrumentoRenegociado[];
  /** UI apenas: havia boleto vivo no Safra quando o original foi encerrado. */
  boletoABaixar?: boolean;
}

interface Parcela {
  valor: string;
  data_vencimento: string;
}


interface Props {
  titulo: TituloCobranca;
  etapa: ReguaEtapa | null;
  open: boolean;
  onClose: () => void;
}

function amanhaISO() {
  const [a, m, d] = hojeISO().split("-").map(Number);
  return new Date(Date.UTC(a, m - 1, d + 1)).toISOString().slice(0, 10);
}

/**
 * TRAVA-APONTA-A-SAÍDA: opção desabilitada por regra de negócio precisa dizer
 * o motivo e nomear o caminho certo, no mesmo lugar (não em tooltip — tooltip
 * não existe no toque). Trava muda empurra o operador para a porta errada.
 */
function motivoProrrogarBloqueado(titulo: TituloCobranca): string | null {
  const tipo = titulo.tipo_pagamento ?? "";
  const status = titulo.boleto_status ?? null;

  if (tipo !== "boleto") {
    return `Prorrogação é instrução bancária de boleto. Este título é ${tipo || "de outro tipo"}.`;
  }
  if (status === "registrado") return null;
  if (status === "vencido") {
    return "Boleto vencido não aceita alteração de vencimento (ocorrência 06 do CNAB). Use Reemitir.";
  }
  if (status === null || status === "pendente" || status === "rejeitado") {
    return "O boleto ainda não está registrado no Safra. Não há vencimento para alterar.";
  }
  return "Boleto em processo no banco. Aguarde o retorno antes de alterar.";
}

function InstrumentoPixBloco({ inst }: { inst: InstrumentoRenegociado }) {
  const copiar = async () => {
    try {
      await navigator.clipboard.writeText(inst.payload);
      toast.success("Código PIX copiado.");
    } catch {
      toast.error("Não foi possível copiar — selecione o código manualmente.");
    }
  };
  return (
    <div className="rounded-md border p-3 space-y-3">
      <div>
        <p className="text-sm font-medium">
          {inst.titulo ?? "—"}
          {inst.valor != null && <> · {formatBRL(inst.valor)}</>}
        </p>
        {inst.vencimento && (
          <p className="text-xs text-muted-foreground">
            Vence {formatDateBR(inst.vencimento)}
          </p>
        )}
      </div>

      <div className="space-y-2">
        <Label className="text-xs">PIX copia e cola</Label>
        <div className="rounded-md border bg-muted/50 p-2 max-h-24 overflow-y-auto">
          <code className="text-[11px] font-mono break-all leading-relaxed">
            {inst.payload}
          </code>
        </div>
        <Button size="sm" onClick={copiar}>
          <Copy className="h-3.5 w-3.5 mr-1" /> Copiar código
        </Button>
      </div>

      <div className="space-y-2">
        <Label className="text-xs">QR Code</Label>
        <div className="inline-flex rounded-md border bg-white p-2">
          <QRCodeSVG value={inst.payload} size={168} level="M" marginSize={1} bgColor="#FFFFFF" />
        </div>
      </div>

      {(inst.beneficiario || inst.banco) && (
        <p className="text-xs text-muted-foreground">
          {[inst.beneficiario, inst.banco].filter(Boolean).join(" · ")}
        </p>
      )}
    </div>
  );
}


export function RenegociarTituloDialog({ titulo, etapa, open, onClose }: Props) {
  const invalidarRecebivel = useInvalidarRecebivel();
  const navigate = useNavigate();
  const [modalidade, setModalidade] = useState<Modalidade>(2);
  const [justificativa, setJustificativa] = useState("");
  const [parcelas, setParcelas] = useState<Parcela[]>([
    { valor: String(titulo.valor_efetivo ?? 0), data_vencimento: amanhaISO() },
  ]);
  const [novoInstrumento, setNovoInstrumento] = useState<NovoInstrumento>("pix");
  const [showProrrogar, setShowProrrogar] = useState(false);
  const [resultado, setResultado] = useState<RenegociarResultado | null>(null);
  const permTesouraria = usePermissoesTela("tela.fin_tesouraria");

  // Reemissão (modalidade 4)
  const [reemData, setReemData] = useState<string>(amanhaISO());
  const [reemValor, setReemValor] = useState<string>("");
  const [reemMotivo, setReemMotivo] = useState<string>("");


  const motivoTravaProrrogar = motivoProrrogarBloqueado(titulo);
  const podeProrrogar = motivoTravaProrrogar === null;

  const isRejeitado = titulo.boleto_status === "rejeitado";
  const podeReemitir =
    titulo.tipo_pagamento === "boleto" &&
    (titulo.boleto_status === "vencido" || isRejeitado);

  /**
   * Boleto vivo no Safra: encerrar o título aqui NÃO baixa esse boleto.
   * A baixa exige remessa + SafraNet + retorno (3 passos manuais).
   */
  const boletoVivo =
    titulo.tipo_pagamento === "boleto" &&
    (titulo.boleto_status === "registrado" || titulo.boleto_status === "vencido");

  const somaParcelas = useMemo(
    () => parcelas.reduce((acc, p) => acc + (parseFloat(p.valor.replace(",", ".")) || 0), 0),
    [parcelas],
  );

  const addParcela = () =>
    setParcelas((p) => [...p, { valor: "0", data_vencimento: amanhaISO() }]);
  const removeParcela = (i: number) =>
    setParcelas((p) => (p.length > 1 ? p.filter((_, idx) => idx !== i) : p));
  const updateParcela = (i: number, patch: Partial<Parcela>) =>
    setParcelas((p) => p.map((x, idx) => (idx === i ? { ...x, ...patch } : x)));

  const registrarAcaoRegua = async () => {
    if (!etapa) return;
    try {
      await (supabase as any).rpc("registrar_acao_regua", {
        p_titulo_id: titulo.id,
        p_etapa_codigo: etapa.codigo,
        p_dias_offset: etapa.dias_offset,
        p_resultado: "abriu_renegociacao",
        p_canal_efetivo: null,
        p_mensagem: null,
        p_observacao: `Modalidade ${modalidade}`,
      });
    } catch {
      // não bloqueia — a renegociação já foi feita
    }
  };

  const mutation = useMutation({
    mutationFn: async () => {
      if (modalidade === 1) throw new Error("Prorrogação usa fluxo próprio.");
      if (modalidade === 4) throw new Error("Reemissão usa fluxo próprio.");
      if (justificativa.trim().length < 10)
        throw new Error("Justificativa deve ter pelo menos 10 caracteres.");
      if (modalidade === 3 && parcelas.length !== 1)
        throw new Error("Troca de instrumento exige exatamente 1 parcela.");

      const payloadParcelas = parcelas.map((p) => ({
        valor: parseFloat(p.valor.replace(",", ".")) || 0,
        data_vencimento: p.data_vencimento,
      }));

      for (const p of payloadParcelas) {
        if (p.valor <= 0) throw new Error("Todas as parcelas devem ter valor > 0.");
        if (!p.data_vencimento) throw new Error("Toda parcela precisa de data de vencimento.");
      }

      const args: Record<string, unknown> = {
        p_titulo_id: titulo.id,
        p_modalidade: modalidade,
        p_justificativa: justificativa.trim(),
        p_parcelas: payloadParcelas,
      };
      if (modalidade === 3) args.p_novo_tipo_pagamento = novoInstrumento;

      const { data, error } = await (supabase as any).rpc("renegociar_titulo", args);
      if (error) throw new Error(error.message);
      if (data && data.ok === false) throw new Error(data.erro ?? "Erro ao renegociar.");
      return data;
    },
    onSuccess: async (data) => {
      await registrarAcaoRegua();
      await invalidarRecebivel();
      const res = data as RenegociarResultado;

      const instrumentos = (res?.instrumentos ?? []).filter((i) => i?.payload);
      const qtd = res?.filhos?.length ?? 0;

      if (instrumentos.length > 0 || boletoVivo) {
        // PIX-NAO-FECHA-EM-SILENCIO: o operador precisa levar o código embora.
        // Boleto vivo também não fecha em silêncio: falta a remessa de baixa.
        setResultado({ ...res, instrumentos, boletoABaixar: boletoVivo });
        if (boletoVivo) {
          toast.warning(
            `${qtd} título(s) criado(s). Falta gerar a remessa de baixa do boleto antigo — ele segue pagável no Safra.`,
          );
        }
        return;
      }

      toast.success(`Renegociação concluída — ${qtd} título(s) criado(s).`);
      onClose();
    },
    onError: (err: any) => toast.error(err?.message ?? "Erro ao renegociar."),
  });

  /**
   * `solicitar_reemissao_boleto` LANÇA EXCEÇÃO em caso inválido — não devolve
   * { ok: false, erro } como a `renegociar_titulo`. Trata-se via `error`.
   * Reemitir não é contato com o cliente: não registra ação de régua.
   */
  const mutationReemitir = useMutation({
    mutationFn: async () => {
      if (!reemData || reemData < amanhaISO()) {
        throw new Error("Escolha uma data de vencimento a partir de amanhã.");
      }
      const valorNum = reemValor.trim()
        ? parseFloat(reemValor.replace(",", "."))
        : null;
      if (valorNum !== null && (!Number.isFinite(valorNum) || valorNum <= 0)) {
        throw new Error("Valor inválido.");
      }

      const { data, error } = await (supabase as any).rpc("solicitar_reemissao_boleto", {
        p_titulo_id: titulo.id,
        p_nova_data: reemData,
        p_novo_valor: valorNum,
        p_motivo: reemMotivo.trim() || null,
      });
      if (error) throw new Error(error.message);
      return data as { acao: "reset_direto" | "baixa_agendada"; mensagem: string };
    },
    onSuccess: async (data) => {
      await invalidarRecebivel();
      toast.success(data?.mensagem ?? "Reemissão solicitada.");
      onClose();
    },
    onError: (err: any) => toast.error(err?.message ?? "Erro ao solicitar reemissão."),
  });


  const opcaoProrrogarDisabled = !podeProrrogar;
  const pendente = mutation.isPending || mutationReemitir.isPending;

  if (resultado) {
    const temPix = (resultado.instrumentos ?? []).length > 0;
    return (
      <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
        <DialogContent className="max-w-xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {resultado.boletoABaixar
                ? "Títulos novos criados — falta baixar o boleto antigo"
                : "Renegociação concluída"}
            </DialogTitle>
            <DialogDescription>
              {resultado.filhos?.length ?? 0} título(s) criado(s)
              {temPix ? " · envie o PIX abaixo ao cliente." : "."}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            {resultado.boletoABaixar && (
              <Alert className="border-warning/40 bg-warning/10">
                <AlertDescription className="text-xs text-warning space-y-1">
                  <p className="font-medium">
                    Próximo passo — o boleto antigo ainda está pagável no Safra
                  </p>
                  <p>1. Gerar a remessa de baixa na tela do Banco Safra.</p>
                  <p>2. Subir o arquivo gerado no SafraNet.</p>
                  <p>3. Conferir o retorno (ocorrência 10 — título baixado).</p>
                  <p>
                    Até o passo 3, o cliente tem dois boletos vivos para a mesma dívida.
                  </p>
                  {!permTesouraria.carregando && permTesouraria.podeVer && (
                    <Button
                      size="sm"
                      className="mt-1"
                      onClick={() => {
                        onClose();
                        navigate("/administrativo/banco-safra");
                      }}
                    >
                      Ir gerar a remessa de baixa
                    </Button>
                  )}
                  {!permTesouraria.carregando && !permTesouraria.podeVer && (
                    <p className="text-xs text-muted-foreground mt-1">
                      A remessa de baixa é gerada na tela Banco Safra. Peça a quem tem acesso a essa tela.
                    </p>
                  )}
                </AlertDescription>
              </Alert>
            )}

            {(resultado.instrumentos ?? []).map((inst, i) => (
              <InstrumentoPixBloco key={inst.token ?? inst.txid ?? i} inst={inst} />
            ))}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={onClose}>Fechar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    );
  }


  return (
    <>
      <Dialog open={open && !showProrrogar} onOpenChange={(v) => !v && onClose()}>

        <DialogContent className="max-w-xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Renegociar título</DialogTitle>
            <DialogDescription>
              {titulo.parceiro_razao_social} · {titulo.numero_titulo} ·{" "}
              {formatBRL(titulo.valor_efetivo)}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label className="text-xs">Modalidade</Label>
              <div className="grid gap-2">
                <label
                  className={`flex items-start gap-2 rounded-md border p-2 text-sm ${
                    opcaoProrrogarDisabled
                      ? "opacity-60 cursor-not-allowed"
                      : "cursor-pointer hover:bg-muted/40"
                  }`}
                >
                  <input
                    type="radio"
                    className="mt-1"
                    disabled={opcaoProrrogarDisabled}
                    checked={modalidade === 1}
                    onChange={() => {
                      if (opcaoProrrogarDisabled) return;
                      setModalidade(1);
                      setShowProrrogar(true);
                    }}
                  />
                  <div>
                    <div className="font-medium">1 — Prorrogar vencimento (boleto)</div>
                    <div className="text-xs text-muted-foreground">
                      Mesmo boleto, nova data. Não cancela o título.
                    </div>
                    {motivoTravaProrrogar && (
                      <div className="mt-1 text-xs text-muted-foreground">
                        {motivoTravaProrrogar}
                      </div>
                    )}
                  </div>
                </label>

                {podeReemitir && (
                  <label className="flex items-start gap-2 rounded-md border p-2 text-sm cursor-pointer hover:bg-muted/40">
                    <input
                      type="radio"
                      className="mt-1"
                      checked={modalidade === 4}
                      onChange={() => setModalidade(4)}
                    />
                    <div>
                      <div className="font-medium">Reemitir boleto</div>
                      <div className="text-xs text-muted-foreground">
                        Baixa o boleto atual (quando existe no banco) e gera um novo, com nova
                        data. Não cria títulos filhos.
                      </div>
                    </div>
                  </label>
                )}

                <label className="flex items-start gap-2 rounded-md border p-2 text-sm cursor-pointer hover:bg-muted/40">
                  <input
                    type="radio"
                    className="mt-1"
                    checked={modalidade === 2}
                    onChange={() => setModalidade(2)}
                  />
                  <div>
                    <div className="font-medium">2 — Parcelamento</div>
                    <div className="text-xs text-muted-foreground">
                      Cria novos títulos filhos. Encerra o original como recuperação.
                    </div>
                  </div>
                </label>

                <label className="flex items-start gap-2 rounded-md border p-2 text-sm cursor-pointer hover:bg-muted/40">
                  <input
                    type="radio"
                    className="mt-1"
                    checked={modalidade === 3}
                    onChange={() => setModalidade(3)}
                  />
                  <div>
                    <div className="font-medium">3 — Troca de instrumento</div>
                    <div className="text-xs text-muted-foreground">
                      1 parcela, novo tipo (PIX / Transferência). Encerra o original.
                    </div>
                  </div>
                </label>
              </div>
            </div>

            {modalidade === 4 && (
              <>
                <Alert className="border-warning/40 bg-warning/10">
                  <AlertDescription className="text-xs text-warning">
                    {isRejeitado ? (
                      <>
                        Boleto rejeitado nunca chegou a viver no banco. A reemissão vai direto
                        para a próxima remessa de entrada, sem baixa.
                      </>
                    ) : (
                      <>
                        Reemissão tem duas viagens ao banco, mínimo 2 dias úteis.
                        <span className="block mt-1">
                          Hoje: gerar a remessa de baixa na aba Banco e subir no SafraNet.
                        </span>
                        <span className="block">
                          Amanhã: processar o retorno, gerar a remessa de entrada, subir no SafraNet.
                        </span>
                        <span className="block">
                          Depois disso: processar o novo retorno — só então o boleto novo pode ser
                          enviado ao cliente.
                        </span>
                        <span className="block mt-1">
                          O nosso número muda. O boleto antigo vira lixo.
                        </span>
                      </>
                    )}
                  </AlertDescription>
                </Alert>

                <div className="space-y-1.5">
                  <Label className="text-xs" htmlFor="reem-data">
                    Nova data de vencimento <span className="text-destructive">*</span>
                  </Label>
                  <Input
                    id="reem-data"
                    type="date"
                    min={amanhaISO()}
                    value={reemData}
                    onChange={(e) => setReemData(e.target.value)}
                    className="w-44"
                  />
                </div>

                <div className="space-y-1.5">
                  <Label className="text-xs" htmlFor="reem-valor">Novo valor (R$)</Label>
                  <Input
                    id="reem-valor"
                    type="number"
                    step="0.01"
                    min="0"
                    placeholder={String((titulo.valor_efetivo ?? 0).toFixed(2))}
                    value={reemValor}
                    onChange={(e) => setReemValor(e.target.value)}
                    className="w-44"
                  />
                  <p className="text-[11px] text-muted-foreground">
                    Só preencha se o valor mudou. Não é possível aumentar o valor por reemissão.
                  </p>
                </div>

                <div className="space-y-1.5">
                  <Label className="text-xs" htmlFor="reem-motivo">Motivo</Label>
                  <Input
                    id="reem-motivo"
                    value={reemMotivo}
                    onChange={(e) => setReemMotivo(e.target.value)}
                    placeholder="Opcional — ex.: cliente pediu nova data"
                  />
                </div>
              </>
            )}

            {(modalidade === 2 || modalidade === 3) && (
              <>
                <Alert className="border-warning/40 bg-warning/10">
                  <AlertDescription className="text-xs text-warning">
                    O título original será encerrado como{" "}
                    <b>cancelado_recuperacao</b> e não poderá receber pagamentos.
                    {boletoVivo && (
                      <>
                        <span className="block mt-1">
                          O boleto antigo <b>continua registrado e pagável no Safra</b>. Ele só
                          morre depois de três passos manuais: gerar a remessa de baixa na aba
                          Banco, subir o arquivo no SafraNet e processar o retorno com a
                          ocorrência 10.
                        </span>
                        <span className="block mt-1">
                          Até lá o cliente tem <b>dois boletos vivos</b> para a mesma dívida.
                        </span>
                        <span className="block mt-1">
                          O nosso número dos títulos novos é outro. O boleto antigo vira lixo —
                          não envie ao cliente.
                        </span>
                      </>
                    )}
                    {modalidade === 3 && novoInstrumento === "pix" && (
                      <span className="block mt-1">
                        O QR PIX será gerado e aparecerá aqui para você enviar ao cliente.
                      </span>
                    )}
                  </AlertDescription>
                </Alert>


                {modalidade === 3 && (
                  <div className="space-y-1.5">
                    <Label className="text-xs">Novo instrumento</Label>
                    <Select
                      value={novoInstrumento}
                      onValueChange={(v) => setNovoInstrumento(v as NovoInstrumento)}
                    >
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="pix">PIX</SelectItem>
                        <SelectItem value="transferencia">Transferência</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                )}

                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <Label className="text-xs">
                      {modalidade === 3 ? "Parcela" : "Parcelas"}
                    </Label>
                    {modalidade === 2 && (
                      <Button size="sm" variant="outline" onClick={addParcela}>
                        <Plus className="h-3 w-3 mr-1" /> Adicionar
                      </Button>
                    )}
                  </div>
                  {parcelas.map((p, i) => (
                    <div key={i} className="flex items-center gap-2">
                      <Input
                        type="number"
                        step="0.01"
                        min="0"
                        placeholder="Valor"
                        value={p.valor}
                        onChange={(e) => updateParcela(i, { valor: e.target.value })}
                        className="w-32"
                      />
                      <Input
                        type="date"
                        value={p.data_vencimento}
                        onChange={(e) => updateParcela(i, { data_vencimento: e.target.value })}
                        min={amanhaISO()}
                        className="w-44"
                      />
                      {modalidade === 2 && parcelas.length > 1 && (
                        <Button
                          size="icon"
                          variant="ghost"
                          onClick={() => removeParcela(i)}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      )}
                    </div>
                  ))}
                  {modalidade === 2 && (
                    <p className="text-xs text-muted-foreground">
                      Soma parcelas: <b>{formatBRL(somaParcelas)}</b> · Em aberto:{" "}
                      <b>{formatBRL(titulo.valor_efetivo)}</b>
                    </p>
                  )}
                </div>

                <div className="space-y-1.5">
                  <Label className="text-xs">
                    Justificativa <span className="text-destructive">*</span>
                  </Label>
                  <Textarea
                    value={justificativa}
                    onChange={(e) => setJustificativa(e.target.value)}
                    rows={3}
                    placeholder="Motivo da renegociação (mín. 10 caracteres)."
                  />
                  <p className="text-[11px] text-muted-foreground">
                    {justificativa.trim().length}/10
                  </p>
                </div>
              </>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={onClose} disabled={pendente}>
              Cancelar
            </Button>
            {modalidade === 4 ? (
              <Button
                onClick={() => mutationReemitir.mutate()}
                disabled={pendente || !reemData}
              >
                {mutationReemitir.isPending ? "Reemitindo..." : "Reemitir boleto"}
              </Button>
            ) : (
              <Button
                onClick={() => mutation.mutate()}
                disabled={
                  modalidade === 1 ||
                  pendente ||
                  justificativa.trim().length < 10
                }
              >
                {mutation.isPending ? "Renegociando..." : "Confirmar renegociação"}
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {showProrrogar && (
        <ProrrogarVencimentoDialog
          titulo={titulo}
          open={showProrrogar}
          onClose={() => {
            setShowProrrogar(false);
            onClose();
          }}
        />
      )}
    </>
  );
}
