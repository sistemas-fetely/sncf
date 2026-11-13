// MESA-SP-ETIQUETA-CORREIOS-ZPL (13/11/2026): rótulo Correios 10x15 (203 dpi) montado pelo SNCF em ZPL
// a partir da pré-postagem já gravada. A API de pré-postagem dos Correios só devolve o rótulo em PDF e
// não devolve o conteúdo do DataMatrix — por isso a string 2D é montada aqui pelo leiaute do manual de
// etiquetas dos Correios. Sem telefone nem CPF/CNPJ do cliente (regra da Mesa SP).

export interface EnderecoCorreios {
  cep: string; logradouro: string; numero: string; complemento?: string | null;
  bairro: string; cidade: string; uf: string;
}
export interface DadosEtiquetaCorreios {
  codigoObjeto: string;
  servico: string;            // "SEDEX" | "PAC"
  codigoServico: string;      // ex.: "03220"
  cartao: string;
  contrato: string | null;
  notaFiscal: string | null;
  pesoG: number | null;
  volume: number; volumes: number;
  destinatario: { nome: string; endereco: EnderecoCorreios };
  remetente: { nome: string; endereco: EnderecoCorreios };
}

const dig = (v: unknown) => String(v ?? "").replace(/\D/g, "");
/** Remove acentos e caracteres de controle ZPL (^ e ~) — usado no DataMatrix (ASCII puro). */
export const ascii = (v: unknown) => String(v ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^\x20-\x7e]/g, "").replace(/[\^~|]/g, " ");
/** Texto impresso (UTF-8 com ^CI28): só tira ^ e ~, que quebrariam o comando. */
const tx = (v: unknown) => String(v ?? "").replace(/[\^~]/g, " ").replace(/\s+/g, " ").trim();
const padNum = (v: unknown, n: number) => dig(v).slice(-n).padStart(n, "0");
const padTxt = (v: unknown, n: number) => ascii(v).slice(0, n).padEnd(n, " ");

/** Dígito validador do CEP destino: soma dos dígitos → quanto falta para o próximo múltiplo de 10. */
export function validadorCep(cep: string): number {
  const s = dig(cep).split("").reduce((a, c) => a + Number(c), 0);
  return s % 10 === 0 ? 0 : 10 - (s % 10);
}

/**
 * Conteúdo do DataMatrix (leiaute 2D do manual de etiquetas dos Correios):
 * CEP dest(8) nº dest(5) CEP orig(8) nº orig(5) validador(1) IDV(2) objeto(13) serv. adicionais(10)
 * cartão(10) cód. serviço(5) agrupamento(2) nº logradouro(5) complemento(20) valor declarado(5)
 * telefone(12, vazio) latitude(10) longitude(10) "|" reserva(30).
 */
export function conteudoDataMatrix(d: DadosEtiquetaCorreios): string {
  const de = d.destinatario.endereco, re = d.remetente.endereco;
  return [
    padNum(de.cep, 8), padNum(de.numero, 5), padNum(re.cep, 8), padNum(re.numero, 5),
    String(validadorCep(de.cep)), "51", ascii(d.codigoObjeto).toUpperCase().padEnd(13, " ").slice(0, 13),
    "2500000000", padNum(d.cartao, 10), padNum(d.codigoServico, 5), "00",
    padNum(de.numero, 5), padTxt(de.complemento, 20), "00000", "000000000000",
    "-00.000000", "-00.000000", "|", " ".repeat(30),
  ].join("");
}

const fmtCep = (c: string) => { const x = padNum(c, 8); return `${x.slice(0, 5)}-${x.slice(5)}`; };
const fmtPeso = (g: number | null) => (g && g > 0 ? `${(g / 1000).toLocaleString("pt-BR", { minimumFractionDigits: 3 })} kg` : "—");
const corta = (v: string, n: number) => (v.length > n ? v.slice(0, n - 1) + "." : v);

function linhasEndereco(e: EnderecoCorreios): string[] {
  const rua = [tx(e.logradouro), tx(e.numero) || "S/N"].filter(Boolean).join(", ");
  return [rua, tx(e.complemento), tx(e.bairro)].filter(Boolean);
}

