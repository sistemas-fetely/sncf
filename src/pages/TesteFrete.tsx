import { useState } from "react";
import { useFreteCorreios } from "@/hooks/useFreteCorreios";

export default function TesteFrete() {
  const { cotacoes, loading, erro, cotar } = useFreteCorreios();
  const [cep, setCep] = useState("20040002");

  return (
    <div style={{ padding: 24, maxWidth: 640 }}>
      <h1 style={{ fontSize: 20, marginBottom: 16 }}>Teste Frete Correios</h1>

      <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
        <input
          type="text"
          value={cep}
          onChange={(e) => setCep(e.target.value)}
          placeholder="CEP destino"
          style={{ padding: 8, border: "1px solid #ccc", borderRadius: 6 }}
        />
        <button
          onClick={() =>
            cotar({
              cepDestino: cep,
              peso: 500, // gramas
              comprimento: 20,
              largura: 20,
              altura: 20,
            })
          }
          disabled={loading}
          style={{ padding: "8px 16px", borderRadius: 6, cursor: "pointer" }}
        >
          {loading ? "Cotando..." : "Cotar"}
        </button>
      </div>

      {erro && (
        <div style={{ color: "red", marginBottom: 16 }}>
          <strong>Erro:</strong> {erro}
        </div>
      )}

      <pre style={{ background: "#f5f5f5", padding: 16, borderRadius: 6, overflow: "auto" }}>
        {JSON.stringify(cotacoes, null, 2)}
      </pre>
    </div>
  );
}
