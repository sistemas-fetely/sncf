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
    expect(fns[i]).toHaveBeenCalledTimes(1);
    expect(qc.getQueryData(key)).toBe("estado atualizado");
  });
  removers.forEach((remove) => remove());
  qc.clear();
});