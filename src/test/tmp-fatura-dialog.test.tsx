import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { vi, it, expect } from "vitest";

vi.mock("@/integrations/supabase/client", () => {
  const chain: any = {
    select: () => chain, eq: () => chain, order: () => Promise.resolve({ data: [{ id: "c1", nome: "Itau", ultimos_digitos: null, bandeira: null }] }),
    single: () => Promise.resolve({ data: { id: "x" } }), insert: () => chain,
  };
  return { supabase: { from: () => chain, auth: { getUser: async () => ({ data: { user: { id: "u" } } }) }, functions: { invoke: async () => ({ data: { lancamentos: [{ data_compra: "2026-01-02", descricao: "TESTE", valor: 10 }] } }) }, storage: { from: () => ({ upload: async () => ({}) }) }, rpc: async () => ({}) } };
});

import { ImportarFaturaCartaoDialog } from "@/components/financeiro/ImportarFaturaCartaoDialog";

const csv = "DATA;DESCRICAO;CRED/DEB;TIPO DA TRANSACAO;COD MOEDA;VALOR DA TRANSACAO;VALOR EM REAIS;NOME DO PORTADOR;NUMERO DO CARTAO;RAMO DO ESTAB;LOCAL;NUMERO DA AUTORIZACAO;CNPJ;COTACAO DO DOLAR EM REAL\n02/01/2026;LOJA X;D;NACIONAL;BRL;10,00;10,00;JOAO;1234;X;SP;1;1;0\n";

it("csv path", async () => {
  const qc = new QueryClient();
  render(<QueryClientProvider client={qc}><ImportarFaturaCartaoDialog open onOpenChange={() => {}} /></QueryClientProvider>);
  const input = document.querySelector('input[type=file]') as HTMLInputElement;
  const f = new File([csv], "fatura.csv", { type: "text/csv" });
  (f as any).text = async () => csv;
  fireEvent.change(input, { target: { files: [f] } });
  await waitFor(() => expect(screen.getByText(/Antes de importar/i)).toBeTruthy(), { timeout: 4000 });
});

it("pdf path", async () => {
  const qc = new QueryClient();
  render(<QueryClientProvider client={qc}><ImportarFaturaCartaoDialog open onOpenChange={() => {}} /></QueryClientProvider>);
  const input = document.querySelectorAll('input[type=file]')[0] as HTMLInputElement;
  const f = new File(["%PDF-1.4"], "fatura.pdf", { type: "application/pdf" });
  fireEvent.change(input, { target: { files: [f] } });
  await waitFor(() => expect(screen.getAllByText(/Antes de importar/i).length).toBeGreaterThan(0), { timeout: 4000 });
});
