import { useState, useEffect } from "react";
import { useForm, useFieldArray } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";
import {
  Plus,
  Trash2,
  FileUp,
  Loader2,
  AlertTriangle,
  FileText,
  Info,
  Paperclip,
} from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { useParametros } from "@/hooks/useParametros";
import * as pdfjsLib from "pdfjs-dist";
// Vite bundla o worker como asset local — não depende de CDN
import pdfWorkerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url";

if (typeof window !== "undefined") {
  pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorkerUrl;
}

// ─── Tipos IA ────────────────────────────────────────────────
interface DadosIA {
  objeto?: string;
  fornecedor_cnpj?: string;
  fornecedor_razao_social?: string;
  tipo_contrato?: string;
  valor_parcela?: number | null;
  valor_total?: number | null;
  total_parcelas?: number | null;
  data_inicio?: string | null;
  data_fim?: string | null;
  dia_vencimento?: number | null;
  area?: string;
  fases?: Array<{
    nome: string;
    tipo: string;
    valor: number;
    data_inicio?: string;
    data_fim?: string;
    dia_vencimento?: number;
  }>;
  clausulas_principais?: string[];
  resumo?: string;
  confianca?: string;
}

// ─── Schema ──────────────────────────────────────────────────
const faseSchema = z.object({
  nome: z.string().min(1, "Nome obrigatório"),
  tipo: z.enum(["unico", "recorrente_com_fim", "recorrente_sem_fim"]),
  valor: z.coerce.number().min(0),
  data_inicio: z.string().min(1, "Data obrigatória"),
  data_fim: z.string().optional(),
  dia_vencimento: z.coerce.number().min(1).max(28).default(1),
});

const schema = z.object({
  numero: z.string().min(1, "Número obrigatório"),
  objeto: z.string().min(1, "Objeto obrigatório"),
  parceiro_id: z.string().optional(),
  area: z.string().min(1, "Área obrigatória"),
  data_inicio: z.string().min(1, "Data obrigatória"),
  data_fim: z.string().optional(),
  renova_automaticamente: z.boolean().default(false),
  fases: z.array(faseSchema).min(1, "Adicione ao menos uma fase"),
});

type FormData = z.infer<typeof schema>;

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onSalvo: () => void;
  iniciarComUpload?: boolean;
}

