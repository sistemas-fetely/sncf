import { assertEquals, assertRejects } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { cachearNfSaida, type NfCacheRow } from "../_shared/nf-cache-storage.ts";

const nf: NfCacheRow = {
  id: "nf-1", numero: "000001", serie: "2", origem: "sublimity", data_emissao: "2026-10-17",
  situacao: "autorizada", bling_id: null, pdf_url: null, xml_url: null,
  xml_storage_path: "nfs/2026-10/saida/000001-2.xml", pdf_storage_path: null,
};
const xml = `<NFe><infNFe Id="NFe35261063591078000148550020000000011000000010"><ide><mod>55</mod><nNF>1</nNF><serie>2</serie><dhEmi>2026-10-17</dhEmi></ide><total><ICMSTot><vNF>10.00</vNF></ICMSTot></total></infNFe></NFe>`;

function cliente(falhaUpload = false) {
  const calls: { downloads: string[]; uploads: { path: string; bytes: Uint8Array }[]; updates: Record<string, unknown>[] } = { downloads: [], uploads: [], updates: [] };
  const client = {
    rpc: () => { throw new Error("Sublimity não deve consultar Bling"); },
    storage: { from: (bucket: string) => {
      assertEquals(bucket, "contabil");
      return {
        download: (path: string) => { calls.downloads.push(path); return { data: new Blob([xml]), error: null }; },
        upload: (path: string, bytes: Uint8Array) => { calls.uploads.push({ path, bytes }); return { error: falhaUpload ? { message: "armazenamento indisponível" } : null }; },
      };
    } },
    from: (table: string) => {
      assertEquals(table, "nfs_emitidas");
      return { update: (patch: Record<string, unknown>) => {
        calls.updates.push(patch);
        return { eq: () => ({ is: () => ({ error: null }) }) };
      } };
    },
  };
  return { client, calls };
}

Deno.test("Sublimity série 2: PDF vem do XML guardado e recebe gerado_xml", async () => {
  const { client, calls } = cliente();
  const result = await cachearNfSaida(client, nf);
  assertEquals(calls.downloads, ["nfs/2026-10/saida/000001-2.xml"]);
  assertEquals(calls.uploads[0].path, "nfs/2026-10/saida/000001-2.pdf");
  assertEquals(new TextDecoder().decode(calls.uploads[0].bytes.slice(0, 5)), "%PDF-");
  assertEquals(calls.updates[0].pdf_origem, "gerado_xml");
  assertEquals(calls.updates[0].pdf_storage_path, result.pdf);
});

Deno.test("Repescagem preserva PDF existente sem nova geração", async () => {
  const { client, calls } = cliente();
  await cachearNfSaida(client, { ...nf, pdf_storage_path: "existente.pdf", pdf_origem: "gerado_xml" });
  assertEquals(calls.downloads.length, 0);
  assertEquals(calls.updates.length, 0);
});

Deno.test("XML ausente falha sem consulta externa ou marcação de PDF", async () => {
  const { client, calls } = cliente();
  await assertRejects(() => cachearNfSaida(client, { ...nf, xml_storage_path: null }), Error, "XML não guardado");
  assertEquals(calls.updates.length, 0);
});

Deno.test("Falha no upload expõe mensagem e não marca PDF guardado", async () => {
  const { client, calls } = cliente(true);
  await assertRejects(() => cachearNfSaida(client, nf), Error, "armazenamento indisponível");
  assertEquals(calls.updates.length, 0);
});