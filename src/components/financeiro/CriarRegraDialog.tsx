import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Loader2, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useQueryClient } from "@tanstack/react-query";
import type { NFParsed } from "@/lib/financeiro/types";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  nf: NFParsed | null;
  categoriaId: string | null;
  categoriaNome: string | null;
  centroCusto?: string | null;
  allNfs?: NFParsed[];
  onUpdateAllNfs?: (nfs: NFParsed[]) => void;
}

type TipoRegra = "fornecedor" | "ncm" | "ambos";

export function CriarRegraDialog({
  open,
  onOpenChange,
  nf,
  categoriaId,
  categoriaNome,
  centroCusto,
  allNfs,
  onUpdateAllNfs,
}: Props) {
  const [salvando, setSalvando] = useState(false);
  const [mostrarAplicarLote, setMostrarAplicarLote] = useState(false);
  const [qtdMatch, setQtdMatch] = useState(0);
  const [aplicando, setAplicando] = useState(false);
  const [tipoRegraEscolhida, setTipoRegraEscolhida] = useState<TipoRegra | null>(null);
  const qc = useQueryClient();

  if (!nf || !categoriaId) return null;

  const cnpj = nf.fornecedor_cnpj || null;
  const ncm = nf.nf_ncm || null;
  const ncmPrefixo = ncm ? ncm.substring(0, 4) : null;

  function fechar() {
    setMostrarAplicarLote(false);
    setQtdMatch(0);
    setTipoRegraEscolhida(null);
    onOpenChange(false);
  }

  function contarMatches(tipo: TipoRegra): number {
    if (!allNfs || allNfs.length === 0 || !nf) return 0;
    return allNfs.filter((outra) => {
      if (outra === nf) return false;
      if (
        outra.nf_chave_acesso &&
        nf.nf_chave_acesso &&
        outra.nf_chave_acesso === nf.nf_chave_acesso
      )
        return false;
      if (outra._plano_contas_id) return false;
      if (outra._duplicata) return false;

      let match = false;
      if (tipo === "fornecedor" || tipo === "ambos") {
        const cnpjOutra = outra.fornecedor_cnpj || null;
        if (cnpj && cnpjOutra && cnpj === cnpjOutra) match = true;
      }
      if (!match && (tipo === "ncm" || tipo === "ambos")) {
        if (ncmPrefixo && outra.nf_ncm && outra.nf_ncm.startsWith(ncmPrefixo))
          match = true;
      }
      // Para "ambos", se exigir match em ambos os critérios:
      if (tipo === "ambos" && cnpj && ncmPrefixo) {
        const cnpjOk = outra.fornecedor_cnpj === cnpj;
        const ncmOk = outra.nf_ncm ? outra.nf_ncm.startsWith(ncmPrefixo) : false;
        match = cnpjOk && ncmOk;
      }
      return match;
    }).length;
  }

  async function criarRegra(tipo: TipoRegra) {
    setSalvando(true);
    try {
      const inserts: Array<Record<string, unknown>> = [];

      if ((tipo === "fornecedor" || tipo === "ambos") && cnpj) {
        inserts.push({
          cnpj_emitente: cnpj,
          plano_contas_id: categoriaId,
          centro_custo: centroCusto || null,
          prioridade: 5,
          ativo: true,
        });
      }

      if ((tipo === "ncm" || tipo === "ambos") && ncmPrefixo) {
        inserts.push({
          ncm_prefixo: ncmPrefixo,
          plano_contas_id: categoriaId,
          centro_custo: centroCusto || null,
          prioridade: 10,
          ativo: true,
        });
      }

      if (tipo === "ambos" && cnpj && ncmPrefixo) {
        inserts.push({
          cnpj_emitente: cnpj,
          ncm_prefixo: ncmPrefixo,
          plano_contas_id: categoriaId,
          centro_custo: centroCusto || null,
          prioridade: 1,
          ativo: true,
        });
      }

      for (const ins of inserts) {
        const { error } = await supabase
          .from("regras_categorizacao")
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          .insert(ins as any);
        if (error) throw error;
      }

      qc.invalidateQueries({ queryKey: ["regras-categorizacao"] });

      // Verificar se há outras NFs do lote que dariam match
      const matches = contarMatches(tipo);
      if (matches > 0 && allNfs && onUpdateAllNfs) {
        setTipoRegraEscolhida(tipo);
        setQtdMatch(matches);
        setMostrarAplicarLote(true);
      } else {
        toast.success("Regra criada! Próxima vez será automático.");
        fechar();
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      toast.error("Erro ao criar regra: " + msg);
    } finally {
      setSalvando(false);
    }
  }

  function aplicarNasOutras() {
    if (!allNfs || !onUpdateAllNfs || !tipoRegraEscolhida || !nf) return;
    setAplicando(true);
    let atualizadas = 0;

    const nfsAtualizadas = allNfs.map((outra) => {
      if (outra === nf) return outra;
      if (
        outra.nf_chave_acesso &&
        nf.nf_chave_acesso &&
        outra.nf_chave_acesso === nf.nf_chave_acesso
      )
        return outra;
      if (outra._plano_contas_id) return outra;
      if (outra._duplicata) return outra;

      let deuMatch = false;
      const tipo = tipoRegraEscolhida;
      if (tipo === "fornecedor") {
        if (cnpj && outra.fornecedor_cnpj === cnpj) deuMatch = true;
      } else if (tipo === "ncm") {
        if (ncmPrefixo && outra.nf_ncm && outra.nf_ncm.startsWith(ncmPrefixo))
          deuMatch = true;
      } else if (tipo === "ambos") {
        const cnpjOk = !!cnpj && outra.fornecedor_cnpj === cnpj;
        const ncmOk =
          !!ncmPrefixo && !!outra.nf_ncm && outra.nf_ncm.startsWith(ncmPrefixo);
        deuMatch = cnpjOk && ncmOk;
      }

      if (deuMatch) {
        atualizadas++;
        return {
          ...outra,
          _plano_contas_id: categoriaId,
          _categoria_nome: categoriaNome,
          _regra_origem: tipo === "ncm" ? "ncm" : "parceiro",
        } as NFParsed;
      }
      return outra;
    });

    onUpdateAllNfs(nfsAtualizadas);
    setAplicando(false);
    toast.success(
      `${atualizadas} NF${atualizadas > 1 ? "s" : ""} classificada${
        atualizadas > 1 ? "s" : ""
      } automaticamente!`,
    );
    fechar();
  }

  return (
    <Dialog open={open} onOpenChange={(v) => (v ? onOpenChange(v) : fechar())}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="text-base flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-admin" />
            {mostrarAplicarLote ? "Aplicar no lote?" : "Criar regra automática?"}
          </DialogTitle>
          <DialogDescription>
            {mostrarAplicarLote
              ? "A regra foi salva. Quer aplicá-la nas outras NFs deste lote?"
              : "Na próxima importação, esta categoria será sugerida automaticamente para casos semelhantes."}
          </DialogDescription>
        </DialogHeader>

        {!mostrarAplicarLote && (
          <div className="space-y-2">
            {cnpj && (
              <Button
                variant="outline"
                className="w-full justify-start text-left h-auto py-3"
                onClick={() => criarRegra("fornecedor")}
                disabled={salvando}
              >
                <div className="space-y-1">
                  <p className="font-medium text-sm">
                    Sempre que for {nf.fornecedor_nome}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Qualquer NF desse fornecedor → {categoriaNome}
                  </p>
                </div>
              </Button>
            )}

            {ncmPrefixo && (
              <Button
                variant="outline"
                className="w-full justify-start text-left h-auto py-3"
                onClick={() => criarRegra("ncm")}
                disabled={salvando}
              >
                <div className="space-y-1">
                  <p className="font-medium text-sm">
                    Sempre que NCM começar com {ncmPrefixo}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Qualquer produto com esse NCM → {categoriaNome}
                  </p>
                </div>
              </Button>
            )}

            {cnpj && ncmPrefixo && (
              <Button
                variant="outline"
                className="w-full justify-start text-left h-auto py-3"
                onClick={() => criarRegra("ambos")}
                disabled={salvando}
              >
                <div className="space-y-1">
                  <p className="font-medium text-sm">
                    Fornecedor + NCM (mais específico)
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {nf.fornecedor_nome} com NCM {ncmPrefixo} → {categoriaNome}
                  </p>
                </div>
              </Button>
            )}

            <Button
              variant="ghost"
              className="w-full text-sm text-muted-foreground"
              onClick={fechar}
              disabled={salvando}
            >
              {salvando ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
              Não criar regra (só esta vez)
            </Button>
          </div>
        )}

        {mostrarAplicarLote && (
          <div className="space-y-3 pt-1">
            <p className="text-sm font-medium">
              Encontrei mais {qtdMatch} NF{qtdMatch > 1 ? "s" : ""} sem categoria que{" "}
              {qtdMatch > 1 ? "combinam" : "combina"} com essa regra.
            </p>
            <p className="text-xs text-muted-foreground">
              Quer classificar automaticamente agora? Você ainda pode revisar antes de
              importar.
            </p>
            <div className="flex gap-2 pt-1">
              <Button
                className="flex-1 bg-admin hover:bg-admin/90 text-admin-foreground"
                onClick={aplicarNasOutras}
                disabled={aplicando}
              >
                {aplicando ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                Sim, classificar {qtdMatch} NF{qtdMatch > 1 ? "s" : ""}
              </Button>
              <Button
                variant="outline"
                className="flex-1"
                onClick={() => {
                  toast.success("Regra criada! As outras ficam para classificar manualmente.");
                  fechar();
                }}
                disabled={aplicando}
              >
                Não, só esta
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
