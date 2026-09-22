// FOTOS DO PRODUTO — /vendas/produto/fotos (22/09/2026)
// Base PRÓPRIA de fotos do SNCF, por cod_cadastro. Antes a foto vinha emprestada
// do Shopify (só B2C) ou do FOP (coleção+cor). Nada aqui grava no FOP.
// O nome do arquivo é a chave: sequência de 5 dígitos começando em 0.
// Conferência antes de gravar; produto que não existe em sncf_produtos não sobe;
// troca de principal nunca apaga a foto anterior — ela fica no histórico.
import { useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Download, Image as ImageIcon, Star, Trash2, Upload, X } from "lucide-react";

import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/layout/PageHeader";
import { PageShell } from "@/components/layout/PageShell";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { RodapePaginacao, DEFAULT_PAGE_SIZE } from "@/components/tabela/RodapePaginacao";
import { fmtDataHora } from "@/lib/data";
import { rawMessage } from "@/lib/format-error";
import { cn } from "@/lib/utils";
import {
  EXTENSOES_ACEITAS, LIMITE_BYTES, ORIGENS_SUGERIDAS,
  enviarFoto, extensaoValida, extrairCodCadastro,
  useExcluirFoto, useFotosProduto, useResumoFotos, useTornarPrincipal,
  type FotoLinha,
} from "@/hooks/useFotosProduto";

type Candidato = {
  file: File;
  cod_cadastro: string;
  existe: boolean;
  substitui: boolean;
  preview: string;
};
type Recusado = { nome: string; motivo: string };
type Progresso = { nome: string; cod: string; estado: "fila" | "enviando" | "ok" | "erro"; motivo?: string };

