import { kindAutomaticoDoCampo, kindDoCampo } from './campos.ts';

export async function cadastrarDimensao(campo: string, nome: string, quem: { id: string; nome: string }, deps: {
  chamarFop: (body: { quem: { id: string; nome: string }; kind: string; nome: string; categoria_id?: string }) => Promise<unknown>;
  auditar: (resultado: { kind: string; nome: string; criado: boolean; id: string }) => Promise<void>;
}, categoria_id?: string) {
  // Grupo lives under a category in the FOP: only the automatic path, which knows the product's category, may create it.
  const kind = categoria_id ? kindAutomaticoDoCampo(campo) : kindDoCampo(campo);
  if (kind === 'grupo' && !categoria_id) throw new Error('Grupo sem categoria no produto; não dá para cadastrar automaticamente.');
  const resposta = await deps.chamarFop({ quem, kind, nome, ...(kind === 'grupo' ? { categoria_id } : {}) });
  const r = resposta as { ok?: boolean; erro?: string; kind?: string; nome?: string; criado?: boolean; id?: string } | null;
  if (r?.ok !== true) throw new Error(typeof r?.erro === 'string' ? r.erro : 'FOP não confirmou o cadastro da dimensão.');
  if (r.kind !== kind || typeof r.nome !== 'string' || typeof r.id !== 'string' || typeof r.criado !== 'boolean') throw new Error('FOP confirmou com resposta de cadastro incompleta ou inválida.');
  const resultado = { kind, nome: r.nome, criado: r.criado, id: r.id };
  await deps.auditar(resultado);
  return { ok: true, ...resultado };
}