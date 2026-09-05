/**
 * REFERENCIA-SEMPRE, ANEXO-CONFORME-QUEM-E (02/09/2026). Uma tela so para confirmar
 * pagamento, dois modos. A referencia (NSU/E2E/txid) e obrigatoria em TODOS os caminhos:
 * sem ela a linha nasce impossivel de casar com extrato — foram 21 linhas e R$ 35.235
 * assim ate 02/09, todas pela opcao "Manual (sem referencia)", que deixou de existir.
 * O anexo e que separa as autoridades: na Mesa e obrigatorio (o vendedor prova com
 * papel), no SOPS e opcional (quem tem acao.confirmar_pagamento_sem_anexo pode
 * declarar). Regra que vale numa porta e nao na outra nao e guarda, e sugestao.
 *
 * CARTAO-E-CAPTURA-UNICA: cartao fecha SEMPRE por `confirmar_cartao_capturado` (com ou
 * sem anexo) — `confirmar_comprovante_pagamento` recusa tipo cartao de proposito.
 * `confirmar_portao_pago` nao e chamada em lugar nenhum: esta aposentada.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { Loader2, Paperclip } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import { hojeISO } from "@/lib/data";
import { formatBRL } from "@/lib/format-currency";
import { usePermissaoAcaoOuSuperAdmin } from "@/hooks/usePermissaoAcao";
import { useBancosRecebimento } from "@/hooks/financeiro/useBancosRecebimento";
import { useAdquirentes } from "@/hooks/financeiro/useAdquirentes";
import {
  useComprovantesPedido,
  useConfirmarComprovante,
  useEnviarComprovante,
} from "@/hooks/comercial/useComprovantePagamento";
import { useConfirmarPagamentoLinha } from "@/hooks/pedidos/useConfirmarPagamentoLinha";
import { useConfirmarCartaoCapturado } from "@/hooks/pedidos/useConfirmarCartaoCapturado";
import {
  usePlanoAbertoPedido,
  meioDaLinha,
  rotuloMeio,
  type LinhaPlanoAberta,
} from "@/hooks/pedidos/usePlanoAbertoPedido";

const ACEITOS = "image/jpeg,image/png,image/webp,application/pdf";

type ProvaTipoUI = "pix_txid" | "cartao_nsu" | "boleto_cnab" | "ofx";

const PROVA_OPCOES: Array<{ value: ProvaTipoUI; label: string }> = [
  { value: "pix_txid", label: "PIX (E2E/txid)" },
  { value: "cartao_nsu", label: "Cartão (NSU)" },
  { value: "boleto_cnab", label: "Boleto (CNAB)" },
  { value: "ofx", label: "Extrato (OFX)" },
];

const REF_LABEL: Record<ProvaTipoUI, string> = {
  pix_txid: "E2E / txid do PIX",
  cartao_nsu: "NSU da captura",
  boleto_cnab: "Nosso número",
  ofx: "Identificador do extrato",
};

const REF_PLACEHOLDER: Record<ProvaTipoUI, string> = {
  pix_txid: "Ex.: E00360305202609021530s1a2b3c4d5e6",
  cartao_nsu: "Ex.: 123456789",
  boleto_cnab: "Ex.: 00012345678901234567",
  ofx: "Ex.: 20260902-001-3487",
};

/** Tipo aceito por `confirmar_comprovante_pagamento` (p_tipo). */
const TIPO_COMPROVANTE: Record<ProvaTipoUI, string> = {
  pix_txid: "pix",
  cartao_nsu: "cartao",
  boleto_cnab: "boleto",
  ofx: "ted",
};

function provaDoLido(tipoLido: string | null): ProvaTipoUI {
  switch ((tipoLido ?? "").toLowerCase()) {
    case "cartao":
      return "cartao_nsu";
    case "boleto":
      return "boleto_cnab";
    case "ted":
      return "ofx";
    default:
      return "pix_txid";
  }
}

function fmtVenc(iso: string | null | undefined): string {
  if (!iso) return "sem vencimento";
  const [a, m, d] = iso.slice(0, 10).split("-");
  return `${d}/${m}/${a}`;
}

function descreverLinha(l: LinhaPlanoAberta): string {
  const parcela = l.numero_parcela
    ? `Parcela ${l.numero_parcela}${l.total_parcelas ? `/${l.total_parcelas}` : ""}`
    : "Parcela";
  return [parcela, rotuloMeio(l.tipo_pagamento), formatBRL(l.valor), `vence ${fmtVenc(l.data_prevista)}`]
    .filter(Boolean)
    .join(" · ");
}

interface Props {
  pedidoId: string;
  /** Linha do plano (`provisao_recebimento.id`). Sem ela o dialog pede a escolha. */
  provisaoId?: string;
  aberto: boolean;
  aoFechar: () => void;
  modo: "sops" | "mesa";
}

