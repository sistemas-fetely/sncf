import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Loader2,
  Sparkles,
  Trash2,
  ExternalLink,
  Link as LinkIcon,
  FileText,
} from "lucide-react";
import { formatBRL, formatDateBR } from "@/lib/format-currency";
import {
  STATUS_LABEL,
  TIPO_DOC_LABEL,
  statusBadgeClass,
  tipoBadgeClass,
} from "@/lib/repositorio/hash";
import type { DocumentoRepositorio } from "@/pages/administrativo/Repositorio";

interface Props {
  doc: DocumentoRepositorio | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onRotearBoleto: (doc: DocumentoRepositorio) => void;
  onVincular: (doc: DocumentoRepositorio) => void;
}

export function DetalheDocumentoDrawer({
  doc,
  open,
  onOpenChange,
  onRotearBoleto,
  onVincular,
}: Props) {
  const qc = useQueryClient();
  const [signedUrl, setSignedUrl] = useState<string | null>(null);
  const [reclassConfirm, setReclassConfirm] = useState(false);
  const [descartarConfirm, setDescartarConfirm] = useState(false);
  const [acaoLoading, setAcaoLoading] = useState(false);

  const { data: vinculos = [] } = useQuery({
    queryKey: ["ged-vinculos", doc?.id],
    enabled: !!doc?.id && open,
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("ged_documento_vinculos")
        .select("id, entidade_tipo, entidade_id, observacao, created_at")
        .eq("documento_id", doc!.id);
      if (error) throw error;
      return (data ?? []) as any[];
    },
  });

  useEffect(() => {
    setSignedUrl(null);
    if (!open || !doc?.storage_path) return;
    (async () => {
      const { data } = await supabase.storage
        .from("ged")
        .createSignedUrl(doc.storage_path, 60 * 10);
      if (data?.signedUrl) setSignedUrl(data.signedUrl);
    })();
  }, [open, doc?.storage_path]);

  async function reclassificar() {
    if (!doc) return;
    setAcaoLoading(true);
    try {
      // baixa arquivo e reenvia pra IA
      const { data: blob, error } = await supabase.storage
        .from("ged")
        .download(doc.storage_path);
      if (error) throw error;
      const fd = new FormData();
      fd.append("file", blob, doc.arquivo_original);
      const { data: iaRes, error: iaErr } = await supabase.functions.invoke(
        "classificar-documento-ged",
        { body: fd },
      );
      if (iaErr || !iaRes) throw iaErr ?? new Error("Sem resposta IA");

      const { error: classErr } = await supabase.rpc("marcar_documento_classificado", {
        p_ged_documento_id: doc.id,
        p_resultado_ia: iaRes as never,
      });
      if (classErr) throw classErr;
      toast.success("Documento reclassificado");
      qc.invalidateQueries({ queryKey: ["repositorio-documentos"] });
      qc.invalidateQueries({ queryKey: ["repositorio-kpis"] });
    } catch (e) {
      toast.error("Erro: " + (e instanceof Error ? e.message : String(e)), {
        duration: 15000,
      });
    } finally {
      setAcaoLoading(false);
      setReclassConfirm(false);
    }
  }

  async function descartar() {
    if (!doc) return;
    setAcaoLoading(true);
    try {
      const { error } = await (supabase as any)
        .from("ged_documentos")
        .update({ status_classificacao: "descartada" })
        .eq("id", doc.id);
      if (error) throw error;
      toast.success("Documento descartado");
      qc.invalidateQueries({ queryKey: ["repositorio-documentos"] });
      qc.invalidateQueries({ queryKey: ["repositorio-kpis"] });
      onOpenChange(false);
    } catch (e) {
      toast.error("Erro: " + (e instanceof Error ? e.message : String(e)), {
        duration: 15000,
      });
    } finally {
      setAcaoLoading(false);
      setDescartarConfirm(false);
    }
  }

  if (!doc) return null;

  const pontos = (doc.classificacao_ia as any)?.pontos_principais as string[] | undefined;

  return (
    <>
      <Sheet open={open} onOpenChange={onOpenChange}>
        <SheetContent side="right" className="w-full sm:max-w-2xl flex flex-col overflow-hidden">
          <SheetHeader>
            <SheetTitle className="pr-8 break-words">{doc.nome}</SheetTitle>
            <div className="flex items-center gap-2 flex-wrap">
              <Badge variant="outline" className={tipoBadgeClass(doc.tipo_documento)}>
                {TIPO_DOC_LABEL[doc.tipo_documento] ?? doc.tipo_documento}
              </Badge>
              <Badge variant="outline" className={statusBadgeClass(doc.status_classificacao)}>
                {STATUS_LABEL[doc.status_classificacao] ?? doc.status_classificacao}
              </Badge>
              {doc.confianca_ia && (
                <Badge variant="outline" className="capitalize">
                  Confiança {doc.confianca_ia}
                </Badge>
              )}
            </div>
          </SheetHeader>

          <div className="flex-1 overflow-y-auto mt-4 space-y-4">
            {/* Preview */}
            <div className="rounded border bg-muted/30 h-64 flex items-center justify-center overflow-hidden">
              {signedUrl ? (
                doc.mime_type?.startsWith("image/") ? (
                  <img src={signedUrl} alt={doc.nome} className="max-h-full object-contain" />
                ) : doc.mime_type?.includes("pdf") ? (
                  <iframe src={signedUrl} title={doc.nome} className="w-full h-full" />
                ) : (
                  <a
                    href={signedUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="text-sm flex items-center gap-2 text-primary"
                  >
                    <ExternalLink className="h-4 w-4" /> Abrir arquivo
                  </a>
                )
              ) : (
                <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
              )}
            </div>

            {/* Resumo IA */}
            {doc.resumo_ia && (
              <div>
                <h4 className="text-xs uppercase tracking-wide text-muted-foreground font-semibold mb-1">
                  Resumo IA
                </h4>
                <p className="text-sm">{doc.resumo_ia}</p>
              </div>
            )}

            {/* Pontos */}
            {pontos && pontos.length > 0 && (
              <div>
                <h4 className="text-xs uppercase tracking-wide text-muted-foreground font-semibold mb-1">
                  Pontos principais
                </h4>
                <ul className="text-sm space-y-1 list-disc list-inside">
                  {pontos.map((p, i) => (
                    <li key={i}>{p}</li>
                  ))}
                </ul>
              </div>
            )}

            {/* Metadados */}
            <div className="grid grid-cols-2 gap-3 text-sm">
              <Metadado label="Parceiro" valor={doc.parceiro_nome} />
              <Metadado label="CNPJ" valor={(doc.classificacao_ia as any)?.parceiro_cnpj} />
              <Metadado
                label="Valor"
                valor={doc.valor != null ? formatBRL(doc.valor) : null}
              />
              <Metadado label="Vencimento" valor={formatDateBR(doc.vencimento)} />
              <Metadado label="Emissão" valor={formatDateBR(doc.data_emissao)} />
              <Metadado label="Nº documento" valor={doc.numero_documento} />
            </div>

            {/* Tags */}
            {doc.tags && doc.tags.length > 0 && (
              <div>
                <h4 className="text-xs uppercase tracking-wide text-muted-foreground font-semibold mb-1">
                  Tags
                </h4>
                <div className="flex flex-wrap gap-1">
                  {doc.tags.map((t) => (
                    <Badge key={t} variant="secondary" className="text-xs">
                      {t}
                    </Badge>
                  ))}
                </div>
              </div>
            )}

            {/* Vínculos */}
            <div>
              <h4 className="text-xs uppercase tracking-wide text-muted-foreground font-semibold mb-1">
                Vínculos
              </h4>
              {vinculos.length === 0 ? (
                <p className="text-xs text-muted-foreground">Sem vínculos ainda</p>
              ) : (
                <ul className="space-y-1">
                  {vinculos.map((v) => (
                    <li key={v.id} className="text-sm flex items-center gap-2">
                      <LinkIcon className="h-3 w-3 text-muted-foreground" />
                      <span className="capitalize">{v.entidade_tipo}</span>
                      <span className="text-muted-foreground text-xs">{v.entidade_id}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>

          <div className="border-t pt-3 flex flex-wrap gap-2">
            {doc.tipo_documento === "boleto" && doc.status_classificacao === "classificada" && (
              <Button
                onClick={() => onRotearBoleto(doc)}
                className="bg-[#1A4A3A] hover:bg-[#1A4A3A]/90"
              >
                Rotear como Boleto
              </Button>
            )}
            <Button variant="outline" onClick={() => onVincular(doc)}>
              <LinkIcon className="h-4 w-4 mr-2" /> Vincular
            </Button>
            <Button
              variant="ghost"
              onClick={() => setReclassConfirm(true)}
              disabled={acaoLoading}
            >
              <Sparkles className="h-4 w-4 mr-2" /> Reclassificar
            </Button>
            <Button
              variant="ghost"
              className="text-destructive"
              onClick={() => setDescartarConfirm(true)}
              disabled={acaoLoading}
            >
              <Trash2 className="h-4 w-4 mr-2" /> Descartar
            </Button>
          </div>
        </SheetContent>
      </Sheet>

      <AlertDialog open={reclassConfirm} onOpenChange={setReclassConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Reclassificar documento?</AlertDialogTitle>
            <AlertDialogDescription>
              Vamos consumir tokens de IA novamente. Use só se a classificação atual estiver errada.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={acaoLoading}>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={reclassificar} disabled={acaoLoading}>
              {acaoLoading && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Reclassificar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={descartarConfirm} onOpenChange={setDescartarConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Descartar documento?</AlertDialogTitle>
            <AlertDialogDescription>
              O documento fica marcado como descartado e some dos filtros padrão. Não apaga o arquivo.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={acaoLoading}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={descartar}
              disabled={acaoLoading}
              className="bg-destructive hover:bg-destructive/90"
            >
              {acaoLoading && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Descartar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

function Metadado({ label, valor }: { label: string; valor: string | null | undefined }) {
  return (
    <div>
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="text-sm font-medium">{valor || "—"}</p>
    </div>
  );
}
