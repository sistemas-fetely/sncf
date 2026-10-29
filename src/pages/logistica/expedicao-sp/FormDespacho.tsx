import { useEffect, useMemo, useState } from "react";
import { Loader2, Truck } from "lucide-react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { BotaoGuardado } from "@/components/acesso/BotaoGuardado";
import { DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { formatError } from "@/lib/format-error";
import { normalizarCodigoCorreios, PADRAO_CODIGO_CORREIOS, type ModalEntrega } from "./tipos";
import { erroCodigoSro } from "@/lib/logistica/codigoSro";
import { cancelarPrepostagemSeSairDeCorreios, useDocumentosMesa, useExecutoresMesa } from "./useMesaSp";

/**
 * Despacho individual (B2C e B2B). Modal pré-selecionado com o vigente;
 * trocar exige motivo e chama fn_mesa_sp_trocar_modal antes do despacho. Os campos dependem do modal; quem valida de
 * verdade é `fn_mesa_sp_despachar` — o erro dela sobe como está (FAIL-LOUD).
 *
 * - Modal com executores em `mesa_sp_executor` (Frete Fetely): "Quem entrega";
 *   referência obrigatória se o executor `exige_referencia`.
 * - Correios (`exige_etiqueta_correios`): SEMPRE pede o bipe do código do
 *   comprovante (campo vazio); diferente do já registrado, o bipado substitui.
 * - Retirada (B2B): "Quem retirou".
 * - Demais (Transportadora): referência da coleta obrigatória.
 */
interface Props {
  pedidoId: string;
  modalCodigo: string | null;
  modais: ModalEntrega[];
  despachando: boolean;
  bloqueado?: boolean;
  /** Nome do cliente (razão social) — pré-preenche "Quem retirou". */
  clienteNome?: string | null;
  /** Presente quando o form vive num diálogo: mostra "Cancelar" no rodapé. */
  onCancelar?: () => void;
  onDespachar: (referencia: string | null, executor: string | null, modal: string) => void;
}

export function FormDespacho({ pedidoId, modalCodigo: modalEmbalagem, modais, despachando, bloqueado = false, clienteNome = null, onCancelar, onDespachar }: Props) {
  const qc = useQueryClient();
  // Modal vigente: considera troca registrada depois da embalagem.
  const vigenteQ = useQuery({
    queryKey: ["mesa-sp", "modal-do-pedido", pedidoId],
    enabled: !!pedidoId,
    queryFn: async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase.rpc as any)("fn_mesa_sp_modal_do_pedido", { p_pedido_id: pedidoId });
      if (error) throw new Error(error.message);
      return (data as string | null) ?? null;
    },
  });
  const modalVigente = vigenteQ.data ?? modalEmbalagem;
  const [escolhido, setEscolhido] = useState("");
  useEffect(() => { setEscolhido(""); }, [pedidoId, modalVigente]);
  const modalCodigo = escolhido || modalVigente;
  const houveTroca = !!modalVigente && !!escolhido && escolhido !== modalVigente;
  const [motivoTroca, setMotivoTroca] = useState("");
  const [salvandoTroca, setSalvandoTroca] = useState(false);
  const [erroTroca, setErroTroca] = useState<string | null>(null);
  const opcoesModal = modais.filter((m) => m.ativo || m.codigo === modalVigente);

  async function despachar(refFinal: string | null, execFinal: string | null) {
    if (!modalCodigo) return;
    if (houveTroca) {
      setSalvandoTroca(true); setErroTroca(null);
      try {
        await cancelarPrepostagemSeSairDeCorreios(pedidoId, modalCodigo, motivoTroca.trim());
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { error } = await (supabase.rpc as any)("fn_mesa_sp_trocar_modal", {
          p_pedido_id: pedidoId, p_modal: modalCodigo, p_motivo: motivoTroca.trim(),
        });
        if (error) throw new Error(error.message);
      } catch (e) {
        setErroTroca(e instanceof Error ? e.message : String(e));
        setSalvandoTroca(false);
        return; // troca falhou: não despacha
      }
      setSalvandoTroca(false);
      void qc.invalidateQueries({ queryKey: ["mesa-sp", "modal-do-pedido", pedidoId] });
    }
    onDespachar(refFinal, execFinal, modalCodigo);
  }

  const execQ = useExecutoresMesa();
  const modal = modais.find((m) => m.codigo === modalCodigo) ?? null;
  const executores = useMemo(
    () => (execQ.data ?? []).filter((e) => e.modal_codigo === modalCodigo),
    [execQ.data, modalCodigo],
  );
  const ehCorreios = modal?.exige_etiqueta_correios === true;
  const docsQ = useDocumentosMesa(ehCorreios ? pedidoId : "");
  const [executor, setExecutor] = useState("");
  const [referencia, setReferencia] = useState("");

  const ehRetirada = modal?.sem_despacho === true && executores.length === 0 && !ehCorreios;
  useEffect(() => {
    setExecutor("");
    setReferencia(ehRetirada ? (clienteNome ?? "") : "");
  }, [pedidoId, modalCodigo, ehRetirada, clienteNome]);

  const codigoRegistrado = useMemo(() => {
    const linha = (docsQ.data ?? []).find((d) => d.tipo === "rastreio");
    const det = normalizarCodigoCorreios(linha?.detalhe ?? "");
    return PADRAO_CODIGO_CORREIOS.test(det) ? det : null;
  }, [docsQ.data]);

  if (!modalCodigo && vigenteQ.isLoading) {
    return <p className="text-sm text-muted-foreground">Carregando modal…</p>;
  }
  if (!modalCodigo) {
    return <p className="text-sm text-destructive">Embalagem sem modal registrado — não há como despachar.</p>;
  }

  let campo: { id: string; rotulo: string; placeholder: string; obrigatorio: boolean } | null = null;
  const execEscolhido = executores.find((e) => e.codigo === executor) ?? null;
  const usaExecutor = executores.length > 0;
  if (usaExecutor) {
    if (execEscolhido) {
      campo = execEscolhido.exige_referencia
        ? { id: "ref-corrida", rotulo: "Referência da corrida", placeholder: "ID ou link da corrida", obrigatorio: true }
        : { id: "ref-portador", rotulo: "Referência (opcional)", placeholder: "Nome do portador", obrigatorio: false };
    }
  } else if (ehCorreios) {
    // Sempre pede o bipe, mesmo com código já no pedido (pode ser pré-postagem morta do Bling).
    campo = { id: "ref-correios", rotulo: "Código do comprovante", placeholder: "AA123456789BR", obrigatorio: true };
  } else if (modal?.sem_despacho) {
    campo = { id: "ref-retirada", rotulo: "Quem retirou", placeholder: "Nome de quem retira", obrigatorio: true };
  } else {
    campo = { id: "ref-coleta", rotulo: "Referência da coleta", placeholder: "Nº da coleta ou CT-e", obrigatorio: true };
  }

  const ref = campo?.id === "ref-correios" ? normalizarCodigoCorreios(referencia) : referencia.trim();
  const erroSro = campo?.id === "ref-correios" && ref !== "" ? erroCodigoSro(ref) : null;
  const pode =
    (!usaExecutor || execEscolhido !== null) &&
    (!campo?.obrigatorio || ref !== "") &&
    erroSro === null &&
    (!houveTroca || motivoTroca.trim() !== "") &&
    !salvandoTroca && !despachando && !bloqueado && !execQ.isLoading && !(ehCorreios && docsQ.isLoading);

  return (
    <div className="space-y-4">
      <div className="space-y-1.5">
        <Label htmlFor="mesa-sp-modal">Modal</Label>
        <Select value={modalCodigo} onValueChange={(v) => { setEscolhido(v); setErroTroca(null); }} disabled={bloqueado}>
          <SelectTrigger id="mesa-sp-modal"><SelectValue placeholder="Escolher" /></SelectTrigger>
          <SelectContent>
            {opcoesModal.map((m) => <SelectItem key={m.codigo} value={m.codigo}>{m.nome}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      {houveTroca && (
        <div className="space-y-1.5">
          <Label htmlFor="mesa-sp-troca-motivo">
            Motivo da troca <span className="text-destructive" aria-hidden="true">*</span>
          </Label>
          <Textarea id="mesa-sp-troca-motivo" rows={2} value={motivoTroca} onChange={(e) => setMotivoTroca(e.target.value)} placeholder="Explique por que o modal mudou" />
          {erroTroca && <p className="whitespace-pre-wrap text-xs text-destructive">{erroTroca}</p>}
        </div>
      )}

      {usaExecutor && (
        <div className="space-y-1.5">
          <Label htmlFor="mesa-sp-executor">Quem entrega</Label>
          <Select value={executor} onValueChange={setExecutor}>
            <SelectTrigger id="mesa-sp-executor">
              <SelectValue placeholder="Escolher" />
            </SelectTrigger>
            <SelectContent>
              {executores.map((e) => (
                <SelectItem key={e.codigo} value={e.codigo}>{e.nome}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}

      {ehCorreios && codigoRegistrado && (
        <p className="text-xs text-muted-foreground">
          Código já no pedido: <span className="font-mono">{codigoRegistrado}</span>. Bipe o comprovante — se for diferente, o bipado substitui.
        </p>
      )}

      {campo && (
        <div className="space-y-1.5">
          <Label htmlFor={`mesa-sp-${campo.id}`}>
            {campo.rotulo}
            {campo.obrigatorio && <span className="ml-0.5 text-destructive" aria-hidden="true">*</span>}
          </Label>
          <Input
            id={`mesa-sp-${campo.id}`}
            className={campo.id === "ref-correios" ? "font-mono uppercase" : undefined}
            value={referencia}
            onChange={(e) => setReferencia(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && pode) {
                e.preventDefault();
                void despachar(ref || null, execEscolhido?.codigo ?? null);
              }
            }}
            placeholder={campo.placeholder}
            autoFocus={campo.id === "ref-correios"}
          />
          {erroSro && <p className="text-xs text-destructive">{erroSro}</p>}
        </div>
      )}

      {execQ.error && <p className="text-xs text-destructive">{formatError(execQ.error)}</p>}
      {docsQ.error && <p className="text-xs text-destructive">{formatError(docsQ.error)}</p>}

      <DialogFooter className="gap-2">
        {onCancelar && (
          <Button type="button" variant="outline" onClick={onCancelar}>
            Cancelar
          </Button>
        )}
        <BotaoGuardado
          slug="acao.expedicao_sp_operar"
          rotuloAcao="Despachar pedido"
          onClick={() => void despachar(ref || null, execEscolhido?.codigo ?? null)}
          disabled={!pode}
        >
          {despachando || salvandoTroca ? <Loader2 className="animate-spin" aria-hidden="true" /> : <Truck aria-hidden="true" />}
          {modal?.sem_despacho ? "Registrar retirada" : "Despachar"}
        </BotaoGuardado>
      </DialogFooter>
    </div>
  );
}
