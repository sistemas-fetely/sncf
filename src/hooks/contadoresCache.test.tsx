import { describe, it, expect, vi } from "vitest";
vi.mock("@/integrations/supabase/client", () => ({ supabase: { rpc: vi.fn() } }));
import { KEY_INBOX_FILAS } from "@/hooks/tarefas/useInboxFilas";
import { KEY_BADGES_NAVEGACAO } from "@/hooks/useBadgesNavegacao";

describe("chaves dos contadores", () => {
  it("filas da Dash não ficam sob o prefixo tarefas", () => {
    expect(KEY_INBOX_FILAS[0]).not.toBe("tarefas");
  });
  it("badges usam uma chave única", () => {
    expect(KEY_BADGES_NAVEGACAO).toEqual(["badges-navegacao"]);
  });
});
