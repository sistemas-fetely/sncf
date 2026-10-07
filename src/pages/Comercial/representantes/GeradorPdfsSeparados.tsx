import { useCallback, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Download, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { formatError } from "@/lib/format-error";
import { EstilosExtrato, ExtratoRepresentanteDocumento } from "./ExtratoRepresentanteDocumento";
import { listarRepresentantesDoLote } from "./loteRepresentantes";
import { nomeArquivoExtrato, nomeZipExtratos, pontosDeCorte, type BlocoCorte } from "./pdfSeparados";

const MARGEM_MM = 15;
const LARGURA_MM = 180;
const ALTURA_UTIL_MM = 297 - 2 * MARGEM_MM;
const TIMEOUT_MS = 45_000;

const ESTILO_CAPTURA = `
  .captura-pdf .documento-extrato { padding: 0 !important; background: hsl(var(--card)) !important; min-height: 0 !important; }
  .captura-pdf .documento-extrato .pagina-a4 { width: 180mm !important; max-width: none !important; min-height: 0 !important; padding: 0 0 6mm !important; margin: 0 !important; box-shadow: none !important; }
  .captura-pdf .tela-apenas, .captura-pdf .seletor-competencia { display: none !important; }
`;

const esperar = (ms: number) => new Promise(r => setTimeout(r, ms));
const quadro = () => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));

function blocosDe(sec: HTMLElement): BlocoCorte[] {
  const base = sec.getBoundingClientRect().top;
  const sel = "header, tr, h2, .rodape-mensal, .grid > div, p";
  return [...sec.querySelectorAll<HTMLElement>(sel)].map(el => {
    const r = el.getBoundingClientRect();
    return { top: r.top - base, bottom: r.bottom - base, grudaProximo: el.tagName === "H2" || el.classList.contains("cabecalho-mes") || el.parentElement?.tagName === "THEAD" };
  }).filter(b => b.bottom > b.top);
}

async function pdfDaSecao(sec: HTMLElement): Promise<Blob> {
  const [{ default: html2canvas }, { jsPDF }] = await Promise.all([import("html2canvas"), import("jspdf")]);
  const larguraCss = sec.getBoundingClientRect().width;
  const pxPorMm = larguraCss / LARGURA_MM;
  const totalCss = Math.ceil(sec.getBoundingClientRect().height);
  const cortes = pontosDeCorte(totalCss, ALTURA_UTIL_MM * pxPorMm, blocosDe(sec));
  const escala = 2.5;
  const canvas = await html2canvas(sec, { scale: escala, backgroundColor: "#ffffff", useCORS: true, logging: false });
  const pdf = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4", compress: true });
  const limites = [0, ...cortes, totalCss];
  for (let i = 0; i < limites.length - 1; i++) {
    const y0 = Math.round(limites[i] * escala), y1 = Math.min(canvas.height, Math.round(limites[i + 1] * escala));
    if (y1 <= y0) continue;
    const fatia = document.createElement("canvas");
    fatia.width = canvas.width; fatia.height = y1 - y0;
    const ctx = fatia.getContext("2d");
    if (!ctx) throw new Error("Canvas indisponível no navegador.");
    ctx.fillStyle = "#ffffff"; ctx.fillRect(0, 0, fatia.width, fatia.height);
    ctx.drawImage(canvas, 0, y0, canvas.width, y1 - y0, 0, 0, canvas.width, y1 - y0);
    if (i > 0) pdf.addPage();
    pdf.addImage(fatia.toDataURL("image/jpeg", 0.95), "JPEG", MARGEM_MM, MARGEM_MM, LARGURA_MM, (y1 - y0) / escala / pxPorMm);
  }
  return pdf.output("blob");
}

function baixar(url: string, nome: string) {
  const a = document.createElement("a");
  a.href = url; a.download = nome; a.rel = "noopener";
  document.body.appendChild(a); a.click(); a.remove();
}

interface Atual { id: string; resolver: (erro: string | null) => void }

