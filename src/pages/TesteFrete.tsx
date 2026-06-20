import { useState } from "react";
import { useFreteCorreios } from "@/hooks/useFreteCorreios";
import { useRastreioCorreios } from "@/hooks/useRastreioCorreios";

export default function TesteFrete() {
  const frete = useFreteCorreios();
  const rastreio = useRastreioCorreios();
  const [cep, setCep] = useState("01229010");
  const [codigo, setCodigo] = useState("");

  const box = {
    background: "#f5f0e8",
    padding: 16,
    borderRadius: 8,
    whiteSpace: "pre-wrap" as const,
  };
  const input = { padding: 8, border: "1px solid #ccc", borderRadius: 6 };
  const btn = { padding: "8px 16px", borderRadius: 6, cursor: "pointer" };

  return (
    <div style={{ padding: 24, maxWidth: 800 }}>
      <h1 style={{ fontSize: 20, marginBottom: 16 }}>Teste Frete Correios</h1>

      <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
        <input
          type="text"
          value={cep}
          onChange={(e) => setCep(e.target.value)}
          placeholder="CEP destino"
          style={input}
        />
        <button
          onClick={() =>
            frete.cotar({
              cepDestino: cep,
              peso: 500,
              comprimento: 20,
              largura: 20,
              altura: 20,
            })
          }
          disabled={frete.loading}
          style={btn}
        >
          {frete.loading ? "Cotando..." : "Cotar"}
        </button>
      </div>

      {frete.erro && (
        <div style={{ color: "red", marginBottom: 16 }}>
          <strong>Erro:</strong> {frete.erro}
        </div>
      )}
      <pre style={box}>{JSON.stringify(frete.cotacoes, null, 2)}</pre>

      <hr style={{ margin: "24px 0" }} />

      <h1 style={{ fontSize: 20, marginBottom: 16 }}>
        Teste Rastreamento Correios
      </h1>

      <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
        <input
          type="text"
          value={codigo}
          onChange={(e) => setCodigo(e.target.value.toUpperCase())}
          placeholder="Código (ex: AA123456789BR)"
          style={{ ...input, width: 320 }}
        />
        <button
          onClick={() => rastreio.rastrear([codigo])}
          disabled={rastreio.loading || !codigo}
          style={btn}
        >
          {rastreio.loading ? "Rastreando..." : "Rastrear"}
        </button>
      </div>

      {rastreio.erro && (
        <div style={{ color: "red", marginBottom: 16 }}>
          <strong>Erro:</strong> {rastreio.erro}
        </div>
      )}
      <pre style={box}>{JSON.stringify(rastreio.objetos, null, 2)}</pre>
    </div>
  );
}
