import { describe, it, expect } from "vitest";
import { QueryClient } from "@tanstack/react-query";
import { criarMutationCacheRedeSeguranca } from "./redeSeguranca";

describe("rede de segurança pós-mutation", () => {
  it("invalida só a query sem meta.pesada", async () => {
    let qc: QueryClient;
    qc = new QueryClient({ mutationCache: criarMutationCacheRedeSeguranca(() => qc) });
    qc.setQueryData(["leve"], 1);
    qc.setQueryData(["pesada"], 1);
    qc.getQueryCache().find({ queryKey: ["pesada"] })!.options.meta = { pesada: true };

    await qc.getMutationCache().build(qc, { mutationFn: async () => "ok" }).execute(undefined);

    expect(qc.getQueryState(["leve"])?.isInvalidated).toBe(true);
    expect(qc.getQueryState(["pesada"])?.isInvalidated).toBe(false);
  });
});