// ─── Painel IA ───────────────────────────────────────────────
function PainelIA({ dados, parceiroCadastrado }: { dados: DadosIA; parceiroCadastrado: boolean }) {
  const temAlerta = dados.clausulas_principais && dados.clausulas_principais.length > 0;

  return (
    <div className="space-y-4 p-4 rounded-lg border bg-muted/30">
      {/* Resumo */}
      {dados.resumo && (
        <div className="space-y-2">
          <div className="flex items-center gap-2 text-sm font-semibold">
            <Info className="h-4 w-4 text-primary" />
            Resumo do contrato
          </div>
          <p className="text-sm text-muted-foreground leading-relaxed">{dados.resumo}</p>
        </div>
      )}

      <Separator />

      {/* Campos identificados */}
      <div className="space-y-3">
        <h4 className="text-sm font-semibold">Identificado no PDF</h4>
        <div className="grid grid-cols-2 gap-3 text-sm">
          <div className="space-y-1">
            <span className="text-xs text-muted-foreground">Fornecedor</span>
            <div className="font-medium flex flex-col gap-1">
              <span>
                {dados.fornecedor_razao_social
                  ? dados.fornecedor_razao_social.split("–")[0].trim().split("-")[0].trim()
                  : "—"}
              </span>
              {!parceiroCadastrado && dados.fornecedor_razao_social && (
                <Badge variant="outline" className="w-fit text-xs">não cadastrado</Badge>
              )}
            </div>
          </div>

          <div className="space-y-1">
            <span className="text-xs text-muted-foreground">Tipo</span>
            <div className="font-medium">
              {dados.tipo_contrato === "parcelado" ? "Parcelado" :
               dados.tipo_contrato === "recorrente_com_fim" ? "Recorrente c/ fim" :
               dados.tipo_contrato === "recorrente_sem_fim" ? "Recorrente s/ fim" :
               dados.tipo_contrato === "unico" ? "Único" : "—"}
            </div>
          </div>

          <div className="space-y-1">
            <span className="text-xs text-muted-foreground">Valor parcela</span>
            <div className="font-medium">
              {dados.valor_parcela
                ? `R$ ${dados.valor_parcela.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}`
                : <Badge variant="outline" className="text-xs">não encontrado no PDF</Badge>}
            </div>
          </div>

          {dados.total_parcelas && (
            <div className="space-y-1">
              <span className="text-xs text-muted-foreground">Parcelas</span>
              <div className="font-medium">{dados.total_parcelas}x</div>
            </div>
          )}

          <div className="space-y-1">
            <span className="text-xs text-muted-foreground">Início</span>
            <div className="font-medium">
              {dados.data_inicio
                ? new Date(dados.data_inicio + "T12:00:00").toLocaleDateString("pt-BR")
                : "—"}
            </div>
          </div>

          {dados.data_fim && (
            <div className="space-y-1">
              <span className="text-xs text-muted-foreground">Fim</span>
              <div className="font-medium">
                {new Date(dados.data_fim + "T12:00:00").toLocaleDateString("pt-BR")}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Pontos de atenção */}
      {temAlerta && dados.clausulas_principais && (
        <>
          <Separator />
          <div className="space-y-2">
            <div className="flex items-center gap-2 text-sm font-semibold">
              <AlertTriangle className="h-4 w-4 text-warning" />
              Pontos de atenção
            </div>
            <ul className="space-y-1.5">
              {dados.clausulas_principais.map((c, i) => (
                <li key={i} className="text-sm text-muted-foreground flex gap-2">
                  <span className="text-warning">•</span>
                  <span>{c}</span>
                </li>
              ))}
            </ul>
          </div>
        </>
      )}

      <Separator />

      {/* Documentos sugeridos */}
      <div className="space-y-2">
        <div className="flex items-center gap-2 text-sm font-semibold">
          <Paperclip className="h-4 w-4 text-primary" />
          Documentos relacionados
        </div>
        <p className="text-xs text-muted-foreground">
          Anexe após salvar: contrato assinado, orçamento, manual do expositor e demais documentos vinculados.
        </p>
      </div>

      <div className="pt-2 text-xs text-muted-foreground border-t">
        {dados.confianca === "alta" ? "✅ Alta confiança" : "⚠️ Baixa confiança"} na extração
      </div>
    </div>
  );
}

// ─── Componente principal ─────────────────────────────────────
export function NovoContratoSheet({ open, onOpenChange, onSalvo, iniciarComUpload }: Props) {
  const [salvando, setSalvando] = useState(false);
  const [extraindo, setExtraindo] = useState(false);
  const [dadosIA, setDadosIA] = useState<DadosIA | null>(null);
  const [parceiroCadastrado, setParceiroCadastrado] = useState(true);
  const [pdfUrl, setPdfUrl] = useState<string | null>(null);
  const [storagePath, setStoragePath] = useState<string | null>(null);
  const [pdfImages, setPdfImages] = useState<string[]>([]);

  useEffect(() => {
    if (open && iniciarComUpload) {
      setTimeout(() => {
        document.getElementById("contrato-pdf-input")?.click();
      }, 200);
    }
    if (!open) {
      setDadosIA(null);
      setPdfUrl(null);
      setStoragePath(null);
      setPdfImages([]);
    }
  }, [open, iniciarComUpload]);

  const { register, control, handleSubmit, watch, setValue, formState: { errors }, reset } =
    useForm<FormData>({
      resolver: zodResolver(schema),
      defaultValues: {
        area: "financeiro",
        renova_automaticamente: false,
        fases: [{
          nome: "Mensalidade",
          tipo: "recorrente_sem_fim",
          valor: 0,
          data_inicio: new Date().toISOString().split("T")[0],
          dia_vencimento: 1,
        }],
      },
    });

  const { fields, append, remove } = useFieldArray({ control, name: "fases" });

  const { data: areas = [] } = useParametros("area_contrato");
  const { data: parceiros = [] } = useQuery({
    queryKey: ["parceiros-select"],
    queryFn: async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data } = await (supabase as any)
        .from("parceiros_comerciais")
        .select("id, razao_social")
        .order("razao_social");
      return data ?? [];
    },
  });

  async function handleUploadPDF(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    setExtraindo(true);
    setDadosIA(null);
    try {
      // 1. Upload para storage
      const path = `${Date.now()}_${file.name.replace(/[^a-zA-Z0-9._-]/g, "_")}`;
      const { error: uploadErr } = await supabase.storage
        .from("contratos")
        .upload(path, file, { contentType: "application/pdf" });
      if (uploadErr) throw new Error("Upload: " + uploadErr.message);
      setStoragePath(path);

      // 2. Signed URL para visualização
      const { data: signedData } = await supabase.storage
        .from("contratos")
        .createSignedUrl(path, 3600);
      if (signedData?.signedUrl) setPdfUrl(signedData.signedUrl);

      // 2.1 Renderiza páginas como imagens (até 5 páginas)
      try {
        console.log("[pdf-render] iniciando, versão pdfjs:", pdfjsLib.version);
        const arrayBuffer = await file.arrayBuffer();
        const loadingTask = pdfjsLib.getDocument({ data: new Uint8Array(arrayBuffer) });
        const pdf = await loadingTask.promise;
        console.log("[pdf-render] pdf carregado, páginas:", pdf.numPages);

        const numPaginas = Math.min(pdf.numPages, 5);
        const imgs: string[] = [];
        for (let i = 1; i <= numPaginas; i++) {
          const page = await pdf.getPage(i);
          const viewport = page.getViewport({ scale: 1.5 });
          const canvas = document.createElement("canvas");
          canvas.width = viewport.width;
          canvas.height = viewport.height;
          const ctx = canvas.getContext("2d");
          if (!ctx) continue;
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          await (page.render({ canvasContext: ctx, viewport } as any) as any).promise;
          imgs.push(canvas.toDataURL("image/jpeg", 0.85));
        }
        console.log("[pdf-render] imagens geradas:", imgs.length);
        setPdfImages(imgs);
      } catch (renderErr) {
        console.error("[pdf-render] ERRO:", renderErr);
        toast.error("Preview do PDF indisponível: " + (renderErr instanceof Error ? renderErr.message : String(renderErr)));
      }

      // 3. Chama IA
      const formData = new FormData();
      formData.append("file", file);

      const res = await supabase.functions.invoke("parse-contrato-pdf", { body: formData });
      if (res.error) throw new Error(res.error.message);

      const dados = res.data as DadosIA;
      console.log("[parse-contrato-pdf] retorno IA:", JSON.stringify(dados, null, 2));
      setDadosIA(dados);

      if (dados.objeto) setValue("objeto", dados.objeto);
      if (dados.area) setValue("area", dados.area);
      if (dados.data_inicio) setValue("data_inicio", dados.data_inicio);
      if (dados.data_fim) setValue("data_fim", dados.data_fim);

      if (dados.fornecedor_cnpj) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { data: parceiro } = await (supabase as any)
          .from("parceiros_comerciais")
          .select("id")
          .eq("cnpj", String(dados.fornecedor_cnpj).replace(/\D/g, ""))
          .maybeSingle();
        if (parceiro?.id) {
          setValue("parceiro_id", parceiro.id);
          setParceiroCadastrado(true);
        } else {
          setParceiroCadastrado(false);
        }
      }

      if (dados.fases && dados.fases.length > 0) {
        setValue("fases", dados.fases.map((f) => ({
          nome: f.nome ?? "Fase",
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          tipo: (f.tipo as any) ?? "recorrente_sem_fim",
          valor: f.valor ?? 0,
          data_inicio: f.data_inicio ?? dados.data_inicio ?? new Date().toISOString().split("T")[0],
          data_fim: f.data_fim ?? "",
          dia_vencimento: f.dia_vencimento ?? dados.dia_vencimento ?? 1,
        })));
      } else {
        setValue("fases", [{
          nome: dados.tipo_contrato === "parcelado" ? "Parcela" : "Mensalidade",
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          tipo: (dados.tipo_contrato as any) ?? "recorrente_sem_fim",
          valor: dados.valor_parcela ?? 0,
          data_inicio: dados.data_inicio ?? new Date().toISOString().split("T")[0],
          data_fim: dados.data_fim ?? "",
          dia_vencimento: dados.dia_vencimento ?? 1,
        }]);
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      toast.error("Erro ao ler PDF: " + msg);
    } finally {
      setExtraindo(false);
      const input = document.getElementById("contrato-pdf-input") as HTMLInputElement | null;
      if (input) input.value = "";
    }
  }

  async function onSubmit(values: FormData) {
    setSalvando(true);
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data: contrato, error: errContrato } = await (supabase as any)
        .from("contratos")
        .insert({
          numero: values.numero,
          objeto: values.objeto,
          parceiro_id: values.parceiro_id || null,
          area: values.area,
          data_inicio: values.data_inicio,
          data_fim: values.data_fim || null,
          renova_automaticamente: values.renova_automaticamente,
          status: "ativo",
          doc_storage_path: storagePath,
          clausulas_extraidas: dadosIA ? { clausulas: dadosIA.clausulas_principais ?? [] } : null,
          resumo_ia: dadosIA?.resumo ?? null,
        })
        .select("id")
        .single();

      if (errContrato) throw errContrato;

      for (let i = 0; i < values.fases.length; i++) {
        const fase = values.fases[i];
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { data: faseData, error: errFase } = await (supabase as any)
          .from("contrato_fases")
          .insert({
            contrato_id: contrato.id,
            nome: fase.nome,
            ordem: i + 1,
            tipo: fase.tipo,
            valor: fase.valor,
            data_inicio: fase.data_inicio,
            data_fim: fase.data_fim || null,
            dia_vencimento: fase.dia_vencimento,
            status: "ativa",
          })
          .select("id")
          .single();

        if (errFase) throw errFase;

        if (fase.tipo === "unico") {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          await (supabase as any).rpc("gerar_parcelas_fase_unica", { p_fase_id: faseData.id });
        }
      }

      toast.success("Contrato cadastrado com sucesso!");
      reset();
      setDadosIA(null);
      onSalvo();
    } catch (e) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const msg = e instanceof Error ? e.message : (e as any)?.message ?? String(e);
      toast.error("Erro ao salvar: " + msg);
    } finally {
      setSalvando(false);
    }
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className={`overflow-y-auto ${dadosIA ? "!max-w-[98vw] sm:!max-w-[98vw]" : "sm:max-w-2xl"}`}>
        <SheetHeader>
          <SheetTitle>Novo Contrato</SheetTitle>
        </SheetHeader>

        <div className={`mt-6 ${dadosIA ? "grid grid-cols-[minmax(480px,1fr)_400px_minmax(450px,1.2fr)] gap-4" : ""}`}>
          {/* Coluna 1: Formulário */}
          <form onSubmit={handleSubmit(onSubmit)} className={`space-y-4 ${dadosIA ? "overflow-y-auto" : ""}`} style={dadosIA ? { maxHeight: "calc(100vh - 150px)" } : undefined}>
            {/* Upload PDF */}
            <div
              className="rounded-lg border-2 border-dashed p-4 text-center cursor-pointer hover:bg-muted/50 transition-colors"
              onClick={() => !extraindo && document.getElementById("contrato-pdf-input")?.click()}
            >
              <input
                id="contrato-pdf-input"
                type="file"
                accept="application/pdf"
                className="hidden"
                onChange={handleUploadPDF}
                disabled={extraindo}
              />
              {extraindo ? (
                <div className="flex items-center justify-center gap-2 text-sm text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Lendo contrato com IA...
                </div>
              ) : (
                <div className="flex items-center justify-center gap-2 text-sm text-muted-foreground">
                  <FileUp className="h-4 w-4" />
                  {dadosIA ? "Subir outro PDF" : "Subir PDF do contrato para preencher automaticamente"}
                </div>
              )}
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label>Número *</Label>
                <Input {...register("numero")} placeholder="CTR-2026-001" />
                {errors.numero && <p className="text-xs text-destructive">{errors.numero.message}</p>}
              </div>
              <div className="space-y-1">
                <Label>Área *</Label>
                <Select defaultValue="financeiro" onValueChange={(v) => setValue("area", v)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {areas.map((a) => (
                      <SelectItem key={a.id} value={a.valor}>{a.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-1">
              <Label>Objeto *</Label>
              <Input {...register("objeto")} placeholder="Descrição do contrato" />
              {errors.objeto && <p className="text-xs text-destructive">{errors.objeto.message}</p>}
            </div>

            <div className="space-y-1">
              <Label>Parceiro</Label>
              <Select value={watch("parceiro_id") ?? ""} onValueChange={(v) => setValue("parceiro_id", v)}>
                <SelectTrigger><SelectValue placeholder="Selecione..." /></SelectTrigger>
                <SelectContent>
                  {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
                  {(parceiros as any[]).map((p) => (
                    <SelectItem key={p.id} value={p.id}>{p.razao_social}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label>Início *</Label>
                <Input type="date" {...register("data_inicio")} />
              </div>
              <div className="space-y-1">
                <Label>Fim (vazio = sem fim)</Label>
                <Input type="date" {...register("data_fim")} />
              </div>
            </div>

            <div className="flex items-center gap-2">
              <Switch onCheckedChange={(v) => setValue("renova_automaticamente", v)} />
              <Label>Renova automaticamente (alerta 60 dias antes)</Label>
            </div>

            <Separator />

            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="font-semibold">Fases do contrato</h3>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => append({ nome: "", tipo: "recorrente_sem_fim", valor: 0, data_inicio: new Date().toISOString().split("T")[0], dia_vencimento: 1 })}
                >
                  <Plus className="h-4 w-4 mr-1" /> Adicionar fase
                </Button>
              </div>

              {fields.map((field, idx) => (
                <div key={field.id} className="rounded-lg border p-3 space-y-3 bg-muted/30">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium">Fase {idx + 1}</span>
                    {fields.length > 1 && (
                      <Button type="button" variant="ghost" size="sm" onClick={() => remove(idx)}>
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    )}
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1">
                      <Label>Nome *</Label>
                      <Input {...register(`fases.${idx}.nome`)} />
                    </div>
                    <div className="space-y-1">
                      <Label>Tipo *</Label>
                      <Select
                        value={watch(`fases.${idx}.tipo`)}
                        onValueChange={(v) => setValue(`fases.${idx}.tipo`, v as "unico" | "recorrente_com_fim" | "recorrente_sem_fim")}
                      >
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="unico">Único (1 pagamento)</SelectItem>
                          <SelectItem value="recorrente_com_fim">Recorrente com fim</SelectItem>
                          <SelectItem value="recorrente_sem_fim">Recorrente sem fim</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>

                  <div className="grid grid-cols-3 gap-3">
                    <div className="space-y-1">
                      <Label>Valor (R$) *</Label>
                      <Input type="number" step="0.01" {...register(`fases.${idx}.valor`)} />
                    </div>
                    <div className="space-y-1">
                      <Label>Início *</Label>
                      <Input type="date" {...register(`fases.${idx}.data_inicio`)} />
                    </div>
                    {watch(`fases.${idx}.tipo`) !== "recorrente_sem_fim" && (
                      <div className="space-y-1">
                        <Label>Fim</Label>
                        <Input type="date" {...register(`fases.${idx}.data_fim`)} />
                      </div>
                    )}
                  </div>

                  {watch(`fases.${idx}.tipo`) !== "unico" && (
                    <div className="space-y-1">
                      <Label>Dia do vencimento</Label>
                      <Input type="number" min={1} max={28} {...register(`fases.${idx}.dia_vencimento`)} />
                    </div>
                  )}
                </div>
              ))}
            </div>

            <div className="flex justify-end gap-2 pt-4">
              <Button type="button" variant="outline" onClick={() => { onOpenChange(false); setDadosIA(null); }}>
                Cancelar
              </Button>
              <Button type="submit" disabled={salvando}>
                {salvando ? "Salvando..." : "Salvar Contrato"}
              </Button>
            </div>
          </form>

          {/* Coluna 2: Painel IA */}
          {dadosIA && (
            <div className="border-l border-r px-4 overflow-y-auto" style={{ maxHeight: "calc(100vh - 150px)" }}>
              <PainelIA dados={dadosIA} parceiroCadastrado={parceiroCadastrado} />
            </div>
          )}

          {/* Coluna 3: Contrato original (imagens) */}
          {dadosIA && (
            <div className="border rounded-lg overflow-hidden bg-muted flex flex-col">
              <div className="bg-background border-b px-3 py-2 text-xs font-medium text-muted-foreground flex items-center justify-between">
                <span>Contrato original</span>
                {pdfUrl && (
                  <a href={pdfUrl} target="_blank" rel="noopener noreferrer" className="text-xs text-primary hover:underline">
                    Abrir completo
                  </a>
                )}
              </div>
              <div className="overflow-y-auto p-2 space-y-2" style={{ maxHeight: "calc(100vh - 200px)" }}>
                {pdfImages.length > 0 ? (
                  pdfImages.map((img, i) => (
                    <img key={i} src={img} alt={`Página ${i + 1}`} className="w-full border rounded shadow-sm" />
                  ))
                ) : (
                  <div className="flex items-center justify-center h-32 text-xs text-muted-foreground">
                    Carregando preview...
                  </div>
                )}
                {pdfImages.length === 5 && pdfUrl && (
                  <div className="text-center py-2">
                    <a href={pdfUrl} target="_blank" rel="noopener noreferrer" className="text-xs text-primary hover:underline">
                      Mostrando 5 primeiras páginas — abrir completo
                    </a>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
