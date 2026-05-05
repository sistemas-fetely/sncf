import { useState, useEffect } from "react";
import { useForm } from "react-hook-form";
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
import {
  FileUp,
  Loader2,
  AlertTriangle,
  Info,
  Paperclip,
} from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { useParametros } from "@/hooks/useParametros";
import { useFormasPagamento } from "@/hooks/financeiro/useFormasPagamento";
import * as pdfjsLib from "pdfjs-dist";
import pdfWorkerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url";

if (typeof window !== "undefined") {
  pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorkerUrl;
}

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
  clausulas_principais?: string[];
  resumo?: string;
  confianca?: string;
}

const schema = z.object({
  numero: z.string().min(1, "Número obrigatório"),
  objeto: z.string().min(1, "Objeto obrigatório"),
  parceiro_id: z.string().optional(),
  responsavel_id: z.string().optional(),
  area: z.string().min(1, "Área obrigatória"),
  tipo_contrato: z.string().min(1, "Tipo obrigatório"),

  data_assinatura: z.string().optional(),
  data_inicio: z.string().min(1, "Data de início obrigatória"),
  data_fim: z.string().optional(),

  valor_total: z.coerce.number().min(0),
  valor_parcela: z.coerce.number().min(0),
  ciclo_pagamento: z.enum(["unico", "parcelado", "mensal", "trimestral", "anual"]),
  numero_parcelas: z.coerce.number().int().min(1).optional(),
  dia_vencimento: z.coerce.number().int().min(1).max(28).optional(),
  data_primeira_parcela: z.string().min(1, "Data 1ª parcela obrigatória"),
  meio_pagamento_id: z.string().optional(),

  tem_setup: z.boolean().default(false),
  valor_setup: z.coerce.number().min(0).optional(),
  parcelas_setup: z.coerce.number().int().min(1).optional(),
  data_primeira_parcela_setup: z.string().optional(),

  reajuste_indice: z.enum(["nenhum", "igpm", "ipca", "prefixado"]).default("nenhum"),
  reajuste_data: z.string().optional(),

  renova_automaticamente: z.boolean().default(false),
  alerta_renovacao_dias: z.coerce.number().int().min(0).default(60),
});

type FormData = z.infer<typeof schema>;

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onSalvo: () => void;
  iniciarComUpload?: boolean;
}

