import { supabase } from "@/integrations/supabase/client";
import { buscarTodos } from "@/lib/supabaseLotes";
import type { AlertaFormato } from "@/components/acervo/FormatoInvalidoDialog";

export const buscarAlertasFormatoMesa = () => buscarTodos<AlertaFormato>(
  () => (supabase.from as any)("vw_produto_formato_alerta").select("cod_cadastro,sku,colecao,fase,campo,valor,regra,motivo"),
  ["cod_cadastro", "campo", "sku"],
);