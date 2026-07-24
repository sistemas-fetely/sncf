import { useState, useEffect } from "react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
  DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import {
  Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { AlertTriangle, Info } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAtualizarCondicaoPagamento } from "@/hooks/credito/useAtualizarCondicaoPagamento";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const sb = supabase as any;

interface Regra {
  id: string;
  nome: string;
  codigo: string;
  forma: string;
  parcela_unica: boolean;
  passa_por_analise: boolean;
}

interface CondicaoModelo {
  id: string;
  slug: string;
  rotulo: string;
  forma: "pix" | "cartao" | "boleto";
  condicao_canonica: string;
  regra_codigo: string;
  ordem: number;
}

interface Props {
  open: boolean;
  onClose: () => void;
  pedidoId: string;
  idExterno: string;
}

const MODELO_PERSONALIZADO = "__personalizado__";

const FORMA_LABEL: Record<string, string> = {
  pix: "PIX",
  cartao: "Cartão",
  boleto: "Boleto",
};

/** Retorna true quando a regra exige inputs estruturados de parcelas */
function ehParcelado(r: Regra | undefined): boolean {
  if (!r) return false;
  return (
    r.codigo === "boleto_com_entrada" ||
    r.codigo === "boleto_sem_entrada" ||
    (r.forma === "cartao" && !r.parcela_unica)
  );
}

/** Gera a string de condição no formato que fn_parse_condicao entende ("0", "30", "30/60/90") */
function buildCondicao(r: Regra, parcelas: number, intervalo: number): string {
  if (r.codigo === "boleto_com_entrada") {
    return Array.from({ length: parcelas + 1 }, (_, i) => i * intervalo).join("/");
  }
  if (r.codigo === "boleto_sem_entrada") {
    return Array.from({ length: parcelas }, (_, i) => (i + 1) * intervalo).join("/");
  }
  if (r.forma === "cartao" && !r.parcela_unica) {
    if (parcelas === 1) return "0";
    return Array.from({ length: parcelas }, (_, i) => (i + 1) * intervalo).join("/");
  }
  return "";
}

function condicaoFixa(r: Regra): string {
  if (r.codigo === "pix")            return "PIX";
  if (r.forma === "cartao" && r.parcela_unica) return "Cartão à vista";
  if (r.codigo === "boleto_avista")  return "Boleto à vista";
  return "";
}

