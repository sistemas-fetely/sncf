export type Corpo = Record<string, any>;

// Mesmo parser do sync, sem truncar respostas de texto no diagnóstico.
export async function lerCorpo(r: Response): Promise<any> {
  const t = await r.text();
  try { return t ? JSON.parse(t) : null; } catch { return { texto: t }; }
}
export const msgApi = (c: any, s: number) => {
  const m = c?.errors?.map?.((e: any) => e?.message ?? JSON.stringify(e)).join("; ") || c?.message || c?.error || c?.title || c?.texto;
  return `Safrapay HTTP ${s}${m ? `: ${typeof m === "string" ? m : JSON.stringify(m)}` : ""}`;
};

export function baseSegura(valor: string): string {
  const u = new URL(valor);
  if (u.protocol !== "https:" || !u.hostname.endsWith(".safrapay.com.br") || u.username || u.password || u.port || u.search || u.hash) {
    throw new Error("Base deve ser HTTPS em um domínio Safrapay, sem credenciais ou parâmetros.");
  }
  return u.href.replace(/\/+$/, "");
}

export function entrada(body: unknown, hoje = new Date()) {
  if (!body || typeof body !== "object" || Array.isArray(body)) throw new Error("Body deve ser um objeto.");
  const b = body as Corpo;
  const fim = hoje.toISOString().slice(0, 10);
  const inicio = new Date(hoje);
  inicio.setUTCDate(inicio.getUTCDate() - 45);
  const start = b.start_date ?? inicio.toISOString().slice(0, 10);
  const end = b.end_date ?? fim;
  for (const data of [start, end]) {
    if (typeof data !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(data) || !Number.isFinite(Date.parse(data)) || new Date(data).toISOString().slice(0, 10) !== data) {
      throw new Error("Datas devem ser válidas no formato YYYY-MM-DD.");
    }
  }
  if (start > end) throw new Error("start_date deve ser anterior ou igual a end_date.");
  if (b.bases !== undefined && (!Array.isArray(b.bases) || b.bases.some((v: unknown) => typeof v !== "string"))) throw new Error("bases deve ser um array de URLs.");
  return { start, end, bases: (b.bases ?? []).map(baseSegura) as string[] };
}

export function tentativas(api: string, mid: string, start: string, end: string, extras: string[]) {
  const periodo = new URLSearchParams({ merchantId: mid, startDate: `${start} 00:00:00`, endDate: `${end} 23:59:59` });
  const dia = new URLSearchParams({ merchantId: mid, date: end });
  const merchant = new URLSearchParams({ merchantId: mid });
  const tres = (base: string, sufixo = "") => [
    { tentativa: `v1/Reconciliation/Transactions${sufixo}`, url: `${base}/v1/Reconciliation/Transactions?${periodo}` },
    { tentativa: `v2/Reconciliation/Transactions${sufixo}`, url: `${base}/v2/Reconciliation/Transactions?${periodo}` },
    { tentativa: `v1/Reconciliation${sufixo}`, url: `${base}/v1/Reconciliation?${dia}` },
  ];
  return [...tres(api),
    { tentativa: "v1/TaxPlan", url: `${api}/v1/TaxPlan?${merchant}` },
    { tentativa: "v1/Adjustments", url: `${api}/v1/Adjustments?${periodo}` },
    ...extras.flatMap((base, i) => tres(base, ` · base ${i + 1}`)),
  ];
}

export function qtdeItens(c: unknown): number | null {
  if (Array.isArray(c)) return c.length;
  if (!c || typeof c !== "object") return null;
  const obj = c as Corpo;
  for (const chave of ["transactions", "items", "data", "results", "reconciliations", "adjustments", "taxPlans"]) {
    if (Array.isArray(obj[chave])) return obj[chave].length;
    if (obj[chave] && typeof obj[chave] === "object") {
      const n = qtdeItens(obj[chave]);
      if (n !== null) return n;
    }
  }
  return null;
}

// Preserve o corpo inteiro, exceto credenciais eventualmente ecoadas pela API.
export function semSegredos(c: any, segredos: string[]): any {
  if (typeof c === "string") return segredos.filter(Boolean).reduce((t, s) => t.split(s).join("[REDACTED]"), c);
  if (Array.isArray(c)) return c.map((v) => semSegredos(v, segredos));
  if (c && typeof c === "object") return Object.fromEntries(Object.entries(c).map(([k, v]) => [k, /token|authorization|secret|password/i.test(k) ? "[REDACTED]" : semSegredos(v, segredos)]));
  return c;
}