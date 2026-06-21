import { useEffect, useState, Fragment } from "react";
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
  const [aberto, setAberto] = useState(null);

  useEffect(() => { listar(); }, [listar]);

  const td = { padding: "8px 12px", borderBottom: "1px solid #eee", fontSize: 14, verticalAlign: "top" as const };
  const th = { ...td, textAlign: "left" as const, fontWeight: 600, color: "#666" };

  return (
    


      

Rastreamento Correios


      

         setCodigo(e.target.value.toUpperCase())}
          placeholder="Adicionar código"
          style={{ padding: 8, border: "1px solid #ccc", borderRadius: 6, width: 280 }}
        />
         { if (codigo) { adicionar(codigo); setCodigo(""); } }}
          disabled={loading || !codigo}
          style={{ padding: "8px 16px", borderRadius: 6, cursor: "pointer" }}
        >
          Adicionar
        
        
          {loading ? "Atualizando..." : "Atualizar todos"}
        
      


      {erro && 

Erro: {erro}

}

      
          {lista.length === 0 && (
            
          )}
          {lista.map((r) => {
            const evs = (r.eventos as any[]) ?? [];
            const aberta = aberto === r.id;
            return (
              
                
                {aberta && (
                  
                )}
              
            );
          })}
        


        
          
            Código
            Status
            Última atualização
            Entregue em
            Entregue?
            
          
        Nenhum código ainda. Adicione um acima.
                  {r.codigo_rastreio}
                  {r.status_atual ?? "—"}
                  {fmt(r.data_ultima_atualizacao)}
                  {fmt(dataEntrega(evs))}
                  {r.entregue ? "✔️ Sim" : "Não"}
                  
                     setAberto(aberta ? null : r.id)}
                      style={{ cursor: "pointer", border: "none", background: "none", color: "#1a3d2b", textDecoration: "underline" }}
                    >
                      {aberta ? "ocultar" : "histórico"}
                    
                  
                
                    
                      


                        {evs.length === 0 && 

Sem eventos.

}
                        {evs.map((e, i) => (
                          


                            {e?.descricao ?? "—"}
                            {local(e) ? ` · ${local(e)}` : ""} · {fmt(e?.dtHrCriado)}
                          


                        ))}
                      


                    
                  
      


    


  );
}
