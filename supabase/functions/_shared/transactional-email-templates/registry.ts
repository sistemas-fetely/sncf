/// <reference types="npm:@types/react@18.3.1" />
import * as React from 'npm:react@18.3.1'

export interface TemplateEntry {
  component: React.ComponentType<any>
  subject: string | ((data: Record<string, any>) => string)
  to?: string
  displayName?: string
  previewData?: Record<string, any>
}

import { template as nfPagamento } from './nf-pagamento.tsx'
import { template as boasVindasPortal } from './boas-vindas-portal.tsx'
import { template as avisoEmailPessoal } from './aviso-email-pessoal.tsx'
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
import { template as solicitacaoDocumento } from './solicitacao-documento.tsx'
import { template as pedidoEspelho } from './pedido-espelho.tsx'

export const TEMPLATES: Record<string, TemplateEntry> = {
  'nf-pagamento': nfPagamento,
  'boas-vindas-portal': boasVindasPortal,
  'aviso-email-pessoal': avisoEmailPessoal,
  'recuperacao-senha': recuperacaoSenha,
  'pagamento-solicitacao': pagamentoSolicitacao,
  'pacote-fiscal-contador': pacoteFiscalContador,
  'boleto-safra': boletoSafra,
  'cobranca-pedido': cobrancaPedido,
  'link-cobranca': linkCobranca,
  'catalogo-lojista': catalogoLojista,
  'nf-entrega': nfEntrega,
  'nf-entrega-boleto': nfEntregaBoleto,
  'regua-cobranca': reguaCobranca,
  'solicitacao-documento': solicitacaoDocumento,
  'pedido-espelho': pedidoEspelho,
}
