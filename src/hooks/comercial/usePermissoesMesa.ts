import { usePermissaoAcaoOuSuperAdmin } from "@/hooks/usePermissaoAcao";

/**
 * PERMISSAO-NOMINAL-POR-ACAO: a Mesa Comercial não tem mais um gate único.
 * `tela.comercial` decide o ACESSO À ABA; cada ação de dentro tem a sua própria
 * permissão em `permissoes_catalogo` (tipo=acao, pilar=vendas).
 *
 * Fonte única dos slugs — o gate mora aqui, nunca duplicado por ponto de montagem.
 */
export function usePermissoesMesa() {
  const status = usePermissaoAcaoOuSuperAdmin("acao.mesa_definir_status");
  const link = usePermissaoAcaoOuSuperAdmin("acao.mesa_copiar_link");
  const nf = usePermissaoAcaoOuSuperAdmin("acao.mesa_baixar_nf");
  const boletos = usePermissaoAcaoOuSuperAdmin("acao.mesa_ver_boletos");
  const sops = usePermissaoAcaoOuSuperAdmin("acao.mesa_solicitar_sops");
  const verTodos = usePermissaoAcaoOuSuperAdmin("acao.mesa_ver_todos");
  const baixarBoleto = usePermissaoAcaoOuSuperAdmin("acao.mesa_baixar_boleto");

  return {
    podeDefinirStatus: status.permitido,
    podeCopiarLink: link.permitido,
    /** Uma permissão para PDF e XML de propósito: é a mesma nota. */
    podeBaixarNf: nf.permitido,
    podeVerBoletos: boletos.permitido,
    podeSolicitarSops: sops.permitido,
    /** Sem esta permissão a pessoa vê SOMENTE a própria carteira. */
    podeVerTodos: verTodos.permitido,
    /** Baixar o espelho PDF do boleto vigente direto da Mesa. */
    podeBaixarBoleto: baixarBoleto.permitido,
    carregando:
      status.carregando ||
      link.carregando ||
      nf.carregando ||
      boletos.carregando ||
      sops.carregando ||
      verTodos.carregando ||
      baixarBoleto.carregando,
  };
}
