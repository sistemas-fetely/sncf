// PARCEIRO-UNICO-POR-BLING (19/10/2026): fonte unica para achar/criar parceiro
// vindo do Bling. Antes, cada sync fazia `.eq("bling_id").maybeSingle()` e
// ignorava o erro: com 2+ linhas o maybeSingle devolve erro + data null, o codigo
// entendia "nao existe" e inseria OUTRA copia — cada rodada do cron aumentava
// a pilha. Agora: busca por bling_id, depois CPF, depois CNPJ (so digitos),
// sempre o cadastro mais antigo, erro de consulta LANCA (fail-loud).

function soDigitos(v: unknown): string {
  return String(v ?? "").replace(/\D/g, "");
}

function formatarCpf(d: string) {
  return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6, 9)}-${d.slice(9)}`;
}
function formatarCnpj(d: string) {
  return `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5, 8)}/${d.slice(8, 12)}-${d.slice(12)}`;
}

async function maisAntigo(
  supabase: any,
  coluna: string,
  valores: string[],
): Promise<{ id: string; bling_id: string | null } | null> {
  const { data, error } = await supabase
    .from("parceiros_comerciais")
    .select("id, bling_id")
    .in(coluna, valores)
    .order("created_at", { ascending: true })
    .order("id", { ascending: true })
    .limit(1);
  if (error) throw new Error(`busca de parceiro por ${coluna} falhou: ${error.message}`);
  return data?.[0] ?? null;
}

/** Procura cadastro existente: bling_id → CPF → CNPJ. Grava bling_id se vazio. */
export async function encontrarParceiroBling(
  supabase: any,
  blingIdRaw: unknown,
  documento: unknown,
): Promise<string | null> {
  const blingId = blingIdRaw != null && blingIdRaw !== "" ? String(blingIdRaw).trim() : "";
  const doc = soDigitos(documento);

  if (blingId) {
    const porBling = await maisAntigo(supabase, "bling_id", [blingId]);
    if (porBling) return porBling.id;
  }

  let achado: { id: string; bling_id: string | null } | null = null;
  if (doc.length === 11) achado = await maisAntigo(supabase, "cpf", [doc, formatarCpf(doc)]);
  if (!achado && doc.length === 14) achado = await maisAntigo(supabase, "cnpj", [doc, formatarCnpj(doc)]);
  // cadastros antigos gravaram CPF na coluna cnpj — tambem aceitar
  if (!achado && doc.length === 11) achado = await maisAntigo(supabase, "cnpj", [doc, formatarCpf(doc)]);
  if (!achado) return null;

  if (blingId && !achado.bling_id) {
    const { error } = await supabase
      .from("parceiros_comerciais")
      .update({ bling_id: blingId })
      .eq("id", achado.id)
      .is("bling_id", null);
    if (error) throw new Error(`gravar bling_id no parceiro ${achado.id} falhou: ${error.message}`);
  }
  return achado.id;
}

async function inserirComRetry(supabase: any, registro: Record<string, unknown>) {
  let ultimoErro = "";
  for (let tentativa = 1; tentativa <= 3; tentativa++) {
    const { data, error } = await supabase
      .from("parceiros_comerciais").insert(registro).select("id").maybeSingle();
    if (!error) return data?.id ?? null;
    ultimoErro = error.message;
    if (tentativa < 3) await new Promise((r) => setTimeout(r, 400 * tentativa));
  }
  throw new Error(`parceiro nao cadastrado [bling_id=${registro.bling_id}]: ${ultimoErro}`);
}

/** Acha ou cria o parceiro de um contato do Bling. Só insere se nada for encontrado. */
export async function resolverParceiroBling(
  supabase: any,
  contato: any,
  origem: string,
): Promise<string | null> {
  if (!contato?.id) return null;
  const blingId = String(contato.id);
  const existente = await encontrarParceiroBling(supabase, blingId, contato.numeroDocumento);
  if (existente) return existente;
  if (!contato.nome) return null;
  const doc = soDigitos(contato.numeroDocumento);
  const pf = doc.length === 11;
  return await inserirComRetry(supabase, {
    razao_social: contato.nome,
    tipo: pf ? "pf" : "pj",
    tipo_pessoa: pf ? "PF" : "PJ",
    tipos: ["cliente"],
    origem,
    bling_id: blingId,
    cpf: pf ? doc : null,
    cnpj: doc.length === 14 ? doc : null,
    email: contato.email || null,
    telefone: contato.telefone || null,
  });
}
