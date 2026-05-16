import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2, Upload, FileText } from "lucide-react";
import { toast } from "sonner";
import { parsearOFX } from "@/lib/financeiro/parser-ofx";
import { gerarHashMov } from "@/lib/financeiro/hash-mov";

type ContaBancaria = {
  id: string;
  nome_exibicao: string;
  banco: string | null;
};

export function ImportadorOFX() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [contaBancariaId, setContaBancariaId] = useState<string>("");
  const [enviando, setEnviando] = useState(false);

  const { data: contas } = useQuery({
    queryKey: ["contas-bancarias-ofx"],
    queryFn: async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data } = await (supabase as any)
        .from("contas_bancarias")
        .select("id, nome_exibicao, banco, tipo")
        .eq("ativo", true)
        .eq("tipo", "corrente")
        .order("nome_exibicao");
      return (data || []) as ContaBancaria[];
    },
  });

  async function handleFiles(files: FileList | null) {
    if (!files || files.length === 0) return;
    if (!contaBancariaId) {
      toast.error("Selecione a conta bancária primeiro");
      return;
    }

    setEnviando(true);
    let totalTransacoes = 0;
    let arquivosProcessados = 0;

    try {
      for (const arquivo of Array.from(files)) {
        try {
          const conteudo = await arquivo.text();
          const parseado = parsearOFX(conteudo);

          if (!parseado || !parseado.transacoes || parseado.transacoes.length === 0) {
            toast.warning(`${arquivo.name}: sem transações válidas`);
            continue;
          }

          const nomeLimpo = arquivo.name.replace(/[^a-zA-Z0-9._-]/g, "_");
          const importacaoTempId = crypto.randomUUID();
          const storagePath = `lote-${importacaoTempId}/${Date.now()}_${nomeLimpo}`;

          const { error: upErr } = await supabase.storage
            .from("ofx-stage")
            .upload(storagePath, arquivo, {
              contentType: arquivo.type || "application/x-ofx",
              upsert: false,
            });
          if (upErr) {
            toast.error(`Upload falhou ${arquivo.name}: ${upErr.message}`);
            continue;
          }

          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const { data: imp, error: errImp } = await (supabase as any)
            .from("ofx_importacoes_stage")
            .insert({
              conta_bancaria_id: contaBancariaId,
              arquivo_nome: arquivo.name,
              arquivo_storage_path: storagePath,
              periodo_inicio: parseado.periodo?.inicio || null,
              periodo_fim: parseado.periodo?.fim || null,
              saldo_final: parseado.saldo?.final || null,
              total_transacoes: parseado.transacoes.length,
              status: "rascunho",
              criado_por: user?.id || null,
            })
            .select("id")
            .single();

          if (errImp || !imp) {
            toast.error(`Erro ao criar lote: ${errImp?.message}`);
            continue;
          }

          const linhas = await Promise.all(
            parseado.transacoes.map(async (t) => ({
              importacao_stage_id: imp.id,
              conta_bancaria_id: contaBancariaId,
              data_transacao: t.data,
              valor: t.valor,
              descricao: t.descricao,
              tipo: t.tipo,
              id_transacao_banco: t.fitid,
              hash_unico: await gerarHashMov(contaBancariaId, t.data, t.valor, t.descricao, t.fitid),
              status: "pendente",
            }))
          );

          for (let i = 0; i < linhas.length; i += 50) {
            const lote = linhas.slice(i, i + 50);
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const { error: errLote } = await (supabase as any)
              .from("ofx_transacoes_stage")
              .upsert(lote, { onConflict: "hash_unico", ignoreDuplicates: true });
            if (errLote) {
              toast.error(`Erro ao inserir transações: ${errLote.message}`);
              break;
            }
          }

          totalTransacoes += parseado.transacoes.length;
          arquivosProcessados++;
        } catch (e) {
          const msg = e instanceof Error ? e.message : String(e);
          toast.error(`${arquivo.name}: ${msg}`);
        }
      }

      if (arquivosProcessados > 0) {
        toast.success(
          `${arquivosProcessados} arquivo${arquivosProcessados > 1 ? "s" : ""} importado${arquivosProcessados > 1 ? "s" : ""} — ${totalTransacoes} transações no Stage OFX`,
          { duration: 6000 }
        );
        qc.invalidateQueries({ queryKey: ["ofx-stage"] });

        // Aplicar regras automáticas da Fase 4 (Mapa v2) — reusa Fase 3
        if (contaBancariaId) {
          try {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const sb2 = supabase as any;
            const { data: resp, error: errRegras } = await sb2.rpc(
              "aplicar_regras_automaticas_ofx",
              {
                p_conta_bancaria_id: contaBancariaId,
                p_user_id: user?.id ?? null,
              }
            );
            if (errRegras) {
              console.error("Erro ao aplicar regras OFX:", errRegras);
            } else if (resp?.aplicados_total > 0) {
              toast.success(
                `${resp.aplicados_total} transação(ões) classificada(s) automaticamente ` +
                `(${resp.aplicados_debito} débito(s), ${resp.aplicados_credito} crédito(s))`
              );
            }
          } catch (e) {
            console.error("Erro ao aplicar regras OFX:", e);
          }
        }
      }
    } finally {
      setEnviando(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2">
          <FileText className="h-4 w-4" />
          OFX (Extrato Bancário)
        </CardTitle>
        <p className="text-xs text-muted-foreground">
          Upload de um ou vários OFX — Itaú, Safra, Bradesco, Inter etc. Cai no Stage OFX pra validar antes de persistir.
        </p>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="space-y-1">
          <Label className="text-xs">Conta bancária</Label>
          <Select value={contaBancariaId} onValueChange={setContaBancariaId}>
            <SelectTrigger>
              <SelectValue placeholder="Para qual conta é este extrato?" />
            </SelectTrigger>
            <SelectContent>
              {(contas || []).map((c) => (
                <SelectItem key={c.id} value={c.id}>
                  {c.nome_exibicao}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="flex items-center gap-3">
          <input
            type="file"
            accept=".ofx"
            multiple
            disabled={enviando || !contaBancariaId}
            onChange={(e) => {
              handleFiles(e.target.files);
              e.target.value = "";
            }}
            className="hidden"
            id="ofx-input"
          />
          <Button
            variant="outline"
            asChild
            disabled={enviando || !contaBancariaId}
          >
            <label htmlFor="ofx-input" className="cursor-pointer flex items-center gap-2">
              {enviando ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Upload className="h-4 w-4" />
              )}
              Selecionar OFX(s)
            </label>
          </Button>
          <span className="text-xs text-muted-foreground">Múltiplos arquivos suportados</span>
        </div>
      </CardContent>
    </Card>
  );
}