export function EditarCondicaoPagamentoDialog({ open, onClose, pedidoId, idExterno }: Props) {
  const [modeloId, setModeloId] = useState<string>("");
  const [regraId, setRegraId]     = useState("");
  const [condicao, setCondicao]   = useState("");
  const [parcelas, setParcelas]   = useState(3);
  const [intervalo, setIntervalo] = useState(30);
  const [erroRpc, setErroRpc]     = useState<string | null>(null);
  const [avisoParse, setAvisoParse] = useState<string | null>(null);
  const [validando, setValidando] = useState(false);

  const { data: regras } = useQuery({
    queryKey: ["regras-pagamento"],
    queryFn: async () => {
      const { data } = await sb
        .from("regras_pagamento_pedido")
        .select("id, nome, codigo, forma, parcela_unica, passa_por_analise")
        .eq("ativo", true)
        .order("ordem");
      return data as Regra[];
    },
  });

  const { data: modelos } = useQuery({
    queryKey: ["condicoes-pagamento-ativas"],
    queryFn: async () => {
      const { data, error } = await sb
        .from("condicoes_pagamento")
        .select("id, slug, rotulo, forma, condicao_canonica, regra_codigo, ordem")
        .eq("ativo", true)
        .order("forma")
        .order("ordem");
      if (error) throw error;
      return (data ?? []) as CondicaoModelo[];
    },
  });

  const regraCodigoMap = new Map<string, string>(
    (regras ?? []).map((r) => [r.codigo, r.id])
  );

  const modelosPorForma: Record<string, CondicaoModelo[]> = {};
  for (const m of modelos ?? []) {
    (modelosPorForma[m.forma] ||= []).push(m);
  }

  const atualizar = useAtualizarCondicaoPagamento(pedidoId);
  const regraSelecionada = regras?.find((r) => r.id === regraId);
  const isPersonalizado = modeloId === MODELO_PERSONALIZADO;

  useEffect(() => {
    if (!isPersonalizado) return;
    if (!regraSelecionada || !ehParcelado(regraSelecionada)) return;
    setCondicao(buildCondicao(regraSelecionada, parcelas, intervalo));
  }, [parcelas, intervalo, regraSelecionada, isPersonalizado]);

  function handleChangeModelo(novoId: string) {
    setModeloId(novoId);
    setErroRpc(null);
    setAvisoParse(null);

    if (novoId === MODELO_PERSONALIZADO) {
      setRegraId("");
      setCondicao("");
      return;
    }
    const modelo = (modelos ?? []).find((m) => m.id === novoId);
    if (!modelo) return;
    const regraResolvida = regraCodigoMap.get(modelo.regra_codigo);
    if (!regraResolvida) {
      setErroRpc(`Regra "${modelo.regra_codigo}" do modelo não encontrada em regras_pagamento_pedido.`);
      setRegraId("");
      setCondicao("");
      return;
    }
    setRegraId(regraResolvida);
    setCondicao(modelo.condicao_canonica);
  }

  function handleChangeRegra(novoId: string) {
    setRegraId(novoId);
    setErroRpc(null);
    setAvisoParse(null);
    const r = regras?.find((x) => x.id === novoId);
    if (!r) return;
    if (ehParcelado(r)) {
      setParcelas(3);
      setIntervalo(30);
      setCondicao(buildCondicao(r, 3, 30));
    } else {
      setCondicao(condicaoFixa(r));
    }
  }

  async function validarCondicaoAdHoc(str: string): Promise<string | null> {
    const { data, error } = await sb.rpc("fn_parse_condicao", {
      p_condicao_solicitada: str,
      p_valor_liquido: 1,
      p_data_referencia: null,
    });
    if (error) return error.message ?? "Falha ao interpretar a condição";
    if (data?.parseada_por === "fallback_condicao_nao_reconhecida") {
      return "Condição não reconhecida pelo interpretador. Ajuste ou escolha um modelo existente.";
    }
    return null;
  }

  async function handleConfirmar() {
    setErroRpc(null);
    setAvisoParse(null);
    if (!regraId || !condicao) return;

    if (isPersonalizado) {
      setValidando(true);
      const err = await validarCondicaoAdHoc(condicao);
      setValidando(false);
      if (err) {
        setAvisoParse(err);
        return;
      }
    }

    try {
      await atualizar.mutateAsync({ novaRegraId: regraId, novaCondicao: condicao });
      onClose();
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setErroRpc(msg);
    }
  }

  function handleClose() {
    if (atualizar.isPending || validando) return;
    setModeloId("");
    setRegraId("");
    setCondicao("");
    setErroRpc(null);
    setAvisoParse(null);
    onClose();
  }

  const podeSalvar =
    !!regraId && !!condicao && !atualizar.isPending && !validando && !avisoParse;

  const isCartaoParcelado = regraSelecionada?.forma === "cartao" && !regraSelecionada?.parcela_unica;
  const formasOrdem: Array<"pix" | "cartao" | "boleto"> = ["pix", "cartao", "boleto"];

  return (
    <Dialog open={open} onOpenChange={(o) => !o && handleClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Editar condição de pagamento</DialogTitle>
          <DialogDescription>
            Pedido {idExterno} — proposta será recalculada automaticamente.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="space-y-2">
            <Label>Condição</Label>
            <Select value={modeloId} onValueChange={handleChangeModelo}>
              <SelectTrigger>
                <SelectValue placeholder="Escolha um modelo de condição..." />
              </SelectTrigger>
              <SelectContent>
                {formasOrdem.map((f) =>
                  (modelosPorForma[f] ?? []).length > 0 ? (
                    <SelectGroup key={f}>
                      <SelectLabel>{FORMA_LABEL[f]}</SelectLabel>
                      {modelosPorForma[f].map((m) => (
                        <SelectItem key={m.id} value={m.id}>{m.rotulo}</SelectItem>
                      ))}
                    </SelectGroup>
                  ) : null
                )}
                <SelectGroup>
                  <SelectLabel>Outros</SelectLabel>
                  <SelectItem value={MODELO_PERSONALIZADO}>Condição personalizada</SelectItem>
                </SelectGroup>
              </SelectContent>
            </Select>
          </div>

          {isPersonalizado && (
            <div className="space-y-2">
              <Label>Nova forma de pagamento</Label>
              <Select value={regraId} onValueChange={handleChangeRegra}>
                <SelectTrigger>
                  <SelectValue placeholder="Selecione..." />
                </SelectTrigger>
                <SelectContent>
                  {(regras ?? []).map((r) => (
                    <SelectItem key={r.id} value={r.id}>{r.nome}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {isPersonalizado && regraSelecionada && ehParcelado(regraSelecionada) && (
            <div className="space-y-3 rounded-md border p-3 bg-muted/30">
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Label>
                    {regraSelecionada.codigo === "boleto_com_entrada"
                      ? "Parcelas adicionais"
                      : "Número de parcelas"}
                  </Label>
                  <Input
                    type="number"
                    min={1}
                    max={12}
                    value={parcelas}
                    onChange={(e) =>
                      setParcelas(Math.max(1, Math.min(12, Number(e.target.value))))
                    }
                  />
                </div>
                {!isCartaoParcelado || parcelas > 1 ? (
                  <div className="space-y-2">
                    <Label>Intervalo (dias)</Label>
                    <Input
                      type="number"
                      min={1}
                      value={intervalo}
                      onChange={(e) => setIntervalo(Math.max(1, Number(e.target.value)))}
                    />
                  </div>
                ) : (
                  <div className="space-y-2">
                    <Label className="text-muted-foreground">Intervalo</Label>
                    <p className="text-sm text-muted-foreground pt-2">À vista (1 parcela)</p>
                  </div>
                )}
              </div>
              <div className="text-xs text-muted-foreground">
                Condição gerada: <span className="font-mono">{condicao}</span>{" "}
                {regraSelecionada.codigo === "boleto_com_entrada" && (
                  <span>({parcelas + 1} títulos: entrada + {parcelas} parcelas)</span>
                )}
                {regraSelecionada.codigo === "boleto_sem_entrada" && (
                  <span>({parcelas} título{parcelas > 1 ? "s" : ""})</span>
                )}
                {isCartaoParcelado && parcelas === 1 && <span>(à vista)</span>}
                {isCartaoParcelado && parcelas > 1 && <span>({parcelas}x cartão)</span>}
              </div>
            </div>
          )}

          {isPersonalizado && regraSelecionada && !ehParcelado(regraSelecionada) && (
            <div className="space-y-2">
              <Label>Condição</Label>
              <Input
                value={condicao}
                readOnly
                className="bg-muted/40 text-muted-foreground cursor-default"
              />
            </div>
          )}

          {!isPersonalizado && modeloId && (
            <div className="space-y-2">
              <Label>Condição canônica do modelo</Label>
              <Input
                value={condicao}
                readOnly
                className="bg-muted/40 text-muted-foreground cursor-default font-mono"
              />
            </div>
          )}

          {regraSelecionada?.passa_por_analise && (
            <Alert>
              <Info className="h-4 w-4" />
              <AlertDescription>
                Este pagamento passará por análise de crédito ao ser materializado.
              </AlertDescription>
            </Alert>
          )}

          {avisoParse && (
            <Alert variant="destructive">
              <AlertTriangle className="h-4 w-4" />
              <AlertDescription>{avisoParse}</AlertDescription>
            </Alert>
          )}

          {erroRpc && (
            <Alert variant="destructive">
              <AlertTriangle className="h-4 w-4" />
              <AlertDescription>{erroRpc}</AlertDescription>
            </Alert>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={handleClose} disabled={atualizar.isPending || validando}>
            Cancelar
          </Button>
          <Button onClick={handleConfirmar} disabled={!podeSalvar}>
            {atualizar.isPending || validando ? "Salvando…" : "Salvar e recalcular"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
