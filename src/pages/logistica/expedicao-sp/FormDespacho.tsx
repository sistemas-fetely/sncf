import { useEffect, useMemo, useState } from "react";
import { Loader2, Truck } from "lucide-react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { BotaoGuardado } from "@/components/acesso/BotaoGuardado";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { formatError } from "@/lib/format-error";
import { normalizarCodigoCorreios, PADRAO_CODIGO_CORREIOS, type ModalEntrega } from "./tipos";
import { useDocumentosMesa, useExecutoresMesa } from "./useMesaSp";

/**
 * Despacho individual (B2C e B2B). O modal NÃO se escolhe aqui: é o da
 * embalagem, mostrado fixo. Os campos dependem do modal; quem valida de
 * verdade é `fn_mesa_sp_despachar` — o erro dela sobe como está (FAIL-LOUD).
 *
 * - Modal com executores em `mesa_sp_executor` (Frete Fetely): "Quem entrega";
 *   referência obrigatória se o executor `exige_referencia`.
 * - Correios (`exige_etiqueta_correios`): sem rastreio registrado, pede o
 *   código do comprovante de postagem.
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
  onDespachar: (referencia: string | null, executor: string | null, modal: string) => void;
}

export function FormDespacho({ pedidoId, modalCodigo: modalEmbalagem, modais, despachando, bloqueado = false, clienteNome = null, onDespachar }: Props) {
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
  const modalCodigo = vigenteQ.data ?? modalEmbalagem;
  const [trocando, setTrocando] = useState(false);
  const [novoModal, setNovoModal] = useState("");
  const [motivoTroca, setMotivoTroca] = useState("");
  const [salvandoTroca, setSalvandoTroca] = useState(false);
  const [erroTroca, setErroTroca] = useState<string | null>(null);
  const opcoesTroca = modais.filter((m) => m.ativo && m.codigo !== modalCodigo);

  async function confirmarTroca() {
    setSalvandoTroca(true); setErroTroca(null);
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error } = await (supabase.rpc as any)("fn_mesa_sp_trocar_modal", {
        p_pedido_id: pedidoId, p_modal: novoModal, p_motivo: motivoTroca.trim(),
      });
      if (error) throw new Error(error.message);
      await Promise.all([
        qc.invalidateQueries({ queryKey: ["mesa-sp"] }),
        qc.invalidateQueries({ predicate: (q) => JSON.stringify(q.queryKey).includes(pedidoId) }),
      ]);
      setTrocando(false); setNovoModal(""); setMotivoTroca("");
    } catch (e) {
      setErroTroca(e instanceof Error ? e.message : String(e));
    } finally { setSalvandoTroca(false); }
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
    if (!codigoRegistrado) {
      campo = { id: "ref-correios", rotulo: "Código do comprovante de postagem", placeholder: "AA123456789BR", obrigatorio: true };
    }
  } else if (modal?.sem_despacho) {
    campo = { id: "ref-retirada", rotulo: "Quem retirou (nome / transportadora do cliente)", placeholder: "Obrigatório", obrigatorio: true };
  } else {
    campo = { id: "ref-coleta", rotulo: "Referência da coleta (nº coleta / CT-e)", placeholder: "Obrigatório", obrigatorio: true };
  }

  const ref = campo?.id === "ref-correios" ? normalizarCodigoCorreios(referencia) : referencia.trim();
  const pode =
    (!usaExecutor || execEscolhido !== null) &&
    (!campo?.obrigatorio || ref !== "") &&
    !trocando && !despachando && !bloqueado && !execQ.isLoading && !(ehCorreios && docsQ.isLoading);

  return (
    <div className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <div className="flex items-center justify-between">
            <Label>Modal</Label>
            {!trocando && opcoesTroca.length > 0 && (
              <Button type="button" variant="link" size="sm" className="h-auto p-0" disabled={bloqueado} onClick={() => setTrocando(true)}>
                Trocar
              </Button>
            )}
          </div>
          <p className="flex h-10 items-center rounded-md border border-border bg-muted/40 px-3 text-sm font-medium">
            {modal?.nome ?? modalCodigo}
          </p>
        </div>

        {trocando && (
          <div className="space-y-2 rounded-md border border-border bg-card p-3 sm:col-span-2">
            <Label htmlFor="mesa-sp-troca-modal">Novo modal</Label>
            <Select value={novoModal} onValueChange={setNovoModal}>
              <SelectTrigger id="mesa-sp-troca-modal"><SelectValue placeholder="Escolher" /></SelectTrigger>
              <SelectContent>
                {opcoesTroca.map((m) => <SelectItem key={m.codigo} value={m.codigo}>{m.nome}</SelectItem>)}
              </SelectContent>
            </Select>
            <Label htmlFor="mesa-sp-troca-motivo">Motivo da troca</Label>
            <Textarea id="mesa-sp-troca-motivo" rows={2} value={motivoTroca} onChange={(e) => setMotivoTroca(e.target.value)} placeholder="Obrigatório" />
            {erroTroca && <p className="whitespace-pre-wrap text-xs text-destructive">{erroTroca}</p>}
            <div className="flex gap-2">
              <Button type="button" size="sm" onClick={() => void confirmarTroca()} disabled={!novoModal || !motivoTroca.trim() || salvandoTroca}>
                {salvandoTroca && <Loader2 className="animate-spin" aria-hidden="true" />}Confirmar troca
              </Button>
              <Button type="button" size="sm" variant="ghost" onClick={() => { setTrocando(false); setErroTroca(null); }}>Cancelar</Button>
            </div>
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
          <div className="space-y-1.5">
            <Label>Código de rastreio</Label>
            <p className="flex h-10 items-center font-mono text-sm">{codigoRegistrado}</p>
          </div>
        )}

        {campo && (
          <div className="space-y-1.5">
            <Label htmlFor={`mesa-sp-${campo.id}`}>{campo.rotulo}</Label>
            <Input
              id={`mesa-sp-${campo.id}`}
              className={campo.id === "ref-correios" ? "font-mono uppercase" : undefined}
              value={referencia}
              onChange={(e) => setReferencia(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && pode) {
                  e.preventDefault();
                  onDespachar(ref || null, execEscolhido?.codigo ?? null, modalCodigo);
                }
              }}
              placeholder={campo.placeholder}
              autoFocus={campo.id === "ref-correios"}
            />
          </div>
        )}
      </div>

      {execQ.error && <p className="text-xs text-destructive">{formatError(execQ.error)}</p>}
      {docsQ.error && <p className="text-xs text-destructive">{formatError(docsQ.error)}</p>}

      <BotaoGuardado
        slug="acao.expedicao_sp_operar"
        rotuloAcao="Despachar pedido"
        onClick={() => onDespachar(ref || null, execEscolhido?.codigo ?? null, modalCodigo)}
        disabled={!pode}
      >
        {despachando ? <Loader2 className="animate-spin" aria-hidden="true" /> : <Truck aria-hidden="true" />}
        {modal?.sem_despacho ? "Registrar retirada" : "Despachar"}
      </BotaoGuardado>
    </div>
  );
}
