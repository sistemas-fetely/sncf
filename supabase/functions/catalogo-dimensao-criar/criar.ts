import { encontrarColecao, slugColecao, type ColecaoDim } from '../_shared/catalogo-planilha/colecoes.ts';
type Quem = { id: string; nome: string };
type Portas = {
  chamarFop: (corpo: { dimensao: 'colecao'; nome: string; quem: Quem }) => Promise<unknown>;
  listar: () => Promise<ColecaoDim[]>;
  inserir: (c: ColecaoDim) => Promise<void>;
  atualizar: (codigo: string, variantes: string[]) => Promise<void>;
  auditar: (antes: ColecaoDim | null, depois: ColecaoDim, fop: { id: string; nome: string; criada: boolean }) => Promise<void>;
};
export async function criarColecao(nome: string, quem: Quem, portas: Portas) {
  const resposta = await portas.chamarFop({ dimensao: 'colecao', nome, quem });
  const r = resposta as { ok?: boolean; id?: unknown; nome?: unknown; criada?: unknown; erro?: unknown } | null;
  if (!r || r.ok !== true) throw new Error(typeof r?.erro === 'string' ? r.erro : 'FOP não confirmou o cadastro da coleção.');
  if (typeof r.id !== 'string' || !r.id || typeof r.nome !== 'string' || !r.nome.trim() || typeof r.criada !== 'boolean') throw new Error('Resposta inválida do FOP ao cadastrar coleção.');
  const fop = { id: r.id, nome: r.nome, criada: r.criada };
  const codigo = slugColecao(fop.nome);
  if (!codigo) throw new Error('Nome devolvido pelo FOP não gera um código de coleção válido.');
  const existentes = await portas.listar();
  const anterior = encontrarColecao(nome, existentes, false) ?? encontrarColecao(fop.nome, existentes, false);
  if (anterior && !anterior.ativo) throw new Error('A coleção equivalente está inativa no SNCF. Revise o cadastro antes de continuar.');
  const variantes = anterior ? [...anterior.variantes] : [];
  for (const grafia of [nome, fop.nome]) if (grafia !== (anterior?.rotulo ?? fop.nome) && !variantes.includes(grafia)) variantes.push(grafia);
  const depois: ColecaoDim = anterior ? { ...anterior, variantes } : { codigo, rotulo: fop.nome, variantes, ativo: true };
  if (anterior) {
    if (variantes.length !== anterior.variantes.length) await portas.atualizar(anterior.codigo, variantes);
  } else await portas.inserir(depois);
  await portas.auditar(anterior ?? null, depois, fop);
  return { ok: true, codigo: depois.codigo, nome: depois.rotulo, criada: !anterior, fop_criada: fop.criada };
}