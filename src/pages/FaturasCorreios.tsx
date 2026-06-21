import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";

export default function FaturasCorreios() {
  const [dias, setDias] = useState(365);
  const [result, setResult] = useState("");
  const [loading, setLoading] = useState(false);

  async function chamarFaturas() {
    setLoading(true); setResult("");
    try {
      const { data, error } = await supabase.functions.invoke("correios-faturas", { body: { modo: "faturas", dias } });
      if (error) throw error;
      setResult(JSON.stringify(data, null, 2));
    } catch (e) { setResult("ERRO: " + (e instanceof Error ? e.message : String(e))); }
    finally { setLoading(false); }
  }

  async function sincronizarPrevia() {
    setLoading(true); setResult("");
    try {
      const { data, error } = await supabase.functions.invoke("correios-previa-sync", { body: {} });
      if (error) throw error;
      setResult(JSON.stringify(data, null, 2));
    } catch (e) { setResult("ERRO: " + (e instanceof Error ? e.message : String(e))); }
    finally { setLoading(false); }
  }

  return (
    <div style={{ padding: 24, maxWidth: 900 }}>
      <h1 style={{ fontSize: 22, marginBottom: 16 }}>Faturas Correios</h1>

      <div style={{ display: "flex", gap: 12, alignItems: "center", marginBottom: 12, flexWrap: "wrap" }}>
        <label>
          Período (faturas fechadas):
          <select value={dias} onChange={(e) => setDias(Number(e.target.value))}
            style={{ padding: 8, border: "1px solid #ccc", borderRadius: 6 }}>
            <option value={90}>Últimos 90 dias</option>
            <option value={180}>Últimos 6 meses</option>
            <option value={365}>Últimos 12 meses</option>
            <option value={730}>Últimos 24 meses</option>
          </select>
        </label>
        <button onClick={chamarFaturas} disabled={loading}
          style={{ padding: "8px 16px", borderRadius: 6, cursor: "pointer", background: "#1a365d", color: "#fff", border: "none" }}>
          {loading ? "..." : "Puxar Faturas"}
        </button>
        <button onClick={sincronizarPrevia} disabled={loading}
          style={{ padding: "8px 16px", borderRadius: 6, cursor: "pointer", background: "#1a3d2b", color: "#fff", border: "none" }}>
          {loading ? "Sincronizando..." : "Sincronizar Prévia (gravar)"}
        </button>
      </div>

      <p style={{ color: "#666", fontSize: 13, marginBottom: 16 }}>
        Sincronizar Prévia: puxa o analítico do ciclo aberto e grava os lançamentos (frete realizado por objeto).
      </p>

      {result && (
        <pre style={{ background: "#f6f8fa", padding: 12, borderRadius: 6, overflow: "auto", maxHeight: 500, fontSize: 12 }}>
          {result}
        </pre>
      )}
    </div>
  );
}
