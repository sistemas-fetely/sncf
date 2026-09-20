import { useQuery } from "@tanstack/react-query";

import { supabase } from "@/integrations/supabase/client";

export type TermoRestrito = {
  padrao: string;
  rotulo: string;
  ativo: boolean;
};

export function useTermosRestritos() {
  return useQuery({
    queryKey: ["termos-restritos-ativos"],
    staleTime: Infinity,
    queryFn: async (): Promise<TermoRestrito[]> => {
      const { data, error } = await supabase
        .from("termo_restrito" as never)
        .select("padrao, rotulo, ativo")
        .eq("ativo", true);
      if (error) throw new Error(error.message);
      return (data ?? []) as TermoRestrito[];
    },
  });
}

function normalizarComMapa(texto: string): { normalizado: string; indices: number[] } {
  let normalizado = "";
  const indices: number[] = [];
  let indiceOriginal = 0;

  for (const caractere of texto) {
    const base = caractere
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLocaleLowerCase("pt-BR");
    for (const parte of base) {
      normalizado += parte;
      indices.push(indiceOriginal);
    }
    indiceOriginal += caractere.length;
  }
  indices.push(texto.length);
  return { normalizado, indices };
}

export function mascarar(texto: string, termos: TermoRestrito[]): string {
  if (!texto || termos.length === 0) return texto;

  const origem = normalizarComMapa(texto);
  const candidatos = termos
    .map((termo) => ({ ...termo, busca: normalizarComMapa(termo.padrao.trim()).normalizado }))
    .filter((termo) => termo.busca.length > 0)
    .sort((a, b) => b.busca.length - a.busca.length);

  const ocorrencias: { inicio: number; fim: number; rotulo: string }[] = [];
  for (const termo of candidatos) {
    let inicioBusca = 0;
    while (inicioBusca < origem.normalizado.length) {
      const inicioNormalizado = origem.normalizado.indexOf(termo.busca, inicioBusca);
      if (inicioNormalizado < 0) break;
      const fimNormalizado = inicioNormalizado + termo.busca.length;
      const inicio = origem.indices[inicioNormalizado];
      const fim = origem.indices[fimNormalizado] ?? texto.length;
      const sobrepoe = ocorrencias.some((item) => inicio < item.fim && fim > item.inicio);
      if (!sobrepoe) ocorrencias.push({ inicio, fim, rotulo: termo.rotulo });
      inicioBusca = fimNormalizado;
    }
  }

  return ocorrencias
    .sort((a, b) => b.inicio - a.inicio)
    .reduce(
      (resultado, item) => `${resultado.slice(0, item.inicio)}${item.rotulo}${resultado.slice(item.fim)}`,
      texto,
    );
}

export function mascararValor(valor: unknown, termos: TermoRestrito[]): unknown {
  return typeof valor === "string" ? mascarar(valor, termos) : valor;
}

export function mascararMatriz(
  matrizPorAba: Record<string, unknown[][]>,
  termos: TermoRestrito[],
): Record<string, unknown[][]> {
  return Object.fromEntries(
    Object.entries(matrizPorAba).map(([aba, linhas]) => [
      mascarar(aba, termos),
      linhas.map((linha) => linha.map((valor) => mascararValor(valor, termos))),
    ]),
  );
}

export function mensagemErroTermoRestrito(erro: unknown): string | null {
  const mensagem = erro instanceof Error ? erro.message : String(erro);
  return /TERMO\s+RESTRITO/i.test(mensagem)
    ? "A planilha contém termo sigiloso que não pôde ser mascarado. Remova esse conteúdo do arquivo e tente novamente."
    : null;
}