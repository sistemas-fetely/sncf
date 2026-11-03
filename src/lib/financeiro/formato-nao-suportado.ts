/**
 * Decide se a falha de importação é "formato não suportado" — o arquivo não
 * casou com nenhum parser — e por isso pode ser guardado sem ler. Erro que
 * acontece depois de reconhecer o arquivo (conta, banco, linha) NÃO entra:
 * ele precisa ser corrigido, não arquivado.
 */
const PADRAO_FORMATO =
  /(n[aã]o reconhecid|extens[aã]o n[aã]o|cabe[cç]alho .*n[aã]o|formato n[aã]o|nenhuma? .* (na planilha|no arquivo|no relat))/i;

export function ehFormatoNaoSuportado(params: {
  fonteDetectada: boolean;
  linhasLidas: number;
  mensagem: string;
}): boolean {
  if (params.linhasLidas > 0) return false;
  if (!params.fonteDetectada) return true;
  return PADRAO_FORMATO.test(params.mensagem);
}
