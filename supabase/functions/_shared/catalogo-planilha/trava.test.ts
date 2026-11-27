import { assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { pegarTrava } from './trava.ts';
Deno.test('leitor renova a lease de 90s sem renovar por lote e libera só o próprio token', async () => {
  const chamadas: { nome: string; args: Record<string, unknown> }[] = [];
  const t = await pegarTrava(async (nome, args) => {
    chamadas.push({nome,args});
    return {data: nome === 'fn_catalogo_trava_pegar' ? {ok:true,token:'proprio'} : true,error:null};
  }, 'leitura', null, false, 90);
  try { await t.verificar(); await t.verificar(); }
  finally { await t.soltar(); await t.soltar(); }
  assertEquals(chamadas.map(c => c.nome), ['fn_catalogo_trava_pegar','fn_catalogo_trava_soltar']);
  assertEquals(chamadas[0].args.p_segundos, 90);
  assertEquals(chamadas[1].args.p_token, 'proprio');
});
Deno.test('contenção de leitura conserva o código 409 específico', async () => {
  let codigo = '';
  try { await pegarTrava(async () => ({data:{ok:false,dono:'leitura'},error:null}), 'leitura', null); }
  catch(e) { codigo = (e as {codigo:string}).codigo; }
  assertEquals(codigo, 'leitura_em_andamento');
});