import { nomeArquivoExtrato, pontosDeCorte, type BlocoCorte } from "./pdfSeparados";

const MARGEM_MM = 15;
const LARGURA_MM = 180;
const ALTURA_UTIL_MM = 297 - 2 * MARGEM_MM;

const ESTILO_CAPTURA = `
  .documento-extrato { padding: 0 !important; background: hsl(var(--card)) !important; }
  .documento-extrato .pagina-a4 { width: 180mm !important; max-width: none !important; min-height: 0 !important; padding: 0 !important; margin: 0 0 10mm !important; box-shadow: none !important; }
  .tela-apenas, .seletor-competencia { display: none !important; }
`;

function carregarIframe(url: string): Promise<HTMLIFrameElement> {
  return new Promise((resolve, reject) => {
    const f = document.createElement("iframe");
    f.setAttribute("aria-hidden", "true");
    f.style.cssText = "position:fixed;left:-10000px;top:0;width:1100px;height:6000px;border:0;";
    f.onload = () => resolve(f);
    f.onerror = () => reject(new Error("Falha ao abrir o lote de extratos."));
    f.src = url;
    document.body.appendChild(f);
  });
}

const esperar = (ms: number) => new Promise(r => setTimeout(r, ms));

/** Espera até todos os documentos do lote estarem prontos (ou falharem). */
async function aguardarLote(doc: Document): Promise<HTMLElement[]> {
  const fim = Date.now() + 90_000;
  let estavel = 0;
  while (Date.now() < fim) {
    const erro = doc.body.innerText.match(/Falha ao listar os extratos:.*|Competência inválida.*/);
    if (erro) throw new Error(erro[0]);
    const main = doc.querySelector("main.documento-extrato");
    const itens = [...doc.querySelectorAll<HTMLElement>("[data-representante]")];
    const vazio = main && /Nenhum extrato neste mês/.test(main.textContent ?? "");
    if (vazio) return [];
    const prontos = itens.length > 0 && itens.every(i => i.querySelector(".pagina-mensal") || /Falha|erro/i.test(i.textContent ?? ""));
    estavel = prontos ? estavel + 1 : 0;
    if (estavel >= 3) return itens;
    await esperar(400);
  }
  return [...doc.querySelectorAll<HTMLElement>("[data-representante]")];
}

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
  const canvas = await html2canvas(sec, { scale: escala, backgroundColor: "#ffffff", useCORS: true, logging: false, windowWidth: sec.ownerDocument.documentElement.scrollWidth, windowHeight: sec.ownerDocument.documentElement.scrollHeight });
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

export interface ResultadoPdfs { gerados: number; falhas: string[] }

/** Gera um PDF por representante a partir do lote e baixa um zip. */
export async function gerarPdfsSeparados(competencia: string, nomeZip: string, progresso: (atual: number, total: number) => void): Promise<ResultadoPdfs> {
  const iframe = await carregarIframe(`/comercial/representantes/extratos-impressao?competencia=${competencia}`);
  try {
    const doc = iframe.contentDocument;
    if (!doc) throw new Error("Não foi possível ler o lote de extratos.");
    const itens = await aguardarLote(doc);
    if (!itens.length) throw new Error("Nenhum extrato neste mês.");
    const estilo = doc.createElement("style"); estilo.textContent = ESTILO_CAPTURA; doc.head.appendChild(estilo);
    await doc.fonts?.ready;
    await esperar(300);
    const { default: JSZip } = await import("jszip");
    const zip = new JSZip();
    const falhas: string[] = [];
    const usados = new Set<string>();
    for (let i = 0; i < itens.length; i++) {
      const nome = itens[i].dataset.representante || "Sem nome";
      progresso(i + 1, itens.length);
      try {
        const sec = itens[i].querySelector<HTMLElement>(".pagina-mensal");
        if (!sec) throw new Error("documento não carregou");
        let arquivo = nomeArquivoExtrato(competencia, nome);
        for (let n = 2; usados.has(arquivo); n++) arquivo = nomeArquivoExtrato(competencia, `${nome} ${n}`);
        usados.add(arquivo);
        zip.file(arquivo, await pdfDaSecao(sec));
      } catch (e) {
        falhas.push(`${nome} (${e instanceof Error ? e.message : String(e)})`);
      }
    }
    const gerados = itens.length - falhas.length;
    if (gerados > 0) {
      const blob = await zip.generateAsync({ type: "blob" });
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob); a.download = nomeZip;
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(a.href), 10_000);
    }
    return { gerados, falhas };
  } finally {
    iframe.remove();
  }
}