export function ConfirmarPagamentoDialog({
  pedidoId,
  provisaoId,
  aberto,
  aoFechar,
  modo,
}: Props) {
  const inputRef = useRef<HTMLInputElement>(null);

  const [escolhida, setEscolhida] = useState<string>("");
  const [provaTipo, setProvaTipo] = useState<ProvaTipoUI>("pix_txid");
  const [referencia, setReferencia] = useState("");
  const [dataPagamento, setDataPagamento] = useState(() => hojeISO());
  const [valor, setValor] = useState("");
  const [bancoId, setBancoId] = useState("");
  const [adquirenteId, setAdquirenteId] = useState("");
  const [observacao, setObservacao] = useState("");
  const [comprovanteId, setComprovanteId] = useState<string | null>(null);
  const [confianca, setConfianca] = useState<string | null>(null);

  // O plano aberto carrega sempre que o dialog abre — mesmo com provisaoId fixo,
  // porque o tipo de prova nasce do MEIO da linha (MEIO-DITA-PROVA).
  const planoQ = usePlanoAbertoPedido(pedidoId, aberto);
  const bancosQ = useBancosRecebimento(aberto);
  const adquirentesQ = useAdquirentes(aberto && provaTipo === "cartao_nsu");
  const comprovantesQ = useComprovantesPedido(pedidoId, aberto);

  const enviarComprovante = useEnviarComprovante(pedidoId);
  const confirmarComprovante = useConfirmarComprovante(pedidoId);
  const confirmarLinha = useConfirmarPagamentoLinha();
  const confirmarCartao = useConfirmarCartaoCapturado();

  // GATE: modo mesa exige a ação da Mesa; modo SOPS exige declarar sem anexo OU,
  // com comprovante lido, a permissão de confirmar pagamento declarado.
  const semAnexoQ = usePermissaoAcaoOuSuperAdmin("acao.confirmar_pagamento_sem_anexo");
  const declaradoQ = usePermissaoAcaoOuSuperAdmin("acao.confirmar_pagamento_declarado");
  const mesaQ = usePermissaoAcaoOuSuperAdmin("acao.mesa_confirmar_com_prova");

  const candidatas = useMemo(
    () => (planoQ.data ?? []).filter((l) => l.eh_portao !== false),
    [planoQ.data],
  );

  useEffect(() => {
    if (provisaoId || escolhida || !candidatas.length) return;
    setEscolhida(candidatas[0].id);
  }, [candidatas, escolhida, provisaoId]);

  const linhaAlvo = useMemo(() => {
    if (provisaoId) return null;
    return candidatas.find((l) => l.id === escolhida) ?? candidatas[0] ?? null;
  }, [candidatas, escolhida, provisaoId]);

  const provisaoEfetiva = provisaoId ?? linhaAlvo?.id ?? null;

  // Linha efetiva do plano nos DOIS caminhos (provisaoId fixo ou escolha manual):
  // é ela quem dita o meio — e o meio dita o tipo de prova.
  const linhaEfetiva = useMemo(
    () => candidatas.find((l) => l.id === provisaoEfetiva) ?? null,
    [candidatas, provisaoEfetiva],
  );

  // O comprovante mais recente já lido pela IA preenche a tela sozinho.
  const lido = useMemo(
    () => (comprovantesQ.data ?? []).find((c) => c.status === "lido") ?? null,
    [comprovantesQ.data],
  );

  useEffect(() => {
    if (!aberto || !lido || comprovanteId === lido.id) return;
    setComprovanteId(lido.id);
    setConfianca(lido.confianca_ia ?? null);
    setProvaTipo(provaDoLido(lido.tipo_lido));
    if (lido.chave_lida) setReferencia(lido.chave_lida);
    if (lido.data_lida) setDataPagamento(lido.data_lida.slice(0, 10));
    if (lido.valor_lido != null) setValor(String(lido.valor_lido));
  }, [aberto, lido, comprovanteId]);

  // MEIO-DITA-PROVA: ao trocar de linha, a prova nasce do meio dela — cartão
  // pede NSU, boleto pede CNAB, o resto fecha por E2E/txid. Não manda quando um
  // comprovante lido já está ditando a prova, nem sobrescreve a escolha manual
  // do operador na MESMA linha (o ref marca a última linha sincronizada).
  const ultimaLinhaSyncRef = useRef<string | null>(null);
  useEffect(() => {
    if (!linhaEfetiva) return;
    if (lido && comprovanteId === lido.id) return;
    if (ultimaLinhaSyncRef.current === linhaEfetiva.id) return;
    ultimaLinhaSyncRef.current = linhaEfetiva.id;
    const meio = meioDaLinha(linhaEfetiva);
    setProvaTipo(
      meio === "cartao" ? "cartao_nsu" : meio === "boleto" ? "boleto_cnab" : "pix_txid",
    );
  }, [linhaEfetiva, lido, comprovanteId]);

  useEffect(() => {
    if (aberto) return;
    // Fechou: a próxima confirmação começa limpa.
    setEscolhida("");
    setProvaTipo("pix_txid");
    setReferencia("");
    setDataPagamento(hojeISO());
    setValor("");
    setBancoId("");
    setAdquirenteId("");
    setObservacao("");
    setComprovanteId(null);
    setConfianca(null);
    ultimaLinhaSyncRef.current = null;
  }, [aberto]);

  const ehCartao = provaTipo === "cartao_nsu";
  // Linha de cartão SÓ fecha pela captura com NSU — a prova fica travada.
  const linhaEhCartao = !!linhaEfetiva && meioDaLinha(linhaEfetiva) === "cartao";
  const temAnexo = !!comprovanteId;
  const valorNum = Number(String(valor).replace(",", ".")) || 0;

  const enviando =
    confirmarComprovante.isPending || confirmarLinha.isPending || confirmarCartao.isPending;

  const podeGate = modo === "mesa" ? mesaQ.permitido : temAnexo ? declaradoQ.permitido || semAnexoQ.permitido : semAnexoQ.permitido;
  const carregandoGate =
    modo === "mesa" ? mesaQ.carregando : semAnexoQ.carregando || declaradoQ.carregando;

  const anexoFaltando = modo === "mesa" && !temAnexo;
  const refFaltando = !referencia.trim();
  const bancoFaltando = !bancoId;
  const linhaFaltando = !ehCartao && !provisaoEfetiva;

  const bloqueado =
    enviando || anexoFaltando || refFaltando || bancoFaltando || linhaFaltando || !dataPagamento;

  const motivoBloqueio = anexoFaltando
    ? "Na Mesa o pagamento só fecha com comprovante anexado."
    : refFaltando
      ? "Sem a referência o extrato nunca vai casar."
      : bancoFaltando
        ? "Diga em qual conta o dinheiro entrou."
        : linhaFaltando
          ? "Nenhuma linha de portão pendente para confirmar."
          : undefined;

  async function confirmar() {
    if (bloqueado) return;
    try {
      if (ehCartao) {
        // Cartão: sempre a captura por NSU, com ou sem anexo.
        await confirmarCartao.mutateAsync({
          pedido_id: pedidoId,
          nsu: referencia,
          data_captura: dataPagamento,
          valor_capturado: valorNum > 0 ? valorNum : null,
          observacao,
          adquirente_id: adquirenteId || null,
        });
      } else if (temAnexo && comprovanteId) {
        await confirmarComprovante.mutateAsync({
          comprovante_id: comprovanteId,
          tipo: TIPO_COMPROVANTE[provaTipo],
          chave: referencia.trim(),
          valor: valorNum,
          data: dataPagamento,
          justificativa: observacao,
          banco_recebimento_id: bancoId,
        });
      } else {
        await confirmarLinha.mutateAsync({
          provisao_id: provisaoEfetiva!,
          prova_tipo: provaTipo,
          prova_ref: referencia.trim(),
          data_pagamento: dataPagamento,
          observacao,
        });
      }
    } catch {
      // FAIL-LOUD: o toast com a mensagem do banco já saiu no hook. Mantém aberto.
      return;
    }
    aoFechar();
  }

  return (
    <Dialog open={aberto} onOpenChange={(v) => { if (!v && !enviando) aoFechar(); }}>
      <DialogContent className="max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Confirmar pagamento</DialogTitle>
          <DialogDescription>
            {modo === "mesa"
              ? "Na Mesa o pagamento fecha com o comprovante anexado — a IA lê e preenche os campos."
              : "A referência é obrigatória. O anexo é opcional: se anexar, a IA preenche a referência sozinha."}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Resumo da linha */}
          {!provisaoId && candidatas.length > 1 && !ehCartao ? (
            <div className="space-y-2">
              <Label htmlFor="linha-pagamento">Qual linha confirmar</Label>
              <Select value={escolhida} onValueChange={setEscolhida}>
                <SelectTrigger id="linha-pagamento">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {candidatas.map((l) => (
                    <SelectItem key={l.id} value={l.id}>
                      {descreverLinha(l)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          ) : linhaAlvo ? (
            <div className="rounded-md border bg-muted/40 px-3 py-2 text-sm">
              Você vai confirmar: <span className="font-medium">{descreverLinha(linhaAlvo)}</span>
            </div>
          ) : null}

          {/* Anexo */}
          <div className="space-y-2">
            <input
              ref={inputRef}
              type="file"
              accept={ACEITOS}
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                e.target.value = "";
                if (file) enviarComprovante.mutate(file);
              }}
            />
            <div className="flex flex-wrap items-center gap-2">
              <Button
                type="button"
                variant="outline"
                className="gap-1.5"
                disabled={enviarComprovante.isPending}
                onClick={() => inputRef.current?.click()}
              >
                {enviarComprovante.isPending ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Paperclip className="h-4 w-4" />
                )}
                {enviarComprovante.isPending ? "Lendo comprovante…" : "Anexar comprovante (a IA lê)"}
              </Button>
              {temAnexo && <Badge variant="outline">IA: {confianca ?? "—"}</Badge>}
            </div>
            <p className="text-xs text-muted-foreground">
              {modo === "mesa"
                ? "Obrigatório: o comprovante é a prova do vendedor."
                : "Opcional — atalho: a IA lê e preenche referência, data e valor."}
            </p>
          </div>

          {/* Tipo de prova */}
          <div className="space-y-2">
            <Label htmlFor="prova-tipo">Tipo de prova</Label>
            <Select
              value={provaTipo}
              onValueChange={(v) => setProvaTipo(v as ProvaTipoUI)}
              disabled={linhaEhCartao}
            >
              <SelectTrigger id="prova-tipo">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {PROVA_OPCOES.map((o) => (
                  <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            {linhaEhCartao && (
              <p className="text-[11px] text-muted-foreground">
                Cartão fecha pela captura com NSU — se o cliente pagou por outro meio, refaça o
                plano de pagamento.
              </p>
            )}
          </div>

          {/* Referência */}
          <div className="space-y-2">
            <Label htmlFor="prova-ref">{REF_LABEL[provaTipo]}</Label>
            <Input
              id="prova-ref"
              value={referencia}
              onChange={(e) => setReferencia(e.target.value)}
              placeholder={REF_PLACEHOLDER[provaTipo]}
            />
          </div>

          {/* Data */}
          <div className="space-y-2">
            <Label htmlFor="data-pagamento">Data do pagamento</Label>
            <Input
              id="data-pagamento"
              type="date"
              value={dataPagamento}
              onChange={(e) => setDataPagamento(e.target.value)}
            />
          </div>

          {/* Valor */}
          <div className="space-y-2">
            <Label htmlFor="valor-pagamento">Valor</Label>
            <Input
              id="valor-pagamento"
              type="number"
              step="0.01"
              inputMode="decimal"
              value={valor}
              onChange={(e) => setValor(e.target.value)}
              placeholder={linhaAlvo ? linhaAlvo.valor.toFixed(2) : "0,00"}
            />
          </div>

          {/* Banco de recebimento */}
          <div className="space-y-2">
            <Label htmlFor="banco-recebimento">Em qual conta o dinheiro entrou</Label>
            <Select value={bancoId} onValueChange={setBancoId}>
              <SelectTrigger id="banco-recebimento">
                <SelectValue placeholder={bancosQ.isLoading ? "Carregando…" : "Escolha a conta"} />
              </SelectTrigger>
              <SelectContent>
                {(bancosQ.data ?? []).map((b) => (
                  <SelectItem key={b.id} value={b.id}>{b.nome}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Adquirente — só cartão */}
          {ehCartao && (
            <div className="space-y-2">
              <Label htmlFor="adquirente">Adquirente da captura</Label>
              <Select value={adquirenteId} onValueChange={setAdquirenteId}>
                <SelectTrigger id="adquirente">
                  <SelectValue
                    placeholder={adquirentesQ.isLoading ? "Carregando…" : "Escolha a adquirente"}
                  />
                </SelectTrigger>
                <SelectContent>
                  {(adquirentesQ.data ?? []).map((a) => (
                    <SelectItem key={a.id} value={a.id}>{a.nome}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                No dia da captura o dinheiro está com a adquirente — cai na conta dias depois,
                via repasse.
              </p>
            </div>
          )}

          {/* Observação */}
          <div className="space-y-2">
            <Label htmlFor="observacao-pagamento">Observação (opcional)</Label>
            <Textarea
              id="observacao-pagamento"
              value={observacao}
              onChange={(e) => setObservacao(e.target.value)}
              placeholder="Ex.: PIX recebido na conta Safra"
              rows={3}
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={aoFechar} disabled={enviando}>
            Cancelar
          </Button>
          {(podeGate || carregandoGate) && (
            <Button onClick={confirmar} disabled={bloqueado} title={motivoBloqueio}>
              {enviando && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              {ehCartao ? "Confirmar captura" : "Confirmar pagamento"}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
