/**
 * Parser do quick add — Módulo Tarefas
 *
 * Regra inegociável: texto que não casa com nada NÃO vira erro e NÃO some.
 * "ligar para o Rafael" cria uma tarefa com esse título e mais nada.
 *
 * Índices: todos os tokens carregam start/end no texto ORIGINAL, para que o
 * realce na tela não desalinhe. A normalização sem acento é feita caractere a
 * caractere, com mapa de volta — NFD sozinho muda o comprimento da string
 * (é vira e + acento combinante) e quebraria o realce.
 */

export type TokenTipo =
  | "projeto" | "responsavel" | "etiqueta" | "secao"
  | "prioridade" | "data" | "hora";

export interface Token {
  tipo: TokenTipo;
  /** trecho exato do texto original */
  texto: string;
  start: number;
  end: number;
  /** rótulo legível em português para o preview */
  rotulo: string;
}

export type Prioridade = "baixa" | "media" | "alta" | "urgente";

export interface QuickAddResult {
  titulo: string;
  projetoNome: string | null;
  responsavelNome: string | null;
  secaoNome: string | null;
  etiquetas: string[];
  prioridade: Prioridade | null;
  /** YYYY-MM-DD */
  dataLimite: string | null;
  /** HH:MM:SS */
  horaLimite: string | null;
  tokens: Token[];
}

/* ------------------------------------------------------------------ */
/* normalização com mapa de índices                                    */
/* ------------------------------------------------------------------ */

interface Normalizado {
  texto: string;
  /** paraOriginal[i] = índice no texto original do caractere i do normalizado */
  paraOriginal: number[];
}

function normalizar(original: string): Normalizado {
  let texto = "";
  const paraOriginal: number[] = [];
  for (let i = 0; i < original.length; i++) {
    const semAcento = original[i]
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase();
    // um caractere original pode virar 0 ou mais normalizados
    for (let k = 0; k < semAcento.length; k++) {
      texto += semAcento[k];
      paraOriginal.push(i);
    }
  }
  return { texto, paraOriginal };
}

/** converte [start,end) do normalizado para [start,end) do original */
function mapear(n: Normalizado, start: number, end: number, tamOriginal: number) {
  const s = n.paraOriginal[start] ?? tamOriginal;
  const ultimo = n.paraOriginal[end - 1];
  const e = ultimo === undefined ? tamOriginal : ultimo + 1;
  return { start: s, end: e };
}

/* ------------------------------------------------------------------ */
/* datas                                                               */
/* ------------------------------------------------------------------ */

const DIAS_SEMANA: Record<string, number> = {
  domingo: 0,
  segunda: 1, "segunda-feira": 1,
  terca: 2, "terca-feira": 2,
  quarta: 3, "quarta-feira": 3,
  quinta: 4, "quinta-feira": 4,
  sexta: 5, "sexta-feira": 5,
  sabado: 6,
};

