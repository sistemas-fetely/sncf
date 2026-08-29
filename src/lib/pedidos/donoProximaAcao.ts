/**
 * Dono da próxima ação: quando a ação exige uma permissão nominal que o usuário
 * logado não tem, a linha "PRÓXIMA AÇÃO" ganha o prefixo do time responsável.
 * Ex.: "Operações · Enviar ao Bling". Quem tem a permissão vê o texto original.
 */
export function prefixarProximaAcao(
  proximaAcao: string,
  perms: { podeEnviarBling: boolean; podeEmpurrarXpm: boolean },
): string {
  const t = proximaAcao.toLowerCase();
  const exigeBling = t.includes("bling");
  const exigeXpm = t.includes("xpm") || t.includes("expedi") || t.includes("armaz");

  const faltando =
    (exigeBling && !perms.podeEnviarBling) || (exigeXpm && !perms.podeEmpurrarXpm);

  return faltando ? `Operações · ${proximaAcao}` : proximaAcao;
}
