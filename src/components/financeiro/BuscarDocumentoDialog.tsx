import { useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Loader2, Search, Link2 } from "lucide-react";
import { toast } from "sonner";
import { formatBRL, formatDateBR } from "@/lib/format-currency";
import { cn } from "@/lib/utils";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const sb = supabase as any;

type Furo = {
  id: string;
  valor: number;
  data_transacao: string;
  contraparte_nome: string | null;
  contraparte_documento: string | null;
  descricao: string | null;
};

type Candidato = {
  id: string;
  tipo_documento: string | null;
  nf_numero: string | null;
  fornecedor_razao_social: string | null;
  fornecedor_cliente: string | null;
  fornecedor_cnpj: string | null;
  nf_data_emissao: string | null;
  valor: number | null;
};

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  furo: Furo | null;
  onDone: () => void;
}

const STOP_TOKENS = new Set([
  "DIVERSOS", "PAG", "TIT", "SISPAG", "PIX", "ENVIADO",
  "LTDA", "SA", "S/A", "ME", "EIRELI", "DE", "DA", "DO", "DAS", "DOS", "E",
]);

function montarTermoInicial(furo: Furo | null): string {
  if (!furo) return "";
  const doc = (furo.contraparte_documento || "").replace(/\D/g, "");
  if (doc.length >= 8) return doc;
  const nome = (furo.contraparte_nome || "").toUpperCase();
  if (!nome) return "";
  const tokens = nome
    .split(/\s+/)
    .map((t) => t.replace(/[^\wÀ-ÿ]/g, ""))
    .filter((t) => t.length >= 3 && !STOP_TOKENS.has(t) && !/^\d+$/.test(t));
  return tokens.slice(0, 2).join(" ");
}

