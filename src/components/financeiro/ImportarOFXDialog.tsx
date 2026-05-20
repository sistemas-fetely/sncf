import { useEffect, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Upload,
  FileText,
  CheckCircle2,
  AlertTriangle,
  Loader2,
  Info,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { formatBRL, formatDateBR } from "@/lib/format-currency";
import { parsearOFX, type OFXResultado, type OFXTransacao } from "@/lib/financeiro/parser-ofx";
import { gerarHashMov } from "@/lib/financeiro/hash-mov";

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onSuccess?: () => void;
  contaBancariaId?: string;
}

type EtapaImport = "upload" | "preview" | "salvando" | "concluido";

export function ImportarOFXDialog({ open, onOpenChange, onSuccess, contaBancariaId: contaBancariaIdProp }: Props) {
  const { user } = useAuth();
  const qc = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const [contaBancariaIdInterno, setContaBancariaIdInterno] = useState("");
  const contaBancariaId = contaBancariaIdProp ?? contaBancariaIdInterno;
  const setContaBancariaId = (v: string) => { if (!contaBancariaIdProp) setContaBancariaIdInterno(v); };
  const [arquivoNome, setArquivoNome] = useState("");
  const [arquivoFile, setArquivoFile] = useState<File | null>(null);
  const [parseado, setParseado] = useState<OFXResultado | null>(null);
  const [duplicatasFitids, setDuplicatasFitids] = useState<Set<string>>(new Set());
  const [etapa, setEtapa] = useState<EtapaImport>("upload");
  const [erro, setErro] = useState("");
  const [resultadoFinal, setResultadoFinal] = useState<{
    novas: number;
    duplicatas: number;
  } | null>(null);

  const { data: contasBancarias } = useQuery({
    queryKey: ["contas-bancarias-ativas-import"],
    enabled: open,
    queryFn: async () => {
      const { data } = await supabase
        .from("contas_bancarias")
        .select("id, nome_exibicao, tipo, banco")
        .eq("ativo", true)
        .order("nome_exibicao");
      return data || [];
    },
  });

  useEffect(() => {
    if (!open) {
      // Reset ao fechar
      if (!contaBancariaIdProp) setContaBancariaIdInterno("");
      setArquivoNome("");
      setArquivoFile(null);
      setParseado(null);
      setDuplicatasFitids(new Set());
      setEtapa("upload");
      setErro("");
      setResultadoFinal(null);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }, [open]);

  async function handleArquivoSelecionado(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!contaBancariaId) {
      toast.error("Selecione a conta bancária antes de fazer upload");
      if (fileInputRef.current) fileInputRef.current.value = "";
      return;
    }

    setErro("");
    setArquivoNome(file.name);
    setArquivoFile(file);

    try {
      const conteudo = await file.text();
      const resultado = parsearOFX(conteudo);

      // Bloquear OFX de cartão — deve usar Importar Fatura de Cartão (Modelo 3D)
      if (resultado.banco.tipo === "cartao_credito") {
        toast.error(
          "Este OFX parece ser de cartão de crédito. Use 'Importar Fatura de Cartão' para faturas de cartão.",
        );
        setArquivoFile(null);
        return;
      }

      // Detectar duplicatas (transações com fitid já gravado nesta conta)
      const fitids = resultado.transacoes.map((t) => t.fitid).filter(Boolean);
      if (fitids.length > 0) {
        const { data } = await supabase
          .from("movimentacoes_bancarias")
          .select("id_transacao_banco")
          .eq("conta_bancaria_id", contaBancariaId)
          .in("id_transacao_banco", fitids);

        const dupSet = new Set(
          (data || [])
            .map((r: { id_transacao_banco: string | null }) => r.id_transacao_banco)
            .filter((x): x is string => !!x),
        );
        setDuplicatasFitids(dupSet);
      }

      setParseado(resultado);
      setEtapa("preview");
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setErro(msg);
      toast.error("Erro ao ler arquivo: " + msg);
    }
  }

  async function handleConfirmarImportacao() {
    if (!parseado || !contaBancariaId || !arquivoFile) return;

    setEtapa("salvando");
    try {
      // 1) Upload do arquivo OFX no bucket "ofx-stage"
      const nomeLimpo = arquivoFile.name.replace(/[^a-zA-Z0-9._-]/g, "_");
      const loteId = crypto.randomUUID();
      const storagePath = `lote-${loteId}/${Date.now()}_${nomeLimpo}`;
      const { error: upErr } = await supabase.storage
        .from("ofx-stage")
        .upload(storagePath, arquivoFile, {
          contentType: "application/x-ofx",
          upsert: false,
        });
      if (upErr) throw upErr;

      // 2) Insert do lote em ofx_importacoes_stage
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data: imp, error: errImp } = await (supabase as any)
        .from("ofx_importacoes_stage")
        .insert({
          conta_bancaria_id: contaBancariaId,
          arquivo_nome: arquivoFile.name,
          arquivo_storage_path: storagePath,
          periodo_inicio: parseado.periodo.inicio,
          periodo_fim: parseado.periodo.fim,
          saldo_final: parseado.saldo.final,
          total_transacoes: parseado.transacoes.length,
          status: "rascunho",
          criado_por: user?.id || null,
        })
        .select("id")
        .single();
      if (errImp) throw errImp;

      // 3) Insert das transações em ofx_transacoes_stage (lotes de 50)
      const linhas = await Promise.all(
        parseado.transacoes.map(async (t) => ({
          importacao_stage_id: imp.id,
          conta_bancaria_id: contaBancariaId,
          data_transacao: t.data,
          valor: t.valor,
          descricao: t.descricao,
          tipo: t.valor >= 0 ? "credito" : "debito",
          id_transacao_banco: t.fitid || null,
          hash_unico: await gerarHashMov(
            contaBancariaId,
            t.data,
            t.valor,
            t.descricao,
            t.fitid,
          ),
          saldo_pos_transacao: null,
          status: "pendente",
        })),
      );

      for (let i = 0; i < linhas.length; i += 50) {
        const lote = linhas.slice(i, i + 50);
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { error: errLote } = await (supabase as any)
          .from("ofx_transacoes_stage")
          .upsert(lote, { onConflict: "hash_unico", ignoreDuplicates: true });
        if (errLote) throw errLote;
      }

      setResultadoFinal({
        novas: parseado.transacoes.length,
        duplicatas: 0,
      });
      setEtapa("concluido");
      qc.invalidateQueries({ queryKey: ["ofx-stage"] });
      qc.invalidateQueries({ queryKey: ["lancamentos-caixa-banco"] });
      qc.invalidateQueries({ queryKey: ["contas-bancarias"] });
      onSuccess?.();
    } catch (e) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const err = e as any;
      const msg =
        err?.message ||
        err?.error_description ||
        err?.details ||
        err?.hint ||
        (err instanceof Error ? err.message : JSON.stringify(err));
      toast.error("Erro ao salvar: " + msg);
      setEtapa("preview");
    }
  }

  const transacoesNovas = parseado
    ? parseado.transacoes.filter((t) => !duplicatasFitids.has(t.fitid))
    : [];
  const duplicatasCount = duplicatasFitids.size;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full sm:max-w-3xl overflow-y-auto">
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2">
            <Upload className="h-5 w-5 text-admin" />
            Importar extrato OFX
          </SheetTitle>
          <SheetDescription>
            Carregue um arquivo de extrato bancário (.ofx) baixado do seu banco.
          </SheetDescription>
        </SheetHeader>

        {/* ETAPA 1: UPLOAD */}
        {etapa === "upload" && (
          <div className="space-y-6 py-6">
            {!contaBancariaIdProp && (
              <div className="space-y-1">
                <Label>Conta bancária *</Label>
                <Select value={contaBancariaId} onValueChange={setContaBancariaId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Para qual conta é este extrato?" />
                  </SelectTrigger>
                  <SelectContent>
                    {(contasBancarias || []).map((cb) => (
                      <SelectItem key={cb.id} value={cb.id}>
                        {cb.nome_exibicao}{" "}
                        <span className="text-muted-foreground text-xs ml-1">
                          ({cb.tipo === "cartao_credito" ? "Cartão" : cb.banco})
                        </span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            <div className="rounded-lg border-2 border-dashed border-muted-foreground/30 p-8 text-center space-y-3">
              <Upload className="h-10 w-10 text-muted-foreground mx-auto" />
              <div>
                <p className="font-medium">Selecione o arquivo OFX</p>
                <p className="text-xs text-muted-foreground">
                  .ofx exportado do seu banco (Itaú, Bradesco, Nubank, Inter, BB, Santander, Caixa…)
                </p>
              </div>
              <Button
                variant="outline"
                onClick={() => fileInputRef.current?.click()}
                disabled={!contaBancariaId}
                className="gap-2"
              >
                <FileText className="h-4 w-4" />
                Escolher arquivo
              </Button>
              <input
                ref={fileInputRef}
                type="file"
                accept=".ofx,.OFX"
                className="hidden"
                onChange={handleArquivoSelecionado}
              />
            </div>

            {erro && (
              <div className="rounded-md border border-destructive/30 bg-destructive/5 p-3 flex gap-2 text-sm text-destructive">
                <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
                <div>
                  <strong>Erro ao processar arquivo:</strong>
                  <br />
                  {erro}
                </div>
              </div>
            )}

            <div className="rounded-md bg-blue-50 border border-blue-200 p-3 flex gap-2 text-xs text-blue-900">
              <Info className="h-4 w-4 shrink-0 mt-0.5" />
              <div className="space-y-1">
                <p>
                  <strong>Como exportar OFX:</strong>
                </p>
                <ul className="list-disc list-inside space-y-0.5">
                  <li>Acesse o internet banking do seu banco</li>
                  <li>Vá em "Extrato" ou "Movimentações"</li>
                  <li>Selecione o período</li>
                  <li>Procure pela opção "Exportar OFX" / "Money 2000" / "OFX 2.x"</li>
                </ul>
              </div>
            </div>
          </div>
        )}

        {/* ETAPA 2: PREVIEW */}
        {etapa === "preview" && parseado && (
          <div className="space-y-4 py-4">
            {/* Resumo */}
            <div className="rounded-lg border p-4 bg-muted/30 space-y-2">
              <div className="flex items-center justify-between">
                <h3 className="font-semibold flex items-center gap-2">
                  <FileText className="h-4 w-4" />
                  {arquivoNome}
                </h3>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 gap-1 text-xs"
                  onClick={() => {
                    setEtapa("upload");
                    setParseado(null);
                    setArquivoNome("");
                    setArquivoFile(null);
                  }}
                >
                  <X className="h-3 w-3" /> Trocar
                </Button>
              </div>
              <div className="grid grid-cols-2 gap-2 text-xs">
                <div>
                  <span className="text-muted-foreground">Período:</span>{" "}
                  {formatDateBR(parseado.periodo.inicio)} → {formatDateBR(parseado.periodo.fim)}
                </div>
                <div>
                  <span className="text-muted-foreground">Total movimentos:</span>{" "}
                  {parseado.transacoes.length}
                </div>
                {parseado.banco.agencia && (
                  <div>
                    <span className="text-muted-foreground">Agência:</span> {parseado.banco.agencia}
                  </div>
                )}
                {parseado.banco.conta && (
                  <div>
                    <span className="text-muted-foreground">Conta:</span> {parseado.banco.conta}
                  </div>
                )}
                {parseado.saldo.final !== null && (
                  <div className="col-span-2">
                    <span className="text-muted-foreground">Saldo final do extrato:</span>{" "}
                    <strong className="font-mono">{formatBRL(parseado.saldo.final)}</strong>
                  </div>
                )}
              </div>
            </div>

            {/* Status de duplicatas */}
            <div className="grid grid-cols-2 gap-2">
              <div className="rounded-md border border-green-200 bg-green-50 p-3 flex items-center gap-2 text-sm">
                <CheckCircle2 className="h-4 w-4 text-green-700 shrink-0" />
                <div>
                  <strong className="text-green-800">{transacoesNovas.length}</strong>{" "}
                  <span className="text-green-700 text-xs">novas pra importar</span>
                </div>
              </div>
              {duplicatasCount > 0 ? (
                <div className="rounded-md border border-amber-200 bg-amber-50 p-3 flex items-center gap-2 text-sm">
                  <AlertTriangle className="h-4 w-4 text-amber-700 shrink-0" />
                  <div>
                    <strong className="text-amber-800">{duplicatasCount}</strong>{" "}
                    <span className="text-amber-700 text-xs">duplicatas (serão ignoradas)</span>
                  </div>
                </div>
              ) : (
                <div className="rounded-md border p-3 flex items-center gap-2 text-sm text-muted-foreground">
                  <CheckCircle2 className="h-4 w-4 shrink-0" />
                  <div className="text-xs">Sem duplicatas detectadas</div>
                </div>
              )}
            </div>

            {/* Tabela de movimentações */}
            <div className="border rounded-md overflow-hidden">
              <div className="max-h-[400px] overflow-y-auto">
                <Table>
                  <TableHeader className="bg-muted/50 sticky top-0">
                    <TableRow>
                      <TableHead className="w-[100px]">Data</TableHead>
                      <TableHead>Descrição</TableHead>
                      <TableHead className="text-right">Valor</TableHead>
                      <TableHead className="w-[100px]">Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {parseado.transacoes.map((t) => {
                      const isDup = duplicatasFitids.has(t.fitid);
                      return (
                        <TableRow key={t.fitid} className={isDup ? "opacity-50" : ""}>
                          <TableCell className="text-xs whitespace-nowrap">
                            {formatDateBR(t.data)}
                          </TableCell>
                          <TableCell className="text-xs">
                            <div className="truncate max-w-[300px]" title={t.descricao}>
                              {t.descricao}
                            </div>
                          </TableCell>
                          <TableCell
                            className={`text-right font-mono text-xs whitespace-nowrap ${
                              t.valor < 0 ? "text-red-700" : "text-green-700"
                            }`}
                          >
                            {formatBRL(t.valor)}
                          </TableCell>
                          <TableCell>
                            {isDup ? (
                              <Badge variant="outline" className="text-[9px] py-0 px-1.5">
                                Já importado
                              </Badge>
                            ) : (
                              <Badge className="text-[9px] py-0 px-1.5 bg-green-100 text-green-800 hover:bg-green-100">
                                Novo
                              </Badge>
                            )}
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
            </div>
          </div>
        )}

        {/* ETAPA 3: SALVANDO */}
        {etapa === "salvando" && (
          <div className="py-12 text-center space-y-3">
            <Loader2 className="h-10 w-10 text-admin mx-auto animate-spin" />
            <p className="text-sm text-muted-foreground">
              Importando movimentações...
            </p>
          </div>
        )}

        {/* ETAPA 4: CONCLUÍDO */}
        {etapa === "concluido" && resultadoFinal && (
          <div className="py-12 text-center space-y-4">
            <CheckCircle2 className="h-12 w-12 text-green-600 mx-auto" />
            <div>
              <h3 className="text-lg font-semibold">Importado no Stage!</h3>
              <p className="text-sm text-muted-foreground mt-1">
                <strong className="text-green-700">{resultadoFinal.novas}</strong> transações enviadas pra rascunho
              </p>
            </div>
            <p className="text-xs text-muted-foreground">
              Próximo passo: vá em <strong>Stage OFX</strong> para validar e persistir as movimentações. Duplicatas serão detectadas lá.
            </p>
          </div>
        )}

        <SheetFooter className="gap-2">
          {etapa === "preview" && (
            <>
              <Button variant="outline" onClick={() => onOpenChange(false)}>
                Cancelar
              </Button>
              <Button
                onClick={handleConfirmarImportacao}
                disabled={transacoesNovas.length === 0}
                className="gap-2 bg-admin hover:bg-admin-accent text-admin-foreground"
              >
                <Upload className="h-4 w-4" />
                Importar {transacoesNovas.length} movimentações
              </Button>
            </>
          )}
          {etapa === "concluido" && (
            <Button onClick={() => onOpenChange(false)} className="w-full">
              Fechar
            </Button>
          )}
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
