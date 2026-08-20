import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { AlertTriangle, Loader2, Paperclip } from "lucide-react";
import { toast } from "sonner";
import { formatBRL, formatDateBR } from "@/lib/format-currency";
import {
  useComprovantesPedido,
  useConfirmarComprovante,
  useEnviarComprovante,
  type ComprovantePagamento,
} from "@/hooks/comercial/useComprovantePagamento";

const ACEITOS = "image/jpeg,image/png,image/webp,application/pdf";
const TIPOS = ["pix", "cartao", "boleto", "ted", "indefinido"] as const;

interface Props {
  pedidoId: string;
  valorPortao?: number | null;
  tipoPortao?: string | null;
  podeConfirmar: boolean;
  /** Modo prova: SOPS/outras áreas só conferem o comprovante, sem anexar nem confirmar. */
  somenteLeitura?: boolean;
}

async function abrirArquivo(storagePath: string) {
  // FAIL-LOUD: bucket privado, URL assinada curta. Sem isso o operador só vê metadados.
  const { data, error } = await supabase.storage
    .from("comprovantes-pagamento")
    .createSignedUrl(storagePath, 60);
  if (error) {
    toast.error(error.message);
    return;
  }
  if (data?.signedUrl) window.open(data.signedUrl, "_blank", "noopener");
}

function BotaoVerArquivo({ storagePath }: { storagePath: string }) {
  const [carregando, setCarregando] = useState(false);
  return (
    <button
      type="button"
      className="text-primary underline-offset-2 hover:underline disabled:opacity-50"
      disabled={carregando}
      onClick={async () => {
        setCarregando(true);
        try {
          await abrirArquivo(storagePath);
        } finally {
          setCarregando(false);
        }
      }}
    >
      Ver arquivo
    </button>
  );
}


function BadgeConfianca({ confianca }: { confianca: string | null }) {
  const c = (confianca ?? "baixa").toLowerCase();
  const rotulo = c === "media" ? "média" : c;
  return (
    <Badge variant={c === "baixa" ? "destructive" : c === "media" ? "secondary" : "outline"}>
      IA: {rotulo}
    </Badge>
  );
}

