import { readFileSync } from "node:fs";
import vm from "node:vm";
import ts from "typescript";
import { describe, expect, it, vi } from "vitest";

const source = readFileSync(new URL("./index.ts", import.meta.url), "utf8").replace(/^import .*;\n/gm, "");

function fixture(options: { adopted?: boolean; override?: boolean; adoptionError?: boolean; registerError?: boolean; transitionError?: boolean; createError?: boolean } = {}) {
  let handler: (req: Request) => Promise<Response> = async () => new Response();
  const writes: { table: string; operation: string; value: unknown }[] = [];
  const sbUser = { rpc: vi.fn(async () => ({ error: options.transitionError ? { message: "estágio bloqueado" } : null })) };
  const sb = {
    rpc: vi.fn(async (name: string) => {
      if (name === "fn_xpm_adotar_expedicao_orfa") return { data: { adotada: options.adopted, codigo: "PED-2380", estagio: "pre_separacao" }, error: options.adoptionError ? { message: "adoção recusada" } : null };
      if (name === "fn_xpm_payload_expedicao") return { data: { ok: true, codigo: "PED-2380", ambiente: "producao", payload: { cpfCnpj: "1", cpfCnpjDepositante: "2" }, avisos: [], estagio: "pre_separacao" }, error: null };
      if (name === "get_vault_secret") return { data: "test-pat", error: null };
      if (name === "fn_xpm_registrar_create_sucesso") return { error: options.registerError ? { message: "gravação recusada" } : null };
      throw new Error(`RPC inesperada: ${name}`);
    }),
    from: (table: string) => {
      const builder = {
        select: () => builder, eq: () => builder, in: () => builder,
        single: async () => ({ data: { config: { base_url: "https://xpm.test", pat_vault_key: "pat", tenant_name: "test" } }, error: null }),
        insert: (value: unknown) => { writes.push({ table, operation: "insert", value }); return builder; },
        update: (value: unknown) => { writes.push({ table, operation: "update", value }); return builder; },
        then: (resolve: (value: unknown) => void) => resolve({ data: [{ codigo: "expedicao_existente", rotulo: "Expedição", permissao_slug: "acao.forcar_expedicao_xpm", motivo_min: 15 }], error: null }),
      };
      return builder;
    },
  };
  const network = vi.fn(async (url: string) => {
    if (url.includes("AuthenticatePAT")) return Response.json({ result: { accessToken: "test-token" } });
    if (url.includes("/Create")) return Response.json(options.createError ? { success: false, error: { message: "Create recusado" } } : { success: true }, { status: options.createError ? 422 : 200 });
    return Response.json({ success: true, result: { codigoExpedicao: "PED-2380" } });
  });
  const createClient = vi.fn().mockReturnValueOnce(sb).mockReturnValueOnce(sbUser);
  vm.runInNewContext(ts.transpile(source, { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None }), {
    createClient, criarFetchLimitado: () => network,
    exigirAcao: async () => ({ ok: true, userId: "test-user" }),
    Deno: { env: { get: () => "test-env" }, serve: (fn: typeof handler) => { handler = fn; } },
    Response, URLSearchParams, Date, console: { warn: vi.fn(), error: vi.fn() },
  });
  const run = async () => {
    const response = await handler(new Request("https://edge.test", { method: "POST", headers: { Authorization: "Bearer caller" }, body: JSON.stringify({ pedido_id: "test-order", ...(options.override ? { forcar: ["expedicao_existente"], motivo: "Reenvio explicitamente autorizado" } : {}) }) }));
    return { status: response.status, body: await response.json() };
  };
  return { run, sb, sbUser, writes, network, createClient };
}

describe("recuperação e gravação XPM", () => {
  it("adoção retorna o código existente sem payload nem chamada XPM", async () => {
    const f = fixture({ adopted: true });
    expect((await f.run()).body).toMatchObject({ sucesso: true, adotada: true, codigo_expedicao: "PED-2380", avisos: [] });
    expect(f.sb.rpc.mock.calls.map(([name]) => name)).toEqual(["fn_xpm_adotar_expedicao_orfa"]);
    expect(f.network).not.toHaveBeenCalled();
    expect(f.sbUser.rpc).toHaveBeenCalledWith("transicionar_pedido", expect.objectContaining({ p_para_estagio: "em_separacao" }));
  });
  it("falha de transição preserva adoção e devolve a mensagem real", async () => {
    const f = fixture({ adopted: true, transitionError: true });
    expect((await f.run()).body.aviso_transicao).toBe("Expedição vinculada, mas o estágio não avançou automaticamente — estágio bloqueado");
    expect(f.network).not.toHaveBeenCalled();
  });
  it("erro de adoção impede envio", async () => {
    const f = fixture({ adoptionError: true });
    expect(await f.run()).toMatchObject({ status: 500, body: { erro: "adotar expedição órfã: adoção recusada" } });
    expect(f.network).not.toHaveBeenCalled();
  });
  it("override explícito ignora adoção e mantém o envio", async () => {
    const f = fixture({ override: true });
    expect((await f.run()).body.sucesso).toBe(true);
    expect(f.sb.rpc.mock.calls.map(([name]) => name)).not.toContain("fn_xpm_adotar_expedicao_orfa");
    expect(f.network).toHaveBeenCalledTimes(3);
  });
  it("Create confirmado grava log e ponteiro somente por RPC e clientes não usam fetch limitado", async () => {
    const f = fixture();
    expect((await f.run()).body.sucesso).toBe(true);
    expect(f.sb.rpc).toHaveBeenCalledWith("fn_xpm_registrar_create_sucesso", expect.objectContaining({ p_codigo: "PED-2380", p_resposta_status: 200, p_resposta_body: { success: true }, p_enviado_por: "test-user" }));
    expect(f.writes).toEqual([]);
    expect(f.createClient.mock.calls[0]).toHaveLength(2);
    expect(f.createClient.mock.calls[1][2]).toEqual({ global: { headers: { Authorization: "Bearer caller" } } });
  });
  it("erro da gravação atômica alerta que Create ocorreu e não repete envio", async () => {
    const f = fixture({ registerError: true });
    expect(await f.run()).toMatchObject({ status: 500, body: { erro: "Expedição PED-2380 CRIADA na XPM, mas o SNCF não gravou: gravação recusada. NÃO reenvie — o reenvio vai vincular a expedição existente." } });
    expect(f.network).toHaveBeenCalledTimes(3);
  });
  it("Create recusado conserva log de falha e erro do pedido", async () => {
    const f = fixture({ createError: true });
    expect(await f.run()).toMatchObject({ status: 502, body: { sucesso: false, erro: "Create recusado" } });
    expect(f.writes).toEqual([expect.objectContaining({ table: "xpm_envios_log", value: expect.objectContaining({ sucesso: false }) }), expect.objectContaining({ table: "pedidos", value: { xpm_envio_erro: "Create recusado" } })]);
    expect(f.sb.rpc.mock.calls.map(([name]) => name)).not.toContain("fn_xpm_registrar_create_sucesso");
  });
});