import { useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  Loader2,
  AlertTriangle,
  CheckCircle2,
  ExternalLink,
  RefreshCw,
  Upload,
  FileText,
  ShieldCheck,
} from "lucide-react";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { formatError } from "@/lib/format-error";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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

interface LinhaLida {
  item_seq: number;
  codigo_nf: string | null;
  descricao: string | null;
  ncm: string | null;
  quantidade: number | null;
  valor_unit: number | null;
  ipi_aliq: number | null;
  valor_total: number | null;
}

interface DocumentoLido {
  origem: "xml" | "pdf";
  cnpj_emitente: string | null;
  nf: {
    numero: string | null;
    serie: string | null;
    chave_acesso: string | null;
    data_emissao: string | null;
    data_saida: string | null;
    container: string | null;
    valor_produtos: number | null;
    valor_ipi: number | null;
    valor_total: number | null;
    peso_bruto: number | null;
    peso_liquido: number | null;
    volumes: number | null;
  };
  linhas: LinhaLida[];
}

interface PreviaNf {
  nf_existe?: boolean;
  linhas?: number;
  soma_linhas?: number;
  valor_produtos_informado?: number;
  divergencia?: number;
  linhas_sem_depara?: number;
  nf_origem_atual?: string | null;
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

interface Props {
  pedidoId: number;
  fornecedorId: string | null;
  onGravado: () => void;
}

const soDigitos = (s: string | null | undefined) => String(s ?? "").replace(/\D/g, "");

const fmtCnpj = (s: string | null | undefined) => {
  const d = soDigitos(s);
  if (d.length !== 14) return d || "—";
  return `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5, 8)}/${d.slice(8, 12)}-${d.slice(12)}`;
};

const fmtData = (d: string | null) =>
  d ? new Date(`${d}`.slice(0, 10) + "T00:00:00").toLocaleDateString("pt-BR") : "—";

export default function LancarNfArquivoTab({ pedidoId, fornecedorId, onGravado }: Props) {
  const qc = useQueryClient();
  const inputRef = useRef<HTMLInputElement>(null);
  const [arquivo, setArquivo] = useState<File | null>(null);
  const [doc, setDoc] = useState<DocumentoLido | null>(null);
  const [erroLeitura, setErroLeitura] = useState<string | null>(null);
  const [previa, setPrevia] = useState<PreviaNf | null>(null);

  const fornecedorQ = useQuery({
    queryKey: ["parceiro-cnpj", fornecedorId],
    enabled: !!fornecedorId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("parceiros_comerciais")
        .select("id, cnpj, razao_social, nome_fantasia")
        .eq("id", fornecedorId as string)
        .maybeSingle();
      if (error) throw error;
      return data as { id: string; cnpj: string | null; razao_social: string | null; nome_fantasia: string | null } | null;
    },
  });

  const cnpjFornecedor = soDigitos(fornecedorQ.data?.cnpj);
  const cnpjDoc = soDigitos(doc?.cnpj_emitente);
  const cnpjDivergente =
    !!doc && !!cnpjFornecedor && !!cnpjDoc && cnpjFornecedor !== cnpjDoc;
  const cnpjIndefinido = !!doc && (!cnpjFornecedor || !cnpjDoc);

