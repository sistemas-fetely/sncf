import { ArrowRight, Loader2, PackageSearch, Printer } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { EstadoVazio } from "@/components/ui/estado-vazio";
import { Selo } from "@/components/ui/selo";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import type { IdentidadesPedidoMesa, ItemPedidoMesa, PedidoMesa } from "./tipos";

/**
 * Estação 2 — Separação. Picking list puro: o que pegar da prateleira.
 * NÃO existe RPC de "separação concluída": quem prova a separação é a
 * conferência por bipagem. Por isso o botão daqui só NAVEGA para a estação 3.
 *
 * O botão "Imprimir folha" é papel, não estado: abre a impressão de uma folha
 * A4 com a faixa de identificação da caixa (id_externo gigante, para recorte)
 * e a picking list por baixo. Nada grava, nada muda estágio.
 */
interface Props {
  itens: ItemPedidoMesa[];
  carregando: boolean;
  pedido: PedidoMesa | null;
  identidades?: IdentidadesPedidoMesa;
  onConcluir: () => void;
}

/**
 * Cidade/UF para o cabeçalho da faixa da caixa. O Json de entrega não tem
 * contrato único no SNCF (Shopify, Bling, porta de pedidos), então tentamos as
 * chaves conhecidas e desistimos em paz — sem cidade, a faixa continua legível.
 */
function cidadeUf(endereco: unknown): string | null {
  if (!endereco || typeof endereco !== "object") return null;
  const e = endereco as Record<string, unknown>;
  const txt = (v: unknown) => (typeof v === "string" && v.trim() !== "" ? v.trim() : null);
  const cidade = ["cidade", "city"].map((k) => txt(e[k])).find((v) => v) ?? null;
  const uf = ["uf", "estado", "state", "province", "province_code"]
    .map((k) => txt(e[k]))
    .find((v) => v) ?? null;
  if (cidade && uf) return `${cidade}/${uf}`;
  return cidade ?? uf;
}

function hojePtBr(): string {
  return new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit", month: "2-digit", year: "numeric",
  }).format(new Date());
}

