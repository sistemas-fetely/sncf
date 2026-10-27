import { supabase } from "@/integrations/supabase/client";

export type CteXmlStatus = "previa" | "importado" | "duplicado" | "erro";

export type CteXmlResultado = {
  ok: boolean;
  status: CteXmlStatus;
  erro: string | null;
  arquivo: string | null;
  transportadora: string | null;
  cte_numero: string | null;
  cte_serie: string | null;
  emissao: string | null;
  tipo_frete: string | null;
  origem: string | null;
  destino: string | null;
  destinatario: string | null;
  frete_total: number | null;
  frete_peso: number | null;
  peso_taxado: number | null;
  volumes: number | null;
  valor_nf: number | null;
  nfs: string[] | null;
  pedido: string | null;
  componentes: { nome: string; valor: number }[] | null;
  componentes_nao_mapeados: string[] | null;
};

/** Chama fn_cte_xml_importar. Erro da RPC sobe como exceção (FAIL-LOUD). */
export async function importarCteXml(xml: string, arquivo: string, dryRun: boolean): Promise<CteXmlResultado> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase.rpc as any)("fn_cte_xml_importar", {
    p_xml: xml, p_arquivo: arquivo, p_dry_run: dryRun,
  });
  if (error) throw new Error(error.message);
  return data as CteXmlResultado;
}