function mb(bytes: number | null | undefined) {
  if (!bytes) return "—";
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

export default function FotosProduto() {
  const qc = useQueryClient();
  const { data: resumo, isLoading: carregandoResumo } = useResumoFotos();
  const { data: fotos, isLoading, error } = useFotosProduto();
  const tornarPrincipal = useTornarPrincipal();
  const excluir = useExcluirFoto();

  // ---------- envio em lote ----------
  const inputRef = useRef<HTMLInputElement>(null);
  const inputPastaRef = useRef<HTMLInputElement>(null);
  const [arrastando, setArrastando] = useState(false);
  const [conferindo, setConferindo] = useState(false);
  const [candidatos, setCandidatos] = useState<Candidato[]>([]);
  const [recusados, setRecusados] = useState<Recusado[]>([]);
  const [confirmarAberto, setConfirmarAberto] = useState(false);
  const [origem, setOrigem] = useState("");
  const [catalogo, setCatalogo] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [progresso, setProgresso] = useState<Progresso[]>([]);

  async function conferir(lista: File[]) {
    setConferindo(true);
    setCandidatos([]);
    setRecusados([]);
    setProgresso([]);
    try {
      const recusa: Recusado[] = [];
      const validos: { file: File; cod: string }[] = [];
      for (const file of lista) {
        if (!extensaoValida(file.name)) {
          recusa.push({ nome: file.name, motivo: `Extensão não aceita (aceita ${EXTENSOES_ACEITAS.join(", ")})` });
          continue;
        }
        if (file.size > LIMITE_BYTES) {
          recusa.push({ nome: file.name, motivo: `Passa de 10 MB (${mb(file.size)})` });
          continue;
        }
        const cod = extrairCodCadastro(file.name);
        if (!cod) {
          recusa.push({ nome: file.name, motivo: "Sem código no nome do arquivo" });
          continue;
        }
        validos.push({ file, cod });
      }

      const codigos = Array.from(new Set(validos.map((v) => v.cod)));
      const existentes = new Set<string>();
      const comPrincipal = new Set<string>();
      for (let i = 0; i < codigos.length; i += 300) {
        const fatia = codigos.slice(i, i + 300);
        const { data: prods, error: erroProd } = await supabase
          .from("sncf_produtos")
          .select("cod_cadastro")
          .in("cod_cadastro", fatia);
        if (erroProd) throw new Error(rawMessage(erroProd));
        (prods ?? []).forEach((p) => p.cod_cadastro && existentes.add(p.cod_cadastro));

        const { data: pr, error: erroPr } = await supabase
          .from("produto_foto")
          .select("cod_cadastro")
          .in("cod_cadastro", fatia)
          .eq("principal", true);
        if (erroPr) throw new Error(rawMessage(erroPr));
        (pr ?? []).forEach((p) => comPrincipal.add(p.cod_cadastro));
      }

      validos.forEach((v) => {
        if (!existentes.has(v.cod)) {
          recusa.push({ nome: v.file.name, motivo: `Código ${v.cod} não existe no cadastro de produtos` });
        }
      });

      setCandidatos(
        validos
          .filter((v) => existentes.has(v.cod))
          .map((v) => ({
            file: v.file,
            cod_cadastro: v.cod,
            existe: true,
            substitui: comPrincipal.has(v.cod),
            preview: URL.createObjectURL(v.file),
          })),
      );
      setRecusados(recusa);
    } catch (e) {
      toast.error(rawMessage(e));
    } finally {
      setConferindo(false);
    }
  }

  function limparConferencia() {
    candidatos.forEach((c) => URL.revokeObjectURL(c.preview));
    setCandidatos([]);
    setRecusados([]);
    setProgresso([]);
  }

  async function subir() {
    if (!origem.trim()) {
      toast.error("Informe a origem das fotos.");
      return;
    }
    setEnviando(true);
    setConfirmarAberto(false);
    const { data: sessao } = await supabase.auth.getUser();
    const autor = sessao.user?.email ?? sessao.user?.id ?? null;

    const inicial: Progresso[] = candidatos.map((c) => ({ nome: c.file.name, cod: c.cod_cadastro, estado: "fila" }));
    setProgresso(inicial);

    let subiram = 0;
    const falhas: Recusado[] = [];
    for (let i = 0; i < candidatos.length; i++) {
      const c = candidatos[i];
      setProgresso((p) => p.map((l, idx) => (idx === i ? { ...l, estado: "enviando" } : l)));
      try {
        await enviarFoto({
          file: c.file,
          cod_cadastro: c.cod_cadastro,
          origem: origem.trim(),
          catalogo: catalogo.trim() || null,
          criado_por: autor,
          tinhaPrincipal: true,
        });
        subiram++;
        setProgresso((p) => p.map((l, idx) => (idx === i ? { ...l, estado: "ok" } : l)));
      } catch (e) {
        const motivo = rawMessage(e);
        falhas.push({ nome: c.file.name, motivo });
        setProgresso((p) => p.map((l, idx) => (idx === i ? { ...l, estado: "erro", motivo } : l)));
      }
    }

    setEnviando(false);
    qc.invalidateQueries({ queryKey: ["produto-fotos"] });
    candidatos.forEach((c) => URL.revokeObjectURL(c.preview));
    setCandidatos([]);
    if (subiram > 0) toast.success(`${subiram} foto(s) na base própria.`);
    if (falhas.length > 0) {
      setRecusados((r) => [...r, ...falhas]);
      toast.error(`${falhas.length} arquivo(s) falharam. Veja o relatório abaixo.`);
    }
  }

  const substituicoes = candidatos.filter((c) => c.substitui).length;

  // ---------- lista ----------
  const [busca, setBusca] = useState("");
  const [soSemFoto, setSoSemFoto] = useState(false);
  const [soMultiplas, setSoMultiplas] = useState(false);
  const [filtroCatalogo, setFiltroCatalogo] = useState("todos");
  const [filtroOrigem, setFiltroOrigem] = useState("todas");
  const [pagina, setPagina] = useState(1);
  const [tamanhoPagina, setTamanhoPagina] = useState<number>(DEFAULT_PAGE_SIZE);
  const [aExcluir, setAExcluir] = useState<FotoLinha | null>(null);

  const catalogos = useMemo(
    () => Array.from(new Set((fotos ?? []).map((f) => f.catalogo).filter((c): c is string => !!c))).sort(),
    [fotos],
  );
  const origens = useMemo(
    () => Array.from(new Set((fotos ?? []).map((f) => f.origem).filter((o): o is string => !!o))).sort(),
    [fotos],
  );

  const filtradas = useMemo(() => {
    const termo = busca.trim().toLowerCase();
    return (fotos ?? []).filter((f) => {
      if (soMultiplas && f.fotos_do_produto < 2) return false;
      if (filtroCatalogo !== "todos" && (f.catalogo ?? "") !== filtroCatalogo) return false;
      if (filtroOrigem !== "todas" && (f.origem ?? "") !== filtroOrigem) return false;
      if (termo) {
        const alvo = `${f.cod_cadastro} ${f.nome_comercial ?? ""}`.toLowerCase();
        if (!alvo.includes(termo)) return false;
      }
      return true;
    });
  }, [fotos, soMultiplas, filtroCatalogo, filtroOrigem, busca]);

  const pagefim = pagina * tamanhoPagina;
  const visiveis = filtradas.slice(pagefim - tamanhoPagina, pagefim);

  function exportarCsv() {
    const cab = ["codigo", "nome", "arquivo", "url", "origem", "catalogo", "resolucao", "principal"];
    const linhas = filtradas.map((f) => [
      f.cod_cadastro,
      f.nome_comercial ?? "",
      f.arquivo,
      f.url ?? "",
      f.origem ?? "",
      f.catalogo ?? "",
      f.largura_px && f.altura_px ? `${f.largura_px}x${f.altura_px}` : "",
      f.principal ? "sim" : "nao",
    ]);
    const csv = [cab, ...linhas]
      .map((l) => l.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(";"))
      .join("\n");
    const url = URL.createObjectURL(new Blob([`\uFEFF${csv}`], { type: "text/csv;charset=utf-8" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `fotos-produto-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <PageShell>
      <PageHeader
        titulo="Fotos do Produto"
        icone={ImageIcon}
        estado={
          carregandoResumo
            ? "Contando a base…"
            : `${resumo?.arquivos ?? 0} arquivo(s) · ${(resumo?.mb ?? 0).toFixed(1)} MB`
        }
        acoes={
          <Button variant="outline" onClick={exportarCsv} disabled={filtradas.length === 0}>
            <Download className="mr-2 h-4 w-4" />
            Exportar CSV
          </Button>
        }
      />

      {/* faixa de números */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {[
          { rotulo: "Produtos com foto própria", valor: resumo?.com_foto },
          { rotulo: "Produtos sem foto própria", valor: resumo?.sem_foto },
          { rotulo: "Arquivos na base", valor: resumo?.arquivos },
          { rotulo: "Ocupação", valor: resumo ? `${resumo.mb.toFixed(1)} MB` : undefined },
        ].map((n) => (
          <Card key={n.rotulo}>
            <CardContent className="p-4">
              <p className="text-xs text-muted-foreground">{n.rotulo}</p>
              {carregandoResumo ? (
                <Skeleton className="mt-2 h-7 w-16" />
              ) : (
                <p className="mt-1 text-2xl tabular-nums">{n.valor ?? 0}</p>
              )}
            </CardContent>
          </Card>
        ))}
      </div>

      {/* envio em lote */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Envio em lote</CardTitle>
          <CardDescription>
            O nome do arquivo é a chave: o código de cadastro é lido de uma sequência de cinco dígitos
            começando em zero. Aceita {EXTENSOES_ACEITAS.join(", ")}, até 10 MB cada. A imagem sobe como veio.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div
            onDragOver={(e) => {
              e.preventDefault();
              setArrastando(true);
            }}
            onDragLeave={() => setArrastando(false)}
            onDrop={(e) => {
              e.preventDefault();
              setArrastando(false);
              const lista = Array.from(e.dataTransfer.files ?? []);
              if (lista.length > 0) void conferir(lista);
            }}
            className={cn(
              "flex flex-col items-center justify-center gap-2 rounded-md border-2 border-dashed p-8 text-center",
              arrastando ? "border-primary bg-primary/5" : "border-border",
            )}
          >
            <Upload className="h-6 w-6 text-muted-foreground" />
            <p className="text-sm">Arraste os arquivos aqui — vários de uma vez, ou uma pasta inteira.</p>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={() => inputRef.current?.click()}>
                Escolher arquivos
              </Button>
              <Button variant="outline" size="sm" onClick={() => inputPastaRef.current?.click()}>
                Escolher pasta
              </Button>
            </div>
            <input
              ref={inputRef}
              type="file"
              multiple
              accept={EXTENSOES_ACEITAS.join(",")}
              className="hidden"
              onChange={(e) => {
                const lista = Array.from(e.target.files ?? []);
                if (lista.length > 0) void conferir(lista);
                e.target.value = "";
              }}
            />
            <input
              ref={inputPastaRef}
              type="file"
              multiple
              // pasta inteira quando o navegador permite
              {...({ webkitdirectory: "true", directory: "true" } as Record<string, string>)}
              className="hidden"
              onChange={(e) => {
                const lista = Array.from(e.target.files ?? []);
                if (lista.length > 0) void conferir(lista);
                e.target.value = "";
              }}
            />
          </div>

          {conferindo && <p className="text-sm text-muted-foreground">Conferindo os arquivos…</p>}

          {(candidatos.length > 0 || recusados.length > 0) && !conferindo && (
            <div className="space-y-3 rounded-md border p-4">
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant="default">{candidatos.length} pronto(s) para subir</Badge>
                {substituicoes > 0 && (
                  <Badge variant="secondary">{substituicoes} substitui a foto principal atual</Badge>
                )}
                {recusados.length > 0 && <Badge variant="outline">{recusados.length} recusado(s)</Badge>}
                <div className="ml-auto flex gap-2">
                  <Button variant="ghost" size="sm" onClick={limparConferencia} disabled={enviando}>
                    <X className="mr-2 h-4 w-4" />
                    Descartar
                  </Button>
                  <Button size="sm" onClick={() => setConfirmarAberto(true)} disabled={enviando || candidatos.length === 0}>
                    Confirmar envio
                  </Button>
                </div>
              </div>

              {candidatos.length > 0 && (
                <div className="flex flex-wrap gap-3">
                  {candidatos.slice(0, 12).map((c) => (
                    <div key={c.preview} className="w-24 space-y-1 text-center">
                      <img src={c.preview} alt={c.file.name} className="h-24 w-24 rounded-md border object-cover" />
                      <p className="truncate text-xs tabular-nums">{c.cod_cadastro}</p>
                      {c.substitui && <p className="text-xs text-muted-foreground">substitui</p>}
                    </div>
                  ))}
                  {candidatos.length > 12 && (
                    <p className="self-center text-xs text-muted-foreground">
                      + {candidatos.length - 12} arquivo(s)
                    </p>
                  )}
                </div>
              )}

              {recusados.length > 0 && (
                <Alert>
                  <AlertDescription className="space-y-1">
                    <p className="text-sm">Recusados (não sobem):</p>
                    {recusados.map((r) => (
                      <p key={`${r.nome}-${r.motivo}`} className="text-xs text-muted-foreground">
                        {r.nome} — {r.motivo}
                      </p>
                    ))}
                  </AlertDescription>
                </Alert>
              )}
            </div>
          )}

          {progresso.length > 0 && (
            <div className="space-y-2 rounded-md border p-4">
              <div className="flex items-center gap-3">
                <Progress
                  value={(progresso.filter((p) => p.estado !== "fila" && p.estado !== "enviando").length / progresso.length) * 100}
                  className="h-2"
                />
                <span className="text-xs tabular-nums text-muted-foreground">
                  {progresso.filter((p) => p.estado === "ok").length}/{progresso.length}
                </span>
              </div>
              <div className="max-h-48 space-y-1 overflow-auto">
                {progresso.map((p) => (
                  <p key={p.nome} className="text-xs">
                    <span className="tabular-nums">{p.cod}</span> · {p.nome} ·{" "}
                    {p.estado === "ok"
                      ? "subiu"
                      : p.estado === "erro"
                        ? `falhou — ${p.motivo}`
                        : p.estado === "enviando"
                          ? "enviando…"
                          : "na fila"}
                  </p>
                ))}
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* lista */}
      <Card>
        <CardHeader className="space-y-3">
          <CardTitle className="text-base">Base de fotos</CardTitle>
          <div className="flex flex-wrap items-center gap-2">
            <Input
              placeholder="Buscar por código ou nome"
              value={busca}
              onChange={(e) => {
                setBusca(e.target.value);
                setPagina(1);
              }}
              className="w-64"
            />
            <Select value={filtroCatalogo} onValueChange={(v) => { setFiltroCatalogo(v); setPagina(1); }}>
              <SelectTrigger className="w-44"><SelectValue placeholder="Catálogo" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="todos">Todos os catálogos</SelectItem>
                {catalogos.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
              </SelectContent>
            </Select>
            <Select value={filtroOrigem} onValueChange={(v) => { setFiltroOrigem(v); setPagina(1); }}>
              <SelectTrigger className="w-44"><SelectValue placeholder="Origem" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="todas">Todas as origens</SelectItem>
                {origens.map((o) => <SelectItem key={o} value={o}>{o}</SelectItem>)}
              </SelectContent>
            </Select>
            <label className="flex items-center gap-2 text-sm">
              <Checkbox checked={soMultiplas} onCheckedChange={(v) => { setSoMultiplas(!!v); setPagina(1); }} />
              Só com mais de uma foto
            </label>
            <label className="flex items-center gap-2 text-sm">
              <Checkbox checked={soSemFoto} onCheckedChange={(v) => setSoSemFoto(!!v)} />
              Só sem foto própria
            </label>
          </div>
          {soSemFoto && (
            <Alert>
              <AlertDescription className="text-sm">
                Produtos sem foto própria não aparecem nesta lista — ela só mostra arquivos que existem.
                Hoje são {resumo?.sem_foto ?? 0} produto(s) sem nenhuma foto na base.
              </AlertDescription>
            </Alert>
          )}
        </CardHeader>
        <CardContent className="p-0">
          {error && (
            <Alert variant="destructive" className="m-4">
              <AlertDescription>{rawMessage(error)}</AlertDescription>
            </Alert>
          )}
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-16">Foto</TableHead>
                <TableHead>Código</TableHead>
                <TableHead>Nome comercial</TableHead>
                <TableHead>Origem</TableHead>
                <TableHead>Catálogo</TableHead>
                <TableHead>Resolução</TableHead>
                <TableHead className="text-right">Tamanho</TableHead>
                <TableHead>Principal</TableHead>
                <TableHead>Data</TableHead>
                <TableHead className="text-right">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading && (
                <TableRow><TableCell colSpan={10}><Skeleton className="h-6 w-full" /></TableCell></TableRow>
              )}
              {!isLoading && visiveis.length === 0 && (
                <TableRow>
                  <TableCell colSpan={10} className="py-8 text-center text-sm text-muted-foreground">
                    Nenhuma foto na base própria com esse recorte.
                  </TableCell>
                </TableRow>
              )}
              {visiveis.map((f) => (
                <TableRow key={f.id}>
                  <TableCell>
                    {f.url ? (
                      <a href={f.url} target="_blank" rel="noreferrer">
                        <img src={f.url} alt={f.cod_cadastro} className="h-12 w-12 rounded border object-cover" />
                      </a>
                    ) : (
                      <div className="flex h-12 w-12 items-center justify-center rounded border">
                        <ImageIcon className="h-4 w-4 text-muted-foreground" />
                      </div>
                    )}
                  </TableCell>
                  <TableCell className="tabular-nums">
                    <Link className="underline underline-offset-4" to={`/vendas/produto/ficha/${f.cod_cadastro}`}>
                      {f.cod_cadastro}
                    </Link>
                    {f.fotos_do_produto > 1 && (
                      <Badge variant="outline" className="ml-2">{f.fotos_do_produto} fotos</Badge>
                    )}
                  </TableCell>
                  <TableCell className="max-w-[260px] truncate">{f.nome_comercial ?? "—"}</TableCell>
                  <TableCell>{f.origem ?? "—"}</TableCell>
                  <TableCell>{f.catalogo ?? "—"}</TableCell>
                  <TableCell className="tabular-nums">
                    {f.largura_px && f.altura_px ? `${f.largura_px}×${f.altura_px}` : "—"}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">{mb(f.bytes)}</TableCell>
                  <TableCell>
                    {f.principal ? <Badge variant="default">principal</Badge> : <span className="text-muted-foreground">—</span>}
                  </TableCell>
                  <TableCell className="whitespace-nowrap text-muted-foreground">{fmtDataHora(f.criado_em)}</TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-1">
                      <Button
                        variant="ghost"
                        size="sm"
                        disabled={!!f.principal || tornarPrincipal.isPending}
                        onClick={() =>
                          tornarPrincipal.mutate(
                            { id: f.id, cod_cadastro: f.cod_cadastro },
                            {
                              onSuccess: () => toast.success(`Foto principal do ${f.cod_cadastro} trocada.`),
                              onError: (e) => toast.error(rawMessage(e)),
                            },
                          )
                        }
                      >
                        <Star className="mr-1 h-4 w-4" />
                        Tornar principal
                      </Button>
                      <Button variant="ghost" size="sm" onClick={() => setAExcluir(f)}>
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          <RodapePaginacao
            total={filtradas.length}
            pagina={pagina}
            tamanhoPagina={tamanhoPagina}
            tela="fotos_produto"
            onPagina={setPagina}
            onTamanhoPagina={(t) => { setTamanhoPagina(t); setPagina(1); }}
          />
        </CardContent>
      </Card>

      {/* confirmação do envio */}
      <Dialog open={confirmarAberto} onOpenChange={setConfirmarAberto}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Confirmar envio de {candidatos.length} foto(s)</DialogTitle>
            <DialogDescription>
              {substituicoes > 0
                ? `${substituicoes} produto(s) já têm foto principal — a nova assume e a anterior fica no histórico.`
                : "Nenhuma foto principal será substituída."}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1">
              <Label htmlFor="origem-fotos">Origem</Label>
              <Input
                id="origem-fotos"
                value={origem}
                onChange={(e) => setOrigem(e.target.value)}
                placeholder={ORIGENS_SUGERIDAS.join(" · ")}
              />
              <div className="flex gap-2 pt-1">
                {ORIGENS_SUGERIDAS.map((o) => (
                  <Button key={o} type="button" variant="outline" size="sm" onClick={() => setOrigem(o)}>
                    {o}
                  </Button>
                ))}
              </div>
            </div>
            <div className="space-y-1">
              <Label htmlFor="catalogo-fotos">Catálogo (opcional)</Label>
              <Input id="catalogo-fotos" value={catalogo} onChange={(e) => setCatalogo(e.target.value)} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmarAberto(false)}>Voltar</Button>
            <Button onClick={() => void subir()} disabled={!origem.trim() || enviando}>
              Subir fotos
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* exclusão */}
      <AlertDialog open={!!aExcluir} onOpenChange={(o) => !o && setAExcluir(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir a foto do {aExcluir?.cod_cadastro}?</AlertDialogTitle>
            <AlertDialogDescription>
              {aExcluir?.nome_comercial ?? "Produto sem nome comercial"} — o arquivo sai do armazenamento e o
              registro sai da base. Não tem volta.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (!aExcluir) return;
                excluir.mutate(aExcluir, {
                  onSuccess: () => {
                    toast.success(`Foto do ${aExcluir.cod_cadastro} excluída.`);
                    setAExcluir(null);
                  },
                  onError: (e) => toast.error(rawMessage(e)),
                });
              }}
            >
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </PageShell>
  );
}
