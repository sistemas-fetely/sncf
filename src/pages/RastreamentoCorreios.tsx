import { useEffect, useState } from "react";
import { useRastreamento } from "@/hooks/useRastreamento";

export default function RastreamentoCorreios() {
  const { lista, loading, erro, listar, adicionar, atualizarTodos } = useRastreamento();
  const [codigo, setCodigo] = useState("");

  useEffect(() => { listar(); }, [listar]);

  const td = { padding: "8px 12px", borderBottom: "1px solid #eee", fontSize: 14 };
  const th = { ...td, textAlign: "left" as const, fontWeight: 600, color: "#666" };

  return (
    <div style={{ padding: 24, maxWidth: 1100, margin: "0 auto" }}>
      <h1 style={{ fontSize: 24, fontWeight: 700, marginBottom: 16 }}>Rastreamento Correios</h1>

      <div style={{ display: "flex", gap: 8, marginBottom: 16, flexWrap: "wrap" }}>
        <input
          value={codigo}
          onChange={(e) => setCodigo(e.target.value.toUpperCase())}
          placeholder="Adicionar código (ex: AD546912002BR)"
          style={{ padding: 8, border: "1px solid #ccc", borderRadius: 6, width: 300 }}
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
            <th style={th}>Entregue?</th>
          </tr>
        </thead>
        <tbody>
          {lista.length === 0 && (
            <tr><td style={td} colSpan={4}>Nenhum código ainda. Adicione um acima.</td></tr>
          )}
          {lista.map((r) => (
            <tr key={r.id}>
              <td style={td}>{r.codigo_rastreio}</td>
              <td style={td}>{r.status_atual ?? "—"}</td>
              <td style={td}>{r.data_ultima_atualizacao ?? "—"}</td>
              <td style={td}>{r.entregue ? "✔️ Sim" : "Não"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
