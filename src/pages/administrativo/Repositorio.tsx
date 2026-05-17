import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  FolderOpen,
  Upload,
  MoreVertical,
  Link as LinkIcon,
  ExternalLink,
  Search,
} from "lucide-react";
import { formatBRL, formatDateBR } from "@/lib/format-currency";
import {
  SortableTableHead,
  ordenarPor,
  type SortState,
} from "@/components/shared/SortableTableHead";
import {
  STATUS_LABEL,
  TIPO_DOC_LABEL,
  statusBadgeClass,
  tipoBadgeClass,
} from "@/lib/repositorio/hash";
import { UploadEmLoteSheet } from "@/components/repositorio/UploadEmLoteSheet";
import { RotearBoletoDialog } from "@/components/repositorio/RotearBoletoDialog";
import { VincularDocumentoDialog } from "@/components/repositorio/VincularDocumentoDialog";
import { DetalheDocumentoDrawer } from "@/components/repositorio/DetalheDocumentoDrawer";
import { cn } from "@/lib/utils";

export interface DocumentoRepositorio {
  id: string;
  nome: string;
  arquivo_original: string;
  storage_path: string;
  mime_type: string | null;
  tipo_documento: string;
  status_classificacao: string;
  confianca_ia: string | null;
  classificacao_ia: Record<string, unknown> | null;
  resumo_ia: string | null;
  parceiro_id: string | null;
  parceiro_nome: string | null;
  valor: number | null;
  vencimento: string | null;
  data_emissao: string | null;
  numero_documento: string | null;
  lote_id: string | null;
  origem_porta: string;
  tags: string[] | null;
  created_at: string;
}

type SortCol = "nome" | "tipo_documento" | "valor" | "vencimento" | "created_at" | "confianca_ia";

const TIPOS = [
  "boleto",
  "recibo",
  "comprovante",
  "nf",
  "contrato",
  "aditivo",
  "orcamento",
  "proposta",
  "certidao",
  "invoice",
  "outro",
];

const STATUSES = ["aguardando", "classificada", "roteada", "descartada", "erro"];

