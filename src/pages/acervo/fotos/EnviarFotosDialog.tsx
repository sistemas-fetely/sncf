// ENVIAR FOTOS (envio manual da base própria) — Dialog do cabeçalho de /vendas/produto/fotos (28/11/2026, mapa-repositorio-midia-v1).
// Mesmo comportamento do envio em lote de sempre: o nome do arquivo é a chave (cinco dígitos começando em 0),
// conferência antes de gravar, produto inexistente não sobe, troca de principal nunca apaga a anterior.
import { useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Upload, X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { rawMessage } from "@/lib/format-error";
import { cn } from "@/lib/utils";
import { KEY_MIDIA } from "@/hooks/useMidiaGestao";
import { EXTENSOES_ACEITAS, LIMITE_BYTES, ORIGENS_SUGERIDAS, enviarFoto, extensaoValida, extrairCodCadastro } from "@/hooks/useFotosProduto";

type Candidato = { file: File; cod_cadastro: string; existe: boolean; substitui: boolean; preview: string };
type Recusado = { nome: string; motivo: string };
type Progresso = { nome: string; cod: string; estado: "fila" | "enviando" | "ok" | "erro"; motivo?: string };

function mb(bytes: number | null | undefined) {
  if (!bytes) return "—";
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

export function EnviarFotosDialog({ aberto, onAberto }: { aberto: boolean; onAberto: (v: boolean) => void }) {
  const qc = useQueryClient();
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
    qc.invalidateQueries({ queryKey: KEY_MIDIA });
    candidatos.forEach((c) => URL.revokeObjectURL(c.preview));
    setCandidatos([]);
    if (subiram > 0) toast.success(`${subiram} foto(s) na base própria.`);
    if (falhas.length > 0) {
      setRecusados((r) => [...r, ...falhas]);
      toast.error(`${falhas.length} arquivo(s) falharam. Veja o relatório no envio.`);
    }
  }

  const substituicoes = candidatos.filter((c) => c.substitui).length;

  return (
    <>
      <Dialog open={aberto} onOpenChange={(o) => { if (!enviando) onAberto(o); }}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-3xl">
          <DialogHeader>
            <DialogTitle>Enviar fotos</DialogTitle>
            <DialogDescription>Envio manual para a base própria. A principal enviada manualmente tem prioridade sobre a da Shopify.</DialogDescription>
          </DialogHeader>
      {/* envio em lote */}
      <div className="space-y-4">
        <p className="text-sm text-muted-foreground">
            O nome do arquivo é a chave: o código de cadastro é lido de uma sequência de cinco dígitos
            começando em zero. Aceita {EXTENSOES_ACEITAS.join(", ")}, até 10 MB cada. A imagem sobe como veio.
        </p>
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
      </div>

        </DialogContent>
      </Dialog>

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

    </>
  );
}
