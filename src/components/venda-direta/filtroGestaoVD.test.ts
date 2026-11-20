import { describe, expect, it } from "vitest";
import { alternarFiltroVD, correspondeFiltroVD, lerFiltroVD } from "./filtroGestaoVD";

describe("Filtro da Gestão Site SP", () => {
  const recebido = { fase: "recebido", etapa: "escolher_cd", alertas: [] };
  const bling = { fase: "a_faturar", etapa: "aguardando_nf", alertas: [] };
  it("Recebido mostra somente a fase recebido", () => {
    const filtro = lerFiltroVD("fase:recebido");
    expect([recebido, bling].filter((l) => correspondeFiltroVD(l, filtro))).toEqual([recebido]);
  });
  it("Escolher CD mostra somente a etapa", () => {
    expect(correspondeFiltroVD(recebido, lerFiltroVD("etapa:escolher_cd"))).toBe(true);
    expect(correspondeFiltroVD(bling, lerFiltroVD("etapa:escolher_cd"))).toBe(false);
  });
  it("segundo clique desmarca e outra fase substitui", () => {
    const fase = { tipo: "fase", codigo: "recebido" } as const;
    expect(alternarFiltroVD(fase, fase)).toBeNull();
    expect(alternarFiltroVD(fase, { tipo: "fase", codigo: "entregue" })).toEqual({ tipo: "fase", codigo: "entregue" });
  });
  it("Todos não restringe fase e URL restaura fase/etapa", () => {
    expect(correspondeFiltroVD(bling, null)).toBe(true);
    expect(lerFiltroVD("fase:entregue")).toEqual({ tipo: "fase", codigo: "entregue" });
    expect(lerFiltroVD("etapa:aguardando_nf")).toEqual({ tipo: "etapa", codigo: "aguardando_nf" });
    expect(lerFiltroVD("")).toBeNull();
  });
});