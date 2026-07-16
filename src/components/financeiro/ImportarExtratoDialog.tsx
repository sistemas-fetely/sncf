import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Loader2, Upload } from "lucide-react";
import { toast } from "sonner";
import { parseOFX } from "@/lib/financeiro/ofx-parser";
import { parseCsvItau } from "@/lib/financeiro/csv-itau-parser";
import { parseCsvSafra } from "@/lib/financeiro/csv-safra-parser";
import { gerarHashMov } from "@/lib/financeiro/hash-mov";

type Formato = "ofx" | "csv_itau" | "csv_safra";

interface ContaBancariaOption {
  id: string;
  nome_exibicao: string;
}

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  contaPreSelecionada?: string;
}

/**
 * Dialog reutilizável de importação de extrato bancário (OFX/CSV).
 * Detecta duplicatas via hash e atualiza saldo da conta.
 */
export function ImportarExtratoDialog({ open, onOpenChange, contaPreSelecionada }: Props) {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [impConta, setImpConta] = useState<string>(contaPreSelecionada || "");
  const [impFormato, setImpFormato] = useState<Formato>("ofx");
  const [impArquivo, setImpArquivo] = useState<File | null>(null);
  const [importando, setImportando] = useState(false);

  const { data: contas = [] } = useQuery({
    queryKey: ["contas-bancarias-import-dialog"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("contas_bancarias")
        .select("id, nome_exibicao")
        .eq("ativo", true)
        .order("nome_exibicao");
      if (error) throw error;
      return (data || []) as ContaBancariaOption[];
    },
    enabled: open,
  });

  async function handleImportar() {
    if (!impArquivo || !impConta || !user) {
      toast.error("Preencha conta e selecione o arquivo");
      return;
    }
    setImportando(true);
    try {
      const text = await impArquivo.text();
      let parsed;
      if (impFormato === "ofx") parsed = parseOFX(text);
      else if (impFormato === "csv_itau") parsed = parseCsvItau(text);
      else parsed = parseCsvSafra(text);

      if (!parsed.movimentacoes.length) {
        toast.error("Nenhuma movimentação encontrada no arquivo");
        setImportando(false);
        return;
      }

      const movsComHash = await Promise.all(
        parsed.movimentacoes.map(async (mov) => ({
          ...mov,
          hash_unico: await gerarHashMov(impConta, mov.data_transacao || "", mov.valor, mov.descricao),
        }))
      );

      const hashes = movsComHash.map((m) => m.hash_unico);
      const { data: existentes } = await supabase
        .from("movimentacoes_bancarias")
        .select("hash_unico")
        .in("hash_unico", hashes);
      const setExist = new Set((existentes || []).map((e: { hash_unico: string | null }) => e.hash_unico));
      const novas = movsComHash.filter((m) => !setExist.has(m.hash_unico));
      const duplicadas = movsComHash.length - novas.length;

      if (novas.length > 0) {
        const inserts = novas
          .filter((m) => m.data_transacao)
          .map((m) => ({
            conta_bancaria_id: impConta,
            data_transacao: m.data_transacao!,
            descricao: m.descricao,
            valor: m.valor,
            tipo: m.tipo,
            id_transacao_banco: m.id_transacao_banco,
            hash_unico: m.hash_unico,
            saldo_pos_transacao: m.saldo_pos_transacao ?? null,
            origem: impFormato,
          }));
        for (let i = 0; i < inserts.length; i += 50) {
          const lote = inserts.slice(i, i + 50);
          const { error } = await supabase.from("movimentacoes_bancarias").insert(lote);
          if (error) throw error;
        }

        const ordenadasPorData = [...novas].sort((a, b) =>
          (a.data_transacao || "").localeCompare(b.data_transacao || "")
        );
        const ultima = ordenadasPorData[ordenadasPorData.length - 1];
        const saldoFinal =
          ultima.saldo_pos_transacao ??
          (impFormato === "ofx" ? (parsed as ReturnType<typeof parseOFX>).saldo : null);
        if (saldoFinal != null) {
          await supabase
            .from("contas_bancarias")
            .update({
              saldo_atual: saldoFinal,
              saldo_atualizado_em: new Date().toISOString(),
            })
            .eq("id", impConta);
        }
      }

      const ignoradasSaldo =
        impFormato === "ofx" ? (parsed as ReturnType<typeof parseOFX>).ignoradasSaldo : 0;
      toast.success(
        `${novas.length} movimentações importadas` +
          (duplicadas > 0 ? ` (${duplicadas} duplicadas ignoradas)` : "") +
          (ignoradasSaldo > 0 ? ` · ${ignoradasSaldo} linhas de saldo ignoradas` : "")
      );
      onOpenChange(false);
      setImpArquivo(null);
      qc.invalidateQueries({ queryKey: ["movimentacoes-bancarias"] });
      qc.invalidateQueries({ queryKey: ["contas-bancarias"] });
      qc.invalidateQueries({ queryKey: ["mov-conciliacao"] });
    } catch (e) {
      toast.error("Erro ao importar: " + (e instanceof Error ? e.message : String(e)));
    } finally {
      setImportando(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Importar extrato</DialogTitle>
          <DialogDescription>
            Importe arquivos OFX (padrão bancário) ou CSV. Movimentações duplicadas são detectadas automaticamente.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div>
            <Label>Conta bancária</Label>
            <Select value={impConta} onValueChange={setImpConta}>
              <SelectTrigger><SelectValue placeholder="Selecione a conta" /></SelectTrigger>
              <SelectContent>
                {contas.map((c) => (
                  <SelectItem key={c.id} value={c.id}>{c.nome_exibicao}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Formato</Label>
            <Select value={impFormato} onValueChange={(v) => setImpFormato(v as Formato)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="ofx">OFX (Itaú / Safra / qualquer banco)</SelectItem>
                <SelectItem value="csv_itau">CSV Itaú</SelectItem>
                <SelectItem value="csv_safra">CSV Safra</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Arquivo</Label>
            <Input
              type="file"
              accept=".ofx,.csv,.txt"
              onChange={(e) => setImpArquivo(e.target.files?.[0] || null)}
            />
            {impArquivo && (
              <p className="text-xs text-muted-foreground mt-1">{impArquivo.name}</p>
            )}
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={importando}>Cancelar</Button>
          <Button
            onClick={handleImportar}
            disabled={importando || !impArquivo || !impConta}
            className="bg-admin hover:bg-admin/90 text-admin-foreground gap-2"
          >
            {importando ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
            Importar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
