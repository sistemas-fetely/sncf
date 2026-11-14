export const BASE_HML = "https://api-hml.safranegocios.com.br";
export type Objeto = Record<string, unknown>;
export const objeto = (v: unknown): Objeto => v && typeof v === "object" && !Array.isArray(v) ? v as Objeto : {};

export function redigir(v: unknown, segredos: string[] = []): unknown {
  if (Array.isArray(v)) return v.map((x) => redigir(x, segredos));
  if (v && typeof v === "object") return Object.fromEntries(Object.entries(v).map(([k, x]) =>
    [k, /^(password|senha|access_?token|refresh_?token|authorization|client_?id|username)$/i.test(k) ? "[REDACTED]" : redigir(x, segredos)]));
  if (typeof v === "string") {
    let texto = v;
    for (const segredo of segredos.filter(Boolean)) texto = texto.split(segredo).join("[REDACTED]");
    return texto.replace(/Bearer\s+[^\s"<>]+/gi, "Bearer [REDACTED]");
  }
  return v;
}

export function entrada(v: unknown) {
  const b = objeto(v);
  if (b.ambiente !== "hml") throw new Error("produção ainda não habilitada");
  if (!["token", "registrar", "consultar_registro", "consultar_boleto", "smoke"].includes(String(b.acao))) throw new Error("acao inválida");
  if (b.nosso_numero !== undefined && !/^\d{1,9}$/.test(String(b.nosso_numero))) throw new Error("nosso_numero deve ter de 1 a 9 dígitos");
  if (b.numeroCliente !== undefined && !/^HML-\d{6}$/.test(String(b.numeroCliente))) throw new Error("numeroCliente deve ser HML- e 6 dígitos");
  return { acao: String(b.acao), nosso_numero: b.nosso_numero == null ? null : String(b.nosso_numero), numeroCliente: b.numeroCliente == null ? null : String(b.numeroCliente) };
}

export function vencimentoHml(hoje = new Date()) {
  const d = new Date(hoje);
  d.setUTCDate(d.getUTCDate() + 30);
  return d.toISOString().slice(0, 10);
}

export function payloadHml(params: Record<string, string>, endereco: Objeto, numero: string, numeroCliente: string, vencimento: string) {
  if (!/^\d{4}$/.test(params.agencia_4d ?? "") || !/^\d{7}$/.test(params.conta_7d ?? "")) throw new Error("Parâmetros Safra: agencia_4d/conta_7d inválidos");
  if (!/^\d{1,9}$/.test(numero)) throw new Error("nosso_numero inválido nos parâmetros Safra");
  const campo = (k: string, max: number) => {
    const v = String(endereco[k] ?? "").trim();
    if (!v) throw new Error(`Endereço cadastral Fetely: ${k} ausente`);
    return v.slice(0, max);
  };
  const cep = campo("cep", 20).replace(/\D/g, "");
  if (!/^\d{8}$/.test(cep)) throw new Error("Endereço cadastral Fetely: CEP inválido");
  return {
    agencia: params.agencia_4d, conta: params.conta_7d,
    documento: {
      numero, numeroCliente, especie: "01", dataVencimento: vencimento, valor: 1.00, codigoMoeda: 0,
      pagador: {
        nome: "TESTE HML FETELY", tipoPessoa: "J", numeroDocumento: "63591078000148",
        endereco: { logradouro: `${campo("logradouro", 40)} ${String(endereco.numero ?? "").trim()}`.trim().slice(0, 40), bairro: campo("bairro", 10), cidade: campo("cidade", 15), uf: campo("uf", 2), cep },
      },
    },
  };
}

export function erroApi(corpo: unknown, status: number) {
  const c = objeto(corpo);
  const mensagens: string[] = [];
  const visitar = (v: unknown): void => {
    if (typeof v === "string") { if (v) mensagens.push(v); return; }
    if (Array.isArray(v)) { v.forEach(visitar); return; }
    const o = objeto(v);
    const msg = o.message ?? o.mensagem ?? o.description ?? o.detail;
    if (msg) visitar(msg);
    else Object.values(o).forEach(visitar);
  };
  for (const k of ["fields", "business-validation", "service-error", "errors", "message", "error_description", "detail", "title", "texto"]) if (c[k]) visitar(c[k]);
  return { codigo: String(c.code ?? c.errorCode ?? c.error ?? c.type ?? (c["business-validation"] ? "business-validation" : `HTTP_${status}`)), mensagem: [...new Set(mensagens)].join("; ") || `Safra HTTP ${status}` };
}

export class FalhaSafra extends Error {
  constructor(public status: number, public codigo: string, mensagem: string) { super(mensagem); }
}

export type LogChamada = { correlation_id: string; ambiente: string; endpoint: string; metodo: string; request: unknown; response?: unknown; http_status?: number | null; erro_codigo?: string | null; erro_msg?: string | null };
export type Resultado = { corpo: unknown; http_status: number };

export function clienteHml(deps: {
  fetch: typeof fetch;
  iniciar: (log: LogChamada) => Promise<string>;
  finalizar: (id: string, log: Partial<LogChamada>) => Promise<void>;
  segredos: string[];
}) {
  return async (endpoint: string, metodo: "GET" | "POST", body: Objeto | null, bearer?: string, form = false): Promise<Resultado> => {
    if (!endpoint.startsWith("/gateway/")) throw new Error("Endpoint HML inválido");
    const correlation_id = crypto.randomUUID();
    const headers: Record<string, string> = { "Safra-Correlation-ID": correlation_id, "Content-Type": form ? "application/x-www-form-urlencoded" : "application/json" };
    if (bearer) headers.Authorization = `Bearer ${bearer}`;
    const logId = await deps.iniciar({ correlation_id, ambiente: "hml", endpoint, metodo, request: redigir({ headers, body }, deps.segredos) });
    let corpo: unknown = null;
    let status: number | null = null;
    let falha: FalhaSafra | null = null;
    try {
      const r = await deps.fetch(`${BASE_HML}${endpoint}`, { method: metodo, headers, redirect: "error", signal: AbortSignal.timeout(25000), ...(body ? { body: form ? new URLSearchParams(Object.entries(body).map(([k, v]) => [k, String(v)])) : JSON.stringify(body) } : {}) });
      status = r.status;
      const texto = await r.text();
      try { corpo = texto ? JSON.parse(texto) : null; } catch { corpo = { texto }; }
      // Capture issued credentials before any persistence or error serialization.
      const c = objeto(corpo);
      for (const k of ["access_token", "refresh_token"]) if (typeof c[k] === "string") deps.segredos.push(String(c[k]));
      if (!r.ok) {
        const erro = erroApi(redigir(corpo, deps.segredos), r.status);
        falha = new FalhaSafra(r.status, erro.codigo, erro.mensagem);
      }
    } catch (e) {
      falha = new FalhaSafra(502, "TRANSPORT_ERROR", String(redigir(e instanceof Error ? e.message : String(e), deps.segredos)));
    }
    await deps.finalizar(logId, { response: redigir(corpo, deps.segredos), http_status: status, erro_codigo: falha?.codigo ?? null, erro_msg: falha?.message ?? null });
    if (falha) throw falha;
    return { corpo, http_status: status ?? 502 };
  };
}

export function extrairBarras(v: unknown): string | null {
  const o = objeto(v);
  if (typeof o.codigoBarras === "string" || typeof o.codigoBarras === "number") return String(o.codigoBarras);
  for (const x of Array.isArray(v) ? v : Object.values(o)) {
    if (x && typeof x === "object") { const encontrado = extrairBarras(x); if (encontrado) return encontrado; }
  }
  return null;
}