import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Loader2, AlertTriangle, CheckCircle2, ExternalLink, RefreshCw } from "lucide-react";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { formatError } from "@/lib/format-error";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { fmtMoeda, VERDE } from "@/lib/compras/lancamento-utils";

interface StageRow {
  nfs_stage_id: string;
  nf_numero: string | null;
  nf_serie: string | null;
  nf_data_emissao: string | null;
  nf_chave_acesso: string | null;
  fornecedor_cnpj: string | null;
  fornecedor_razao_social: string | null;
  fornecedor_id: string | null;
  fornecedor: string | null;
  apelido: string | null;
  valor_no_xml: number | null;
  itens: number | null;
  ja_lancada: boolean | null;
  pedidos_do_fornecedor: number | null;
  itens_ncm_produto: number | null;
  itens_com_depara: number | null;
  classificacao: string | null;
}

interface PreviaXml {
  nf_existe?: boolean;
  linhas?: number;
  soma_linhas?: number;
  valor_produtos_informado?: number;
  divergencia?: number;
  linhas_sem_depara?: number;
  itens_lidos_do_xml?: number;
  valor_produtos_derivado?: number;
  valor_total_no_xml?: number;
  ipi_implicito?: number;
  fornecedor_id?: string;
  nfs_stage_id?: string;
  itens?: Array<{
    item_seq: number;
    codigo_nf: string;
    ncm: string | null;
    quantidade: number;
    valor_unit: number;
    valor_total: number;
    status: string;
  }>;
  nf_id?: number;
  linhas_gravadas?: number;
}

const CLASSIF: Record<string, { label: string; className: string }> = {
  mercadoria: {
    label: "Mercadoria",
    className: "border-success/40 bg-success/10 text-success",
  },
  possivel: {
    label: "Possível mercadoria",
    className: "border-warning/40 bg-warning/10 text-warning",
  },
  nao_mercadoria: {
    label: "Provavelmente não é mercadoria",
    className: "border-muted-foreground/30 bg-muted text-muted-foreground",
  },
};

const fmtData = (d: string | null) =>
  d ? new Date(`${d}`.slice(0, 10) + "T00:00:00").toLocaleDateString("pt-BR") : "—";

interface Props {
  pedidoId: number;
  fornecedorId: string | null;
  onGravado: () => void;
}

