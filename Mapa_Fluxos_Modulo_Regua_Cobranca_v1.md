MAPA DE FLUXOS — MÓDULO RÉGUA DE COBRANÇA (COB-F3) Versão: v1.1 — APROVADO 14/07/2026 e IMPLEMENTADO na mesma data (Fatias 1-3).

CADÊNCIA PADRÃO FETELY (seedada em regua_cobranca_etapas, editável em /parametros): D-3 lembrete pré-vencimento amigável (email) | D+1 lembrete_amistoso (email) | D+3 segundo toque + oferta proativa de renegociação (whatsapp) | D+5 cobranca_ativa (telefone) | D+15 cobranca_formal (placeholder a calibrar) | D+30 pre_juridico (placeholder) | D+45 notificacao_extrajudicial (ativa=false) | D+60 protesto_solicitado (ativa=false) | D+90 juridico (ativa=false). Perfis bandeira_amarela e vip: sem linhas seedadas — caem em fallback padrão até calibração via CRUD. Precedência: bandeira_amarela > vip > padrao.

DECISÕES ARQUITETURAIS: C1 — Cartão FORA da régua (CARTAO-NASCE-GARANTIDO integral). C2 — flag_grupo_economico_inadimplente recalculada exclusivamente pelo materializador diário; escopo = grupo_economico_id do parceiro (parceiro sem grupo = escopo próprio); flag quando qualquer título do grupo está em pre_juridico ou pior. C3 — Materializador = função SQL fn_regua_materializar() agendada via pg_cron ('regua-cobranca-diaria', 03:00 BRT), idempotente: avança subestado_atraso, popula data_proxima_acao_regua (menor data de etapa ativa não logada), pula pausados, recalcula flag de grupo. SQL puro, sem edge (banco protege estado).

SUBESTADOS (CHECK em titulo_a_receber): em_dia, lembrete_amistoso, cobranca_ativa, cobranca_formal, pre_juridico, notificacao_extrajudicial, protesto_solicitado, juridico. Pré-vencimento nunca vira subestado — só agenda ação.

RENEGOCIAÇÃO (RPC renegociar_titulo): modalidade 2=parcelamento (N filhos), 3=troca_instrumento (1 filho, pix|transferencia). Modalidade 1=prorrogação roteia para o motor F2b (solicitar_prorrogacao_boleto). Original vira cancelado_recuperacao (terminal, nunca recebe pagamento); se boleto registrado, baixa_solicitada automática (boleto vivo no Safra morre na próxima remessa de baixa). Filhos: numero_titulo original-Rn, herdam conta_id/pedido_id/nf_id (RECEBIVEL-NASCE-PAREADO), titulo_renegociado_origem_id aponta ao original. Justificativa obrigatória >= 10 chars.

AÇÃO HUMANA (RPC registrar_acao_regua): insere log + recalcula próxima ação atomicamente. Resultados: enviada, pulada, pausou_regua (motivo >= 5 chars obrigatório — pausar não é esconder), abriu_renegociacao. despausar_regua_titulo reengata. NENHUM disparo automático de mensagem — UI registra que o humano executou por fora (SISTEMA-SUGERE/HUMANO-DECIDE).

SAÍDA: status_gestao na vw_titulos_cobranca v4 distingue pago (liquidação <= vencimento original), pago_com_atraso, pago_judicial (subestado juridico no pagamento).

PENDÊNCIAS DE CALIBRAÇÃO (primeiro caso real, com Mariana): dias das etapas D+15 em diante; papéis da faixa intermediária; cadências bandeira_amarela/vip; templates de mensagem; ativação de protesto/extrajudicial/jurídico se necessário.
