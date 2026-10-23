import { QueryClient, QueryObserver } from "@tanstack/react-query";
import { expect, it, vi } from "vitest";
import { invalidarPedido } from "./invalidarPedido";

it("refaz e aguarda pedido, cobertura, parcelas e links ativos após pagamento", async () => {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity } } });
  const keys = [
    ["pedido-detalhe", "PED-2309"],
    ["pedido-portao-atual", "PED-2309"],
    ["conta-cliente-cobertura", "cliente", "PED-2309"],
    ["provisoes-pedido", "PED-2309", "links"],
    ["plano-aberto-pedido", "PED-2309"],
    ["link-pagamento", "PED-2309"],
    ["gerenciar-links", "PED-2309", "api"],
  ];
  const fns = keys.map(() => vi.fn(async () => "estado atualizado"));
  const removers = keys.map((queryKey, i) => {
    qc.setQueryData(queryKey, "estado antigo");
    return new QueryObserver(qc, { queryKey, queryFn: fns[i] }).subscribe(() => {});
  });
  await invalidarPedido(qc, "PED-2309");
  keys.forEach((key, i) => {
    // Pode refazer mais de uma vez (prefixo da lista + predicate pelo id);
    // o que não pode é deixar de refazer ou devolver dado velho.
    expect(fns[i]).toHaveBeenCalled();
    expect(qc.getQueryData(key)).toBe("estado atualizado");
  });
  removers.forEach((remove) => remove());
  qc.clear();
});

it("invalida chave fora das listas que só carrega o id do pedido em posição intermediária", async () => {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity } } });
  // Chave real do card de envio, com o id fora da primeira posição.
  const ancoraKey = ["ancora-sugestao", "PED-2309", "2026-10-23", 0, ""];
  // Chave que nenhuma das listas cobre: só o predicate pelo id alcança.
  const predicateKey = ["compra-tres-camadas-pedido", "PED-2309"];
  // Outro pedido: não pode ser tocada nem pelo prefixo (não está nas listas) nem pelo predicate.
  const outraKey = ["compra-tres-camadas-pedido", "PED-9999"];

  const ancoraFn = vi.fn(async () => "estado atualizado");
  const predicateFn = vi.fn(async () => "estado atualizado");
  const outraFn = vi.fn(async () => "estado atualizado");
  const removers = [
    [ancoraKey, ancoraFn],
    [predicateKey, predicateFn],
    [outraKey, outraFn],
  ].map(([queryKey, fn]) => {
    qc.setQueryData(queryKey as unknown[], "estado antigo");
    return new QueryObserver(qc, {
      queryKey: queryKey as unknown[],
      queryFn: fn as () => Promise<string>,
    }).subscribe(() => {});
  });

  await invalidarPedido(qc, "PED-2309");

  expect(ancoraFn).toHaveBeenCalled();
  expect(qc.getQueryData(ancoraKey)).toBe("estado atualizado");
  expect(predicateFn).toHaveBeenCalled();
  expect(qc.getQueryData(predicateKey)).toBe("estado atualizado");
  expect(outraFn).not.toHaveBeenCalled();
  expect(qc.getQueryData(outraKey)).toBe("estado antigo");

  removers.forEach((remove) => remove());
  qc.clear();
});
