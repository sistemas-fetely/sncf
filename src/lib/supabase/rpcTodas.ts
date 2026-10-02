import { supabase } from "@/integrations/supabase/client";

export async function rpcTodas<T>(
  fn: string,
  args?: object,
  pagina = 1000,
): Promise<T[]> {
  const todas: T[] = [];

  for (let de = 0; ; de += pagina) {
    const { data, error } = await (supabase.rpc as any)(fn, args).range(de, de + pagina - 1);
    if (error) throw error;
    const lote = (data ?? []) as T[];
    todas.push(...lote);
    if (lote.length < pagina) return todas;
  }
}