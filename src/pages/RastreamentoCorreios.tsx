import { useEffect, useState } from "react";
import { useRastreamento } from "@/hooks/useRastreamento";

function dataEntrega(eventos: any[]): string | null {
  const ev = (eventos ?? []).find((e) => /entregue/i.test(e?.descricao ?? ""));
  return ev?.dtHrCriado ?? null;
}
function fmt(d?: string | null) {
  if (!d) return "—";
  try { return new Date(d).toLocaleString("pt-BR"); } catch { return d; }
}
function local(e: any): string {
  const cid = e?.unidade?.endereco?.cidade;
  const uf = e?.unidade?.endereco?.uf;
  if (cid || uf) return `${cid ?? ""}${uf ? "/" + uf : ""}`;
  return e?.unidade?.nome ?? "";
}

export default function RastreamentoCorreios() {
  const { lista, loading, erro, listar, adicionar, atualizarTodos } = useRastreamento();
  const [codigo, setCodigo] = useState("");
  const [aberto, setAberto] = useState<string | null>(null);

  useEffect(() => { listar(); }, [listar]);

  const td = { padding: "8px 12px", borderBottom: "1px solid #eee", fontSize: 14, verticalAlign: "top" as const };
  const th = { ...td, textAlign: "left" as const, fontWeight: 600, color: "#666" };

  return (
    <div style={{ padding: 24, maxWidth: 1100, margin: "0 auto" }}>
      <h1 style={{ fontSize: 24, fontWeight: 700, marginBottom: 16 }}>Rastreamento Correios</h1>


      <div style={{ display: "flex", gap: 8, marginBottom: 16, flexWrap: "wrap" }}>
        <input
          value={codigo}
          onChange={(e) => setCodigo(e.target.value.toUpperCase())}
          placeholder="Adicionar código"
          style={{ padding: 8, border: "1px solid #ccc", borderRadius: 6, width: 280 }}
        />
        <button
          onClick={() => { if (codigo) { adicionar(codigo); setCodigo(""); } }}
          disabled={loading || !codigo}
          style={{ padding: "8px 16px", borderRadius: 6, cursor: "pointer" }}
        >
          Adicionar
        </button>
        <button
          onClick={() => atualizarTodos()}
          disabled={loading}
          style={{ padding: "8px 16px", borderRadius: 6, cursor: "pointer" }}
        >
          {loading ? "Atualizando..." : "Atualizar todos"}
        </button>
      </div>

      {erro && <p style={{ color: "crimson", marginBottom: 12 }}>Erro: {erro}</p>}

      <table style={{ width: "100%", borderCollapse: "collapse", background: "#fff" }}>
        <thead>
          <tr>
            <th style={th}>Código</th>
            <th style={th}>Status</th>
            <th style={th}>Última atualização</th>
            <th style={th}>Entregue em</th>
            <th style={th}>Entregue?</th>
            <th style={th}></th>
          </tr>
        </thead>
        <tbody>
          {lista.length === 0 && (
            <tr><td style={td} colSpan={6}>Nenhum código ainda. Adicione um acima.</td></tr>
          )}
          {lista.map((r) => {
            const evs = (r.eventos as any[]) ?? [];
            const aberta = aberto === r.id;
            return (
              <>
                <tr key={r.id}>
                  <td style={td}>{r.codigo_rastreio}</td>
                  <td style={td}>{r.status_atual ?? "—"}</td>
                  <td style={td}>{fmt(r.data_ultima_atualizacao)}</td>
                  <td style={td}>{fmt(dataEntrega(evs))}</td>
                  <td style={td}>{r.entregue ? "✔️ Sim" : "Não"}</td>
                  <td style={td}>
                    <button
                      onClick={() => setAberto(aberta ? null : r.id)}
                      style={{ cursor: "pointer", border: "none", background: "none", color: "#1a3d2b", textDecoration: "underline" }}
                    >
                      {aberta ? "ocultar" : "histórico"}
                    </button>
                  </td>
                </tr>
                {aberta && (
                  <tr key={`${r.id}-hist`}>
                    <td colSpan={6} style={{ ...td, background: "#f9f9f9" }}>
                      <div style={{ padding: "8px 0" }}>
                        {evs.length === 0 && <p>Sem eventos.</p>}
                        {evs.map((e, i) => (
                          <p key={i} style={{ margin: "4px 0" }}>
                            {e?.descricao ?? "—"}
                            {local(e) ? ` · ${local(e)}` : ""} · {fmt(e?.dtHrCriado)}
                          </p>
                        ))}
                      </div>
                    </td>
                  </tr>
                )}
              </>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
