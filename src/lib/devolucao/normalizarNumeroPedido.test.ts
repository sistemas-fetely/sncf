import { describe, it, expect } from "vitest";
import { normalizarNumeroPedido } from "./normalizarNumeroPedido";

describe("normalizarNumeroPedido", () => {
  it("#1401 gera três candidatos", () => {
    expect(normalizarNumeroPedido("#1401")).toEqual(["SHP-1401", "PED-1401", "VD-1401"]);
  });
  it("1401 gera três candidatos", () => {
    expect(normalizarNumeroPedido("1401")).toEqual(["SHP-1401", "PED-1401", "VD-1401"]);
  });
  it("shp-1401 vira SHP-1401", () => {
    expect(normalizarNumeroPedido("shp-1401")).toEqual(["SHP-1401"]);
  });
  it("PED-2348 fica igual", () => {
    expect(normalizarNumeroPedido("PED-2348")).toEqual(["PED-2348"]);
  });
  it("remove espaços", () => {
    expect(normalizarNumeroPedido("  VD - 0037 ")).toEqual(["VD-0037"]);
    expect(normalizarNumeroPedido(" # 1401 ")).toEqual(["SHP-1401", "PED-1401", "VD-1401"]);
  });
});
