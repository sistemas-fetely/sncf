import { useState } from "react";
import { useRastreioCorreios } from "@/hooks/useRastreioCorreios";

export default function TesteRastreio() {
  const { objetos, loading, erro, rastrear } = useRastreioCorreios();
  const [codigo, setCodigo] = useState("AD546912002BR");

  return (
    <div style={{ padding: 40, fontFamily: "sans-serif" }}>
      <h2>Teste Rastreamento Correios</h2>

      <div style={{ display: "flex", gap: 12, marginBottom: 20 }}>
        <input
          value={codigo}
          onChange={(e) => setCodigo(e.target.value.toUpperCase())}
          placeholder="Código (ex: AD546912002BR)"
          style={{ padding: 8, border: "1px solid #ccc", borderRadius: 6, width: 320 }}
        />
        <button
          onClick={() => rastrear([codigo])}
          disabled={loading || !codigo}
          style={{ padding: "8px 16px", borderRadius: 6, cursor: "pointer" }}
        >
          {loading ? "Rastreando..." : "Rastrear"}
        </button>
      </div>

      {erro && <p style={{ color: "red" }}>Erro: {erro}</p>}
      <pre style={{ background: "#f5f5f5", padding: 16, borderRadius: 8, overflow: "auto" }}>
        {JSON.stringify(objetos, null, 2)}
      </pre>
    </div>
  );
}
