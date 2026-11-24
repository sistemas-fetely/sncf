import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { PedidoFilaItem } from "@/types/pedido";
import type { LiberacaoExpedicao } from "@/hooks/pedidos/useLiberacaoExpedicao";

vi.mock("@/integrations/supabase/client", () => ({ supabase: {} }));
import { CelulaPagamento } from "./FilaPedidosPorArea";

afterEach(cleanup);
const pedido = { condicao_solicitada: "", forma_solicitada: "" } as PedidoFilaItem;
const liberacao: LiberacaoExpedicao = {
  pedido_id: "pedido-teste", liberado: true, codigo: "liberado", rotulo: "Liberado",
  tom: "ok", motivo: null, nivel_prova: "declarado_humano", prova_rotulo: "Prova declarada",
  prova_tom: "alerta", prova_frase: "Ainda não caiu no extrato",
};

describe("provaLine na célula de pagamento", () => {
  it("liberado=true preserva liberação e oculta o selo de prova", () => {
    render(<CelulaPagamento p={pedido} liberacao={liberacao} />);
    expect(screen.getByText(liberacao.rotulo)).toBeVisible();
    expect(screen.queryByText(liberacao.prova_rotulo ?? "")).not.toBeInTheDocument();
  });
  it("liberado=false exibe o selo de prova fornecido pelo banco", () => {
    render(<CelulaPagamento p={pedido} liberacao={{ ...liberacao, liberado: false }} />);
    expect(screen.getByText(liberacao.prova_rotulo ?? "")).toBeVisible();
  });
});