/** Botão "Baixar PDFs separados": renderiza cada extrato do lote na própria página, um por vez. */
export function BotaoPdfsSeparados({ competencia }: { competencia: string }) {
  const [prog, setProg] = useState<string | null>(null);
  const [atual, setAtual] = useState<Atual | null>(null);
  const caixa = useRef<HTMLDivElement>(null);
  const aoPronto = useCallback((erro: string | null) => atual?.resolver(erro), [atual]);

  /** Monta o documento do representante e devolve a seção pronta (ou erro / timeout). */
  const renderizar = (id: string) => new Promise<HTMLElement | null>((resolve, reject) => {
    let feito = false;
    const t = setTimeout(() => { feito = true; reject(new Error("tempo esgotado (45 s) ao carregar os dados")); }, TIMEOUT_MS);
    setAtual({
      id,
      resolver: async (erro) => {
        if (feito) return; feito = true;
        if (erro) { clearTimeout(t); reject(new Error(erro)); return; }
        await quadro();
        await document.fonts?.ready;
        await quadro();
        clearTimeout(t);
        resolve(caixa.current?.querySelector<HTMLElement>(".pagina-mensal") ?? null);
      },
    });
  });

  const gerar = async () => {
    setProg("Preparando…");
    try {
      let lista: { id: string; nome: string }[];
      try { lista = await listarRepresentantesDoLote(competencia); }
      catch (e) { throw new Error(`não foi possível listar os representantes: ${formatError(e)}`); }
      if (!lista.length) throw new Error("nenhum extrato neste mês.");
      const { default: JSZip } = await import("jszip");
      const zip = new JSZip();
      const falhas: string[] = [];
      const usados = new Set<string>();
      for (let i = 0; i < lista.length; i++) {
        const { id, nome } = lista[i];
        setProg(`Gerando ${i + 1}/${lista.length}…`);
        try {
          const sec = await renderizar(id);
          if (!sec) throw new Error("sem extrato nesta competência");
          let arquivo = nomeArquivoExtrato(competencia, nome);
          for (let n = 2; usados.has(arquivo); n++) arquivo = nomeArquivoExtrato(competencia, `${nome} ${n}`);
          usados.add(arquivo);
          zip.file(arquivo, await pdfDaSecao(sec));
        } catch (e) {
          falhas.push(`${nome}: ${formatError(e)}`);
        } finally {
          setAtual(null);
          await esperar(50);
        }
      }
      const gerados = lista.length - falhas.length;
      if (!gerados) throw new Error(`nenhum PDF gerado. ${falhas.join("; ")}`);
      const nomeZip = nomeZipExtratos(competencia);
      const url = URL.createObjectURL(await zip.generateAsync({ type: "blob" }));
      baixar(url, nomeZip);
      setTimeout(() => URL.revokeObjectURL(url), 10 * 60_000);
      const acao = { label: "Baixar zip", onClick: () => baixar(url, nomeZip) };
      const msg = `${gerados} PDF(s) gerados em ${nomeZip}.`;
      if (falhas.length) toast.error(`${msg} Falharam: ${falhas.join("; ")}`, { action: acao, duration: 60_000 });
      else toast.success(msg, { description: "Se o download não começou, clique em Baixar zip.", action: acao, duration: 30_000 });
    } catch (e) {
      toast.error(`Falha ao gerar os PDFs: ${formatError(e)}`, { duration: 30_000 });
    } finally {
      setAtual(null);
      setProg(null);
    }
  };

  return (
    <>
      <Button size="sm" variant="outline" onClick={gerar} disabled={prog !== null}>
        {prog ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <Download className="mr-1 h-4 w-4" />}
        {prog ?? "Baixar PDFs separados"}
      </Button>
      {atual && createPortal(
        <div ref={caixa} aria-hidden="true" className="captura-pdf"
          style={{ position: "fixed", left: -10000, top: 0, width: "180mm", pointerEvents: "none" }}>
          <style>{ESTILO_CAPTURA}</style>
          <main className="documento-extrato">
            <EstilosExtrato />
            <ExtratoRepresentanteDocumento key={atual.id} vendedorId={atual.id} competencia={competencia} mostrarSeletor={false} onPronto={aoPronto} />
          </main>
        </div>,
        document.body,
      )}
    </>
  );
}
