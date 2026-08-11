import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import { vi, it, expect } from "vitest";

vi.mock("@/contexts/AuthContext", () => ({ useAuth: () => ({ user: { id: "u" } }) }));
vi.mock("@/integrations/supabase/client", () => {
  const chain: any = {};
  chain.select = () => chain; chain.eq = () => chain; chain.neq = () => chain; chain.in = () => chain;
  chain.limit = () => Promise.resolve({ data: [] });
  chain.order = () => chain; chain.maybeSingle = () => Promise.resolve({ data: null });
  chain.single = () => Promise.resolve({ data: { id: "imp1" } });
  chain.insert = () => chain; chain.update = () => chain; chain.upsert = () => Promise.resolve({});
  chain.then = (r: any) => Promise.resolve({ data: [] }).then(r);
  return { supabase: { from: () => chain, auth: { getUser: async () => ({ data: { user: { id: "u" } } }) }, functions: { invoke: async () => ({ data: { lancamentos: [{ data_compra: "2026-01-02", descricao: "T", valor: 1 }] } }) }, storage: { from: () => ({ upload: async () => ({}) }) }, rpc: async () => ({ data: null }) } };
});

import Page from "@/pages/administrativo/ExtratoImportacao";

it("abre dialog e seleciona pdf", async () => {
  const qc = new QueryClient();
  render(<MemoryRouter><QueryClientProvider client={qc}><Page /></QueryClientProvider></MemoryRouter>);
  fireEvent.click(await screen.findByText(/Importar Fatura$/));
  await waitFor(() => expect(document.querySelectorAll('input[type=file]').length).toBeGreaterThan(1));
  const inputs = Array.from(document.querySelectorAll('input[type=file]')) as HTMLInputElement[];
  const dialogInput = inputs.find(i => i.accept.includes("pdf"))!;
  const f = new File(["%PDF"], "fatura.pdf", { type: "application/pdf" });
  fireEvent.change(dialogInput, { target: { files: [f] } });
  await waitFor(() => expect(screen.getAllByText(/Antes de importar/i).length).toBeGreaterThan(0), { timeout: 4000 });
});