function CardComprovanteLido({
  comprovante,
  valorPortao,
  podeConfirmar,
  pedidoId,
}: {
  comprovante: ComprovantePagamento;
  valorPortao: number;
  podeConfirmar: boolean;
  pedidoId: string;
}) {
  const [tipo, setTipo] = useState(comprovante.tipo_lido ?? "indefinido");
  const [chave, setChave] = useState(comprovante.chave_lida ?? "");
  const [valor, setValor] = useState(String(comprovante.valor_lido ?? ""));
  const [data, setData] = useState(comprovante.data_lida ?? "");
  const [justificativa, setJustificativa] = useState(comprovante.divergencia_justificativa ?? "");

  const confirmar = useConfirmarComprovante(pedidoId);

  const valorNum = Number(String(valor).replace(",", ".")) || 0;
  const diferenca = valorNum - valorPortao;
  const temDivergencia = Math.abs(diferenca) > 0.01;
  const saida = (comprovante.sentido ?? "").toLowerCase() === "saida";
  const ehCartao = tipo.toLowerCase() === "cartao";
  const semChave = chave.trim().length === 0;
  const semJustificativa = temDivergencia && justificativa.trim().length === 0;

  const bloqueado = saida || ehCartao || semChave || semJustificativa || !data || valorNum <= 0;

  return (
    <div className="rounded-md border p-3 space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm font-medium">Comprovante lido — revise antes de confirmar</p>
        <div className="flex items-center gap-2">
          {saida && <Badge variant="destructive">Saída</Badge>}
          <BadgeConfianca confianca={comprovante.confianca_ia} />
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1">
          <Label className="text-xs">Tipo</Label>
          <Select value={tipo} onValueChange={setTipo}>
            <SelectTrigger className="h-9">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {TIPOS.map((t) => (
                <SelectItem key={t} value={t}>
                  {t}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Chave / E2E / NSU</Label>
          <Input value={chave} onChange={(e) => setChave(e.target.value)} className="h-9" />
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Valor</Label>
          <Input
            inputMode="decimal"
            value={valor}
            onChange={(e) => setValor(e.target.value)}
            className="h-9"
          />
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Data</Label>
          <Input
            type="date"
            value={data}
            onChange={(e) => setData(e.target.value)}
            className="h-9"
          />
        </div>
      </div>

      {(comprovante.pagador_lido || comprovante.beneficiario_cnpj_lido) && (
        <p className="text-xs text-muted-foreground">
          {comprovante.pagador_lido ? `Pagador: ${comprovante.pagador_lido}. ` : ""}
          {comprovante.beneficiario_cnpj_lido
            ? `Beneficiário: ${comprovante.beneficiario_cnpj_lido}.`
            : ""}
        </p>
      )}

      {saida && (
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertDescription>
            Este comprovante é de dinheiro SAINDO da Fetely. Não serve como prova de recebimento.
          </AlertDescription>
        </Alert>
      )}

      {ehCartao && (
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertDescription>Cartão fecha pela captura com NSU, não por aqui.</AlertDescription>
        </Alert>
      )}

      {semChave && (
        <Alert>
          <AlertTriangle className="h-4 w-4" />
          <AlertDescription>Sem a chave o extrato nunca vai casar.</AlertDescription>
        </Alert>
      )}

      {temDivergencia && (
        <div className="space-y-2">
          <div className="rounded-md border border-warning bg-warning/10 px-3 py-2 text-sm">
            Diferença em relação ao portão:{" "}
            <span className="font-semibold">{formatBRL(diferenca)}</span> (portão{" "}
            {formatBRL(valorPortao)} × comprovante {formatBRL(valorNum)})
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Justificativa da diferença</Label>
            <Textarea
              value={justificativa}
              onChange={(e) => setJustificativa(e.target.value)}
              rows={2}
              placeholder="Explique por que o valor do comprovante não bate com o portão."
            />
          </div>
        </div>
      )}

      <Button
        className="w-full"
        disabled={bloqueado || !podeConfirmar || confirmar.isPending}
        title={
          !podeConfirmar
            ? "Você não tem permissão para confirmar pagamento declarado."
            : saida
              ? "Comprovante de saída não prova recebimento."
              : ehCartao
                ? "Cartão fecha pela captura com NSU."
                : semChave
                  ? "Sem a chave o extrato nunca vai casar."
                  : semJustificativa
                    ? "Preencha a justificativa da diferença."
                    : undefined
        }
        onClick={() =>
          confirmar.mutate({
            comprovante_id: comprovante.id,
            tipo,
            chave: chave.trim(),
            valor: valorNum,
            data,
            justificativa: temDivergencia ? justificativa.trim() : null,
          })
        }
      >
        {confirmar.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
        Confirmar pagamento com este comprovante
      </Button>
    </div>
  );
}

export function ComprovantePagamentoBloco({
  pedidoId,
  valorPortao,
  tipoPortao,
  podeConfirmar,
  somenteLeitura = false,
}: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const lista = useComprovantesPedido(pedidoId, !!pedidoId);
  const enviar = useEnviarComprovante(pedidoId);
  const [arquivoNome, setArquivoNome] = useState<string | null>(null);

  useEffect(() => {
    if (!enviar.isPending) setArquivoNome(null);
  }, [enviar.isPending]);

  const comprovantes = lista.data ?? [];
  const lidos = comprovantes.filter((c) => c.status === "lido");
  const confirmados = comprovantes.filter((c) => c.status === "confirmado");
  // Em modo prova, os 'lido' entram na mesma lista, só marcados como pendentes.
  const linhas = somenteLeitura ? [...confirmados, ...lidos] : confirmados;

  const idsConfirmadores = useMemo(
    () => Array.from(new Set(confirmados.map((c) => c.confirmado_por).filter(Boolean) as string[])),
    [confirmados],
  );

  const nomes = useQuery({
    queryKey: ["comprovante-confirmadores", idsConfirmadores],
    enabled: idsConfirmadores.length > 0,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("profiles")
        .select("user_id, full_name")
        .in("user_id", idsConfirmadores);
      if (error) throw error;
      const mapa: Record<string, string> = {};
      for (const p of data ?? []) mapa[p.user_id as string] = (p.full_name as string) ?? "";
      return mapa;
    },
  });

  // Sem prova nenhuma o bloco de leitura não existe — evita seção morta.
  if (somenteLeitura && comprovantes.length === 0) return null;

  return (
    <div className="space-y-3">
      {!somenteLeitura && (
        <div className="flex flex-wrap items-center gap-2">
          <input
            ref={inputRef}
            type="file"
            accept={ACEITOS}
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              e.target.value = "";
              if (!file) return;
              setArquivoNome(file.name);
              enviar.mutate(file);
            }}
          />
          <Button
            variant="outline"
            className="gap-1.5"
            disabled={enviar.isPending}
            onClick={() => inputRef.current?.click()}
          >
            {enviar.isPending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Paperclip className="h-4 w-4" />
            )}
            {enviar.isPending ? "Lendo comprovante…" : "Anexar comprovante"}
          </Button>
          {enviar.isPending && arquivoNome && (
            <span className="text-xs text-muted-foreground">{arquivoNome}</span>
          )}
        </div>
      )}

      {!somenteLeitura && (tipoPortao ?? "").toLowerCase() === "cartao" && (
        <Alert>
          <AlertTriangle className="h-4 w-4" />
          <AlertDescription>Cartão fecha pela captura com NSU, não por aqui.</AlertDescription>
        </Alert>
      )}

      {!somenteLeitura && lista.isLoading && (
        <p className="text-xs text-muted-foreground">Carregando comprovantes…</p>
      )}

      {!somenteLeitura &&
        lidos.map((c) => (
          <CardComprovanteLido
            key={c.id}
            comprovante={c}
            pedidoId={pedidoId}
            valorPortao={Number(valorPortao ?? 0)}
            podeConfirmar={podeConfirmar}
          />
        ))}

      {linhas.length > 0 && (
        <div className="rounded-md border divide-y">
          {linhas.map((c) => (
            <div key={c.id} className="px-3 py-2 text-xs flex flex-wrap gap-x-3 gap-y-1">
              <span className="text-muted-foreground">{formatDateBR(c.data_lida)}</span>
              <span className="font-medium">{c.tipo_lido ?? "—"}</span>
              <span className="font-mono truncate max-w-[220px]">{c.chave_lida || "—"}</span>
              <span className="font-medium">{formatBRL(Number(c.valor_lido ?? 0))}</span>
              {c.status === "confirmado" ? (
                <span className="text-muted-foreground">
                  confirmado por{" "}
                  {(c.confirmado_por && nomes.data?.[c.confirmado_por]) || "usuário do sistema"}
                </span>
              ) : (
                <Badge variant="secondary">aguardando conferência</Badge>
              )}
              <BotaoVerArquivo storagePath={c.storage_path} />
            </div>
          ))}
        </div>
      )}
    </div>

  );
}
