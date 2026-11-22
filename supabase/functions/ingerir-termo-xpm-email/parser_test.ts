import { strict as assert } from "node:assert";
import { dataBrasilia, dataOriginalEncaminhado, parsearTermoEmail } from "./parser.ts";

Deno.test("Outlook forwarding is parsed with the production HTML parser and Brasília date", () => {
  const html = `<div id="divRplyFwdMsg"><b>De:</b> XPM<br><b>Enviado:</b> segunda-feira, 10 de novembro de 2026 23:32</div>
    <table><tr><th>DOCUMENTO</th><th>ITEM</th><th>DECLARADO</th><th>RECEBIDO</th></tr>
    <tr><td>178804</td><td>LUM001</td><td>6</td><td>6</td></tr></table>`;
  const original = dataOriginalEncaminhado(html);
  assert.equal(original?.toISOString(), "2026-11-11T02:32:00.000Z");
  assert.ok(original);
  assert.equal(dataBrasilia(original.toISOString()), "2026-11-10");
  assert.equal(parsearTermoEmail(html)[0].recebido, 6);
});

Deno.test("production parser uses Gmail text fallback and the first original date", () => {
  const text = `Data: 12/11/2026 09:00
    ---------- Forwarded message ---------
    Date: Mon, 10 Nov 2026 at 17:32
    ---------- Forwarded message ---------
    Date: Mon, 09 Nov 2026 at 17:32`;
  assert.equal(dataOriginalEncaminhado("<p>Termo</p>", text)?.toISOString(), "2026-11-10T20:32:00.000Z");
});

Deno.test("production parser accepts accented March and Gmail Em header", () => {
  assert.equal(dataOriginalEncaminhado("", "-----Mensagem original-----\nEnviada em: 10 de março de 2026 17:32")?.toISOString(),
    "2026-03-10T20:32:00.000Z");
  assert.equal(dataOriginalEncaminhado("", "Em seg., 10 de nov. de 2026 às 17:32 escreveu:")?.toISOString(),
    "2026-11-10T20:32:00.000Z");
});