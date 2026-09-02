/**
 * MeuCadastro — CADASTRO-EM-FASES, fatia D (02/09/2026).
 *
 * A pessoa logada completa o que só ela pode informar. Não há link público,
 * token ou convite — esse aparato saiu do banco.
 *
 * Leitura: vw_meu_cadastro_pendencia (já filtrada por auth.uid()).
 * Escrita: fn_meu_cadastro_autodeclarar — a pessoa não tem UPDATE em pessoas.
 * Documentos: bucket documentos-cadastro, caminho {pessoa_id}/{tipo}.{ext}.
 */

import { useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { ClipboardCheck } from "lucide-react";
import { toast } from "sonner";

import { supabase } from "@/integrations/supabase/client";
import { PageShell } from "@/components/layout/PageShell";
import { PageHeader } from "@/components/layout/PageHeader";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import UploadDocumentosCadastro, { type UploadedFile } from "@/components/pessoas/UploadDocumentosCadastro";
import { fmtData } from "@/lib/data";
import { formatError } from "@/lib/format-error";

const ETNIAS = ["Branca", "Preta", "Parda", "Amarela", "Indígena", "Prefiro não informar"] as const;
const PCD_TIPOS = ["Não", "Física", "Auditiva", "Visual", "Intelectual", "Múltipla", "Reabilitado INSS"] as const;
const TAMANHOS = ["PP", "P", "M", "G", "GG", "XGG"] as const;

const DOCUMENTOS = [
  { key: "rg_cnh", label: "RG ou CNH" },
  { key: "comprovante_residencia", label: "Comprovante de residência" },
  { key: "cartao_cnpj", label: "Cartão CNPJ" },
  { key: "contrato_social", label: "Contrato social ou MEI" },
  { key: "comprovante_conta_bancaria", label: "Comprovante da conta bancária" },
];

const LEGENDA_AUTO = "Autodeclaração. Você pode deixar em branco.";

interface Pendencia {
  vinculo_id: string;
  pessoa_id: string;
  pessoa: string | null;
  fase: string | null;
  fase_nome: string | null;
  ordem: number | null;
  entidade: string | null;
  campo: string | null;
  rotulo: string | null;
  obrigatorio: boolean | null;
  responsavel: string | null;
  prazo_em: string | null;
  situacao: string | null;
}

type Campos = {
  nome_social: string;
  contato_emergencia_nome: string;
  contato_emergencia_telefone: string;
  contato_emergencia_parentesco: string;
  etnia: string;
  pcd_tipo: string;
  info_saude: string;
  tamanho_camiseta: string;
};

const VAZIO: Campos = {
  nome_social: "",
  contato_emergencia_nome: "",
  contato_emergencia_telefone: "",
  contato_emergencia_parentesco: "",
  etnia: "",
  pcd_tipo: "",
  info_saude: "",
  tamanho_camiseta: "",
};

function mascaraTelefone(v: string) {
  const d = v.replace(/\D/g, "").slice(0, 11);
  if (d.length <= 2) return d.length ? `(${d}` : "";
  if (d.length <= 6) return `(${d.slice(0, 2)}) ${d.slice(2)}`;
  if (d.length <= 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
}

export default function MeuCadastro() {
  const qc = useQueryClient();
  const [form, setForm] = useState<Campos | null>(null);
  const [base, setBase] = useState<Campos>(VAZIO);
  const [tocados, setTocados] = useState<Record<string, boolean>>({});
  const [tentouSalvar, setTentouSalvar] = useState(false);
  const [arquivos, setArquivos] = useState<UploadedFile[]>([]);

  const { data: pendencias, isLoading, error } = useQuery({
    queryKey: ["meu-cadastro-pendencia"],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("vw_meu_cadastro_pendencia")
        .select("*")
        .order("ordem", { ascending: true });
      if (error) throw error;
      return (data || []) as Pendencia[];
    },
  });

  const pessoaId = pendencias?.[0]?.pessoa_id ?? null;

  // Valores atuais da autodeclaração — leitura da própria linha em pessoas.
  useQuery({
    queryKey: ["meu-cadastro-valores", pessoaId],
    enabled: !!pessoaId,
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("pessoas")
        .select(
          "nome_social, contato_emergencia_nome, contato_emergencia_telefone, contato_emergencia_parentesco, etnia, pcd_tipo, info_saude, tamanho_camiseta"
        )
        .eq("id", pessoaId)
        .maybeSingle();
      if (error) throw error;
      const atual: Campos = {
        nome_social: data?.nome_social ?? "",
        contato_emergencia_nome: data?.contato_emergencia_nome ?? "",
        contato_emergencia_telefone: data?.contato_emergencia_telefone
          ? mascaraTelefone(data.contato_emergencia_telefone)
          : "",
        contato_emergencia_parentesco: data?.contato_emergencia_parentesco ?? "",
        etnia: data?.etnia ?? "",
        pcd_tipo: data?.pcd_tipo ?? "",
        info_saude: data?.info_saude ?? "",
        tamanho_camiseta: data?.tamanho_camiseta ?? "",
      };
      setBase(atual);
      setForm((f) => f ?? atual);
      return atual;
    },
  });

  const valores = form ?? base;

  const obrigatorias = useMemo(
    () => (pendencias || []).filter((p) => p.obrigatorio),
    [pendencias]
  );

  const grupos = useMemo(() => {
    const m = new Map<string, Pendencia[]>();
    for (const p of obrigatorias) {
      const chave = p.fase_nome || "Sem fase";
      m.set(chave, [...(m.get(chave) || []), p]);
    }
    return Array.from(m);
  }, [obrigatorias]);

  const prazoMaisProximo = useMemo(() => {
    const prazos = obrigatorias.map((p) => p.prazo_em).filter(Boolean) as string[];
    return prazos.length ? prazos.sort()[0] : null;
  }, [obrigatorias]);

  const set = (patch: Partial<Campos>) => setForm({ ...valores, ...patch });

  const erroTelefone =
    valores.contato_emergencia_telefone &&
    valores.contato_emergencia_telefone.replace(/\D/g, "").length < 10
      ? "Informe o telefone com DDD, por exemplo (11) 99999-9999."
      : null;

  const mostrarErro = (campo: string) => tentouSalvar || tocados[campo];

  const salvar = useMutation({
    mutationFn: async () => {
      if (erroTelefone) throw new Error(erroTelefone);
      const alterados: Record<string, string | null> = {};
      (Object.keys(VAZIO) as (keyof Campos)[]).forEach((k) => {
        const atualBase = base[k];
        let novo: string = valores[k];
        if (k === "contato_emergencia_telefone") novo = novo.replace(/\D/g, "");
        const comparavel =
          k === "contato_emergencia_telefone" ? atualBase.replace(/\D/g, "") : atualBase;
        if (novo !== comparavel) alterados[k] = novo === "" ? null : novo;
      });
      if (Object.keys(alterados).length === 0) return { sem_mudanca: true };
      const { data, error } = await (supabase as any).rpc("fn_meu_cadastro_autodeclarar", {
        p_dados: alterados,
      });
      if (error) throw error;
      return data;
    },
    onSuccess: async (r: any) => {
      if (r?.sem_mudanca) {
        toast.info("Nada mudou desde a última vez.");
        return;
      }
      toast.success("Respostas salvas");
      setBase(valores);
      await qc.invalidateQueries({ queryKey: ["meu-cadastro-pendencia"] });
      await qc.invalidateQueries({ queryKey: ["meu-cadastro-valores"] });
    },
    onError: (e) => toast.error(formatError(e)),
  });

  const estado = isLoading
    ? "Carregando…"
    : obrigatorias.length === 0
      ? "Nada pendente por aqui."
      : `${obrigatorias.length} ${obrigatorias.length === 1 ? "item pendente" : "itens pendentes"}${
          prazoMaisProximo ? ` · o mais urgente vence em ${fmtData(prazoMaisProximo)}` : ""
        }`;

  return (
    <PageShell variant="leitura">
      <PageHeader icone={ClipboardCheck} titulo="Complete seu cadastro" estado={estado} />

      {error ? (
        <Card>
          <CardContent className="py-6 text-sm text-destructive">{formatError(error)}</CardContent>
        </Card>
      ) : isLoading ? (
        <p className="text-sm text-muted-foreground">Carregando…</p>
      ) : !pessoaId ? (
        <Card>
          <CardContent className="py-6 text-sm text-muted-foreground">
            Não encontramos um vínculo ativo na sua conta. Procure o SOps.
          </CardContent>
        </Card>
      ) : (
        <>
          {/* Bloco 1 — O que falta */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">O que falta</CardTitle>
            </CardHeader>
            <CardContent>
              {obrigatorias.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  Seu cadastro está completo. Nada pendente por aqui.
                </p>
              ) : (
                <div className="space-y-4">
                  {grupos.map(([fase, itens]) => (
                    <div key={fase} className="space-y-1.5">
                      <p className="text-[10px] uppercase tracking-widest text-muted-foreground">{fase}</p>
                      <ul className="space-y-1 text-sm">
                        {itens.map((p) => {
                          const atrasado = p.situacao === "atrasado";
                          const daPessoa = p.responsavel === "pessoa";
                          return (
                            <li key={`${p.entidade}-${p.campo}`} className="flex flex-wrap items-center gap-2">
                              <Badge variant={daPessoa ? "default" : "outline"}>
                                {daPessoa ? "Você" : p.responsavel || "outra pessoa"}
                              </Badge>
                              <span className={atrasado ? "font-medium text-destructive" : "font-medium"}>
                                {p.rotulo || p.campo}
                              </span>
                              <span className="text-xs text-muted-foreground">
                                prazo {p.prazo_em ? fmtData(p.prazo_em) : "—"}
                                {atrasado ? " · atrasado" : p.situacao === "vence_hoje" ? " · vence hoje" : ""}
                              </span>
                            </li>
                          );
                        })}
                      </ul>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Bloco 2 — Só você pode responder */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Só você pode responder</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <Label htmlFor="nome_social">Como você prefere ser chamada</Label>
                <Input
                  id="nome_social"
                  value={valores.nome_social}
                  placeholder="Ana"
                  onChange={(e) => set({ nome_social: e.target.value })}
                />
              </div>

              <div>
                <Label htmlFor="ce_nome">Contato de emergência</Label>
                <Input
                  id="ce_nome"
                  value={valores.contato_emergencia_nome}
                  placeholder="Maria Souza"
                  onChange={(e) => set({ contato_emergencia_nome: e.target.value })}
                />
              </div>

              <div>
                <Label htmlFor="ce_tel">Telefone do contato de emergência</Label>
                <Input
                  id="ce_tel"
                  value={valores.contato_emergencia_telefone}
                  placeholder="(11) 99999-9999"
                  onBlur={() => setTocados((t) => ({ ...t, contato_emergencia_telefone: true }))}
                  onChange={(e) => set({ contato_emergencia_telefone: mascaraTelefone(e.target.value) })}
                />
                {erroTelefone && mostrarErro("contato_emergencia_telefone") && (
                  <p className="mt-1 text-[11px] text-destructive">{erroTelefone}</p>
                )}
              </div>

              <div>
                <Label htmlFor="ce_par">Parentesco / relação</Label>
                <Input
                  id="ce_par"
                  value={valores.contato_emergencia_parentesco}
                  placeholder="Mãe"
                  onChange={(e) => set({ contato_emergencia_parentesco: e.target.value })}
                />
              </div>

              <div>
                <Label>Cor / raça</Label>
                <Select value={valores.etnia} onValueChange={(v) => set({ etnia: v })}>
                  <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                  <SelectContent>
                    {ETNIAS.map((o) => <SelectItem key={o} value={o}>{o}</SelectItem>)}
                  </SelectContent>
                </Select>
                <p className="mt-1 text-[11px] text-muted-foreground">{LEGENDA_AUTO}</p>
              </div>

              <div>
                <Label>Pessoa com deficiência</Label>
                <Select value={valores.pcd_tipo} onValueChange={(v) => set({ pcd_tipo: v })}>
                  <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                  <SelectContent>
                    {PCD_TIPOS.map((o) => <SelectItem key={o} value={o}>{o}</SelectItem>)}
                  </SelectContent>
                </Select>
                <p className="mt-1 text-[11px] text-muted-foreground">{LEGENDA_AUTO}</p>
              </div>

              <div>
                <Label htmlFor="info_saude">
                  Informação de saúde que a empresa precise saber (opcional)
                </Label>
                <Textarea
                  id="info_saude"
                  value={valores.info_saude}
                  placeholder="Alergia a dipirona"
                  onChange={(e) => set({ info_saude: e.target.value })}
                />
                <p className="mt-1 text-[11px] text-muted-foreground">
                  {LEGENDA_AUTO} Dado sensível — visível apenas para o SOps.
                </p>
              </div>

              <div>
                <Label>Tamanho de camiseta</Label>
                <Select value={valores.tamanho_camiseta} onValueChange={(v) => set({ tamanho_camiseta: v })}>
                  <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                  <SelectContent>
                    {TAMANHOS.map((o) => <SelectItem key={o} value={o}>{o}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </CardContent>
          </Card>

          {/* Bloco 3 — Seus documentos */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Seus documentos</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <p className="text-sm text-muted-foreground">
                Envie a foto ou o PDF. Você não precisa digitar nada — o SOps lê os dados dos documentos.
              </p>
              <UploadDocumentosCadastro
                pessoaId={pessoaId}
                documentos={DOCUMENTOS}
                uploadedFiles={arquivos}
                onFilesChange={setArquivos}
              />
            </CardContent>
          </Card>

          <div className="flex items-center justify-between pt-2">
            <Button
              type="button"
              variant="ghost"
              onClick={() => {
                setForm(base);
                setTocados({});
                setTentouSalvar(false);
              }}
            >
              Cancelar
            </Button>
            <Button
              type="button"
              disabled={salvar.isPending}
              onClick={() => {
                setTentouSalvar(true);
                salvar.mutate();
              }}
            >
              {salvar.isPending ? "Salvando…" : "Salvar minhas respostas"}
            </Button>
          </div>
        </>
      )}
    </PageShell>
  );
}