  const lerMut = useMutation({
    mutationFn: async (file: File) => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error("Sessão expirada. Faça login novamente.");
      const fd = new FormData();
      fd.append("file", file);
      const resp = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/ler-nf-documento`,
        {
          method: "POST",
          headers: { Authorization: `Bearer ${session.access_token}` },
          body: fd,
        },
      );
      const body = await resp.json().catch(() => null);
      if (!resp.ok || !body || body.error) {
        throw new Error(body?.error ?? `Falha na leitura do arquivo (HTTP ${resp.status}).`);
      }
      return body as DocumentoLido;
    },
    onMutate: () => {
      setErroLeitura(null);
      setDoc(null);
      setPrevia(null);
    },
    onSuccess: (d) => {
      setDoc(d);
      toast.success(
        `Arquivo lido (${d.origem.toUpperCase()}) — ${d.linhas.length} item(ns) encontrados.`,
      );
    },
    onError: (e) => {
      const msg = formatError(e);
      setErroLeitura(msg);
      toast.error(msg);
    },
  });

  const montarPayload = () => {
    if (!doc) throw new Error("Selecione um arquivo XML ou PDF da NF.");
    if (cnpjDivergente) {
      throw new Error(
        `CNPJ do emitente (${fmtCnpj(cnpjDoc)}) diferente do fornecedor do pedido (${fmtCnpj(cnpjFornecedor)}).`,
      );
    }
    const p_nf = {
      fornecedor_id: fornecedorId,
      numero: doc.nf.numero,
      serie: doc.nf.serie,
      chave_acesso: doc.nf.chave_acesso,
      data_emissao: doc.nf.data_emissao,
      data_saida: doc.nf.data_saida,
      container: doc.nf.container,
      valor_produtos: doc.nf.valor_produtos,
      valor_ipi: doc.nf.valor_ipi,
      valor_total: doc.nf.valor_total,
      peso_bruto: doc.nf.peso_bruto,
      peso_liquido: doc.nf.peso_liquido,
      volumes: doc.nf.volumes,
    };
    const p_linhas = doc.linhas.map((l) => ({
      codigo_nf: l.codigo_nf,
      ncm: l.ncm,
      quantidade: l.quantidade,
      valor_unit: l.valor_unit,
      ipi_aliq: l.ipi_aliq,
    }));
    return { p_nf, p_linhas };
  };

  const chamarRpc = async (confirmar: boolean) => {
    const { p_nf, p_linhas } = montarPayload();
    const { data, error } = await (supabase as any).rpc("lancar_nf_importacao", {
      p_nf,
      p_linhas,
      p_pedido_ids: [pedidoId],
      p_confirmar: confirmar,
    });
    if (error) throw error;
    return data as PreviaNf;
  };

  const conferirMut = useMutation({
    mutationFn: async () => await chamarRpc(false),
    onSuccess: (d) => {
      setPrevia(d);
      toast.success("Conferência concluída. Revise antes de gravar.");
    },
    onError: (e) => toast.error(formatError(e)),
  });

  const gravarMut = useMutation({
    mutationFn: async () => {
      const gravada = await chamarRpc(true);
      let origemInfo: { mantida?: boolean; motivo?: string; origem?: string } | null = null;
      if (gravada?.nf_id && doc) {
        const { data, error } = await (supabase as any).rpc("definir_origem_nf", {
          p_nf_id: gravada.nf_id,
          p_origem: doc.origem,
        });
        if (error) throw error;
        origemInfo = (data ?? null) as typeof origemInfo;
      }
      return { gravada, origemInfo };
    },
    onSuccess: ({ gravada, origemInfo }) => {
      const acao = gravada.nf_existe ? "atualizada" : "criada";
      toast.success(
        `NF ${doc?.nf.numero ?? ""} ${acao} — ${gravada.linhas_gravadas ?? gravada.linhas ?? 0} linha(s), ${gravada.linhas_sem_depara ?? 0} sem de-para.`,
      );
      if (origemInfo?.mantida) {
        toast.info(
          `Origem da NF mantida${origemInfo.origem ? ` como "${origemInfo.origem}"` : ""}: ${origemInfo.motivo ?? "procedência mais forte já registrada."}`,
        );
      }
      qc.invalidateQueries({ queryKey: ["pedido-mercadoria-detalhe", pedidoId] });
      qc.invalidateQueries({ queryKey: ["pedido-mercadoria-nfs", pedidoId] });
      qc.invalidateQueries({ queryKey: ["pedido-mercadoria-conferencia-nf"] });
      qc.invalidateQueries({ queryKey: ["importacao-pedido-lista"] });
      qc.invalidateQueries({ queryKey: ["nfs-stage-mercadoria-pendente"] });
      setDoc(null);
      setArquivo(null);
      setPrevia(null);
      if (inputRef.current) inputRef.current.value = "";
      onGravado();
    },
    onError: (e) => toast.error(formatError(e)),
  });

  const divergente = !!previa && Number(previa.divergencia ?? 0) !== 0;
  const origemAtual = String(previa?.nf_origem_atual ?? "").toLowerCase();
  const xmlCorrigeAnterior =
    doc?.origem === "xml" &&
    !!previa?.nf_existe &&
    ["pdf", "manual", "legado"].includes(origemAtual);

  return (
    <div className="space-y-4">
      <p className="text-xs text-muted-foreground">
        O fornecedor mandou o arquivo e o Qive ainda não capturou? Suba o XML da NF-e (fonte fiscal
        exata) ou o PDF do DANFE (leitura de documento).
      </p>

      {fornecedorQ.isError && (
        <div className="rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive space-y-2">
          <div className="font-medium">Falha ao carregar o fornecedor do pedido.</div>
          <div className="font-mono text-xs">{formatError(fornecedorQ.error)}</div>
          <Button size="sm" variant="outline" onClick={() => fornecedorQ.refetch()}>
            <RefreshCw className="h-3.5 w-3.5 mr-2" /> Tentar de novo
          </Button>
        </div>
      )}

      <div className="flex flex-wrap items-center gap-3 rounded-md border p-3">
        <Input
          ref={inputRef}
          type="file"
          accept=".xml,.pdf,application/xml,text/xml,application/pdf"
          className="max-w-sm"
          onChange={(e) => {
            const f = e.target.files?.[0] ?? null;
            setArquivo(f);
            if (f) lerMut.mutate(f);
          }}
        />
        {lerMut.isPending && (
          <span className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Lendo o documento…
          </span>
        )}
        {!lerMut.isPending && arquivo && (
          <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <FileText className="h-3.5 w-3.5" /> {arquivo.name}
          </span>
        )}
      </div>

      {erroLeitura && (
        <div className="rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive space-y-2">
          <div className="font-medium">Não consegui ler este arquivo.</div>
          <div className="font-mono text-xs whitespace-pre-wrap">{erroLeitura}</div>
          <Button
            size="sm"
            variant="outline"
            disabled={!arquivo || lerMut.isPending}
            onClick={() => arquivo && lerMut.mutate(arquivo)}
          >
            <RefreshCw className="h-3.5 w-3.5 mr-2" /> Tentar de novo
          </Button>
        </div>
      )}

      {doc && (
        <div className="space-y-3 rounded-md border p-3">
          <div className="flex flex-wrap items-center gap-2">
            {doc.origem === "xml" ? (
              <Badge
                variant="outline"
                className="border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400"
              >
                <ShieldCheck className="h-3.5 w-3.5 mr-1" /> XML — fonte fiscal exata
              </Badge>
            ) : (
              <Badge
                variant="outline"
                className="border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-400"
              >
                <AlertTriangle className="h-3.5 w-3.5 mr-1" /> PDF — leitura de documento, confira
              </Badge>
            )}
            <span className="text-sm font-medium">
              NF {doc.nf.numero ?? "—"}
              {doc.nf.serie ? `/${doc.nf.serie}` : ""}
            </span>
            <span className="text-xs text-muted-foreground">
              emissão {fmtData(doc.nf.data_emissao)} · saída {fmtData(doc.nf.data_saida)}
            </span>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
            <div>
              <div className="text-xs text-muted-foreground">Itens lidos</div>
              <div className="font-medium">{doc.linhas.length}</div>
            </div>
            <div>
              <div className="text-xs text-muted-foreground">Valor dos produtos</div>
              <div className="font-medium">{fmtMoeda(doc.nf.valor_produtos)}</div>
            </div>
            <div>
              <div className="text-xs text-muted-foreground">IPI</div>
              <div className="font-medium">{fmtMoeda(doc.nf.valor_ipi)}</div>
            </div>
            <div>
              <div className="text-xs text-muted-foreground">Valor total</div>
              <div className="font-medium">{fmtMoeda(doc.nf.valor_total)}</div>
            </div>
            <div>
              <div className="text-xs text-muted-foreground">CNPJ do emitente</div>
              <div className="font-mono text-xs">{fmtCnpj(doc.cnpj_emitente)}</div>
            </div>
            <div>
              <div className="text-xs text-muted-foreground">Chave de acesso</div>
              <div className="font-mono text-[11px] break-all">{doc.nf.chave_acesso ?? "—"}</div>
            </div>
            <div>
              <div className="text-xs text-muted-foreground">Volumes / peso bruto</div>
              <div className="font-medium">
                {doc.nf.volumes ?? "—"} / {doc.nf.peso_bruto ?? "—"}
              </div>
            </div>
            <div>
              <div className="text-xs text-muted-foreground">Contêiner</div>
              <div className="font-medium">{doc.nf.container ?? "—"}</div>
            </div>
          </div>

          {cnpjDivergente && (
            <div className="rounded-md border border-destructive/40 bg-destructive/10 p-2 text-sm text-destructive">
              <div className="font-medium">NF de outro emitente — bloqueado.</div>
              <div>
                Emitente do arquivo: <b className="font-mono">{fmtCnpj(cnpjDoc)}</b> · Fornecedor do
                pedido: <b className="font-mono">{fmtCnpj(cnpjFornecedor)}</b>. Esta NF não entra
                neste pedido.
              </div>
            </div>
          )}

          {!cnpjDivergente && cnpjIndefinido && (
            <div className="rounded-md border border-amber-500/40 bg-amber-500/10 p-2 text-sm">
              Não deu para comparar o CNPJ do emitente com o do fornecedor do pedido
              {!cnpjDoc ? " (arquivo sem CNPJ legível)" : " (fornecedor sem CNPJ cadastrado)"}.
              Confira manualmente antes de gravar.
            </div>
          )}

          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>#</TableHead>
                  <TableHead>Código</TableHead>
                  <TableHead>Descrição</TableHead>
                  <TableHead>NCM</TableHead>
                  <TableHead className="text-right">Qtd</TableHead>
                  <TableHead className="text-right">Valor unit.</TableHead>
                  <TableHead className="text-right">IPI %</TableHead>
                  <TableHead className="text-right">Valor total</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {doc.linhas.map((l) => (
                  <TableRow key={`${l.item_seq}-${l.codigo_nf ?? ""}`}>
                    <TableCell>{l.item_seq}</TableCell>
                    <TableCell className="font-mono text-xs">{l.codigo_nf ?? "—"}</TableCell>
                    <TableCell className="text-xs max-w-[220px] truncate">
                      {l.descricao ?? "—"}
                    </TableCell>
                    <TableCell className="font-mono text-xs">{l.ncm ?? "—"}</TableCell>
                    <TableCell className="text-right">{l.quantidade ?? "—"}</TableCell>
                    <TableCell className="text-right">{fmtMoeda(l.valor_unit)}</TableCell>
                    <TableCell className="text-right">{l.ipi_aliq ?? "—"}</TableCell>
                    <TableCell className="text-right">{fmtMoeda(l.valor_total)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </div>
      )}

      {previa && (
        <div className="space-y-3 rounded-md border p-3">
          {previa.nf_existe && (
            <div className="flex items-start gap-2 rounded-md border border-amber-500/40 bg-amber-500/10 p-2 text-sm">
              <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
              <div className="space-y-1">
                <div>
                  Já existe NF com esse número e série. A gravação vai <b>atualizar</b> a NF
                  existente (idempotente por número + série), não criar outra.
                </div>
                {xmlCorrigeAnterior && (
                  <div>O XML vai corrigir e substituir o que foi lido antes.</div>
                )}
              </div>
            </div>
          )}

          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
            <div>
              <div className="text-xs text-muted-foreground">Linhas</div>
              <div className="font-medium">{previa.linhas ?? 0}</div>
            </div>
            <div>
              <div className="text-xs text-muted-foreground">Soma das linhas</div>
              <div className="font-medium">{fmtMoeda(previa.soma_linhas)}</div>
            </div>
            <div>
              <div className="text-xs text-muted-foreground">Valor de produtos informado</div>
              <div className="font-medium">{fmtMoeda(previa.valor_produtos_informado)}</div>
            </div>
            <div>
              <div className="text-xs text-muted-foreground">Divergência</div>
              <div className={divergente ? "font-semibold text-destructive" : "font-medium"}>
                {fmtMoeda(previa.divergencia)}
              </div>
            </div>
          </div>

          {divergente && (
            <div className="rounded-md border border-destructive/40 bg-destructive/10 p-2 text-sm text-destructive space-y-1">
              <div>
                A soma das linhas não fecha com o total impresso no documento — o banco vai recusar
                a gravação.
              </div>
              {doc?.origem === "pdf" && (
                <div>
                  Em PDF isso normalmente significa leitura incorreta do documento. Se conseguir o
                  XML da NF-e, vale subir o XML.
                </div>
              )}
            </div>
          )}

          {Number(previa.linhas_sem_depara ?? 0) > 0 && (
            <div className="rounded-md border border-amber-500/40 bg-amber-500/10 p-2 text-sm space-y-1">
              <div>
                {previa.linhas_sem_depara} linha(s) com código sem de-para para SKU. Isso não impede
                gravar a NF — só deixa a alocação em SKU pendente.
              </div>
              <Link
                to="/compras/mercadoria?aba=de-para"
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
                      <TableCell className="text-right">{fmtMoeda(it.valor_unit)}</TableCell>
                      <TableCell className="text-right">{fmtMoeda(it.valor_total)}</TableCell>
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
          disabled={!doc || cnpjDivergente || conferirMut.isPending}
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
          disabled={!previa || cnpjDivergente || gravarMut.isPending}
        >
          {gravarMut.isPending ? (
            <Loader2 className="h-4 w-4 animate-spin mr-2" />
          ) : (
            <Upload className="h-4 w-4 mr-2" />
          )}
          Gravar
        </Button>
      </div>
    </div>
  );
}