export function BuscarDocumentoDialog({ open, onOpenChange, furo, onDone }: Props) {
  const [termo, setTermo] = useState("");
  const [buscando, setBuscando] = useState(false);
  const [candidatos, setCandidatos] = useState<Candidato[]>([]);
  const [vinculando, setVinculando] = useState<string | null>(null);
  const debounceRef = useRef<number | null>(null);
  const reqIdRef = useRef(0);

  async function buscar(termoBusca: string) {
    const t = termoBusca.trim();
    if (t.length < 2) {
      setCandidatos([]);
      setBuscando(false);
      return;
    }
    const myReq = ++reqIdRef.current;
    setBuscando(true);
    try {
      const tokens = t.split(/\s+/).filter(Boolean);
      let query = sb
        .from("nfs_stage")
        .select("id, tipo_documento, nf_numero, fornecedor_razao_social, fornecedor_cliente, fornecedor_cnpj, nf_data_emissao, valor")
        .not("revisada_em", "is", null)
        .is("conta_pagar_id", null)
        .is("motivo_descarte", null)
        .not("status", "in", "(descartada,duplicata)")
        .not("plano_contas_id", "is", null);

      for (const tok of tokens) {
        const digits = tok.replace(/\D/g, "");
        const parts = [
          `fornecedor_razao_social.ilike.%${tok}%`,
          `fornecedor_cliente.ilike.%${tok}%`,
          `nf_numero.ilike.%${tok}%`,
        ];
        if (digits.length >= 4) parts.push(`fornecedor_cnpj.ilike.%${digits}%`);
        query = query.or(parts.join(","));
      }

      const { data, error } = await query
        .order("nf_data_emissao", { ascending: false })
        .limit(30);
      if (error) throw error;
      if (myReq !== reqIdRef.current) return;

      const valorFuro = Number(furo?.valor || 0);
      const rows = ((data || []) as Candidato[]).slice().sort((a, b) => {
        const da = Math.abs(Number(a.valor || 0) - valorFuro);
        const db = Math.abs(Number(b.valor || 0) - valorFuro);
        if (da !== db) return da - db;
        const ea = a.nf_data_emissao || "";
        const eb = b.nf_data_emissao || "";
        return eb.localeCompare(ea);
      });
      setCandidatos(rows);
    } catch (e) {
      if (myReq === reqIdRef.current) {
        toast.error("Falha na busca: " + (e instanceof Error ? e.message : String(e)));
      }
    } finally {
      if (myReq === reqIdRef.current) setBuscando(false);
    }
  }

  // Pré-busca ao abrir
  useEffect(() => {
    if (!open) {
      setTermo("");
      setCandidatos([]);
      setBuscando(false);
      if (debounceRef.current) window.clearTimeout(debounceRef.current);
      return;
    }
    const inicial = montarTermoInicial(furo);
    setTermo(inicial);
    if (inicial.length >= 2) {
      buscar(inicial);
    } else {
      setCandidatos([]);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, furo?.id]);

  // Debounce ao digitar
  useEffect(() => {
    if (!open) return;
    if (debounceRef.current) window.clearTimeout(debounceRef.current);
    if (termo.trim().length < 2) {
      setCandidatos([]);
      setBuscando(false);
      return;
    }
    debounceRef.current = window.setTimeout(() => {
      buscar(termo);
    }, 350);
    return () => {
      if (debounceRef.current) window.clearTimeout(debounceRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [termo, open]);

  async function vincular(c: Candidato) {
    if (!furo) return;
    setVinculando(c.id);
    try {
      const { data: u } = await supabase.auth.getUser();
      const p_user_id = u.user?.id;
      if (!p_user_id) throw new Error("Sessão expirada — refaça o login");
      const { data, error } = await sb.rpc("conciliar_debito_com_nf", {
        p_mov_id: furo.id,
        p_stage_id: c.id,
        p_user_id,
      });
      if (error) {
        toast.error("Falha: " + error.message);
        return;
      }
      if (data?.ok === false) {
        toast.error("Falha: " + (data?.erro || "erro desconhecido"));
        return;
      }
      if (data?.divergencia_valor) {
        toast.warning("Conciliado com divergência de valor NF x pago — registrado na observação");
      } else {
        toast.success("Débito conciliado com NF");
      }
      onOpenChange(false);
      setTermo("");
      setCandidatos([]);
      onDone();
    } catch (e) {
      toast.error("Falha: " + (e instanceof Error ? e.message : String(e)));
    } finally {
      setVinculando(null);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl">
        <DialogHeader>
          <DialogTitle>Buscar documento para conciliar</DialogTitle>
          <DialogDescription>
            {furo && (
              <span className="text-xs">
                Débito {formatDateBR(furo.data_transacao)} · {furo.descricao || "—"} ·{" "}
                <span className="font-mono font-semibold">{formatBRL(Number(furo.valor))}</span>
              </span>
            )}
          </DialogDescription>
        </DialogHeader>

        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
          <Input
            className="pl-8 pr-8"
            placeholder="Razão social, número da NF ou CNPJ"
            value={termo}
            onChange={(e) => setTermo(e.target.value)}
            autoFocus
          />
          {buscando && (
            <Loader2 className="absolute right-2.5 top-1/2 -translate-y-1/2 h-4 w-4 animate-spin text-muted-foreground" />
          )}
        </div>

        <div className="max-h-[50vh] overflow-y-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Tipo</TableHead>
                <TableHead>NF</TableHead>
                <TableHead>Fornecedor</TableHead>
                <TableHead>Emissão</TableHead>
                <TableHead className="text-right">Valor</TableHead>
                <TableHead className="text-right">Δ</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {candidatos.length === 0 && (
                <TableRow>
                  <TableCell colSpan={7} className="text-center text-xs text-muted-foreground py-6">
                    {buscando
                      ? "Buscando..."
                      : termo.trim().length < 2
                        ? "Digite ao menos 2 caracteres"
                        : "Nenhum documento elegível encontrado"}
                  </TableCell>
                </TableRow>
              )}
              {candidatos.map((c) => {
                const valorFuro = Number(furo?.valor || 0);
                const valorNf = Number(c.valor || 0);
                const diff = valorNf - valorFuro;
                const bate = Math.abs(diff) < 0.01;
                return (
                  <TableRow key={c.id}>
                    <TableCell className="text-xs">
                      <Badge variant="outline" className="text-[10px] uppercase">
                        {c.tipo_documento || "—"}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-xs font-mono">{c.nf_numero || "—"}</TableCell>
                    <TableCell className="text-xs max-w-[240px] truncate" title={c.fornecedor_razao_social || c.fornecedor_cliente || ""}>
                      <div>{c.fornecedor_razao_social || c.fornecedor_cliente || "—"}</div>
                      {c.fornecedor_cnpj && (
                        <div className="text-muted-foreground text-[10px]">{c.fornecedor_cnpj}</div>
                      )}
                    </TableCell>
                    <TableCell className="text-xs whitespace-nowrap">
                      {formatDateBR(c.nf_data_emissao)}
                    </TableCell>
                    <TableCell className="text-xs font-mono text-right whitespace-nowrap">
                      {formatBRL(valorNf)}
                    </TableCell>
                    <TableCell className={cn(
                      "text-xs font-mono text-right whitespace-nowrap",
                      bate ? "text-emerald-600 font-semibold" : "text-muted-foreground",
                    )}>
                      {(diff >= 0 ? "+" : "") + formatBRL(diff)}
                    </TableCell>
                    <TableCell>
                      <Button
                        size="sm"
                        variant="outline"
                        className="gap-1"
                        disabled={vinculando === c.id}
                        onClick={() => vincular(c)}
                      >
                        {vinculando === c.id
                          ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                          : <Link2 className="h-3.5 w-3.5" />}
                        Vincular
                      </Button>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      </DialogContent>
    </Dialog>
  );
}
