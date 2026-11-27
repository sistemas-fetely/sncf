type Leitura = { id: string; status: string; erro?: string | null; lida_em: string; totais: unknown };
const objeto = (v: unknown): Record<string, unknown> => v && typeof v === 'object' && !Array.isArray(v) ? v as Record<string, unknown> : {};
export function estadoLeituraCatalogo(ultima?: Leitura | null, referencia?: Leitura | null) {
  const totais = objeto(ultima?.totais);
  const vigente = totais.leitura_referencia === referencia?.id ? objeto(referencia?.totais) : totais;
  const lendo = totais.em_andamento === true;
  return {
    totais: vigente,
    lendo,
    inicio: lendo ? ultima?.lida_em : undefined,
    erro: !lendo && ultima && ['erro', 'layout_quebrado'].includes(ultima.status) ? ultima.erro : null,
    v2: vigente.v2 === true || objeto(referencia?.totais).v2 === true,
    avisos: Array.isArray(vigente.avisos) ? vigente.avisos.filter((v): v is string => typeof v === 'string') : [],
  };
}