function PainelIA({ dados, parceiroCadastrado }: { dados: DadosIA; parceiroCadastrado: boolean }) {
  return (
    <div className="space-y-4 text-sm">
      {dados.resumo && (
        <div className="rounded-lg bg-blue-50 border border-blue-200 p-3">
          <div className="flex items-center gap-2 font-medium text-blue-800 mb-1">
            <Info className="h-4 w-4" />
            Resumo do contrato
          </div>
          <p className="text-blue-700 leading-relaxed">{dados.resumo}</p>
        </div>
      )}

      <div className="rounded-lg border p-3 space-y-2">
        <p className="font-medium text-muted-foreground text-xs uppercase tracking-wide">Identificado no PDF</p>
        <div className="space-y-1.5">
          <div className="flex justify-between gap-2">
            <span className="text-muted-foreground">Fornecedor</span>
            <span className={`font-medium text-right max-w-[180px] truncate ${!parceiroCadastrado ? "text-yellow-700" : ""}`}>
              {dados.fornecedor_razao_social
                ? dados.fornecedor_razao_social.split("–")[0].trim().split("-")[0].trim()
                : "—"}
              {!parceiroCadastrado && dados.fornecedor_razao_social && (
                <span className="block text-xs text-yellow-600 font-normal">não cadastrado</span>
              )}
            </span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">Valor parcela</span>
            <span className={`font-medium ${!dados.valor_parcela ? "text-yellow-700" : ""}`}>
              {dados.valor_parcela
                ? `R$ ${dados.valor_parcela.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}`
                : <span className="text-yellow-700 text-xs">não encontrado</span>}
            </span>
          </div>
          {dados.total_parcelas && (
            <div className="flex justify-between">
              <span className="text-muted-foreground">Parcelas</span>
              <span className="font-medium">{dados.total_parcelas}x</span>
            </div>
          )}
          <div className="flex justify-between">
            <span className="text-muted-foreground">Início</span>
            <span className="font-medium">
              {dados.data_inicio ? new Date(dados.data_inicio + "T12:00:00").toLocaleDateString("pt-BR") : "—"}
            </span>
          </div>
        </div>
      </div>

      {dados.clausulas_principais && dados.clausulas_principais.length > 0 && (
        <div className="rounded-lg bg-yellow-50 border border-yellow-200 p-3 space-y-2">
          <div className="flex items-center gap-2 font-medium text-yellow-800">
            <AlertTriangle className="h-4 w-4" />
            Pontos de atenção
          </div>
          <ul className="space-y-1.5">
            {dados.clausulas_principais.map((c, i) => (
              <li key={i} className="text-yellow-700 text-xs leading-relaxed flex gap-1.5">
                <span className="mt-0.5 shrink-0">•</span>
                <span>{c}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="rounded-lg border p-3 space-y-2">
        <div className="flex items-center gap-2 font-medium text-muted-foreground">
          <Paperclip className="h-4 w-4" />
          Documentos relacionados
        </div>
        <p className="text-xs text-muted-foreground">
          Anexe após salvar: contrato assinado, orçamento, anexos vinculados.
        </p>
      </div>
    </div>
  );
}

export function NovoContratoSheet({ open, onOpenChange, onSalvo, iniciarComUpload }: Props) {
  const [salvando, setSalvando] = useState(false);
  const [extraindo, setExtraindo] = useState(false);
  const [dadosIA, setDadosIA] = useState<DadosIA | null>(null);
  const [parceiroCadastrado, setParceiroCadastrado] = useState(true);
  const [pdfUrl, setPdfUrl] = useState<string | null>(null);
  const [storagePath, setStoragePath] = useState<string | null>(null);
  const [pdfImages, setPdfImages] = useState<string[]>([]);

  const { register, handleSubmit, watch, setValue, formState: { errors }, reset } =
    useForm<FormData>({
      resolver: zodResolver(schema),
      defaultValues: {
        area: "financeiro",
        tipo_contrato: "servico",
        ciclo_pagamento: "mensal",
        reajuste_indice: "nenhum",
        renova_automaticamente: false,
        alerta_renovacao_dias: 60,
        tem_setup: false,
        valor_total: 0,
        valor_parcela: 0,
        dia_vencimento: 1,
        data_inicio: new Date().toISOString().split("T")[0],
        data_primeira_parcela: new Date().toISOString().split("T")[0],
      },
    });

  const ciclo = watch("ciclo_pagamento");
  const temSetup = watch("tem_setup");
  const valorTotal = watch("valor_total");
  const numParcelas = watch("numero_parcelas");
  const reajusteIndice = watch("reajuste_indice");
  const renovaAutomaticamente = watch("renova_automaticamente");

  const { data: areas = [] } = useParametros("area_contrato");
  const { data: tiposContrato = [] } = useParametros("tipo_contrato");
  const { data: formasPagamento = [] } = useFormasPagamento();

  const { data: parceiros = [] } = useQuery({
    queryKey: ["parceiros-select"],
    queryFn: async () => {
      const { data } = await (supabase as any)
        .from("parceiros_comerciais")
        .select("id, razao_social")
        .order("razao_social");
      return data ?? [];
    },
  });

  useEffect(() => {
    if (open && iniciarComUpload) {
      setTimeout(() => document.getElementById("contrato-pdf-input")?.click(), 200);
    }
    if (!open) {
      setDadosIA(null);
      setPdfUrl(null);
      setStoragePath(null);
      setPdfImages([]);
    }
  }, [open, iniciarComUpload]);

  useEffect(() => {
    if (ciclo === "parcelado" && valorTotal > 0 && numParcelas && numParcelas > 0) {
      setValue("valor_parcela", Number((valorTotal / numParcelas).toFixed(2)));
    } else if (ciclo === "unico") {
      setValue("valor_parcela", valorTotal || 0);
      setValue("numero_parcelas", 1);
    }
  }, [ciclo, valorTotal, numParcelas, setValue]);

  async function handleUploadPDF(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    setExtraindo(true);
    setDadosIA(null);
    try {
      const path = `${Date.now()}_${file.name.replace(/[^a-zA-Z0-9._-]/g, "_")}`;
      const { error: uploadErr } = await supabase.storage
        .from("contratos")
        .upload(path, file, { contentType: "application/pdf" });

      if (uploadErr) throw new Error("Upload: " + uploadErr.message);
      setStoragePath(path);

      const { data: signedData } = await supabase.storage
        .from("contratos")
        .createSignedUrl(path, 3600);
      if (signedData?.signedUrl) setPdfUrl(signedData.signedUrl);

      try {
        const arrayBuffer = await file.arrayBuffer();
        const pdf = await pdfjsLib.getDocument({ data: new Uint8Array(arrayBuffer) }).promise;
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
          await (page.render({ canvasContext: ctx, viewport } as any) as any).promise;
          imgs.push(canvas.toDataURL("image/jpeg", 0.85));
        }
        setPdfImages(imgs);
      } catch (renderErr) {
        console.warn("Erro renderizar PDF:", renderErr);
      }

      const formData = new FormData();
      formData.append("file", file);
      const res = await supabase.functions.invoke("parse-contrato-pdf", { body: formData });
      if (res.error) throw new Error(res.error.message);

      const dados = res.data as DadosIA;
      setDadosIA(dados);

      if (dados.objeto) setValue("objeto", dados.objeto);
      if (dados.area) setValue("area", dados.area);
      if (dados.data_inicio) {
        setValue("data_inicio", dados.data_inicio);
        setValue("data_primeira_parcela", dados.data_inicio);
      }
      if (dados.data_fim) setValue("data_fim", dados.data_fim);
      if (dados.dia_vencimento) setValue("dia_vencimento", dados.dia_vencimento);
      if (dados.valor_parcela) setValue("valor_parcela", dados.valor_parcela);
      if (dados.valor_total) setValue("valor_total", dados.valor_total);
      else if (dados.valor_parcela && dados.total_parcelas) {
        setValue("valor_total", dados.valor_parcela * dados.total_parcelas);
      }
      if (dados.total_parcelas) {
        setValue("numero_parcelas", dados.total_parcelas);
        setValue("ciclo_pagamento", "parcelado");
      } else if (dados.tipo_contrato === "unico") {
        setValue("ciclo_pagamento", "unico");
      } else if (
        dados.tipo_contrato === "recorrente_sem_fim" ||
        dados.tipo_contrato === "recorrente_com_fim"
      ) {
        setValue("ciclo_pagamento", "mensal");
      }

      if (dados.fornecedor_cnpj) {
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
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      toast.error("Erro: " + msg);
    } finally {
      setExtraindo(false);
      const input = document.getElementById("contrato-pdf-input") as HTMLInputElement | null;
      if (input) input.value = "";
    }
  }

  async function onSubmit(values: FormData) {
    setSalvando(true);
    try {
      const { data: contrato, error: errContrato } = await (supabase as any)
        .from("contratos")
        .insert({
          numero: values.numero,
          objeto: values.objeto,
          parceiro_id: values.parceiro_id || null,
          responsavel_id: values.responsavel_id || null,
          area: values.area,
          tipo_contrato: values.tipo_contrato,
          data_assinatura: values.data_assinatura || null,
          data_inicio: values.data_inicio,
          data_fim: values.data_fim || null,
          valor_total: values.valor_total,
          valor_parcela: values.valor_parcela,
          ciclo_pagamento: values.ciclo_pagamento,
          numero_parcelas:
            values.ciclo_pagamento === "parcelado" ? values.numero_parcelas : null,
          dia_vencimento: values.dia_vencimento,
          data_primeira_parcela: values.data_primeira_parcela,
          meio_pagamento_id: values.meio_pagamento_id || null,
          tem_setup: values.tem_setup,
          valor_setup: values.tem_setup ? values.valor_setup : null,
          parcelas_setup: values.tem_setup ? values.parcelas_setup : null,
          data_primeira_parcela_setup: values.tem_setup
            ? values.data_primeira_parcela_setup
            : null,
          reajuste_indice: values.reajuste_indice,
          reajuste_data: values.reajuste_data || null,
          renova_automaticamente: values.renova_automaticamente,
          alerta_renovacao_dias: values.alerta_renovacao_dias,
          status: "ativo",
          doc_storage_path: storagePath,
          clausulas_extraidas: dadosIA
            ? { clausulas: dadosIA.clausulas_principais ?? [] }
            : null,
          resumo_ia: dadosIA?.resumo ?? null,
        })
        .select("id")
        .single();

      if (errContrato) throw errContrato;

      await (supabase as any).rpc("gerar_parcelas_contrato_inicial", {
        p_contrato_id: contrato.id,
      });

      toast.success("Contrato cadastrado e parcelas geradas!");
      reset();
      setDadosIA(null);
      onSalvo();
    } catch (e) {
      const msg =
        e instanceof Error ? e.message : (e as any)?.message ?? String(e);
      toast.error("Erro ao salvar: " + msg);
    } finally {
      setSalvando(false);
    }
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        className={`overflow-y-auto ${
          dadosIA ? "!max-w-[98vw] sm:!max-w-[98vw]" : "sm:max-w-2xl"
        }`}
      >
        <SheetHeader>
          <SheetTitle>Novo Contrato</SheetTitle>
        </SheetHeader>

        <div
          className={`mt-6 ${
            dadosIA
              ? "grid grid-cols-[minmax(480px,1fr)_400px_minmax(450px,1.2fr)] gap-4"
              : ""
          }`}
        >
          <form
            onSubmit={handleSubmit(onSubmit)}
            className="space-y-4 overflow-y-auto"
            style={{ maxHeight: "calc(100vh - 150px)" }}
          >
            <div
              className={`rounded-lg border-2 border-dashed p-4 text-center cursor-pointer hover:bg-muted/50 transition-colors ${
                extraindo ? "opacity-60 pointer-events-none" : ""
              }`}
              onClick={() => document.getElementById("contrato-pdf-input")?.click()}
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
                  {dadosIA
                    ? "Subir outro PDF"
                    : "Subir PDF do contrato para preencher automaticamente"}
                </div>
              )}
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label>Número *</Label>
                <Input {...register("numero")} placeholder="CTR-2026-001" />
                {errors.numero && (
                  <p className="text-xs text-destructive">{errors.numero.message}</p>
                )}
              </div>
              <div className="space-y-1">
                <Label>Tipo *</Label>
                <Select
                  value={watch("tipo_contrato")}
                  onValueChange={(v) => setValue("tipo_contrato", v)}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {tiposContrato.map((t) => (
                      <SelectItem key={t.id} value={t.valor}>
                        {t.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-1">
              <Label>Objeto *</Label>
              <Input {...register("objeto")} placeholder="Descrição do contrato" />
              {errors.objeto && (
                <p className="text-xs text-destructive">{errors.objeto.message}</p>
              )}
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label>Área *</Label>
                <Select
                  value={watch("area")}
                  onValueChange={(v) => setValue("area", v)}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {areas.map((a) => (
                      <SelectItem key={a.id} value={a.valor}>
                        {a.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label>Parceiro</Label>
                <Select
                  value={watch("parceiro_id") ?? ""}
                  onValueChange={(v) => setValue("parceiro_id", v)}
                >
                  <SelectTrigger>
                    <SelectValue
                      placeholder={
                        !parceiroCadastrado && dadosIA?.fornecedor_razao_social
                          ? `⚠️ ${dadosIA.fornecedor_razao_social.substring(0, 25)}...`
                          : "Selecione..."
                      }
                    />
                  </SelectTrigger>
                  <SelectContent>
                    {(parceiros as any[]).map((p) => (
                      <SelectItem key={p.id} value={p.id}>
                        {p.razao_social}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid grid-cols-3 gap-3">
              <div className="space-y-1">
                <Label>Assinatura</Label>
                <Input type="date" {...register("data_assinatura")} />
              </div>
              <div className="space-y-1">
                <Label>Início *</Label>
                <Input type="date" {...register("data_inicio")} />
              </div>
              <div className="space-y-1">
                <Label>Fim (opcional)</Label>
                <Input type="date" {...register("data_fim")} />
              </div>
            </div>

            <Separator />
            <h3 className="font-semibold text-sm">Pagamento</h3>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label>Ciclo *</Label>
                <Select
                  value={watch("ciclo_pagamento")}
                  onValueChange={(v) => setValue("ciclo_pagamento", v as any)}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="unico">Único (1 pagamento)</SelectItem>
                    <SelectItem value="parcelado">
                      Parcelado (N parcelas mensais)
                    </SelectItem>
                    <SelectItem value="mensal">Mensal recorrente</SelectItem>
                    <SelectItem value="trimestral">Trimestral recorrente</SelectItem>
                    <SelectItem value="anual">Anual recorrente</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label>Meio de pagamento</Label>
                <Select
                  value={watch("meio_pagamento_id") ?? ""}
                  onValueChange={(v) => setValue("meio_pagamento_id", v)}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Selecione..." />
                  </SelectTrigger>
                  <SelectContent>
                    {(formasPagamento as any[]).map((f) => (
                      <SelectItem key={f.id} value={f.id}>
                        {f.nome}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid grid-cols-3 gap-3">
              <div className="space-y-1">
                <Label>Valor total *</Label>
                <Input type="number" step="0.01" {...register("valor_total")} />
              </div>
              {ciclo === "parcelado" && (
                <div className="space-y-1">
                  <Label>Nº parcelas *</Label>
                  <Input type="number" {...register("numero_parcelas")} />
                </div>
              )}
              <div className="space-y-1">
                <Label>Valor parcela {ciclo === "parcelado" ? "(auto)" : "*"}</Label>
                <Input
                  type="number"
                  step="0.01"
                  {...register("valor_parcela")}
                  disabled={ciclo === "parcelado"}
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label>1ª parcela em *</Label>
                <Input type="date" {...register("data_primeira_parcela")} />
              </div>
              {ciclo !== "unico" && (
                <div className="space-y-1">
                  <Label>Dia do vencimento</Label>
                  <Input
                    type="number"
                    min={1}
                    max={28}
                    {...register("dia_vencimento")}
                  />
                </div>
              )}
            </div>

            <Separator />
            <div className="flex items-center gap-2">
              <Switch
                checked={watch("tem_setup")}
                onCheckedChange={(v) => setValue("tem_setup", v)}
              />
              <Label>Tem custo de setup/implantação?</Label>
            </div>

            {temSetup && (
              <div className="rounded-lg border bg-muted/30 p-3 space-y-3">
                <div className="grid grid-cols-3 gap-3">
                  <div className="space-y-1">
                    <Label>Valor setup</Label>
                    <Input type="number" step="0.01" {...register("valor_setup")} />
                  </div>
                  <div className="space-y-1">
                    <Label>Parcelas setup</Label>
                    <Input type="number" {...register("parcelas_setup")} />
                  </div>
                  <div className="space-y-1">
                    <Label>1ª parc. setup</Label>
                    <Input type="date" {...register("data_primeira_parcela_setup")} />
                  </div>
                </div>
              </div>
            )}

            <Separator />
            <h3 className="font-semibold text-sm">Reajuste anual</h3>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label>Índice</Label>
                <Select
                  value={watch("reajuste_indice")}
                  onValueChange={(v) => setValue("reajuste_indice", v as any)}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="nenhum">Sem reajuste</SelectItem>
                    <SelectItem value="igpm">IGP-M</SelectItem>
                    <SelectItem value="ipca">IPCA</SelectItem>
                    <SelectItem value="prefixado">Prefixado</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              {reajusteIndice !== "nenhum" && (
                <div className="space-y-1">
                  <Label>Data do reajuste</Label>
                  <Input type="date" {...register("reajuste_data")} />
                </div>
              )}
            </div>

            <Separator />
            <div className="flex items-center gap-2">
              <Switch
                checked={watch("renova_automaticamente")}
                onCheckedChange={(v) => setValue("renova_automaticamente", v)}
              />
              <Label>Renova automaticamente</Label>
            </div>
            {renovaAutomaticamente && (
              <div className="space-y-1 max-w-[160px]">
                <Label>Avisar (dias antes)</Label>
                <Input type="number" {...register("alerta_renovacao_dias")} />
              </div>
            )}

            <div className="flex justify-end gap-2 pt-4 sticky bottom-0 bg-background pb-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  onOpenChange(false);
                  setDadosIA(null);
                }}
              >
                Cancelar
              </Button>
              <Button type="submit" disabled={salvando}>
                {salvando ? "Salvando..." : "Salvar Contrato"}
              </Button>
            </div>
          </form>

          {dadosIA && (
            <div
              className="border-l border-r px-4 overflow-y-auto"
              style={{ maxHeight: "calc(100vh - 150px)" }}
            >
              <PainelIA dados={dadosIA} parceiroCadastrado={parceiroCadastrado} />
            </div>
          )}

          {dadosIA && (
            <div className="border rounded-lg overflow-hidden bg-muted flex flex-col">
              <div className="bg-background border-b px-3 py-2 text-xs font-medium text-muted-foreground flex items-center justify-between">
                <span>Contrato original</span>
                {pdfUrl && (
                  <a
                    href={pdfUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-xs text-primary hover:underline"
                  >
                    Abrir completo
                  </a>
                )}
              </div>
              <div
                className="overflow-y-auto p-2 space-y-2"
                style={{ maxHeight: "calc(100vh - 200px)" }}
              >
                {pdfImages.length > 0 ? (
                  pdfImages.map((img, i) => (
                    <img
                      key={i}
                      src={img}
                      alt={`Página ${i + 1}`}
                      className="w-full border rounded shadow-sm"
                    />
                  ))
                ) : (
                  <div className="flex items-center justify-center h-32 text-xs text-muted-foreground">
                    Carregando preview...
                  </div>
                )}
                {pdfImages.length === 5 && pdfUrl && (
                  <div className="text-center py-2">
                    <a
                      href={pdfUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-xs text-primary hover:underline"
                    >
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
