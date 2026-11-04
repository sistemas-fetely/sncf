// Acesso sem tipos às tabelas/RPCs da etapa 2 do pacote enquanto types.ts não é regenerado
// (banco fora do ar ao criar). Trocar por `supabase` assim que os tipos existirem.
import type { SupabaseClient } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
export const dbSemTipos = supabase as unknown as SupabaseClient;
