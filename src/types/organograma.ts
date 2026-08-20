export type TipoVinculoCodigo = "CLT" | "PJ" | "PRESTADOR" | "SOCIO";

export interface PosicaoRaw {
  id: string;
  titulo_cargo: string;
  nivel_hierarquico: number;
  departamento: string;
  area: string | null;
  filial: string | null;
  status: "ocupado" | "vaga_aberta" | "previsto";
  id_pai: string | null;
  colaborador_id: string | null;
  contrato_pj_id: string | null;
  vinculo_id: string | null;
  salario_previsto: number | null;
  centro_custo: string | null;
  created_at: string;
  updated_at: string;
  depth: number;
  path: string[];
}


export interface ColaboradorVinculado {
  id: string;
  pessoa_id: string | null;
  nome_completo: string;
  foto_url: string | null;
  email_corporativo: string | null;
  telefone: string | null;
  data_admissao: string | null;
  salario_base: number | null;
  status: string;
  tipo_contrato: TipoVinculoCodigo;
  cargo: string;
  departamento: string;
}


export interface ContratoPJVinculado {
  id: string;
  contato_nome: string;
  nome_fantasia: string | null;
  razao_social: string;
  contato_email: string | null;
  contato_telefone: string | null;
  data_inicio: string;
  valor_mensal: number;
  status: string;
  foto_url: string | null;
}

export interface PosicaoNode extends PosicaoRaw {
  colaborador?: ColaboradorVinculado | null;
  contrato_pj?: ContratoPJVinculado | null;
  children: PosicaoNode[];
  subordinados_diretos: number;
  subordinados_totais: number;
  // display helpers
  nome_display: string;
  foto_url: string | null;
  vinculo: TipoVinculoCodigo | null;
  status_pessoal: string | null;
}

export type ViewMode = "visual" | "sintetico" | "analitico" | "lista";

export interface OrgFilters {
  search: string;
  departamento: string;
  filial: string;
  vinculo: string;
  status: string;
  nivel: string;
  lider: string;
}
