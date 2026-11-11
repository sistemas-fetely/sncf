import { describe, it as test } from "jsr:@std/testing/bdd";
import { assertEquals, assertRejects } from "jsr:@std/assert";
import JSZip from "npm:jszip@3.10.1";
import { extrairEtiqueta, baixarEtiqueta } from "./etiqueta.ts";

describe("marketplace label extraction", () => {
  test("extracts PDF from ZIP and prioritizes it over ZPL", async () => {
    const zip = new JSZip(); zip.file("label.pdf", "%PDF-label"); zip.file("label.zpl", "^XA^XZ");
    const result = await extrairEtiqueta(await zip.generateAsync({ type: "uint8array" }));
    assertEquals(result, { formato: "PDF", pdf_base64: btoa("%PDF-label"), arquivos: ["label.pdf"] });
  });
  test("concatenates numeric-named ZPL and TXT for diagnostics", async () => {
    const zip = new JSZip(); zip.file("1.zpl", "^XAone^XZ"); zip.file("2.txt", "^XAtwo^XZ"); zip.file("readme.html", "ignore");
    assertEquals(await extrairEtiqueta(await zip.generateAsync({ type: "uint8array" })), { formato: "ZPL", zpl: "^XAone^XZ\n^XAtwo^XZ", arquivos: ["1.zpl", "2.txt"] });
  });
  test("accepts a direct PDF", async () => {
    assertEquals((await extrairEtiqueta(new TextEncoder().encode("%PDF-direct"))).formato, "PDF");
  });
  test("rejects archives without labels", async () => {
    const zip = new JSZip(); zip.file("readme.html", "ignore");
    const bytes = await zip.generateAsync({ type: "uint8array" });
    await assertRejects(() => extrairEtiqueta(bytes), Error, "PDF ou ZPL");
  });
  test("refuses non-S3 or non-HTTPS links before download", async () => {
    for (const link of ["http://bucket.s3.amazonaws.com/a", "https://example.com/a", "https://amazonaws.com.evil.test/a"]) await assertRejects(() => baixarEtiqueta(link), Error, "S3 HTTPS");
  });
});