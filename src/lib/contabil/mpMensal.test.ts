import {describe,it,expect} from "vitest";
import {janelaMensal,lerReleaseMensal,automaticoVigente} from "../../../supabase/functions/mp-relatorios/mensal";
describe("MP mensal",()=>{
 it("outubro inteiro em GMT-03",()=>{expect(janelaMensal("2026-10-01")).toEqual({inicio:"2026-10-01",fim:"2026-10-31",begin_date:"2026-10-01T00:00:00-03:00",end_date:"2026-10-31T23:59:59-03:00"});});
 it("automático preserva manual",()=>{expect(automaticoVigente("manual")).toBe(false);expect(automaticoVigente("api_mp")).toBe(true);expect(automaticoVigente(null)).toBe(true);});
 it("saldo final vem do inicial mais liberações sem reservas",()=>{expect(lerReleaseMensal("DATE;RECORD_TYPE;BALANCE_AMOUNT;NET_CREDIT_AMOUNT;NET_DEBIT_AMOUNT\n2026-10-01;initial_available_balance;4966.91;0;0\n2026-10-02;release;5066.91;100;0\n2026-10-02;reserve_for_payout;5066.91;0;100", "2026-10-01","2026-10-31").saldo_final).toBe(5066.91);});
});