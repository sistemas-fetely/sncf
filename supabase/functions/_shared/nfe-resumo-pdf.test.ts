import { gerarResumoNfePdf, paraWinAnsi } from "./nfe-resumo-pdf.ts";
const assert = (v: boolean, m: string) => { if (!v) throw new Error(m); };

const XML = `<?xml version="1.0" encoding="UTF-8"?>
<nfeProc versao="4.00" xmlns="http://www.portalfiscal.inf.br/nfe"><NFe><infNFe Id="NFe35261100000000000191550010085592671000000001" versao="4.00">
<ide><nNF>8559267</nNF><serie>1</serie><dhEmi>2026-11-10T10:00:00-03:00</dhEmi><natOp>Venda — mercadoria\u0081</natOp><mod>55</mod><tpNF>1</tpNF></ide>
<emit><CNPJ>00000000000191</CNPJ><xNome>SUPRICORP\u0081 — Suprimentos → Ltda</xNome><enderEmit><xLgr>Rua A</xLgr><nro>1</nro><xBairro>Centro</xBairro><xMun>São Paulo</xMun><UF>SP</UF><CEP>01000000</CEP></enderEmit><IE>123</IE></emit>
<dest><CNPJ>11111111000191</CNPJ><xNome>Fetely — Destino</xNome><enderDest><xLgr>Rua B</xLgr><nro>2</nro><xBairro>Centro</xBairro><xMun>Joinville</xMun><UF>SC</UF><CEP>89200000</CEP></enderDest></dest>
<det nItem="1"><prod><cProd>X1</cProd><xProd>Caneta\u0081 azul — cx</xProd><NCM>96081000</NCM><CFOP>5102</CFOP><qCom>2.0000</qCom><vUnCom>1.50</vUnCom><vProd>3.00</vProd></prod></det>
<total><ICMSTot><vBC>0</vBC><vICMS>0</vICMS><vIPI>0</vIPI><vProd>3.00</vProd><vFrete>0</vFrete><vNF>3.00</vNF></ICMSTot></total>
<infAdic><infCpl>Obs\u0081 — teste → fim</infCpl></infAdic>
</infNFe></NFe><protNFe><infProt><chNFe>35261100000000000191550010085592671000000001</chNFe></infProt></protNFe></nfeProc>`;

Deno.test("paraWinAnsi troca travessão/seta e remove controles", () => {
  assert(paraWinAnsi("a\u0081 — b → c") === "a - b - c", paraWinAnsi("a\u0081 — b → c"));
  assert(paraWinAnsi("São ✓") === "São ?", "fora de WinAnsi vira ?");
});

Deno.test("NF-e com \\u0081 e travessão gera PDF sem erro de WinAnsi", async () => {
  const pdf = await gerarResumoNfePdf(XML);
  assert(pdf.length > 1000, "PDF vazio");
  assert(new TextDecoder().decode(pdf.slice(0, 5)) === "%PDF-", "não é PDF");
});