export default function LancarNfXmlTab({ pedidoId, fornecedorId, onGravado }: Props) {
  const qc = useQueryClient();
  const [selecionada, setSelecionada] = useState<StageRow | null>(null);
  const [previa, setPrevia] = useState<PreviaXml | null>(null);

  const stagesQ = useQuery({
    queryKey: ["nfs-stage-mercadoria-pendente", fornecedorId],
    enabled: !!fornecedorId,
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("vw_nfs_stage_mercadoria_pendente")
        .select("*")
        .eq("fornecedor_id", fornecedorId)
        .order("nf_data_emissao", { ascending: false });
      if (error) throw error;
      return (data ?? []) as StageRow[];
    },
  });

  const chamarRpc = async (confirmar: boolean) => {
    if (!selecionada) throw new Error("Selecione uma NF capturada por XML.");
    const { data, error } = await (supabase as any).rpc("importar_nf_de_stage", {
      p_stage_id: selecionada.nfs_stage_id,
      p_pedido_ids: [pedidoId],
      p_confirmar: confirmar,
    });
    if (error) throw error;
    return data as PreviaXml;
  };

  const conferirMut = useMutation({
    mutationFn: async () => {
      try {
        return await chamarRpc(false);
      } catch (e) {
        throw e;
      }
    },
    onSuccess: (d) => {
      setPrevia(d);
      toast.success("Conferência concluída. Revise antes de gravar.");
    },
    onError: (e) => toast.error(formatError(e)),
  });

  const gravarMut = useMutation({
    mutationFn: async () => {
      try {
        return await chamarRpc(true);
      } catch (e) {
        throw e;
      }
    },
    onSuccess: (d) => {
      const acao = d.nf_existe ? "atualizada" : "criada";
      toast.success(
        `NF ${selecionada?.nf_numero ?? ""} ${acao} — ${d.linhas_gravadas ?? d.linhas ?? 0} linha(s), ${d.linhas_sem_depara ?? 0} sem de-para.`,
      );
      qc.invalidateQueries({ queryKey: ["pedido-mercadoria-detalhe", pedidoId] });
      qc.invalidateQueries({ queryKey: ["pedido-mercadoria-nfs", pedidoId] });
      qc.invalidateQueries({ queryKey: ["pedido-mercadoria-conferencia-nf"] });
      qc.invalidateQueries({ queryKey: ["importacao-pedido-lista"] });
      qc.invalidateQueries({ queryKey: ["nfs-stage-mercadoria-pendente"] });
      setPrevia(null);
      setSelecionada(null);
      onGravado();
    },
    onError: (e) => toast.error(formatError(e)),
  });

  const divergente = !!previa && Number(previa.divergencia ?? 0) !== 0;

  if (!fornecedorId) {
    return (
      <div className="rounded-md border border-warning/40 bg-warning/10 p-3 text-sm">
        Este pedido não tem fornecedor vinculado. Sem fornecedor não dá para buscar as NFs
        capturadas por XML — use a aba <b>Digitar manualmente</b>.
      </div>
    );
  }

  if (stagesQ.isError) {
    return (
      <div className="rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive space-y-2">
        <div className="font-medium">Falha ao carregar as NFs capturadas por XML.</div>
        <div className="font-mono text-xs">{formatError(stagesQ.error)}</div>
        <Button size="sm" variant="outline" onClick={() => stagesQ.refetch()}>
          <RefreshCw className="h-3.5 w-3.5 mr-2" /> Tentar de novo
        </Button>
      </div>
    );
  }

  if (stagesQ.isLoading) {
    return (
      <div className="flex items-center gap-2 p-6 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" /> Carregando NFs capturadas…
      </div>
    );
  }

  const rows = stagesQ.data ?? [];

  if (rows.length === 0) {
    return (
      <div className="rounded-md border p-4 text-sm space-y-2">
        <div>
          Nenhuma NF deste fornecedor foi capturada por XML ainda. Use a aba{" "}
          <b>Digitar manualmente</b>, ou aguarde a captura.
        </div>
        <Link
          to="/administrativo/nfs-stage"
          className="inline-flex items-center gap-1 text-xs underline"
        >
          Abrir captura de NFs (stage) <ExternalLink className="h-3 w-3" />
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="overflow-x-auto rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-10" />
              <TableHead>NF</TableHead>
              <TableHead>Emissão</TableHead>
              <TableHead className="text-right">Valor no XML</TableHead>
              <TableHead className="text-right">Itens</TableHead>
              <TableHead>Classificação</TableHead>
              <TableHead>Situação</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((r) => {
              const sel = selecionada?.nfs_stage_id === r.nfs_stage_id;
              const c = CLASSIF[r.classificacao ?? ""] ?? {
                label: r.classificacao ?? "—",
                className: "",
              };
              return (
                <TableRow
                  key={r.nfs_stage_id}
                  className={`cursor-pointer ${sel ? "bg-muted/60" : ""}`}
                  onClick={() => {
                    setSelecionada(r);
                    setPrevia(null);
                  }}
                >
                  <TableCell>
                    <input
                      type="radio"
                      checked={sel}
                      onChange={() => {
                        setSelecionada(r);
                        setPrevia(null);
                      }}
                    />
                  </TableCell>
                  <TableCell className="font-medium">
                    {r.nf_numero ?? "—"}
                    {r.nf_serie ? `/${r.nf_serie}` : ""}
                  </TableCell>
                  <TableCell>{fmtData(r.nf_data_emissao)}</TableCell>
                  <TableCell className="text-right">{fmtMoeda(r.valor_no_xml)}</TableCell>
                  <TableCell className="text-right">{r.itens ?? 0}</TableCell>
                  <TableCell>
                    <Badge variant="outline" className={c.className}>
                      {c.label}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    {r.ja_lancada ? (
                      <Badge variant="outline" className="border-warning/40 text-warning">
                        Já lançada
                      </Badge>
                    ) : (
                      <span className="text-xs text-muted-foreground">Pendente</span>
                    )}
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>

      {selecionada?.ja_lancada && (
        <div className="flex items-start gap-2 rounded-md border border-warning/40 bg-warning/10 p-2 text-sm">
          <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
          <span>
            Esta NF já foi lançada. Gravar de novo <b>atualiza</b> a NF existente (idempotente), não
            cria outra.
          </span>
        </div>
      )}

      {selecionada?.classificacao === "nao_mercadoria" && (
        <div className="flex items-start gap-2 rounded-md border border-muted-foreground/30 bg-muted p-2 text-sm">
          <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
          <span>
            Os itens desta NF não parecem produto de revenda. Confirme que é mesmo mercadoria do
            pedido antes de gravar.
          </span>
        </div>
      )}

      {previa && (
        <div className="space-y-3 rounded-md border p-3">
          <div className="text-sm">
            {previa.itens_lidos_do_xml ?? 0} itens lidos do XML · produtos{" "}
            {fmtMoeda(previa.valor_produtos_derivado)} · total no XML{" "}
            {fmtMoeda(previa.valor_total_no_xml)} · IPI implícito {fmtMoeda(previa.ipi_implicito)}
          </div>

          {previa.nf_existe && (
            <div className="flex items-start gap-2 rounded-md border border-warning/40 bg-warning/10 p-2 text-sm">
              <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
              <span>
                Já existe NF com esse número e série. A gravação vai <b>atualizar</b> a NF
                existente, não criar outra.
              </span>
            </div>
          )}

          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
            <div>
              <div className="text-xs text-muted-foreground">Linhas</div>
              <div className="font-medium">{previa.linhas ?? 0}</div>
            </div>
            <div>
              <div className="text-xs text-muted-foreground">Soma das linhas</div>
              <div className="font-medium">{Number(previa.soma_linhas ?? 0).toFixed(2)}</div>
            </div>
            <div>
              <div className="text-xs text-muted-foreground">Valor de produtos informado</div>
              <div className="font-medium">
                {Number(previa.valor_produtos_informado ?? 0).toFixed(2)}
              </div>
            </div>
            <div>
              <div className="text-xs text-muted-foreground">Divergência</div>
              <div className={divergente ? "font-medium text-destructive" : "font-medium"}>
                {Number(previa.divergencia ?? 0).toFixed(2)}
              </div>
            </div>
          </div>

          {divergente && (
            <div className="rounded-md border border-destructive/40 bg-destructive/10 p-2 text-sm text-destructive">
              A soma das linhas não bate com o valor de produtos do documento fiscal.
            </div>
          )}

          {Number(previa.linhas_sem_depara ?? 0) > 0 && (
            <div className="rounded-md border border-warning/40 bg-warning/10 p-2 text-sm space-y-1">
              <div>
                {previa.linhas_sem_depara} linha(s) com código sem de-para para SKU. Isso não impede
                gravar a NF — só deixa a alocação em SKU pendente.
              </div>
              <Link
                to="/logistica/chegada-mercadoria?aba=de-para"
                className="inline-flex items-center gap-1 text-xs underline"
              >
                Abrir de-para de fornecedor <ExternalLink className="h-3 w-3" />
              </Link>
            </div>
          )}

          {(previa.itens?.length ?? 0) > 0 && (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>#</TableHead>
                    <TableHead>Código</TableHead>
                    <TableHead>NCM</TableHead>
                    <TableHead className="text-right">Qtd</TableHead>
                    <TableHead className="text-right">Valor unit.</TableHead>
                    <TableHead className="text-right">Valor total</TableHead>
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {previa.itens!.map((it) => (
                    <TableRow key={`${it.item_seq}-${it.codigo_nf}`}>
                      <TableCell>{it.item_seq}</TableCell>
                      <TableCell className="font-mono text-xs">{it.codigo_nf}</TableCell>
                      <TableCell className="font-mono text-xs">{it.ncm ?? "—"}</TableCell>
                      <TableCell className="text-right">{Number(it.quantidade ?? 0)}</TableCell>
                      <TableCell className="text-right">
                        {Number(it.valor_unit ?? 0).toFixed(2)}
                      </TableCell>
                      <TableCell className="text-right">
                        {Number(it.valor_total ?? 0).toFixed(2)}
                      </TableCell>
                      <TableCell>
                        <Badge variant={it.status === "mapeado" ? "secondary" : "destructive"}>
                          {it.status}
                        </Badge>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </div>
      )}

      <div className="flex justify-end gap-2">
        <Button
          variant="outline"
          onClick={() => conferirMut.mutate()}
          disabled={!selecionada || conferirMut.isPending}
        >
          {conferirMut.isPending ? (
            <Loader2 className="h-4 w-4 animate-spin mr-2" />
          ) : (
            <CheckCircle2 className="h-4 w-4 mr-2" />
          )}
          Conferir
        </Button>
        <Button
          style={{ backgroundColor: VERDE }}
          className="text-white hover:opacity-90"
          onClick={() => gravarMut.mutate()}
          disabled={!previa || gravarMut.isPending}
        >
          {gravarMut.isPending && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
          Gravar
        </Button>
      </div>
    </div>
  );
}
