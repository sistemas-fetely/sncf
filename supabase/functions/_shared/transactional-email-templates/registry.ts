/// <reference types="npm:@types/react@18.3.1" />
import * as React from 'npm:react@18.3.1'

export interface TemplateEntry {
  component: React.ComponentType<any>
  subject: string | ((data: Record<string, any>) => string)
  to?: string
  displayName?: string
  previewData?: Record<string, any>
}

import { template as conviteCadastro } from './convite-cadastro.tsx'
import { template as cadastroRecebido } from './cadastro-recebido.tsx'
import { template as nfPagamento } from './nf-pagamento.tsx'
import { template as cadastroAprovado } from './cadastro-aprovado.tsx'
import { template as boasVindasPortal } from './boas-vindas-portal.tsx'
import { template as avisoEmailPessoal } from './aviso-email-pessoal.tsx'
import { template as candidaturaRecebida } from './candidatura-recebida.tsx'
import { template as solicitarPerfilCandidato } from './solicitar-perfil-candidato.tsx'
import { template as testeTecnicoCandidato } from './teste-tecnico-candidato.tsx'
import { template as testeTecnicoEntregue } from './teste-tecnico-entregue.tsx'
import { template as propostaCandidato } from './proposta-candidato.tsx'
import { template as cadastroDevolvido } from './cadastro-devolvido.tsx'
import { template as recuperacaoSenha } from './recuperacao-senha.tsx'
import { template as pagamentoSolicitacao } from './pagamento-solicitacao.tsx'
import { template as pacoteFiscalContador } from './pacote-fiscal-contador.tsx'
import { template as boletoSafra } from './boleto-safra.tsx'
import { template as cobrancaPedido } from './cobranca-pedido.tsx'
import { template as linkCobranca } from './link-cobranca.tsx'
import { template as catalogoLojista } from './catalogo-lojista.tsx'
import { template as nfEntrega } from './nf-entrega.tsx'
import { template as nfEntregaBoleto } from './nf-entrega-boleto.tsx'
import { template as reguaCobranca } from './regua-cobranca.tsx'

export const TEMPLATES: Record<string, TemplateEntry> = {
  'convite-cadastro': conviteCadastro,
  'cadastro-recebido': cadastroRecebido,
  'nf-pagamento': nfPagamento,
  'cadastro-aprovado': cadastroAprovado,
  'boas-vindas-portal': boasVindasPortal,
  'aviso-email-pessoal': avisoEmailPessoal,
  'candidatura-recebida': candidaturaRecebida,
  'solicitar-perfil-candidato': solicitarPerfilCandidato,
  'teste-tecnico-candidato': testeTecnicoCandidato,
  'teste-tecnico-entregue': testeTecnicoEntregue,
  'proposta-candidato': propostaCandidato,
  'cadastro-devolvido': cadastroDevolvido,
  'recuperacao-senha': recuperacaoSenha,
  'pagamento-solicitacao': pagamentoSolicitacao,
  'pacote-fiscal-contador': pacoteFiscalContador,
  'boleto-safra': boletoSafra,
  'cobranca-pedido': cobrancaPedido,
  'link-cobranca': linkCobranca,
  'catalogo-lojista': catalogoLojista,
  'nf-entrega': nfEntrega,
  'nf-entrega-boleto': nfEntregaBoleto,
}