export default function Repositorio() {
  const [uploadOpen, setUploadOpen] = useState(false);
  const [busca, setBusca] = useState("");
  const [filtroStatus, setFiltroStatus] = useState<string>("ativos");
  const [filtroTipo, setFiltroTipo] = useState<string>("todos");
  const [agruparLote, setAgruparLote] = useState(false);
  const [sort, setSort] = useState<SortState<SortCol> | null>({
    column: "created_at",
    direction: "desc",
  });

  const [docSelecionado, setDocSelecionado] = useState<DocumentoRepositorio | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [rotearOpen, setRotearOpen] = useState(false);
  const [vincularOpen, setVincularOpen] = useState(false);
  const [docAcao, setDocAcao] = useState<DocumentoRepositorio | null>(null);

  const { data: docs = [], isLoading } = useQuery({
    queryKey: ["repositorio-documentos"],
    queryFn: async (): Promise<DocumentoRepositorio[]> => {
      const { data, error } = await (supabase as any)
        .from("ged_documentos")
        .select(
          `id, nome, arquivo_original, storage_path, mime_type, tipo_documento,
           status_classificacao, confianca_ia, classificacao_ia, resumo_ia,
           parceiro_id, lote_id, origem_porta, tags, created_at,
           parceiros_comerciais ( razao_social )`,
        )
        .order("created_at", { ascending: false })
        .limit(500);
      if (error) throw error;
      return ((data ?? []) as any[]).map((r) => ({
        ...r,
        parceiro_nome: r.parceiros_comerciais?.razao_social ?? null,
        valor: r.classificacao_ia?.valor ?? null,
        vencimento: r.classificacao_ia?.data_vencimento ?? null,
        data_emissao: r.classificacao_ia?.data_emissao ?? null,
        numero_documento: r.classificacao_ia?.numero_documento ?? null,
      })) as DocumentoRepositorio[];
    },
  });

  const { data: kpis } = useQuery({
    queryKey: ["repositorio-kpis"],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("ged_documentos")
        .select("status_classificacao");
      if (error) throw error;
      const arr = (data ?? []) as { status_classificacao: string }[];
      return {
        aguardando: arr.filter((d) => d.status_classificacao === "aguardando").length,
        classificada: arr.filter((d) => d.status_classificacao === "classificada").length,
        roteada: arr.filter((d) => d.status_classificacao === "roteada").length,
        total: arr.length,
      };
    },
  });

  const docsFiltrados = useMemo(() => {
    let arr = docs;
    if (filtroStatus === "ativos") {
      arr = arr.filter((d) => d.status_classificacao !== "descartada");
    } else if (filtroStatus !== "todos") {
      arr = arr.filter((d) => d.status_classificacao === filtroStatus);
    }
    if (filtroTipo !== "todos") {
      arr = arr.filter((d) => d.tipo_documento === filtroTipo);
    }
    if (busca.trim()) {
      const t = busca.toLowerCase();
      arr = arr.filter(
        (d) =>
          d.nome.toLowerCase().includes(t) ||
          d.arquivo_original.toLowerCase().includes(t) ||
          (d.parceiro_nome ?? "").toLowerCase().includes(t),
      );
    }
    return ordenarPor(arr, sort, {
      nome: (d) => d.nome,
      tipo_documento: (d) => d.tipo_documento,
      valor: (d) => d.valor,
      vencimento: (d) => d.vencimento,
      created_at: (d) => d.created_at,
      confianca_ia: (d) => d.confianca_ia,
    });
  }, [docs, filtroStatus, filtroTipo, busca, sort]);

  function abrirDetalhe(doc: DocumentoRepositorio) {
    setDocSelecionado(doc);
    setDrawerOpen(true);
  }

  function abrirRotear(doc: DocumentoRepositorio) {
    setDocAcao(doc);
    setRotearOpen(true);
    setDrawerOpen(false);
  }

  function abrirVincular(doc: DocumentoRepositorio) {
    setDocAcao(doc);
    setVincularOpen(true);
    setDrawerOpen(false);
  }

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-semibold flex items-center gap-2">
            <FolderOpen className="h-6 w-6 text-[#1A4A3A]" />
            Repositório
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Stage Universal de Documentos · suba qualquer arquivo, a IA classifica e roteia.
          </p>
        </div>
        <Button
          onClick={() => setUploadOpen(true)}
          className="bg-[#1A4A3A] hover:bg-[#1A4A3A]/90"
        >
          <Upload className="h-4 w-4 mr-2" />
          Subir arquivos
        </Button>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <KpiCard
          label="Aguardando classificação"
          value={kpis?.aguardando ?? "—"}
          color="bg-yellow-50 text-yellow-800 border-yellow-200"
        />
        <KpiCard
          label="Classificada (sem rotear)"
          value={kpis?.classificada ?? "—"}
          color="bg-blue-50 text-blue-800 border-blue-200"
        />
        <KpiCard
          label="Roteada"
          value={kpis?.roteada ?? "—"}
          color="bg-[#1A4A3A]/5 text-[#1A4A3A] border-[#1A4A3A]/20"
        />
        <KpiCard label="Total no Repositório" value={kpis?.total ?? "—"} />
      </div>

      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-64">
          <Search className="h-4 w-4 absolute left-2.5 top-2.5 text-muted-foreground" />
          <Input
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            placeholder="Buscar por nome, parceiro..."
            className="pl-8"
          />
        </div>
        <Select value={filtroStatus} onValueChange={setFiltroStatus}>
          <SelectTrigger className="w-44">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="ativos">Ativos (sem descartados)</SelectItem>
            <SelectItem value="todos">Todos</SelectItem>
            {STATUSES.map((s) => (
              <SelectItem key={s} value={s}>
                {STATUS_LABEL[s]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={filtroTipo} onValueChange={setFiltroTipo}>
          <SelectTrigger className="w-44">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="todos">Todos os tipos</SelectItem>
            {TIPOS.map((t) => (
              <SelectItem key={t} value={t}>
                {TIPO_DOC_LABEL[t] ?? t}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button
          variant={agruparLote ? "default" : "outline"}
          size="sm"
          onClick={() => setAgruparLote((v) => !v)}
        >
          Ver por lote
        </Button>
      </div>

      {/* Tabela */}
      <div className="border rounded-lg overflow-hidden bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <SortableTableHead column="nome" sort={sort} onSort={setSort}>
                Arquivo
              </SortableTableHead>
              <SortableTableHead column="tipo_documento" sort={sort} onSort={setSort}>
                Tipo IA
              </SortableTableHead>
              <SortableTableHead column="confianca_ia" sort={sort} onSort={setSort}>
                Confiança
              </SortableTableHead>
              <TableHead>Parceiro</TableHead>
              <SortableTableHead column="valor" sort={sort} onSort={setSort} align="right">
                Valor
              </SortableTableHead>
              <SortableTableHead column="vencimento" sort={sort} onSort={setSort}>
                Venc/Emissão
              </SortableTableHead>
              {agruparLote && <TableHead>Lote</TableHead>}
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Ações</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading &&
              Array.from({ length: 5 }).map((_, i) => (
                <TableRow key={i}>
                  <TableCell colSpan={agruparLote ? 9 : 8}>
                    <Skeleton className="h-8 w-full" />
                  </TableCell>
                </TableRow>
              ))}
            {!isLoading && docsFiltrados.length === 0 && (
              <TableRow>
                <TableCell colSpan={agruparLote ? 9 : 8} className="text-center py-12">
                  {docs.length === 0 ? (
                    <div className="space-y-3">
                      <FolderOpen className="h-10 w-10 mx-auto text-muted-foreground opacity-40" />
                      <p className="text-muted-foreground">
                        Suba seu primeiro arquivo no Repositório
                      </p>
                      <Button onClick={() => setUploadOpen(true)} className="bg-[#1A4A3A]">
                        <Upload className="h-4 w-4 mr-2" /> Subir arquivos
                      </Button>
                    </div>
                  ) : (
                    <p className="text-muted-foreground text-sm">
                      Nenhum documento encontrado com esses filtros
                    </p>
                  )}
                </TableCell>
              </TableRow>
            )}
            {!isLoading &&
              docsFiltrados.map((d) => (
                <TableRow
                  key={d.id}
                  className={cn(
                    "cursor-pointer",
                    d.status_classificacao === "aguardando" && "bg-yellow-50/40",
                    d.status_classificacao === "roteada" && "bg-[#1A4A3A]/[0.03]",
                    d.status_classificacao === "descartada" && "opacity-60",
                  )}
                  onClick={() => abrirDetalhe(d)}
                >
                  <TableCell className="max-w-xs">
                    <p className="truncate font-medium text-sm">{d.nome}</p>
                    {d.numero_documento && (
                      <p className="text-xs text-muted-foreground">Nº {d.numero_documento}</p>
                    )}
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline" className={tipoBadgeClass(d.tipo_documento)}>
                      {TIPO_DOC_LABEL[d.tipo_documento] ?? d.tipo_documento}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    {d.confianca_ia && (
                      <Badge
                        variant="outline"
                        className={
                          d.confianca_ia === "alta"
                            ? "bg-green-50 text-green-700 border-green-200"
                            : "bg-orange-50 text-orange-700 border-orange-200"
                        }
                      >
                        {d.confianca_ia}
                      </Badge>
                    )}
                  </TableCell>
                  <TableCell className="text-sm">{d.parceiro_nome ?? "—"}</TableCell>
                  <TableCell className="text-right text-sm">
                    {d.valor != null ? formatBRL(d.valor) : "—"}
                  </TableCell>
                  <TableCell className="text-sm">
                    {formatDateBR(d.vencimento ?? d.data_emissao)}
                  </TableCell>
                  {agruparLote && (
                    <TableCell>
                      {d.lote_id && (
                        <Badge variant="secondary" className="text-[10px] font-mono">
                          {d.lote_id.slice(0, 6)}
                        </Badge>
                      )}
                    </TableCell>
                  )}
                  <TableCell>
                    <Badge
                      variant="outline"
                      className={statusBadgeClass(d.status_classificacao)}
                    >
                      {STATUS_LABEL[d.status_classificacao] ?? d.status_classificacao}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right" onClick={(e) => e.stopPropagation()}>
                    <div className="flex items-center justify-end gap-1">
                      <AcaoInline doc={d} onRotear={abrirRotear} onVincular={abrirVincular} />
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon" className="h-8 w-8">
                            <MoreVertical className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onClick={() => abrirDetalhe(d)}>
                            Ver detalhes
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => abrirVincular(d)}>
                            Vincular
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
          </TableBody>
        </Table>
      </div>

      <UploadEmLoteSheet open={uploadOpen} onOpenChange={setUploadOpen} />
      <RotearBoletoDialog
        open={rotearOpen}
        onOpenChange={setRotearOpen}
        gedDocumentoId={docAcao?.id ?? null}
        nomeDocumento={docAcao?.nome}
      />
      <VincularDocumentoDialog
        open={vincularOpen}
        onOpenChange={setVincularOpen}
        gedDocumentoId={docAcao?.id ?? null}
        defaultTipo={
          docAcao?.tipo_documento === "comprovante" || docAcao?.tipo_documento === "recibo"
            ? "cpr"
            : docAcao?.tipo_documento === "contrato" || docAcao?.tipo_documento === "aditivo"
              ? "pasta_contrato"
              : "cpr"
        }
      />
      <DetalheDocumentoDrawer
        doc={docSelecionado}
        open={drawerOpen}
        onOpenChange={setDrawerOpen}
        onRotearBoleto={abrirRotear}
        onVincular={abrirVincular}
      />
    </div>
  );
}

function KpiCard({
  label,
  value,
  color,
}: {
  label: string;
  value: number | string;
  color?: string;
}) {
  return (
    <div className={cn("rounded-lg border p-4", color ?? "bg-card")}>
      <p className="text-xs uppercase tracking-wide opacity-80">{label}</p>
      <p className="text-2xl font-semibold mt-1">{value}</p>
    </div>
  );
}

function AcaoInline({
  doc,
  onRotear,
  onVincular,
}: {
  doc: DocumentoRepositorio;
  onRotear: (d: DocumentoRepositorio) => void;
  onVincular: (d: DocumentoRepositorio) => void;
}) {
  if (doc.status_classificacao === "descartada") return null;

  if (doc.tipo_documento === "boleto" && doc.status_classificacao === "classificada") {
    return (
      <Button
        size="sm"
        className="bg-[#1A4A3A] hover:bg-[#1A4A3A]/90 h-8"
        onClick={() => onRotear(doc)}
      >
        Rotear
      </Button>
    );
  }

  if (doc.tipo_documento === "nf") {
    return (
      <Button asChild size="sm" variant="outline" className="h-8">
        <Link to="/administrativo/nfs-stage">
          <ExternalLink className="h-3.5 w-3.5 mr-1" /> NFs Stage
        </Link>
      </Button>
    );
  }

  if (doc.tipo_documento === "contrato" || doc.tipo_documento === "aditivo") {
    return (
      <Button asChild size="sm" variant="outline" className="h-8">
        <Link to={`/administrativo-fetely/contratos?ged_documento_id=${doc.id}`}>
          Criar contrato
        </Link>
      </Button>
    );
  }

  return (
    <Button size="sm" variant="outline" className="h-8" onClick={() => onVincular(doc)}>
      <LinkIcon className="h-3.5 w-3.5 mr-1" /> Vincular
    </Button>
  );
}
