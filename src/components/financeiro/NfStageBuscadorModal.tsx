import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Search } from "lucide-react";
import { toast } from "sonner";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  valorEsperado?: number;
  fornecedorEsperado?: string;
  parceiroId?: string | null;
  onSelecionar: (nfStageId: string) => void;
}

const TIPO_LABEL: Record<string, string> = {
  nfe: "NF-e",
  nfse: "NFS-e",
  recibo: "Recibo",
};

export function NfStageBuscadorModal({
  open,
  onOpenChange,
  valorEsperado,
  fornecedorEsperado,
  parceiroId,
  onSelecionar,
}: Props) {
  const [busca, setBusca] = useState("");

  const { data: nfs } = useQuery({
    queryKey: ["nf-stage-buscador", busca, valorEsperado, fornecedorEsperado, parceiroId, open],
    enabled: open,
    queryFn: async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      let query = (supabase as any)
        .from("nfs_stage")
        .select("id, tipo_documento, fornecedor_razao_social, nf_numero, valor, nf_data_emissao, status")
        .neq("status", "vinculada")
        .order("nf_data_emissao", { ascending: false })
        .limit(50);

      const termo = busca.trim();

      if (termo) {
        // PRIORIDADE 1: busca digitada
        query = query.or(
          `fornecedor_razao_social.ilike.%${termo}%,nf_numero.ilike.%${termo}%,fornecedor_cliente.ilike.%${termo}%`,
        );
      } else if (parceiroId) {
        // PRIORIDADE 2: usa parceiro_id pra buscar palavra-chave do nome
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { data: parceiro } = await (supabase as any)
          .from("parceiros_comerciais")
          .select("razao_social, nome_fantasia")
          .eq("id", parceiroId)
          .single();

        const nome = parceiro?.razao_social || parceiro?.nome_fantasia || "";
        // Pega primeira palavra de pelo menos 3 chars, ignorando "ABCasa-Assoc" etc
        const palavraChave = nome
          .split(/[\s\-,.]+/)
          .find((p: string) => p.length >= 3);

        if (palavraChave) {
          query = query.or(
            `fornecedor_razao_social.ilike.%${palavraChave}%,fornecedor_cliente.ilike.%${palavraChave}%`,
          );
        }
      } else if (fornecedorEsperado) {
        // PRIORIDADE 3: fallback antigo
        const palavraChave = fornecedorEsperado.split(/[\s\-,.]+/).find((p: string) => p.length >= 3);
        if (palavraChave) {
          query = query.or(
            `fornecedor_razao_social.ilike.%${palavraChave}%,fornecedor_cliente.ilike.%${palavraChave}%`,
          );
        }
      }

      const { data } = await query;
      return data || [];
    },
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Anexar NF do Repositório</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Buscar por fornecedor ou número da NF..."
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
              className="pl-9"
            />
          </div>
          {valorEsperado ? (
            <p className="text-xs text-muted-foreground">
              Despesa de R$ {valorEsperado.toFixed(2)} — sugerindo NFs de fornecedor compatível.
            </p>
          ) : null}
          <div className="space-y-2 max-h-96 overflow-y-auto">
            {!nfs || nfs.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-8">
                Nenhuma NF encontrada. Importe primeiro pelo Repositório.
              </p>
            ) : (
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              nfs.map((nf: any) => {
                const valorMatch =
                  valorEsperado && Math.abs(Number(nf.valor) - valorEsperado) < 0.01;
                return (
                  <button
                    key={nf.id}
                    type="button"
                    onClick={async () => {
                      if (parceiroId) {
                        try {
                          // eslint-disable-next-line @typescript-eslint/no-explicit-any
                          const { data: resultado, error } = await (supabase as any)
                            .rpc("vincular_nf_a_parceiro", {
                              p_nf_stage_id: nf.id,
                              p_parceiro_id: parceiroId,
                            });
                          if (error) {
                            toast.error("Erro ao vincular: " + error.message);
                            return;
                          }
                          if (resultado?.mudancas_parceiro?.length > 0) {
                            const m = resultado.mudancas_parceiro[0];
                            toast.success(
                              `Parceiro atualizado: ${m.antes || "(vazio)"} → ${m.depois}`,
                              { duration: 4000 }
                            );
                          }
                          if (resultado?.cascata_outras_nfs > 0) {
                            const n = resultado.cascata_outras_nfs;
                            toast.info(
                              `${n} outra${n === 1 ? "" : "s"} NF${n === 1 ? "" : "s"} do mesmo fornecedor também foi${n === 1 ? "" : "ram"} vinculada${n === 1 ? "" : "s"}`,
                              { duration: 4000 }
                            );
                          }
                        } catch (e) {
                          const msg = e instanceof Error ? e.message : String(e);
                          toast.error("Erro: " + msg);
                          return;
                        }
                      }
                      onSelecionar(nf.id);
                    }}
                    className={`w-full text-left p-3 border rounded-md hover:bg-muted/50 transition-colors ${
                      valorMatch ? "border-success/40 bg-success/50" : ""
                    }`}
                  >
                    <div className="flex items-center gap-2 flex-wrap">
                      <Badge variant="outline" className="text-[10px]">
                        {TIPO_LABEL[nf.tipo_documento] || nf.tipo_documento}
                      </Badge>
                      <span className="text-sm font-medium">{nf.fornecedor_razao_social}</span>
                      {valorMatch && (
                        <Badge className="bg-success/10 text-success hover:bg-success/10 text-[10px]">
                          Valor bate
                        </Badge>
                      )}
                    </div>
                    <div className="text-xs text-muted-foreground mt-1">
                      NF {nf.nf_numero} · R$ {Number(nf.valor).toFixed(2)} ·{" "}
                      {nf.nf_data_emissao || "sem data"}
                    </div>
                  </button>
                );
              })
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
