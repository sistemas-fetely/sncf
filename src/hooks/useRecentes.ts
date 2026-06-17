import { useEffect, useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";

interface PaginaRecente {
  id: string;
  rota: string;
  titulo: string;
  pilar: string | null;
  acessado_em: string;
}

export function useRecentes(limit = 10) {
  const { user } = useAuth();
  const [recentes, setRecentes] = useState<PaginaRecente[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user?.id) return;

    const carregar = async () => {
      const { data } = await supabase
        .from("usuario_paginas_recentes")
        .select("id, rota, titulo, pilar, acessado_em")
        .eq("user_id", user.id)
        .order("acessado_em", { ascending: false })
        .limit(limit * 3);

      if (data) {
        const seen = new Set<string>();
        const deduped = data
          .filter((d) => {
            if (seen.has(d.rota)) return false;
            seen.add(d.rota);
            return true;
          })
          .slice(0, limit);
        setRecentes(deduped as PaginaRecente[]);
      }
      setLoading(false);
    };

    void carregar();
  }, [user?.id, limit]);

  return { recentes, loading };
}
