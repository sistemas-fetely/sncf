import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Loader2, Sparkles, Search, AlertTriangle, Info } from "lucide-react";
import { cn } from "@/lib/utils";

type Opcao = "vincular_existente" | "criar_novo" | "dispensar";

interface ParceiroResultado {
  id: string;
  razao_social: string;
  nome_fantasia: string | null;
  cnpj: string | null;
  cadastro_incompleto: boolean;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  gedDocumentoId: string;
  classificacaoIa: {
    parceiro_razao_social?: string;
    parceiro_cnpj?: string;
    tipo_documento?: string;
  };
  onResolvido?: () => void;
}

function formatCNPJ(cnpj: string | null | undefined): string {
  if (!cnpj) return "—";
  const d = cnpj.replace(/\D/g, "");
  if (d.length !== 14) return cnpj;
  return `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5, 8)}/${d.slice(8, 12)}-${d.slice(12)}`;
}

export function ResolverParceiroDialog({
  open,
  onOpenChange,
  gedDocumentoId,
  classificacaoIa,
  onResolvido,
}: Props) {
  const qc = useQueryClient();
  const [opcao, setOpcao] = useState<Opcao>("vincular_existente");
  const [termo, setTermo] = useState("");
  const [termoDebounced, setTermoDebounced] = useState("");
  const [resultados, setResultados] = useState<ParceiroResultado[]>([]);
  const [buscando, setBuscando] = useState(false);
  const [parceiroEscolhido, setParceiroEscolhido] = useState<ParceiroResultado | null>(null);

  const [dadosNovo, setDadosNovo] = useState({
    razao_social: "",
    nome_fantasia: "",
    cnpj: "",
  });

  const [salvando, setSalvando] = useState(false);

  // Inicializa ao abrir
  useEffect(() => {
    if (!open) return;
    setOpcao("vincular_existente");
    setParceiroEscolhido(null);
    const razao = classificacaoIa.parceiro_razao_social ?? "";
    const cnpj = classificacaoIa.parceiro_cnpj ?? "";
    setTermo(razao);
    setTermoDebounced(razao);
    setDadosNovo({ razao_social: razao, nome_fantasia: "", cnpj });
  }, [open, classificacaoIa.parceiro_razao_social, classificacaoIa.parceiro_cnpj]);

  // Debounce 400ms
  useEffect(() => {
    const t = setTimeout(() => setTermoDebounced(termo), 400);
    return () => clearTimeout(t);
  }, [termo]);

  // Busca
  useEffect(() => {
    if (!open || opcao !== "vincular_existente") return;
    if (!termoDebounced.trim()) {
      setResultados([]);
      return;
    }
    let cancelado = false;
    setBuscando(true);
    (async () => {
      try {
        const { data, error } = await supabase.rpc("buscar_parceiro_por_cnpj_ou_nome", {
          p_termo: termoDebounced,
        });
        if (error) throw error;
        if (!cancelado) setResultados(((data ?? []) as unknown) as ParceiroResultado[]);
      } catch (e) {
        if (!cancelado)
          toast.error("Erro ao buscar: " + (e instanceof Error ? e.message : String(e)));
      } finally {
        if (!cancelado) setBuscando(false);
      }
    })();
    return () => {
      cancelado = true;
    };
  }, [termoDebounced, opcao, open]);

  async function handleConfirmar() {
    setSalvando(true);
    try {
      let payload: {
        p_ged_documento_id: string;
        p_decisao: string;
        p_parceiro_id?: string | null;
        p_dados_novo_parceiro?: Record<string, unknown> | null;
      };

      if (opcao === "vincular_existente") {
        if (!parceiroEscolhido) throw new Error("Selecione um parceiro");
        payload = {
          p_ged_documento_id: gedDocumentoId,
          p_decisao: "vincular_existente",
          p_parceiro_id: parceiroEscolhido.id,
        };
      } else if (opcao === "criar_novo") {
        if (!dadosNovo.razao_social.trim()) throw new Error("Razão social obrigatória");
        const cnpjLimpo = dadosNovo.cnpj.replace(/\D/g, "");
        if (cnpjLimpo && cnpjLimpo.length !== 14)
          throw new Error("CNPJ deve ter 14 dígitos");
        payload = {
          p_ged_documento_id: gedDocumentoId,
          p_decisao: "criar_novo",
          p_dados_novo_parceiro: {
            razao_social: dadosNovo.razao_social.trim(),
            nome_fantasia: dadosNovo.nome_fantasia.trim() || null,
            cnpj: cnpjLimpo || null,
          },
        };
      } else {
        payload = {
          p_ged_documento_id: gedDocumentoId,
          p_decisao: "dispensar",
        };
      }

      const { data, error } = await supabase.rpc(
        "resolver_parceiro_do_documento",
        payload as never,
      );
      if (error) throw error;

      const res = (data ?? {}) as { ok?: boolean; mensagem?: string; decisao?: string };

      if (res.mensagem) {
        toast.success(res.mensagem);
      } else if (res.decisao === "vincular_existente" || opcao === "vincular_existente") {
        toast.success("Parceiro vinculado");
      } else if (res.decisao === "criar_novo" || opcao === "criar_novo") {
        toast.success("Parceiro cadastrado (cadastro incompleto — complete depois)");
      } else {
        toast.success("Resolução dispensada");
      }

      qc.invalidateQueries({ queryKey: ["repositorio-documentos"] });
      qc.invalidateQueries({ queryKey: ["repositorio-kpis"] });
      onResolvido?.();
      onOpenChange(false);
    } catch (e) {
      toast.error(
        "Erro ao resolver parceiro: " + (e instanceof Error ? e.message : String(e)),
        { duration: 15000 },
      );
    } finally {
      setSalvando(false);
    }
  }

  const podeConfirmar =
    (opcao === "vincular_existente" && !!parceiroEscolhido) ||
    (opcao === "criar_novo" && !!dadosNovo.razao_social.trim()) ||
    opcao === "dispensar";

  return (
    <Dialog open={open} onOpenChange={(v) => !salvando && onOpenChange(v)}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Resolver parceiro do documento</DialogTitle>
          <DialogDescription>
            {classificacaoIa.tipo_documento
              ? `Tipo: ${classificacaoIa.tipo_documento}`
              : "Defina como vincular este documento a um parceiro comercial."}
          </DialogDescription>
        </DialogHeader>

        {/* Bloco IA */}
        <div className="rounded-md border border-[#1A4A3A]/20 bg-[#1A4A3A]/5 p-3">
          <div className="flex items-start gap-2">
            <Sparkles className="h-4 w-4 text-[#1A4A3A] mt-0.5 shrink-0" />
            <div className="space-y-1 text-sm">
              <p className="font-medium text-[#1A4A3A]">A IA identificou no documento:</p>
              <p>
                <span className="text-muted-foreground">Razão social:</span>{" "}
                <span className="font-medium">
                  {classificacaoIa.parceiro_razao_social ?? "—"}
                </span>
              </p>
              <p>
                <span className="text-muted-foreground">CNPJ:</span>{" "}
                <span className="font-mono">{formatCNPJ(classificacaoIa.parceiro_cnpj)}</span>
              </p>
            </div>
          </div>
        </div>

        {/* Opções */}
        <RadioGroup value={opcao} onValueChange={(v) => setOpcao(v as Opcao)} className="space-y-2">
          {/* Opção A */}
          <label
            className={cn(
              "block rounded-md border p-3 cursor-pointer transition",
              opcao === "vincular_existente"
                ? "border-[#1A4A3A] bg-[#1A4A3A]/5"
                : "hover:bg-accent",
            )}
          >
            <div className="flex items-center gap-2">
              <RadioGroupItem value="vincular_existente" />
              <span className="text-sm font-medium">Vincular a parceiro existente</span>
            </div>

            {opcao === "vincular_existente" && (
              <div className="mt-3 space-y-2 pl-6">
                <div className="relative">
                  <Search className="h-4 w-4 absolute left-2.5 top-2.5 text-muted-foreground" />
                  <Input
                    value={termo}
                    onChange={(e) => setTermo(e.target.value)}
                    placeholder="Buscar por nome ou CNPJ..."
                    className="pl-8"
                  />
                </div>

                <div className="space-y-1 max-h-64 overflow-y-auto">
                  {buscando && (
                    <div className="flex items-center gap-2 text-xs text-muted-foreground py-2">
                      <Loader2 className="h-3 w-3 animate-spin" /> Buscando...
                    </div>
                  )}
                  {!buscando && termoDebounced.trim() && resultados.length === 0 && (
                    <p className="text-xs text-muted-foreground py-2">
                      Nenhum parceiro encontrado. Tente "Cadastrar parceiro novo" abaixo.
                    </p>
                  )}
                  {resultados.map((p) => {
                    const sel = parceiroEscolhido?.id === p.id;
                    return (
                      <button
                        key={p.id}
                        type="button"
                        onClick={() => setParceiroEscolhido(p)}
                        className={cn(
                          "w-full text-left rounded-md border p-2 transition",
                          sel
                            ? "border-[#1A4A3A] bg-[#1A4A3A]/5"
                            : "hover:bg-accent border-border",
                        )}
                      >
                        <div className="flex items-center justify-between gap-2">
                          <div className="min-w-0 flex-1">
                            <p className="text-sm font-medium truncate">{p.razao_social}</p>
                            <p className="text-xs text-muted-foreground font-mono">
                              {formatCNPJ(p.cnpj)}
                            </p>
                          </div>
                          {p.cadastro_incompleto && (
                            <Badge
                              variant="outline"
                              className="border-amber-300 bg-amber-50 text-amber-700 text-[10px]"
                            >
                              Cadastro incompleto
                            </Badge>
                          )}
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
          </label>

          {/* Opção B */}
          <label
            className={cn(
              "block rounded-md border p-3 cursor-pointer transition",
              opcao === "criar_novo" ? "border-[#1A4A3A] bg-[#1A4A3A]/5" : "hover:bg-accent",
            )}
          >
            <div className="flex items-center gap-2">
              <RadioGroupItem value="criar_novo" />
              <span className="text-sm font-medium">Cadastrar parceiro novo</span>
            </div>

            {opcao === "criar_novo" && (
              <div className="mt-3 space-y-3 pl-6">
                <div>
                  <Label className="text-xs">Razão social *</Label>
                  <Input
                    value={dadosNovo.razao_social}
                    onChange={(e) =>
                      setDadosNovo((d) => ({ ...d, razao_social: e.target.value }))
                    }
                    placeholder="Razão social"
                  />
                </div>
                <div>
                  <Label className="text-xs">Nome fantasia</Label>
                  <Input
                    value={dadosNovo.nome_fantasia}
                    onChange={(e) =>
                      setDadosNovo((d) => ({ ...d, nome_fantasia: e.target.value }))
                    }
                    placeholder="Opcional"
                  />
                </div>
                <div>
                  <Label className="text-xs">CNPJ</Label>
                  <Input
                    value={dadosNovo.cnpj}
                    onChange={(e) => setDadosNovo((d) => ({ ...d, cnpj: e.target.value }))}
                    placeholder="00.000.000/0000-00"
                    className="font-mono"
                  />
                </div>
                <div className="flex items-start gap-2 rounded-md border border-blue-200 bg-blue-50 p-2 text-xs text-blue-800">
                  <Info className="h-3.5 w-3.5 mt-0.5 shrink-0" />
                  <span>
                    Parceiro será cadastrado com status <strong>incompleto</strong>. Você pode
                    completar endereço, e-mail, etc depois em Parceiros Comerciais.
                  </span>
                </div>
              </div>
            )}
          </label>

          {/* Opção C */}
          <label
            className={cn(
              "block rounded-md border p-3 cursor-pointer transition",
              opcao === "dispensar" ? "border-[#1A4A3A] bg-[#1A4A3A]/5" : "hover:bg-accent",
            )}
          >
            <div className="flex items-center gap-2">
              <RadioGroupItem value="dispensar" />
              <span className="text-sm font-medium">Dispensar (continuar sem parceiro)</span>
            </div>

            {opcao === "dispensar" && (
              <div className="mt-3 pl-6">
                <div className="flex items-start gap-2 rounded-md border border-amber-200 bg-amber-50 p-2 text-xs text-amber-800">
                  <AlertTriangle className="h-3.5 w-3.5 mt-0.5 shrink-0" />
                  <div className="space-y-1">
                    <p>
                      O documento será processado <strong>SEM parceiro vinculado</strong>. Útil
                      para casos onde a IA inferiu errado ou o parceiro não importa para o
                      fluxo.
                    </p>
                    <p>
                      CPRs criadas a partir deste documento ficarão sem parceiro até cadastro
                      manual.
                    </p>
                  </div>
                </div>
              </div>
            )}
          </label>
        </RadioGroup>

        <DialogFooter className="gap-2">
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={salvando}>
            Cancelar
          </Button>
          <Button
            onClick={handleConfirmar}
            disabled={!podeConfirmar || salvando}
            variant={opcao === "dispensar" ? "outline" : "default"}
            className={
              opcao === "dispensar"
                ? ""
                : "bg-[#1A4A3A] hover:bg-[#1A4A3A]/90"
            }
          >
            {salvando && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            Confirmar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
