import { useEffect, useMemo, useState, CSSProperties } from "react";
import { useLancamentos, Lancamento } from "@/hooks/useLancamentos";

const brl = (n: number) =>
  n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

function fmtData(d?: string | null) {
  if (!d) return "—";
  const [y, m, dd] = d.split("-");
  return `${dd}/${m}/${y}`;
}

const ehSedex = (l: Lancamento) =>
  (l.descricao_servico ?? "").toUpperCase().includes("SEDEX");
const ehPac = (l: Lancamento) =>
  (l.descricao_servico ?? "").toUpperCase().includes("PAC");

type Filtro = "TODOS" | "SEDEX" | "PAC" | "correios" | "frenet";

export default function FaturasCorreios() {
  const { lista, loading, erro, listar, sincronizar } = useLancamentos();
  const [filtro, setFiltro] = useState<Filtro>("TODOS");
  const [resumo, setResumo] = useState("");

  useEffect(() => {
    listar();
  }, [listar]);

  const filtrada = useMemo(
    () =>
      lista.filter((l) => {
        if (filtro === "TODOS") return true;
        if (filtro === "SEDEX") return ehSedex(l);
        if (filtro === "PAC") return ehPac(l);
        if (filtro === "correios") return l.empresa_frete === "correios";
        if (filtro === "frenet") return l.empresa_frete === "frenet";
        return true;
      }),
    [lista, filtro],
  );

  const tot = (arr: Lancamento[]) =>
    arr.reduce((s, l) => s + (l.valor_servico ?? 0), 0);

  const totalGeral = tot(lista);
  const totalSedex = tot(lista.filter(ehSedex));
  const totalPac = tot(lista.filter(ehPac));
  const totalCorreios = tot(lista.filter((l) => l.empresa_frete === "correios"));
  const totalFrenet = tot(lista.filter((l) => l.empresa_frete === "frenet"));
  const countCorreios = lista.filter((l) => l.empresa_frete === "correios").length;
  const countFrenet = lista.filter((l) => l.empresa_frete === "frenet").length;

  async function onSync() {
    const data = await sincronizar();
    if (data?.ok) {
      setResumo(
        `Sincronizado: ${data.lancamentos} lançamentos · ${data.confere ? "confere ✓" : "conferência divergente ⚠️"} · total ${brl(data.somaValorServico ?? 0)}`,
      );
    } else if (data) {
      setResumo("Retorno inesperado — ver console.");
    }
  }

  const pill = (ativo: boolean, cor?: string): CSSProperties => ({
    padding: "10px 16px",
    borderRadius: 10,
    cursor: "pointer",
    border: "1px solid #e5ded2",
    background: ativo ? cor ?? "#1a3d2b" : "#fff",
    color: ativo ? "#fff" : "#1a3d2b",
    minWidth: 130,
    textAlign: "left",
  });

  const td: CSSProperties = {
    padding: "8px 12px",
    borderBottom: "1px solid #eee",
    fontSize: 14,
  };
  const th: CSSProperties = {
    ...td,
    textAlign: "left",
    fontWeight: 600,
    color: "#666",
  };

  const badgeEmpresa = (e: string | null) => {
    const isFrenet = e === "frenet";
    return (
      <span
        style={{
          display: "inline-block",
          padding: "2px 8px",
          borderRadius: 12,
          fontSize: 11,
          fontWeight: 600,
          background: isFrenet ? "#f0e8ff" : "#e8f5e9",
          color: isFrenet ? "#6b21a8" : "#1a3d2b",
        }}
      >
        {isFrenet ? "Frenet" : "Correios"}
      </span>
    );
  };

  return (
    <div style={{ padding: 24, maxWidth: 1200, margin: "0 auto" }}>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: 16,
        }}
      >
        <h1 style={{ fontSize: 22, fontWeight: 700, color: "#1a3d2b" }}>
          Faturas Correios — Realizado
        </h1>
        <button
          onClick={onSync}
          disabled={loading}
          style={{
            padding: "10px 16px",
            borderRadius: 8,
            background: "#1a3d2b",
            color: "#fff",
            border: "none",
            cursor: loading ? "wait" : "pointer",
          }}
        >
          {loading ? "Sincronizando..." : "Sincronizar Prévia"}
        </button>
      </div>

      {resumo && (
        <div
          style={{
            background: "#f4f1ea",
            padding: 10,
            borderRadius: 8,
            marginBottom: 12,
            fontSize: 14,
          }}
        >
          {resumo}
        </div>
      )}
      {erro && (
        <div
          style={{
            background: "#fde2e2",
            color: "#a33",
            padding: 10,
            borderRadius: 8,
            marginBottom: 12,
            fontSize: 14,
          }}
        >
          Erro: {erro}
        </div>
      )}

      <div
        style={{
          display: "flex",
          flexWrap: "wrap",
          gap: 12,
          marginBottom: 16,
        }}
      >
        <div onClick={() => setFiltro("TODOS")} style={pill(filtro === "TODOS")}>
          <div style={{ fontSize: 12, opacity: 0.8 }}>
            Total · {lista.length} objetos
          </div>
          <div style={{ fontSize: 18, fontWeight: 700 }}>{brl(totalGeral)}</div>
        </div>
        <div onClick={() => setFiltro("SEDEX")} style={pill(filtro === "SEDEX")}>
          <div style={{ fontSize: 12, opacity: 0.8 }}>SEDEX</div>
          <div style={{ fontSize: 18, fontWeight: 700 }}>{brl(totalSedex)}</div>
        </div>
        <div onClick={() => setFiltro("PAC")} style={pill(filtro === "PAC")}>
          <div style={{ fontSize: 12, opacity: 0.8 }}>PAC</div>
          <div style={{ fontSize: 18, fontWeight: 700 }}>{brl(totalPac)}</div>
        </div>
        <div
          onClick={() => setFiltro("correios")}
          style={pill(filtro === "correios", "#1a5c38")}
        >
          <div style={{ fontSize: 12, opacity: 0.8 }}>
            Correios direto · {countCorreios}
          </div>
          <div style={{ fontSize: 18, fontWeight: 700 }}>{brl(totalCorreios)}</div>
        </div>
        <div
          onClick={() => setFiltro("frenet")}
          style={pill(filtro === "frenet", "#6b21a8")}
        >
          <div style={{ fontSize: 12, opacity: 0.8 }}>
            Frenet (legado) · {countFrenet}
          </div>
          <div style={{ fontSize: 18, fontWeight: 700 }}>{brl(totalFrenet)}</div>
        </div>
      </div>

      <div
        style={{
          background: "#fff",
          border: "1px solid #eee",
          borderRadius: 10,
          overflow: "hidden",
        }}
      >
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead style={{ background: "#faf8f3" }}>
            <tr>
              <th style={th}>Data</th>
              <th style={th}>Etiqueta</th>
              <th style={th}>Empresa</th>
              <th style={th}>Serviço</th>
              <th style={th}>Cliente / Destino</th>
              <th style={th}>Frete pago</th>
              <th style={th}>Rastreio</th>
            </tr>
          </thead>
          <tbody>
            {filtrada.length === 0 && (
              <tr>
                <td style={td} colSpan={7}>
                  Nenhum lançamento. Clique em "Sincronizar Prévia".
                </td>
              </tr>
            )}
            {filtrada.map((l) => (
              <tr key={l.id}>
                <td style={td}>{fmtData(l.data_postagem)}</td>
                <td style={{ ...td, fontFamily: "monospace" }}>{l.etiqueta}</td>
                <td style={td}>{badgeEmpresa(l.empresa_frete)}</td>
                <td style={td}>
                  {(l.descricao_servico ?? l.codigo_servico ?? "—")
                    .replace(" CONTRATO AG", "")
                    .replace(" FRENET", "")}
                </td>
                <td style={td}>
                  {l.nome_cliente ? (
                    <span>
                      {l.nome_cliente}
                      {l.municipio_destino && (
                        <span style={{ display: "block", fontSize: 12, color: "#888" }}>
                          {l.municipio_destino}/{l.uf_destino ?? ""}
                        </span>
                      )}
                    </span>
                  ) : l.municipio_destino ? (
                    `${l.municipio_destino}/${l.uf_destino ?? ""}`
                  ) : (
                    "—"
                  )}
                </td>
                <td style={td}>
                  {l.valor_servico != null ? brl(l.valor_servico) : "—"}
                </td>
                <td style={td}>
                  {l.rastreio_status ? (
                    l.rastreio_entregue ? (
                      "✔️ entregue"
                    ) : (
                      l.rastreio_status
                    )
                  ) : (
                    <span style={{ color: "#aaa" }}>não rastreado</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
          {filtrada.length > 0 && (
            <tfoot>
              <tr style={{ background: "#faf8f3", fontWeight: 600 }}>
                <td style={td} colSpan={5}>
                  Total {filtro !== "TODOS" ? `(${filtro})` : ""}
                </td>
                <td style={td}>{brl(tot(filtrada))}</td>
                <td style={td}></td>
              </tr>
            </tfoot>
          )}
        </table>
      </div>
    </div>
  );
}
