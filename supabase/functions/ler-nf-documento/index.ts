/**
 * Edge Function: ler-nf-documento
 *
 * Recebe um arquivo (multipart, campo "file") de NF de mercadoria — XML ou PDF —
 * e devolve o conteúdo NORMALIZADO da NF. NÃO escreve nada no banco.
 *
 * .xml -> parse estrutural da NF-e (sem IA)
 * .pdf -> leitura pelo modelo via Lovable AI Gateway (mesmo segredo LOVABLE_API_KEY
 *         usado pela função do Fala Fetely), devolvendo o MESMO shape do XML.
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";
import { XMLParser } from "https://esm.sh/fast-xml-parser@4.4.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

const SYSTEM_PROMPT = `Você é um extrator de dados de NOTAS FISCAIS brasileiras de mercadoria (DANFE).
Leia o documento e responda APENAS com um JSON no formato exato:

{
  "cnpj_emitente": "12345678000199",
  "nf": {
    "numero": "1234",
    "serie": "2",
    "chave_acesso": "35240512345678000199550020000012341000012345",
    "data_emissao": "2026-06-15",
    "data_saida": "2026-06-16",
    "container": null,
    "valor_produtos": 1000.00,
    "valor_ipi": 50.00,
    "valor_total": 1050.00,
    "peso_bruto": 120.5,
    "peso_liquido": 110.0,
    "volumes": 4
  },
  "linhas": [
    {
      "item_seq": 1,
      "codigo_nf": "ABC-01",
      "descricao": "Vela numérica",
      "ncm": "34060000",
      "quantidade": 100,
      "valor_unit": 10.00,
      "ipi_aliq": 5.00,
      "valor_total": 1000.00
    }
  ]
}

REGRAS OBRIGATÓRIAS:
1. Extraia SOMENTE o que está no documento. NUNCA infira, complete ou calcule o que não está impresso.
2. Se um campo não estiver legível ou não existir, devolva null. Nunca chute.
3. Números com ponto decimal, sem "R$" e sem separador de milhar.
4. Datas em YYYY-MM-DD.
5. cnpj_emitente somente com dígitos.
6. Uma entrada em "linhas" por item da NF, na ordem impressa, com item_seq começando em 1.
7. Responda APENAS o JSON puro, sem markdown, sem crases, sem explicação.`;

const soDigitos = (s: unknown) => String(s ?? "").replace(/\D/g, "");

const numOuNull = (v: unknown): number | null => {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(String(v).replace(",", "."));
  return Number.isFinite(n) ? n : null;
};

const txt = (v: unknown): string | null => {
  if (v === null || v === undefined) return null;
  const s = String(v).trim();
  return s === "" ? null : s;
};

const dataOuNull = (v: unknown): string | null => {
  const s = txt(v);
  if (!s) return null;
  return s.slice(0, 10);
};

const arr = <T>(v: T | T[] | undefined | null): T[] =>
  v === undefined || v === null ? [] : Array.isArray(v) ? v : [v];

function parseXmlNfe(xmlString: string) {
  const parser = new XMLParser({
    ignoreAttributes: false,
    attributeNamePrefix: "@_",
    removeNSPrefix: true,
    parseTagValue: false,
    trimValues: true,
  });
  const doc = parser.parse(xmlString);

  // infNFe pode estar em nfeProc>NFe>infNFe ou NFe>infNFe
  const nfe = doc?.nfeProc?.NFe ?? doc?.NFe ?? doc?.nfeProc?.["NFe"];
  const infNFe = nfe?.infNFe;
  if (!infNFe) throw new Error("XML não parece uma NF-e: não encontrei infNFe.");

  const ide = infNFe.ide ?? {};
  const emit = infNFe.emit ?? {};
  const total = infNFe.total?.ICMSTot ?? {};
  const transp = infNFe.transp ?? {};
  const vol = arr<any>(transp.vol)[0] ?? {};
  const infCpl = txt(infNFe.infAdic?.infCpl) ?? "";

  const chave = String(infNFe["@_Id"] ?? "").replace(/^NFe/i, "") || null;

  const mCtnr = infCpl.match(/CTNR[:\s]*([A-Za-z0-9-]+)/i) ||
    infCpl.match(/CONTAINER[:\s]*([A-Za-z0-9-]+)/i) ||
    infCpl.match(/CONT[EÊ]INER[:\s]*([A-Za-z0-9-]+)/i);

  const dets = arr<any>(infNFe.det);
  const linhas = dets.map((det, i) => {
    const prod = det?.prod ?? {};
    const ipiTrib = det?.imposto?.IPI?.IPITrib ?? det?.imposto?.IPI?.IPINT ?? {};
    return {
      item_seq: Number(det?.["@_nItem"] ?? i + 1),
      codigo_nf: txt(prod.cProd),
      descricao: txt(prod.xProd),
      ncm: txt(prod.NCM),
      quantidade: numOuNull(prod.qCom),
      valor_unit: numOuNull(prod.vUnCom),
      ipi_aliq: numOuNull(ipiTrib?.pIPI),
      valor_total: numOuNull(prod.vProd),
    };
  });

  return {
    origem: "xml" as const,
    cnpj_emitente: soDigitos(emit?.CNPJ) || null,
    nf: {
      numero: txt(ide.nNF),
      serie: txt(ide.serie),
      chave_acesso: chave,
      data_emissao: dataOuNull(ide.dhEmi ?? ide.dEmi),
      data_saida: dataOuNull(ide.dhSaiEnt ?? ide.dSaiEnt),
      container: mCtnr ? mCtnr[1] : null,
      valor_produtos: numOuNull(total.vProd),
      valor_ipi: numOuNull(total.vIPI),
      valor_total: numOuNull(total.vNF),
      peso_bruto: numOuNull(vol.pesoB),
      peso_liquido: numOuNull(vol.pesoL),
      volumes: numOuNull(vol.qVol),
    },
    linhas,
  };
}

async function lerPdfComModelo(file: File, apiKey: string) {
  const bytes = new Uint8Array(await file.arrayBuffer());
  let binary = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  const base64 = btoa(binary);

  const res = await fetch("https://ai.gateway.lovable.dev/v1/responses", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Lovable-API-Key": apiKey,
    },
    body: JSON.stringify({
      model: "openai/gpt-5.6-sol",
      instructions: SYSTEM_PROMPT,
      input: [
        {
          role: "user",
          content: [
            {
              type: "input_file",
              filename: file.name || "nf.pdf",
              file_data: `data:application/pdf;base64,${base64}`,
            },
            {
              type: "input_text",
              text: "Extraia os dados desta nota fiscal conforme o schema JSON.",
            },
          ],
        },
      ],
    }),
  });

  if (!res.ok) {
    const detail = await res.text();
    throw new Error(`Falha na leitura do PDF pelo modelo (${res.status}): ${detail}`);
  }

  const data = await res.json();
  let saida: string = data?.output_text ?? "";
  if (!saida && Array.isArray(data?.output)) {
    saida = data.output
      .flatMap((o: any) => (Array.isArray(o?.content) ? o.content : []))
      .map((c: any) => c?.text ?? "")
      .join("");
  }
  saida = String(saida).trim().replace(/^```(?:json)?/i, "").replace(/```$/, "").trim();
  if (!saida) throw new Error("O modelo não devolveu conteúdo para este PDF.");

  let parsed: any;
  try {
    parsed = JSON.parse(saida);
  } catch {
    const m = saida.match(/\{[\s\S]*\}/);
    if (!m) throw new Error(`O modelo não devolveu JSON válido: ${saida.slice(0, 500)}`);
    parsed = JSON.parse(m[0]);
  }

  const nf = parsed?.nf ?? {};
  const linhas = arr<any>(parsed?.linhas).map((l, i) => ({
    item_seq: Number(l?.item_seq ?? i + 1),
    codigo_nf: txt(l?.codigo_nf),
    descricao: txt(l?.descricao),
    ncm: txt(l?.ncm),
    quantidade: numOuNull(l?.quantidade),
    valor_unit: numOuNull(l?.valor_unit),
    ipi_aliq: numOuNull(l?.ipi_aliq),
    valor_total: numOuNull(l?.valor_total),
  }));

  return {
    origem: "pdf" as const,
    cnpj_emitente: soDigitos(parsed?.cnpj_emitente) || null,
    nf: {
      numero: txt(nf.numero),
      serie: txt(nf.serie),
      chave_acesso: txt(nf.chave_acesso),
      data_emissao: dataOuNull(nf.data_emissao),
      data_saida: dataOuNull(nf.data_saida),
      container: txt(nf.container),
      valor_produtos: numOuNull(nf.valor_produtos),
      valor_ipi: numOuNull(nf.valor_ipi),
      valor_total: numOuNull(nf.valor_total),
      peso_bruto: numOuNull(nf.peso_bruto),
      peso_liquido: numOuNull(nf.peso_liquido),
      volumes: numOuNull(nf.volumes),
    },
    linhas,
  };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return json({ error: "Não autorizado" }, 401);

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const lovableApiKey = Deno.env.get("LOVABLE_API_KEY");

    const supabaseClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user } } = await supabaseClient.auth.getUser();
    if (!user) return json({ error: "Não autorizado" }, 401);

    const formData = await req.formData();
    const file = formData.get("file") as File | null;
    if (!file) return json({ error: "Arquivo não enviado (campo 'file')." }, 400);

    const nome = (file.name || "").toLowerCase();
    const tipo = (file.type || "").toLowerCase();
    const ehXml = nome.endsWith(".xml") || tipo.includes("xml");
    const ehPdf = nome.endsWith(".pdf") || tipo.includes("pdf");

    if (!ehXml && !ehPdf) {
      return json(
        { error: `Arquivo não suportado: "${file.name}". Envie o XML da NF-e ou o PDF do DANFE.` },
        400,
      );
    }

    let resultado;
    if (ehXml) {
      const texto = await file.text();
      if (!texto.trim()) return json({ error: "O arquivo XML está vazio." }, 400);
      resultado = parseXmlNfe(texto);
    } else {
      if (!lovableApiKey) {
        return json({ error: "LOVABLE_API_KEY não configurada para leitura de PDF." }, 500);
      }
      resultado = await lerPdfComModelo(file, lovableApiKey);
    }

    if (!resultado.linhas || resultado.linhas.length === 0) {
      return json(
        {
          error:
            `Nenhum item foi lido do arquivo (${resultado.origem.toUpperCase()}). ` +
            `Sem linhas não dá para lançar a NF — confira se o arquivo é a nota fiscal completa.`,
        },
        422,
      );
    }

    return json(resultado);
  } catch (e) {
    console.error("ler-nf-documento:", e);
    return json({ error: e instanceof Error ? e.message : String(e) }, 500);
  }
});
