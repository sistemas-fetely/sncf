import { expect, it } from "vitest";
import { montarTimelineTransferencia, type EventoTransferencia } from "./timelineRegras";
const evento = (para: string, criado_em: string, metadata: unknown = { para }): EventoTransferencia => ({ tipo_evento: "mudou_estagio", estagio_novo: para, metadata, criado_em });
it("datas usam metadata para, estágio novo como fallback e fontes fiscais/recebimento", () => {
  const r = montarTimelineTransferencia([evento("recebido", "2026-11-10T12:00:00Z"), evento("outro", "2026-11-11T12:00:00Z", { para: "em_separacao" }), evento("em_transporte", "2026-11-13T12:00:00Z", null), evento("entregue", "2026-11-14T12:00:00Z")], "2026-11-12", "2026-11-15", new Date("2026-11-16T22:50:00Z"));
  expect(r.datas).toEqual(["2026-11-10T12:00:00Z", "2026-11-11T12:00:00Z", "2026-11-12", "2026-11-13T12:00:00Z", "2026-11-14T12:00:00Z", "2026-11-15"]);
  expect(r.atual).toBe(5);
  expect(r.dias).toBe(1);
});
it("passos ausentes não ganham datas e etapa atual mostra dias", () => {
  const r = montarTimelineTransferencia([evento("recebido", "2026-11-10"), evento("em_separacao", "2026-11-11")], null, null, new Date("2026-11-16T22:50:00Z"));
  expect(r.atual).toBe(1);
  expect(r.dias).toBe(5);
  expect(r.datas.slice(2)).toEqual([null, null, null, null]);
});