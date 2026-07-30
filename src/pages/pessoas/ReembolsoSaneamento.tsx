import { Fragment, useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Link } from "react-router-dom";
import {
  Receipt, Check, Pencil, X, KeyRound, UserX, Loader2, ArrowLeft,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Tooltip, TooltipContent, TooltipProvider, TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

interface LinhaSaneamento {
  vinculo_id: string;
  pessoa_id: string;
  nome_completo: string | null;
  tipo_vinculo: string | null;
  cargo: string | null;
  centro_custo_codigo: string | null;
  centro_custo_nome: string | null;
  gestor_nome: string | null;
  email_corporativo: string | null;
  tem_pix: boolean | null;
  falta_email: boolean | null;
  falta_pix: boolean | null;
  falta_gestor: boolean | null;
  falta_centro_custo: boolean | null;
  falta_previsao_contratual: boolean | null;
  contrato_preve_reembolso: boolean | null;
  pronto_para_reembolso: boolean | null;
  tem_login: boolean | null;
}

interface PessoaOpcao { id: string; nome_completo: string | null }
interface CentroCustoOpcao { id: string; codigo: string | null; nome: string | null }

type Filtro = "todos" | "pendentes" | "prontos";

interface Rascunho {
  email_corporativo: string;
  chave_pix: string;
  gestor_pessoa_id: string;
  centro_custo_id: string;
  contrato_preve_reembolso: boolean;
}

export default function ReembolsoSaneamento() {
  const qc = useQueryClient();
  const [filtro, setFiltro] = useState<Filtro>("todos");
  const [editando, setEditando] = useState<string | null>(null);
  const [rascunho, setRascunho] = useState<Rascunho | null>(null);

  const linhasQ = useQuery({
    queryKey: ["reembolso-saneamento"],
    queryFn: async (): Promise<LinhaSaneamento[]> => {
      // Cast só do resultado: a view ainda não consta no types.ts gerado.
      // Remover quando o types.ts for regenerado com vw_reembolso_saneamento.
      const { data, error } = await supabase
        .from("vw_reembolso_saneamento" as never)
        .select("*")
        .order("nome_completo");
      if (error) throw error;
      return (data ?? []) as unknown as LinhaSaneamento[];
    },
  });

  const pessoasQ = useQuery({
    queryKey: ["saneamento-pessoas"],
    queryFn: async (): Promise<PessoaOpcao[]> => {
      const { data, error } = await supabase
        .from("pessoas")
        .select("id,nome_completo")
        .order("nome_completo");
      if (error) throw error;
      return data ?? [];
    },
  });

  const centrosQ = useQuery({
    queryKey: ["saneamento-centros-custo"],
    queryFn: async (): Promise<CentroCustoOpcao[]> => {
      const { data, error } = await supabase
        .from("centros_custo")
        .select("id,codigo,nome")
        .eq("ativo", true)
        .order("codigo");
      if (error) throw error;
      return data ?? [];
    },
  });


  const linhas = linhasQ.data ?? [];

  const resumo = useMemo(() => {
    let prontos = 0, email = 0, pix = 0, gestor = 0, centro = 0, previsao = 0;
    for (const l of linhas) {
      if (l.pronto_para_reembolso) prontos++;
      if (l.falta_email) email++;
      if (l.falta_pix) pix++;
      if (l.falta_gestor) gestor++;
      if (l.falta_centro_custo) centro++;
      if (l.falta_previsao_contratual) previsao++;
    }
    return { prontos, total: linhas.length, email, pix, gestor, centro, previsao };
  }, [linhas]);

  const filtradas = useMemo(() => {
    if (filtro === "pendentes") return linhas.filter((l) => !l.pronto_para_reembolso);
    if (filtro === "prontos") return linhas.filter((l) => l.pronto_para_reembolso);
    return linhas;
  }, [linhas, filtro]);

  const salvar = useMutation({
    mutationFn: async ({ linha, draft }: { linha: LinhaSaneamento; draft: Rascunho }) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const params: Record<string, any> = { p_vinculo_id: linha.vinculo_id };

      const emailOriginal = linha.email_corporativo ?? "";
      if (draft.email_corporativo.trim() && draft.email_corporativo.trim() !== emailOriginal) {
        params.p_email_corporativo = draft.email_corporativo.trim();
      }
      if (draft.chave_pix.trim()) {
        params.p_chave_pix = draft.chave_pix.trim();
      }
      if (draft.gestor_pessoa_id) {
        params.p_gestor_pessoa_id = draft.gestor_pessoa_id;
      }
      if (draft.centro_custo_id) {
        params.p_centro_custo_id = draft.centro_custo_id;
      }
      if (
        linha.tipo_vinculo === "PJ" &&
        draft.contrato_preve_reembolso !== !!linha.contrato_preve_reembolso
      ) {
        params.p_contrato_preve_reembolso = draft.contrato_preve_reembolso;
      }

      if (Object.keys(params).length === 1) {
        throw new Error("Nenhum campo foi alterado.");
      }

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any).rpc("reembolso_sanear_vinculo", params);
      if (error) throw error;
      return data;
    },
    onSuccess: async (data) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const d = data as any;
      const pronto = d?.pronto_para_reembolso;
      toast.success(
        pronto ? "Cadastro salvo — vínculo pronto para reembolso." : "Cadastro atualizado.",
      );
      setEditando(null);
      setRascunho(null);
      await qc.invalidateQueries({ queryKey: ["reembolso-saneamento"] });
    },
    onError: (err) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const e = err as any;
      toast.error(e?.message ?? String(err), {
        description: e?.details || e?.hint || undefined,
      });
    },
  });

  function abrirEdicao(l: LinhaSaneamento) {
    setEditando(l.vinculo_id);
    setRascunho({
      email_corporativo: l.email_corporativo ?? "",
      chave_pix: "",
      gestor_pessoa_id: "",
      centro_custo_id: "",
      contrato_preve_reembolso: !!l.contrato_preve_reembolso,
    });
  }

  return (
    <TooltipProvider delayDuration={200}>
      <div className="p-6 space-y-5">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
              <Receipt className="h-6 w-6" />
              Saneamento de cadastro para reembolso
            </h1>
            <p className="text-sm text-muted-foreground mt-1">
              Complete e-mail corporativo, chave PIX, gestor, centro de custo e previsão
              contratual. O submódulo de reembolso só aceita solicitação de vínculo completo.
            </p>
          </div>
          <Button variant="outline" size="sm" asChild>
            <Link to="/pessoas/reembolsos">
              <ArrowLeft className="h-4 w-4" />
              Voltar
            </Link>
          </Button>
        </div>

        <Card className="card-shadow">
          <CardContent className="flex flex-wrap items-center gap-x-8 gap-y-3 py-4 text-sm">
            <Resumo
              rotulo="Prontos"
              valor={`${resumo.prontos}/${resumo.total}`}
              destaque={resumo.prontos === resumo.total && resumo.total > 0}
            />
            <Resumo rotulo="Sem e-mail" valor={resumo.email} alerta={resumo.email > 0} />
            <Resumo rotulo="Sem PIX" valor={resumo.pix} alerta={resumo.pix > 0} />
            <Resumo rotulo="Sem gestor" valor={resumo.gestor} alerta={resumo.gestor > 0} />
            <Resumo rotulo="Sem centro de custo" valor={resumo.centro} alerta={resumo.centro > 0} />
            <Resumo
              rotulo="Sem previsão contratual"
              valor={resumo.previsao}
              alerta={resumo.previsao > 0}
            />
          </CardContent>
        </Card>

        <div className="flex items-center gap-2">
          {(["todos", "pendentes", "prontos"] as Filtro[]).map((f) => (
            <Button
              key={f}
              size="sm"
              variant={filtro === f ? "default" : "outline"}
              onClick={() => setFiltro(f)}
            >
              {f === "todos" ? "Todos" : f === "pendentes" ? "Só pendentes" : "Só prontos"}
            </Button>
          ))}
          <span className="text-xs text-muted-foreground ml-2">
            {filtradas.length} vínculo{filtradas.length === 1 ? "" : "s"}
          </span>
        </div>

        <div className="rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-[240px]">Pessoa</TableHead>
                <TableHead className="w-[70px]">Vínculo</TableHead>
                <TableHead className="w-[180px]">Cargo</TableHead>
                <TableHead className="w-[170px]">Centro de custo</TableHead>
                <TableHead className="w-[170px]">Gestor</TableHead>
                <TableHead>Pendências</TableHead>
                <TableHead className="w-[110px] text-right">Ação</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {linhasQ.isError ? (
                <TableRow>
                  <TableCell colSpan={7} className="text-center py-12 text-destructive text-sm">
                    {(linhasQ.error as { message?: string })?.message ?? String(linhasQ.error)}
                  </TableCell>
                </TableRow>
              ) : linhasQ.isLoading ? (
                <TableRow>
                  <TableCell colSpan={7} className="text-center py-12 text-muted-foreground">
                    Carregando…
                  </TableCell>
                </TableRow>
              ) : filtradas.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} className="text-center py-12 text-muted-foreground">
                    Nenhum vínculo neste filtro.
                  </TableCell>
                </TableRow>
              ) : (
                filtradas.map((l) => {
                  const emEdicao = editando === l.vinculo_id;
                  const pronto = !!l.pronto_para_reembolso;
                  return (
                    <Fragment key={l.vinculo_id}>
                      <TableRow
                        className={cn(pronto && "bg-success/5")}
                      >
                        <TableCell className="py-2">
                          <div className="flex items-center gap-1.5">
                            {pronto && <Check className="h-3.5 w-3.5 text-success shrink-0" />}
                            <span className="font-medium">{l.nome_completo ?? "—"}</span>
                            {l.tem_login === false && (
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <UserX className="h-3.5 w-3.5 text-muted-foreground cursor-help shrink-0" />
                                </TooltipTrigger>
                                <TooltipContent className="max-w-xs">
                                  Pessoa ainda sem conta de acesso ao sistema. Mesmo com o cadastro
                                  completo, ela não conseguirá enviar reembolso pelo e-mail
                                  corporativo enquanto não tiver login.
                                </TooltipContent>
                              </Tooltip>
                            )}
                          </div>
                          <div className="text-xs text-muted-foreground truncate">
                            {l.email_corporativo ?? "sem e-mail corporativo"}
                          </div>
                        </TableCell>
                        <TableCell className="py-2">
                          <Badge variant="outline" className="font-normal">
                            {l.tipo_vinculo ?? "—"}
                          </Badge>
                        </TableCell>
                        <TableCell className="py-2 text-sm truncate">{l.cargo ?? "—"}</TableCell>
                        <TableCell className="py-2 text-sm">
                          {l.centro_custo_codigo
                            ? `${l.centro_custo_codigo} · ${l.centro_custo_nome ?? ""}`
                            : "—"}
                        </TableCell>
                        <TableCell className="py-2 text-sm">{l.gestor_nome ?? "—"}</TableCell>
                        <TableCell className="py-2">
                          {pronto ? (
                            <Badge className="bg-success/10 text-success border-success/20 font-normal">
                              Pronto para reembolso
                            </Badge>
                          ) : (
                            <div className="flex flex-wrap gap-1">
                              {l.falta_email && <Pendencia>E-mail</Pendencia>}
                              {l.falta_pix && <Pendencia>PIX</Pendencia>}
                              {l.falta_gestor && <Pendencia>Gestor</Pendencia>}
                              {l.falta_centro_custo && <Pendencia>Centro de custo</Pendencia>}
                              {l.falta_previsao_contratual && (
                                <Pendencia>Previsão contratual</Pendencia>
                              )}
                            </div>
                          )}
                        </TableCell>
                        <TableCell className="py-2 text-right">
                          {emEdicao ? (
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => {
                                setEditando(null);
                                setRascunho(null);
                              }}
                            >
                              <X className="h-4 w-4" />
                            </Button>
                          ) : (
                            <Button size="sm" variant="outline" onClick={() => abrirEdicao(l)}>
                              <Pencil className="h-3.5 w-3.5" />
                              Editar
                            </Button>
                          )}
                        </TableCell>
                      </TableRow>

                      {emEdicao && rascunho && (
                        <TableRow className="bg-muted/40">
                          <TableCell colSpan={7} className="py-4">
                            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
                              <div className="space-y-1.5">
                                <Label className="text-xs">E-mail corporativo</Label>
                                <Input
                                  type="email"
                                  value={rascunho.email_corporativo}
                                  placeholder="nome@fetely.com.br"
                                  onChange={(e) =>
                                    setRascunho({ ...rascunho, email_corporativo: e.target.value })
                                  }
                                />
                              </div>

                              <div className="space-y-1.5">
                                <Label className="text-xs flex items-center gap-1.5">
                                  Chave PIX
                                  {l.tem_pix && (
                                    <span className="inline-flex items-center gap-1 text-success">
                                      <KeyRound className="h-3 w-3" />
                                      cadastrada
                                    </span>
                                  )}
                                </Label>
                                <Input
                                  value={rascunho.chave_pix}
                                  placeholder={
                                    l.tem_pix
                                      ? "Digite para substituir a chave atual"
                                      : "CPF, CNPJ, e-mail, telefone ou aleatória"
                                  }
                                  onChange={(e) =>
                                    setRascunho({ ...rascunho, chave_pix: e.target.value })
                                  }
                                />
                              </div>

                              <div className="space-y-1.5">
                                <Label className="text-xs">
                                  Gestor {l.gestor_nome ? `(atual: ${l.gestor_nome})` : ""}
                                </Label>
                                <Select
                                  value={rascunho.gestor_pessoa_id}
                                  onValueChange={(v) =>
                                    setRascunho({ ...rascunho, gestor_pessoa_id: v })
                                  }
                                >
                                  <SelectTrigger>
                                    <SelectValue placeholder="Selecionar gestor" />
                                  </SelectTrigger>
                                  <SelectContent>
                                    {(pessoasQ.data ?? [])
                                      .filter((p) => p.id !== l.pessoa_id)
                                      .map((p) => (
                                        <SelectItem key={p.id} value={p.id}>
                                          {p.nome_completo ?? p.id}
                                        </SelectItem>
                                      ))}
                                  </SelectContent>
                                </Select>
                              </div>

                              <div className="space-y-1.5">
                                <Label className="text-xs">
                                  Centro de custo{" "}
                                  {l.centro_custo_codigo ? `(atual: ${l.centro_custo_codigo})` : ""}
                                </Label>
                                <Select
                                  value={rascunho.centro_custo_id}
                                  onValueChange={(v) =>
                                    setRascunho({ ...rascunho, centro_custo_id: v })
                                  }
                                >
                                  <SelectTrigger>
                                    <SelectValue placeholder="Selecionar centro de custo" />
                                  </SelectTrigger>
                                  <SelectContent>
                                    {(centrosQ.data ?? []).map((c) => (
                                      <SelectItem key={c.id} value={c.id}>
                                        {[c.codigo, c.nome].filter(Boolean).join(" · ")}
                                      </SelectItem>
                                    ))}
                                  </SelectContent>
                                </Select>
                              </div>

                              {l.tipo_vinculo === "PJ" && (
                                <div className="flex items-center gap-2.5 md:col-span-2">
                                  <Switch
                                    id={`preve-${l.vinculo_id}`}
                                    checked={rascunho.contrato_preve_reembolso}
                                    onCheckedChange={(v) =>
                                      setRascunho({ ...rascunho, contrato_preve_reembolso: v })
                                    }
                                  />
                                  <Label htmlFor={`preve-${l.vinculo_id}`} className="text-sm">
                                    Contrato prevê reembolso de despesas
                                  </Label>
                                </div>
                              )}
                            </div>

                            <div className="flex justify-end gap-2 mt-4">
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => {
                                  setEditando(null);
                                  setRascunho(null);
                                }}
                              >
                                Cancelar
                              </Button>
                              <Button
                                size="sm"
                                disabled={salvar.isPending}
                                onClick={() => salvar.mutate({ linha: l, draft: rascunho })}
                              >
                                {salvar.isPending && (
                                  <Loader2 className="h-4 w-4 animate-spin" />
                                )}
                                Salvar
                              </Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      )}
                    </Fragment>
                  );
                })
              )}
            </TableBody>
          </Table>
        </div>
      </div>
    </TooltipProvider>
  );
}

function Pendencia({ children }: { children: React.ReactNode }) {
  return (
    <Badge
      variant="outline"
      className="bg-warning/10 text-warning border-warning/20 font-normal"
    >
      {children}
    </Badge>
  );
}

function Resumo({
  rotulo,
  valor,
  alerta,
  destaque,
}: {
  rotulo: string;
  valor: string | number;
  alerta?: boolean;
  destaque?: boolean;
}) {
  return (
    <div className="flex flex-col">
      <span className="text-xs text-muted-foreground">{rotulo}</span>
      <span
        className={cn(
          "text-xl font-bold tabular-nums",
          destaque && "text-success",
          alerta && "text-warning",
        )}
      >
        {valor}
      </span>
    </div>
  );
}