/** Etiqueta Correios completa em ZPL (^PW812 ^LL1218). */
export function montarEtiquetaCorreiosZpl(d: DadosEtiquetaCorreios): string {
  const obj = ascii(d.codigoObjeto).toUpperCase().trim();
  const serv = tx(d.servico).toUpperCase() || "CORREIOS";
  const dest = d.destinatario, rem = d.remetente;
  const z: string[] = ["^XA", "^CI28", "^PW812", "^LL1218", "^LH0,0"];
  const t = (x: number, y: number, h: number, s: string, larg = 760) =>
    z.push(`^FO${x},${y}^FB${larg},1,0,L^A0N,${h},${h}^FD${s}^FS`);

  // Topo: DataMatrix | contrato/cartão | símbolo do serviço
  z.push(`^FO30,30^BXN,5,200,,,,~^FD${conteudoDataMatrix(d)}^FS`);
  t(300, 40, 26, "Contrato", 250);
  t(300, 70, 30, tx(d.contrato) || "—", 250);
  t(300, 110, 26, "Cartão", 250);
  t(300, 140, 30, tx(d.cartao), 250);
  t(300, 185, 26, `Volume ${d.volume}/${d.volumes}`, 250);
  t(300, 215, 26, `Peso ${fmtPeso(d.pesoG)}`, 250);
  z.push("^FO560,30^GB222,130,130^FS");
  z.push(`^FO560,62^FB222,1,0,C^A0N,70,70^FR^FD${serv}^FS`);
  t(560, 172, 24, `Cód. serviço ${padNum(d.codigoServico, 5)}`, 222);
  t(560, 205, 26, `NF ${tx(d.notaFiscal) || "—"}`, 222);

  // Código de rastreio
  z.push(`^FO30,270^FB752,1,0,C^A0N,52,52^FD${obj}^FS`);
  z.push(`^FO96,330^BY3,3,170^BCN,170,N,N,N^FD${obj}^FS`);
  z.push(`^FO30,508^FB752,1,0,C^A0N,34,34^FD${obj.replace(/^(\w{2})(\d{3})(\d{3})(\d{3})(\w{2})$/, "$1 $2 $3 $4 $5")}^FS`);

  // Recebimento
  t(30, 556, 26, "Recebedor: ____________________________________________");
  t(30, 594, 26, "Assinatura: _______________________  Documento: ____________");

  // Destinatário
  z.push("^FO20,636^GB772,44,44^FS");
  z.push("^FO36,645^A0N,30,30^FR^FDDESTINATÁRIO^FS");
  let y = 692;
  t(36, y, 34, corta(tx(dest.nome), 42)); y += 42;
  for (const l of linhasEndereco(dest.endereco)) { t(36, y, 28, corta(l, 52)); y += 34; }
  t(36, y, 34, `${fmtCep(dest.endereco.cep)}  ${tx(dest.endereco.cidade)}/${tx(dest.endereco.uf)}`); y += 46;
  z.push(`^FO36,${y}^BY3,3,80^BCN,80,N,N,N^FD${padNum(dest.endereco.cep, 8)}^FS`);
  z.push("^FO20,636^GB772,354,3^FS");

  // Remetente
  y = 1004;
  t(30, y, 26, "REMETENTE"); y += 32;
  t(30, y, 26, corta(tx(rem.nome), 60)); y += 30;
  t(30, y, 24, corta(linhasEndereco(rem.endereco).join(" - "), 66)); y += 28;
  t(30, y, 24, `${fmtCep(rem.endereco.cep)}  ${tx(rem.endereco.cidade)}/${tx(rem.endereco.uf)}`);
  z.push("^XZ");
  return z.join("\n");
}

/** Converte payload_envio gravado em correios_prepostagem nos dados da etiqueta. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function dadosDaPrepostagem(pp: { codigo_objeto: string | null; servico: string | null; cartao: string; payload_envio: any }, contrato: string | null): DadosEtiquetaCorreios {
  const p = pp.payload_envio ?? {};
  if (!pp.codigo_objeto) throw new Error("Pré-postagem sem código de objeto.");
  const end = (e: Partial<EnderecoCorreios> | undefined): EnderecoCorreios => ({
    cep: dig(e?.cep), logradouro: e?.logradouro ?? "", numero: e?.numero ?? "S/N", complemento: e?.complemento ?? "",
    bairro: e?.bairro ?? "", cidade: e?.cidade ?? "", uf: e?.uf ?? "",
  });
  if (dig(p.destinatario?.endereco?.cep).length !== 8) throw new Error(`Pré-postagem ${pp.codigo_objeto}: CEP do destinatário ausente no envio gravado.`);
  return {
    codigoObjeto: pp.codigo_objeto, servico: pp.servico ?? "", codigoServico: String(p.codigoServico ?? ""),
    cartao: pp.cartao, contrato, notaFiscal: p.numeroNotaFiscal ?? null,
    pesoG: Number(p.pesoInformado) || null, volume: 1, volumes: 1,
    destinatario: { nome: p.destinatario?.nome ?? "", endereco: end(p.destinatario?.endereco) },
    remetente: { nome: p.remetente?.nome ?? "", endereco: end(p.remetente?.endereco) },
  };
}
