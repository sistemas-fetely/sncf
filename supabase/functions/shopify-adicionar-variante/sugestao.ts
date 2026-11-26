export const CAMPOS_CADASTRO = ["cor", "estampa", "familia", "tamanho_numero"] as const;
const ATRIBUTOS = ["cor", "estampa", "tamanho_numero", "sufixo", "familia"] as const;
type Atributo = typeof ATRIBUTOS[number];
export type Cadastro = Partial<Record<typeof CAMPOS_CADASTRO[number], unknown>>;
export type Irma = { sku: string; cadastro: Cadastro; opcoes: { name: string; value: string }[] };
type Determinante = { atributo: Atributo; mapa: Map<string, string> };

export const norm = (s: unknown) => String(s ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]/g, "");
const valorAtributo = (sku: string, cadastro: Cadastro, atributo: Atributo) =>
  String(atributo === "sufixo" ? sku.split(/[./]/).at(-1) ?? "" : cadastro[atributo] ?? "").trim();

export function aprenderOpcoes(nomes: string[], irmas: Irma[]): Map<string, Determinante[]> {
  return new Map(nomes.map((nome) => {
    const determinantes: Determinante[] = [];
    for (const atributo of ATRIBUTOS) {
      const mapa = new Map<string, string>();
      let conflito = false;
      for (const irma of irmas) {
        const chave = norm(valorAtributo(irma.sku, irma.cadastro, atributo));
        const valor = irma.opcoes.find((o) => o.name === nome)?.value?.trim() ?? "";
        if (!chave || !norm(valor)) continue;
        const anterior = mapa.get(chave);
        if (anterior !== undefined && norm(anterior) !== norm(valor)) conflito = true;
        else if (anterior === undefined) mapa.set(chave, valor);
      }
      if (!conflito && mapa.size >= 2) determinantes.push({ atributo, mapa });
    }
    return [nome, determinantes];
  }));
}

export function sugerirOpcao(nome: string, sku: string, cadastro: Cadastro, aprendizado: Map<string, Determinante[]>, valorIrma: string) {
  const determinantes = aprendizado.get(nome) ?? [];
  const respostas = determinantes.flatMap((d) => {
    const valor = d.mapa.get(norm(valorAtributo(sku, cadastro, d.atributo)));
    return valor === undefined ? [] : [{ valor, atributo: d.atributo }];
  });
  const primeira = respostas[0];
  if (primeira) {
    if (respostas.some((r) => norm(r.valor) !== norm(primeira.valor)))
      return { nome, valor: "", origem: "conferir: atributos divergem" };
    return { nome, valor: primeira.valor, origem: `aprendido de ${primeira.atributo}` };
  }
  if (determinantes.length === 0) return { nome, valor: valorIrma, origem: "igual à irmã — conferir" };
  const preferencia: Atributo[] = ["estampa", "cor", "tamanho_numero", "familia", "sufixo"];
  for (const atributo of preferencia) {
    if (!determinantes.some((d) => d.atributo === atributo)) continue;
    const valor = valorAtributo(sku, cadastro, atributo);
    if (norm(valor)) return { nome, valor, origem: `valor novo do cadastro (${atributo})` };
  }
  return { nome, valor: "", origem: "conferir: cadastro sem valor" };
}