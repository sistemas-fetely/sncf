import { useEffect, useMemo, useState } from "react";
import { Loader2, Truck } from "lucide-react";
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
  onDespachar: (referencia: string | null, executor: string | null) => void;
}

export function FormDespacho({ pedidoId, modalCodigo, modais, despachando, bloqueado = false, onDespachar }: Props) {
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

  useEffect(() => { setExecutor(""); setReferencia(""); }, [pedidoId, modalCodigo]);

  const codigoRegistrado = useMemo(() => {
    const linha = (docsQ.data ?? []).find((d) => d.tipo === "rastreio");
    const det = normalizarCodigoCorreios(linha?.detalhe ?? "");
    return PADRAO_CODIGO_CORREIOS.test(det) ? det : null;
  }, [docsQ.data]);

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
    !despachando && !bloqueado && !execQ.isLoading && !(ehCorreios && docsQ.isLoading);

  return (
    <div className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label>Modal</Label>
          <p className="flex h-10 items-center rounded-md border border-border bg-muted/40 px-3 text-sm font-medium">
            {modal?.nome ?? modalCodigo}
          </p>
        </div>

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
                  onDespachar(ref || null, execEscolhido?.codigo ?? null);
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
        onClick={() => onDespachar(ref || null, execEscolhido?.codigo ?? null)}
        disabled={!pode}
      >
        {despachando ? <Loader2 className="animate-spin" aria-hidden="true" /> : <Truck aria-hidden="true" />}
        {modal?.sem_despacho ? "Registrar retirada" : "Despachar"}
      </BotaoGuardado>
    </div>
  );
}
