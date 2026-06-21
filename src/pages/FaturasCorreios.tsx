import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";

export default function FaturasCorreios() {
  const [dias, setDias] = useState(365);
  const [result, setResult] = useState("");
  const [loading, setLoading] = useState(false);

  async function chamar(body: Record<string, unknown>) {
    setLoading(true);
    setResult("");
    try {
      const { data, error } = await supabase.functions.invoke("correios-faturas", { body });
      if (error) throw error;
      setResult(JSON.stringify(data, null, 2));
    } catch (e) {
      setResult("ERRO: " + (e instanceof Error ? e.message : String(e)));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={{ padding: 24, maxWidth: 1100, margin: "0 auto" }}>
      <h1 style={{ fontSize: 24, fontWeight: 700, marginBottom: 16 }}>Faturas Correios</h1>

      <div style={{ display: "flex", gap: 8, marginBottom: 16, flexWrap: "wrap", alignItems: "center" }}>
        <label>Período (faturas fechadas):</label>
        <select
          value={dias}
          onChange={(e) => setDias(Number(e.target.value))}
          style={{ padding: 8, border: "1px solid #ccc", borderRadius: 6 }}
        >
          <option value={90}>Últimos 90 dias</option>
          <option value={180}>Últimos 6 meses</option>
          <option value={365}>Últimos 12 meses</option>
          <option value={730}>Últimos 24 meses</option>
        </select>
        <button
          onClick={() => chamar({ modo: "faturas", dias })}
          disabled={loading}
          style={{ padding: "8px 16px", borderRadius: 6, cursor: "pointer" }}
        >
          {loading ? "..." : "Puxar Faturas"}
        </button>
        <button
          onClick={() => chamar({ modo: "previa" })}
          disabled={loading}
          style={{ padding: "8px 16px", borderRadius: 6, cursor: "pointer", background: "#1a3d2b", color: "#fff", border: "none" }}
        >
          {loading ? "..." : "Puxar Prévia (ciclo aberto)"}
        </button>
      </div>

      <p style={{ fontSize: 13, color: "#666", marginBottom: 16 }}>
        Prévia = lançamentos do ciclo aberto, ainda não faturados (delay de até 2 dias).
      </p>

      {result && (
        <pre style={{ padding: 12, background: "#fff", border: "1px solid #eee", borderRadius: 6, fontSize: 12, overflow: "auto", maxHeight: 600 }}>
          {result}
        </pre>
      )}
    </div>
  );
}