function iso(d: Date): string {
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${mm}-${dd}`;
}

function somaDias(base: Date, n: number): Date {
  const d = new Date(base);
  d.setDate(d.getDate() + n);
  return d;
}

/** próxima ocorrência do dia da semana, sempre no futuro (nunca hoje) */
function proximoDiaSemana(base: Date, alvo: number): Date {
  let delta = (alvo - base.getDay() + 7) % 7;
  if (delta === 0) delta = 7;
  return somaDias(base, delta);
}

/** próximo dia do mês; se já passou, vai para o mês seguinte */
function proximoDiaDoMes(base: Date, dia: number): Date {
  const d = new Date(base.getFullYear(), base.getMonth(), dia);
  if (d < new Date(base.getFullYear(), base.getMonth(), base.getDate())) {
    return new Date(base.getFullYear(), base.getMonth() + 1, dia);
  }
  return d;
}

interface RegraData {
  re: RegExp;
  resolver: (m: RegExpExecArray, hoje: Date) => { data: Date; rotulo: string } | null;
}

/**
 * Ordem importa: padrões mais longos e específicos primeiro, senão
 * "depois de amanha" casaria só o "amanha".
 */
const REGRAS_DATA: RegraData[] = [
  {
    re: /\bdepois de amanha\b/g,
    resolver: (_m, hoje) => ({ data: somaDias(hoje, 2), rotulo: "depois de amanhã" }),
  },
  {
    re: /\b(\d{1,2})\/(\d{1,2})\/(\d{4})\b/g,
    resolver: (m) => {
      const [dia, mes, ano] = [+m[1], +m[2], +m[3]];
      if (mes < 1 || mes > 12 || dia < 1 || dia > 31) return null;
      const d = new Date(ano, mes - 1, dia);
      if (d.getDate() !== dia || d.getMonth() !== mes - 1) return null;
      return { data: d, rotulo: `${m[1]}/${m[2]}/${m[3]}` };
    },
  },
  {
    re: /\b(\d{1,2})\/(\d{1,2})\b/g,
    resolver: (m, hoje) => {
      const [dia, mes] = [+m[1], +m[2]];
      if (mes < 1 || mes > 12 || dia < 1 || dia > 31) return null;
      let d = new Date(hoje.getFullYear(), mes - 1, dia);
      if (d.getDate() !== dia) return null;
      // data já passada neste ano -> ano que vem
      const zero = new Date(hoje.getFullYear(), hoje.getMonth(), hoje.getDate());
      if (d < zero) d = new Date(hoje.getFullYear() + 1, mes - 1, dia);
      return { data: d, rotulo: `${m[1]}/${m[2]}` };
    },
  },
  {
    re: /\bem (\d{1,3}) (dia|dias|semana|semanas|mes|meses)\b/g,
    resolver: (m, hoje) => {
      const n = +m[1];
      const u = m[2];
      if (u.startsWith("dia")) return { data: somaDias(hoje, n), rotulo: `em ${n} dia(s)` };
      if (u.startsWith("semana")) return { data: somaDias(hoje, n * 7), rotulo: `em ${n} semana(s)` };
      const d = new Date(hoje);
      d.setMonth(d.getMonth() + n);
      return { data: d, rotulo: `em ${n} mês(es)` };
    },
  },
  {
    re: /\b(semana que vem|proxima semana)\b/g,
    resolver: (_m, hoje) => ({ data: somaDias(hoje, 7), rotulo: "semana que vem" }),
  },
  {
    re: /\b(fim do mes|final do mes)\b/g,
    resolver: (_m, hoje) => ({
      data: new Date(hoje.getFullYear(), hoje.getMonth() + 1, 0),
      rotulo: "fim do mês",
    }),
  },
  {
    re: /\bproxim[ao] (domingo|segunda|terca|quarta|quinta|sexta|sabado)(-feira)?\b/g,
    resolver: (m, hoje) => {
      const alvo = DIAS_SEMANA[m[1]];
      if (alvo === undefined) return null;
      return { data: proximoDiaSemana(hoje, alvo), rotulo: `próxima ${m[1]}` };
    },
  },
  {
    re: /\bdia (\d{1,2})\b/g,
    resolver: (m, hoje) => {
      const dia = +m[1];
      if (dia < 1 || dia > 31) return null;
      return { data: proximoDiaDoMes(hoje, dia), rotulo: `dia ${dia}` };
    },
  },
  {
    re: /\bamanha\b/g,
    resolver: (_m, hoje) => ({ data: somaDias(hoje, 1), rotulo: "amanhã" }),
  },
  {
    re: /\bhoje\b/g,
    resolver: (_m, hoje) => ({ data: hoje, rotulo: "hoje" }),
  },
  {
    re: /\b(domingo|segunda|terca|quarta|quinta|sexta|sabado)(-feira)?\b/g,
    resolver: (m, hoje) => {
      const alvo = DIAS_SEMANA[m[1]];
      if (alvo === undefined) return null;
      return { data: proximoDiaSemana(hoje, alvo), rotulo: m[1] };
    },
  },
];

/** "15h", "15:30", "às 15h30", "as 9h" */
const RE_HORA = /\b(?:as\s+)?(\d{1,2})(?::(\d{2})|h(\d{2})?)\b/g;

const PRIORIDADES: Record<string, Prioridade> = {
  urgente: "urgente", alta: "alta", media: "media", baixa: "baixa",
  "1": "urgente", "2": "alta", "3": "media", "4": "baixa",
};

const ROTULO_PRIORIDADE: Record<Prioridade, string> = {
  urgente: "Urgente", alta: "Alta", media: "Média", baixa: "Baixa",
};

/**
 * ÚNICO ponto do código com a lista de prioridades.
 * Espelha o CHECK de `tarefas.prioridade` (baixa | media | alta | urgente):
 * o valor gravado vai SEM acento; o rótulo é só interface.
 * Não existe dimensão em tabela para prioridade hoje — o lugar certo seria
 * uma `tarefa_prioridade_dim`, como já é feito para status e tipo de execução.
 * Se essa tabela for criada, troque esta constante por um hook de catálogo.
 */
export const OPCOES_PRIORIDADE: Array<{ valor: Prioridade; rotulo: string }> = [
  { valor: "urgente", rotulo: ROTULO_PRIORIDADE.urgente },
  { valor: "alta", rotulo: ROTULO_PRIORIDADE.alta },
  { valor: "media", rotulo: ROTULO_PRIORIDADE.media },
  { valor: "baixa", rotulo: ROTULO_PRIORIDADE.baixa },
];

/** resolve o texto digitado depois do `!`; null quando não é prioridade conhecida */
export function casarPrioridade(termo: string | null | undefined): Prioridade | null {
  if (!termo) return null;
  const a = termo.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
  return PRIORIDADES[a] ?? null;
}


/* ------------------------------------------------------------------ */
/* parser                                                              */
/* ------------------------------------------------------------------ */

export function parseQuickAdd(entrada: string, agora: Date = new Date()): QuickAddResult {
  const hoje = new Date(agora.getFullYear(), agora.getMonth(), agora.getDate());
  const n = normalizar(entrada);
  const tam = entrada.length;

  const tokens: Token[] = [];
  /** posições do normalizado já consumidas por algum token */
  const consumido = new Array(n.texto.length).fill(false);

  const livre = (s: number, e: number) => {
    for (let i = s; i < e; i++) if (consumido[i]) return false;
    return true;
  };
  const marcar = (s: number, e: number) => {
    for (let i = s; i < e; i++) consumido[i] = true;
  };

  const push = (tipo: TokenTipo, s: number, e: number, rotulo: string) => {
    const { start, end } = mapear(n, s, e, tam);
    tokens.push({ tipo, texto: entrada.slice(start, end), start, end, rotulo });
    marcar(s, e);
  };

  let projetoNome: string | null = null;
  let responsavelNome: string | null = null;
  let secaoNome: string | null = null;
  const etiquetas: string[] = [];
  let prioridade: Prioridade | null = null;
  let dataLimite: string | null = null;
  let horaLimite: string | null = null;

  /* 1. prioridade — antes dos prefixos, para "!alta" não virar etiqueta */
  const rePrio = /(?:^|\s)!(urgente|alta|media|baixa|[1-4])\b/g;
  let m: RegExpExecArray | null;
  while ((m = rePrio.exec(n.texto)) !== null) {
    const s = m.index + m[0].indexOf("!");
    const e = m.index + m[0].length;
    if (!livre(s, e) || prioridade) continue;
    prioridade = PRIORIDADES[m[1]];
    push("prioridade", s, e, ROTULO_PRIORIDADE[prioridade]);
  }

  /* 2. prefixos # @ + / — o valor vai até o próximo espaço */
  const prefixos: Array<{ char: string; tipo: TokenTipo }> = [
    { char: "#", tipo: "projeto" },
    { char: "@", tipo: "responsavel" },
    { char: "+", tipo: "etiqueta" },
    { char: "/", tipo: "secao" },
  ];
  for (const { char, tipo } of prefixos) {
    const re = new RegExp(`(?:^|\\s)\\${char}([^\\s]+)`, "g");
    while ((m = re.exec(n.texto)) !== null) {
      const s = m.index + m[0].indexOf(char);
      const e = m.index + m[0].length;
      if (!livre(s, e)) continue;
      const { start, end } = mapear(n, s + 1, e, tam);
      const valor = entrada.slice(start, end);
      if (!valor) continue;
      if (tipo === "projeto" && !projetoNome) projetoNome = valor;
      else if (tipo === "responsavel" && !responsavelNome) responsavelNome = valor;
      else if (tipo === "secao" && !secaoNome) secaoNome = valor;
      else if (tipo === "etiqueta") etiquetas.push(valor);
      else continue; // segunda ocorrência de campo único: deixa virar título
      push(tipo, s, e, valor);
    }
  }

  /* 3. data — primeira regra que casar vence */
  for (const regra of REGRAS_DATA) {
    if (dataLimite) break;
    regra.re.lastIndex = 0;
    while ((m = regra.re.exec(n.texto)) !== null) {
      const s = m.index;
      const e = m.index + m[0].length;
      if (!livre(s, e)) continue;
      const r = regra.resolver(m, hoje);
      if (!r) continue;
      dataLimite = iso(r.data);
      push("data", s, e, r.rotulo);
      break;
    }
  }

  /* 4. hora — só quando há data; hora solta vira título */
  if (dataLimite) {
    RE_HORA.lastIndex = 0;
    while ((m = RE_HORA.exec(n.texto)) !== null) {
      const s = m.index;
      const e = m.index + m[0].length;
      if (!livre(s, e)) continue;
      const h = +m[1];
      const min = m[2] !== undefined ? +m[2] : m[3] !== undefined ? +m[3] : 0;
      if (h > 23 || min > 59) continue;
      horaLimite = `${String(h).padStart(2, "0")}:${String(min).padStart(2, "0")}:00`;
      push("hora", s, e, `${String(h).padStart(2, "0")}:${String(min).padStart(2, "0")}`);
      break;
    }
  }

  /* 5. o que sobra vira título — nada é descartado */
  let titulo = "";
  for (let i = 0; i < n.texto.length; i++) {
    if (consumido[i]) continue;
    const orig = n.paraOriginal[i];
    // um char original pode gerar vários normalizados; não duplicar
    if (i > 0 && n.paraOriginal[i - 1] === orig && !consumido[i - 1]) continue;
    titulo += entrada[orig];
  }
  titulo = titulo.replace(/\s+/g, " ").trim();

  tokens.sort((a, b) => a.start - b.start);

  return {
    titulo,
    projetoNome,
    responsavelNome,
    secaoNome,
    etiquetas,
    prioridade,
    dataLimite,
    horaLimite,
    tokens,
  };
}

/* ------------------------------------------------------------------ */
/* preview em português                                                */
/* ------------------------------------------------------------------ */

const MESES = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];

export function descreverPreview(r: QuickAddResult, agora: Date = new Date()): string {
  if (!r.titulo && r.tokens.length === 0) return "";
  const partes: string[] = [];
  partes.push(r.titulo ? `"${r.titulo}"` : "(sem título)");

  if (r.projetoNome) partes.push(`no projeto ${r.projetoNome}`);
  if (r.secaoNome) partes.push(`na seção ${r.secaoNome}`);
  if (r.responsavelNome) partes.push(`para ${r.responsavelNome}`);

  if (r.dataLimite) {
    const [a, mes, d] = r.dataLimite.split("-").map(Number);
    const hoje = new Date(agora.getFullYear(), agora.getMonth(), agora.getDate());
    const alvo = new Date(a, mes - 1, d);
    const dias = Math.round((alvo.getTime() - hoje.getTime()) / 86400000);
    let quando = `${String(d).padStart(2, "0")}/${MESES[mes - 1]}`;
    if (dias === 0) quando = "hoje";
    else if (dias === 1) quando = "amanhã";
    partes.push(`para ${quando}${r.horaLimite ? ` às ${r.horaLimite.slice(0, 5)}` : ""}`);
  }

  if (r.prioridade) partes.push(`prioridade ${ROTULO_PRIORIDADE[r.prioridade].toLowerCase()}`);
  if (r.etiquetas.length) partes.push(`etiquetas: ${r.etiquetas.join(", ")}`);

  return partes.join(" · ");
}
