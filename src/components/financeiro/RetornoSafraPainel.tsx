/**
 * Retorno Safra — o que o banco respondeu.
 *
 * Papel: LEITURA + marcação humana. Nenhum botão aqui altera título, dá baixa
 * ou cria movimentação bancária. Rejeição do banco tem que ser visível.
 */
import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { AlertTriangle, Check, FileWarning, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { formatBRL, formatDateBR } from "@/lib/format-currency";
import { formatError } from "@/lib/format-error";
import { BlocoErroBoundary } from "@/components/BlocoErroBoundary";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const sb = supabase as any;

type Pendente = {
  id: string;
  nro_sequencial: number | null;
  data_ocorrencia: string | null;
  codigo_ocorrencia: string | null;
  ocorrencia_descricao: string | null;
  categoria: string | null;
  acao_sugerida: string | null;
  exige_humano: boolean | null;
  motivo_rejeicao: string | null;
  nosso_numero: string | null;
  sacado: string | null;
  titulo_id: string | null;
  numero_titulo: string | null;
  status_titulo: string | null;
  boleto_status: string | null;
  data_vencimento: string | null;
  valor_titulo: number | null;
  valor_pago: number | null;
  valor_juros: number | null;
  data_credito: string | null;
  casado_por: string | null;
  tratado: boolean | null;
  tratado_em: string | null;
  situacao: string;
  eh_orfa: boolean | null;
};


type Arquivo = {
  id: string;
  nro_sequencial: number;
  data_geracao: string | null;
  data_movimento: string | null;
  arquivo_nome: string | null;
  qtd_registros: number | null;
  qtd_liquidacoes: number | null;
  valor_liquidacoes: number | null;
  processado_em: string | null;
  status: string | null;
  erro_detalhe: string | null;
};

type Sequencia = {
  nro_sequencial: number;
  data_movimento: string | null;
  proximo: number | null;
  faltando_entre: string | null;
  situacao: string | null;
};

const SITUACOES_ACAO = ["exige_acao", "sem_titulo", "liquidado_sem_baixa"];

const SITUACAO_ROTULO: Record<string, { label: string; cls: string }> = {
  exige_acao: { label: "Exige ação", cls: "bg-destructive/10 text-destructive" },
  sem_titulo: { label: "Ocorrência órfã (sem título)", cls: "bg-warning/10 text-warning" },
  liquidado_sem_baixa: { label: "Liquidado sem baixa", cls: "bg-warning/10 text-warning" },
  tratado: { label: "Tratado", cls: "bg-success/10 text-success" },
  processado: { label: "Processado", cls: "bg-muted text-muted-foreground" },
};

const ARQUIVO_STATUS: Record<string, string> = {
  importado: "bg-info/10 text-info",
  processado: "bg-success/10 text-success",
  erro: "bg-destructive/10 text-destructive",
};

export function RetornoSafraPainel() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [marcando, setMarcando] = useState<string | null>(null);
  const [de, setDe] = useState("");
  const [ate, setAte] = useState("");
  const [codigo, setCodigo] = useState<string>("todos");

  const { data: ocorrencias = [], isLoading } = useQuery({
    queryKey: ["safra-retorno-pendente"],
    queryFn: async () => {
      const { data, error } = await sb
        .from("vw_safra_retorno_pendente")
        .select("*")
        .order("data_ocorrencia", { ascending: false })
        .limit(1000);
      if (error) throw error;
      return (data || []) as Pendente[];
    },
  });

  const { data: arquivos = [], isLoading: loadingArq } = useQuery({
    queryKey: ["safra-retorno-arquivos"],
    queryFn: async () => {
      const { data, error } = await sb
        .from("safra_retorno_arquivo")
        .select("*")
        .order("nro_sequencial", { ascending: false })
        .limit(200);
      if (error) throw error;
      return (data || []) as Arquivo[];
    },
  });

  const { data: sequencia = [] } = useQuery({
    queryKey: ["safra-retorno-sequencia"],
    queryFn: async () => {
      const { data, error } = await sb
        .from("vw_safra_retorno_sequencia")
        .select("*")
        .order("nro_sequencial", { ascending: true });
      if (error) throw error;
      return (data || []) as Sequencia[];
    },
  });

  const exigeAcao = useMemo(
    () => ocorrencias.filter((o) => SITUACOES_ACAO.includes(o.situacao)),
    [ocorrencias]
  );

  const codigos = useMemo(() => {
    const set = new Map<string, string>();
    for (const o of ocorrencias) {
      if (o.codigo_ocorrencia)
        set.set(o.codigo_ocorrencia, `${o.codigo_ocorrencia} — ${o.ocorrencia_descricao || "?"}`);
    }
    return Array.from(set.entries()).sort((a, b) => a[0].localeCompare(b[0]));
  }, [ocorrencias]);

  const processados = useMemo(() => {
    return ocorrencias.filter((o) => {
      if (SITUACOES_ACAO.includes(o.situacao)) return false;
      if (codigo !== "todos" && o.codigo_ocorrencia !== codigo) return false;
      const d = o.data_ocorrencia || "";
      if (de && d && d < de) return false;
      if (ate && d && d > ate) return false;
      return true;
    });
  }, [ocorrencias, codigo, de, ate]);

  const buracos = useMemo(
    () => sequencia.filter((s) => s.situacao === "sequencia_quebrada"),
    [sequencia]
  );

  async function marcarTratado(id: string) {
    if (!user) {
      toast.error("Sessão expirada — entre novamente para marcar como tratado.");
      return;
    }
    setMarcando(id);
    try {
      const { error } = await sb
        .from("safra_retorno_ocorrencia")
        .update({ tratado: true, tratado_em: new Date().toISOString(), tratado_por: user.id })
        .eq("id", id);
      if (error) throw error;
      toast.success("Ocorrência marcada como tratada.");
      await qc.invalidateQueries({ queryKey: ["safra-retorno-pendente"] });
    } catch (e) {
      toast.error("Falha ao marcar como tratado: " + formatError(e));
    } finally {
      setMarcando(null);
    }
  }

  return (
    <BlocoErroBoundary titulo="O painel de Retorno Safra falhou">
      <div className="space-y-4">
        <div>
          <h2 className="text-lg font-medium">Retorno Safra</h2>
          <p className="text-xs text-muted-foreground">
            O que o banco respondeu ao nosso arquivo de remessa. Este painel só registra e marca —
            nenhuma baixa de título acontece aqui.
          </p>
        </div>

        {buracos.length > 0 && (
          <div className="rounded-md border border-destructive/40 bg-destructive/5 p-3 space-y-1">
            <p className="flex items-center gap-2 text-sm font-medium text-destructive">
              <AlertTriangle className="h-4 w-4" />
              Sequência de retorno quebrada — arquivo não baixado
            </p>
            {buracos.map((b) => (
              <p key={b.nro_sequencial} className="text-xs text-destructive/90">
                Entre o arquivo {b.nro_sequencial} e o {b.proximo ?? "?"} faltam:{" "}
                <span className="font-medium">{b.faltando_entre || "—"}</span>
              </p>
            ))}
          </div>
        )}

        {/* EXIGE AÇÃO */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">
              Exige ação{" "}
              <span className="text-sm font-normal text-muted-foreground">
                ({exigeAcao.length})
              </span>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {isLoading ? (
              <Skeleton className="h-16 w-full" />
            ) : exigeAcao.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                Nenhuma resposta do banco pendente de ação.
              </p>
            ) : (
              exigeAcao.map((o) => {
                const cfg = SITUACAO_ROTULO[o.situacao] ?? SITUACAO_ROTULO.processado;
                return (
                  <div key={o.id} className="rounded-md border p-3 space-y-2">
                    <div className="flex flex-wrap items-center gap-2 text-sm">
                      <Badge className={cfg.cls}>{cfg.label}</Badge>
                      {o.eh_orfa && o.situacao !== "sem_titulo" && (
                        <Badge className="bg-warning/10 text-warning">órfã</Badge>
                      )}

                      <span className="font-medium">
                        {o.codigo_ocorrencia} — {o.ocorrencia_descricao || "ocorrência desconhecida"}
                      </span>
                      {o.motivo_rejeicao && (
                        <Badge variant="outline">motivo {o.motivo_rejeicao}</Badge>
                      )}
                      <span className="text-muted-foreground">
                        {formatDateBR(o.data_ocorrencia)}
                      </span>
                    </div>
                    <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
                      <span className="text-foreground">{o.sacado || "sacado não informado"}</span>
                      <span>Valor {formatBRL(o.valor_titulo)}</span>
                      {o.valor_pago ? <span>Pago {formatBRL(o.valor_pago)}</span> : null}
                      <span>Venc. {formatDateBR(o.data_vencimento)}</span>
                      <span>
                        {o.numero_titulo
                          ? `Título ${o.numero_titulo}${o.casado_por ? ` (casado por ${o.casado_por})` : ""}`
                          : "Sem título vinculado"}
                      </span>
                      {o.nosso_numero && <span>NN {o.nosso_numero}</span>}
                      {o.nro_sequencial != null && <span>Arquivo {o.nro_sequencial}</span>}
                    </div>
                    {o.acao_sugerida && (
                      <p className="rounded-md bg-warning/10 px-3 py-2 text-sm font-medium text-warning">
                        {o.acao_sugerida}
                      </p>
                    )}
                    <Button
                      size="sm"
                      variant="outline"
                      className="gap-2"
                      disabled={marcando === o.id}
                      onClick={() => marcarTratado(o.id)}
                    >
                      {marcando === o.id ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <Check className="h-3.5 w-3.5" />
                      )}
                      Marcar como tratado
                    </Button>
                  </div>
                );
              })
            )}
          </CardContent>
        </Card>

        {/* PROCESSADOS */}
        <Card>
          <CardHeader className="space-y-3">
            <CardTitle className="text-base">
              Processados{" "}
              <span className="text-sm font-normal text-muted-foreground">
                ({processados.length})
              </span>
            </CardTitle>
            <div className="flex flex-wrap items-end gap-3">
              <div>
                <Label className="text-xs">De</Label>
                <Input type="date" value={de} onChange={(e) => setDe(e.target.value)} className="h-8" />
              </div>
              <div>
                <Label className="text-xs">Até</Label>
                <Input type="date" value={ate} onChange={(e) => setAte(e.target.value)} className="h-8" />
              </div>
              <div className="min-w-[260px]">
                <Label className="text-xs">Código de ocorrência</Label>
                <Select value={codigo} onValueChange={setCodigo}>
                  <SelectTrigger className="h-8"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="todos">Todos</SelectItem>
                    {codigos.map(([c, label]) => (
                      <SelectItem key={c} value={c}>{label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <Skeleton className="h-24 w-full" />
            ) : processados.length === 0 ? (
              <p className="text-sm text-muted-foreground">Nenhuma ocorrência no filtro.</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Data</TableHead>
                    <TableHead>Ocorrência</TableHead>
                    <TableHead>Sacado</TableHead>
                    <TableHead>Título</TableHead>
                    <TableHead className="text-right">Valor</TableHead>
                    <TableHead className="text-right">Pago</TableHead>
                    <TableHead>Situação</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {processados.map((o) => {
                    const cfg = SITUACAO_ROTULO[o.situacao] ?? SITUACAO_ROTULO.processado;
                    return (
                      <TableRow key={o.id}>
                        <TableCell className="whitespace-nowrap">
                          {formatDateBR(o.data_ocorrencia)}
                        </TableCell>
                        <TableCell className="text-xs">
                          {o.codigo_ocorrencia} — {o.ocorrencia_descricao || "?"}
                        </TableCell>
                        <TableCell className="text-xs">{o.sacado || "—"}</TableCell>
                        <TableCell className="text-xs">{o.numero_titulo || "—"}</TableCell>
                        <TableCell className="text-right tabular-nums">
                          {formatBRL(o.valor_titulo)}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          {o.valor_pago ? formatBRL(o.valor_pago) : "—"}
                        </TableCell>
                        <TableCell>
                          <div className="flex flex-wrap gap-2">
                            <Badge className={cfg.cls}>{cfg.label}</Badge>
                            {o.eh_orfa && (
                              <Badge className="bg-warning/10 text-warning">órfã</Badge>
                            )}
                          </div>
                        </TableCell>

                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>

        {/* ARQUIVOS */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <FileWarning className="h-4 w-4" />
              Arquivos de retorno
            </CardTitle>
          </CardHeader>
          <CardContent>
            {loadingArq ? (
              <Skeleton className="h-24 w-full" />
            ) : arquivos.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                Nenhum arquivo de retorno importado. A importação é feita em Importar Extratos,
                bloco 2 (Relatórios auxiliares).
              </p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Seq.</TableHead>
                    <TableHead>Arquivo</TableHead>
                    <TableHead>Geração</TableHead>
                    <TableHead>Movimento</TableHead>
                    <TableHead className="text-right">Registros</TableHead>
                    <TableHead className="text-right">Liquidações</TableHead>
                    <TableHead className="text-right">Valor liquidado</TableHead>
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {arquivos.map((a) => (
                    <TableRow key={a.id}>
                      <TableCell className="tabular-nums">{a.nro_sequencial}</TableCell>
                      <TableCell className="text-xs">
                        {a.arquivo_nome || "—"}
                        {a.erro_detalhe && (
                          <p className="text-destructive">{a.erro_detalhe}</p>
                        )}
                      </TableCell>
                      <TableCell className="whitespace-nowrap">{formatDateBR(a.data_geracao)}</TableCell>
                      <TableCell className="whitespace-nowrap">{formatDateBR(a.data_movimento)}</TableCell>
                      <TableCell className="text-right tabular-nums">{a.qtd_registros ?? 0}</TableCell>
                      <TableCell className="text-right tabular-nums">{a.qtd_liquidacoes ?? 0}</TableCell>
                      <TableCell className="text-right tabular-nums">
                        {formatBRL(a.valor_liquidacoes)}
                      </TableCell>
                      <TableCell>
                        <Badge className={ARQUIVO_STATUS[a.status || ""] || "bg-muted text-muted-foreground"}>
                          {a.status || "—"}
                        </Badge>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>
    </BlocoErroBoundary>
  );
}
