import { describe, expect, it } from "vitest";
import { parseNfseXml } from "../../../supabase/functions/_shared/nfse-xml";

const nacional = `<NFSe xmlns="http://www.sped.fazenda.gov.br/nfse"><infNFSe Id="NFS41069022213991830000170000000000004226108237685601">
<nNFSe>42</nNFSe><dhProc>2026-10-15T10:00:00-03:00</dhProc><emit><CNPJ>22139918300001</CNPJ><xNome>Prestador X</xNome></emit>
<valores><vLiq>1234.50</vLiq></valores><DPS><infDPS><toma><CNPJ>63591078000229</CNPJ></toma><serv><cServ><xDescServ>Consultoria</xDescServ></cServ></serv>
<valores><vServPrest><vServ>1300.00</vServ></vServPrest></valores></infDPS></DPS></infNFSe></NFSe>`;

const abrasfSemId = `<CompNfse xmlns="http://www.abrasf.org.br/nfse.xsd"><Nfse><InfNfse><Numero>471</Numero><DataEmissao>2026-08-21T09:00:00</DataEmissao>
<ValoresNfse><ValorLiquidoNfse>500.00</ValorLiquidoNfse></ValoresNfse><PrestadorServico><IdentificacaoPrestador><CpfCnpj><Cnpj>08744728000130</Cnpj></CpfCnpj></IdentificacaoPrestador><RazaoSocial>Loggi</RazaoSocial></PrestadorServico>
<DeclaracaoPrestacaoServico><InfDeclaracaoPrestacaoServico><Servico><Valores><ValorServicos>520.00</ValorServicos></Valores><Discriminacao>Frete</Discriminacao></Servico>
<TomadorServico><IdentificacaoTomador><CpfCnpj><Cnpj>63591078000148</Cnpj></CpfCnpj></IdentificacaoTomador></TomadorServico></InfDeclaracaoPrestacaoServico></DeclaracaoPrestacaoServico></InfNfse></Nfse></CompNfse>`;

const sp = `<RetornoConsulta><NFe><ChaveNFe><InscricaoPrestador>123</InscricaoPrestador><NumeroNFe>13304</NumeroNFe></ChaveNFe><DataEmissaoNFe>2026-08-12T11:00:00</DataEmissaoNFe>
<CPFCNPJPrestador><CNPJ>31733638000165</CNPJ></CPFCNPJPrestador><RazaoSocialPrestador>Advogados</RazaoSocialPrestador><CPFCNPJTomador><CNPJ>63591078000229</CNPJ></CPFCNPJTomador>
<ValorServicos>900</ValorServicos><Discriminacao>Honorários</Discriminacao></NFe></RetornoConsulta>`;

describe("NFS-e: mesma chave do upload manual", () => {
  it("padrão nacional usa o Id NFS inteiro (53)", () => {
    const p = parseNfseXml(nacional);
    expect(p.chave).toBe("NFS41069022213991830000170000000000004226108237685601");
    expect(p.chave).toHaveLength(53);
    expect(p).toMatchObject({ numero: "42", prestador_cnpj: "22139918300001", valor: 1234.5, tomador_cnpj: "63591078000229", descricao: "Consultoria" });
  });
  it("ABRASF sem Id sintetiza NFSE-cnpj-numero-data", () => {
    const p = parseNfseXml(abrasfSemId);
    expect(p.chave).toBe("NFSE-08744728000130-471-2026-08-21");
    expect(p.valor).toBe(500);
    expect(p.tomador_cnpj).toBe("63591078000148");
  });
  it("São Paulo capital sintetiza a mesma convenção", () => {
    const p = parseNfseXml(sp);
    expect(p.chave).toBe("NFSE-31733638000165-13304-2026-08-12");
    expect(p.valor).toBe(900);
  });
  it("sem prestador não gera chave", () => {
    expect(parseNfseXml("<Nota><Numero>1</Numero></Nota>").chave).toBeNull();
  });
});