export function EstacaoSeparacao({ itens, carregando, pedido, identidades, onConcluir }: Props) {
  const totalPecas = itens.reduce((s, i) => s + i.quantidade, 0);
  const identidadesPapel = [
    identidades?.bling_pedido_numero ? `Bling ${identidades.bling_pedido_numero}` : null,
    identidades?.nf_refs ? `NF ${identidades.nf_refs}` : null,
  ].filter((valor): valor is string => Boolean(valor));

  if (carregando) {
    return (
      <Card>
        <CardContent className="flex items-center gap-2 p-6 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
          Carregando a picking list…
        </CardContent>
      </Card>
    );
  }

  if (itens.length === 0) {
    return (
      <EstadoVazio
        icone={PackageSearch}
        titulo="Pedido sem itens"
        mensagem="Este pedido não tem linhas em pedido_itens. Confira a origem antes de separar — não há o que bipar."
      />
    );
  }

  return (
    <Card>
      {/* Folha de impressão: escondida na tela, única coisa visível no papel. */}
      <style>{`
        @media print {
          body * { visibility: hidden; }
          .folha-separacao, .folha-separacao * { visibility: visible; }
          .folha-separacao {
            display: block !important;
            position: absolute;
            left: 0;
            top: 0;
            width: 100%;
            font-family: "DM Sans", system-ui, sans-serif;
            color: #000;
            background: #fff;
          }
          @page { size: A4; margin: 15mm; }
        }
      `}</style>

      <div className="hidden folha-separacao" aria-hidden="true">
        {/* ── Faixa de identificação da caixa (recorte) ── */}
        <div style={{ textAlign: "center" }}>
          <p style={{ fontSize: "12pt", letterSpacing: "0.05em" }}>
            {[pedido?.cliente_nome_snapshot ?? "cliente sem nome", cidadeUf(pedido?.endereco_entrega), hojePtBr()]
              .filter(Boolean)
              .join("  ·  ")}
          </p>
          <p
            style={{
              fontSize: "100px",
              lineHeight: 1.1,
              fontWeight: 700,
              overflowWrap: "anywhere",
              margin: "4mm 0 6mm",
            }}
          >
            {pedido?.id_externo ?? "—"}
          </p>
         {identidadesPapel.length > 0 && (
           <p style={{ fontSize: "16pt", lineHeight: 1.3, margin: "0 0 6mm" }}>
             {identidadesPapel.join("  ·  ")}
           </p>
         )}
        </div>
        <div style={{ borderBottom: "2px dashed #000", marginBottom: "10mm" }} />

        {/* ── Picking list ── */}
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "11pt" }}>
          <thead>
            <tr>
              {["", "SKU", "Descrição", "EAN", "Qtd"].map((h, idx) => (
                <th
                  key={idx}
                  style={{
                    textAlign: "left",
                    borderBottom: "1.5px solid #000",
                    padding: "2mm 2mm",
                    fontSize: "9pt",
                    textTransform: "uppercase",
                    letterSpacing: "0.05em",
                  }}
                >
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {itens.map((i) => (
              <tr key={i.id}>
                <td style={{ padding: "3mm 2mm", borderBottom: "1px solid #000", width: "10mm" }}>
                  {/* Quadradinho para marcar à caneta na prateleira. */}
                  <span style={{ display: "inline-block", width: "4.5mm", height: "4.5mm", border: "1.5px solid #000" }} />
                </td>
                <td style={{ padding: "3mm 2mm", borderBottom: "1px solid #000", fontFamily: "monospace", fontSize: "10pt" }}>
                  {i.sku ?? "—"}
                </td>
                <td style={{ padding: "3mm 2mm", borderBottom: "1px solid #000" }}>{i.descricao}</td>
                <td style={{ padding: "3mm 2mm", borderBottom: "1px solid #000", fontFamily: "monospace", fontSize: "10pt" }}>
                  {i.ean ?? "sem EAN"}
                </td>
                <td style={{ padding: "3mm 2mm", borderBottom: "1px solid #000", textAlign: "right", fontWeight: 700 }}>
                  {i.quantidade}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <p style={{ marginTop: "8mm", fontSize: "9pt", color: "#000" }}>
          Pedido {pedido?.id_externo ?? "—"} · {itens.length} {itens.length === 1 ? "linha" : "linhas"} · {totalPecas} peças
         {identidadesPapel.length > 0 ? ` · ${identidadesPapel.join(" · ")}` : ""}
        </p>
      </div>

      <CardContent className="space-y-4 p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-sm font-medium">
            Picking list · {itens.length} {itens.length === 1 ? "linha" : "linhas"} · {totalPecas} peças
          </p>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => window.print()}>
              <Printer aria-hidden="true" />
              Imprimir folha
            </Button>
            <Button onClick={onConcluir}>
              Concluir separação
              <ArrowRight aria-hidden="true" />
            </Button>
          </div>
        </div>

        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-[9rem]">SKU</TableHead>
              <TableHead>Descrição</TableHead>
              <TableHead className="w-[10rem]">EAN</TableHead>
              <TableHead className="w-[5rem] text-right">Qtd</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {itens.map((i) => (
              <TableRow key={i.id}>
                <TableCell className="font-mono text-xs">{i.sku ?? "—"}</TableCell>
                <TableCell className="text-sm">{i.descricao}</TableCell>
                <TableCell className="font-mono text-xs">
                  {i.ean ?? (
                    // Sem EAN o item não pode ser bipado. Dizer isso agora, na
                    // prateleira, é mais barato do que descobrir na conferência.
                    <Selo estado="warning">sem EAN</Selo>
                  )}
                </TableCell>
                <TableCell className="text-right tabular-nums">{i.quantidade}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}
