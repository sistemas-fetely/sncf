import { assertEquals } from "jsr:@std/assert@1";
import { htmlParaTexto } from "./html-texto.ts";
Deno.test("p e br", () => assertEquals(htmlParaTexto("<p>Um</p><p>Dois<br>Três</p>"), "Um\nDois\nTrês"));
Deno.test("lista", () => assertEquals(htmlParaTexto("<p>Itens:</p><ul><li>A</li><li>B</li></ul>"), "Itens:\n\n- A\n- B"));
Deno.test("entidades", () => assertEquals(htmlParaTexto("a &amp; b&nbsp;&quot;c&quot; &#39;d&#39; &lt;e&gt; &#233;&#xE9;"), "a & b \"c\" 'd' <e> éé"));
Deno.test("tags desconhecidas e quebras", () => assertEquals(htmlParaTexto("<span class='x'>Oi</span><custom>!</custom><p></p><p></p><p></p><p>Fim</p>"), "Oi!\n\nFim"));
