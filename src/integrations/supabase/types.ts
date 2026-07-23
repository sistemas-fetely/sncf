export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      acesso_dados_log: {
        Row: {
          alvo_nome: string | null
          alvo_user_id: string | null
          contexto: string | null
          created_at: string
          em_lote: boolean | null
          id: string
          ip_origem: string | null
          justificativa: string | null
          quantidade_alvos: number | null
          registro_id: string | null
          tabela_origem: string | null
          tipo_dado: string
          user_id: string | null
          user_nome: string | null
        }
        Insert: {
          alvo_nome?: string | null
          alvo_user_id?: string | null
          contexto?: string | null
          created_at?: string
          em_lote?: boolean | null
          id?: string
          ip_origem?: string | null
          justificativa?: string | null
          quantidade_alvos?: number | null
          registro_id?: string | null
          tabela_origem?: string | null
          tipo_dado: string
          user_id?: string | null
          user_nome?: string | null
        }
        Update: {
          alvo_nome?: string | null
          alvo_user_id?: string | null
          contexto?: string | null
          created_at?: string
          em_lote?: boolean | null
          id?: string
          ip_origem?: string | null
          justificativa?: string | null
          quantidade_alvos?: number | null
          registro_id?: string | null
          tabela_origem?: string | null
          tipo_dado?: string
          user_id?: string | null
          user_nome?: string | null
        }
        Relationships: []
      }
      analise_credito_scores: {
        Row: {
          analise_id: string
          anexado_em: string
          anexado_por: string | null
          dados_extraidos_json: Json | null
          data_consulta: string
          documento_storage_path: string | null
          extraido_em: string | null
          flag_acoes_judiciais: boolean | null
          flag_cheque_devolvido: boolean | null
          flag_divida_vencida: boolean | null
          flag_falencia_rj: boolean | null
          flag_pefin: boolean | null
          flag_protestos: boolean | null
          flag_refin: boolean | null
          fonte: string
          id: string
          parceiro_id: string
          score_categorico: string | null
          score_numerico: number | null
          total_dividas: number | null
        }
        Insert: {
          analise_id: string
          anexado_em?: string
          anexado_por?: string | null
          dados_extraidos_json?: Json | null
          data_consulta: string
          documento_storage_path?: string | null
          extraido_em?: string | null
          flag_acoes_judiciais?: boolean | null
          flag_cheque_devolvido?: boolean | null
          flag_divida_vencida?: boolean | null
          flag_falencia_rj?: boolean | null
          flag_pefin?: boolean | null
          flag_protestos?: boolean | null
          flag_refin?: boolean | null
          fonte: string
          id?: string
          parceiro_id: string
          score_categorico?: string | null
          score_numerico?: number | null
          total_dividas?: number | null
        }
        Update: {
          analise_id?: string
          anexado_em?: string
          anexado_por?: string | null
          dados_extraidos_json?: Json | null
          data_consulta?: string
          documento_storage_path?: string | null
          extraido_em?: string | null
          flag_acoes_judiciais?: boolean | null
          flag_cheque_devolvido?: boolean | null
          flag_divida_vencida?: boolean | null
          flag_falencia_rj?: boolean | null
          flag_pefin?: boolean | null
          flag_protestos?: boolean | null
          flag_refin?: boolean | null
          fonte?: string
          id?: string
          parceiro_id?: string
          score_categorico?: string | null
          score_numerico?: number | null
          total_dividas?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "analise_credito_scores_analise_id_fkey"
            columns: ["analise_id"]
            isOneToOne: false
            referencedRelation: "analises_credito"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "analise_credito_scores_analise_id_fkey"
            columns: ["analise_id"]
            isOneToOne: false
            referencedRelation: "v_pedidos_fila"
            referencedColumns: ["analise_credito_id"]
          },
          {
            foreignKeyName: "analise_credito_scores_parceiro_id_fkey"
            columns: ["parceiro_id"]
            isOneToOne: false
            referencedRelation: "parceiros_comerciais"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "analise_credito_scores_parceiro_id_fkey"
            columns: ["parceiro_id"]
            isOneToOne: false
            referencedRelation: "v_credito_resumo_financeiro"
            referencedColumns: ["parceiro_id"]
          },
          {
            foreignKeyName: "analise_credito_scores_parceiro_id_fkey"
            columns: ["parceiro_id"]
            isOneToOne: false
            referencedRelation: "vw_logistica_agregado"
            referencedColumns: ["transportadora_id"]
          },
          {
            foreignKeyName: "analise_credito_scores_parceiro_id_fkey"
            columns: ["parceiro_id"]
            isOneToOne: false
            referencedRelation: "vw_recebivel_por_conta"
            referencedColumns: ["conta_id"]
          },
        ]
      }
      analise_credito_transicoes: {
        Row: {
          acao: string
          analise_id: string
          criado_em: string
          delta_ia: Json | null
          estagio_destino: string | null
          estagio_origem: string | null
          id: string
          motivo: string | null
          usuario_id: string | null
        }
        Insert: {
          acao: string
          analise_id: string
          criado_em?: string
          delta_ia?: Json | null
          estagio_destino?: string | null
          estagio_origem?: string | null
          id?: string
          motivo?: string | null
          usuario_id?: string | null
        }
        Update: {
          acao?: string
          analise_id?: string
          criado_em?: string
          delta_ia?: Json | null
          estagio_destino?: string | null
          estagio_origem?: string | null
          id?: string
          motivo?: string | null
          usuario_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "analise_credito_transicoes_analise_id_fkey"
            columns: ["analise_id"]
            isOneToOne: false
            referencedRelation: "analises_credito"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "analise_credito_transicoes_analise_id_fkey"
            columns: ["analise_id"]
            isOneToOne: false
            referencedRelation: "v_pedidos_fila"
            referencedColumns: ["analise_credito_id"]
          },
        ]
      }
      analises_credito: {
        Row: {
          analise_anterior_id: string | null
          analise_ia_confianca: number | null
          analise_ia_json: Json | null
          analise_ia_processada_em: string | null
          analise_ia_resumo: string | null
          condicao_final_aprovada: Json | null
          criado_em: string
          decidido_em: string | null
          decidido_por: string | null
          encaminhado_analise_em: string | null
          encaminhado_decisao_em: string | null
          estagio_atual: string
          exige_portao: boolean
          formas_aceitas: string[] | null
          id: string
          limite_concedido: number | null
          parceiro_id: string
          parecer_final: string | null
          pedido_id: string
          perfil_aplicado: string | null
          prazo_max_dias: number | null
          pre_aprovacao_em: string | null
          pre_aprovacao_payload: Json | null
          pre_aprovado_regra_id: string | null
          ressalva: string | null
          status_final: string | null
          validade_ate: string | null
        }
        Insert: {
          analise_anterior_id?: string | null
          analise_ia_confianca?: number | null
          analise_ia_json?: Json | null
          analise_ia_processada_em?: string | null
          analise_ia_resumo?: string | null
          condicao_final_aprovada?: Json | null
          criado_em?: string
          decidido_em?: string | null
          decidido_por?: string | null
          encaminhado_analise_em?: string | null
          encaminhado_decisao_em?: string | null
          estagio_atual?: string
          exige_portao?: boolean
          formas_aceitas?: string[] | null
          id?: string
          limite_concedido?: number | null
          parceiro_id: string
          parecer_final?: string | null
          pedido_id: string
          perfil_aplicado?: string | null
          prazo_max_dias?: number | null
          pre_aprovacao_em?: string | null
          pre_aprovacao_payload?: Json | null
          pre_aprovado_regra_id?: string | null
          ressalva?: string | null
          status_final?: string | null
          validade_ate?: string | null
        }
        Update: {
          analise_anterior_id?: string | null
          analise_ia_confianca?: number | null
          analise_ia_json?: Json | null
          analise_ia_processada_em?: string | null
          analise_ia_resumo?: string | null
          condicao_final_aprovada?: Json | null
          criado_em?: string
          decidido_em?: string | null
          decidido_por?: string | null
          encaminhado_analise_em?: string | null
          encaminhado_decisao_em?: string | null
          estagio_atual?: string
          exige_portao?: boolean
          formas_aceitas?: string[] | null
          id?: string
          limite_concedido?: number | null
          parceiro_id?: string
          parecer_final?: string | null
          pedido_id?: string
          perfil_aplicado?: string | null
          prazo_max_dias?: number | null
          pre_aprovacao_em?: string | null
          pre_aprovacao_payload?: Json | null
          pre_aprovado_regra_id?: string | null
          ressalva?: string | null
          status_final?: string | null
          validade_ate?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "analises_credito_analise_anterior_id_fkey"
            columns: ["analise_anterior_id"]
            isOneToOne: false
            referencedRelation: "analises_credito"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "analises_credito_analise_anterior_id_fkey"
            columns: ["analise_anterior_id"]
            isOneToOne: false
            referencedRelation: "v_pedidos_fila"
            referencedColumns: ["analise_credito_id"]
          },
          {
            foreignKeyName: "analises_credito_parceiro_id_fkey"
            columns: ["parceiro_id"]
            isOneToOne: false
            referencedRelation: "parceiros_comerciais"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "analises_credito_parceiro_id_fkey"
            columns: ["parceiro_id"]
            isOneToOne: false
            referencedRelation: "v_credito_resumo_financeiro"
            referencedColumns: ["parceiro_id"]
          },
          {
            foreignKeyName: "analises_credito_parceiro_id_fkey"
            columns: ["parceiro_id"]
            isOneToOne: false
            referencedRelation: "vw_logistica_agregado"
            referencedColumns: ["transportadora_id"]
          },
          {
            foreignKeyName: "analises_credito_parceiro_id_fkey"
            columns: ["parceiro_id"]
            isOneToOne: false
            referencedRelation: "vw_recebivel_por_conta"
            referencedColumns: ["conta_id"]
          },
          {
            foreignKeyName: "analises_credito_pedido_id_fkey"
            columns: ["pedido_id"]
            isOneToOne: false
            referencedRelation: "pedidos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "analises_credito_pedido_id_fkey"
            columns: ["pedido_id"]
            isOneToOne: false
            referencedRelation: "v_pedidos_fila"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "analises_credito_pedido_id_fkey"
            columns: ["pedido_id"]
            isOneToOne: false
            referencedRelation: "v_pedidos_priorizados"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "analises_credito_pedido_id_fkey"
            columns: ["pedido_id"]
            isOneToOne: false
            referencedRelation: "vw_gestao_pedidos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "analises_credito_pedido_id_fkey"
            columns: ["pedido_id"]
            isOneToOne: false
            referencedRelation: "vw_pedido_base"
            referencedColumns: ["pedido_id"]
          },
          {
            foreignKeyName: "analises_credito_pedido_id_fkey"
            columns: ["pedido_id"]
            isOneToOne: false
            referencedRelation: "vw_pedidos_farol"
            referencedColumns: ["pedido_id"]
          },
          {
            foreignKeyName: "analises_credito_pre_aprovado_regra_id_fkey"
            columns: ["pre_aprovado_regra_id"]
            isOneToOne: false
            referencedRelation: "regras_cadencia_credito"
            referencedColumns: ["id"]
          },
        ]
      }
      atribuicao_origem: {
        Row: {
          atribuicao_id: string
          criado_em: string
          origem: string
          template_id: string | null
        }
        Insert: {
          atribuicao_id: string
          criado_em?: string
          origem: string
          template_id?: string | null
        }
        Update: {
          atribuicao_id?: string
          criado_em?: string
          origem?: string
          template_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "atribuicao_origem_atribuicao_id_fkey"
            columns: ["atribuicao_id"]
            isOneToOne: true
            referencedRelation: "user_atribuicoes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "atribuicao_origem_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "cargo_template"
            referencedColumns: ["id"]
          },
        ]
      }
      audit_log: {
        Row: {
          acao: string
          created_at: string
          dados_antes: Json | null
          dados_depois: Json | null
          id: string
          ip_origem: string | null
          justificativa: string | null
          registro_id: string | null
          tabela: string
          user_agent: string | null
          user_email: string | null
          user_id: string | null
          user_nome: string | null
        }
        Insert: {
          acao: string
          created_at?: string
          dados_antes?: Json | null
          dados_depois?: Json | null
          id?: string
          ip_origem?: string | null
          justificativa?: string | null
          registro_id?: string | null
          tabela: string
          user_agent?: string | null
          user_email?: string | null
          user_id?: string | null
          user_nome?: string | null
        }
        Update: {
          acao?: string
          created_at?: string
          dados_antes?: Json | null
          dados_depois?: Json | null
          id?: string
          ip_origem?: string | null
          justificativa?: string | null
          registro_id?: string | null
          tabela?: string
          user_agent?: string | null
          user_email?: string | null
          user_id?: string | null
          user_nome?: string | null
        }
        Relationships: []
      }
      auditoria_duplicidade_suspeita: {
        Row: {
          compromisso_existente_id: string | null
          created_at: string
          data_primeira_parcela: string
          id: string
          janela_segundos: number
          observacao: string | null
          parceiro_id: string | null
          parcela_grupo_novo: string
          revisado_em: string | null
          revisado_por: string | null
          valor_total: number
        }
        Insert: {
          compromisso_existente_id?: string | null
          created_at?: string
          data_primeira_parcela: string
          id?: string
          janela_segundos: number
          observacao?: string | null
          parceiro_id?: string | null
          parcela_grupo_novo: string
          revisado_em?: string | null
          revisado_por?: string | null
          valor_total: number
        }
        Update: {
          compromisso_existente_id?: string | null
          created_at?: string
          data_primeira_parcela?: string
          id?: string
          janela_segundos?: number
          observacao?: string | null
          parceiro_id?: string | null
          parcela_grupo_novo?: string
          revisado_em?: string | null
          revisado_por?: string | null
          valor_total?: number
        }
        Relationships: [
          {
            foreignKeyName: "auditoria_duplicidade_suspeita_compromisso_existente_id_fkey"
            columns: ["compromisso_existente_id"]
            isOneToOne: false
            referencedRelation: "compromissos_parcelados"
            referencedColumns: ["id"]
          },
        ]
      }
      auditoria_resumo_nfe_falhas: {
        Row: {
          contexto: Json | null
          created_at: string
          erro: string
          id: string
          nfs_stage_id: string
          tentativa: number
        }
        Insert: {
          contexto?: Json | null
          created_at?: string
          erro: string
          id?: string
          nfs_stage_id: string
          tentativa?: number
        }
        Update: {
          contexto?: Json | null
          created_at?: string
          erro?: string
          id?: string
          nfs_stage_id?: string
          tentativa?: number
        }
        Relationships: [
          {
            foreignKeyName: "auditoria_resumo_nfe_falhas_nfs_stage_id_fkey"
            columns: ["nfs_stage_id"]
            isOneToOne: false
            referencedRelation: "nfs_stage"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "auditoria_resumo_nfe_falhas_nfs_stage_id_fkey"
            columns: ["nfs_stage_id"]
            isOneToOne: false
            referencedRelation: "vw_conciliacao_furos"
            referencedColumns: ["sugestao_stage_id"]
          },
          {
            foreignKeyName: "auditoria_resumo_nfe_falhas_nfs_stage_id_fkey"
            columns: ["nfs_stage_id"]
            isOneToOne: false
            referencedRelation: "vw_contas_pagar_consolidado"
            referencedColumns: ["nf_stage_id"]
          },
          {
            foreignKeyName: "auditoria_resumo_nfe_falhas_nfs_stage_id_fkey"
            columns: ["nfs_stage_id"]
            isOneToOne: false
            referencedRelation: "vw_despesas_match_nf_sugestoes"
            referencedColumns: ["stage_id"]
          },
          {
            foreignKeyName: "auditoria_resumo_nfe_falhas_nfs_stage_id_fkey"
            columns: ["nfs_stage_id"]
            isOneToOne: false
            referencedRelation: "vw_documentos_envio_estados"
            referencedColumns: ["nf_stage_id"]
          },
          {
            foreignKeyName: "auditoria_resumo_nfe_falhas_nfs_stage_id_fkey"
            columns: ["nfs_stage_id"]
            isOneToOne: false
            referencedRelation: "vw_nf_vinculo_pessoa"
            referencedColumns: ["stage_id"]
          },
          {
            foreignKeyName: "auditoria_resumo_nfe_falhas_nfs_stage_id_fkey"
            columns: ["nfs_stage_id"]
            isOneToOne: false
            referencedRelation: "vw_nfs_stage_completude"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "auditoria_resumo_nfe_falhas_nfs_stage_id_fkey"
            columns: ["nfs_stage_id"]
            isOneToOne: false
            referencedRelation: "vw_pj_notas_fiscais"
            referencedColumns: ["nf_id"]
          },
        ]
      }
      backup_cpr_fantasma_20260620: {
        Row: {
          aprovado_em: string | null
          aprovado_por: string | null
          bkp_classe: string | null
          bkp_em: string | null
          bkp_id_externo: string | null
          bkp_motivo: string | null
          bling_id: string | null
          boleto_avulso_justificativa: string | null
          canal_venda_id: string | null
          cartao_id: string | null
          categoria_confirmada: boolean | null
          categoria_sugerida_ia: boolean | null
          centro_custo_id: string | null
          compra_registrada_id: string | null
          compromisso_parcelado_id: string | null
          compromisso_recorrente_id: string | null
          comprovante_url: string | null
          conciliado_em: string | null
          conciliado_por: string | null
          created_at: string | null
          criado_por: string | null
          dados_bancarios_fornecedor: Json | null
          dados_enriquecidos_qive: boolean | null
          dados_pagamento_fornecedor: Json | null
          data_compra: string | null
          data_pagamento: string | null
          data_vencimento: string | null
          deleted_at: string | null
          deleted_por: string | null
          descricao: string | null
          docs_status: string | null
          editado_em: string | null
          editado_por: string | null
          email_pagamento_enviado: boolean | null
          enviado_pagamento_em: string | null
          enviado_pagamento_por: string | null
          forma_pagamento_id: string | null
          fornecedor_cliente: string | null
          fornecedor_id: string | null
          id: string | null
          linha_investimento_id: string | null
          meio_pagamento_id: string | null
          movimentacao_bancaria_id: string | null
          nf_aplicavel: boolean | null
          nf_aplicavel_motivo: string | null
          nf_cfop: string | null
          nf_chave_acesso: string | null
          nf_cnpj_emitente: string | null
          nf_data_emissao: string | null
          nf_natureza_operacao: string | null
          nf_ncm: string | null
          nf_numero: string | null
          nf_pdf_url: string | null
          nf_serie: string | null
          nf_valor_impostos: number | null
          nf_valor_produtos: number | null
          nf_xml_url: string | null
          nfs_stage_documento_id: string | null
          numero_parcela: number | null
          observacao: string | null
          observacao_pagamento: string | null
          observacao_pagamento_manual: string | null
          origem: string | null
          pagamento_com_pendencia: boolean | null
          pago_em: string | null
          pago_em_conta_id: string | null
          pago_por: string | null
          parceiro_id: string | null
          parcela_atual: number | null
          parcela_grupo_id: string | null
          parcelas: number | null
          pasta_contrato_id: string | null
          pasta_contrato_parcela_id: string | null
          pedido_compra_id: string | null
          pendencias_no_envio: string[] | null
          plano_contas_id: string | null
          reembolsa_user_id: string | null
          sla_aprovacao_dias: number | null
          sla_pagamento_dias: number | null
          status: string | null
          tags: Json | null
          tarefa_id: string | null
          tem_sugestao_nf: boolean | null
          tipo: string | null
          total_parcelas: number | null
          unidade_id: string | null
          updated_at: string | null
          valor: number | null
          valor_nf_vinculado: number | null
          valor_original_item: number | null
          valor_pago: number | null
          vinculo_nf_completo: boolean | null
        }
        Insert: {
          aprovado_em?: string | null
          aprovado_por?: string | null
          bkp_classe?: string | null
          bkp_em?: string | null
          bkp_id_externo?: string | null
          bkp_motivo?: string | null
          bling_id?: string | null
          boleto_avulso_justificativa?: string | null
          canal_venda_id?: string | null
          cartao_id?: string | null
          categoria_confirmada?: boolean | null
          categoria_sugerida_ia?: boolean | null
          centro_custo_id?: string | null
          compra_registrada_id?: string | null
          compromisso_parcelado_id?: string | null
          compromisso_recorrente_id?: string | null
          comprovante_url?: string | null
          conciliado_em?: string | null
          conciliado_por?: string | null
          created_at?: string | null
          criado_por?: string | null
          dados_bancarios_fornecedor?: Json | null
          dados_enriquecidos_qive?: boolean | null
          dados_pagamento_fornecedor?: Json | null
          data_compra?: string | null
          data_pagamento?: string | null
          data_vencimento?: string | null
          deleted_at?: string | null
          deleted_por?: string | null
          descricao?: string | null
          docs_status?: string | null
          editado_em?: string | null
          editado_por?: string | null
          email_pagamento_enviado?: boolean | null
          enviado_pagamento_em?: string | null
          enviado_pagamento_por?: string | null
          forma_pagamento_id?: string | null
          fornecedor_cliente?: string | null
          fornecedor_id?: string | null
          id?: string | null
          linha_investimento_id?: string | null
          meio_pagamento_id?: string | null
          movimentacao_bancaria_id?: string | null
          nf_aplicavel?: boolean | null
          nf_aplicavel_motivo?: string | null
          nf_cfop?: string | null
          nf_chave_acesso?: string | null
          nf_cnpj_emitente?: string | null
          nf_data_emissao?: string | null
          nf_natureza_operacao?: string | null
          nf_ncm?: string | null
          nf_numero?: string | null
          nf_pdf_url?: string | null
          nf_serie?: string | null
          nf_valor_impostos?: number | null
          nf_valor_produtos?: number | null
          nf_xml_url?: string | null
          nfs_stage_documento_id?: string | null
          numero_parcela?: number | null
          observacao?: string | null
          observacao_pagamento?: string | null
          observacao_pagamento_manual?: string | null
          origem?: string | null
          pagamento_com_pendencia?: boolean | null
          pago_em?: string | null
          pago_em_conta_id?: string | null
          pago_por?: string | null
          parceiro_id?: string | null
          parcela_atual?: number | null
          parcela_grupo_id?: string | null
          parcelas?: number | null
          pasta_contrato_id?: string | null
          pasta_contrato_parcela_id?: string | null
          pedido_compra_id?: string | null
          pendencias_no_envio?: string[] | null
          plano_contas_id?: string | null
          reembolsa_user_id?: string | null
          sla_aprovacao_dias?: number | null
          sla_pagamento_dias?: number | null
          status?: string | null
          tags?: Json | null
          tarefa_id?: string | null
          tem_sugestao_nf?: boolean | null
          tipo?: string | null
          total_parcelas?: number | null
          unidade_id?: string | null
          updated_at?: string | null
          valor?: number | null
          valor_nf_vinculado?: number | null
          valor_original_item?: number | null
          valor_pago?: number | null
          vinculo_nf_completo?: boolean | null
        }
        Update: {
          aprovado_em?: string | null
          aprovado_por?: string | null
          bkp_classe?: string | null
          bkp_em?: string | null
          bkp_id_externo?: string | null
          bkp_motivo?: string | null
          bling_id?: string | null
          boleto_avulso_justificativa?: string | null
          canal_venda_id?: string | null
          cartao_id?: string | null
          categoria_confirmada?: boolean | null
          categoria_sugerida_ia?: boolean | null
          centro_custo_id?: string | null
          compra_registrada_id?: string | null
          compromisso_parcelado_id?: string | null
          compromisso_recorrente_id?: string | null
          comprovante_url?: string | null
          conciliado_em?: string | null
          conciliado_por?: string | null
          created_at?: string | null
          criado_por?: string | null
          dados_bancarios_fornecedor?: Json | null
          dados_enriquecidos_qive?: boolean | null
          dados_pagamento_fornecedor?: Json | null
          data_compra?: string | null
          data_pagamento?: string | null
          data_vencimento?: string | null
          deleted_at?: string | null
          deleted_por?: string | null
          descricao?: string | null
          docs_status?: string | null
          editado_em?: string | null
          editado_por?: string | null
          email_pagamento_enviado?: boolean | null
          enviado_pagamento_em?: string | null
          enviado_pagamento_por?: string | null
          forma_pagamento_id?: string | null
          fornecedor_cliente?: string | null
          fornecedor_id?: string | null
          id?: string | null
          linha_investimento_id?: string | null
          meio_pagamento_id?: string | null
          movimentacao_bancaria_id?: string | null
          nf_aplicavel?: boolean | null
          nf_aplicavel_motivo?: string | null
          nf_cfop?: string | null
          nf_chave_acesso?: string | null
          nf_cnpj_emitente?: string | null
          nf_data_emissao?: string | null
          nf_natureza_operacao?: string | null
          nf_ncm?: string | null
          nf_numero?: string | null
          nf_pdf_url?: string | null
          nf_serie?: string | null
          nf_valor_impostos?: number | null
          nf_valor_produtos?: number | null
          nf_xml_url?: string | null
          nfs_stage_documento_id?: string | null
          numero_parcela?: number | null
          observacao?: string | null
          observacao_pagamento?: string | null
          observacao_pagamento_manual?: string | null
          origem?: string | null
          pagamento_com_pendencia?: boolean | null
          pago_em?: string | null
          pago_em_conta_id?: string | null
          pago_por?: string | null
          parceiro_id?: string | null
          parcela_atual?: number | null
          parcela_grupo_id?: string | null
          parcelas?: number | null
          pasta_contrato_id?: string | null
          pasta_contrato_parcela_id?: string | null
          pedido_compra_id?: string | null
          pendencias_no_envio?: string[] | null
          plano_contas_id?: string | null
          reembolsa_user_id?: string | null
          sla_aprovacao_dias?: number | null
          sla_pagamento_dias?: number | null
          status?: string | null
          tags?: Json | null
          tarefa_id?: string | null
          tem_sugestao_nf?: boolean | null
          tipo?: string | null
          total_parcelas?: number | null
          unidade_id?: string | null
          updated_at?: string | null
          valor?: number | null
          valor_nf_vinculado?: number | null
          valor_original_item?: number | null
          valor_pago?: number | null
          vinculo_nf_completo?: boolean | null
        }
        Relationships: []
      }
      banco_recebimento: {
        Row: {
          ativo: boolean
          created_at: string
          id: string
          nome: string
          updated_at: string
        }
        Insert: {
          ativo?: boolean
          created_at?: string
          id?: string
          nome: string
          updated_at?: string
        }
        Update: {
          ativo?: boolean
          created_at?: string
          id?: string
          nome?: string
          updated_at?: string
        }
        Relationships: []
      }
      beneficios_catalogo: {
        Row: {
          ativo: boolean | null
          beneficio: string
          created_at: string | null
          criado_por: string | null
          id: string
          tipo: string
          updated_at: string
        }
        Insert: {
          ativo?: boolean | null
          beneficio: string
          created_at?: string | null
          criado_por?: string | null
          id?: string
          tipo?: string
          updated_at?: string
        }
        Update: {
          ativo?: boolean | null
          beneficio?: string
          created_at?: string | null
          criado_por?: string | null
          id?: string
          tipo?: string
          updated_at?: string
        }
        Relationships: []
      }
      bling_contatos_log: {
        Row: {
          acionado_por: string | null
          bling_id_retornado: string | null
          duracao_ms: number | null
          erro_msg: string | null
          id: string
          origem: string
          parceiro_id: string
          payload_enviado: Json | null
          resposta_body: Json | null
          resposta_status: number | null
          sucesso: boolean
          tentativa_em: string
        }
        Insert: {
          acionado_por?: string | null
          bling_id_retornado?: string | null
          duracao_ms?: number | null
          erro_msg?: string | null
          id?: string
          origem: string
          parceiro_id: string
          payload_enviado?: Json | null
          resposta_body?: Json | null
          resposta_status?: number | null
          sucesso?: boolean
          tentativa_em?: string
        }
        Update: {
          acionado_por?: string | null
          bling_id_retornado?: string | null
          duracao_ms?: number | null
          erro_msg?: string | null
          id?: string
          origem?: string
          parceiro_id?: string
          payload_enviado?: Json | null
          resposta_body?: Json | null
          resposta_status?: number | null
          sucesso?: boolean
          tentativa_em?: string
        }
        Relationships: [
          {
            foreignKeyName: "bling_contatos_log_parceiro_id_fkey"
            columns: ["parceiro_id"]
            isOneToOne: false
            referencedRelation: "parceiros_comerciais"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bling_contatos_log_parceiro_id_fkey"
            columns: ["parceiro_id"]
            isOneToOne: false
            referencedRelation: "v_credito_resumo_financeiro"
            referencedColumns: ["parceiro_id"]
          },
          {
            foreignKeyName: "bling_contatos_log_parceiro_id_fkey"
            columns: ["parceiro_id"]
            isOneToOne: false
            referencedRelation: "vw_logistica_agregado"
            referencedColumns: ["transportadora_id"]
          },
          {
            foreignKeyName: "bling_contatos_log_parceiro_id_fkey"
            columns: ["parceiro_id"]
            isOneToOne: false
            referencedRelation: "vw_recebivel_por_conta"
            referencedColumns: ["conta_id"]
          },
        ]
      }
      bling_envios_log: {
        Row: {
          bling_id_retornado: number | null
          duracao_ms: number | null
          enviado_por: string | null
          erro_msg: string | null
          id: string
          payload_enviado: Json
          pedido_id: string
          resposta_body: Json | null
          resposta_status: number | null
          sucesso: boolean
          tentativa_em: string
        }
        Insert: {
          bling_id_retornado?: number | null
          duracao_ms?: number | null
          enviado_por?: string | null
          erro_msg?: string | null
          id?: string
          payload_enviado: Json
          pedido_id: string
          resposta_body?: Json | null
          resposta_status?: number | null
          sucesso?: boolean
          tentativa_em?: string
        }
        Update: {
          bling_id_retornado?: number | null
          duracao_ms?: number | null
          enviado_por?: string | null
          erro_msg?: string | null
          id?: string
          payload_enviado?: Json
          pedido_id?: string
          resposta_body?: Json | null
          resposta_status?: number | null
          sucesso?: boolean
          tentativa_em?: string
        }
        Relationships: [
          {
            foreignKeyName: "bling_envios_log_pedido_id_fkey"
            columns: ["pedido_id"]
            isOneToOne: false
            referencedRelation: "pedidos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bling_envios_log_pedido_id_fkey"
            columns: ["pedido_id"]
            isOneToOne: false
            referencedRelation: "v_pedidos_fila"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bling_envios_log_pedido_id_fkey"
            columns: ["pedido_id"]
            isOneToOne: false
            referencedRelation: "v_pedidos_priorizados"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bling_envios_log_pedido_id_fkey"
            columns: ["pedido_id"]
            isOneToOne: false
            referencedRelation: "vw_gestao_pedidos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bling_envios_log_pedido_id_fkey"
            columns: ["pedido_id"]
            isOneToOne: false
            referencedRelation: "vw_pedido_base"
            referencedColumns: ["pedido_id"]
          },
          {
            foreignKeyName: "bling_envios_log_pedido_id_fkey"
            columns: ["pedido_id"]
            isOneToOne: false
            referencedRelation: "vw_pedidos_farol"
            referencedColumns: ["pedido_id"]
          },
        ]
      }
      bling_produtos_cache: {
        Row: {
          atualizado_em: string | null
          bling_produto_id: number
          criado_em: string | null
          id: string
          nome: string | null
          sku: string
        }
        Insert: {
          atualizado_em?: string | null
          bling_produto_id: number
          criado_em?: string | null
          id?: string
          nome?: string | null
          sku: string
        }
        Update: {
          atualizado_em?: string | null
          bling_produto_id?: number
          criado_em?: string | null
          id?: string
          nome?: string | null
          sku?: string
        }
        Relationships: []
      }
      bling_situacoes: {
        Row: {
          ativo: boolean | null
          bling_situacao_id: number | null
          cor: string | null
          created_at: string | null
          id: string
          id_modulo: number | null
          modulo_nome: string | null
          nome: string | null
          raw: Json | null
          updated_at: string | null
          valor: number | null
        }
        Insert: {
          ativo?: boolean | null
          bling_situacao_id?: number | null
          cor?: string | null
          created_at?: string | null
          id?: string
          id_modulo?: number | null
          modulo_nome?: string | null
          nome?: string | null
          raw?: Json | null
          updated_at?: string | null
          valor?: number | null
        }
        Update: {
          ativo?: boolean | null
          bling_situacao_id?: number | null
          cor?: string | null
          created_at?: string | null
          id?: string
          id_modulo?: number | null
          modulo_nome?: string | null
          nome?: string | null
          raw?: Json | null
          updated_at?: string | null
          valor?: number | null
        }
        Relationships: []
      }
      boleto_stage: {
        Row: {
          ancorado_em: string | null
          ancorado_por: string | null
          beneficiario_cnpj: string | null
          beneficiario_nome: string | null
          codigo_barras: string | null
          contas_pagar_receber_id: string | null
          cpr_match_candidatos: Json | null
          created_at: string
          criado_por: string | null
          ged_documento_id: string
          id: string
          linha_digitavel: string | null
          metadados_parse: Json | null
          pagador_cnpj: string | null
          pagador_nome: string | null
          parceiro_id: string | null
          pasta_contrato_id: string | null
          status: string
          updated_at: string
          valor: number | null
          vencimento: string | null
        }
        Insert: {
          ancorado_em?: string | null
          ancorado_por?: string | null
          beneficiario_cnpj?: string | null
          beneficiario_nome?: string | null
          codigo_barras?: string | null
          contas_pagar_receber_id?: string | null
          cpr_match_candidatos?: Json | null
          created_at?: string
          criado_por?: string | null
          ged_documento_id: string
          id?: string
          linha_digitavel?: string | null
          metadados_parse?: Json | null
          pagador_cnpj?: string | null
          pagador_nome?: string | null
          parceiro_id?: string | null
          pasta_contrato_id?: string | null
          status?: string
          updated_at?: string
          valor?: number | null
          vencimento?: string | null
        }
        Update: {
          ancorado_em?: string | null
          ancorado_por?: string | null
          beneficiario_cnpj?: string | null
          beneficiario_nome?: string | null
          codigo_barras?: string | null
          contas_pagar_receber_id?: string | null
          cpr_match_candidatos?: Json | null
          created_at?: string
          criado_por?: string | null
          ged_documento_id?: string
          id?: string
          linha_digitavel?: string | null
          metadados_parse?: Json | null
          pagador_cnpj?: string | null
          pagador_nome?: string | null
          parceiro_id?: string | null
          pasta_contrato_id?: string | null
          status?: string
          updated_at?: string
          valor?: number | null
          vencimento?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "boleto_stage_contas_pagar_receber_id_fkey"
            columns: ["contas_pagar_receber_id"]
            isOneToOne: false
            referencedRelation: "contas_pagar"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "boleto_stage_contas_pagar_receber_id_fkey"
            columns: ["contas_pagar_receber_id"]
            isOneToOne: false
            referencedRelation: "contas_pagar_receber"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "boleto_stage_contas_pagar_receber_id_fkey"
            columns: ["contas_pagar_receber_id"]
            isOneToOne: false
            referencedRelation: "contas_pagar_receber_ativas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "boleto_stage_contas_pagar_receber_id_fkey"
            columns: ["contas_pagar_receber_id"]
            isOneToOne: false
            referencedRelation: "v_cpr_bola_redonda"
            referencedColumns: ["cpr_id"]
          },
          {
            foreignKeyName: "boleto_stage_contas_pagar_receber_id_fkey"
            columns: ["contas_pagar_receber_id"]
            isOneToOne: false
            referencedRelation: "vw_conciliacao_furos"
            referencedColumns: ["sugestao_cpr_id"]
          },
          {
            foreignKeyName: "boleto_stage_contas_pagar_receber_id_fkey"
            columns: ["contas_pagar_receber_id"]
            isOneToOne: false
            referencedRelation: "vw_contas_pagar_consolidado"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "boleto_stage_contas_pagar_receber_id_fkey"
            columns: ["contas_pagar_receber_id"]
            isOneToOne: false
            referencedRelation: "vw_despesas_match_sugestoes"
            referencedColumns: ["cpr_id"]
          },
          {
            foreignKeyName: "boleto_stage_contas_pagar_receber_id_fkey"
            columns: ["contas_pagar_receber_id"]
            isOneToOne: false
            referencedRelation: "vw_documentos_envio_estados"
            referencedColumns: ["conta_id"]
          },
          {
            foreignKeyName: "boleto_stage_contas_pagar_receber_id_fkey"
            columns: ["contas_pagar_receber_id"]
            isOneToOne: false
            referencedRelation: "vw_pj_pagamentos"
            referencedColumns: ["cpr_id"]
          },
          {
            foreignKeyName: "boleto_stage_ged_documento_id_fkey"
            columns: ["ged_documento_id"]
            isOneToOne: false
            referencedRelation: "ged_documentos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "boleto_stage_parceiro_id_fkey"
            columns: ["parceiro_id"]
            isOneToOne: false
            referencedRelation: "parceiros_comerciais"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "boleto_stage_parceiro_id_fkey"
            columns: ["parceiro_id"]
            isOneToOne: false
            referencedRelation: "v_credito_resumo_financeiro"
            referencedColumns: ["parceiro_id"]
          },
          {
            foreignKeyName: "boleto_stage_parceiro_id_fkey"
            columns: ["parceiro_id"]
            isOneToOne: false
            referencedRelation: "vw_logistica_agregado"
            referencedColumns: ["transportadora_id"]
          },
          {
            foreignKeyName: "boleto_stage_parceiro_id_fkey"
            columns: ["parceiro_id"]
            isOneToOne: false
            referencedRelation: "vw_recebivel_por_conta"
            referencedColumns: ["conta_id"]
          },
          {
            foreignKeyName: "boleto_stage_pasta_contrato_id_fkey"
            columns: ["pasta_contrato_id"]
            isOneToOne: false
            referencedRelation: "pasta_contratos"
            referencedColumns: ["id"]
          },
        ]
      }
      canais_venda: {
        Row: {
          ativo: boolean | null
          codigo: string
          created_at: string | null
          id: string
          nome: string
        }
        Insert: {
          ativo?: boolean | null
          codigo: string
          created_at?: string | null
          id?: string
          nome: string
        }
        Update: {
          ativo?: boolean | null
          codigo?: string
          created_at?: string | null
          id?: string
          nome?: string
        }
        Relationships: []
      }
      candidato_avaliacoes: {
        Row: {
          avaliador_id: string
          candidato_id: string
          comentario: string | null
          created_at: string
          id: string
          score: number
          skill: string
        }
        Insert: {
          avaliador_id: string
          candidato_id: string
          comentario?: string | null
          created_at?: string
          id?: string
          score: number
          skill: string
        }
        Update: {
          avaliador_id?: string
          candidato_id?: string
          comentario?: string | null
          created_at?: string
          id?: string
          score?: number
          skill?: string
        }
        Relationships: [
          {
            foreignKeyName: "candidato_avaliacoes_candidato_id_fkey"
            columns: ["candidato_id"]
            isOneToOne: false
            referencedRelation: "candidatos"
            referencedColumns: ["id"]
          },
        ]
      }
      candidato_historico: {
        Row: {
          candidato_id: string
          created_at: string
          id: string
          justificativa: string | null
          responsavel_id: string | null
          score_no_momento: number | null
          status_anterior: string | null
          status_novo: string
          vaga_id: string | null
        }
        Insert: {
          candidato_id: string
          created_at?: string
          id?: string
          justificativa?: string | null
          responsavel_id?: string | null
          score_no_momento?: number | null
          status_anterior?: string | null
          status_novo: string
          vaga_id?: string | null
        }
        Update: {
          candidato_id?: string
          created_at?: string
          id?: string
          justificativa?: string | null
          responsavel_id?: string | null
          score_no_momento?: number | null
          status_anterior?: string | null
          status_novo?: string
          vaga_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "candidato_historico_candidato_id_fkey"
            columns: ["candidato_id"]
            isOneToOne: false
            referencedRelation: "candidatos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "candidato_historico_vaga_id_fkey"
            columns: ["vaga_id"]
            isOneToOne: false
            referencedRelation: "vagas"
            referencedColumns: ["id"]
          },
        ]
      }
      candidato_notas: {
        Row: {
          autor_id: string
          candidato_id: string
          conteudo: string
          created_at: string
          id: string
        }
        Insert: {
          autor_id: string
          candidato_id: string
          conteudo: string
          created_at?: string
          id?: string
        }
        Update: {
          autor_id?: string
          candidato_id?: string
          conteudo?: string
          created_at?: string
          id?: string
        }
        Relationships: [
          {
            foreignKeyName: "candidato_notas_candidato_id_fkey"
            columns: ["candidato_id"]
            isOneToOne: false
            referencedRelation: "candidatos"
            referencedColumns: ["id"]
          },
        ]
      }
      candidatos: {
        Row: {
          consentimento_lgpd: boolean | null
          consentimento_lgpd_at: string | null
          created_at: string | null
          curriculo_url: string | null
          email: string
          experiencias: Json | null
          formacoes: Json | null
          id: string
          linkedin_url: string | null
          mensagem: string | null
          nome: string
          origem: string | null
          portfolio_url: string | null
          pretensao_salarial: number | null
          score_calculado_em: string | null
          score_detalhado: Json | null
          score_total: number | null
          sistemas_candidato: Json | null
          skills_candidato: Json | null
          status: string
          telefone: string | null
          updated_at: string | null
          vaga_id: string
        }
        Insert: {
          consentimento_lgpd?: boolean | null
          consentimento_lgpd_at?: string | null
          created_at?: string | null
          curriculo_url?: string | null
          email: string
          experiencias?: Json | null
          formacoes?: Json | null
          id?: string
          linkedin_url?: string | null
          mensagem?: string | null
          nome: string
          origem?: string | null
          portfolio_url?: string | null
          pretensao_salarial?: number | null
          score_calculado_em?: string | null
          score_detalhado?: Json | null
          score_total?: number | null
          sistemas_candidato?: Json | null
          skills_candidato?: Json | null
          status?: string
          telefone?: string | null
          updated_at?: string | null
          vaga_id: string
        }
        Update: {
          consentimento_lgpd?: boolean | null
          consentimento_lgpd_at?: string | null
          created_at?: string | null
          curriculo_url?: string | null
          email?: string
          experiencias?: Json | null
          formacoes?: Json | null
          id?: string
          linkedin_url?: string | null
          mensagem?: string | null
          nome?: string
          origem?: string | null
          portfolio_url?: string | null
          pretensao_salarial?: number | null
          score_calculado_em?: string | null
          score_detalhado?: Json | null
          score_total?: number | null
          sistemas_candidato?: Json | null
          skills_candidato?: Json | null
          status?: string
          telefone?: string | null
          updated_at?: string | null
          vaga_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "candidatos_vaga_id_fkey"
            columns: ["vaga_id"]
            isOneToOne: false
            referencedRelation: "vagas"
            referencedColumns: ["id"]
          },
        ]
      }
      cargo_template: {
        Row: {
          area: string | null
          ativo: boolean
          cargo_id: string | null
          codigo: string
          criado_em: string
          criado_por: string | null
          descricao: string | null
          id: string
          is_sistema: boolean
          nivel_sugerido: string | null
          nome: string
        }
        Insert: {
          area?: string | null
          ativo?: boolean
          cargo_id?: string | null
          codigo: string
          criado_em?: string
          criado_por?: string | null
          descricao?: string | null
          id?: string
          is_sistema?: boolean
          nivel_sugerido?: string | null
          nome: string
        }
        Update: {
          area?: string | null
          ativo?: boolean
          cargo_id?: string | null
          codigo?: string
          criado_em?: string
          criado_por?: string | null
          descricao?: string | null
          id?: string
          is_sistema?: boolean
          nivel_sugerido?: string | null
          nome?: string
        }
        Relationships: [
          {
            foreignKeyName: "cargo_template_cargo_id_fkey"
            columns: ["cargo_id"]
            isOneToOne: false
            referencedRelation: "cargos"
            referencedColumns: ["id"]
          },
        ]
      }
      cargo_template_perfis: {
        Row: {
          criado_em: string
          escopo_unidade_id: string | null
          id: string
          nivel_override: string | null
          perfil_id: string
          template_id: string
        }
        Insert: {
          criado_em?: string
          escopo_unidade_id?: string | null
          id?: string
          nivel_override?: string | null
          perfil_id: string
          template_id: string
        }
        Update: {
          criado_em?: string
          escopo_unidade_id?: string | null
          id?: string
          nivel_override?: string | null
          perfil_id?: string
          template_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "cargo_template_perfis_escopo_unidade_id_fkey"
            columns: ["escopo_unidade_id"]
            isOneToOne: false
            referencedRelation: "unidades"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cargo_template_perfis_perfil_id_fkey"
            columns: ["perfil_id"]
            isOneToOne: false
            referencedRelation: "perfis"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cargo_template_perfis_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "cargo_template"
            referencedColumns: ["id"]
          },
        ]
      }
      cargos: {
        Row: {
          ativo: boolean | null
          created_at: string | null
          departamento: string | null
          departamento_id: string | null
          faixa_clt_f1_max: number | null
          faixa_clt_f1_min: number | null
          faixa_clt_f2_max: number | null
          faixa_clt_f2_min: number | null
          faixa_clt_f3_max: number | null
          faixa_clt_f3_min: number | null
          faixa_clt_f4_max: number | null
          faixa_clt_f4_min: number | null
          faixa_clt_f5_max: number | null
          faixa_clt_f5_min: number | null
          faixa_pj_f1_max: number | null
          faixa_pj_f1_min: number | null
          faixa_pj_f2_max: number | null
          faixa_pj_f2_min: number | null
          faixa_pj_f3_max: number | null
          faixa_pj_f3_min: number | null
          faixa_pj_f4_max: number | null
          faixa_pj_f4_min: number | null
          faixa_pj_f5_max: number | null
          faixa_pj_f5_min: number | null
          ferramentas: string[] | null
          id: string
          is_clevel: boolean | null
          missao: string | null
          nivel: string
          nome: string
          protege_salario: boolean | null
          responsabilidades: string[] | null
          skills_desejadas: string[] | null
          skills_obrigatorias: string[] | null
          template_id_padrao: string | null
          tipo_contrato: string
          updated_at: string | null
        }
        Insert: {
          ativo?: boolean | null
          created_at?: string | null
          departamento?: string | null
          departamento_id?: string | null
          faixa_clt_f1_max?: number | null
          faixa_clt_f1_min?: number | null
          faixa_clt_f2_max?: number | null
          faixa_clt_f2_min?: number | null
          faixa_clt_f3_max?: number | null
          faixa_clt_f3_min?: number | null
          faixa_clt_f4_max?: number | null
          faixa_clt_f4_min?: number | null
          faixa_clt_f5_max?: number | null
          faixa_clt_f5_min?: number | null
          faixa_pj_f1_max?: number | null
          faixa_pj_f1_min?: number | null
          faixa_pj_f2_max?: number | null
          faixa_pj_f2_min?: number | null
          faixa_pj_f3_max?: number | null
          faixa_pj_f3_min?: number | null
          faixa_pj_f4_max?: number | null
          faixa_pj_f4_min?: number | null
          faixa_pj_f5_max?: number | null
          faixa_pj_f5_min?: number | null
          ferramentas?: string[] | null
          id?: string
          is_clevel?: boolean | null
          missao?: string | null
          nivel: string
          nome: string
          protege_salario?: boolean | null
          responsabilidades?: string[] | null
          skills_desejadas?: string[] | null
          skills_obrigatorias?: string[] | null
          template_id_padrao?: string | null
          tipo_contrato?: string
          updated_at?: string | null
        }
        Update: {
          ativo?: boolean | null
          created_at?: string | null
          departamento?: string | null
          departamento_id?: string | null
          faixa_clt_f1_max?: number | null
          faixa_clt_f1_min?: number | null
          faixa_clt_f2_max?: number | null
          faixa_clt_f2_min?: number | null
          faixa_clt_f3_max?: number | null
          faixa_clt_f3_min?: number | null
          faixa_clt_f4_max?: number | null
          faixa_clt_f4_min?: number | null
          faixa_clt_f5_max?: number | null
          faixa_clt_f5_min?: number | null
          faixa_pj_f1_max?: number | null
          faixa_pj_f1_min?: number | null
          faixa_pj_f2_max?: number | null
          faixa_pj_f2_min?: number | null
          faixa_pj_f3_max?: number | null
          faixa_pj_f3_min?: number | null
          faixa_pj_f4_max?: number | null
          faixa_pj_f4_min?: number | null
          faixa_pj_f5_max?: number | null
          faixa_pj_f5_min?: number | null
          ferramentas?: string[] | null
          id?: string
          is_clevel?: boolean | null
          missao?: string | null
          nivel?: string
          nome?: string
          protege_salario?: boolean | null
          responsabilidades?: string[] | null
          skills_desejadas?: string[] | null
          skills_obrigatorias?: string[] | null
          template_id_padrao?: string | null
          tipo_contrato?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "cargos_departamento_id_fkey"
            columns: ["departamento_id"]
            isOneToOne: false
            referencedRelation: "parametros"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cargos_template_id_padrao_fkey"
            columns: ["template_id_padrao"]
            isOneToOne: false
            referencedRelation: "cargo_template"
            referencedColumns: ["id"]
          },
        ]
      }
      cartoes_credito: {
        Row: {
          ativo: boolean
          bandeira: string | null
          conta_bancaria_id: string | null
          created_at: string
          dia_fechamento: number | null
          dia_vencimento: number | null
          id: string
          limite: number
          nome: string
          ultimos_digitos: string | null
          updated_at: string
        }
        Insert: {
          ativo?: boolean
          bandeira?: string | null
          conta_bancaria_id?: string | null
          created_at?: string
          dia_fechamento?: number | null
          dia_vencimento?: number | null
          id?: string
          limite?: number
          nome: string
          ultimos_digitos?: string | null
          updated_at?: string
        }
        Update: {
          ativo?: boolean
          bandeira?: string | null
          conta_bancaria_id?: string | null
          created_at?: string
          dia_fechamento?: number | null
          dia_vencimento?: number | null
          id?: string
          limite?: number
          nome?: string
          ultimos_digitos?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "cartoes_credito_conta_bancaria_id_fkey"
            columns: ["conta_bancaria_id"]
            isOneToOne: false
            referencedRelation: "contas_bancarias"
            referencedColumns: ["id"]
          },
        ]
      }
      centros_custo: {
        Row: {
          ativo: boolean | null
          codigo: string
          created_at: string | null
          id: string
          nome: string
        }
        Insert: {
          ativo?: boolean | null
          codigo: string
          created_at?: string | null
          id?: string
          nome: string
        }
        Update: {
          ativo?: boolean | null
          codigo?: string
          created_at?: string | null
          id?: string
          nome?: string
        }
        Relationships: []
      }
      cfop_natureza: {
        Row: {
          ativo: boolean
          cfop: string
          created_at: string
          descricao: string
          eh_venda: boolean
          updated_at: string
        }
        Insert: {
          ativo?: boolean
          cfop: string
          created_at?: string
          descricao: string
          eh_venda?: boolean
          updated_at?: string
        }
        Update: {
          ativo?: boolean
          cfop?: string
          created_at?: string
          descricao?: string
          eh_venda?: boolean
          updated_at?: string
        }
        Relationships: []
      }
      classificacao_dados: {
        Row: {
          base_legal: string | null
          descricao: string | null
          id: string
          politica: string
          retencao_anos: number | null
          tabela: string
        }
        Insert: {
          base_legal?: string | null
          descricao?: string | null
          id?: string
          politica: string
          retencao_anos?: number | null
          tabela: string
        }
        Update: {
          base_legal?: string | null
          descricao?: string | null
          id?: string
          politica?: string
          retencao_anos?: number | null
          tabela?: string
        }
        Relationships: []
      }
      classificacoes_confirmadas: {
        Row: {
          centro_custo_id: string | null
          cnpj: string
          confirmada_em: string
          confirmada_por: string | null
          created_at: string
          id: string
          ncm_prefixo: string
          plano_contas_id: string
          updated_at: string
          valor_max_confirmado: number
        }
        Insert: {
          centro_custo_id?: string | null
          cnpj: string
          confirmada_em?: string
          confirmada_por?: string | null
          created_at?: string
          id?: string
          ncm_prefixo?: string
          plano_contas_id: string
          updated_at?: string
          valor_max_confirmado?: number
        }
        Update: {
          centro_custo_id?: string | null
          cnpj?: string
          confirmada_em?: string
          confirmada_por?: string | null
          created_at?: string
          id?: string
          ncm_prefixo?: string
          plano_contas_id?: string
          updated_at?: string
          valor_max_confirmado?: number
        }
        Relationships: [
          {
            foreignKeyName: "classificacoes_confirmadas_centro_custo_id_fkey"
            columns: ["centro_custo_id"]
            isOneToOne: false
            referencedRelation: "centros_custo"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "classificacoes_confirmadas_centro_custo_id_fkey"
            columns: ["centro_custo_id"]
            isOneToOne: false
            referencedRelation: "vw_custo_pessoas"
            referencedColumns: ["centro_custo_id"]
          },
          {
            foreignKeyName: "classificacoes_confirmadas_centro_custo_id_fkey"
            columns: ["centro_custo_id"]
            isOneToOne: false
            referencedRelation: "vw_dimensionamento_areas"
            referencedColumns: ["centro_custo_id"]
          },
          {
            foreignKeyName: "classificacoes_confirmadas_plano_contas_id_fkey"
            columns: ["plano_contas_id"]
            isOneToOne: false
            referencedRelation: "plano_contas"
            referencedColumns: ["id"]
          },
        ]
      }
      colaborador_acessos_sistemas: {
        Row: {
          colaborador_id: string
          created_at: string
          data_concessao: string | null
          id: string
          observacoes: string | null
          sistema: string
          tem_acesso: boolean
          updated_at: string
          usuario: string | null
        }
        Insert: {
          colaborador_id: string
          created_at?: string
          data_concessao?: string | null
          id?: string
          observacoes?: string | null
          sistema: string
          tem_acesso?: boolean
          updated_at?: string
          usuario?: string | null
        }
        Update: {
          colaborador_id?: string
          created_at?: string
          data_concessao?: string | null
          id?: string
          observacoes?: string | null
          sistema?: string
          tem_acesso?: boolean
          updated_at?: string
          usuario?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "colaborador_acessos_sistemas_colaborador_id_fkey"
            columns: ["colaborador_id"]
            isOneToOne: false
            referencedRelation: "colaboradores_clt"
            referencedColumns: ["id"]
          },
        ]
      }
      colaborador_departamentos: {
        Row: {
          colaborador_id: string
          created_at: string
          departamento: string
          departamento_id: string | null
          id: string
          percentual_rateio: number
          updated_at: string
        }
        Insert: {
          colaborador_id: string
          created_at?: string
          departamento: string
          departamento_id?: string | null
          id?: string
          percentual_rateio?: number
          updated_at?: string
        }
        Update: {
          colaborador_id?: string
          created_at?: string
          departamento?: string
          departamento_id?: string | null
          id?: string
          percentual_rateio?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "colaborador_departamentos_colaborador_id_fkey"
            columns: ["colaborador_id"]
            isOneToOne: false
            referencedRelation: "colaboradores_clt"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "colaborador_departamentos_departamento_id_fkey"
            columns: ["departamento_id"]
            isOneToOne: false
            referencedRelation: "parametros"
            referencedColumns: ["id"]
          },
        ]
      }
      colaborador_equipamentos: {
        Row: {
          colaborador_id: string
          created_at: string
          data_devolucao: string | null
          data_entrega: string | null
          estado: string
          id: string
          marca: string | null
          modelo: string | null
          numero_patrimonio: string | null
          numero_serie: string | null
          observacoes: string | null
          termo_responsabilidade_url: string | null
          tipo: string
          updated_at: string
        }
        Insert: {
          colaborador_id: string
          created_at?: string
          data_devolucao?: string | null
          data_entrega?: string | null
          estado?: string
          id?: string
          marca?: string | null
          modelo?: string | null
          numero_patrimonio?: string | null
          numero_serie?: string | null
          observacoes?: string | null
          termo_responsabilidade_url?: string | null
          tipo: string
          updated_at?: string
        }
        Update: {
          colaborador_id?: string
          created_at?: string
          data_devolucao?: string | null
          data_entrega?: string | null
          estado?: string
          id?: string
          marca?: string | null
          modelo?: string | null
          numero_patrimonio?: string | null
          numero_serie?: string | null
          observacoes?: string | null
          termo_responsabilidade_url?: string | null
          tipo?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "colaborador_equipamentos_colaborador_id_fkey"
            columns: ["colaborador_id"]
            isOneToOne: false
            referencedRelation: "colaboradores_clt"
            referencedColumns: ["id"]
          },
        ]
      }
      colaboradores_clt: {
        Row: {
          acesso_revogado_em: string | null
          agencia: string | null
          bairro: string | null
          banco_codigo: string | null
          banco_nome: string | null
          cargo: string
          cargo_id: string | null
          cep: string | null
          certificado_reservista: string | null
          chave_pix: string | null
          cidade: string | null
          cnh_categoria: string | null
          cnh_numero: string | null
          cnh_validade: string | null
          complemento: string | null
          conta: string | null
          contato_emergencia_nome: string | null
          contato_emergencia_telefone: string | null
          cpf: string
          created_at: string
          created_by: string | null
          ctps_numero: string | null
          ctps_serie: string | null
          ctps_uf: string | null
          data_admissao: string
          data_desligamento: string | null
          data_integracao: string | null
          data_nascimento: string
          departamento: string
          departamento_id: string | null
          email_corporativo: string | null
          email_pessoal: string | null
          estado_civil: string | null
          etnia: string | null
          fim_periodo_experiencia_1: string | null
          fim_periodo_experiencia_2: string | null
          foto_url: string | null
          genero: string | null
          gestor_direto_id: string | null
          horario_trabalho: string | null
          id: string
          jornada_semanal: number | null
          local_trabalho: string | null
          logradouro: string | null
          matricula: string | null
          nacionalidade: string | null
          nome_completo: string
          nome_mae: string | null
          nome_pai: string | null
          numero: string | null
          observacoes: string | null
          orgao_emissor: string | null
          pis_pasep: string | null
          ramal: string | null
          rg: string | null
          salario_base: number
          secao_eleitoral: string | null
          status: string
          telefone: string | null
          telefone_corporativo: string | null
          tipo_conta: string | null
          tipo_contrato: string
          titulo_eleitor: string | null
          uf: string | null
          unidade_id: string | null
          updated_at: string
          user_id: string | null
          zona_eleitoral: string | null
        }
        Insert: {
          acesso_revogado_em?: string | null
          agencia?: string | null
          bairro?: string | null
          banco_codigo?: string | null
          banco_nome?: string | null
          cargo: string
          cargo_id?: string | null
          cep?: string | null
          certificado_reservista?: string | null
          chave_pix?: string | null
          cidade?: string | null
          cnh_categoria?: string | null
          cnh_numero?: string | null
          cnh_validade?: string | null
          complemento?: string | null
          conta?: string | null
          contato_emergencia_nome?: string | null
          contato_emergencia_telefone?: string | null
          cpf: string
          created_at?: string
          created_by?: string | null
          ctps_numero?: string | null
          ctps_serie?: string | null
          ctps_uf?: string | null
          data_admissao: string
          data_desligamento?: string | null
          data_integracao?: string | null
          data_nascimento: string
          departamento: string
          departamento_id?: string | null
          email_corporativo?: string | null
          email_pessoal?: string | null
          estado_civil?: string | null
          etnia?: string | null
          fim_periodo_experiencia_1?: string | null
          fim_periodo_experiencia_2?: string | null
          foto_url?: string | null
          genero?: string | null
          gestor_direto_id?: string | null
          horario_trabalho?: string | null
          id?: string
          jornada_semanal?: number | null
          local_trabalho?: string | null
          logradouro?: string | null
          matricula?: string | null
          nacionalidade?: string | null
          nome_completo: string
          nome_mae?: string | null
          nome_pai?: string | null
          numero?: string | null
          observacoes?: string | null
          orgao_emissor?: string | null
          pis_pasep?: string | null
          ramal?: string | null
          rg?: string | null
          salario_base: number
          secao_eleitoral?: string | null
          status?: string
          telefone?: string | null
          telefone_corporativo?: string | null
          tipo_conta?: string | null
          tipo_contrato?: string
          titulo_eleitor?: string | null
          uf?: string | null
          unidade_id?: string | null
          updated_at?: string
          user_id?: string | null
          zona_eleitoral?: string | null
        }
        Update: {
          acesso_revogado_em?: string | null
          agencia?: string | null
          bairro?: string | null
          banco_codigo?: string | null
          banco_nome?: string | null
          cargo?: string
          cargo_id?: string | null
          cep?: string | null
          certificado_reservista?: string | null
          chave_pix?: string | null
          cidade?: string | null
          cnh_categoria?: string | null
          cnh_numero?: string | null
          cnh_validade?: string | null
          complemento?: string | null
          conta?: string | null
          contato_emergencia_nome?: string | null
          contato_emergencia_telefone?: string | null
          cpf?: string
          created_at?: string
          created_by?: string | null
          ctps_numero?: string | null
          ctps_serie?: string | null
          ctps_uf?: string | null
          data_admissao?: string
          data_desligamento?: string | null
          data_integracao?: string | null
          data_nascimento?: string
          departamento?: string
          departamento_id?: string | null
          email_corporativo?: string | null
          email_pessoal?: string | null
          estado_civil?: string | null
          etnia?: string | null
          fim_periodo_experiencia_1?: string | null
          fim_periodo_experiencia_2?: string | null
          foto_url?: string | null
          genero?: string | null
          gestor_direto_id?: string | null
          horario_trabalho?: string | null
          id?: string
          jornada_semanal?: number | null
          local_trabalho?: string | null
          logradouro?: string | null
          matricula?: string | null
          nacionalidade?: string | null
          nome_completo?: string
          nome_mae?: string | null
          nome_pai?: string | null
          numero?: string | null
          observacoes?: string | null
          orgao_emissor?: string | null
          pis_pasep?: string | null
          ramal?: string | null
          rg?: string | null
          salario_base?: number
          secao_eleitoral?: string | null
          status?: string
          telefone?: string | null
          telefone_corporativo?: string | null
          tipo_conta?: string | null
          tipo_contrato?: string
          titulo_eleitor?: string | null
          uf?: string | null
          unidade_id?: string | null
          updated_at?: string
          user_id?: string | null
          zona_eleitoral?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "colaboradores_clt_cargo_id_fkey"
            columns: ["cargo_id"]
            isOneToOne: false
            referencedRelation: "cargos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "colaboradores_clt_departamento_id_fkey"
            columns: ["departamento_id"]
            isOneToOne: false
            referencedRelation: "parametros"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "colaboradores_clt_gestor_direto_id_fkey"
            columns: ["gestor_direto_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "colaboradores_clt_unidade_id_fkey"
            columns: ["unidade_id"]
            isOneToOne: false
            referencedRelation: "unidades"
            referencedColumns: ["id"]
          },
        ]
      }
      comentarios_pedido: {
        Row: {
          autor_id: string
          conteudo: string
          created_at: string
          editado_em: string | null
          excluido_em: string | null
          excluido_por: string | null
          id: string
          pedido_id: string
          updated_at: string
        }
        Insert: {
          autor_id: string
          conteudo: string
          created_at?: string
          editado_em?: string | null
          excluido_em?: string | null
          excluido_por?: string | null
          id?: string
          pedido_id: string
          updated_at?: string
        }
        Update: {
          autor_id?: string
          conteudo?: string
          created_at?: string
          editado_em?: string | null
          excluido_em?: string | null
          excluido_por?: string | null
          id?: string
          pedido_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "comentarios_pedido_pedido_id_fkey"
            columns: ["pedido_id"]
            isOneToOne: false
            referencedRelation: "pedidos_compra"
            referencedColumns: ["id"]
          },
        ]
      }
      compras_registradas: {
        Row: {
          comprador_id: string
          created_at: string
          data_compra: string
          excluida_em: string | null
          excluida_motivo: string | null
          excluida_por: string | null
          id: string
          intervalo_dias: number
          meio_pagamento_id: string | null
          observacao: string | null
          parceiro_id: string
          parceiro_id_pedido_original: string | null
          parcela_grupo_id: string
          parcelas_count: number
          pedido_id: string
          periodicidade: string
          plano_contas_id: string | null
          primeira_parcela_data: string
          status: Database["public"]["Enums"]["compra_registrada_status_enum"]
          updated_at: string
          valor_total: number
        }
        Insert: {
          comprador_id: string
          created_at?: string
          data_compra: string
          excluida_em?: string | null
          excluida_motivo?: string | null
          excluida_por?: string | null
          id?: string
          intervalo_dias?: number
          meio_pagamento_id?: string | null
          observacao?: string | null
          parceiro_id: string
          parceiro_id_pedido_original?: string | null
          parcela_grupo_id?: string
          parcelas_count?: number
          pedido_id: string
          periodicidade?: string
          plano_contas_id?: string | null
          primeira_parcela_data: string
          status?: Database["public"]["Enums"]["compra_registrada_status_enum"]
          updated_at?: string
          valor_total: number
        }
        Update: {
          comprador_id?: string
          created_at?: string
          data_compra?: string
          excluida_em?: string | null
          excluida_motivo?: string | null
          excluida_por?: string | null
          id?: string
          intervalo_dias?: number
          meio_pagamento_id?: string | null
          observacao?: string | null
          parceiro_id?: string
          parceiro_id_pedido_original?: string | null
          parcela_grupo_id?: string
          parcelas_count?: number
          pedido_id?: string
          periodicidade?: string
          plano_contas_id?: string | null
          primeira_parcela_data?: string
          status?: Database["public"]["Enums"]["compra_registrada_status_enum"]
          updated_at?: string
          valor_total?: number
        }
        Relationships: [
          {
            foreignKeyName: "compras_registradas_conta_id_fkey"
            columns: ["plano_contas_id"]
            isOneToOne: false
            referencedRelation: "plano_contas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "compras_registradas_meio_pagamento_id_fkey"
            columns: ["meio_pagamento_id"]
            isOneToOne: false
            referencedRelation: "formas_pagamento"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "compras_registradas_parceiro_id_fkey"
            columns: ["parceiro_id"]
            isOneToOne: false
            referencedRelation: "parceiros_comerciais"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "compras_registradas_parceiro_id_fkey"
            columns: ["parceiro_id"]
            isOneToOne: false
            referencedRelation: "v_credito_resumo_financeiro"
            referencedColumns: ["parceiro_id"]
          },
          {
            foreignKeyName: "compras_registradas_parceiro_id_fkey"
            columns: ["parceiro_id"]
            isOneToOne: false
            referencedRelation: "vw_logistica_agregado"
            referencedColumns: ["transportadora_id"]
          },
          {
            foreignKeyName: "compras_registradas_parceiro_id_fkey"
            columns: ["parceiro_id"]
            isOneToOne: false
            referencedRelation: "vw_recebivel_por_conta"
            referencedColumns: ["conta_id"]
          },
          {
            foreignKeyName: "compras_registradas_parceiro_id_pedido_original_fkey"
            columns: ["parceiro_id_pedido_original"]
            isOneToOne: false
            referencedRelation: "parceiros_comerciais"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "compras_registradas_parceiro_id_pedido_original_fkey"
            columns: ["parceiro_id_pedido_original"]
            isOneToOne: false
            referencedRelation: "v_credito_resumo_financeiro"
            referencedColumns: ["parceiro_id"]
          },
          {
            foreignKeyName: "compras_registradas_parceiro_id_pedido_original_fkey"
            columns: ["parceiro_id_pedido_original"]
            isOneToOne: false
            referencedRelation: "vw_logistica_agregado"
            referencedColumns: ["transportadora_id"]
          },
          {
            foreignKeyName: "compras_registradas_parceiro_id_pedido_original_fkey"
            columns: ["parceiro_id_pedido_original"]
            isOneToOne: false
            referencedRelation: "vw_recebivel_por_conta"
            referencedColumns: ["conta_id"]
          },
          {
            foreignKeyName: "compras_registradas_pedido_id_fkey"
            columns: ["pedido_id"]
            isOneToOne: false
            referencedRelation: "pedidos_compra"
            referencedColumns: ["id"]
          },
        ]
      }
      compras_registradas_anexos: {
        Row: {
          compra_registrada_id: string
          id: string
          mime_type: string
          nome_original: string
          storage_path: string
          tamanho_bytes: number
          tipo: Database["public"]["Enums"]["compra_anexo_tipo_enum"]
          uploaded_at: string
          uploaded_by: string
        }
        Insert: {
          compra_registrada_id: string
          id?: string
          mime_type: string
          nome_original: string
          storage_path: string
          tamanho_bytes: number
          tipo: Database["public"]["Enums"]["compra_anexo_tipo_enum"]
          uploaded_at?: string
          uploaded_by: string
        }
        Update: {
          compra_registrada_id?: string
          id?: string
          mime_type?: string
          nome_original?: string
          storage_path?: string
          tamanho_bytes?: number
          tipo?: Database["public"]["Enums"]["compra_anexo_tipo_enum"]
          uploaded_at?: string
          uploaded_by?: string
        }
        Relationships: [
          {
            foreignKeyName: "compras_registradas_anexos_compra_registrada_id_fkey"
            columns: ["compra_registrada_id"]
            isOneToOne: false
            referencedRelation: "compras_registradas"
            referencedColumns: ["id"]
          },
        ]
      }
      compras_registradas_audit_log: {
        Row: {
          acao: string
          compra_registrada_id: string
          created_at: string
          id: string
          payload: Json
          usuario_id: string
        }
        Insert: {
          acao: string
          compra_registrada_id: string
          created_at?: string
          id?: string
          payload?: Json
          usuario_id: string
        }
        Update: {
          acao?: string
          compra_registrada_id?: string
          created_at?: string
          id?: string
          payload?: Json
          usuario_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "compras_registradas_audit_log_compra_registrada_id_fkey"
            columns: ["compra_registrada_id"]
            isOneToOne: false
            referencedRelation: "compras_registradas"
            referencedColumns: ["id"]
          },
        ]
      }
      compras_registradas_itens: {
        Row: {
          compra_registrada_id: string
          created_at: string
          descricao_livre: string | null
          id: string
          pedido_item_id: string | null
          quantidade_real: number
          status_linha: string
          substitui_pedido_item_id: string | null
          tipo_linha: string
          valor_total_real: number | null
          valor_unitario_real: number
        }
        Insert: {
          compra_registrada_id: string
          created_at?: string
          descricao_livre?: string | null
          id?: string
          pedido_item_id?: string | null
          quantidade_real: number
          status_linha?: string
          substitui_pedido_item_id?: string | null
          tipo_linha?: string
          valor_total_real?: number | null
          valor_unitario_real: number
        }
        Update: {
          compra_registrada_id?: string
          created_at?: string
          descricao_livre?: string | null
          id?: string
          pedido_item_id?: string | null
          quantidade_real?: number
          status_linha?: string
          substitui_pedido_item_id?: string | null
          tipo_linha?: string
          valor_total_real?: number | null
          valor_unitario_real?: number
        }
        Relationships: [
          {
            foreignKeyName: "compras_registradas_itens_compra_registrada_id_fkey"
            columns: ["compra_registrada_id"]
            isOneToOne: false
            referencedRelation: "compras_registradas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "compras_registradas_itens_pedido_item_id_fkey"
            columns: ["pedido_item_id"]
            isOneToOne: false
            referencedRelation: "pedidos_compra_itens"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "compras_registradas_itens_substitui_pedido_item_id_fkey"
            columns: ["substitui_pedido_item_id"]
            isOneToOne: false
            referencedRelation: "pedidos_compra_itens"
            referencedColumns: ["id"]
          },
        ]
      }
      compromissos_parcelados: {
        Row: {
          centro_custo_id: string | null
          conta_bancaria_id: string | null
          created_at: string
          criado_por: string | null
          data_compra: string
          data_primeira_parcela: string
          descricao: string
          descricao_normalizada: string | null
          fatura_origem_id: string | null
          id: string
          nf_origem_id: string | null
          observacao: string | null
          origem: string
          parceiro_id: string | null
          parcelas_pagas: number
          parcelas_previstas: number
          plano_contas_id: string | null
          qtd_parcelas: number
          status: string
          updated_at: string
          valor_parcela: number
          valor_total: number
        }
        Insert: {
          centro_custo_id?: string | null
          conta_bancaria_id?: string | null
          created_at?: string
          criado_por?: string | null
          data_compra: string
          data_primeira_parcela: string
          descricao: string
          descricao_normalizada?: string | null
          fatura_origem_id?: string | null
          id?: string
          nf_origem_id?: string | null
          observacao?: string | null
          origem: string
          parceiro_id?: string | null
          parcelas_pagas?: number
          parcelas_previstas?: number
          plano_contas_id?: string | null
          qtd_parcelas: number
          status?: string
          updated_at?: string
          valor_parcela: number
          valor_total: number
        }
        Update: {
          centro_custo_id?: string | null
          conta_bancaria_id?: string | null
          created_at?: string
          criado_por?: string | null
          data_compra?: string
          data_primeira_parcela?: string
          descricao?: string
          descricao_normalizada?: string | null
          fatura_origem_id?: string | null
          id?: string
          nf_origem_id?: string | null
          observacao?: string | null
          origem?: string
          parceiro_id?: string | null
          parcelas_pagas?: number
          parcelas_previstas?: number
          plano_contas_id?: string | null
          qtd_parcelas?: number
          status?: string
          updated_at?: string
          valor_parcela?: number
          valor_total?: number
        }
        Relationships: [
          {
            foreignKeyName: "compromissos_parcelados_centro_custo_id_fkey"
            columns: ["centro_custo_id"]
            isOneToOne: false
            referencedRelation: "centros_custo"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "compromissos_parcelados_centro_custo_id_fkey"
            columns: ["centro_custo_id"]
            isOneToOne: false
            referencedRelation: "vw_custo_pessoas"
            referencedColumns: ["centro_custo_id"]
          },
          {
            foreignKeyName: "compromissos_parcelados_centro_custo_id_fkey"
            columns: ["centro_custo_id"]
            isOneToOne: false
            referencedRelation: "vw_dimensionamento_areas"
            referencedColumns: ["centro_custo_id"]
          },
          {
            foreignKeyName: "compromissos_parcelados_conta_bancaria_id_fkey"
            columns: ["conta_bancaria_id"]
            isOneToOne: false
            referencedRelation: "contas_bancarias"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "compromissos_parcelados_fatura_origem_id_fkey"
            columns: ["fatura_origem_id"]
            isOneToOne: false
            referencedRelation: "faturas_cartao"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "compromissos_parcelados_fatura_origem_id_fkey"
            columns: ["fatura_origem_id"]
            isOneToOne: false
            referencedRelation: "vw_faturas_cartao_resumo"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "compromissos_parcelados_nf_origem_id_fkey"
            columns: ["nf_origem_id"]
            isOneToOne: false
            referencedRelation: "contas_pagar"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "compromissos_parcelados_nf_origem_id_fkey"
            columns: ["nf_origem_id"]
            isOneToOne: false
            referencedRelation: "contas_pagar_receber"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "compromissos_parcelados_nf_origem_id_fkey"
            columns: ["nf_origem_id"]
            isOneToOne: false
            referencedRelation: "contas_pagar_receber_ativas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "compromissos_parcelados_nf_origem_id_fkey"
            columns: ["nf_origem_id"]
            isOneToOne: false
            referencedRelation: "v_cpr_bola_redonda"
            referencedColumns: ["cpr_id"]
          },
          {
            foreignKeyName: "compromissos_parcelados_nf_origem_id_fkey"
            columns: ["nf_origem_id"]
            isOneToOne: false
            referencedRelation: "vw_conciliacao_furos"
            referencedColumns: ["sugestao_cpr_id"]
          },
          {
            foreignKeyName: "compromissos_parcelados_nf_origem_id_fkey"
            columns: ["nf_origem_id"]
            isOneToOne: false
            referencedRelation: "vw_contas_pagar_consolidado"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "compromissos_parcelados_nf_origem_id_fkey"
            columns: ["nf_origem_id"]
            isOneToOne: false
            referencedRelation: "vw_despesas_match_sugestoes"
            referencedColumns: ["cpr_id"]
          },
          {
            foreignKeyName: "compromissos_parcelados_nf_origem_id_fkey"
            columns: ["nf_origem_id"]
            isOneToOne: false
            referencedRelation: "vw_documentos_envio_estados"
            referencedColumns: ["conta_id"]
          },
          {
            foreignKeyName: "compromissos_parcelados_nf_origem_id_fkey"
            columns: ["nf_origem_id"]
            isOneToOne: false
            referencedRelation: "vw_pj_pagamentos"
            referencedColumns: ["cpr_id"]
          },
          {
            foreignKeyName: "compromissos_parcelados_parceiro_id_fkey"
            columns: ["parceiro_id"]
            isOneToOne: false
            referencedRelation: "parceiros_comerciais"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "compromissos_parcelados_parceiro_id_fkey"
            columns: ["parceiro_id"]
            isOneToOne: false
            referencedRelation: "v_credito_resumo_financeiro"
            referencedColumns: ["parceiro_id"]
          },
          {
            foreignKeyName: "compromissos_parcelados_parceiro_id_fkey"
            columns: ["parceiro_id"]
            isOneToOne: false
            referencedRelation: "vw_logistica_agregado"
            referencedColumns: ["transportadora_id"]
          },
          {
            foreignKeyName: "compromissos_parcelados_parceiro_id_fkey"
            columns: ["parceiro_id"]
            isOneToOne: false
            referencedRelation: "vw_recebivel_por_conta"
            referencedColumns: ["conta_id"]
          },
          {
            foreignKeyName: "compromissos_parcelados_plano_contas_id_fkey"
            columns: ["plano_contas_id"]
            isOneToOne: false
            referencedRelation: "plano_contas"
            referencedColumns: ["id"]
          },
        ]
      }
      compromissos_recorrentes: {
        Row: {
          centro_custo: string | null
          conta_bancaria_id: string | null
          created_at: string
          criado_por: string | null
          data_fim: string | null
          data_inicio: string
          descricao: string
          descricao_normalizada: string | null
          dia_vencimento: number
          id: string
          observacao: string | null
          parceiro_id: string | null
          periodicidade: string
          plano_contas_id: string | null
          status: string
          updated_at: string
          valor: number
        }
        Insert: {
          centro_custo?: string | null
          conta_bancaria_id?: string | null
          created_at?: string
          criado_por?: string | null
          data_fim?: string | null
          data_inicio: string
          descricao: string
          descricao_normalizada?: string | null
          dia_vencimento: number
          id?: string
          observacao?: string | null
          parceiro_id?: string | null
          periodicidade: string
          plano_contas_id?: string | null
          status?: string
          updated_at?: string
          valor: number
        }
        Update: {
          centro_custo?: string | null
          conta_bancaria_id?: string | null
          created_at?: string
          criado_por?: string | null
          data_fim?: string | null
          data_inicio?: string
          descricao?: string
          descricao_normalizada?: string | null
          dia_vencimento?: number
          id?: string
          observacao?: string | null
          parceiro_id?: string | null
          periodicidade?: string
          plano_contas_id?: string | null
          status?: string
          updated_at?: string
          valor?: number
        }
        Relationships: [
          {
            foreignKeyName: "compromissos_recorrentes_conta_bancaria_id_fkey"
            columns: ["conta_bancaria_id"]
            isOneToOne: false
            referencedRelation: "contas_bancarias"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "compromissos_recorrentes_parceiro_id_fkey"
            columns: ["parceiro_id"]
            isOneToOne: false
            referencedRelation: "parceiros_comerciais"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "compromissos_recorrentes_parceiro_id_fkey"
            columns: ["parceiro_id"]
            isOneToOne: false
            referencedRelation: "v_credito_resumo_financeiro"
            referencedColumns: ["parceiro_id"]
          },
          {
            foreignKeyName: "compromissos_recorrentes_parceiro_id_fkey"
            columns: ["parceiro_id"]
            isOneToOne: false
            referencedRelation: "vw_logistica_agregado"
            referencedColumns: ["transportadora_id"]
          },
          {
            foreignKeyName: "compromissos_recorrentes_parceiro_id_fkey"
            columns: ["parceiro_id"]
            isOneToOne: false
            referencedRelation: "vw_recebivel_por_conta"
            referencedColumns: ["conta_id"]
          },
          {
            foreignKeyName: "compromissos_recorrentes_plano_contas_id_fkey"
            columns: ["plano_contas_id"]
            isOneToOne: false
            referencedRelation: "plano_contas"
            referencedColumns: ["id"]
          },
        ]
      }
      config_financeiro_externo: {
        Row: {
          ativo: boolean | null
          created_at: string | null
          email: string
          id: string
          nome: string
          observacao: string | null
          papel: string
          propositos: string[]
          updated_at: string
        }
        Insert: {
          ativo?: boolean | null
          created_at?: string | null
          email: string
          id?: string
          nome: string
          observacao?: string | null
          papel?: string
          propositos?: string[]
          updated_at?: string
        }
        Update: {
          ativo?: boolean | null
          created_at?: string | null
          email?: string
          id?: string
          nome?: string
          observacao?: string | null
          papel?: string
          propositos?: string[]
          updated_at?: string
        }
        Relationships: []
      }
      consentimentos_lgpd: {
        Row: {
          aceito: boolean
          criado_em: string
          id: string
          ip_origem: string | null
          revogado_em: string | null
          texto_versao: string
          tipo: string
          user_agent: string | null
          user_id: string
        }
        Insert: {
          aceito: boolean
          criado_em?: string
          id?: string
          ip_origem?: string | null
          revogado_em?: string | null
          texto_versao: string
          tipo: string
          user_agent?: string | null
          user_id: string
        }
        Update: {
          aceito?: boolean
          criado_em?: string
          id?: string
          ip_origem?: string | null
          revogado_em?: string | null
          texto_versao?: string
          tipo?: string
          user_agent?: string | null
          user_id?: string
        }
        Relationships: []
      }
      contas_bancarias: {
        Row: {
          agencia: string | null
          ativo: boolean | null
          banco: string
          banco_codigo: string | null
          cor: string | null
          created_at: string | null
          data_saldo_inicial: string | null
          dia_fechamento: number | null
          dia_vencimento: number | null
          id: string
          limite_credito: number | null
          moeda: string | null
          nome_exibicao: string
          numero_conta: string | null
          saldo_atual: number | null
          saldo_atualizado_em: string | null
          saldo_inicial: number | null
          tipo: string
          unidade: string | null
          updated_at: string | null
        }
        Insert: {
          agencia?: string | null
          ativo?: boolean | null
          banco: string
          banco_codigo?: string | null
          cor?: string | null
          created_at?: string | null
          data_saldo_inicial?: string | null
          dia_fechamento?: number | null
          dia_vencimento?: number | null
          id?: string
          limite_credito?: number | null
          moeda?: string | null
          nome_exibicao: string
          numero_conta?: string | null
          saldo_atual?: number | null
          saldo_atualizado_em?: string | null
          saldo_inicial?: number | null
          tipo: string
          unidade?: string | null
          updated_at?: string | null
        }
        Update: {
          agencia?: string | null
          ativo?: boolean | null
          banco?: string
          banco_codigo?: string | null
          cor?: string | null
          created_at?: string | null
          data_saldo_inicial?: string | null
          dia_fechamento?: number | null
          dia_vencimento?: number | null
          id?: string
          limite_credito?: number | null
          moeda?: string | null
          nome_exibicao?: string
          numero_conta?: string | null
          saldo_atual?: number | null
          saldo_atualizado_em?: string | null
          saldo_inicial?: number | null
          tipo?: string
          unidade?: string | null
          updated_at?: string | null
        }
        Relationships: []
      }
      contas_pagar_documentos: {
        Row: {
          conta_pagar_id: string
          created_at: string | null
          id: string
          nome_arquivo: string
          storage_path: string
          tamanho_bytes: number | null
          tipo: string
          uploaded_por: string | null
        }
        Insert: {
          conta_pagar_id: string
          created_at?: string | null
          id?: string
          nome_arquivo: string
          storage_path: string
          tamanho_bytes?: number | null
          tipo: string
          uploaded_por?: string | null
        }
        Update: {
          conta_pagar_id?: string
          created_at?: string | null
          id?: string
          nome_arquivo?: string
          storage_path?: string
          tamanho_bytes?: number | null
          tipo?: string
          uploaded_por?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "contas_pagar_documentos_conta_id_fkey"
            columns: ["conta_pagar_id"]
            isOneToOne: false
            referencedRelation: "contas_pagar"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contas_pagar_documentos_conta_id_fkey"
            columns: ["conta_pagar_id"]
            isOneToOne: false
            referencedRelation: "contas_pagar_receber"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contas_pagar_documentos_conta_id_fkey"
            columns: ["conta_pagar_id"]
            isOneToOne: false
            referencedRelation: "contas_pagar_receber_ativas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contas_pagar_documentos_conta_id_fkey"
            columns: ["conta_pagar_id"]
            isOneToOne: false
            referencedRelation: "v_cpr_bola_redonda"
            referencedColumns: ["cpr_id"]
          },
          {
            foreignKeyName: "contas_pagar_documentos_conta_id_fkey"
            columns: ["conta_pagar_id"]
            isOneToOne: false
            referencedRelation: "vw_conciliacao_furos"
            referencedColumns: ["sugestao_cpr_id"]
          },
          {
            foreignKeyName: "contas_pagar_documentos_conta_id_fkey"
            columns: ["conta_pagar_id"]
            isOneToOne: false
            referencedRelation: "vw_contas_pagar_consolidado"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contas_pagar_documentos_conta_id_fkey"
            columns: ["conta_pagar_id"]
            isOneToOne: false
            referencedRelation: "vw_despesas_match_sugestoes"
            referencedColumns: ["cpr_id"]
          },
          {
            foreignKeyName: "contas_pagar_documentos_conta_id_fkey"
            columns: ["conta_pagar_id"]
            isOneToOne: false
            referencedRelation: "vw_documentos_envio_estados"
            referencedColumns: ["conta_id"]
          },
          {
            foreignKeyName: "contas_pagar_documentos_conta_id_fkey"
            columns: ["conta_pagar_id"]
            isOneToOne: false
            referencedRelation: "vw_pj_pagamentos"
            referencedColumns: ["cpr_id"]
          },
        ]
      }
      contas_pagar_historico: {
        Row: {
          conta_id: string
          created_at: string | null
          id: string
          observacao: string | null
          status_anterior: string | null
          status_novo: string
          usuario_id: string | null
        }
        Insert: {
          conta_id: string
          created_at?: string | null
          id?: string
          observacao?: string | null
          status_anterior?: string | null
          status_novo: string
          usuario_id?: string | null
        }
        Update: {
          conta_id?: string
          created_at?: string | null
          id?: string
          observacao?: string | null
          status_anterior?: string | null
          status_novo?: string
          usuario_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "contas_pagar_historico_conta_id_fkey"
            columns: ["conta_id"]
            isOneToOne: false
            referencedRelation: "contas_pagar"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contas_pagar_historico_conta_id_fkey"
            columns: ["conta_id"]
            isOneToOne: false
            referencedRelation: "contas_pagar_receber"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contas_pagar_historico_conta_id_fkey"
            columns: ["conta_id"]
            isOneToOne: false
            referencedRelation: "contas_pagar_receber_ativas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contas_pagar_historico_conta_id_fkey"
            columns: ["conta_id"]
            isOneToOne: false
            referencedRelation: "v_cpr_bola_redonda"
            referencedColumns: ["cpr_id"]
          },
          {
            foreignKeyName: "contas_pagar_historico_conta_id_fkey"
            columns: ["conta_id"]
            isOneToOne: false
            referencedRelation: "vw_conciliacao_furos"
            referencedColumns: ["sugestao_cpr_id"]
          },
          {
            foreignKeyName: "contas_pagar_historico_conta_id_fkey"
            columns: ["conta_id"]
            isOneToOne: false
            referencedRelation: "vw_contas_pagar_consolidado"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contas_pagar_historico_conta_id_fkey"
            columns: ["conta_id"]
            isOneToOne: false
            referencedRelation: "vw_despesas_match_sugestoes"
            referencedColumns: ["cpr_id"]
          },
          {
            foreignKeyName: "contas_pagar_historico_conta_id_fkey"
            columns: ["conta_id"]
            isOneToOne: false
            referencedRelation: "vw_documentos_envio_estados"
            referencedColumns: ["conta_id"]
          },
          {
            foreignKeyName: "contas_pagar_historico_conta_id_fkey"
            columns: ["conta_id"]
            isOneToOne: false
            referencedRelation: "vw_pj_pagamentos"
            referencedColumns: ["cpr_id"]
          },
        ]
      }
      contas_pagar_itens: {
        Row: {
          cfop: string | null
          codigo_produto: string | null
          conta_pagar_id: string
          created_at: string | null
          descricao: string
          id: string
          ncm: string | null
          plano_contas_id: string | null
          quantidade: number | null
          unidade: string | null
          valor_cofins: number | null
          valor_icms: number | null
          valor_ipi: number | null
          valor_pis: number | null
          valor_total: number | null
          valor_unitario: number | null
        }
        Insert: {
          cfop?: string | null
          codigo_produto?: string | null
          conta_pagar_id: string
          created_at?: string | null
          descricao: string
          id?: string
          ncm?: string | null
          plano_contas_id?: string | null
          quantidade?: number | null
          unidade?: string | null
          valor_cofins?: number | null
          valor_icms?: number | null
          valor_ipi?: number | null
          valor_pis?: number | null
          valor_total?: number | null
          valor_unitario?: number | null
        }
        Update: {
          cfop?: string | null
          codigo_produto?: string | null
          conta_pagar_id?: string
          created_at?: string | null
          descricao?: string
          id?: string
          ncm?: string | null
          plano_contas_id?: string | null
          quantidade?: number | null
          unidade?: string | null
          valor_cofins?: number | null
          valor_icms?: number | null
          valor_ipi?: number | null
          valor_pis?: number | null
          valor_total?: number | null
          valor_unitario?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "contas_pagar_itens_conta_pagar_id_fkey"
            columns: ["conta_pagar_id"]
            isOneToOne: false
            referencedRelation: "contas_pagar"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contas_pagar_itens_conta_pagar_id_fkey"
            columns: ["conta_pagar_id"]
            isOneToOne: false
            referencedRelation: "contas_pagar_receber"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contas_pagar_itens_conta_pagar_id_fkey"
            columns: ["conta_pagar_id"]
            isOneToOne: false
            referencedRelation: "contas_pagar_receber_ativas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contas_pagar_itens_conta_pagar_id_fkey"
            columns: ["conta_pagar_id"]
            isOneToOne: false
            referencedRelation: "v_cpr_bola_redonda"
            referencedColumns: ["cpr_id"]
          },
          {
            foreignKeyName: "contas_pagar_itens_conta_pagar_id_fkey"
            columns: ["conta_pagar_id"]
            isOneToOne: false
            referencedRelation: "vw_conciliacao_furos"
            referencedColumns: ["sugestao_cpr_id"]
          },
          {
            foreignKeyName: "contas_pagar_itens_conta_pagar_id_fkey"
            columns: ["conta_pagar_id"]
            isOneToOne: false
            referencedRelation: "vw_contas_pagar_consolidado"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contas_pagar_itens_conta_pagar_id_fkey"
            columns: ["conta_pagar_id"]
            isOneToOne: false
            referencedRelation: "vw_despesas_match_sugestoes"
            referencedColumns: ["cpr_id"]
          },
          {
            foreignKeyName: "contas_pagar_itens_conta_pagar_id_fkey"
            columns: ["conta_pagar_id"]
            isOneToOne: false
            referencedRelation: "vw_documentos_envio_estados"
            referencedColumns: ["conta_id"]
          },
          {
            foreignKeyName: "contas_pagar_itens_conta_pagar_id_fkey"
            columns: ["conta_pagar_id"]
            isOneToOne: false
            referencedRelation: "vw_pj_pagamentos"
            referencedColumns: ["cpr_id"]
          },
          {
            foreignKeyName: "contas_pagar_itens_plano_contas_id_fkey"
            columns: ["plano_contas_id"]
            isOneToOne: false
            referencedRelation: "plano_contas"
            referencedColumns: ["id"]
          },
        ]
      }
      contas_pagar_receber: {
        Row: {
          aprovado_em: string | null
          aprovado_por: string | null
          bling_id: string | null
          boleto_avulso_justificativa: string | null
          canal_venda_id: string | null
          cartao_id: string | null
          categoria_confirmada: boolean | null
          categoria_sugerida_ia: boolean | null
          centro_custo_id: string | null
          competencia: string | null
          compra_registrada_id: string | null
          compromisso_parcelado_id: string | null
          compromisso_recorrente_id: string | null
          comprovante_url: string | null
          conciliado_em: string | null
          conciliado_por: string | null
          created_at: string | null
          criado_por: string | null
          dados_bancarios_fornecedor: Json | null
          dados_enriquecidos_qive: boolean | null
          dados_pagamento_fornecedor: Json | null
          data_compra: string | null
          data_pagamento: string | null
          data_vencimento: string
          deleted_at: string | null
          deleted_por: string | null
          descricao: string
          docs_status: string | null
          editado_em: string | null
          editado_por: string | null
          email_pagamento_enviado: boolean | null
          enviado_pagamento_em: string | null
          enviado_pagamento_por: string | null
          forma_pagamento_id: string | null
          fornecedor_cliente: string | null
          fornecedor_id: string | null
          id: string
          linha_investimento_id: string | null
          meio_pagamento_id: string
          movimentacao_bancaria_id: string | null
          nf_aplicavel: boolean
          nf_aplicavel_motivo: string | null
          nf_cfop: string | null
          nf_chave_acesso: string | null
          nf_cnpj_emitente: string | null
          nf_data_emissao: string | null
          nf_natureza_operacao: string | null
          nf_ncm: string | null
          nf_numero: string | null
          nf_pdf_url: string | null
          nf_serie: string | null
          nf_valor_impostos: number | null
          nf_valor_produtos: number | null
          nf_xml_url: string | null
          nfs_stage_documento_id: string | null
          numero_parcela: number | null
          observacao: string | null
          observacao_pagamento: string | null
          observacao_pagamento_manual: string | null
          origem: string | null
          pagamento_com_pendencia: boolean
          pago_em: string | null
          pago_em_conta_id: string | null
          pago_por: string | null
          parceiro_id: string | null
          parcela_atual: number | null
          parcela_grupo_id: string | null
          parcelas: number | null
          pasta_contrato_id: string | null
          pasta_contrato_parcela_id: string | null
          pedido_compra_id: string | null
          pendencias_no_envio: string[] | null
          plano_contas_id: string | null
          reembolsa_user_id: string | null
          reembolsa_vinculo_id: string | null
          sla_aprovacao_dias: number | null
          sla_pagamento_dias: number | null
          status: string
          tags: Json
          tarefa_id: string | null
          tem_sugestao_nf: boolean
          tipo: string
          total_parcelas: number | null
          unidade_id: string | null
          updated_at: string | null
          valor: number
          valor_nf_vinculado: number
          valor_original_item: number | null
          valor_pago: number | null
          vinculo_nf_completo: boolean
        }
        Insert: {
          aprovado_em?: string | null
          aprovado_por?: string | null
          bling_id?: string | null
          boleto_avulso_justificativa?: string | null
          canal_venda_id?: string | null
          cartao_id?: string | null
          categoria_confirmada?: boolean | null
          categoria_sugerida_ia?: boolean | null
          centro_custo_id?: string | null
          competencia?: string | null
          compra_registrada_id?: string | null
          compromisso_parcelado_id?: string | null
          compromisso_recorrente_id?: string | null
          comprovante_url?: string | null
          conciliado_em?: string | null
          conciliado_por?: string | null
          created_at?: string | null
          criado_por?: string | null
          dados_bancarios_fornecedor?: Json | null
          dados_enriquecidos_qive?: boolean | null
          dados_pagamento_fornecedor?: Json | null
          data_compra?: string | null
          data_pagamento?: string | null
          data_vencimento: string
          deleted_at?: string | null
          deleted_por?: string | null
          descricao: string
          docs_status?: string | null
          editado_em?: string | null
          editado_por?: string | null
          email_pagamento_enviado?: boolean | null
          enviado_pagamento_em?: string | null
          enviado_pagamento_por?: string | null
          forma_pagamento_id?: string | null
          fornecedor_cliente?: string | null
          fornecedor_id?: string | null
          id?: string
          linha_investimento_id?: string | null
          meio_pagamento_id: string
          movimentacao_bancaria_id?: string | null
          nf_aplicavel?: boolean
          nf_aplicavel_motivo?: string | null
          nf_cfop?: string | null
          nf_chave_acesso?: string | null
          nf_cnpj_emitente?: string | null
          nf_data_emissao?: string | null
          nf_natureza_operacao?: string | null
          nf_ncm?: string | null
          nf_numero?: string | null
          nf_pdf_url?: string | null
          nf_serie?: string | null
          nf_valor_impostos?: number | null
          nf_valor_produtos?: number | null
          nf_xml_url?: string | null
          nfs_stage_documento_id?: string | null
          numero_parcela?: number | null
          observacao?: string | null
          observacao_pagamento?: string | null
          observacao_pagamento_manual?: string | null
          origem?: string | null
          pagamento_com_pendencia?: boolean
          pago_em?: string | null
          pago_em_conta_id?: string | null
          pago_por?: string | null
          parceiro_id?: string | null
          parcela_atual?: number | null
          parcela_grupo_id?: string | null
          parcelas?: number | null
          pasta_contrato_id?: string | null
          pasta_contrato_parcela_id?: string | null
          pedido_compra_id?: string | null
          pendencias_no_envio?: string[] | null
          plano_contas_id?: string | null
          reembolsa_user_id?: string | null
          reembolsa_vinculo_id?: string | null
          sla_aprovacao_dias?: number | null
          sla_pagamento_dias?: number | null
          status?: string
          tags?: Json
          tarefa_id?: string | null
          tem_sugestao_nf?: boolean
          tipo?: string
          total_parcelas?: number | null
          unidade_id?: string | null
          updated_at?: string | null
          valor: number
          valor_nf_vinculado?: number
          valor_original_item?: number | null
          valor_pago?: number | null
          vinculo_nf_completo?: boolean
        }
        Update: {
          aprovado_em?: string | null
          aprovado_por?: string | null
          bling_id?: string | null
          boleto_avulso_justificativa?: string | null
          canal_venda_id?: string | null
          cartao_id?: string | null
          categoria_confirmada?: boolean | null
          categoria_sugerida_ia?: boolean | null
          centro_custo_id?: string | null
          competencia?: string | null
          compra_registrada_id?: string | null
          compromisso_parcelado_id?: string | null
          compromisso_recorrente_id?: string | null
          comprovante_url?: string | null
          conciliado_em?: string | null
          conciliado_por?: string | null
          created_at?: string | null
          criado_por?: string | null
          dados_bancarios_fornecedor?: Json | null
          dados_enriquecidos_qive?: boolean | null
          dados_pagamento_fornecedor?: Json | null
          data_compra?: string | null
          data_pagamento?: string | null
          data_vencimento?: string
          deleted_at?: string | null
          deleted_por?: string | null
          descricao?: string
          docs_status?: string | null
          editado_em?: string | null
          editado_por?: string | null
          email_pagamento_enviado?: boolean | null
          enviado_pagamento_em?: string | null
          enviado_pagamento_por?: string | null
          forma_pagamento_id?: string | null
          fornecedor_cliente?: string | null
          fornecedor_id?: string | null
          id?: string
          linha_investimento_id?: string | null
          meio_pagamento_id?: string
          movimentacao_bancaria_id?: string | null
          nf_aplicavel?: boolean
          nf_aplicavel_motivo?: string | null
          nf_cfop?: string | null
          nf_chave_acesso?: string | null
          nf_cnpj_emitente?: string | null
          nf_data_emissao?: string | null
          nf_natureza_operacao?: string | null
          nf_ncm?: string | null
          nf_numero?: string | null
          nf_pdf_url?: string | null
          nf_serie?: string | null
          nf_valor_impostos?: number | null
          nf_valor_produtos?: number | null
          nf_xml_url?: string | null
          nfs_stage_documento_id?: string | null
          numero_parcela?: number | null
          observacao?: string | null
          observacao_pagamento?: string | null
          observacao_pagamento_manual?: string | null
          origem?: string | null
          pagamento_com_pendencia?: boolean
          pago_em?: string | null
          pago_em_conta_id?: string | null
          pago_por?: string | null
          parceiro_id?: string | null
          parcela_atual?: number | null
          parcela_grupo_id?: string | null
          parcelas?: number | null
          pasta_contrato_id?: string | null
          pasta_contrato_parcela_id?: string | null
          pedido_compra_id?: string | null
          pendencias_no_envio?: string[] | null
          plano_contas_id?: string | null
          reembolsa_user_id?: string | null
          reembolsa_vinculo_id?: string | null
          sla_aprovacao_dias?: number | null
          sla_pagamento_dias?: number | null
          status?: string
          tags?: Json
          tarefa_id?: string | null
          tem_sugestao_nf?: boolean
          tipo?: string
          total_parcelas?: number | null
          unidade_id?: string | null
          updated_at?: string | null
          valor?: number
          valor_nf_vinculado?: number
          valor_original_item?: number | null
          valor_pago?: number | null
          vinculo_nf_completo?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "contas_pagar_receber_canal_venda_id_fkey"
            columns: ["canal_venda_id"]
            isOneToOne: false
            referencedRelation: "canais_venda"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contas_pagar_receber_cartao_id_fkey"
            columns: ["cartao_id"]
            isOneToOne: false
            referencedRelation: "cartoes_credito"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contas_pagar_receber_centro_custo_id_fkey"
            columns: ["centro_custo_id"]
            isOneToOne: false
            referencedRelation: "centros_custo"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contas_pagar_receber_centro_custo_id_fkey"
            columns: ["centro_custo_id"]
            isOneToOne: false
            referencedRelation: "vw_custo_pessoas"
            referencedColumns: ["centro_custo_id"]
          },
          {
            foreignKeyName: "contas_pagar_receber_centro_custo_id_fkey"
            columns: ["centro_custo_id"]
            isOneToOne: false
            referencedRelation: "vw_dimensionamento_areas"
            referencedColumns: ["centro_custo_id"]
          },
          {
            foreignKeyName: "contas_pagar_receber_compra_registrada_id_fkey"
            columns: ["compra_registrada_id"]
            isOneToOne: false
            referencedRelation: "compras_registradas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contas_pagar_receber_compromisso_parcelado_id_fkey"
            columns: ["compromisso_parcelado_id"]
            isOneToOne: false
            referencedRelation: "compromissos_parcelados"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contas_pagar_receber_compromisso_recorrente_id_fkey"
            columns: ["compromisso_recorrente_id"]
            isOneToOne: false
            referencedRelation: "compromissos_recorrentes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contas_pagar_receber_forma_pagamento_id_fkey"
            columns: ["forma_pagamento_id"]
            isOneToOne: false
            referencedRelation: "formas_pagamento"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contas_pagar_receber_linha_investimento_id_fkey"
            columns: ["linha_investimento_id"]
            isOneToOne: false
            referencedRelation: "linhas_investimento"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contas_pagar_receber_linha_investimento_id_fkey"
            columns: ["linha_investimento_id"]
            isOneToOne: false
            referencedRelation: "vw_linhas_investimento_kpis"
            referencedColumns: ["linha_id"]
          },
          {
            foreignKeyName: "contas_pagar_receber_meio_pagamento_id_fkey"
            columns: ["meio_pagamento_id"]
            isOneToOne: false
            referencedRelation: "meios_pagamento"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contas_pagar_receber_movimentacao_bancaria_id_fkey"
            columns: ["movimentacao_bancaria_id"]
            isOneToOne: false
            referencedRelation: "movimentacoes_bancarias"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contas_pagar_receber_movimentacao_bancaria_id_fkey"
            columns: ["movimentacao_bancaria_id"]
            isOneToOne: false
            referencedRelation: "vw_conciliacao_cartao_sugestoes"
            referencedColumns: ["ofx_id"]
          },
          {
            foreignKeyName: "contas_pagar_receber_movimentacao_bancaria_id_fkey"
            columns: ["movimentacao_bancaria_id"]
            isOneToOne: false
            referencedRelation: "vw_conciliacao_furos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contas_pagar_receber_movimentacao_bancaria_id_fkey"
            columns: ["movimentacao_bancaria_id"]
            isOneToOne: false
            referencedRelation: "vw_despesas_match_nf_sugestoes"
            referencedColumns: ["mov_id"]
          },
          {
            foreignKeyName: "contas_pagar_receber_movimentacao_bancaria_id_fkey"
            columns: ["movimentacao_bancaria_id"]
            isOneToOne: false
            referencedRelation: "vw_despesas_match_sugestoes"
            referencedColumns: ["mov_id"]
          },
          {
            foreignKeyName: "contas_pagar_receber_movimentacao_bancaria_id_fkey"
            columns: ["movimentacao_bancaria_id"]
            isOneToOne: false
            referencedRelation: "vw_pares_transferencia_sugeridos"
            referencedColumns: ["credito_id"]
          },
          {
            foreignKeyName: "contas_pagar_receber_movimentacao_bancaria_id_fkey"
            columns: ["movimentacao_bancaria_id"]
            isOneToOne: false
            referencedRelation: "vw_pares_transferencia_sugeridos"
            referencedColumns: ["debito_id"]
          },
          {
            foreignKeyName: "contas_pagar_receber_movimentacao_bancaria_id_fkey"
            columns: ["movimentacao_bancaria_id"]
            isOneToOne: false
            referencedRelation: "vw_recebivel_b2c_pedido"
            referencedColumns: ["movimentacao_id"]
          },
          {
            foreignKeyName: "contas_pagar_receber_nfs_stage_documento_id_fkey"
            columns: ["nfs_stage_documento_id"]
            isOneToOne: false
            referencedRelation: "nfs_stage_documentos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contas_pagar_receber_pago_em_conta_id_fkey"
            columns: ["pago_em_conta_id"]
            isOneToOne: false
            referencedRelation: "contas_bancarias"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contas_pagar_receber_parceiro_id_fkey"
            columns: ["parceiro_id"]
            isOneToOne: false
            referencedRelation: "parceiros_comerciais"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contas_pagar_receber_parceiro_id_fkey"
            columns: ["parceiro_id"]
            isOneToOne: false
            referencedRelation: "v_credito_resumo_financeiro"
            referencedColumns: ["parceiro_id"]
          },
          {
            foreignKeyName: "contas_pagar_receber_parceiro_id_fkey"
            columns: ["parceiro_id"]
            isOneToOne: false
            referencedRelation: "vw_logistica_agregado"
            referencedColumns: ["transportadora_id"]
          },
          {
            foreignKeyName: "contas_pagar_receber_parceiro_id_fkey"
            columns: ["parceiro_id"]
            isOneToOne: false
            referencedRelation: "vw_recebivel_por_conta"
            referencedColumns: ["conta_id"]
          },
          {
            foreignKeyName: "contas_pagar_receber_pasta_contrato_id_fkey"
            columns: ["pasta_contrato_id"]
            isOneToOne: false
            referencedRelation: "pasta_contratos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contas_pagar_receber_pasta_contrato_parcela_id_fkey"
            columns: ["pasta_contrato_parcela_id"]
            isOneToOne: false
            referencedRelation: "pasta_contrato_parcelas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contas_pagar_receber_pedido_compra_id_fkey"
            columns: ["pedido_compra_id"]
            isOneToOne: false
            referencedRelation: "pedidos_compra"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contas_pagar_receber_plano_contas_id_fkey"
            columns: ["plano_contas_id"]
            isOneToOne: false
            referencedRelation: "plano_contas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contas_pagar_receber_reembolsa_vinculo_id_fkey"
            columns: ["reembolsa_vinculo_id"]
            isOneToOne: false
            referencedRelation: "vinculos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contas_pagar_receber_reembolsa_vinculo_id_fkey"
            columns: ["reembolsa_vinculo_id"]
            isOneToOne: false
            referencedRelation: "vw_custo_pessoas"
            referencedColumns: ["vinculo_id"]
          },
          {
            foreignKeyName: "contas_pagar_receber_reembolsa_vinculo_id_fkey"
            columns: ["reembolsa_vinculo_id"]
            isOneToOne: false
            referencedRelation: "vw_nf_vinculo_pessoa"
            referencedColumns: ["vinculo_id"]
          },
          {
            foreignKeyName: "contas_pagar_receber_reembolsa_vinculo_id_fkey"
            columns: ["reembolsa_vinculo_id"]
            isOneToOne: false
            referencedRelation: "vw_organograma"
            referencedColumns: ["vinculo_id"]
          },
          {
            foreignKeyName: "contas_pagar_receber_reembolsa_vinculo_id_fkey"
            columns: ["reembolsa_vinculo_id"]
            isOneToOne: false
            referencedRelation: "vw_pj_notas_fiscais"
            referencedColumns: ["vinculo_id"]
          },
          {
            foreignKeyName: "contas_pagar_receber_reembolsa_vinculo_id_fkey"
            columns: ["reembolsa_vinculo_id"]
            isOneToOne: false
            referencedRelation: "vw_pj_pagamentos"
            referencedColumns: ["vinculo_id"]
          },
          {
            foreignKeyName: "contas_pagar_receber_reembolsa_vinculo_id_fkey"
            columns: ["reembolsa_vinculo_id"]
            isOneToOne: false
            referencedRelation: "vw_vinculo_custo_total"
            referencedColumns: ["vinculo_id"]
          },
          {
            foreignKeyName: "contas_pagar_receber_unidade_id_fkey"
            columns: ["unidade_id"]
            isOneToOne: false
            referencedRelation: "unidades"
            referencedColumns: ["id"]
          },
        ]
      }
      contas_pagar_receber_audit_delete: {
        Row: {
          apagado_em: string
          apagado_por: string | null
          conta_id: string
          id: string
          motivo: string | null
          snapshot: Json
        }
        Insert: {
          apagado_em?: string
          apagado_por?: string | null
          conta_id: string
          id?: string
          motivo?: string | null
          snapshot: Json
        }
        Update: {
          apagado_em?: string
          apagado_por?: string | null
          conta_id?: string
          id?: string
          motivo?: string | null
          snapshot?: Json
        }
        Relationships: []
      }
      contrato_pj_acessos_sistemas: {
        Row: {
          contrato_pj_id: string
          created_at: string
          data_concessao: string | null
          id: string
          observacoes: string | null
          sistema: string
          tem_acesso: boolean
          updated_at: string
          usuario: string | null
        }
        Insert: {
          contrato_pj_id: string
          created_at?: string
          data_concessao?: string | null
          id?: string
          observacoes?: string | null
          sistema: string
          tem_acesso?: boolean
          updated_at?: string
          usuario?: string | null
        }
        Update: {
          contrato_pj_id?: string
          created_at?: string
          data_concessao?: string | null
          id?: string
          observacoes?: string | null
          sistema?: string
          tem_acesso?: boolean
          updated_at?: string
          usuario?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "contrato_pj_acessos_sistemas_contrato_pj_id_fkey"
            columns: ["contrato_pj_id"]
            isOneToOne: false
            referencedRelation: "contratos_pj"
            referencedColumns: ["id"]
          },
        ]
      }
      contrato_pj_equipamentos: {
        Row: {
          contrato_pj_id: string
          created_at: string
          data_devolucao: string | null
          data_entrega: string | null
          estado: string
          id: string
          marca: string | null
          modelo: string | null
          numero_patrimonio: string | null
          numero_serie: string | null
          observacoes: string | null
          termo_responsabilidade_url: string | null
          tipo: string
          updated_at: string
        }
        Insert: {
          contrato_pj_id: string
          created_at?: string
          data_devolucao?: string | null
          data_entrega?: string | null
          estado?: string
          id?: string
          marca?: string | null
          modelo?: string | null
          numero_patrimonio?: string | null
          numero_serie?: string | null
          observacoes?: string | null
          termo_responsabilidade_url?: string | null
          tipo: string
          updated_at?: string
        }
        Update: {
          contrato_pj_id?: string
          created_at?: string
          data_devolucao?: string | null
          data_entrega?: string | null
          estado?: string
          id?: string
          marca?: string | null
          modelo?: string | null
          numero_patrimonio?: string | null
          numero_serie?: string | null
          observacoes?: string | null
          termo_responsabilidade_url?: string | null
          tipo?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "contrato_pj_equipamentos_contrato_pj_id_fkey"
            columns: ["contrato_pj_id"]
            isOneToOne: false
            referencedRelation: "contratos_pj"
            referencedColumns: ["id"]
          },
        ]
      }
      contratos_pj: {
        Row: {
          acesso_revogado_em: string | null
          agencia: string | null
          bairro: string | null
          banco_codigo: string | null
          banco_nome: string | null
          cargo_id: string | null
          categoria_pj: string
          cep: string | null
          chave_pix: string | null
          cidade: string | null
          cnpj: string
          complemento: string | null
          conta: string | null
          contato_email: string | null
          contato_emergencia_nome: string | null
          contato_emergencia_telefone: string | null
          contato_nome: string
          contato_telefone: string | null
          contrato_assinado: boolean
          cpf: string | null
          created_at: string
          created_by: string | null
          data_fim: string | null
          data_inicio: string
          data_nascimento: string | null
          departamento: string
          departamento_id: string | null
          dia_vencimento: number | null
          email_corporativo: string | null
          email_pessoal: string | null
          estado_civil: string | null
          etnia: string | null
          forma_pagamento: string
          foto_url: string | null
          genero: string | null
          gestor_direto_id: string | null
          id: string
          inscricao_estadual: string | null
          inscricao_municipal: string | null
          logradouro: string | null
          nacionalidade: string | null
          nome_fantasia: string | null
          nome_mae: string | null
          nome_pai: string | null
          numero: string | null
          objeto: string | null
          observacoes: string | null
          orgao_emissor: string | null
          parceiro_comercial_id: string | null
          razao_social: string
          renovacao_automatica: boolean
          rg: string | null
          status: string
          telefone: string | null
          telefone_corporativo: string | null
          tipo_conta: string | null
          tipo_servico: string
          uf: string | null
          unidade_id: string | null
          updated_at: string
          user_id: string | null
          valor_base: number | null
          valor_beneficios_extras: number | null
          valor_mensal: number
          valor_transporte: number | null
        }
        Insert: {
          acesso_revogado_em?: string | null
          agencia?: string | null
          bairro?: string | null
          banco_codigo?: string | null
          banco_nome?: string | null
          cargo_id?: string | null
          categoria_pj?: string
          cep?: string | null
          chave_pix?: string | null
          cidade?: string | null
          cnpj: string
          complemento?: string | null
          conta?: string | null
          contato_email?: string | null
          contato_emergencia_nome?: string | null
          contato_emergencia_telefone?: string | null
          contato_nome: string
          contato_telefone?: string | null
          contrato_assinado?: boolean
          cpf?: string | null
          created_at?: string
          created_by?: string | null
          data_fim?: string | null
          data_inicio: string
          data_nascimento?: string | null
          departamento: string
          departamento_id?: string | null
          dia_vencimento?: number | null
          email_corporativo?: string | null
          email_pessoal?: string | null
          estado_civil?: string | null
          etnia?: string | null
          forma_pagamento?: string
          foto_url?: string | null
          genero?: string | null
          gestor_direto_id?: string | null
          id?: string
          inscricao_estadual?: string | null
          inscricao_municipal?: string | null
          logradouro?: string | null
          nacionalidade?: string | null
          nome_fantasia?: string | null
          nome_mae?: string | null
          nome_pai?: string | null
          numero?: string | null
          objeto?: string | null
          observacoes?: string | null
          orgao_emissor?: string | null
          parceiro_comercial_id?: string | null
          razao_social: string
          renovacao_automatica?: boolean
          rg?: string | null
          status?: string
          telefone?: string | null
          telefone_corporativo?: string | null
          tipo_conta?: string | null
          tipo_servico: string
          uf?: string | null
          unidade_id?: string | null
          updated_at?: string
          user_id?: string | null
          valor_base?: number | null
          valor_beneficios_extras?: number | null
          valor_mensal: number
          valor_transporte?: number | null
        }
        Update: {
          acesso_revogado_em?: string | null
          agencia?: string | null
          bairro?: string | null
          banco_codigo?: string | null
          banco_nome?: string | null
          cargo_id?: string | null
          categoria_pj?: string
          cep?: string | null
          chave_pix?: string | null
          cidade?: string | null
          cnpj?: string
          complemento?: string | null
          conta?: string | null
          contato_email?: string | null
          contato_emergencia_nome?: string | null
          contato_emergencia_telefone?: string | null
          contato_nome?: string
          contato_telefone?: string | null
          contrato_assinado?: boolean
          cpf?: string | null
          created_at?: string
          created_by?: string | null
          data_fim?: string | null
          data_inicio?: string
          data_nascimento?: string | null
          departamento?: string
          departamento_id?: string | null
          dia_vencimento?: number | null
          email_corporativo?: string | null
          email_pessoal?: string | null
          estado_civil?: string | null
          etnia?: string | null
          forma_pagamento?: string
          foto_url?: string | null
          genero?: string | null
          gestor_direto_id?: string | null
          id?: string
          inscricao_estadual?: string | null
          inscricao_municipal?: string | null
          logradouro?: string | null
          nacionalidade?: string | null
          nome_fantasia?: string | null
          nome_mae?: string | null
          nome_pai?: string | null
          numero?: string | null
          objeto?: string | null
          observacoes?: string | null
          orgao_emissor?: string | null
          parceiro_comercial_id?: string | null
          razao_social?: string
          renovacao_automatica?: boolean
          rg?: string | null
          status?: string
          telefone?: string | null
          telefone_corporativo?: string | null
          tipo_conta?: string | null
          tipo_servico?: string
          uf?: string | null
          unidade_id?: string | null
          updated_at?: string
          user_id?: string | null
          valor_base?: number | null
          valor_beneficios_extras?: number | null
          valor_mensal?: number
          valor_transporte?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "contratos_pj_cargo_id_fkey"
            columns: ["cargo_id"]
            isOneToOne: false
            referencedRelation: "cargos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contratos_pj_departamento_id_fkey"
            columns: ["departamento_id"]
            isOneToOne: false
            referencedRelation: "parametros"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contratos_pj_gestor_direto_id_fkey"
            columns: ["gestor_direto_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contratos_pj_parceiro_comercial_id_fkey"
            columns: ["parceiro_comercial_id"]
            isOneToOne: false
            referencedRelation: "parceiros_comerciais"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contratos_pj_parceiro_comercial_id_fkey"
            columns: ["parceiro_comercial_id"]
            isOneToOne: false
            referencedRelation: "v_credito_resumo_financeiro"
            referencedColumns: ["parceiro_id"]
          },
          {
            foreignKeyName: "contratos_pj_parceiro_comercial_id_fkey"
            columns: ["parceiro_comercial_id"]
            isOneToOne: false
            referencedRelation: "vw_logistica_agregado"
            referencedColumns: ["transportadora_id"]
          },
          {
            foreignKeyName: "contratos_pj_parceiro_comercial_id_fkey"
            columns: ["parceiro_comercial_id"]
            isOneToOne: false
            referencedRelation: "vw_recebivel_por_conta"
            referencedColumns: ["conta_id"]
          },
          {
            foreignKeyName: "contratos_pj_unidade_id_fkey"
            columns: ["unidade_id"]
            isOneToOne: false
            referencedRelation: "unidades"
            referencedColumns: ["id"]
          },
        ]
      }
      convites_cadastro: {
        Row: {
          cargo: string | null
          cargo_id: string | null
          colaborador_id: string | null
          contrato_pj_id: string | null
          created_at: string
          criado_por: string | null
          dados_contratacao: Json | null
          dados_preenchidos: Json | null
          data_inicio_prevista: string | null
          departamento: string | null
          departamento_id: string | null
          email: string
          expira_em: string
          grupo_acesso_id: string | null
          id: string
          lembretes_ativos: boolean
          lembretes_suspenso_em: string | null
          lembretes_suspenso_por: string | null
          lider_direto_id: string | null
          nome: string
          observacoes_colaborador: string | null
          origem: string
          prazo_dias: number
          preenchido_em: string | null
          salario_previsto: number | null
          status: string
          tipo: string
          token: string
          unidade_id: string | null
          updated_at: string
        }
        Insert: {
          cargo?: string | null
          cargo_id?: string | null
          colaborador_id?: string | null
          contrato_pj_id?: string | null
          created_at?: string
          criado_por?: string | null
          dados_contratacao?: Json | null
          dados_preenchidos?: Json | null
          data_inicio_prevista?: string | null
          departamento?: string | null
          departamento_id?: string | null
          email: string
          expira_em?: string
          grupo_acesso_id?: string | null
          id?: string
          lembretes_ativos?: boolean
          lembretes_suspenso_em?: string | null
          lembretes_suspenso_por?: string | null
          lider_direto_id?: string | null
          nome: string
          observacoes_colaborador?: string | null
          origem?: string
          prazo_dias?: number
          preenchido_em?: string | null
          salario_previsto?: number | null
          status?: string
          tipo: string
          token?: string
          unidade_id?: string | null
          updated_at?: string
        }
        Update: {
          cargo?: string | null
          cargo_id?: string | null
          colaborador_id?: string | null
          contrato_pj_id?: string | null
          created_at?: string
          criado_por?: string | null
          dados_contratacao?: Json | null
          dados_preenchidos?: Json | null
          data_inicio_prevista?: string | null
          departamento?: string | null
          departamento_id?: string | null
          email?: string
          expira_em?: string
          grupo_acesso_id?: string | null
          id?: string
          lembretes_ativos?: boolean
          lembretes_suspenso_em?: string | null
          lembretes_suspenso_por?: string | null
          lider_direto_id?: string | null
          nome?: string
          observacoes_colaborador?: string | null
          origem?: string
          prazo_dias?: number
          preenchido_em?: string | null
          salario_previsto?: number | null
          status?: string
          tipo?: string
          token?: string
          unidade_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "convites_cadastro_cargo_id_fkey"
            columns: ["cargo_id"]
            isOneToOne: false
            referencedRelation: "cargos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "convites_cadastro_colaborador_id_fkey"
            columns: ["colaborador_id"]
            isOneToOne: false
            referencedRelation: "colaboradores_clt"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "convites_cadastro_contrato_pj_id_fkey"
            columns: ["contrato_pj_id"]
            isOneToOne: false
            referencedRelation: "contratos_pj"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "convites_cadastro_departamento_id_fkey"
            columns: ["departamento_id"]
            isOneToOne: false
            referencedRelation: "parametros"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "convites_cadastro_grupo_acesso_id_fkey"
            columns: ["grupo_acesso_id"]
            isOneToOne: false
            referencedRelation: "grupos_acesso"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "convites_cadastro_lider_direto_id_fkey"
            columns: ["lider_direto_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "convites_cadastro_unidade_id_fkey"
            columns: ["unidade_id"]
            isOneToOne: false
            referencedRelation: "unidades"
            referencedColumns: ["id"]
          },
        ]
      }
      correios_lancamentos: {
        Row: {
          atualizado_em: string
          cartao_postagem: string | null
          centro_custo: string | null
          cep_destino: string | null
          cep_origem: string | null
          codigo_servico: string | null
          contrato: string | null
          custo_transportadora: number | null
          data_postagem: string | null
          descricao_servico: string | null
          empresa_frete: string
          etiqueta: string
          id: string
          importado_em: string
          margem_intermediario: number | null
          municipio_destino: string | null
          municipio_origem: string | null
          nome_cliente: string | null
          numero_documento: string | null
          origem_dado: string
          peso: number | null
          quantidade_itens: number | null
          uf_destino: string | null
          uf_origem: string | null
          valor_declarado: number | null
          valor_desconto: number | null
          valor_servico: number | null
          valor_unitario: number | null
        }
        Insert: {
          atualizado_em?: string
          cartao_postagem?: string | null
          centro_custo?: string | null
          cep_destino?: string | null
          cep_origem?: string | null
          codigo_servico?: string | null
          contrato?: string | null
          custo_transportadora?: number | null
          data_postagem?: string | null
          descricao_servico?: string | null
          empresa_frete?: string
          etiqueta: string
          id?: string
          importado_em?: string
          margem_intermediario?: number | null
          municipio_destino?: string | null
          municipio_origem?: string | null
          nome_cliente?: string | null
          numero_documento?: string | null
          origem_dado?: string
          peso?: number | null
          quantidade_itens?: number | null
          uf_destino?: string | null
          uf_origem?: string | null
          valor_declarado?: number | null
          valor_desconto?: number | null
          valor_servico?: number | null
          valor_unitario?: number | null
        }
        Update: {
          atualizado_em?: string
          cartao_postagem?: string | null
          centro_custo?: string | null
          cep_destino?: string | null
          cep_origem?: string | null
          codigo_servico?: string | null
          contrato?: string | null
          custo_transportadora?: number | null
          data_postagem?: string | null
          descricao_servico?: string | null
          empresa_frete?: string
          etiqueta?: string
          id?: string
          importado_em?: string
          margem_intermediario?: number | null
          municipio_destino?: string | null
          municipio_origem?: string | null
          nome_cliente?: string | null
          numero_documento?: string | null
          origem_dado?: string
          peso?: number | null
          quantidade_itens?: number | null
          uf_destino?: string | null
          uf_origem?: string | null
          valor_declarado?: number | null
          valor_desconto?: number | null
          valor_servico?: number | null
          valor_unitario?: number | null
        }
        Relationships: []
      }
      correios_token: {
        Row: {
          ambiente: string
          atualizado_em: string
          expira_em: string
          id: string
          token: string
        }
        Insert: {
          ambiente?: string
          atualizado_em?: string
          expira_em: string
          id?: string
          token: string
        }
        Update: {
          ambiente?: string
          atualizado_em?: string
          expira_em?: string
          id?: string
          token?: string
        }
        Relationships: []
      }
      custo_pessoas_mensal: {
        Row: {
          ano_mes: string
          capturado_em: string
          centro_custo_id: string | null
          centro_custo_nome: string | null
          custo_total: number
          headcount: number
          id: string
        }
        Insert: {
          ano_mes: string
          capturado_em?: string
          centro_custo_id?: string | null
          centro_custo_nome?: string | null
          custo_total: number
          headcount: number
          id?: string
        }
        Update: {
          ano_mes?: string
          capturado_em?: string
          centro_custo_id?: string | null
          centro_custo_nome?: string | null
          custo_total?: number
          headcount?: number
          id?: string
        }
        Relationships: [
          {
            foreignKeyName: "custo_pessoas_mensal_centro_custo_id_fkey"
            columns: ["centro_custo_id"]
            isOneToOne: false
            referencedRelation: "centros_custo"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "custo_pessoas_mensal_centro_custo_id_fkey"
            columns: ["centro_custo_id"]
            isOneToOne: false
            referencedRelation: "vw_custo_pessoas"
            referencedColumns: ["centro_custo_id"]
          },
          {
            foreignKeyName: "custo_pessoas_mensal_centro_custo_id_fkey"
            columns: ["centro_custo_id"]
            isOneToOne: false
            referencedRelation: "vw_dimensionamento_areas"
            referencedColumns: ["centro_custo_id"]
          },
        ]
      }
      custom_roles: {
        Row: {
          created_at: string
          description: string | null
          id: string
          is_system: boolean
          name: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: string
          is_system?: boolean
          name: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          is_system?: boolean
          name?: string
          updated_at?: string
        }
        Relationships: []
      }
      delegacoes_gestao: {
        Row: {
          ativa: boolean
          criado_em: string
          criado_por: string | null
          data_fim: string
          data_inicio: string
          gestor_original_id: string
          id: string
          motivo: string
          observacao: string | null
          substituto_id: string
        }
        Insert: {
          ativa?: boolean
          criado_em?: string
          criado_por?: string | null
          data_fim: string
          data_inicio: string
          gestor_original_id: string
          id?: string
          motivo: string
          observacao?: string | null
          substituto_id: string
        }
        Update: {
          ativa?: boolean
          criado_em?: string
          criado_por?: string | null
          data_fim?: string
          data_inicio?: string
          gestor_original_id?: string
          id?: string
          motivo?: string
          observacao?: string | null
          substituto_id?: string
        }
        Relationships: []
      }
      departamentos: {
        Row: {
          ativo: boolean
          created_at: string
          id: string
          nome: string
          ordem: number | null
          unidade_id: string | null
          updated_at: string
        }
        Insert: {
          ativo?: boolean
          created_at?: string
          id?: string
          nome: string
          ordem?: number | null
          unidade_id?: string | null
          updated_at?: string
        }
        Update: {
          ativo?: boolean
          created_at?: string
          id?: string
          nome?: string
          ordem?: number | null
          unidade_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "departamentos_unidade_id_fkey"
            columns: ["unidade_id"]
            isOneToOne: false
            referencedRelation: "unidades"
            referencedColumns: ["id"]
          },
        ]
      }
      dependentes: {
        Row: {
          colaborador_id: string
          cpf: string | null
          created_at: string
          data_nascimento: string
          documento_url: string | null
          id: string
          incluir_irrf: boolean | null
          incluir_plano_saude: boolean | null
          nome_completo: string
          parentesco: string
          updated_at: string
        }
        Insert: {
          colaborador_id: string
          cpf?: string | null
          created_at?: string
          data_nascimento: string
          documento_url?: string | null
          id?: string
          incluir_irrf?: boolean | null
          incluir_plano_saude?: boolean | null
          nome_completo: string
          parentesco: string
          updated_at?: string
        }
        Update: {
          colaborador_id?: string
          cpf?: string | null
          created_at?: string
          data_nascimento?: string
          documento_url?: string | null
          id?: string
          incluir_irrf?: boolean | null
          incluir_plano_saude?: boolean | null
          nome_completo?: string
          parentesco?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "dependentes_colaborador_id_fkey"
            columns: ["colaborador_id"]
            isOneToOne: false
            referencedRelation: "colaboradores_clt"
            referencedColumns: ["id"]
          },
        ]
      }
      email_send_log: {
        Row: {
          created_at: string
          error_message: string | null
          id: string
          message_id: string | null
          metadata: Json | null
          recipient_email: string
          status: string
          template_name: string
        }
        Insert: {
          created_at?: string
          error_message?: string | null
          id?: string
          message_id?: string | null
          metadata?: Json | null
          recipient_email: string
          status: string
          template_name: string
        }
        Update: {
          created_at?: string
          error_message?: string | null
          id?: string
          message_id?: string | null
          metadata?: Json | null
          recipient_email?: string
          status?: string
          template_name?: string
        }
        Relationships: []
      }
      email_send_state: {
        Row: {
          auth_email_ttl_minutes: number
          batch_size: number
          id: number
          retry_after_until: string | null
          send_delay_ms: number
          transactional_email_ttl_minutes: number
          updated_at: string
        }
        Insert: {
          auth_email_ttl_minutes?: number
          batch_size?: number
          id?: number
          retry_after_until?: string | null
          send_delay_ms?: number
          transactional_email_ttl_minutes?: number
          updated_at?: string
        }
        Update: {
          auth_email_ttl_minutes?: number
          batch_size?: number
          id?: number
          retry_after_until?: string | null
          send_delay_ms?: number
          transactional_email_ttl_minutes?: number
          updated_at?: string
        }
        Relationships: []
      }
      email_unsubscribe_tokens: {
        Row: {
          created_at: string
          email: string
          id: string
          token: string
          used_at: string | null
        }
        Insert: {
          created_at?: string
          email: string
          id?: string
          token: string
          used_at?: string | null
        }
        Update: {
          created_at?: string
          email?: string
          id?: string
          token?: string
          used_at?: string | null
        }
        Relationships: []
      }
      entrevistas_candidato: {
        Row: {
          candidato_id: string
          created_at: string | null
          fit_cultural: number | null
          id: string
          impressao_geral: number | null
          observacoes: string | null
          pontos_atencao: string | null
          pontos_fortes: string | null
          preenchido_por: string | null
          recomendacao: string | null
          tipo: string
          updated_at: string | null
          vaga_id: string
        }
        Insert: {
          candidato_id: string
          created_at?: string | null
          fit_cultural?: number | null
          id?: string
          impressao_geral?: number | null
          observacoes?: string | null
          pontos_atencao?: string | null
          pontos_fortes?: string | null
          preenchido_por?: string | null
          recomendacao?: string | null
          tipo: string
          updated_at?: string | null
          vaga_id: string
        }
        Update: {
          candidato_id?: string
          created_at?: string | null
          fit_cultural?: number | null
          id?: string
          impressao_geral?: number | null
          observacoes?: string | null
          pontos_atencao?: string | null
          pontos_fortes?: string | null
          preenchido_por?: string | null
          recomendacao?: string | null
          tipo?: string
          updated_at?: string | null
          vaga_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "entrevistas_candidato_candidato_id_fkey"
            columns: ["candidato_id"]
            isOneToOne: false
            referencedRelation: "candidatos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "entrevistas_candidato_vaga_id_fkey"
            columns: ["vaga_id"]
            isOneToOne: false
            referencedRelation: "vagas"
            referencedColumns: ["id"]
          },
        ]
      }
      evento_titulo: {
        Row: {
          ator: string
          id: string
          origem: string
          payload: Json | null
          tipo_evento: string
          titulo_id: string
          ts: string
        }
        Insert: {
          ator?: string
          id?: string
          origem: string
          payload?: Json | null
          tipo_evento: string
          titulo_id: string
          ts?: string
        }
        Update: {
          ator?: string
          id?: string
          origem?: string
          payload?: Json | null
          tipo_evento?: string
          titulo_id?: string
          ts?: string
        }
        Relationships: [
          {
            foreignKeyName: "evento_titulo_titulo_id_fkey"
            columns: ["titulo_id"]
            isOneToOne: false
            referencedRelation: "titulo_a_receber"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "evento_titulo_titulo_id_fkey"
            columns: ["titulo_id"]
            isOneToOne: false
            referencedRelation: "vw_previsao_recebimentos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "evento_titulo_titulo_id_fkey"
            columns: ["titulo_id"]
            isOneToOne: false
            referencedRelation: "vw_recebivel_b2b"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "evento_titulo_titulo_id_fkey"
            columns: ["titulo_id"]
            isOneToOne: false
            referencedRelation: "vw_titulos_cobranca"
            referencedColumns: ["id"]
          },
        ]
      }
      extras_catalogo: {
        Row: {
          aplica_a: string
          ativo: boolean
          created_at: string
          created_by: string | null
          id: string
          natureza_padrao: string
          nome: string
          updated_at: string
        }
        Insert: {
          aplica_a?: string
          ativo?: boolean
          created_at?: string
          created_by?: string | null
          id?: string
          natureza_padrao?: string
          nome: string
          updated_at?: string
        }
        Update: {
          aplica_a?: string
          ativo?: boolean
          created_at?: string
          created_by?: string | null
          id?: string
          natureza_padrao?: string
          nome?: string
          updated_at?: string
        }
        Relationships: []
      }
      extrato_importacoes: {
        Row: {
          conta_bancaria_id: string | null
          created_at: string
          divergencia_saldo: number | null
          erro_detalhe: string | null
          fonte_tipo: string
          id: string
          importado_por: string | null
          linhas_duplicadas: number
          linhas_enriquecidas: number
          linhas_lidas: number
          linhas_novas: number
          nome_arquivo: string
          periodo_fim: string | null
          periodo_inicio: string | null
          status: string
          updated_at: string
        }
        Insert: {
          conta_bancaria_id?: string | null
          created_at?: string
          divergencia_saldo?: number | null
          erro_detalhe?: string | null
          fonte_tipo: string
          id?: string
          importado_por?: string | null
          linhas_duplicadas?: number
          linhas_enriquecidas?: number
          linhas_lidas?: number
          linhas_novas?: number
          nome_arquivo: string
          periodo_fim?: string | null
          periodo_inicio?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          conta_bancaria_id?: string | null
          created_at?: string
          divergencia_saldo?: number | null
          erro_detalhe?: string | null
          fonte_tipo?: string
          id?: string
          importado_por?: string | null
          linhas_duplicadas?: number
          linhas_enriquecidas?: number
          linhas_lidas?: number
          linhas_novas?: number
          nome_arquivo?: string
          periodo_fim?: string | null
          periodo_inicio?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "extrato_importacoes_conta_bancaria_id_fkey"
            columns: ["conta_bancaria_id"]
            isOneToOne: false
            referencedRelation: "contas_bancarias"
            referencedColumns: ["id"]
          },
        ]
      }
      fala_fetely_conhecimento: {
        Row: {
          aprovado_em: string | null
          aprovado_por: string | null
          area_negocio: string | null
          ativo: boolean
          cargos_aplicaveis: Json | null
          categoria: string
          conteudo: string
          created_at: string
          criado_por: string | null
          departamentos_aplicaveis: Json | null
          fonte: string | null
          fonte_arquivo_nome: string | null
          fonte_arquivo_url: string | null
          id: string
          lote_importacao_id: string | null
          niveis_aplicaveis: Json | null
          origem: string
          publico_alvo: string
          sugerido_por: string | null
          tags: string[] | null
          titulo: string
          updated_at: string
          versao: number
        }
        Insert: {
          aprovado_em?: string | null
          aprovado_por?: string | null
          area_negocio?: string | null
          ativo?: boolean
          cargos_aplicaveis?: Json | null
          categoria: string
          conteudo: string
          created_at?: string
          criado_por?: string | null
          departamentos_aplicaveis?: Json | null
          fonte?: string | null
          fonte_arquivo_nome?: string | null
          fonte_arquivo_url?: string | null
          id?: string
          lote_importacao_id?: string | null
          niveis_aplicaveis?: Json | null
          origem?: string
          publico_alvo?: string
          sugerido_por?: string | null
          tags?: string[] | null
          titulo: string
          updated_at?: string
          versao?: number
        }
        Update: {
          aprovado_em?: string | null
          aprovado_por?: string | null
          area_negocio?: string | null
          ativo?: boolean
          cargos_aplicaveis?: Json | null
          categoria?: string
          conteudo?: string
          created_at?: string
          criado_por?: string | null
          departamentos_aplicaveis?: Json | null
          fonte?: string | null
          fonte_arquivo_nome?: string | null
          fonte_arquivo_url?: string | null
          id?: string
          lote_importacao_id?: string | null
          niveis_aplicaveis?: Json | null
          origem?: string
          publico_alvo?: string
          sugerido_por?: string | null
          tags?: string[] | null
          titulo?: string
          updated_at?: string
          versao?: number
        }
        Relationships: []
      }
      fala_fetely_conversas: {
        Row: {
          arquivada: boolean
          created_at: string
          favorita: boolean
          id: string
          memorias_extraidas: boolean
          titulo: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          arquivada?: boolean
          created_at?: string
          favorita?: boolean
          id?: string
          memorias_extraidas?: boolean
          titulo?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          arquivada?: boolean
          created_at?: string
          favorita?: boolean
          id?: string
          memorias_extraidas?: boolean
          titulo?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      fala_fetely_feedback: {
        Row: {
          comentario: string | null
          created_at: string
          id: string
          mensagem_id: string
          motivo: string | null
          resposta_esperada: string | null
          user_id: string
          util: boolean
        }
        Insert: {
          comentario?: string | null
          created_at?: string
          id?: string
          mensagem_id: string
          motivo?: string | null
          resposta_esperada?: string | null
          user_id: string
          util: boolean
        }
        Update: {
          comentario?: string | null
          created_at?: string
          id?: string
          mensagem_id?: string
          motivo?: string | null
          resposta_esperada?: string | null
          user_id?: string
          util?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "fala_fetely_feedback_mensagem_id_fkey"
            columns: ["mensagem_id"]
            isOneToOne: false
            referencedRelation: "fala_fetely_mensagens"
            referencedColumns: ["id"]
          },
        ]
      }
      fala_fetely_importacoes_pdf: {
        Row: {
          arquivo_nome: string
          arquivo_url: string
          concluida_em: string | null
          conhecimentos_criados: number | null
          created_at: string
          erro_mensagem: string | null
          id: string
          status: string
          tamanho_bytes: number | null
          user_id: string
        }
        Insert: {
          arquivo_nome: string
          arquivo_url: string
          concluida_em?: string | null
          conhecimentos_criados?: number | null
          created_at?: string
          erro_mensagem?: string | null
          id?: string
          status?: string
          tamanho_bytes?: number | null
          user_id: string
        }
        Update: {
          arquivo_nome?: string
          arquivo_url?: string
          concluida_em?: string | null
          conhecimentos_criados?: number | null
          created_at?: string
          erro_mensagem?: string | null
          id?: string
          status?: string
          tamanho_bytes?: number | null
          user_id?: string
        }
        Relationships: []
      }
      fala_fetely_memoria: {
        Row: {
          ativo: boolean
          conteudo_completo: string | null
          conversa_origem_id: string | null
          created_at: string
          id: string
          mensagem_origem_id: string | null
          origem: string
          relevancia: number
          resumo: string
          tags: string[] | null
          tipo: string
          ultimo_uso: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          ativo?: boolean
          conteudo_completo?: string | null
          conversa_origem_id?: string | null
          created_at?: string
          id?: string
          mensagem_origem_id?: string | null
          origem?: string
          relevancia?: number
          resumo: string
          tags?: string[] | null
          tipo: string
          ultimo_uso?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          ativo?: boolean
          conteudo_completo?: string | null
          conversa_origem_id?: string | null
          created_at?: string
          id?: string
          mensagem_origem_id?: string | null
          origem?: string
          relevancia?: number
          resumo?: string
          tags?: string[] | null
          tipo?: string
          ultimo_uso?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "fala_fetely_memoria_conversa_origem_id_fkey"
            columns: ["conversa_origem_id"]
            isOneToOne: false
            referencedRelation: "fala_fetely_conversas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fala_fetely_memoria_mensagem_origem_id_fkey"
            columns: ["mensagem_origem_id"]
            isOneToOne: false
            referencedRelation: "fala_fetely_mensagens"
            referencedColumns: ["id"]
          },
        ]
      }
      fala_fetely_mensagens: {
        Row: {
          conteudo: string
          conversa_id: string
          created_at: string
          fontes_consultadas: Json | null
          id: string
          papel: string
        }
        Insert: {
          conteudo: string
          conversa_id: string
          created_at?: string
          fontes_consultadas?: Json | null
          id?: string
          papel: string
        }
        Update: {
          conteudo?: string
          conversa_id?: string
          created_at?: string
          fontes_consultadas?: Json | null
          id?: string
          papel?: string
        }
        Relationships: [
          {
            foreignKeyName: "fala_fetely_mensagens_conversa_id_fkey"
            columns: ["conversa_id"]
            isOneToOne: false
            referencedRelation: "fala_fetely_conversas"
            referencedColumns: ["id"]
          },
        ]
      }
      fala_fetely_sugestoes_conhecimento: {
        Row: {
          categoria_sugerida: string | null
          conhecimento_gerado_id: string | null
          correcao_sugerida: string
          created_at: string
          id: string
          mensagem_id: string | null
          observacao_revisao: string | null
          origem: string
          pergunta_original: string | null
          resposta_ia: string | null
          revisado_em: string | null
          revisado_por: string | null
          status: string
          titulo_sugerido: string | null
          user_id: string
        }
        Insert: {
          categoria_sugerida?: string | null
          conhecimento_gerado_id?: string | null
          correcao_sugerida: string
          created_at?: string
          id?: string
          mensagem_id?: string | null
          observacao_revisao?: string | null
          origem?: string
          pergunta_original?: string | null
          resposta_ia?: string | null
          revisado_em?: string | null
          revisado_por?: string | null
          status?: string
          titulo_sugerido?: string | null
          user_id: string
        }
        Update: {
          categoria_sugerida?: string | null
          conhecimento_gerado_id?: string | null
          correcao_sugerida?: string
          created_at?: string
          id?: string
          mensagem_id?: string | null
          observacao_revisao?: string | null
          origem?: string
          pergunta_original?: string | null
          resposta_ia?: string | null
          revisado_em?: string | null
          revisado_por?: string | null
          status?: string
          titulo_sugerido?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "fala_fetely_sugestoes_conhecimento_conhecimento_gerado_id_fkey"
            columns: ["conhecimento_gerado_id"]
            isOneToOne: false
            referencedRelation: "fala_fetely_conhecimento"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fala_fetely_sugestoes_conhecimento_mensagem_id_fkey"
            columns: ["mensagem_id"]
            isOneToOne: false
            referencedRelation: "fala_fetely_mensagens"
            referencedColumns: ["id"]
          },
        ]
      }
      fatura_cartao_lancamentos: {
        Row: {
          centro_custo_id: string | null
          cnpj_estabelecimento: string | null
          compromisso_parcelado_id: string | null
          conta_pagar_id: string | null
          cotacao: number | null
          created_at: string
          data_compra: string
          descricao: string
          descricao_normalizada: string | null
          estabelecimento_descricao: string | null
          estabelecimento_local: string | null
          fatura_id: string
          id: string
          linha_original_csv: string | null
          moeda: string | null
          natureza: string
          nf_vinculada_id: string | null
          num_autorizacao: string | null
          parceiro_id: string | null
          parcela_atual: number | null
          parcela_total: number | null
          plano_contas_id: string | null
          ramo_estabelecimento: string | null
          status: string
          tipo: string
          updated_at: string
          valor: number
          valor_original: number | null
        }
        Insert: {
          centro_custo_id?: string | null
          cnpj_estabelecimento?: string | null
          compromisso_parcelado_id?: string | null
          conta_pagar_id?: string | null
          cotacao?: number | null
          created_at?: string
          data_compra: string
          descricao: string
          descricao_normalizada?: string | null
          estabelecimento_descricao?: string | null
          estabelecimento_local?: string | null
          fatura_id: string
          id?: string
          linha_original_csv?: string | null
          moeda?: string | null
          natureza?: string
          nf_vinculada_id?: string | null
          num_autorizacao?: string | null
          parceiro_id?: string | null
          parcela_atual?: number | null
          parcela_total?: number | null
          plano_contas_id?: string | null
          ramo_estabelecimento?: string | null
          status?: string
          tipo?: string
          updated_at?: string
          valor: number
          valor_original?: number | null
        }
        Update: {
          centro_custo_id?: string | null
          cnpj_estabelecimento?: string | null
          compromisso_parcelado_id?: string | null
          conta_pagar_id?: string | null
          cotacao?: number | null
          created_at?: string
          data_compra?: string
          descricao?: string
          descricao_normalizada?: string | null
          estabelecimento_descricao?: string | null
          estabelecimento_local?: string | null
          fatura_id?: string
          id?: string
          linha_original_csv?: string | null
          moeda?: string | null
          natureza?: string
          nf_vinculada_id?: string | null
          num_autorizacao?: string | null
          parceiro_id?: string | null
          parcela_atual?: number | null
          parcela_total?: number | null
          plano_contas_id?: string | null
          ramo_estabelecimento?: string | null
          status?: string
          tipo?: string
          updated_at?: string
          valor?: number
          valor_original?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "fatura_cartao_lancamentos_centro_custo_id_fkey"
            columns: ["centro_custo_id"]
            isOneToOne: false
            referencedRelation: "centros_custo"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fatura_cartao_lancamentos_centro_custo_id_fkey"
            columns: ["centro_custo_id"]
            isOneToOne: false
            referencedRelation: "vw_custo_pessoas"
            referencedColumns: ["centro_custo_id"]
          },
          {
            foreignKeyName: "fatura_cartao_lancamentos_centro_custo_id_fkey"
            columns: ["centro_custo_id"]
            isOneToOne: false
            referencedRelation: "vw_dimensionamento_areas"
            referencedColumns: ["centro_custo_id"]
          },
          {
            foreignKeyName: "fatura_cartao_lancamentos_conta_pagar_id_fkey"
            columns: ["conta_pagar_id"]
            isOneToOne: false
            referencedRelation: "contas_pagar"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fatura_cartao_lancamentos_conta_pagar_id_fkey"
            columns: ["conta_pagar_id"]
            isOneToOne: false
            referencedRelation: "contas_pagar_receber"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fatura_cartao_lancamentos_conta_pagar_id_fkey"
            columns: ["conta_pagar_id"]
            isOneToOne: false
            referencedRelation: "contas_pagar_receber_ativas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fatura_cartao_lancamentos_conta_pagar_id_fkey"
            columns: ["conta_pagar_id"]
            isOneToOne: false
            referencedRelation: "v_cpr_bola_redonda"
            referencedColumns: ["cpr_id"]
          },
          {
            foreignKeyName: "fatura_cartao_lancamentos_conta_pagar_id_fkey"
            columns: ["conta_pagar_id"]
            isOneToOne: false
            referencedRelation: "vw_conciliacao_furos"
            referencedColumns: ["sugestao_cpr_id"]
          },
          {
            foreignKeyName: "fatura_cartao_lancamentos_conta_pagar_id_fkey"
            columns: ["conta_pagar_id"]
            isOneToOne: false
            referencedRelation: "vw_contas_pagar_consolidado"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fatura_cartao_lancamentos_conta_pagar_id_fkey"
            columns: ["conta_pagar_id"]
            isOneToOne: false
            referencedRelation: "vw_despesas_match_sugestoes"
            referencedColumns: ["cpr_id"]
          },
          {
            foreignKeyName: "fatura_cartao_lancamentos_conta_pagar_id_fkey"
            columns: ["conta_pagar_id"]
            isOneToOne: false
            referencedRelation: "vw_documentos_envio_estados"
            referencedColumns: ["conta_id"]
          },
          {
            foreignKeyName: "fatura_cartao_lancamentos_conta_pagar_id_fkey"
            columns: ["conta_pagar_id"]
            isOneToOne: false
            referencedRelation: "vw_pj_pagamentos"
            referencedColumns: ["cpr_id"]
          },
          {
            foreignKeyName: "fatura_cartao_lancamentos_fatura_id_fkey"
            columns: ["fatura_id"]
            isOneToOne: false
            referencedRelation: "faturas_cartao"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fatura_cartao_lancamentos_fatura_id_fkey"
            columns: ["fatura_id"]
            isOneToOne: false
            referencedRelation: "vw_faturas_cartao_resumo"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fatura_cartao_lancamentos_nf_vinculada_id_fkey"
            columns: ["nf_vinculada_id"]
            isOneToOne: false
            referencedRelation: "contas_pagar"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fatura_cartao_lancamentos_nf_vinculada_id_fkey"
            columns: ["nf_vinculada_id"]
            isOneToOne: false
            referencedRelation: "contas_pagar_receber"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fatura_cartao_lancamentos_nf_vinculada_id_fkey"
            columns: ["nf_vinculada_id"]
            isOneToOne: false
            referencedRelation: "contas_pagar_receber_ativas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fatura_cartao_lancamentos_nf_vinculada_id_fkey"
            columns: ["nf_vinculada_id"]
            isOneToOne: false
            referencedRelation: "v_cpr_bola_redonda"
            referencedColumns: ["cpr_id"]
          },
          {
            foreignKeyName: "fatura_cartao_lancamentos_nf_vinculada_id_fkey"
            columns: ["nf_vinculada_id"]
            isOneToOne: false
            referencedRelation: "vw_conciliacao_furos"
            referencedColumns: ["sugestao_cpr_id"]
          },
          {
            foreignKeyName: "fatura_cartao_lancamentos_nf_vinculada_id_fkey"
            columns: ["nf_vinculada_id"]
            isOneToOne: false
            referencedRelation: "vw_contas_pagar_consolidado"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fatura_cartao_lancamentos_nf_vinculada_id_fkey"
            columns: ["nf_vinculada_id"]
            isOneToOne: false
            referencedRelation: "vw_despesas_match_sugestoes"
            referencedColumns: ["cpr_id"]
          },
          {
            foreignKeyName: "fatura_cartao_lancamentos_nf_vinculada_id_fkey"
            columns: ["nf_vinculada_id"]
            isOneToOne: false
            referencedRelation: "vw_documentos_envio_estados"
            referencedColumns: ["conta_id"]
          },
          {
            foreignKeyName: "fatura_cartao_lancamentos_nf_vinculada_id_fkey"
            columns: ["nf_vinculada_id"]
            isOneToOne: false
            referencedRelation: "vw_pj_pagamentos"
            referencedColumns: ["cpr_id"]
          },
          {
            foreignKeyName: "fatura_cartao_lancamentos_parceiro_id_fkey"
            columns: ["parceiro_id"]
            isOneToOne: false
            referencedRelation: "parceiros_comerciais"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fatura_cartao_lancamentos_parceiro_id_fkey"
            columns: ["parceiro_id"]
            isOneToOne: false
            referencedRelation: "v_credito_resumo_financeiro"
            referencedColumns: ["parceiro_id"]
          },
          {
            foreignKeyName: "fatura_cartao_lancamentos_parceiro_id_fkey"
            columns: ["parceiro_id"]
            isOneToOne: false
            referencedRelation: "vw_logistica_agregado"
            referencedColumns: ["transportadora_id"]
          },
          {
            foreignKeyName: "fatura_cartao_lancamentos_parceiro_id_fkey"
            columns: ["parceiro_id"]
            isOneToOne: false
            referencedRelation: "vw_recebivel_por_conta"
            referencedColumns: ["conta_id"]
          },
          {
            foreignKeyName: "fatura_cartao_lancamentos_plano_contas_id_fkey"
            columns: ["plano_contas_id"]
            isOneToOne: false
            referencedRelation: "plano_contas"
            referencedColumns: ["id"]
          },
        ]
      }
      faturas_cartao: {
        Row: {
          cartao_id: string | null
          conta_bancaria_id: string | null
          conta_pagar_id: string | null
          created_at: string
          criado_por: string | null
          data_emissao: string | null
          data_vencimento: string
          fonte_importacao: string | null
          id: string
          importacao_lote_id: string | null
          numero_documento: string | null
          observacao: string | null
          pdf_nome_original: string | null
          pdf_storage_path: string | null
          periodo_fim: string | null
          periodo_inicio: string | null
          status: string
          updated_at: string
          valor_pagamento_anterior: number | null
          valor_saldo_atraso: number | null
          valor_total: number
          valor_total_calculado: number | null
        }
        Insert: {
          cartao_id?: string | null
          conta_bancaria_id?: string | null
          conta_pagar_id?: string | null
          created_at?: string
          criado_por?: string | null
          data_emissao?: string | null
          data_vencimento: string
          fonte_importacao?: string | null
          id?: string
          importacao_lote_id?: string | null
          numero_documento?: string | null
          observacao?: string | null
          pdf_nome_original?: string | null
          pdf_storage_path?: string | null
          periodo_fim?: string | null
          periodo_inicio?: string | null
          status?: string
          updated_at?: string
          valor_pagamento_anterior?: number | null
          valor_saldo_atraso?: number | null
          valor_total: number
          valor_total_calculado?: number | null
        }
        Update: {
          cartao_id?: string | null
          conta_bancaria_id?: string | null
          conta_pagar_id?: string | null
          created_at?: string
          criado_por?: string | null
          data_emissao?: string | null
          data_vencimento?: string
          fonte_importacao?: string | null
          id?: string
          importacao_lote_id?: string | null
          numero_documento?: string | null
          observacao?: string | null
          pdf_nome_original?: string | null
          pdf_storage_path?: string | null
          periodo_fim?: string | null
          periodo_inicio?: string | null
          status?: string
          updated_at?: string
          valor_pagamento_anterior?: number | null
          valor_saldo_atraso?: number | null
          valor_total?: number
          valor_total_calculado?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "faturas_cartao_cartao_id_fkey"
            columns: ["cartao_id"]
            isOneToOne: false
            referencedRelation: "cartoes_credito"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "faturas_cartao_conta_bancaria_id_fkey"
            columns: ["conta_bancaria_id"]
            isOneToOne: false
            referencedRelation: "contas_bancarias"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "faturas_cartao_conta_pagar_id_fkey"
            columns: ["conta_pagar_id"]
            isOneToOne: false
            referencedRelation: "contas_pagar"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "faturas_cartao_conta_pagar_id_fkey"
            columns: ["conta_pagar_id"]
            isOneToOne: false
            referencedRelation: "contas_pagar_receber"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "faturas_cartao_conta_pagar_id_fkey"
            columns: ["conta_pagar_id"]
            isOneToOne: false
            referencedRelation: "contas_pagar_receber_ativas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "faturas_cartao_conta_pagar_id_fkey"
            columns: ["conta_pagar_id"]
            isOneToOne: false
            referencedRelation: "v_cpr_bola_redonda"
            referencedColumns: ["cpr_id"]
          },
          {
            foreignKeyName: "faturas_cartao_conta_pagar_id_fkey"
            columns: ["conta_pagar_id"]
            isOneToOne: false
            referencedRelation: "vw_conciliacao_furos"
            referencedColumns: ["sugestao_cpr_id"]
          },
          {
            foreignKeyName: "faturas_cartao_conta_pagar_id_fkey"
            columns: ["conta_pagar_id"]
            isOneToOne: false
            referencedRelation: "vw_contas_pagar_consolidado"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "faturas_cartao_conta_pagar_id_fkey"
            columns: ["conta_pagar_id"]
            isOneToOne: false
            referencedRelation: "vw_despesas_match_sugestoes"
            referencedColumns: ["cpr_id"]
          },
          {
            foreignKeyName: "faturas_cartao_conta_pagar_id_fkey"
            columns: ["conta_pagar_id"]
            isOneToOne: false
            referencedRelation: "vw_documentos_envio_estados"
            referencedColumns: ["conta_id"]
          },
          {
            foreignKeyName: "faturas_cartao_conta_pagar_id_fkey"
            columns: ["conta_pagar_id"]
            isOneToOne: false
            referencedRelation: "vw_pj_pagamentos"
            referencedColumns: ["cpr_id"]
          },
        ]
      }
      ferias_periodos: {
        Row: {
          colaborador_id: string
          created_at: string
          dias_direito: number
          dias_gozados: number
          dias_vendidos: number
          id: string
          observacoes: string | null
          periodo_fim: string
          periodo_inicio: string
          saldo: number | null
          status: string
          updated_at: string
        }
        Insert: {
          colaborador_id: string
          created_at?: string
          dias_direito?: number
          dias_gozados?: number
          dias_vendidos?: number
          id?: string
          observacoes?: string | null
          periodo_fim: string
          periodo_inicio: string
          saldo?: number | null
          status?: string
          updated_at?: string
        }
        Update: {
          colaborador_id?: string
          created_at?: string
          dias_direito?: number
          dias_gozados?: number
          dias_vendidos?: number
          id?: string
          observacoes?: string | null
          periodo_fim?: string
          periodo_inicio?: string
          saldo?: number | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "ferias_periodos_colaborador_id_fkey"
            columns: ["colaborador_id"]
            isOneToOne: false
            referencedRelation: "colaboradores_clt"
            referencedColumns: ["id"]
          },
        ]
      }
      ferias_periodos_pj: {
        Row: {
          contrato_id: string
          created_at: string
          dias_direito: number
          dias_gozados: number
          dias_vendidos: number
          id: string
          observacoes: string | null
          periodo_fim: string
          periodo_inicio: string
          saldo: number | null
          status: string
          updated_at: string
        }
        Insert: {
          contrato_id: string
          created_at?: string
          dias_direito?: number
          dias_gozados?: number
          dias_vendidos?: number
          id?: string
          observacoes?: string | null
          periodo_fim: string
          periodo_inicio: string
          saldo?: number | null
          status?: string
          updated_at?: string
        }
        Update: {
          contrato_id?: string
          created_at?: string
          dias_direito?: number
          dias_gozados?: number
          dias_vendidos?: number
          id?: string
          observacoes?: string | null
          periodo_fim?: string
          periodo_inicio?: string
          saldo?: number | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "ferias_periodos_pj_contrato_id_fkey"
            columns: ["contrato_id"]
            isOneToOne: false
            referencedRelation: "contratos_pj"
            referencedColumns: ["id"]
          },
        ]
      }
      ferias_pj: {
        Row: {
          contrato_id: string
          created_at: string
          data_fim: string
          data_inicio: string
          dias: number
          id: string
          observacoes: string | null
          periodo_pj_id: string | null
          status: string
          tipo: string
          updated_at: string
        }
        Insert: {
          contrato_id: string
          created_at?: string
          data_fim: string
          data_inicio: string
          dias: number
          id?: string
          observacoes?: string | null
          periodo_pj_id?: string | null
          status?: string
          tipo?: string
          updated_at?: string
        }
        Update: {
          contrato_id?: string
          created_at?: string
          data_fim?: string
          data_inicio?: string
          dias?: number
          id?: string
          observacoes?: string | null
          periodo_pj_id?: string | null
          status?: string
          tipo?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "ferias_pj_contrato_id_fkey"
            columns: ["contrato_id"]
            isOneToOne: false
            referencedRelation: "contratos_pj"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ferias_pj_periodo_pj_id_fkey"
            columns: ["periodo_pj_id"]
            isOneToOne: false
            referencedRelation: "ferias_periodos_pj"
            referencedColumns: ["id"]
          },
        ]
      }
      ferias_programacoes: {
        Row: {
          aprovador_id: string | null
          colaborador_id: string
          created_at: string
          data_aprovacao: string | null
          data_fim: string
          data_inicio: string
          dias: number
          id: string
          observacoes: string | null
          periodo_id: string
          status: string
          tipo: string
          updated_at: string
        }
        Insert: {
          aprovador_id?: string | null
          colaborador_id: string
          created_at?: string
          data_aprovacao?: string | null
          data_fim: string
          data_inicio: string
          dias: number
          id?: string
          observacoes?: string | null
          periodo_id: string
          status?: string
          tipo?: string
          updated_at?: string
        }
        Update: {
          aprovador_id?: string | null
          colaborador_id?: string
          created_at?: string
          data_aprovacao?: string | null
          data_fim?: string
          data_inicio?: string
          dias?: number
          id?: string
          observacoes?: string | null
          periodo_id?: string
          status?: string
          tipo?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "ferias_programacoes_colaborador_id_fkey"
            columns: ["colaborador_id"]
            isOneToOne: false
            referencedRelation: "colaboradores_clt"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ferias_programacoes_periodo_id_fkey"
            columns: ["periodo_id"]
            isOneToOne: false
            referencedRelation: "ferias_periodos"
            referencedColumns: ["id"]
          },
        ]
      }
      ferramentas_catalogo: {
        Row: {
          area: string
          ativo: boolean | null
          created_at: string | null
          criado_por: string | null
          ferramenta: string
          id: string
        }
        Insert: {
          area?: string
          ativo?: boolean | null
          created_at?: string | null
          criado_por?: string | null
          ferramenta: string
          id?: string
        }
        Update: {
          area?: string
          ativo?: boolean | null
          created_at?: string | null
          criado_por?: string | null
          ferramenta?: string
          id?: string
        }
        Relationships: []
      }
      folha_competencias: {
        Row: {
          competencia: string
          created_at: string
          id: string
          observacoes: string | null
          status: string
          total_bruto: number | null
          total_colaboradores: number | null
          total_encargos: number | null
          total_liquido: number | null
          updated_at: string
        }
        Insert: {
          competencia: string
          created_at?: string
          id?: string
          observacoes?: string | null
          status?: string
          total_bruto?: number | null
          total_colaboradores?: number | null
          total_encargos?: number | null
          total_liquido?: number | null
          updated_at?: string
        }
        Update: {
          competencia?: string
          created_at?: string
          id?: string
          observacoes?: string | null
          status?: string
          total_bruto?: number | null
          total_colaboradores?: number | null
          total_encargos?: number | null
          total_liquido?: number | null
          updated_at?: string
        }
        Relationships: []
      }
      formas_pagamento: {
        Row: {
          ativo: boolean | null
          bling_id_forma_pagamento: number | null
          cobra_email: boolean
          codigo: string
          envio_agrupa_parcelas: boolean
          gera_fatura: boolean
          id: string
          meio_default_id: string
          nasce_garantido: boolean
          nome: string
          ordem: number | null
          pula_aprovacao: boolean
          requer_dados_bancarios_destinatario: boolean
        }
        Insert: {
          ativo?: boolean | null
          bling_id_forma_pagamento?: number | null
          cobra_email?: boolean
          codigo: string
          envio_agrupa_parcelas?: boolean
          gera_fatura?: boolean
          id?: string
          meio_default_id: string
          nasce_garantido?: boolean
          nome: string
          ordem?: number | null
          pula_aprovacao?: boolean
          requer_dados_bancarios_destinatario?: boolean
        }
        Update: {
          ativo?: boolean | null
          bling_id_forma_pagamento?: number | null
          cobra_email?: boolean
          codigo?: string
          envio_agrupa_parcelas?: boolean
          gera_fatura?: boolean
          id?: string
          meio_default_id?: string
          nasce_garantido?: boolean
          nome?: string
          ordem?: number | null
          pula_aprovacao?: boolean
          requer_dados_bancarios_destinatario?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "formas_pagamento_meio_default_id_fkey"
            columns: ["meio_default_id"]
            isOneToOne: false
            referencedRelation: "meios_pagamento"
            referencedColumns: ["id"]
          },
        ]
      }
      frentes_investimento: {
        Row: {
          ativa: boolean
          codigo: string
          created_at: string
          descricao: string | null
          id: string
          nome: string
          ordem: number
          updated_at: string
        }
        Insert: {
          ativa?: boolean
          codigo: string
          created_at?: string
          descricao?: string | null
          id?: string
          nome: string
          ordem?: number
          updated_at?: string
        }
        Update: {
          ativa?: boolean
          codigo?: string
          created_at?: string
          descricao?: string | null
          id?: string
          nome?: string
          ordem?: number
          updated_at?: string
        }
        Relationships: []
      }
      ged_areas: {
        Row: {
          ativo: boolean
          codigo: string
          created_at: string
          descricao: string | null
          id: string
          nome: string
          ordem: number
          updated_at: string
        }
        Insert: {
          ativo?: boolean
          codigo: string
          created_at?: string
          descricao?: string | null
          id?: string
          nome: string
          ordem?: number
          updated_at?: string
        }
        Update: {
          ativo?: boolean
          codigo?: string
          created_at?: string
          descricao?: string | null
          id?: string
          nome?: string
          ordem?: number
          updated_at?: string
        }
        Relationships: []
      }
      ged_documento_vinculos: {
        Row: {
          created_at: string
          criado_por: string | null
          documento_id: string
          entidade_id: string
          entidade_tipo: string
          id: string
          observacao: string | null
        }
        Insert: {
          created_at?: string
          criado_por?: string | null
          documento_id: string
          entidade_id: string
          entidade_tipo: string
          id?: string
          observacao?: string | null
        }
        Update: {
          created_at?: string
          criado_por?: string | null
          documento_id?: string
          entidade_id?: string
          entidade_tipo?: string
          id?: string
          observacao?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "ged_documento_vinculos_documento_id_fkey"
            columns: ["documento_id"]
            isOneToOne: false
            referencedRelation: "ged_documentos"
            referencedColumns: ["id"]
          },
        ]
      }
      ged_documentos: {
        Row: {
          arquivo_original: string
          classificacao_ia: Json | null
          confianca_ia: string | null
          created_at: string
          criado_por: string | null
          descricao: string | null
          hash_arquivo: string | null
          id: string
          lote_id: string | null
          mime_type: string | null
          nfs_stage_id: string | null
          nome: string
          origem_porta: string
          parceiro_id: string | null
          parceiro_resolucao_dispensada: boolean
          parceiro_resolucao_pendente: boolean
          pasta_contrato_id: string | null
          pasta_id: string | null
          resumo_ia: string | null
          status_classificacao: string
          storage_path: string
          tags: string[] | null
          tamanho_bytes: number | null
          tipo_documento: string
          updated_at: string
          vinculacao_proposta: Json | null
        }
        Insert: {
          arquivo_original: string
          classificacao_ia?: Json | null
          confianca_ia?: string | null
          created_at?: string
          criado_por?: string | null
          descricao?: string | null
          hash_arquivo?: string | null
          id?: string
          lote_id?: string | null
          mime_type?: string | null
          nfs_stage_id?: string | null
          nome: string
          origem_porta?: string
          parceiro_id?: string | null
          parceiro_resolucao_dispensada?: boolean
          parceiro_resolucao_pendente?: boolean
          pasta_contrato_id?: string | null
          pasta_id?: string | null
          resumo_ia?: string | null
          status_classificacao?: string
          storage_path: string
          tags?: string[] | null
          tamanho_bytes?: number | null
          tipo_documento: string
          updated_at?: string
          vinculacao_proposta?: Json | null
        }
        Update: {
          arquivo_original?: string
          classificacao_ia?: Json | null
          confianca_ia?: string | null
          created_at?: string
          criado_por?: string | null
          descricao?: string | null
          hash_arquivo?: string | null
          id?: string
          lote_id?: string | null
          mime_type?: string | null
          nfs_stage_id?: string | null
          nome?: string
          origem_porta?: string
          parceiro_id?: string | null
          parceiro_resolucao_dispensada?: boolean
          parceiro_resolucao_pendente?: boolean
          pasta_contrato_id?: string | null
          pasta_id?: string | null
          resumo_ia?: string | null
          status_classificacao?: string
          storage_path?: string
          tags?: string[] | null
          tamanho_bytes?: number | null
          tipo_documento?: string
          updated_at?: string
          vinculacao_proposta?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "ged_documentos_nfs_stage_id_fkey"
            columns: ["nfs_stage_id"]
            isOneToOne: false
            referencedRelation: "nfs_stage"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ged_documentos_nfs_stage_id_fkey"
            columns: ["nfs_stage_id"]
            isOneToOne: false
            referencedRelation: "vw_conciliacao_furos"
            referencedColumns: ["sugestao_stage_id"]
          },
          {
            foreignKeyName: "ged_documentos_nfs_stage_id_fkey"
            columns: ["nfs_stage_id"]
            isOneToOne: false
            referencedRelation: "vw_contas_pagar_consolidado"
            referencedColumns: ["nf_stage_id"]
          },
          {
            foreignKeyName: "ged_documentos_nfs_stage_id_fkey"
            columns: ["nfs_stage_id"]
            isOneToOne: false
            referencedRelation: "vw_despesas_match_nf_sugestoes"
            referencedColumns: ["stage_id"]
          },
          {
            foreignKeyName: "ged_documentos_nfs_stage_id_fkey"
            columns: ["nfs_stage_id"]
            isOneToOne: false
            referencedRelation: "vw_documentos_envio_estados"
            referencedColumns: ["nf_stage_id"]
          },
          {
            foreignKeyName: "ged_documentos_nfs_stage_id_fkey"
            columns: ["nfs_stage_id"]
            isOneToOne: false
            referencedRelation: "vw_nf_vinculo_pessoa"
            referencedColumns: ["stage_id"]
          },
          {
            foreignKeyName: "ged_documentos_nfs_stage_id_fkey"
            columns: ["nfs_stage_id"]
            isOneToOne: false
            referencedRelation: "vw_nfs_stage_completude"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ged_documentos_nfs_stage_id_fkey"
            columns: ["nfs_stage_id"]
            isOneToOne: false
            referencedRelation: "vw_pj_notas_fiscais"
            referencedColumns: ["nf_id"]
          },
          {
            foreignKeyName: "ged_documentos_parceiro_id_fkey"
            columns: ["parceiro_id"]
            isOneToOne: false
            referencedRelation: "parceiros_comerciais"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ged_documentos_parceiro_id_fkey"
            columns: ["parceiro_id"]
            isOneToOne: false
            referencedRelation: "v_credito_resumo_financeiro"
            referencedColumns: ["parceiro_id"]
          },
          {
            foreignKeyName: "ged_documentos_parceiro_id_fkey"
            columns: ["parceiro_id"]
            isOneToOne: false
            referencedRelation: "vw_logistica_agregado"
            referencedColumns: ["transportadora_id"]
          },
          {
            foreignKeyName: "ged_documentos_parceiro_id_fkey"
            columns: ["parceiro_id"]
            isOneToOne: false
            referencedRelation: "vw_recebivel_por_conta"
            referencedColumns: ["conta_id"]
          },
          {
            foreignKeyName: "ged_documentos_pasta_contrato_id_fkey"
            columns: ["pasta_contrato_id"]
            isOneToOne: false
            referencedRelation: "pasta_contratos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ged_documentos_pasta_id_fkey"
            columns: ["pasta_id"]
            isOneToOne: false
            referencedRelation: "ged_pastas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ged_documentos_pasta_id_fkey"
            columns: ["pasta_id"]
            isOneToOne: false
            referencedRelation: "vw_ged_pastas_kpis"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ged_documentos_pasta_id_fkey"
            columns: ["pasta_id"]
            isOneToOne: false
            referencedRelation: "vw_pastas_kpis"
            referencedColumns: ["id"]
          },
        ]
      }
      ged_pastas: {
        Row: {
          area: string | null
          area_id: string | null
          ativa: boolean
          cor: string | null
          created_at: string
          criado_por: string | null
          descricao: string | null
          id: string
          nome: string
          parceiro_id: string | null
          parent_id: string | null
          responsavel_id: string | null
          status: string | null
          tipo: string | null
          updated_at: string
        }
        Insert: {
          area?: string | null
          area_id?: string | null
          ativa?: boolean
          cor?: string | null
          created_at?: string
          criado_por?: string | null
          descricao?: string | null
          id?: string
          nome: string
          parceiro_id?: string | null
          parent_id?: string | null
          responsavel_id?: string | null
          status?: string | null
          tipo?: string | null
          updated_at?: string
        }
        Update: {
          area?: string | null
          area_id?: string | null
          ativa?: boolean
          cor?: string | null
          created_at?: string
          criado_por?: string | null
          descricao?: string | null
          id?: string
          nome?: string
          parceiro_id?: string | null
          parent_id?: string | null
          responsavel_id?: string | null
          status?: string | null
          tipo?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "ged_pastas_area_id_fkey"
            columns: ["area_id"]
            isOneToOne: false
            referencedRelation: "ged_areas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ged_pastas_parceiro_id_fkey"
            columns: ["parceiro_id"]
            isOneToOne: false
            referencedRelation: "parceiros_comerciais"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ged_pastas_parceiro_id_fkey"
            columns: ["parceiro_id"]
            isOneToOne: false
            referencedRelation: "v_credito_resumo_financeiro"
            referencedColumns: ["parceiro_id"]
          },
          {
            foreignKeyName: "ged_pastas_parceiro_id_fkey"
            columns: ["parceiro_id"]
            isOneToOne: false
            referencedRelation: "vw_logistica_agregado"
            referencedColumns: ["transportadora_id"]
          },
          {
            foreignKeyName: "ged_pastas_parceiro_id_fkey"
            columns: ["parceiro_id"]
            isOneToOne: false
            referencedRelation: "vw_recebivel_por_conta"
            referencedColumns: ["conta_id"]
          },
          {
            foreignKeyName: "ged_pastas_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "ged_pastas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ged_pastas_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "vw_ged_pastas_kpis"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ged_pastas_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "vw_pastas_kpis"
            referencedColumns: ["id"]
          },
        ]
      }
      grupo_acesso_permissoes: {
        Row: {
          condicao_extra: Json | null
          created_at: string | null
          criado_por: string | null
          grupo_acesso_id: string
          id: string
          permissao_id: string
          pode_apagar: boolean | null
          pode_criar: boolean | null
          pode_editar: boolean | null
          pode_ver: boolean | null
          updated_at: string | null
        }
        Insert: {
          condicao_extra?: Json | null
          created_at?: string | null
          criado_por?: string | null
          grupo_acesso_id: string
          id?: string
          permissao_id: string
          pode_apagar?: boolean | null
          pode_criar?: boolean | null
          pode_editar?: boolean | null
          pode_ver?: boolean | null
          updated_at?: string | null
        }
        Update: {
          condicao_extra?: Json | null
          created_at?: string | null
          criado_por?: string | null
          grupo_acesso_id?: string
          id?: string
          permissao_id?: string
          pode_apagar?: boolean | null
          pode_criar?: boolean | null
          pode_editar?: boolean | null
          pode_ver?: boolean | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "grupo_acesso_permissoes_grupo_acesso_id_fkey"
            columns: ["grupo_acesso_id"]
            isOneToOne: false
            referencedRelation: "grupos_acesso"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "grupo_acesso_permissoes_permissao_id_fkey"
            columns: ["permissao_id"]
            isOneToOne: false
            referencedRelation: "permissoes_catalogo"
            referencedColumns: ["id"]
          },
        ]
      }
      grupo_acesso_usuarios: {
        Row: {
          adicionado_por: string | null
          ativo_em: string | null
          created_at: string | null
          grupo_acesso_id: string
          id: string
          inativado_em: string | null
          user_id: string
        }
        Insert: {
          adicionado_por?: string | null
          ativo_em?: string | null
          created_at?: string | null
          grupo_acesso_id: string
          id?: string
          inativado_em?: string | null
          user_id: string
        }
        Update: {
          adicionado_por?: string | null
          ativo_em?: string | null
          created_at?: string | null
          grupo_acesso_id?: string
          id?: string
          inativado_em?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "grupo_acesso_usuarios_grupo_acesso_id_fkey"
            columns: ["grupo_acesso_id"]
            isOneToOne: false
            referencedRelation: "grupos_acesso"
            referencedColumns: ["id"]
          },
        ]
      }
      grupos_acesso: {
        Row: {
          ativo: boolean
          created_at: string
          criado_por: string | null
          descricao: string | null
          id: string
          is_system: boolean
          nome: string
          pre_cadastrado: boolean | null
          role_automatico: Database["public"]["Enums"]["app_role"]
          slug: string | null
          tipo_colaborador: string
          updated_at: string
        }
        Insert: {
          ativo?: boolean
          created_at?: string
          criado_por?: string | null
          descricao?: string | null
          id?: string
          is_system?: boolean
          nome: string
          pre_cadastrado?: boolean | null
          role_automatico?: Database["public"]["Enums"]["app_role"]
          slug?: string | null
          tipo_colaborador: string
          updated_at?: string
        }
        Update: {
          ativo?: boolean
          created_at?: string
          criado_por?: string | null
          descricao?: string | null
          id?: string
          is_system?: boolean
          nome?: string
          pre_cadastrado?: boolean | null
          role_automatico?: Database["public"]["Enums"]["app_role"]
          slug?: string | null
          tipo_colaborador?: string
          updated_at?: string
        }
        Relationships: []
      }
      grupos_economicos: {
        Row: {
          atualizado_em: string
          criado_em: string
          criado_por: string | null
          fundido_em_grupo_id: string | null
          id: string
          nome: string
          observacoes: string | null
          origem_deteccao: string
          parceiro_matriz_id: string | null
          status: string
        }
        Insert: {
          atualizado_em?: string
          criado_em?: string
          criado_por?: string | null
          fundido_em_grupo_id?: string | null
          id?: string
          nome: string
          observacoes?: string | null
          origem_deteccao?: string
          parceiro_matriz_id?: string | null
          status?: string
        }
        Update: {
          atualizado_em?: string
          criado_em?: string
          criado_por?: string | null
          fundido_em_grupo_id?: string | null
          id?: string
          nome?: string
          observacoes?: string | null
          origem_deteccao?: string
          parceiro_matriz_id?: string | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "fk_grupos_economicos_matriz"
            columns: ["parceiro_matriz_id"]
            isOneToOne: false
            referencedRelation: "parceiros_comerciais"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_grupos_economicos_matriz"
            columns: ["parceiro_matriz_id"]
            isOneToOne: false
            referencedRelation: "v_credito_resumo_financeiro"
            referencedColumns: ["parceiro_id"]
          },
          {
            foreignKeyName: "fk_grupos_economicos_matriz"
            columns: ["parceiro_matriz_id"]
            isOneToOne: false
            referencedRelation: "vw_logistica_agregado"
            referencedColumns: ["transportadora_id"]
          },
          {
            foreignKeyName: "fk_grupos_economicos_matriz"
            columns: ["parceiro_matriz_id"]
            isOneToOne: false
            referencedRelation: "vw_recebivel_por_conta"
            referencedColumns: ["conta_id"]
          },
          {
            foreignKeyName: "grupos_economicos_fundido_em_grupo_id_fkey"
            columns: ["fundido_em_grupo_id"]
            isOneToOne: false
            referencedRelation: "grupos_economicos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "grupos_economicos_fundido_em_grupo_id_fkey"
            columns: ["fundido_em_grupo_id"]
            isOneToOne: false
            referencedRelation: "v_credito_resumo_financeiro_grupo"
            referencedColumns: ["grupo_economico_id"]
          },
        ]
      }
      grupos_empresariais: {
        Row: {
          ativo: boolean
          cnpj_raiz: string | null
          created_at: string
          descricao: string | null
          id: string
          nome: string
          observacao: string | null
          tipo_controle: string | null
          updated_at: string
        }
        Insert: {
          ativo?: boolean
          cnpj_raiz?: string | null
          created_at?: string
          descricao?: string | null
          id?: string
          nome: string
          observacao?: string | null
          tipo_controle?: string | null
          updated_at?: string
        }
        Update: {
          ativo?: boolean
          cnpj_raiz?: string | null
          created_at?: string
          descricao?: string | null
          id?: string
          nome?: string
          observacao?: string | null
          tipo_controle?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      grupos_parceiros_log: {
        Row: {
          grupo_anterior_id: string | null
          grupo_novo_id: string | null
          id: string
          mudou_em: string
          mudou_por: string | null
          parceiro_id: string
        }
        Insert: {
          grupo_anterior_id?: string | null
          grupo_novo_id?: string | null
          id?: string
          mudou_em?: string
          mudou_por?: string | null
          parceiro_id: string
        }
        Update: {
          grupo_anterior_id?: string | null
          grupo_novo_id?: string | null
          id?: string
          mudou_em?: string
          mudou_por?: string | null
          parceiro_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "grupos_parceiros_log_grupo_anterior_id_fkey"
            columns: ["grupo_anterior_id"]
            isOneToOne: false
            referencedRelation: "grupos_empresariais"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "grupos_parceiros_log_grupo_anterior_id_fkey"
            columns: ["grupo_anterior_id"]
            isOneToOne: false
            referencedRelation: "vw_exposicao_por_grupo"
            referencedColumns: ["grupo_id"]
          },
          {
            foreignKeyName: "grupos_parceiros_log_grupo_novo_id_fkey"
            columns: ["grupo_novo_id"]
            isOneToOne: false
            referencedRelation: "grupos_empresariais"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "grupos_parceiros_log_grupo_novo_id_fkey"
            columns: ["grupo_novo_id"]
            isOneToOne: false
            referencedRelation: "vw_exposicao_por_grupo"
            referencedColumns: ["grupo_id"]
          },
          {
            foreignKeyName: "grupos_parceiros_log_parceiro_id_fkey"
            columns: ["parceiro_id"]
            isOneToOne: false
            referencedRelation: "parceiros_comerciais"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "grupos_parceiros_log_parceiro_id_fkey"
            columns: ["parceiro_id"]
            isOneToOne: false
            referencedRelation: "v_credito_resumo_financeiro"
            referencedColumns: ["parceiro_id"]
          },
          {
            foreignKeyName: "grupos_parceiros_log_parceiro_id_fkey"
            columns: ["parceiro_id"]
            isOneToOne: false
            referencedRelation: "vw_logistica_agregado"
            referencedColumns: ["transportadora_id"]
          },
          {
            foreignKeyName: "grupos_parceiros_log_parceiro_id_fkey"
            columns: ["parceiro_id"]
            isOneToOne: false
            referencedRelation: "vw_recebivel_por_conta"
            referencedColumns: ["conta_id"]
          },
        ]
      }
      haver_aplicacao: {
        Row: {
          created_at: string
          created_by: string | null
          haver_id: string
          id: string
          pedido_id: string
          valor_aplicado: number
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          haver_id: string
          id?: string
          pedido_id: string
          valor_aplicado: number
        }
        Update: {
          created_at?: string
          created_by?: string | null
          haver_id?: string
          id?: string
          pedido_id?: string
          valor_aplicado?: number
        }
        Relationships: [
          {
            foreignKeyName: "haver_aplicacao_haver_id_fkey"
            columns: ["haver_id"]
            isOneToOne: false
            referencedRelation: "haver_cliente"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "haver_aplicacao_pedido_id_fkey"
            columns: ["pedido_id"]
            isOneToOne: false
            referencedRelation: "pedidos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "haver_aplicacao_pedido_id_fkey"
            columns: ["pedido_id"]
            isOneToOne: false
            referencedRelation: "v_pedidos_fila"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "haver_aplicacao_pedido_id_fkey"
            columns: ["pedido_id"]
            isOneToOne: false
            referencedRelation: "v_pedidos_priorizados"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "haver_aplicacao_pedido_id_fkey"
            columns: ["pedido_id"]
            isOneToOne: false
            referencedRelation: "vw_gestao_pedidos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "haver_aplicacao_pedido_id_fkey"
            columns: ["pedido_id"]
            isOneToOne: false
            referencedRelation: "vw_pedido_base"
            referencedColumns: ["pedido_id"]
          },
          {
            foreignKeyName: "haver_aplicacao_pedido_id_fkey"
            columns: ["pedido_id"]
            isOneToOne: false
            referencedRelation: "vw_pedidos_farol"
            referencedColumns: ["pedido_id"]
          },
        ]
      }
      haver_cliente: {
        Row: {
          created_at: string
          created_by: string | null
          data_expiracao: string | null
          id: string
          motivo: string | null
          origem_descricao: string | null
          origem_pedido_id: string | null
          parceiro_id: string
          saldo: number
          status: string
          updated_at: string
          valor: number
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          data_expiracao?: string | null
          id?: string
          motivo?: string | null
          origem_descricao?: string | null
          origem_pedido_id?: string | null
          parceiro_id: string
          saldo: number
          status?: string
          updated_at?: string
          valor: number
        }
        Update: {
          created_at?: string
          created_by?: string | null
          data_expiracao?: string | null
          id?: string
          motivo?: string | null
          origem_descricao?: string | null
          origem_pedido_id?: string | null
          parceiro_id?: string
          saldo?: number
          status?: string
          updated_at?: string
          valor?: number
        }
        Relationships: [
          {
            foreignKeyName: "haver_cliente_origem_pedido_id_fkey"
            columns: ["origem_pedido_id"]
            isOneToOne: false
            referencedRelation: "pedidos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "haver_cliente_origem_pedido_id_fkey"
            columns: ["origem_pedido_id"]
            isOneToOne: false
            referencedRelation: "v_pedidos_fila"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "haver_cliente_origem_pedido_id_fkey"
            columns: ["origem_pedido_id"]
            isOneToOne: false
            referencedRelation: "v_pedidos_priorizados"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "haver_cliente_origem_pedido_id_fkey"
            columns: ["origem_pedido_id"]
            isOneToOne: false
            referencedRelation: "vw_gestao_pedidos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "haver_cliente_origem_pedido_id_fkey"
            columns: ["origem_pedido_id"]
            isOneToOne: false
            referencedRelation: "vw_pedido_base"
            referencedColumns: ["pedido_id"]
          },
          {
            foreignKeyName: "haver_cliente_origem_pedido_id_fkey"
            columns: ["origem_pedido_id"]
            isOneToOne: false
            referencedRelation: "vw_pedidos_farol"
            referencedColumns: ["pedido_id"]
          },
          {
            foreignKeyName: "haver_cliente_parceiro_id_fkey"
            columns: ["parceiro_id"]
            isOneToOne: false
            referencedRelation: "parceiros_comerciais"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "haver_cliente_parceiro_id_fkey"
            columns: ["parceiro_id"]
            isOneToOne: false
            referencedRelation: "v_credito_resumo_financeiro"
            referencedColumns: ["parceiro_id"]
          },
          {
            foreignKeyName: "haver_cliente_parceiro_id_fkey"
            columns: ["parceiro_id"]
            isOneToOne: false
            referencedRelation: "vw_logistica_agregado"
            referencedColumns: ["transportadora_id"]
          },
          {
            foreignKeyName: "haver_cliente_parceiro_id_fkey"
            columns: ["parceiro_id"]
            isOneToOne: false
            referencedRelation: "vw_recebivel_por_conta"
            referencedColumns: ["conta_id"]
          },
        ]
      }
      holerites: {
        Row: {
          adicional_noturno: number | null
          colaborador_id: string
          competencia_id: string
          created_at: string
          faltas_desconto: number | null
          faltas_dias: number | null
          fgts: number | null
          horas_extras_100: number | null
          horas_extras_100_qtd: number | null
          horas_extras_50: number | null
          horas_extras_50_qtd: number | null
          id: string
          inss: number | null
          inss_patronal: number | null
          irrf: number | null
          outros_descontos: number | null
          outros_proventos: number | null
          plano_saude: number | null
          salario_base: number
          salario_liquido: number | null
          total_descontos: number | null
          total_encargos: number | null
          total_proventos: number | null
          updated_at: string
          vr_desconto: number | null
          vt_desconto: number | null
        }
        Insert: {
          adicional_noturno?: number | null
          colaborador_id: string
          competencia_id: string
          created_at?: string
          faltas_desconto?: number | null
          faltas_dias?: number | null
          fgts?: number | null
          horas_extras_100?: number | null
          horas_extras_100_qtd?: number | null
          horas_extras_50?: number | null
          horas_extras_50_qtd?: number | null
          id?: string
          inss?: number | null
          inss_patronal?: number | null
          irrf?: number | null
          outros_descontos?: number | null
          outros_proventos?: number | null
          plano_saude?: number | null
          salario_base?: number
          salario_liquido?: number | null
          total_descontos?: number | null
          total_encargos?: number | null
          total_proventos?: number | null
          updated_at?: string
          vr_desconto?: number | null
          vt_desconto?: number | null
        }
        Update: {
          adicional_noturno?: number | null
          colaborador_id?: string
          competencia_id?: string
          created_at?: string
          faltas_desconto?: number | null
          faltas_dias?: number | null
          fgts?: number | null
          horas_extras_100?: number | null
          horas_extras_100_qtd?: number | null
          horas_extras_50?: number | null
          horas_extras_50_qtd?: number | null
          id?: string
          inss?: number | null
          inss_patronal?: number | null
          irrf?: number | null
          outros_descontos?: number | null
          outros_proventos?: number | null
          plano_saude?: number | null
          salario_base?: number
          salario_liquido?: number | null
          total_descontos?: number | null
          total_encargos?: number | null
          total_proventos?: number | null
          updated_at?: string
          vr_desconto?: number | null
          vt_desconto?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "holerites_colaborador_id_fkey"
            columns: ["colaborador_id"]
            isOneToOne: false
            referencedRelation: "colaboradores_clt"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "holerites_competencia_id_fkey"
            columns: ["competencia_id"]
            isOneToOne: false
            referencedRelation: "folha_competencias"
            referencedColumns: ["id"]
          },
        ]
      }
      integracoes_config: {
        Row: {
          access_token: string | null
          ativo: boolean | null
          client_id: string | null
          client_secret: string | null
          config: Json | null
          created_at: string | null
          id: string
          refresh_token: string | null
          sistema: string
          token_expires_at: string | null
          ultima_sync_at: string | null
          ultima_sync_detalhes: string | null
          ultima_sync_status: string | null
          updated_at: string | null
        }
        Insert: {
          access_token?: string | null
          ativo?: boolean | null
          client_id?: string | null
          client_secret?: string | null
          config?: Json | null
          created_at?: string | null
          id?: string
          refresh_token?: string | null
          sistema: string
          token_expires_at?: string | null
          ultima_sync_at?: string | null
          ultima_sync_detalhes?: string | null
          ultima_sync_status?: string | null
          updated_at?: string | null
        }
        Update: {
          access_token?: string | null
          ativo?: boolean | null
          client_id?: string | null
          client_secret?: string | null
          config?: Json | null
          created_at?: string | null
          id?: string
          refresh_token?: string | null
          sistema?: string
          token_expires_at?: string | null
          ultima_sync_at?: string | null
          ultima_sync_detalhes?: string | null
          ultima_sync_status?: string | null
          updated_at?: string | null
        }
        Relationships: []
      }
      integracoes_sync_cursor: {
        Row: {
          created_at: string
          em_execucao: boolean | null
          entidade: string
          id: string
          iniciado_em: string | null
          sistema: string
          total_processado: number | null
          ultima_data_corte: string | null
          ultima_pagina: number | null
          ultimo_bling_id: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          em_execucao?: boolean | null
          entidade: string
          id?: string
          iniciado_em?: string | null
          sistema: string
          total_processado?: number | null
          ultima_data_corte?: string | null
          ultima_pagina?: number | null
          ultimo_bling_id?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          em_execucao?: boolean | null
          entidade?: string
          id?: string
          iniciado_em?: string | null
          sistema?: string
          total_processado?: number | null
          ultima_data_corte?: string | null
          ultima_pagina?: number | null
          ultimo_bling_id?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      integracoes_sync_log: {
        Row: {
          created_at: string | null
          detalhes: string | null
          duracao_ms: number | null
          id: string
          iniciado_por: string
          registros_atualizados: number | null
          registros_criados: number | null
          registros_erro: number | null
          sistema: string
          status: string
          tipo: string
        }
        Insert: {
          created_at?: string | null
          detalhes?: string | null
          duracao_ms?: number | null
          id?: string
          iniciado_por: string
          registros_atualizados?: number | null
          registros_criados?: number | null
          registros_erro?: number | null
          sistema: string
          status?: string
          tipo: string
        }
        Update: {
          created_at?: string | null
          detalhes?: string | null
          duracao_ms?: number | null
          id?: string
          iniciado_por?: string
          registros_atualizados?: number | null
          registros_criados?: number | null
          registros_erro?: number | null
          sistema?: string
          status?: string
          tipo?: string
        }
        Relationships: []
      }
      itau_importacoes_stage: {
        Row: {
          arquivo_nome: string
          conta_bancaria_id: string | null
          created_at: string | null
          criado_por: string | null
          id: string
          periodo_fim: string | null
          periodo_inicio: string | null
          status: string
          total_linhas: number | null
        }
        Insert: {
          arquivo_nome: string
          conta_bancaria_id?: string | null
          created_at?: string | null
          criado_por?: string | null
          id?: string
          periodo_fim?: string | null
          periodo_inicio?: string | null
          status?: string
          total_linhas?: number | null
        }
        Update: {
          arquivo_nome?: string
          conta_bancaria_id?: string | null
          created_at?: string | null
          criado_por?: string | null
          id?: string
          periodo_fim?: string | null
          periodo_inicio?: string | null
          status?: string
          total_linhas?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "itau_importacoes_stage_conta_bancaria_id_fkey"
            columns: ["conta_bancaria_id"]
            isOneToOne: false
            referencedRelation: "contas_bancarias"
            referencedColumns: ["id"]
          },
        ]
      }
      itau_pagamentos_stage: {
        Row: {
          cnpj_favorecido: string | null
          cnpj_pagador: string | null
          conta_bancaria_id: string | null
          conta_pagar_id: string | null
          created_at: string | null
          dados_pagamento: string | null
          data_pagamento: string | null
          hash_unico: string
          id: string
          importacao_id: string
          movimentacao_id: string | null
          nome_favorecido: string | null
          numero_lote: string | null
          ofx_transacao_id: string | null
          parceiro_id: string | null
          referencia_empresa: string | null
          status_banco: string | null
          status_conciliacao: string
          tipo_pagamento: string | null
          valor_pago: number | null
        }
        Insert: {
          cnpj_favorecido?: string | null
          cnpj_pagador?: string | null
          conta_bancaria_id?: string | null
          conta_pagar_id?: string | null
          created_at?: string | null
          dados_pagamento?: string | null
          data_pagamento?: string | null
          hash_unico: string
          id?: string
          importacao_id: string
          movimentacao_id?: string | null
          nome_favorecido?: string | null
          numero_lote?: string | null
          ofx_transacao_id?: string | null
          parceiro_id?: string | null
          referencia_empresa?: string | null
          status_banco?: string | null
          status_conciliacao?: string
          tipo_pagamento?: string | null
          valor_pago?: number | null
        }
        Update: {
          cnpj_favorecido?: string | null
          cnpj_pagador?: string | null
          conta_bancaria_id?: string | null
          conta_pagar_id?: string | null
          created_at?: string | null
          dados_pagamento?: string | null
          data_pagamento?: string | null
          hash_unico?: string
          id?: string
          importacao_id?: string
          movimentacao_id?: string | null
          nome_favorecido?: string | null
          numero_lote?: string | null
          ofx_transacao_id?: string | null
          parceiro_id?: string | null
          referencia_empresa?: string | null
          status_banco?: string | null
          status_conciliacao?: string
          tipo_pagamento?: string | null
          valor_pago?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "itau_pagamentos_stage_conta_bancaria_id_fkey"
            columns: ["conta_bancaria_id"]
            isOneToOne: false
            referencedRelation: "contas_bancarias"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "itau_pagamentos_stage_conta_pagar_id_fkey"
            columns: ["conta_pagar_id"]
            isOneToOne: false
            referencedRelation: "contas_pagar"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "itau_pagamentos_stage_conta_pagar_id_fkey"
            columns: ["conta_pagar_id"]
            isOneToOne: false
            referencedRelation: "contas_pagar_receber"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "itau_pagamentos_stage_conta_pagar_id_fkey"
            columns: ["conta_pagar_id"]
            isOneToOne: false
            referencedRelation: "contas_pagar_receber_ativas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "itau_pagamentos_stage_conta_pagar_id_fkey"
            columns: ["conta_pagar_id"]
            isOneToOne: false
            referencedRelation: "v_cpr_bola_redonda"
            referencedColumns: ["cpr_id"]
          },
          {
            foreignKeyName: "itau_pagamentos_stage_conta_pagar_id_fkey"
            columns: ["conta_pagar_id"]
            isOneToOne: false
            referencedRelation: "vw_conciliacao_furos"
            referencedColumns: ["sugestao_cpr_id"]
          },
          {
            foreignKeyName: "itau_pagamentos_stage_conta_pagar_id_fkey"
            columns: ["conta_pagar_id"]
            isOneToOne: false
            referencedRelation: "vw_contas_pagar_consolidado"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "itau_pagamentos_stage_conta_pagar_id_fkey"
            columns: ["conta_pagar_id"]
            isOneToOne: false
            referencedRelation: "vw_despesas_match_sugestoes"
            referencedColumns: ["cpr_id"]
          },
          {
            foreignKeyName: "itau_pagamentos_stage_conta_pagar_id_fkey"
            columns: ["conta_pagar_id"]
            isOneToOne: false
            referencedRelation: "vw_documentos_envio_estados"
            referencedColumns: ["conta_id"]
          },
          {
            foreignKeyName: "itau_pagamentos_stage_conta_pagar_id_fkey"
            columns: ["conta_pagar_id"]
            isOneToOne: false
            referencedRelation: "vw_pj_pagamentos"
            referencedColumns: ["cpr_id"]
          },
          {
            foreignKeyName: "itau_pagamentos_stage_importacao_id_fkey"
            columns: ["importacao_id"]
            isOneToOne: false
            referencedRelation: "itau_importacoes_stage"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "itau_pagamentos_stage_movimentacao_id_fkey"
            columns: ["movimentacao_id"]
            isOneToOne: false
            referencedRelation: "movimentacoes_bancarias"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "itau_pagamentos_stage_movimentacao_id_fkey"
            columns: ["movimentacao_id"]
            isOneToOne: false
            referencedRelation: "vw_conciliacao_cartao_sugestoes"
            referencedColumns: ["ofx_id"]
          },
          {
            foreignKeyName: "itau_pagamentos_stage_movimentacao_id_fkey"
            columns: ["movimentacao_id"]
            isOneToOne: false
            referencedRelation: "vw_conciliacao_furos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "itau_pagamentos_stage_movimentacao_id_fkey"
            columns: ["movimentacao_id"]
            isOneToOne: false
            referencedRelation: "vw_despesas_match_nf_sugestoes"
            referencedColumns: ["mov_id"]
          },
          {
            foreignKeyName: "itau_pagamentos_stage_movimentacao_id_fkey"
            columns: ["movimentacao_id"]
            isOneToOne: false
            referencedRelation: "vw_despesas_match_sugestoes"
            referencedColumns: ["mov_id"]
          },
          {
            foreignKeyName: "itau_pagamentos_stage_movimentacao_id_fkey"
            columns: ["movimentacao_id"]
            isOneToOne: false
            referencedRelation: "vw_pares_transferencia_sugeridos"
            referencedColumns: ["credito_id"]
          },
          {
            foreignKeyName: "itau_pagamentos_stage_movimentacao_id_fkey"
            columns: ["movimentacao_id"]
            isOneToOne: false
            referencedRelation: "vw_pares_transferencia_sugeridos"
            referencedColumns: ["debito_id"]
          },
          {
            foreignKeyName: "itau_pagamentos_stage_movimentacao_id_fkey"
            columns: ["movimentacao_id"]
            isOneToOne: false
            referencedRelation: "vw_recebivel_b2c_pedido"
            referencedColumns: ["movimentacao_id"]
          },
          {
            foreignKeyName: "itau_pagamentos_stage_ofx_transacao_id_fkey"
            columns: ["ofx_transacao_id"]
            isOneToOne: false
            referencedRelation: "ofx_transacoes_stage"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "itau_pagamentos_stage_parceiro_id_fkey"
            columns: ["parceiro_id"]
            isOneToOne: false
            referencedRelation: "parceiros_comerciais"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "itau_pagamentos_stage_parceiro_id_fkey"
            columns: ["parceiro_id"]
            isOneToOne: false
            referencedRelation: "v_credito_resumo_financeiro"
            referencedColumns: ["parceiro_id"]
          },
          {
            foreignKeyName: "itau_pagamentos_stage_parceiro_id_fkey"
            columns: ["parceiro_id"]
            isOneToOne: false
            referencedRelation: "vw_logistica_agregado"
            referencedColumns: ["transportadora_id"]
          },
          {
            foreignKeyName: "itau_pagamentos_stage_parceiro_id_fkey"
            columns: ["parceiro_id"]
            isOneToOne: false
            referencedRelation: "vw_recebivel_por_conta"
            referencedColumns: ["conta_id"]
          },
        ]
      }
      linhas_investimento: {
        Row: {
          ativa: boolean
          created_at: string
          created_by: string | null
          data_prevista_pagamento: string | null
          descricao: string
          id: string
          observacao: string | null
          responsavel_id: string | null
          tema_id: string
          updated_at: string
          valor_fechado: number | null
          valor_inicial: number
        }
        Insert: {
          ativa?: boolean
          created_at?: string
          created_by?: string | null
          data_prevista_pagamento?: string | null
          descricao: string
          id?: string
          observacao?: string | null
          responsavel_id?: string | null
          tema_id: string
          updated_at?: string
          valor_fechado?: number | null
          valor_inicial?: number
        }
        Update: {
          ativa?: boolean
          created_at?: string
          created_by?: string | null
          data_prevista_pagamento?: string | null
          descricao?: string
          id?: string
          observacao?: string | null
          responsavel_id?: string | null
          tema_id?: string
          updated_at?: string
          valor_fechado?: number | null
          valor_inicial?: number
        }
        Relationships: [
          {
            foreignKeyName: "linhas_investimento_tema_id_fkey"
            columns: ["tema_id"]
            isOneToOne: false
            referencedRelation: "temas_investimento"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "linhas_investimento_tema_id_fkey"
            columns: ["tema_id"]
            isOneToOne: false
            referencedRelation: "vw_temas_investimento_kpis"
            referencedColumns: ["tema_id"]
          },
        ]
      }
      meios_pagamento: {
        Row: {
          ativo: boolean
          codigo: string
          created_at: string
          descricao: string | null
          id: string
          nome: string
          ordem: number
        }
        Insert: {
          ativo?: boolean
          codigo: string
          created_at?: string
          descricao?: string | null
          id?: string
          nome: string
          ordem?: number
        }
        Update: {
          ativo?: boolean
          codigo?: string
          created_at?: string
          descricao?: string | null
          id?: string
          nome?: string
          ordem?: number
        }
        Relationships: []
      }
      movimentacoes: {
        Row: {
          cargo_anterior: string | null
          cargo_novo: string | null
          colaborador_id: string | null
          contrato_pj_id: string | null
          created_at: string
          created_by: string | null
          data_efetivacao: string
          departamento_anterior: string | null
          departamento_novo: string | null
          id: string
          motivo: string | null
          observacoes: string | null
          salario_anterior: number | null
          salario_novo: number | null
          status: string
          tipo: string
          updated_at: string
        }
        Insert: {
          cargo_anterior?: string | null
          cargo_novo?: string | null
          colaborador_id?: string | null
          contrato_pj_id?: string | null
          created_at?: string
          created_by?: string | null
          data_efetivacao: string
          departamento_anterior?: string | null
          departamento_novo?: string | null
          id?: string
          motivo?: string | null
          observacoes?: string | null
          salario_anterior?: number | null
          salario_novo?: number | null
          status?: string
          tipo: string
          updated_at?: string
        }
        Update: {
          cargo_anterior?: string | null
          cargo_novo?: string | null
          colaborador_id?: string | null
          contrato_pj_id?: string | null
          created_at?: string
          created_by?: string | null
          data_efetivacao?: string
          departamento_anterior?: string | null
          departamento_novo?: string | null
          id?: string
          motivo?: string | null
          observacoes?: string | null
          salario_anterior?: number | null
          salario_novo?: number | null
          status?: string
          tipo?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "movimentacoes_colaborador_id_fkey"
            columns: ["colaborador_id"]
            isOneToOne: false
            referencedRelation: "colaboradores_clt"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "movimentacoes_contrato_pj_id_fkey"
            columns: ["contrato_pj_id"]
            isOneToOne: false
            referencedRelation: "contratos_pj"
            referencedColumns: ["id"]
          },
        ]
      }
      movimentacoes_bancarias: {
        Row: {
          cartao_id: string | null
          casada_com_id: string | null
          categoria_inconsistente: boolean
          centro_custo_id: string | null
          classe: string | null
          classe_definida_por: string | null
          conciliado: boolean | null
          conciliado_em: string | null
          conciliado_por: string | null
          conta_bancaria_id: string | null
          conta_pagar_id: string | null
          contraparte_documento: string | null
          contraparte_nome: string | null
          created_at: string | null
          data_hora: string | null
          data_transacao: string
          descricao: string
          fonte_importacao_id: string | null
          hash_unico: string | null
          id: string
          id_transacao_banco: string | null
          inconsistencia_motivo: string | null
          itau_planilha_id: string | null
          ofx_transacao_id: string | null
          origem: string | null
          par_transferencia_id: string | null
          pg_em: string | null
          plano_contas_id: string | null
          referencia_pedido: string | null
          regra_aplicada_id: string | null
          saldo_pos_transacao: number | null
          tipo: string | null
          tipo_meio: string | null
          tipo_pagamento: string | null
          valor: number
        }
        Insert: {
          cartao_id?: string | null
          casada_com_id?: string | null
          categoria_inconsistente?: boolean
          centro_custo_id?: string | null
          classe?: string | null
          classe_definida_por?: string | null
          conciliado?: boolean | null
          conciliado_em?: string | null
          conciliado_por?: string | null
          conta_bancaria_id?: string | null
          conta_pagar_id?: string | null
          contraparte_documento?: string | null
          contraparte_nome?: string | null
          created_at?: string | null
          data_hora?: string | null
          data_transacao: string
          descricao: string
          fonte_importacao_id?: string | null
          hash_unico?: string | null
          id?: string
          id_transacao_banco?: string | null
          inconsistencia_motivo?: string | null
          itau_planilha_id?: string | null
          ofx_transacao_id?: string | null
          origem?: string | null
          par_transferencia_id?: string | null
          pg_em?: string | null
          plano_contas_id?: string | null
          referencia_pedido?: string | null
          regra_aplicada_id?: string | null
          saldo_pos_transacao?: number | null
          tipo?: string | null
          tipo_meio?: string | null
          tipo_pagamento?: string | null
          valor: number
        }
        Update: {
          cartao_id?: string | null
          casada_com_id?: string | null
          categoria_inconsistente?: boolean
          centro_custo_id?: string | null
          classe?: string | null
          classe_definida_por?: string | null
          conciliado?: boolean | null
          conciliado_em?: string | null
          conciliado_por?: string | null
          conta_bancaria_id?: string | null
          conta_pagar_id?: string | null
          contraparte_documento?: string | null
          contraparte_nome?: string | null
          created_at?: string | null
          data_hora?: string | null
          data_transacao?: string
          descricao?: string
          fonte_importacao_id?: string | null
          hash_unico?: string | null
          id?: string
          id_transacao_banco?: string | null
          inconsistencia_motivo?: string | null
          itau_planilha_id?: string | null
          ofx_transacao_id?: string | null
          origem?: string | null
          par_transferencia_id?: string | null
          pg_em?: string | null
          plano_contas_id?: string | null
          referencia_pedido?: string | null
          regra_aplicada_id?: string | null
          saldo_pos_transacao?: number | null
          tipo?: string | null
          tipo_meio?: string | null
          tipo_pagamento?: string | null
          valor?: number
        }
        Relationships: [
          {
            foreignKeyName: "movimentacoes_bancarias_cartao_id_fkey"
            columns: ["cartao_id"]
            isOneToOne: false
            referencedRelation: "cartoes_credito"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "movimentacoes_bancarias_casada_com_id_fkey"
            columns: ["casada_com_id"]
            isOneToOne: false
            referencedRelation: "movimentacoes_bancarias"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "movimentacoes_bancarias_casada_com_id_fkey"
            columns: ["casada_com_id"]
            isOneToOne: false
            referencedRelation: "vw_conciliacao_cartao_sugestoes"
            referencedColumns: ["ofx_id"]
          },
          {
            foreignKeyName: "movimentacoes_bancarias_casada_com_id_fkey"
            columns: ["casada_com_id"]
            isOneToOne: false
            referencedRelation: "vw_conciliacao_furos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "movimentacoes_bancarias_casada_com_id_fkey"
            columns: ["casada_com_id"]
            isOneToOne: false
            referencedRelation: "vw_despesas_match_nf_sugestoes"
            referencedColumns: ["mov_id"]
          },
          {
            foreignKeyName: "movimentacoes_bancarias_casada_com_id_fkey"
            columns: ["casada_com_id"]
            isOneToOne: false
            referencedRelation: "vw_despesas_match_sugestoes"
            referencedColumns: ["mov_id"]
          },
          {
            foreignKeyName: "movimentacoes_bancarias_casada_com_id_fkey"
            columns: ["casada_com_id"]
            isOneToOne: false
            referencedRelation: "vw_pares_transferencia_sugeridos"
            referencedColumns: ["credito_id"]
          },
          {
            foreignKeyName: "movimentacoes_bancarias_casada_com_id_fkey"
            columns: ["casada_com_id"]
            isOneToOne: false
            referencedRelation: "vw_pares_transferencia_sugeridos"
            referencedColumns: ["debito_id"]
          },
          {
            foreignKeyName: "movimentacoes_bancarias_casada_com_id_fkey"
            columns: ["casada_com_id"]
            isOneToOne: false
            referencedRelation: "vw_recebivel_b2c_pedido"
            referencedColumns: ["movimentacao_id"]
          },
          {
            foreignKeyName: "movimentacoes_bancarias_centro_custo_id_fkey"
            columns: ["centro_custo_id"]
            isOneToOne: false
            referencedRelation: "centros_custo"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "movimentacoes_bancarias_centro_custo_id_fkey"
            columns: ["centro_custo_id"]
            isOneToOne: false
            referencedRelation: "vw_custo_pessoas"
            referencedColumns: ["centro_custo_id"]
          },
          {
            foreignKeyName: "movimentacoes_bancarias_centro_custo_id_fkey"
            columns: ["centro_custo_id"]
            isOneToOne: false
            referencedRelation: "vw_dimensionamento_areas"
            referencedColumns: ["centro_custo_id"]
          },
          {
            foreignKeyName: "movimentacoes_bancarias_conta_bancaria_id_fkey"
            columns: ["conta_bancaria_id"]
            isOneToOne: false
            referencedRelation: "contas_bancarias"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "movimentacoes_bancarias_itau_planilha_id_fkey"
            columns: ["itau_planilha_id"]
            isOneToOne: false
            referencedRelation: "itau_pagamentos_stage"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "movimentacoes_bancarias_ofx_transacao_id_fkey"
            columns: ["ofx_transacao_id"]
            isOneToOne: false
            referencedRelation: "ofx_transacoes_stage"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "movimentacoes_bancarias_par_transferencia_id_fkey"
            columns: ["par_transferencia_id"]
            isOneToOne: false
            referencedRelation: "movimentacoes_bancarias"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "movimentacoes_bancarias_par_transferencia_id_fkey"
            columns: ["par_transferencia_id"]
            isOneToOne: false
            referencedRelation: "vw_conciliacao_cartao_sugestoes"
            referencedColumns: ["ofx_id"]
          },
          {
            foreignKeyName: "movimentacoes_bancarias_par_transferencia_id_fkey"
            columns: ["par_transferencia_id"]
            isOneToOne: false
            referencedRelation: "vw_conciliacao_furos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "movimentacoes_bancarias_par_transferencia_id_fkey"
            columns: ["par_transferencia_id"]
            isOneToOne: false
            referencedRelation: "vw_despesas_match_nf_sugestoes"
            referencedColumns: ["mov_id"]
          },
          {
            foreignKeyName: "movimentacoes_bancarias_par_transferencia_id_fkey"
            columns: ["par_transferencia_id"]
            isOneToOne: false
            referencedRelation: "vw_despesas_match_sugestoes"
            referencedColumns: ["mov_id"]
          },
          {
            foreignKeyName: "movimentacoes_bancarias_par_transferencia_id_fkey"
            columns: ["par_transferencia_id"]
            isOneToOne: false
            referencedRelation: "vw_pares_transferencia_sugeridos"
            referencedColumns: ["credito_id"]
          },
          {
            foreignKeyName: "movimentacoes_bancarias_par_transferencia_id_fkey"
            columns: ["par_transferencia_id"]
            isOneToOne: false
            referencedRelation: "vw_pares_transferencia_sugeridos"
            referencedColumns: ["debito_id"]
          },
          {
            foreignKeyName: "movimentacoes_bancarias_par_transferencia_id_fkey"
            columns: ["par_transferencia_id"]
            isOneToOne: false
            referencedRelation: "vw_recebivel_b2c_pedido"
            referencedColumns: ["movimentacao_id"]
          },
          {
            foreignKeyName: "movimentacoes_bancarias_plano_contas_id_fkey"
            columns: ["plano_contas_id"]
            isOneToOne: false
            referencedRelation: "plano_contas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "movimentacoes_bancarias_regra_aplicada_id_fkey"
            columns: ["regra_aplicada_id"]
            isOneToOne: false
            referencedRelation: "regras_classificacao_extrato"
            referencedColumns: ["id"]
          },
        ]
      }
      mural_preferencias_usuario: {
        Row: {
          aparecer_no_mural: boolean
          atualizado_em: string
          user_id: string
        }
        Insert: {
          aparecer_no_mural?: boolean
          atualizado_em?: string
          user_id: string
        }
        Update: {
          aparecer_no_mural?: boolean
          atualizado_em?: string
          user_id?: string
        }
        Relationships: []
      }
      mural_publicacoes: {
        Row: {
          aprovado_por: string | null
          area_alvo: string | null
          cor_tema: string | null
          created_at: string
          criado_por: string | null
          data_evento: string | null
          emoji: string | null
          expira_em: string | null
          fixado: boolean | null
          foto_url: string | null
          id: string
          kpi_id: string | null
          mensagem: string | null
          origem: string
          pessoa_alvo_id: string | null
          pessoa_alvo_nome: string | null
          pessoa_alvo_tipo: string | null
          publicado_em: string | null
          segmentacao: Json | null
          status: string
          subtipo: string | null
          tipo: string
          titulo: string
          updated_at: string
        }
        Insert: {
          aprovado_por?: string | null
          area_alvo?: string | null
          cor_tema?: string | null
          created_at?: string
          criado_por?: string | null
          data_evento?: string | null
          emoji?: string | null
          expira_em?: string | null
          fixado?: boolean | null
          foto_url?: string | null
          id?: string
          kpi_id?: string | null
          mensagem?: string | null
          origem?: string
          pessoa_alvo_id?: string | null
          pessoa_alvo_nome?: string | null
          pessoa_alvo_tipo?: string | null
          publicado_em?: string | null
          segmentacao?: Json | null
          status?: string
          subtipo?: string | null
          tipo: string
          titulo: string
          updated_at?: string
        }
        Update: {
          aprovado_por?: string | null
          area_alvo?: string | null
          cor_tema?: string | null
          created_at?: string
          criado_por?: string | null
          data_evento?: string | null
          emoji?: string | null
          expira_em?: string | null
          fixado?: boolean | null
          foto_url?: string | null
          id?: string
          kpi_id?: string | null
          mensagem?: string | null
          origem?: string
          pessoa_alvo_id?: string | null
          pessoa_alvo_nome?: string | null
          pessoa_alvo_tipo?: string | null
          publicado_em?: string | null
          segmentacao?: Json | null
          status?: string
          subtipo?: string | null
          tipo?: string
          titulo?: string
          updated_at?: string
        }
        Relationships: []
      }
      naturezas_operacao: {
        Row: {
          ativo: boolean
          codigo: string
          created_at: string
          dispensa_analise: boolean
          entra_receita: boolean
          forma_pagamento_default_id: string | null
          gera_despesa: boolean
          gera_titulo_receber: boolean
          id: string
          nome: string
          ordem: number
          precificacao: string
          updated_at: string
        }
        Insert: {
          ativo?: boolean
          codigo: string
          created_at?: string
          dispensa_analise?: boolean
          entra_receita?: boolean
          forma_pagamento_default_id?: string | null
          gera_despesa?: boolean
          gera_titulo_receber?: boolean
          id?: string
          nome: string
          ordem?: number
          precificacao?: string
          updated_at?: string
        }
        Update: {
          ativo?: boolean
          codigo?: string
          created_at?: string
          dispensa_analise?: boolean
          entra_receita?: boolean
          forma_pagamento_default_id?: string | null
          gera_despesa?: boolean
          gera_titulo_receber?: boolean
          id?: string
          nome?: string
          ordem?: number
          precificacao?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "naturezas_operacao_forma_pagamento_default_id_fkey"
            columns: ["forma_pagamento_default_id"]
            isOneToOne: false
            referencedRelation: "formas_pagamento"
            referencedColumns: ["id"]
          },
        ]
      }
      navegacao_log: {
        Row: {
          acessado_em: string
          id: string
          rota: string
          titulo: string | null
          user_id: string
        }
        Insert: {
          acessado_em?: string
          id?: string
          rota: string
          titulo?: string | null
          user_id: string
        }
        Update: {
          acessado_em?: string
          id?: string
          rota?: string
          titulo?: string | null
          user_id?: string
        }
        Relationships: []
      }
      nf_pj_classificacoes: {
        Row: {
          categoria_valor: string
          created_at: string
          created_by: string | null
          descricao_adicional: string | null
          id: string
          justificativa: string | null
          nota_fiscal_id: string
          ordem: number
          updated_at: string
          valor: number
        }
        Insert: {
          categoria_valor: string
          created_at?: string
          created_by?: string | null
          descricao_adicional?: string | null
          id?: string
          justificativa?: string | null
          nota_fiscal_id: string
          ordem?: number
          updated_at?: string
          valor: number
        }
        Update: {
          categoria_valor?: string
          created_at?: string
          created_by?: string | null
          descricao_adicional?: string | null
          id?: string
          justificativa?: string | null
          nota_fiscal_id?: string
          ordem?: number
          updated_at?: string
          valor?: number
        }
        Relationships: [
          {
            foreignKeyName: "nf_pj_classificacoes_nota_fiscal_id_fkey"
            columns: ["nota_fiscal_id"]
            isOneToOne: false
            referencedRelation: "notas_fiscais_pj"
            referencedColumns: ["id"]
          },
        ]
      }
      nf_pj_log_fiscal: {
        Row: {
          ator_papel: string | null
          ator_user_id: string | null
          detalhes: Json | null
          email_destinatario: string | null
          hash_arquivo: string | null
          id: string
          nota_fiscal_id: string
          registrado_em: string
          tipo_evento: string
        }
        Insert: {
          ator_papel?: string | null
          ator_user_id?: string | null
          detalhes?: Json | null
          email_destinatario?: string | null
          hash_arquivo?: string | null
          id?: string
          nota_fiscal_id: string
          registrado_em?: string
          tipo_evento: string
        }
        Update: {
          ator_papel?: string | null
          ator_user_id?: string | null
          detalhes?: Json | null
          email_destinatario?: string | null
          hash_arquivo?: string | null
          id?: string
          nota_fiscal_id?: string
          registrado_em?: string
          tipo_evento?: string
        }
        Relationships: [
          {
            foreignKeyName: "nf_pj_log_fiscal_nota_fiscal_id_fkey"
            columns: ["nota_fiscal_id"]
            isOneToOne: false
            referencedRelation: "notas_fiscais_pj"
            referencedColumns: ["id"]
          },
        ]
      }
      nfs_emitidas: {
        Row: {
          bling_id: string | null
          bling_pedido_venda_id: string | null
          bling_pedido_venda_numero: string | null
          chave_acesso: string | null
          created_at: string
          data_emissao: string | null
          data_saida: string | null
          id: string
          itens_json: Json | null
          numero: string | null
          numero_pedido_loja: string | null
          observacoes: string | null
          origem: string | null
          parceiro_id: string | null
          pdf_url: string | null
          pedido_venda_id: string | null
          raw: Json | null
          serie: string | null
          situacao: string | null
          tipo: string | null
          tipo_venda: string | null
          transportadora_cnpj: string | null
          transportadora_nome: string | null
          transporte_raw: Json | null
          updated_at: string
          valor_frete: number | null
          valor_nota: number | null
          xml_url: string | null
        }
        Insert: {
          bling_id?: string | null
          bling_pedido_venda_id?: string | null
          bling_pedido_venda_numero?: string | null
          chave_acesso?: string | null
          created_at?: string
          data_emissao?: string | null
          data_saida?: string | null
          id?: string
          itens_json?: Json | null
          numero?: string | null
          numero_pedido_loja?: string | null
          observacoes?: string | null
          origem?: string | null
          parceiro_id?: string | null
          pdf_url?: string | null
          pedido_venda_id?: string | null
          raw?: Json | null
          serie?: string | null
          situacao?: string | null
          tipo?: string | null
          tipo_venda?: string | null
          transportadora_cnpj?: string | null
          transportadora_nome?: string | null
          transporte_raw?: Json | null
          updated_at?: string
          valor_frete?: number | null
          valor_nota?: number | null
          xml_url?: string | null
        }
        Update: {
          bling_id?: string | null
          bling_pedido_venda_id?: string | null
          bling_pedido_venda_numero?: string | null
          chave_acesso?: string | null
          created_at?: string
          data_emissao?: string | null
          data_saida?: string | null
          id?: string
          itens_json?: Json | null
          numero?: string | null
          numero_pedido_loja?: string | null
          observacoes?: string | null
          origem?: string | null
          parceiro_id?: string | null
          pdf_url?: string | null
          pedido_venda_id?: string | null
          raw?: Json | null
          serie?: string | null
          situacao?: string | null
          tipo?: string | null
          tipo_venda?: string | null
          transportadora_cnpj?: string | null
          transportadora_nome?: string | null
          transporte_raw?: Json | null
          updated_at?: string
          valor_frete?: number | null
          valor_nota?: number | null
          xml_url?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "nfs_emitidas_parceiro_id_fkey"
            columns: ["parceiro_id"]
            isOneToOne: false
            referencedRelation: "parceiros_comerciais"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "nfs_emitidas_parceiro_id_fkey"
            columns: ["parceiro_id"]
            isOneToOne: false
            referencedRelation: "v_credito_resumo_financeiro"
            referencedColumns: ["parceiro_id"]
          },
          {
            foreignKeyName: "nfs_emitidas_parceiro_id_fkey"
            columns: ["parceiro_id"]
            isOneToOne: false
            referencedRelation: "vw_logistica_agregado"
            referencedColumns: ["transportadora_id"]
          },
          {
            foreignKeyName: "nfs_emitidas_parceiro_id_fkey"
            columns: ["parceiro_id"]
            isOneToOne: false
            referencedRelation: "vw_recebivel_por_conta"
            referencedColumns: ["conta_id"]
          },
          {
            foreignKeyName: "nfs_emitidas_pedido_venda_id_fkey"
            columns: ["pedido_venda_id"]
            isOneToOne: false
            referencedRelation: "pedidos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "nfs_emitidas_pedido_venda_id_fkey"
            columns: ["pedido_venda_id"]
            isOneToOne: false
            referencedRelation: "v_pedidos_fila"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "nfs_emitidas_pedido_venda_id_fkey"
            columns: ["pedido_venda_id"]
            isOneToOne: false
            referencedRelation: "v_pedidos_priorizados"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "nfs_emitidas_pedido_venda_id_fkey"
            columns: ["pedido_venda_id"]
            isOneToOne: false
            referencedRelation: "vw_gestao_pedidos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "nfs_emitidas_pedido_venda_id_fkey"
            columns: ["pedido_venda_id"]
            isOneToOne: false
            referencedRelation: "vw_pedido_base"
            referencedColumns: ["pedido_id"]
          },
          {
            foreignKeyName: "nfs_emitidas_pedido_venda_id_fkey"
            columns: ["pedido_venda_id"]
            isOneToOne: false
            referencedRelation: "vw_pedidos_farol"
            referencedColumns: ["pedido_id"]
          },
        ]
      }
      nfs_stage: {
        Row: {
          categoria_sugerida_ia: boolean
          centro_custo_id: string | null
          conta_pagar_id: string | null
          created_at: string
          criada_por: string | null
          data_vencimento: string | null
          descricao: string | null
          duplicatas: Json | null
          fonte: string
          fornecedor_cliente: string | null
          fornecedor_cnpj: string | null
          fornecedor_razao_social: string | null
          id: string
          importacao_lote_id: string | null
          itens: Json | null
          match_motivos: string | null
          match_score: number | null
          meio_pagamento: string | null
          moeda: string
          motivo_descarte: string | null
          nf_chave_acesso: string | null
          nf_data_emissao: string | null
          nf_numero: string | null
          nf_serie: string | null
          numero_documento_referencia: string | null
          numero_parcela: number | null
          pais_emissor: string
          parceiro_id: string | null
          plano_contas_id: string | null
          resumo_pdf_gerado_em: string | null
          resumo_pdf_pendente: boolean
          resumo_pdf_storage_path: string | null
          revisada_em: string | null
          revisada_por: string | null
          revisao_origem: string | null
          status: string
          taxa_conversao: number | null
          tem_xml_obrigatorio: boolean
          tipo_documento: string
          total_parcelas: number | null
          updated_at: string
          valor: number | null
          valor_origem: number | null
        }
        Insert: {
          categoria_sugerida_ia?: boolean
          centro_custo_id?: string | null
          conta_pagar_id?: string | null
          created_at?: string
          criada_por?: string | null
          data_vencimento?: string | null
          descricao?: string | null
          duplicatas?: Json | null
          fonte?: string
          fornecedor_cliente?: string | null
          fornecedor_cnpj?: string | null
          fornecedor_razao_social?: string | null
          id?: string
          importacao_lote_id?: string | null
          itens?: Json | null
          match_motivos?: string | null
          match_score?: number | null
          meio_pagamento?: string | null
          moeda?: string
          motivo_descarte?: string | null
          nf_chave_acesso?: string | null
          nf_data_emissao?: string | null
          nf_numero?: string | null
          nf_serie?: string | null
          numero_documento_referencia?: string | null
          numero_parcela?: number | null
          pais_emissor?: string
          parceiro_id?: string | null
          plano_contas_id?: string | null
          resumo_pdf_gerado_em?: string | null
          resumo_pdf_pendente?: boolean
          resumo_pdf_storage_path?: string | null
          revisada_em?: string | null
          revisada_por?: string | null
          revisao_origem?: string | null
          status?: string
          taxa_conversao?: number | null
          tem_xml_obrigatorio?: boolean
          tipo_documento?: string
          total_parcelas?: number | null
          updated_at?: string
          valor?: number | null
          valor_origem?: number | null
        }
        Update: {
          categoria_sugerida_ia?: boolean
          centro_custo_id?: string | null
          conta_pagar_id?: string | null
          created_at?: string
          criada_por?: string | null
          data_vencimento?: string | null
          descricao?: string | null
          duplicatas?: Json | null
          fonte?: string
          fornecedor_cliente?: string | null
          fornecedor_cnpj?: string | null
          fornecedor_razao_social?: string | null
          id?: string
          importacao_lote_id?: string | null
          itens?: Json | null
          match_motivos?: string | null
          match_score?: number | null
          meio_pagamento?: string | null
          moeda?: string
          motivo_descarte?: string | null
          nf_chave_acesso?: string | null
          nf_data_emissao?: string | null
          nf_numero?: string | null
          nf_serie?: string | null
          numero_documento_referencia?: string | null
          numero_parcela?: number | null
          pais_emissor?: string
          parceiro_id?: string | null
          plano_contas_id?: string | null
          resumo_pdf_gerado_em?: string | null
          resumo_pdf_pendente?: boolean
          resumo_pdf_storage_path?: string | null
          revisada_em?: string | null
          revisada_por?: string | null
          revisao_origem?: string | null
          status?: string
          taxa_conversao?: number | null
          tem_xml_obrigatorio?: boolean
          tipo_documento?: string
          total_parcelas?: number | null
          updated_at?: string
          valor?: number | null
          valor_origem?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "nfs_stage_centro_custo_id_fkey"
            columns: ["centro_custo_id"]
            isOneToOne: false
            referencedRelation: "centros_custo"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "nfs_stage_centro_custo_id_fkey"
            columns: ["centro_custo_id"]
            isOneToOne: false
            referencedRelation: "vw_custo_pessoas"
            referencedColumns: ["centro_custo_id"]
          },
          {
            foreignKeyName: "nfs_stage_centro_custo_id_fkey"
            columns: ["centro_custo_id"]
            isOneToOne: false
            referencedRelation: "vw_dimensionamento_areas"
            referencedColumns: ["centro_custo_id"]
          },
          {
            foreignKeyName: "nfs_stage_conta_pagar_id_fkey"
            columns: ["conta_pagar_id"]
            isOneToOne: false
            referencedRelation: "contas_pagar"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "nfs_stage_conta_pagar_id_fkey"
            columns: ["conta_pagar_id"]
            isOneToOne: false
            referencedRelation: "contas_pagar_receber"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "nfs_stage_conta_pagar_id_fkey"
            columns: ["conta_pagar_id"]
            isOneToOne: false
            referencedRelation: "contas_pagar_receber_ativas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "nfs_stage_conta_pagar_id_fkey"
            columns: ["conta_pagar_id"]
            isOneToOne: false
            referencedRelation: "v_cpr_bola_redonda"
            referencedColumns: ["cpr_id"]
          },
          {
            foreignKeyName: "nfs_stage_conta_pagar_id_fkey"
            columns: ["conta_pagar_id"]
            isOneToOne: false
            referencedRelation: "vw_conciliacao_furos"
            referencedColumns: ["sugestao_cpr_id"]
          },
          {
            foreignKeyName: "nfs_stage_conta_pagar_id_fkey"
            columns: ["conta_pagar_id"]
            isOneToOne: false
            referencedRelation: "vw_contas_pagar_consolidado"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "nfs_stage_conta_pagar_id_fkey"
            columns: ["conta_pagar_id"]
            isOneToOne: false
            referencedRelation: "vw_despesas_match_sugestoes"
            referencedColumns: ["cpr_id"]
          },
          {
            foreignKeyName: "nfs_stage_conta_pagar_id_fkey"
            columns: ["conta_pagar_id"]
            isOneToOne: false
            referencedRelation: "vw_documentos_envio_estados"
            referencedColumns: ["conta_id"]
          },
          {
            foreignKeyName: "nfs_stage_conta_pagar_id_fkey"
            columns: ["conta_pagar_id"]
            isOneToOne: false
            referencedRelation: "vw_pj_pagamentos"
            referencedColumns: ["cpr_id"]
          },
          {
            foreignKeyName: "nfs_stage_parceiro_id_fkey"
            columns: ["parceiro_id"]
            isOneToOne: false
            referencedRelation: "parceiros_comerciais"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "nfs_stage_parceiro_id_fkey"
            columns: ["parceiro_id"]
            isOneToOne: false
            referencedRelation: "v_credito_resumo_financeiro"
            referencedColumns: ["parceiro_id"]
          },
          {
            foreignKeyName: "nfs_stage_parceiro_id_fkey"
            columns: ["parceiro_id"]
            isOneToOne: false
            referencedRelation: "vw_logistica_agregado"
            referencedColumns: ["transportadora_id"]
          },
          {
            foreignKeyName: "nfs_stage_parceiro_id_fkey"
            columns: ["parceiro_id"]
            isOneToOne: false
            referencedRelation: "vw_recebivel_por_conta"
            referencedColumns: ["conta_id"]
          },
          {
            foreignKeyName: "nfs_stage_plano_contas_id_fkey"
            columns: ["plano_contas_id"]
            isOneToOne: false
            referencedRelation: "plano_contas"
            referencedColumns: ["id"]
          },
        ]
      }
      nfs_stage_documentos: {
        Row: {
          arquivo_nome: string | null
          criado_em: string
          criado_por: string | null
          data_vencimento: string | null
          ged_documento_id: string | null
          id: string
          linha_digitavel: string | null
          nfs_stage_id: string
          storage_path: string
          tipo: string
          valor: number | null
        }
        Insert: {
          arquivo_nome?: string | null
          criado_em?: string
          criado_por?: string | null
          data_vencimento?: string | null
          ged_documento_id?: string | null
          id?: string
          linha_digitavel?: string | null
          nfs_stage_id: string
          storage_path: string
          tipo: string
          valor?: number | null
        }
        Update: {
          arquivo_nome?: string | null
          criado_em?: string
          criado_por?: string | null
          data_vencimento?: string | null
          ged_documento_id?: string | null
          id?: string
          linha_digitavel?: string | null
          nfs_stage_id?: string
          storage_path?: string
          tipo?: string
          valor?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "nfs_stage_documentos_ged_documento_id_fkey"
            columns: ["ged_documento_id"]
            isOneToOne: false
            referencedRelation: "ged_documentos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "nfs_stage_documentos_nfs_stage_id_fkey"
            columns: ["nfs_stage_id"]
            isOneToOne: false
            referencedRelation: "nfs_stage"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "nfs_stage_documentos_nfs_stage_id_fkey"
            columns: ["nfs_stage_id"]
            isOneToOne: false
            referencedRelation: "vw_conciliacao_furos"
            referencedColumns: ["sugestao_stage_id"]
          },
          {
            foreignKeyName: "nfs_stage_documentos_nfs_stage_id_fkey"
            columns: ["nfs_stage_id"]
            isOneToOne: false
            referencedRelation: "vw_contas_pagar_consolidado"
            referencedColumns: ["nf_stage_id"]
          },
          {
            foreignKeyName: "nfs_stage_documentos_nfs_stage_id_fkey"
            columns: ["nfs_stage_id"]
            isOneToOne: false
            referencedRelation: "vw_despesas_match_nf_sugestoes"
            referencedColumns: ["stage_id"]
          },
          {
            foreignKeyName: "nfs_stage_documentos_nfs_stage_id_fkey"
            columns: ["nfs_stage_id"]
            isOneToOne: false
            referencedRelation: "vw_documentos_envio_estados"
            referencedColumns: ["nf_stage_id"]
          },
          {
            foreignKeyName: "nfs_stage_documentos_nfs_stage_id_fkey"
            columns: ["nfs_stage_id"]
            isOneToOne: false
            referencedRelation: "vw_nf_vinculo_pessoa"
            referencedColumns: ["stage_id"]
          },
          {
            foreignKeyName: "nfs_stage_documentos_nfs_stage_id_fkey"
            columns: ["nfs_stage_id"]
            isOneToOne: false
            referencedRelation: "vw_nfs_stage_completude"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "nfs_stage_documentos_nfs_stage_id_fkey"
            columns: ["nfs_stage_id"]
            isOneToOne: false
            referencedRelation: "vw_pj_notas_fiscais"
            referencedColumns: ["nf_id"]
          },
        ]
      }
      nfs_stage_venda: {
        Row: {
          created_at: string
          diff_jsonb: Json | null
          id: string
          nf_id: string
          pedido_id: string
          resolvido_em: string | null
          resolvido_motivo: string | null
          resolvido_por: string | null
          status: string
        }
        Insert: {
          created_at?: string
          diff_jsonb?: Json | null
          id?: string
          nf_id: string
          pedido_id: string
          resolvido_em?: string | null
          resolvido_motivo?: string | null
          resolvido_por?: string | null
          status?: string
        }
        Update: {
          created_at?: string
          diff_jsonb?: Json | null
          id?: string
          nf_id?: string
          pedido_id?: string
          resolvido_em?: string | null
          resolvido_motivo?: string | null
          resolvido_por?: string | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "nfs_stage_venda_nf_id_fkey"
            columns: ["nf_id"]
            isOneToOne: false
            referencedRelation: "nfs_emitidas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "nfs_stage_venda_nf_id_fkey"
            columns: ["nf_id"]
            isOneToOne: false
            referencedRelation: "vw_nf_pedido_resolvido"
            referencedColumns: ["nf_id"]
          },
          {
            foreignKeyName: "nfs_stage_venda_pedido_id_fkey"
            columns: ["pedido_id"]
            isOneToOne: false
            referencedRelation: "pedidos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "nfs_stage_venda_pedido_id_fkey"
            columns: ["pedido_id"]
            isOneToOne: false
            referencedRelation: "v_pedidos_fila"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "nfs_stage_venda_pedido_id_fkey"
            columns: ["pedido_id"]
            isOneToOne: false
            referencedRelation: "v_pedidos_priorizados"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "nfs_stage_venda_pedido_id_fkey"
            columns: ["pedido_id"]
            isOneToOne: false
            referencedRelation: "vw_gestao_pedidos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "nfs_stage_venda_pedido_id_fkey"
            columns: ["pedido_id"]
            isOneToOne: false
            referencedRelation: "vw_pedido_base"
            referencedColumns: ["pedido_id"]
          },
          {
            foreignKeyName: "nfs_stage_venda_pedido_id_fkey"
            columns: ["pedido_id"]
            isOneToOne: false
            referencedRelation: "vw_pedidos_farol"
            referencedColumns: ["pedido_id"]
          },
        ]
      }
      notas_fiscais_pj: {
        Row: {
          arquivo_url: string | null
          competencia: string
          contrato_id: string
          created_at: string
          data_emissao: string
          data_pagamento: string | null
          data_vencimento: string | null
          descricao: string | null
          id: string
          numero: string
          observacoes: string | null
          serie: string | null
          status: string
          updated_at: string
          valor: number
        }
        Insert: {
          arquivo_url?: string | null
          competencia: string
          contrato_id: string
          created_at?: string
          data_emissao: string
          data_pagamento?: string | null
          data_vencimento?: string | null
          descricao?: string | null
          id?: string
          numero: string
          observacoes?: string | null
          serie?: string | null
          status?: string
          updated_at?: string
          valor: number
        }
        Update: {
          arquivo_url?: string | null
          competencia?: string
          contrato_id?: string
          created_at?: string
          data_emissao?: string
          data_pagamento?: string | null
          data_vencimento?: string | null
          descricao?: string | null
          id?: string
          numero?: string
          observacoes?: string | null
          serie?: string | null
          status?: string
          updated_at?: string
          valor?: number
        }
        Relationships: [
          {
            foreignKeyName: "notas_fiscais_pj_contrato_id_fkey"
            columns: ["contrato_id"]
            isOneToOne: false
            referencedRelation: "contratos_pj"
            referencedColumns: ["id"]
          },
        ]
      }
      notificacoes_rh: {
        Row: {
          created_at: string
          id: string
          lida: boolean
          link: string | null
          mensagem: string | null
          tipo: string
          titulo: string
          user_id: string | null
        }
        Insert: {
          created_at?: string
          id?: string
          lida?: boolean
          link?: string | null
          mensagem?: string | null
          tipo: string
          titulo: string
          user_id?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          lida?: boolean
          link?: string | null
          mensagem?: string | null
          tipo?: string
          titulo?: string
          user_id?: string | null
        }
        Relationships: []
      }
      ofertas_candidato: {
        Row: {
          beneficios: string | null
          candidato_id: string
          created_at: string | null
          data_inicio: string | null
          enviado_em: string | null
          enviado_por: string | null
          id: string
          observacoes: string | null
          respondido_em: string | null
          salario_proposto: number | null
          status: string | null
          tipo_contrato: string | null
          updated_at: string | null
          vaga_id: string
        }
        Insert: {
          beneficios?: string | null
          candidato_id: string
          created_at?: string | null
          data_inicio?: string | null
          enviado_em?: string | null
          enviado_por?: string | null
          id?: string
          observacoes?: string | null
          respondido_em?: string | null
          salario_proposto?: number | null
          status?: string | null
          tipo_contrato?: string | null
          updated_at?: string | null
          vaga_id: string
        }
        Update: {
          beneficios?: string | null
          candidato_id?: string
          created_at?: string | null
          data_inicio?: string | null
          enviado_em?: string | null
          enviado_por?: string | null
          id?: string
          observacoes?: string | null
          respondido_em?: string | null
          salario_proposto?: number | null
          status?: string | null
          tipo_contrato?: string | null
          updated_at?: string | null
          vaga_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "ofertas_candidato_candidato_id_fkey"
            columns: ["candidato_id"]
            isOneToOne: false
            referencedRelation: "candidatos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ofertas_candidato_vaga_id_fkey"
            columns: ["vaga_id"]
            isOneToOne: false
            referencedRelation: "vagas"
            referencedColumns: ["id"]
          },
        ]
      }
      ofx_importacoes_stage: {
        Row: {
          arquivo_nome: string | null
          arquivo_storage_path: string | null
          conta_bancaria_id: string
          created_at: string | null
          criado_por: string | null
          id: string
          periodo_fim: string | null
          periodo_inicio: string | null
          persistido_em: string | null
          persistido_por: string | null
          saldo_final: number | null
          status: string
          total_transacoes: number
        }
        Insert: {
          arquivo_nome?: string | null
          arquivo_storage_path?: string | null
          conta_bancaria_id: string
          created_at?: string | null
          criado_por?: string | null
          id?: string
          periodo_fim?: string | null
          periodo_inicio?: string | null
          persistido_em?: string | null
          persistido_por?: string | null
          saldo_final?: number | null
          status?: string
          total_transacoes?: number
        }
        Update: {
          arquivo_nome?: string | null
          arquivo_storage_path?: string | null
          conta_bancaria_id?: string
          created_at?: string | null
          criado_por?: string | null
          id?: string
          periodo_fim?: string | null
          periodo_inicio?: string | null
          persistido_em?: string | null
          persistido_por?: string | null
          saldo_final?: number | null
          status?: string
          total_transacoes?: number
        }
        Relationships: [
          {
            foreignKeyName: "ofx_importacoes_stage_conta_bancaria_id_fkey"
            columns: ["conta_bancaria_id"]
            isOneToOne: false
            referencedRelation: "contas_bancarias"
            referencedColumns: ["id"]
          },
        ]
      }
      ofx_regras_automaticas: {
        Row: {
          acao: string
          ativo: boolean
          centro_custo_id: string | null
          conta_bancaria_id: string | null
          conta_plano_id: string | null
          created_at: string | null
          descricao_override: string | null
          id: string
          nome: string
          pattern: string
        }
        Insert: {
          acao?: string
          ativo?: boolean
          centro_custo_id?: string | null
          conta_bancaria_id?: string | null
          conta_plano_id?: string | null
          created_at?: string | null
          descricao_override?: string | null
          id?: string
          nome: string
          pattern: string
        }
        Update: {
          acao?: string
          ativo?: boolean
          centro_custo_id?: string | null
          conta_bancaria_id?: string | null
          conta_plano_id?: string | null
          created_at?: string | null
          descricao_override?: string | null
          id?: string
          nome?: string
          pattern?: string
        }
        Relationships: [
          {
            foreignKeyName: "ofx_regras_automaticas_centro_custo_id_fkey"
            columns: ["centro_custo_id"]
            isOneToOne: false
            referencedRelation: "centros_custo"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ofx_regras_automaticas_centro_custo_id_fkey"
            columns: ["centro_custo_id"]
            isOneToOne: false
            referencedRelation: "vw_custo_pessoas"
            referencedColumns: ["centro_custo_id"]
          },
          {
            foreignKeyName: "ofx_regras_automaticas_centro_custo_id_fkey"
            columns: ["centro_custo_id"]
            isOneToOne: false
            referencedRelation: "vw_dimensionamento_areas"
            referencedColumns: ["centro_custo_id"]
          },
          {
            foreignKeyName: "ofx_regras_automaticas_conta_bancaria_id_fkey"
            columns: ["conta_bancaria_id"]
            isOneToOne: false
            referencedRelation: "contas_bancarias"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ofx_regras_automaticas_conta_plano_id_fkey"
            columns: ["conta_plano_id"]
            isOneToOne: false
            referencedRelation: "plano_contas"
            referencedColumns: ["id"]
          },
        ]
      }
      ofx_transacoes_stage: {
        Row: {
          conta_bancaria_id: string
          created_at: string | null
          data_transacao: string
          descricao: string
          duplicada_de: string | null
          hash_unico: string
          id: string
          id_transacao_banco: string | null
          importacao_stage_id: string
          saldo_pos_transacao: number | null
          status: string
          tipo: string | null
          valor: number
        }
        Insert: {
          conta_bancaria_id: string
          created_at?: string | null
          data_transacao: string
          descricao: string
          duplicada_de?: string | null
          hash_unico: string
          id?: string
          id_transacao_banco?: string | null
          importacao_stage_id: string
          saldo_pos_transacao?: number | null
          status?: string
          tipo?: string | null
          valor: number
        }
        Update: {
          conta_bancaria_id?: string
          created_at?: string | null
          data_transacao?: string
          descricao?: string
          duplicada_de?: string | null
          hash_unico?: string
          id?: string
          id_transacao_banco?: string | null
          importacao_stage_id?: string
          saldo_pos_transacao?: number | null
          status?: string
          tipo?: string | null
          valor?: number
        }
        Relationships: [
          {
            foreignKeyName: "ofx_transacoes_stage_conta_bancaria_id_fkey"
            columns: ["conta_bancaria_id"]
            isOneToOne: false
            referencedRelation: "contas_bancarias"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ofx_transacoes_stage_duplicada_de_fkey"
            columns: ["duplicada_de"]
            isOneToOne: false
            referencedRelation: "movimentacoes_bancarias"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ofx_transacoes_stage_duplicada_de_fkey"
            columns: ["duplicada_de"]
            isOneToOne: false
            referencedRelation: "vw_conciliacao_cartao_sugestoes"
            referencedColumns: ["ofx_id"]
          },
          {
            foreignKeyName: "ofx_transacoes_stage_duplicada_de_fkey"
            columns: ["duplicada_de"]
            isOneToOne: false
            referencedRelation: "vw_conciliacao_furos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ofx_transacoes_stage_duplicada_de_fkey"
            columns: ["duplicada_de"]
            isOneToOne: false
            referencedRelation: "vw_despesas_match_nf_sugestoes"
            referencedColumns: ["mov_id"]
          },
          {
            foreignKeyName: "ofx_transacoes_stage_duplicada_de_fkey"
            columns: ["duplicada_de"]
            isOneToOne: false
            referencedRelation: "vw_despesas_match_sugestoes"
            referencedColumns: ["mov_id"]
          },
          {
            foreignKeyName: "ofx_transacoes_stage_duplicada_de_fkey"
            columns: ["duplicada_de"]
            isOneToOne: false
            referencedRelation: "vw_pares_transferencia_sugeridos"
            referencedColumns: ["credito_id"]
          },
          {
            foreignKeyName: "ofx_transacoes_stage_duplicada_de_fkey"
            columns: ["duplicada_de"]
            isOneToOne: false
            referencedRelation: "vw_pares_transferencia_sugeridos"
            referencedColumns: ["debito_id"]
          },
          {
            foreignKeyName: "ofx_transacoes_stage_duplicada_de_fkey"
            columns: ["duplicada_de"]
            isOneToOne: false
            referencedRelation: "vw_recebivel_b2c_pedido"
            referencedColumns: ["movimentacao_id"]
          },
          {
            foreignKeyName: "ofx_transacoes_stage_importacao_stage_id_fkey"
            columns: ["importacao_stage_id"]
            isOneToOne: false
            referencedRelation: "ofx_importacoes_stage"
            referencedColumns: ["id"]
          },
        ]
      }
      onboarding_checklists: {
        Row: {
          aviso_previo: boolean | null
          colaborador_id: string | null
          colaborador_tipo: string
          concluido_em: string | null
          convite_id: string | null
          coordenador_nome: string | null
          coordenador_user_id: string | null
          created_at: string
          data_efetivacao: string | null
          id: string
          motivo: string | null
          observacoes: string | null
          status: string
          tipo_processo: string | null
          updated_at: string
        }
        Insert: {
          aviso_previo?: boolean | null
          colaborador_id?: string | null
          colaborador_tipo: string
          concluido_em?: string | null
          convite_id?: string | null
          coordenador_nome?: string | null
          coordenador_user_id?: string | null
          created_at?: string
          data_efetivacao?: string | null
          id?: string
          motivo?: string | null
          observacoes?: string | null
          status?: string
          tipo_processo?: string | null
          updated_at?: string
        }
        Update: {
          aviso_previo?: boolean | null
          colaborador_id?: string | null
          colaborador_tipo?: string
          concluido_em?: string | null
          convite_id?: string | null
          coordenador_nome?: string | null
          coordenador_user_id?: string | null
          created_at?: string
          data_efetivacao?: string | null
          id?: string
          motivo?: string | null
          observacoes?: string | null
          status?: string
          tipo_processo?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "onboarding_checklists_convite_id_fkey"
            columns: ["convite_id"]
            isOneToOne: false
            referencedRelation: "convites_cadastro"
            referencedColumns: ["id"]
          },
        ]
      }
      onboarding_tarefas: {
        Row: {
          checklist_id: string
          concluida_em: string | null
          concluida_por: string | null
          created_at: string
          descricao: string | null
          id: string
          prazo_data: string | null
          prazo_dias: number
          responsavel_role: Database["public"]["Enums"]["app_role"]
          responsavel_user_id: string | null
          status: string
          titulo: string
          updated_at: string
        }
        Insert: {
          checklist_id: string
          concluida_em?: string | null
          concluida_por?: string | null
          created_at?: string
          descricao?: string | null
          id?: string
          prazo_data?: string | null
          prazo_dias?: number
          responsavel_role: Database["public"]["Enums"]["app_role"]
          responsavel_user_id?: string | null
          status?: string
          titulo: string
          updated_at?: string
        }
        Update: {
          checklist_id?: string
          concluida_em?: string | null
          concluida_por?: string | null
          created_at?: string
          descricao?: string | null
          id?: string
          prazo_data?: string | null
          prazo_dias?: number
          responsavel_role?: Database["public"]["Enums"]["app_role"]
          responsavel_user_id?: string | null
          status?: string
          titulo?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "onboarding_tarefas_checklist_id_fkey"
            columns: ["checklist_id"]
            isOneToOne: false
            referencedRelation: "onboarding_checklists"
            referencedColumns: ["id"]
          },
        ]
      }
      pagamentos_pj: {
        Row: {
          competencia: string
          comprovante_url: string | null
          contrato_id: string
          created_at: string
          data_pagamento: string | null
          data_prevista: string
          forma_pagamento: string
          id: string
          nota_fiscal_id: string | null
          observacoes: string | null
          status: string
          updated_at: string
          valor: number
        }
        Insert: {
          competencia: string
          comprovante_url?: string | null
          contrato_id: string
          created_at?: string
          data_pagamento?: string | null
          data_prevista: string
          forma_pagamento?: string
          id?: string
          nota_fiscal_id?: string | null
          observacoes?: string | null
          status?: string
          updated_at?: string
          valor: number
        }
        Update: {
          competencia?: string
          comprovante_url?: string | null
          contrato_id?: string
          created_at?: string
          data_pagamento?: string | null
          data_prevista?: string
          forma_pagamento?: string
          id?: string
          nota_fiscal_id?: string | null
          observacoes?: string | null
          status?: string
          updated_at?: string
          valor?: number
        }
        Relationships: [
          {
            foreignKeyName: "pagamentos_pj_contrato_id_fkey"
            columns: ["contrato_id"]
            isOneToOne: false
            referencedRelation: "contratos_pj"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pagamentos_pj_nota_fiscal_id_fkey"
            columns: ["nota_fiscal_id"]
            isOneToOne: false
            referencedRelation: "notas_fiscais_pj"
            referencedColumns: ["id"]
          },
        ]
      }
      parametros: {
        Row: {
          ativo: boolean
          categoria: string
          created_at: string
          descricao: string | null
          id: string
          is_clevel: boolean | null
          label: string
          ordem: number
          pai_valor: string | null
          parent_id: string | null
          perfil_area_codigo: string | null
          updated_at: string
          valor: string
        }
        Insert: {
          ativo?: boolean
          categoria: string
          created_at?: string
          descricao?: string | null
          id?: string
          is_clevel?: boolean | null
          label: string
          ordem?: number
          pai_valor?: string | null
          parent_id?: string | null
          perfil_area_codigo?: string | null
          updated_at?: string
          valor: string
        }
        Update: {
          ativo?: boolean
          categoria?: string
          created_at?: string
          descricao?: string | null
          id?: string
          is_clevel?: boolean | null
          label?: string
          ordem?: number
          pai_valor?: string | null
          parent_id?: string | null
          perfil_area_codigo?: string | null
          updated_at?: string
          valor?: string
        }
        Relationships: [
          {
            foreignKeyName: "parametros_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "parametros"
            referencedColumns: ["id"]
          },
        ]
      }
      parametros_remessa_safra: {
        Row: {
          atualizado_em: string
          atualizado_por: string | null
          chave: string
          descricao: string | null
          id: string
          valor: string
        }
        Insert: {
          atualizado_em?: string
          atualizado_por?: string | null
          chave: string
          descricao?: string | null
          id?: string
          valor: string
        }
        Update: {
          atualizado_em?: string
          atualizado_por?: string | null
          chave?: string
          descricao?: string | null
          id?: string
          valor?: string
        }
        Relationships: []
      }
      parceiro_eventos_externos: {
        Row: {
          data_evento: string
          fonte: string
          id: string
          parceiro_id: string
          payload: Json | null
          processado: boolean
          recebido_em: string
          tipo_evento: string
        }
        Insert: {
          data_evento: string
          fonte: string
          id?: string
          parceiro_id: string
          payload?: Json | null
          processado?: boolean
          recebido_em?: string
          tipo_evento: string
        }
        Update: {
          data_evento?: string
          fonte?: string
          id?: string
          parceiro_id?: string
          payload?: Json | null
          processado?: boolean
          recebido_em?: string
          tipo_evento?: string
        }
        Relationships: [
          {
            foreignKeyName: "parceiro_eventos_externos_parceiro_id_fkey"
            columns: ["parceiro_id"]
            isOneToOne: false
            referencedRelation: "parceiros_comerciais"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "parceiro_eventos_externos_parceiro_id_fkey"
            columns: ["parceiro_id"]
            isOneToOne: false
            referencedRelation: "v_credito_resumo_financeiro"
            referencedColumns: ["parceiro_id"]
          },
          {
            foreignKeyName: "parceiro_eventos_externos_parceiro_id_fkey"
            columns: ["parceiro_id"]
            isOneToOne: false
            referencedRelation: "vw_logistica_agregado"
            referencedColumns: ["transportadora_id"]
          },
          {
            foreignKeyName: "parceiro_eventos_externos_parceiro_id_fkey"
            columns: ["parceiro_id"]
            isOneToOne: false
            referencedRelation: "vw_recebivel_por_conta"
            referencedColumns: ["conta_id"]
          },
        ]
      }
      parceiro_marcos: {
        Row: {
          criado_em: string
          id: string
          motivo: string | null
          operador_id: string | null
          parceiro_id: string
          referencia_id: string | null
          referencia_tipo: string | null
          tipo_marco: string
          valor_anterior: string | null
          valor_novo: string | null
        }
        Insert: {
          criado_em?: string
          id?: string
          motivo?: string | null
          operador_id?: string | null
          parceiro_id: string
          referencia_id?: string | null
          referencia_tipo?: string | null
          tipo_marco: string
          valor_anterior?: string | null
          valor_novo?: string | null
        }
        Update: {
          criado_em?: string
          id?: string
          motivo?: string | null
          operador_id?: string | null
          parceiro_id?: string
          referencia_id?: string | null
          referencia_tipo?: string | null
          tipo_marco?: string
          valor_anterior?: string | null
          valor_novo?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "parceiro_marcos_parceiro_id_fkey"
            columns: ["parceiro_id"]
            isOneToOne: false
            referencedRelation: "parceiros_comerciais"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "parceiro_marcos_parceiro_id_fkey"
            columns: ["parceiro_id"]
            isOneToOne: false
            referencedRelation: "v_credito_resumo_financeiro"
            referencedColumns: ["parceiro_id"]
          },
          {
            foreignKeyName: "parceiro_marcos_parceiro_id_fkey"
            columns: ["parceiro_id"]
            isOneToOne: false
            referencedRelation: "vw_logistica_agregado"
            referencedColumns: ["transportadora_id"]
          },
          {
            foreignKeyName: "parceiro_marcos_parceiro_id_fkey"
            columns: ["parceiro_id"]
            isOneToOne: false
            referencedRelation: "vw_recebivel_por_conta"
            referencedColumns: ["conta_id"]
          },
        ]
      }
      parceiros_comerciais: {
        Row: {
          ativo: boolean | null
          bairro: string | null
          bandeira_vermelha: boolean
          bandeira_vermelha_em: string | null
          bandeira_vermelha_motivo: string | null
          bandeira_vermelha_por: string | null
          bling_id: string | null
          cadastro_incompleto: boolean
          canal_fop: string | null
          canal_venda_id: string | null
          categoria_ka: string | null
          centro_custo_id: string | null
          cep: string | null
          cidade: string | null
          cnpj: string | null
          contatos: Json | null
          contexto_bureau: Json | null
          cpf: string | null
          created_at: string | null
          dados_bancarios: Json | null
          data_nascimento: string | null
          email: string | null
          email_cobranca: string | null
          endereco_complemento: string | null
          endereco_entrega: Json | null
          forma_pagamento_padrao_id: string | null
          grupo_economico_id: string | null
          grupo_id: string | null
          id: string
          inscricao_estadual: string | null
          isento_ie: boolean
          logradouro: string | null
          nivel_programa: string
          nome_fantasia: string | null
          numero: string | null
          observacao: string | null
          origem: string | null
          perfil_credito: string
          pix_chave: string | null
          pix_tipo: string | null
          plano_contas_id: string | null
          premissas: Json | null
          razao_social: string
          regiao_atuacao: string | null
          rg: string | null
          segmento: string | null
          situacao_cadastral: string | null
          tags: string[] | null
          telefone: string | null
          tipo: string | null
          tipo_pessoa: string
          tipos: string[] | null
          uf: string | null
          updated_at: string | null
        }
        Insert: {
          ativo?: boolean | null
          bairro?: string | null
          bandeira_vermelha?: boolean
          bandeira_vermelha_em?: string | null
          bandeira_vermelha_motivo?: string | null
          bandeira_vermelha_por?: string | null
          bling_id?: string | null
          cadastro_incompleto?: boolean
          canal_fop?: string | null
          canal_venda_id?: string | null
          categoria_ka?: string | null
          centro_custo_id?: string | null
          cep?: string | null
          cidade?: string | null
          cnpj?: string | null
          contatos?: Json | null
          contexto_bureau?: Json | null
          cpf?: string | null
          created_at?: string | null
          dados_bancarios?: Json | null
          data_nascimento?: string | null
          email?: string | null
          email_cobranca?: string | null
          endereco_complemento?: string | null
          endereco_entrega?: Json | null
          forma_pagamento_padrao_id?: string | null
          grupo_economico_id?: string | null
          grupo_id?: string | null
          id?: string
          inscricao_estadual?: string | null
          isento_ie?: boolean
          logradouro?: string | null
          nivel_programa?: string
          nome_fantasia?: string | null
          numero?: string | null
          observacao?: string | null
          origem?: string | null
          perfil_credito?: string
          pix_chave?: string | null
          pix_tipo?: string | null
          plano_contas_id?: string | null
          premissas?: Json | null
          razao_social: string
          regiao_atuacao?: string | null
          rg?: string | null
          segmento?: string | null
          situacao_cadastral?: string | null
          tags?: string[] | null
          telefone?: string | null
          tipo?: string | null
          tipo_pessoa?: string
          tipos?: string[] | null
          uf?: string | null
          updated_at?: string | null
        }
        Update: {
          ativo?: boolean | null
          bairro?: string | null
          bandeira_vermelha?: boolean
          bandeira_vermelha_em?: string | null
          bandeira_vermelha_motivo?: string | null
          bandeira_vermelha_por?: string | null
          bling_id?: string | null
          cadastro_incompleto?: boolean
          canal_fop?: string | null
          canal_venda_id?: string | null
          categoria_ka?: string | null
          centro_custo_id?: string | null
          cep?: string | null
          cidade?: string | null
          cnpj?: string | null
          contatos?: Json | null
          contexto_bureau?: Json | null
          cpf?: string | null
          created_at?: string | null
          dados_bancarios?: Json | null
          data_nascimento?: string | null
          email?: string | null
          email_cobranca?: string | null
          endereco_complemento?: string | null
          endereco_entrega?: Json | null
          forma_pagamento_padrao_id?: string | null
          grupo_economico_id?: string | null
          grupo_id?: string | null
          id?: string
          inscricao_estadual?: string | null
          isento_ie?: boolean
          logradouro?: string | null
          nivel_programa?: string
          nome_fantasia?: string | null
          numero?: string | null
          observacao?: string | null
          origem?: string | null
          perfil_credito?: string
          pix_chave?: string | null
          pix_tipo?: string | null
          plano_contas_id?: string | null
          premissas?: Json | null
          razao_social?: string
          regiao_atuacao?: string | null
          rg?: string | null
          segmento?: string | null
          situacao_cadastral?: string | null
          tags?: string[] | null
          telefone?: string | null
          tipo?: string | null
          tipo_pessoa?: string
          tipos?: string[] | null
          uf?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "fornecedores_categoria_padrao_id_fkey"
            columns: ["plano_contas_id"]
            isOneToOne: false
            referencedRelation: "plano_contas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "parceiros_comerciais_canal_venda_id_fkey"
            columns: ["canal_venda_id"]
            isOneToOne: false
            referencedRelation: "canais_venda"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "parceiros_comerciais_centro_custo_id_fkey"
            columns: ["centro_custo_id"]
            isOneToOne: false
            referencedRelation: "centros_custo"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "parceiros_comerciais_centro_custo_id_fkey"
            columns: ["centro_custo_id"]
            isOneToOne: false
            referencedRelation: "vw_custo_pessoas"
            referencedColumns: ["centro_custo_id"]
          },
          {
            foreignKeyName: "parceiros_comerciais_centro_custo_id_fkey"
            columns: ["centro_custo_id"]
            isOneToOne: false
            referencedRelation: "vw_dimensionamento_areas"
            referencedColumns: ["centro_custo_id"]
          },
          {
            foreignKeyName: "parceiros_comerciais_forma_pagamento_padrao_id_fkey"
            columns: ["forma_pagamento_padrao_id"]
            isOneToOne: false
            referencedRelation: "formas_pagamento"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "parceiros_comerciais_grupo_economico_id_fkey"
            columns: ["grupo_economico_id"]
            isOneToOne: false
            referencedRelation: "grupos_economicos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "parceiros_comerciais_grupo_economico_id_fkey"
            columns: ["grupo_economico_id"]
            isOneToOne: false
            referencedRelation: "v_credito_resumo_financeiro_grupo"
            referencedColumns: ["grupo_economico_id"]
          },
          {
            foreignKeyName: "parceiros_comerciais_grupo_id_fkey"
            columns: ["grupo_id"]
            isOneToOne: false
            referencedRelation: "grupos_empresariais"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "parceiros_comerciais_grupo_id_fkey"
            columns: ["grupo_id"]
            isOneToOne: false
            referencedRelation: "vw_exposicao_por_grupo"
            referencedColumns: ["grupo_id"]
          },
          {
            foreignKeyName: "parceiros_comerciais_plano_contas_id_fkey"
            columns: ["plano_contas_id"]
            isOneToOne: false
            referencedRelation: "plano_contas"
            referencedColumns: ["id"]
          },
        ]
      }
      pasta_contrato_parcelas: {
        Row: {
          conta_pagar_id: string | null
          contrato_id: string
          created_at: string
          data_vencimento: string
          id: string
          numero_parcela: number | null
          origem: string
          status: string
          total_parcelas: number | null
          valor: number
          valor_real: number | null
        }
        Insert: {
          conta_pagar_id?: string | null
          contrato_id: string
          created_at?: string
          data_vencimento: string
          id?: string
          numero_parcela?: number | null
          origem?: string
          status?: string
          total_parcelas?: number | null
          valor: number
          valor_real?: number | null
        }
        Update: {
          conta_pagar_id?: string | null
          contrato_id?: string
          created_at?: string
          data_vencimento?: string
          id?: string
          numero_parcela?: number | null
          origem?: string
          status?: string
          total_parcelas?: number | null
          valor?: number
          valor_real?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "pasta_contrato_parcelas_conta_pagar_id_fkey"
            columns: ["conta_pagar_id"]
            isOneToOne: false
            referencedRelation: "contas_pagar"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pasta_contrato_parcelas_conta_pagar_id_fkey"
            columns: ["conta_pagar_id"]
            isOneToOne: false
            referencedRelation: "contas_pagar_receber"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pasta_contrato_parcelas_conta_pagar_id_fkey"
            columns: ["conta_pagar_id"]
            isOneToOne: false
            referencedRelation: "contas_pagar_receber_ativas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pasta_contrato_parcelas_conta_pagar_id_fkey"
            columns: ["conta_pagar_id"]
            isOneToOne: false
            referencedRelation: "v_cpr_bola_redonda"
            referencedColumns: ["cpr_id"]
          },
          {
            foreignKeyName: "pasta_contrato_parcelas_conta_pagar_id_fkey"
            columns: ["conta_pagar_id"]
            isOneToOne: false
            referencedRelation: "vw_conciliacao_furos"
            referencedColumns: ["sugestao_cpr_id"]
          },
          {
            foreignKeyName: "pasta_contrato_parcelas_conta_pagar_id_fkey"
            columns: ["conta_pagar_id"]
            isOneToOne: false
            referencedRelation: "vw_contas_pagar_consolidado"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pasta_contrato_parcelas_conta_pagar_id_fkey"
            columns: ["conta_pagar_id"]
            isOneToOne: false
            referencedRelation: "vw_despesas_match_sugestoes"
            referencedColumns: ["cpr_id"]
          },
          {
            foreignKeyName: "pasta_contrato_parcelas_conta_pagar_id_fkey"
            columns: ["conta_pagar_id"]
            isOneToOne: false
            referencedRelation: "vw_documentos_envio_estados"
            referencedColumns: ["conta_id"]
          },
          {
            foreignKeyName: "pasta_contrato_parcelas_conta_pagar_id_fkey"
            columns: ["conta_pagar_id"]
            isOneToOne: false
            referencedRelation: "vw_pj_pagamentos"
            referencedColumns: ["cpr_id"]
          },
          {
            foreignKeyName: "pasta_contrato_parcelas_contrato_id_fkey"
            columns: ["contrato_id"]
            isOneToOne: false
            referencedRelation: "pasta_contratos"
            referencedColumns: ["id"]
          },
        ]
      }
      pasta_contratos: {
        Row: {
          alerta_renovacao_dias: number
          ciclo_pagamento: string
          clausulas_extraidas: Json | null
          created_at: string
          criado_por: string | null
          data_assinatura: string | null
          data_primeira_parcela: string
          data_primeira_parcela_setup: string | null
          descricao: string | null
          dia_vencimento: number | null
          id: string
          linha_investimento_id: string | null
          meio_pagamento_id: string | null
          numero: string
          numero_parcelas: number | null
          parcelas_setup: number | null
          pasta_id: string
          permite_valor_variavel: boolean
          reajuste_data: string | null
          reajuste_indice: string | null
          renova_automaticamente: boolean
          resumo_ia: string | null
          status: string
          tem_setup: boolean
          tipo_contrato_id: string | null
          updated_at: string
          valor_parcela: number
          valor_setup: number | null
          valor_total: number
          vigencia_fim: string | null
          vigencia_inicio: string
        }
        Insert: {
          alerta_renovacao_dias?: number
          ciclo_pagamento: string
          clausulas_extraidas?: Json | null
          created_at?: string
          criado_por?: string | null
          data_assinatura?: string | null
          data_primeira_parcela: string
          data_primeira_parcela_setup?: string | null
          descricao?: string | null
          dia_vencimento?: number | null
          id?: string
          linha_investimento_id?: string | null
          meio_pagamento_id?: string | null
          numero: string
          numero_parcelas?: number | null
          parcelas_setup?: number | null
          pasta_id: string
          permite_valor_variavel?: boolean
          reajuste_data?: string | null
          reajuste_indice?: string | null
          renova_automaticamente?: boolean
          resumo_ia?: string | null
          status?: string
          tem_setup?: boolean
          tipo_contrato_id?: string | null
          updated_at?: string
          valor_parcela: number
          valor_setup?: number | null
          valor_total: number
          vigencia_fim?: string | null
          vigencia_inicio: string
        }
        Update: {
          alerta_renovacao_dias?: number
          ciclo_pagamento?: string
          clausulas_extraidas?: Json | null
          created_at?: string
          criado_por?: string | null
          data_assinatura?: string | null
          data_primeira_parcela?: string
          data_primeira_parcela_setup?: string | null
          descricao?: string | null
          dia_vencimento?: number | null
          id?: string
          linha_investimento_id?: string | null
          meio_pagamento_id?: string | null
          numero?: string
          numero_parcelas?: number | null
          parcelas_setup?: number | null
          pasta_id?: string
          permite_valor_variavel?: boolean
          reajuste_data?: string | null
          reajuste_indice?: string | null
          renova_automaticamente?: boolean
          resumo_ia?: string | null
          status?: string
          tem_setup?: boolean
          tipo_contrato_id?: string | null
          updated_at?: string
          valor_parcela?: number
          valor_setup?: number | null
          valor_total?: number
          vigencia_fim?: string | null
          vigencia_inicio?: string
        }
        Relationships: [
          {
            foreignKeyName: "pasta_contratos_linha_investimento_id_fkey"
            columns: ["linha_investimento_id"]
            isOneToOne: false
            referencedRelation: "linhas_investimento"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pasta_contratos_linha_investimento_id_fkey"
            columns: ["linha_investimento_id"]
            isOneToOne: false
            referencedRelation: "vw_linhas_investimento_kpis"
            referencedColumns: ["linha_id"]
          },
          {
            foreignKeyName: "pasta_contratos_meio_pagamento_id_fkey"
            columns: ["meio_pagamento_id"]
            isOneToOne: false
            referencedRelation: "formas_pagamento"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pasta_contratos_pasta_id_fkey"
            columns: ["pasta_id"]
            isOneToOne: false
            referencedRelation: "ged_pastas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pasta_contratos_pasta_id_fkey"
            columns: ["pasta_id"]
            isOneToOne: false
            referencedRelation: "vw_ged_pastas_kpis"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pasta_contratos_pasta_id_fkey"
            columns: ["pasta_id"]
            isOneToOne: false
            referencedRelation: "vw_pastas_kpis"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pasta_contratos_tipo_contrato_id_fkey"
            columns: ["tipo_contrato_id"]
            isOneToOne: false
            referencedRelation: "tipos_contrato"
            referencedColumns: ["id"]
          },
        ]
      }
      pasta_historico: {
        Row: {
          contrato_id: string | null
          created_at: string
          criado_por: string | null
          data_evento: string
          descricao: string
          id: string
          metadata: Json | null
          pasta_id: string
          tipo_evento: string
          valor_anterior: number | null
          valor_novo: number | null
        }
        Insert: {
          contrato_id?: string | null
          created_at?: string
          criado_por?: string | null
          data_evento?: string
          descricao: string
          id?: string
          metadata?: Json | null
          pasta_id: string
          tipo_evento: string
          valor_anterior?: number | null
          valor_novo?: number | null
        }
        Update: {
          contrato_id?: string | null
          created_at?: string
          criado_por?: string | null
          data_evento?: string
          descricao?: string
          id?: string
          metadata?: Json | null
          pasta_id?: string
          tipo_evento?: string
          valor_anterior?: number | null
          valor_novo?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "pasta_historico_contrato_id_fkey"
            columns: ["contrato_id"]
            isOneToOne: false
            referencedRelation: "pasta_contratos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pasta_historico_pasta_id_fkey"
            columns: ["pasta_id"]
            isOneToOne: false
            referencedRelation: "ged_pastas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pasta_historico_pasta_id_fkey"
            columns: ["pasta_id"]
            isOneToOne: false
            referencedRelation: "vw_ged_pastas_kpis"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pasta_historico_pasta_id_fkey"
            columns: ["pasta_id"]
            isOneToOne: false
            referencedRelation: "vw_pastas_kpis"
            referencedColumns: ["id"]
          },
        ]
      }
      pedido_email_log: {
        Row: {
          cc: string[] | null
          destinatario: string
          enviado_em: string
          enviado_por: string | null
          estagio_pedido: string | null
          id: string
          metadata: Json | null
          pedido_id: string
          tipo_email: string
          titulo_id: string | null
        }
        Insert: {
          cc?: string[] | null
          destinatario: string
          enviado_em?: string
          enviado_por?: string | null
          estagio_pedido?: string | null
          id?: string
          metadata?: Json | null
          pedido_id: string
          tipo_email: string
          titulo_id?: string | null
        }
        Update: {
          cc?: string[] | null
          destinatario?: string
          enviado_em?: string
          enviado_por?: string | null
          estagio_pedido?: string | null
          id?: string
          metadata?: Json | null
          pedido_id?: string
          tipo_email?: string
          titulo_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "pedido_email_log_pedido_id_fkey"
            columns: ["pedido_id"]
            isOneToOne: false
            referencedRelation: "pedidos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pedido_email_log_pedido_id_fkey"
            columns: ["pedido_id"]
            isOneToOne: false
            referencedRelation: "v_pedidos_fila"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pedido_email_log_pedido_id_fkey"
            columns: ["pedido_id"]
            isOneToOne: false
            referencedRelation: "v_pedidos_priorizados"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pedido_email_log_pedido_id_fkey"
            columns: ["pedido_id"]
            isOneToOne: false
            referencedRelation: "vw_gestao_pedidos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pedido_email_log_pedido_id_fkey"
            columns: ["pedido_id"]
            isOneToOne: false
            referencedRelation: "vw_pedido_base"
            referencedColumns: ["pedido_id"]
          },
          {
            foreignKeyName: "pedido_email_log_pedido_id_fkey"
            columns: ["pedido_id"]
            isOneToOne: false
            referencedRelation: "vw_pedidos_farol"
            referencedColumns: ["pedido_id"]
          },
          {
            foreignKeyName: "pedido_email_log_titulo_id_fkey"
            columns: ["titulo_id"]
            isOneToOne: false
            referencedRelation: "titulo_a_receber"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pedido_email_log_titulo_id_fkey"
            columns: ["titulo_id"]
            isOneToOne: false
            referencedRelation: "vw_previsao_recebimentos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pedido_email_log_titulo_id_fkey"
            columns: ["titulo_id"]
            isOneToOne: false
            referencedRelation: "vw_recebivel_b2b"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pedido_email_log_titulo_id_fkey"
            columns: ["titulo_id"]
            isOneToOne: false
            referencedRelation: "vw_titulos_cobranca"
            referencedColumns: ["id"]
          },
        ]
      }
      pedido_eventos: {
        Row: {
          area_anterior: string | null
          area_nova: string | null
          automatico: boolean
          criado_em: string
          descricao: string | null
          estagio_anterior: string | null
          estagio_novo: string | null
          id: string
          lida_fop: boolean
          metadata: Json | null
          operador_id: string | null
          pedido_id: string
          tipo_evento: string
        }
        Insert: {
          area_anterior?: string | null
          area_nova?: string | null
          automatico?: boolean
          criado_em?: string
          descricao?: string | null
          estagio_anterior?: string | null
          estagio_novo?: string | null
          id?: string
          lida_fop?: boolean
          metadata?: Json | null
          operador_id?: string | null
          pedido_id: string
          tipo_evento: string
        }
        Update: {
          area_anterior?: string | null
          area_nova?: string | null
          automatico?: boolean
          criado_em?: string
          descricao?: string | null
          estagio_anterior?: string | null
          estagio_novo?: string | null
          id?: string
          lida_fop?: boolean
          metadata?: Json | null
          operador_id?: string | null
          pedido_id?: string
          tipo_evento?: string
        }
        Relationships: [
          {
            foreignKeyName: "pedido_eventos_pedido_id_fkey"
            columns: ["pedido_id"]
            isOneToOne: false
            referencedRelation: "pedidos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pedido_eventos_pedido_id_fkey"
            columns: ["pedido_id"]
            isOneToOne: false
            referencedRelation: "v_pedidos_fila"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pedido_eventos_pedido_id_fkey"
            columns: ["pedido_id"]
            isOneToOne: false
            referencedRelation: "v_pedidos_priorizados"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pedido_eventos_pedido_id_fkey"
            columns: ["pedido_id"]
            isOneToOne: false
            referencedRelation: "vw_gestao_pedidos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pedido_eventos_pedido_id_fkey"
            columns: ["pedido_id"]
            isOneToOne: false
            referencedRelation: "vw_pedido_base"
            referencedColumns: ["pedido_id"]
          },
          {
            foreignKeyName: "pedido_eventos_pedido_id_fkey"
            columns: ["pedido_id"]
            isOneToOne: false
            referencedRelation: "vw_pedidos_farol"
            referencedColumns: ["pedido_id"]
          },
        ]
      }
      pedido_itens: {
        Row: {
          criado_em: string
          desconto_pct: number
          descricao: string
          id: string
          ordem: number
          pedido_id: string
          quantidade: number
          sku: string | null
          subtotal: number | null
          valor_unitario: number
          valor_unitario_tabela: number | null
        }
        Insert: {
          criado_em?: string
          desconto_pct?: number
          descricao: string
          id?: string
          ordem?: number
          pedido_id: string
          quantidade: number
          sku?: string | null
          subtotal?: number | null
          valor_unitario: number
          valor_unitario_tabela?: number | null
        }
        Update: {
          criado_em?: string
          desconto_pct?: number
          descricao?: string
          id?: string
          ordem?: number
          pedido_id?: string
          quantidade?: number
          sku?: string | null
          subtotal?: number | null
          valor_unitario?: number
          valor_unitario_tabela?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "pedido_itens_pedido_id_fkey"
            columns: ["pedido_id"]
            isOneToOne: false
            referencedRelation: "pedidos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pedido_itens_pedido_id_fkey"
            columns: ["pedido_id"]
            isOneToOne: false
            referencedRelation: "v_pedidos_fila"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pedido_itens_pedido_id_fkey"
            columns: ["pedido_id"]
            isOneToOne: false
            referencedRelation: "v_pedidos_priorizados"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pedido_itens_pedido_id_fkey"
            columns: ["pedido_id"]
            isOneToOne: false
            referencedRelation: "vw_gestao_pedidos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pedido_itens_pedido_id_fkey"
            columns: ["pedido_id"]
            isOneToOne: false
            referencedRelation: "vw_pedido_base"
            referencedColumns: ["pedido_id"]
          },
          {
            foreignKeyName: "pedido_itens_pedido_id_fkey"
            columns: ["pedido_id"]
            isOneToOne: false
            referencedRelation: "vw_pedidos_farol"
            referencedColumns: ["pedido_id"]
          },
        ]
      }
      pedido_portao: {
        Row: {
          created_at: string
          created_by: string | null
          data_vencimento: string
          id: string
          link_pagamento: string | null
          observacao: string | null
          pago_em: string | null
          pedido_id: string
          plano_restante: Json
          sequencia: number
          status: string
          tipo_pagamento: string | null
          updated_at: string
          valor: number
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          data_vencimento: string
          id?: string
          link_pagamento?: string | null
          observacao?: string | null
          pago_em?: string | null
          pedido_id: string
          plano_restante?: Json
          sequencia?: number
          status?: string
          tipo_pagamento?: string | null
          updated_at?: string
          valor: number
        }
        Update: {
          created_at?: string
          created_by?: string | null
          data_vencimento?: string
          id?: string
          link_pagamento?: string | null
          observacao?: string | null
          pago_em?: string | null
          pedido_id?: string
          plano_restante?: Json
          sequencia?: number
          status?: string
          tipo_pagamento?: string | null
          updated_at?: string
          valor?: number
        }
        Relationships: [
          {
            foreignKeyName: "pedido_portao_pedido_id_fkey"
            columns: ["pedido_id"]
            isOneToOne: false
            referencedRelation: "pedidos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pedido_portao_pedido_id_fkey"
            columns: ["pedido_id"]
            isOneToOne: false
            referencedRelation: "v_pedidos_fila"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pedido_portao_pedido_id_fkey"
            columns: ["pedido_id"]
            isOneToOne: false
            referencedRelation: "v_pedidos_priorizados"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pedido_portao_pedido_id_fkey"
            columns: ["pedido_id"]
            isOneToOne: false
            referencedRelation: "vw_gestao_pedidos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pedido_portao_pedido_id_fkey"
            columns: ["pedido_id"]
            isOneToOne: false
            referencedRelation: "vw_pedido_base"
            referencedColumns: ["pedido_id"]
          },
          {
            foreignKeyName: "pedido_portao_pedido_id_fkey"
            columns: ["pedido_id"]
            isOneToOne: false
            referencedRelation: "vw_pedidos_farol"
            referencedColumns: ["pedido_id"]
          },
        ]
      }
      pedido_rastreamento: {
        Row: {
          atualizado_em: string
          codigo_rastreio: string
          criado_em: string
          data_ultima_atualizacao: string | null
          entregue: boolean
          eventos: Json
          id: string
          pedido_id: string | null
          servico: string | null
          status_atual: string | null
        }
        Insert: {
          atualizado_em?: string
          codigo_rastreio: string
          criado_em?: string
          data_ultima_atualizacao?: string | null
          entregue?: boolean
          eventos?: Json
          id?: string
          pedido_id?: string | null
          servico?: string | null
          status_atual?: string | null
        }
        Update: {
          atualizado_em?: string
          codigo_rastreio?: string
          criado_em?: string
          data_ultima_atualizacao?: string | null
          entregue?: boolean
          eventos?: Json
          id?: string
          pedido_id?: string | null
          servico?: string | null
          status_atual?: string | null
        }
        Relationships: []
      }
      pedido_remessa: {
        Row: {
          bling_pedido_id: string | null
          criado_em: string
          criado_por: string | null
          data_entrega_prevista: string | null
          delta_financeiro: number | null
          id: string
          itens_json: Json
          nf_data: string | null
          nf_numero: string | null
          observacao: string | null
          pedido_id: string
          sequencia: number
          status: string
          valor_frete: number | null
          valor_remessa: number | null
        }
        Insert: {
          bling_pedido_id?: string | null
          criado_em?: string
          criado_por?: string | null
          data_entrega_prevista?: string | null
          delta_financeiro?: number | null
          id?: string
          itens_json?: Json
          nf_data?: string | null
          nf_numero?: string | null
          observacao?: string | null
          pedido_id: string
          sequencia?: number
          status?: string
          valor_frete?: number | null
          valor_remessa?: number | null
        }
        Update: {
          bling_pedido_id?: string | null
          criado_em?: string
          criado_por?: string | null
          data_entrega_prevista?: string | null
          delta_financeiro?: number | null
          id?: string
          itens_json?: Json
          nf_data?: string | null
          nf_numero?: string | null
          observacao?: string | null
          pedido_id?: string
          sequencia?: number
          status?: string
          valor_frete?: number | null
          valor_remessa?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "pedido_remessa_pedido_id_fkey"
            columns: ["pedido_id"]
            isOneToOne: false
            referencedRelation: "pedidos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pedido_remessa_pedido_id_fkey"
            columns: ["pedido_id"]
            isOneToOne: false
            referencedRelation: "v_pedidos_fila"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pedido_remessa_pedido_id_fkey"
            columns: ["pedido_id"]
            isOneToOne: false
            referencedRelation: "v_pedidos_priorizados"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pedido_remessa_pedido_id_fkey"
            columns: ["pedido_id"]
            isOneToOne: false
            referencedRelation: "vw_gestao_pedidos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pedido_remessa_pedido_id_fkey"
            columns: ["pedido_id"]
            isOneToOne: false
            referencedRelation: "vw_pedido_base"
            referencedColumns: ["pedido_id"]
          },
          {
            foreignKeyName: "pedido_remessa_pedido_id_fkey"
            columns: ["pedido_id"]
            isOneToOne: false
            referencedRelation: "vw_pedidos_farol"
            referencedColumns: ["pedido_id"]
          },
        ]
      }
      pedido_tarefas: {
        Row: {
          concluida: boolean
          concluida_em: string | null
          concluida_por: string | null
          created_at: string
          criada_por: string | null
          id: string
          ordem: number
          pedido_id: string
          titulo: string
          updated_at: string
        }
        Insert: {
          concluida?: boolean
          concluida_em?: string | null
          concluida_por?: string | null
          created_at?: string
          criada_por?: string | null
          id?: string
          ordem?: number
          pedido_id: string
          titulo: string
          updated_at?: string
        }
        Update: {
          concluida?: boolean
          concluida_em?: string | null
          concluida_por?: string | null
          created_at?: string
          criada_por?: string | null
          id?: string
          ordem?: number
          pedido_id?: string
          titulo?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "pedido_tarefas_pedido_id_fkey"
            columns: ["pedido_id"]
            isOneToOne: false
            referencedRelation: "pedidos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pedido_tarefas_pedido_id_fkey"
            columns: ["pedido_id"]
            isOneToOne: false
            referencedRelation: "v_pedidos_fila"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pedido_tarefas_pedido_id_fkey"
            columns: ["pedido_id"]
            isOneToOne: false
            referencedRelation: "v_pedidos_priorizados"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pedido_tarefas_pedido_id_fkey"
            columns: ["pedido_id"]
            isOneToOne: false
            referencedRelation: "vw_gestao_pedidos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pedido_tarefas_pedido_id_fkey"
            columns: ["pedido_id"]
            isOneToOne: false
            referencedRelation: "vw_pedido_base"
            referencedColumns: ["pedido_id"]
          },
          {
            foreignKeyName: "pedido_tarefas_pedido_id_fkey"
            columns: ["pedido_id"]
            isOneToOne: false
            referencedRelation: "vw_pedidos_farol"
            referencedColumns: ["pedido_id"]
          },
        ]
      }
      pedido_transicoes: {
        Row: {
          acao: string
          ator: string | null
          criado_em: string
          delta_jsonb: Json | null
          estagio_destino: string
          estagio_origem: string | null
          id: string
          motivo: string | null
          pedido_id: string
        }
        Insert: {
          acao: string
          ator?: string | null
          criado_em?: string
          delta_jsonb?: Json | null
          estagio_destino: string
          estagio_origem?: string | null
          id?: string
          motivo?: string | null
          pedido_id: string
        }
        Update: {
          acao?: string
          ator?: string | null
          criado_em?: string
          delta_jsonb?: Json | null
          estagio_destino?: string
          estagio_origem?: string | null
          id?: string
          motivo?: string | null
          pedido_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "pedido_transicoes_pedido_id_fkey"
            columns: ["pedido_id"]
            isOneToOne: false
            referencedRelation: "pedidos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pedido_transicoes_pedido_id_fkey"
            columns: ["pedido_id"]
            isOneToOne: false
            referencedRelation: "v_pedidos_fila"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pedido_transicoes_pedido_id_fkey"
            columns: ["pedido_id"]
            isOneToOne: false
            referencedRelation: "v_pedidos_priorizados"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pedido_transicoes_pedido_id_fkey"
            columns: ["pedido_id"]
            isOneToOne: false
            referencedRelation: "vw_gestao_pedidos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pedido_transicoes_pedido_id_fkey"
            columns: ["pedido_id"]
            isOneToOne: false
            referencedRelation: "vw_pedido_base"
            referencedColumns: ["pedido_id"]
          },
          {
            foreignKeyName: "pedido_transicoes_pedido_id_fkey"
            columns: ["pedido_id"]
            isOneToOne: false
            referencedRelation: "vw_pedidos_farol"
            referencedColumns: ["pedido_id"]
          },
        ]
      }
      pedidos: {
        Row: {
          alerta_logistica: string | null
          analise_pedido_detalhes: Json | null
          analise_pedido_executada_em: string | null
          analise_pedido_motivo: string | null
          analise_pedido_status: string | null
          area_atual: string
          atencao_em: string | null
          atencao_motivo: string | null
          atencao_nivel: string | null
          atencao_por: string | null
          bling_enviado_em: string | null
          bling_enviado_por: string | null
          bling_envio_erro: string | null
          bling_id_destino: string | null
          bonus_pix_valor: number
          cancelado_em: string | null
          cancelado_motivo: string | null
          cancelado_por: string | null
          cliente_nome_snapshot: string | null
          condicao_solicitada: string
          contexto_anotacoes: string | null
          cubagem_total: number | null
          data_entrega_prevista: string | null
          data_pedido: string
          desconto_celebra_valor: number
          desconto_pct: number | null
          endereco_entrega: Json | null
          entregue_em: string | null
          entregue_metodo: string | null
          estagio: string
          estagio_atualizado_em: string | null
          estagio_atualizado_por: string | null
          estimativa_frete_em: string | null
          estimativa_frete_json: Json | null
          estimativa_frete_valor: number | null
          exige_portao: boolean
          exportado_bling_em: string | null
          faturado_em: string | null
          forma_pagamento_id: string | null
          forma_solicitada: string
          frete_tipo: string | null
          id: string
          id_externo: string
          itens_json: Json | null
          link_pagamento: string | null
          marcacao: string | null
          natureza_operacao_id: string
          nf_data: string | null
          nf_email_enviado_em: string | null
          nf_numero: string | null
          observacao: string | null
          observacao_cliente: string | null
          observacao_pedido: string | null
          origem: string | null
          parceiro_id: string
          pedido_origem_id: string | null
          peso_bruto_total: number | null
          pre_faturado_em: string | null
          pre_separacao_em: string | null
          premissas: Json | null
          prioridade_motivo: string | null
          prioridade_score: number
          proxima_acao: string | null
          recebido_em: string
          recebido_via: string
          regra_pagamento_id: string | null
          snapshot_original: Json | null
          split_de_pedido_id: string | null
          tipo_pagamento: string | null
          transportadora_id: string | null
          triado_em: string | null
          urgencia_declarada: string
          urgencia_observacao: string | null
          valor_bruto: number
          valor_frete: number
          valor_liquido: number
          vendedor: string | null
        }
        Insert: {
          alerta_logistica?: string | null
          analise_pedido_detalhes?: Json | null
          analise_pedido_executada_em?: string | null
          analise_pedido_motivo?: string | null
          analise_pedido_status?: string | null
          area_atual?: string
          atencao_em?: string | null
          atencao_motivo?: string | null
          atencao_nivel?: string | null
          atencao_por?: string | null
          bling_enviado_em?: string | null
          bling_enviado_por?: string | null
          bling_envio_erro?: string | null
          bling_id_destino?: string | null
          bonus_pix_valor?: number
          cancelado_em?: string | null
          cancelado_motivo?: string | null
          cancelado_por?: string | null
          cliente_nome_snapshot?: string | null
          condicao_solicitada: string
          contexto_anotacoes?: string | null
          cubagem_total?: number | null
          data_entrega_prevista?: string | null
          data_pedido: string
          desconto_celebra_valor?: number
          desconto_pct?: number | null
          endereco_entrega?: Json | null
          entregue_em?: string | null
          entregue_metodo?: string | null
          estagio?: string
          estagio_atualizado_em?: string | null
          estagio_atualizado_por?: string | null
          estimativa_frete_em?: string | null
          estimativa_frete_json?: Json | null
          estimativa_frete_valor?: number | null
          exige_portao?: boolean
          exportado_bling_em?: string | null
          faturado_em?: string | null
          forma_pagamento_id?: string | null
          forma_solicitada: string
          frete_tipo?: string | null
          id?: string
          id_externo: string
          itens_json?: Json | null
          link_pagamento?: string | null
          marcacao?: string | null
          natureza_operacao_id?: string
          nf_data?: string | null
          nf_email_enviado_em?: string | null
          nf_numero?: string | null
          observacao?: string | null
          observacao_cliente?: string | null
          observacao_pedido?: string | null
          origem?: string | null
          parceiro_id: string
          pedido_origem_id?: string | null
          peso_bruto_total?: number | null
          pre_faturado_em?: string | null
          pre_separacao_em?: string | null
          premissas?: Json | null
          prioridade_motivo?: string | null
          prioridade_score?: number
          proxima_acao?: string | null
          recebido_em?: string
          recebido_via?: string
          regra_pagamento_id?: string | null
          snapshot_original?: Json | null
          split_de_pedido_id?: string | null
          tipo_pagamento?: string | null
          transportadora_id?: string | null
          triado_em?: string | null
          urgencia_declarada?: string
          urgencia_observacao?: string | null
          valor_bruto: number
          valor_frete?: number
          valor_liquido: number
          vendedor?: string | null
        }
        Update: {
          alerta_logistica?: string | null
          analise_pedido_detalhes?: Json | null
          analise_pedido_executada_em?: string | null
          analise_pedido_motivo?: string | null
          analise_pedido_status?: string | null
          area_atual?: string
          atencao_em?: string | null
          atencao_motivo?: string | null
          atencao_nivel?: string | null
          atencao_por?: string | null
          bling_enviado_em?: string | null
          bling_enviado_por?: string | null
          bling_envio_erro?: string | null
          bling_id_destino?: string | null
          bonus_pix_valor?: number
          cancelado_em?: string | null
          cancelado_motivo?: string | null
          cancelado_por?: string | null
          cliente_nome_snapshot?: string | null
          condicao_solicitada?: string
          contexto_anotacoes?: string | null
          cubagem_total?: number | null
          data_entrega_prevista?: string | null
          data_pedido?: string
          desconto_celebra_valor?: number
          desconto_pct?: number | null
          endereco_entrega?: Json | null
          entregue_em?: string | null
          entregue_metodo?: string | null
          estagio?: string
          estagio_atualizado_em?: string | null
          estagio_atualizado_por?: string | null
          estimativa_frete_em?: string | null
          estimativa_frete_json?: Json | null
          estimativa_frete_valor?: number | null
          exige_portao?: boolean
          exportado_bling_em?: string | null
          faturado_em?: string | null
          forma_pagamento_id?: string | null
          forma_solicitada?: string
          frete_tipo?: string | null
          id?: string
          id_externo?: string
          itens_json?: Json | null
          link_pagamento?: string | null
          marcacao?: string | null
          natureza_operacao_id?: string
          nf_data?: string | null
          nf_email_enviado_em?: string | null
          nf_numero?: string | null
          observacao?: string | null
          observacao_cliente?: string | null
          observacao_pedido?: string | null
          origem?: string | null
          parceiro_id?: string
          pedido_origem_id?: string | null
          peso_bruto_total?: number | null
          pre_faturado_em?: string | null
          pre_separacao_em?: string | null
          premissas?: Json | null
          prioridade_motivo?: string | null
          prioridade_score?: number
          proxima_acao?: string | null
          recebido_em?: string
          recebido_via?: string
          regra_pagamento_id?: string | null
          snapshot_original?: Json | null
          split_de_pedido_id?: string | null
          tipo_pagamento?: string | null
          transportadora_id?: string | null
          triado_em?: string | null
          urgencia_declarada?: string
          urgencia_observacao?: string | null
          valor_bruto?: number
          valor_frete?: number
          valor_liquido?: number
          vendedor?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "pedidos_forma_pagamento_id_fkey"
            columns: ["forma_pagamento_id"]
            isOneToOne: false
            referencedRelation: "formas_pagamento"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pedidos_natureza_operacao_id_fkey"
            columns: ["natureza_operacao_id"]
            isOneToOne: false
            referencedRelation: "naturezas_operacao"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pedidos_parceiro_id_fkey"
            columns: ["parceiro_id"]
            isOneToOne: false
            referencedRelation: "parceiros_comerciais"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pedidos_parceiro_id_fkey"
            columns: ["parceiro_id"]
            isOneToOne: false
            referencedRelation: "v_credito_resumo_financeiro"
            referencedColumns: ["parceiro_id"]
          },
          {
            foreignKeyName: "pedidos_parceiro_id_fkey"
            columns: ["parceiro_id"]
            isOneToOne: false
            referencedRelation: "vw_logistica_agregado"
            referencedColumns: ["transportadora_id"]
          },
          {
            foreignKeyName: "pedidos_parceiro_id_fkey"
            columns: ["parceiro_id"]
            isOneToOne: false
            referencedRelation: "vw_recebivel_por_conta"
            referencedColumns: ["conta_id"]
          },
          {
            foreignKeyName: "pedidos_pedido_origem_id_fkey"
            columns: ["pedido_origem_id"]
            isOneToOne: false
            referencedRelation: "pedidos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pedidos_pedido_origem_id_fkey"
            columns: ["pedido_origem_id"]
            isOneToOne: false
            referencedRelation: "v_pedidos_fila"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pedidos_pedido_origem_id_fkey"
            columns: ["pedido_origem_id"]
            isOneToOne: false
            referencedRelation: "v_pedidos_priorizados"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pedidos_pedido_origem_id_fkey"
            columns: ["pedido_origem_id"]
            isOneToOne: false
            referencedRelation: "vw_gestao_pedidos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pedidos_pedido_origem_id_fkey"
            columns: ["pedido_origem_id"]
            isOneToOne: false
            referencedRelation: "vw_pedido_base"
            referencedColumns: ["pedido_id"]
          },
          {
            foreignKeyName: "pedidos_pedido_origem_id_fkey"
            columns: ["pedido_origem_id"]
            isOneToOne: false
            referencedRelation: "vw_pedidos_farol"
            referencedColumns: ["pedido_id"]
          },
          {
            foreignKeyName: "pedidos_regra_pagamento_id_fkey"
            columns: ["regra_pagamento_id"]
            isOneToOne: false
            referencedRelation: "regras_pagamento_pedido"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pedidos_split_de_pedido_id_fkey"
            columns: ["split_de_pedido_id"]
            isOneToOne: false
            referencedRelation: "pedidos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pedidos_split_de_pedido_id_fkey"
            columns: ["split_de_pedido_id"]
            isOneToOne: false
            referencedRelation: "v_pedidos_fila"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pedidos_split_de_pedido_id_fkey"
            columns: ["split_de_pedido_id"]
            isOneToOne: false
            referencedRelation: "v_pedidos_priorizados"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pedidos_split_de_pedido_id_fkey"
            columns: ["split_de_pedido_id"]
            isOneToOne: false
            referencedRelation: "vw_gestao_pedidos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pedidos_split_de_pedido_id_fkey"
            columns: ["split_de_pedido_id"]
            isOneToOne: false
            referencedRelation: "vw_pedido_base"
            referencedColumns: ["pedido_id"]
          },
          {
            foreignKeyName: "pedidos_split_de_pedido_id_fkey"
            columns: ["split_de_pedido_id"]
            isOneToOne: false
            referencedRelation: "vw_pedidos_farol"
            referencedColumns: ["pedido_id"]
          },
          {
            foreignKeyName: "pedidos_transportadora_id_fkey"
            columns: ["transportadora_id"]
            isOneToOne: false
            referencedRelation: "parceiros_comerciais"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pedidos_transportadora_id_fkey"
            columns: ["transportadora_id"]
            isOneToOne: false
            referencedRelation: "v_credito_resumo_financeiro"
            referencedColumns: ["parceiro_id"]
          },
          {
            foreignKeyName: "pedidos_transportadora_id_fkey"
            columns: ["transportadora_id"]
            isOneToOne: false
            referencedRelation: "vw_logistica_agregado"
            referencedColumns: ["transportadora_id"]
          },
          {
            foreignKeyName: "pedidos_transportadora_id_fkey"
            columns: ["transportadora_id"]
            isOneToOne: false
            referencedRelation: "vw_recebivel_por_conta"
            referencedColumns: ["conta_id"]
          },
        ]
      }
      pedidos_compra: {
        Row: {
          cancelado_em: string | null
          cancelado_por: string | null
          cancelamento_motivo: string | null
          centro_custo_id: string | null
          comprador_id: string | null
          created_at: string
          departamento_id: string | null
          descricao_geral: string | null
          enviado_em: string | null
          finalizado_em: string | null
          id: string
          iniciado_em: string | null
          justificativa: string | null
          linha_investimento_id: string | null
          parceiro_preferencial_id: string | null
          solicitante_id: string
          status: Database["public"]["Enums"]["pedido_compra_status_enum"]
          sub_estado:
            | Database["public"]["Enums"]["pedido_compra_sub_estado_enum"]
            | null
          tipo: string
          unidade_id: string | null
          updated_at: string
        }
        Insert: {
          cancelado_em?: string | null
          cancelado_por?: string | null
          cancelamento_motivo?: string | null
          centro_custo_id?: string | null
          comprador_id?: string | null
          created_at?: string
          departamento_id?: string | null
          descricao_geral?: string | null
          enviado_em?: string | null
          finalizado_em?: string | null
          id?: string
          iniciado_em?: string | null
          justificativa?: string | null
          linha_investimento_id?: string | null
          parceiro_preferencial_id?: string | null
          solicitante_id: string
          status?: Database["public"]["Enums"]["pedido_compra_status_enum"]
          sub_estado?:
            | Database["public"]["Enums"]["pedido_compra_sub_estado_enum"]
            | null
          tipo?: string
          unidade_id?: string | null
          updated_at?: string
        }
        Update: {
          cancelado_em?: string | null
          cancelado_por?: string | null
          cancelamento_motivo?: string | null
          centro_custo_id?: string | null
          comprador_id?: string | null
          created_at?: string
          departamento_id?: string | null
          descricao_geral?: string | null
          enviado_em?: string | null
          finalizado_em?: string | null
          id?: string
          iniciado_em?: string | null
          justificativa?: string | null
          linha_investimento_id?: string | null
          parceiro_preferencial_id?: string | null
          solicitante_id?: string
          status?: Database["public"]["Enums"]["pedido_compra_status_enum"]
          sub_estado?:
            | Database["public"]["Enums"]["pedido_compra_sub_estado_enum"]
            | null
          tipo?: string
          unidade_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "pedidos_compra_centro_custo_id_fkey"
            columns: ["centro_custo_id"]
            isOneToOne: false
            referencedRelation: "centros_custo"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pedidos_compra_centro_custo_id_fkey"
            columns: ["centro_custo_id"]
            isOneToOne: false
            referencedRelation: "vw_custo_pessoas"
            referencedColumns: ["centro_custo_id"]
          },
          {
            foreignKeyName: "pedidos_compra_centro_custo_id_fkey"
            columns: ["centro_custo_id"]
            isOneToOne: false
            referencedRelation: "vw_dimensionamento_areas"
            referencedColumns: ["centro_custo_id"]
          },
          {
            foreignKeyName: "pedidos_compra_departamento_id_fkey"
            columns: ["departamento_id"]
            isOneToOne: false
            referencedRelation: "parametros"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pedidos_compra_linha_investimento_id_fkey"
            columns: ["linha_investimento_id"]
            isOneToOne: false
            referencedRelation: "linhas_investimento"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pedidos_compra_linha_investimento_id_fkey"
            columns: ["linha_investimento_id"]
            isOneToOne: false
            referencedRelation: "vw_linhas_investimento_kpis"
            referencedColumns: ["linha_id"]
          },
          {
            foreignKeyName: "pedidos_compra_parceiro_preferencial_id_fkey"
            columns: ["parceiro_preferencial_id"]
            isOneToOne: false
            referencedRelation: "parceiros_comerciais"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pedidos_compra_parceiro_preferencial_id_fkey"
            columns: ["parceiro_preferencial_id"]
            isOneToOne: false
            referencedRelation: "v_credito_resumo_financeiro"
            referencedColumns: ["parceiro_id"]
          },
          {
            foreignKeyName: "pedidos_compra_parceiro_preferencial_id_fkey"
            columns: ["parceiro_preferencial_id"]
            isOneToOne: false
            referencedRelation: "vw_logistica_agregado"
            referencedColumns: ["transportadora_id"]
          },
          {
            foreignKeyName: "pedidos_compra_parceiro_preferencial_id_fkey"
            columns: ["parceiro_preferencial_id"]
            isOneToOne: false
            referencedRelation: "vw_recebivel_por_conta"
            referencedColumns: ["conta_id"]
          },
          {
            foreignKeyName: "pedidos_compra_unidade_id_fkey"
            columns: ["unidade_id"]
            isOneToOne: false
            referencedRelation: "unidades"
            referencedColumns: ["id"]
          },
        ]
      }
      pedidos_compra_anexos: {
        Row: {
          id: string
          mime_type: string
          nome_original: string
          pedido_id: string
          storage_path: string
          tamanho_bytes: number
          tipo: Database["public"]["Enums"]["pedido_compra_anexo_tipo_enum"]
          uploaded_at: string
          uploaded_by: string
        }
        Insert: {
          id?: string
          mime_type: string
          nome_original: string
          pedido_id: string
          storage_path: string
          tamanho_bytes: number
          tipo: Database["public"]["Enums"]["pedido_compra_anexo_tipo_enum"]
          uploaded_at?: string
          uploaded_by: string
        }
        Update: {
          id?: string
          mime_type?: string
          nome_original?: string
          pedido_id?: string
          storage_path?: string
          tamanho_bytes?: number
          tipo?: Database["public"]["Enums"]["pedido_compra_anexo_tipo_enum"]
          uploaded_at?: string
          uploaded_by?: string
        }
        Relationships: [
          {
            foreignKeyName: "pedidos_compra_anexos_pedido_id_fkey"
            columns: ["pedido_id"]
            isOneToOne: false
            referencedRelation: "pedidos_compra"
            referencedColumns: ["id"]
          },
        ]
      }
      pedidos_compra_eventos: {
        Row: {
          created_at: string
          id: string
          payload: Json
          pedido_id: string
          tipo: string
          usuario_id: string | null
        }
        Insert: {
          created_at?: string
          id?: string
          payload?: Json
          pedido_id: string
          tipo: string
          usuario_id?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          payload?: Json
          pedido_id?: string
          tipo?: string
          usuario_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "pedidos_compra_eventos_pedido_id_fkey"
            columns: ["pedido_id"]
            isOneToOne: false
            referencedRelation: "pedidos_compra"
            referencedColumns: ["id"]
          },
        ]
      }
      pedidos_compra_itens: {
        Row: {
          cancelamento_motivo: string | null
          created_at: string
          descricao: string
          especificacao_tecnica: string | null
          id: string
          ordem: number
          pedido_id: string
          quantidade: number
          status: Database["public"]["Enums"]["pedido_compra_item_status_enum"]
          urls: string[] | null
          valor_estimado_unitario: number
        }
        Insert: {
          cancelamento_motivo?: string | null
          created_at?: string
          descricao: string
          especificacao_tecnica?: string | null
          id?: string
          ordem?: number
          pedido_id: string
          quantidade: number
          status?: Database["public"]["Enums"]["pedido_compra_item_status_enum"]
          urls?: string[] | null
          valor_estimado_unitario: number
        }
        Update: {
          cancelamento_motivo?: string | null
          created_at?: string
          descricao?: string
          especificacao_tecnica?: string | null
          id?: string
          ordem?: number
          pedido_id?: string
          quantidade?: number
          status?: Database["public"]["Enums"]["pedido_compra_item_status_enum"]
          urls?: string[] | null
          valor_estimado_unitario?: number
        }
        Relationships: [
          {
            foreignKeyName: "pedidos_compra_itens_pedido_id_fkey"
            columns: ["pedido_id"]
            isOneToOne: false
            referencedRelation: "pedidos_compra"
            referencedColumns: ["id"]
          },
        ]
      }
      pedidos_venda: {
        Row: {
          bling_id: string | null
          canal: string | null
          cliente_cnpj_cpf: string | null
          cliente_nome: string | null
          created_at: string | null
          data_pedido: string | null
          data_prevista_entrega: string | null
          data_saida: string | null
          id: string
          nf_chave_acesso: string | null
          nf_numero: string | null
          nf_serie: string | null
          numero: string | null
          numero_loja: string | null
          observacoes: string | null
          origem: string | null
          parceiro_id: string | null
          situacao: string | null
          situacao_nome: string | null
          situacao_raw: Json | null
          transporte_raw: Json | null
          updated_at: string | null
          valor_desconto: number | null
          valor_frete: number | null
          valor_produtos: number | null
          valor_total: number | null
        }
        Insert: {
          bling_id?: string | null
          canal?: string | null
          cliente_cnpj_cpf?: string | null
          cliente_nome?: string | null
          created_at?: string | null
          data_pedido?: string | null
          data_prevista_entrega?: string | null
          data_saida?: string | null
          id?: string
          nf_chave_acesso?: string | null
          nf_numero?: string | null
          nf_serie?: string | null
          numero?: string | null
          numero_loja?: string | null
          observacoes?: string | null
          origem?: string | null
          parceiro_id?: string | null
          situacao?: string | null
          situacao_nome?: string | null
          situacao_raw?: Json | null
          transporte_raw?: Json | null
          updated_at?: string | null
          valor_desconto?: number | null
          valor_frete?: number | null
          valor_produtos?: number | null
          valor_total?: number | null
        }
        Update: {
          bling_id?: string | null
          canal?: string | null
          cliente_cnpj_cpf?: string | null
          cliente_nome?: string | null
          created_at?: string | null
          data_pedido?: string | null
          data_prevista_entrega?: string | null
          data_saida?: string | null
          id?: string
          nf_chave_acesso?: string | null
          nf_numero?: string | null
          nf_serie?: string | null
          numero?: string | null
          numero_loja?: string | null
          observacoes?: string | null
          origem?: string | null
          parceiro_id?: string | null
          situacao?: string | null
          situacao_nome?: string | null
          situacao_raw?: Json | null
          transporte_raw?: Json | null
          updated_at?: string | null
          valor_desconto?: number | null
          valor_frete?: number | null
          valor_produtos?: number | null
          valor_total?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "pedidos_venda_parceiro_id_fkey"
            columns: ["parceiro_id"]
            isOneToOne: false
            referencedRelation: "parceiros_comerciais"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pedidos_venda_parceiro_id_fkey"
            columns: ["parceiro_id"]
            isOneToOne: false
            referencedRelation: "v_credito_resumo_financeiro"
            referencedColumns: ["parceiro_id"]
          },
          {
            foreignKeyName: "pedidos_venda_parceiro_id_fkey"
            columns: ["parceiro_id"]
            isOneToOne: false
            referencedRelation: "vw_logistica_agregado"
            referencedColumns: ["transportadora_id"]
          },
          {
            foreignKeyName: "pedidos_venda_parceiro_id_fkey"
            columns: ["parceiro_id"]
            isOneToOne: false
            referencedRelation: "vw_recebivel_por_conta"
            referencedColumns: ["conta_id"]
          },
        ]
      }
      pedidos_venda_itens: {
        Row: {
          codigo_produto: string | null
          created_at: string | null
          descricao: string
          id: string
          pedido_id: string
          produto_id: string | null
          quantidade: number | null
          valor_desconto: number | null
          valor_total: number | null
          valor_unitario: number | null
        }
        Insert: {
          codigo_produto?: string | null
          created_at?: string | null
          descricao: string
          id?: string
          pedido_id: string
          produto_id?: string | null
          quantidade?: number | null
          valor_desconto?: number | null
          valor_total?: number | null
          valor_unitario?: number | null
        }
        Update: {
          codigo_produto?: string | null
          created_at?: string | null
          descricao?: string
          id?: string
          pedido_id?: string
          produto_id?: string | null
          quantidade?: number | null
          valor_desconto?: number | null
          valor_total?: number | null
          valor_unitario?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "pedidos_venda_itens_pedido_id_fkey"
            columns: ["pedido_id"]
            isOneToOne: false
            referencedRelation: "pedidos_venda"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pedidos_venda_itens_pedido_id_fkey"
            columns: ["pedido_id"]
            isOneToOne: false
            referencedRelation: "vw_pedidos_venda"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pedidos_venda_itens_produto_id_fkey"
            columns: ["produto_id"]
            isOneToOne: false
            referencedRelation: "produtos"
            referencedColumns: ["id"]
          },
        ]
      }
      perfil_packs: {
        Row: {
          criado_em: string
          pack_id: string
          perfil_id: string
        }
        Insert: {
          criado_em?: string
          pack_id: string
          perfil_id: string
        }
        Update: {
          criado_em?: string
          pack_id?: string
          perfil_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "perfil_packs_pack_id_fkey"
            columns: ["pack_id"]
            isOneToOne: false
            referencedRelation: "permission_packs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "perfil_packs_perfil_id_fkey"
            columns: ["perfil_id"]
            isOneToOne: false
            referencedRelation: "perfis"
            referencedColumns: ["id"]
          },
        ]
      }
      perfis: {
        Row: {
          area: string | null
          ativo: boolean
          codigo: string
          criado_em: string
          descricao: string | null
          id: string
          is_sistema: boolean
          nivel_sugerido: string | null
          nome: string
          tipo: string
        }
        Insert: {
          area?: string | null
          ativo?: boolean
          codigo: string
          criado_em?: string
          descricao?: string | null
          id?: string
          is_sistema?: boolean
          nivel_sugerido?: string | null
          nome: string
          tipo: string
        }
        Update: {
          area?: string | null
          ativo?: boolean
          codigo?: string
          criado_em?: string
          descricao?: string | null
          id?: string
          is_sistema?: boolean
          nivel_sugerido?: string | null
          nome?: string
          tipo?: string
        }
        Relationships: []
      }
      permission_pack_items: {
        Row: {
          acao: string
          criado_em: string
          id: string
          modulo: string
          nivel_minimo: string | null
          pack_id: string
        }
        Insert: {
          acao: string
          criado_em?: string
          id?: string
          modulo: string
          nivel_minimo?: string | null
          pack_id: string
        }
        Update: {
          acao?: string
          criado_em?: string
          id?: string
          modulo?: string
          nivel_minimo?: string | null
          pack_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "permission_pack_items_pack_id_fkey"
            columns: ["pack_id"]
            isOneToOne: false
            referencedRelation: "permission_packs"
            referencedColumns: ["id"]
          },
        ]
      }
      permission_packs: {
        Row: {
          ativo: boolean
          codigo: string
          criado_em: string
          descricao: string | null
          id: string
          is_sistema: boolean
          nome: string
        }
        Insert: {
          ativo?: boolean
          codigo: string
          criado_em?: string
          descricao?: string | null
          id?: string
          is_sistema?: boolean
          nome: string
        }
        Update: {
          ativo?: boolean
          codigo?: string
          criado_em?: string
          descricao?: string | null
          id?: string
          is_sistema?: boolean
          nome?: string
        }
        Relationships: []
      }
      permissoes_catalogo: {
        Row: {
          ativo: boolean | null
          categoria_sod: string | null
          contem_dado_sensivel: boolean | null
          created_at: string | null
          descricao: string | null
          feature_em_teste: boolean | null
          id: string
          nome_exibicao: string
          ordem: number | null
          pilar: string
          slug: string
          tipo: string
          updated_at: string | null
        }
        Insert: {
          ativo?: boolean | null
          categoria_sod?: string | null
          contem_dado_sensivel?: boolean | null
          created_at?: string | null
          descricao?: string | null
          feature_em_teste?: boolean | null
          id?: string
          nome_exibicao: string
          ordem?: number | null
          pilar: string
          slug: string
          tipo: string
          updated_at?: string | null
        }
        Update: {
          ativo?: boolean | null
          categoria_sod?: string | null
          contem_dado_sensivel?: boolean | null
          created_at?: string | null
          descricao?: string | null
          feature_em_teste?: boolean | null
          id?: string
          nome_exibicao?: string
          ordem?: number | null
          pilar?: string
          slug?: string
          tipo?: string
          updated_at?: string | null
        }
        Relationships: []
      }
      pessoas: {
        Row: {
          bairro: string | null
          cep: string | null
          cidade: string | null
          complemento: string | null
          contato_emergencia_nome: string | null
          contato_emergencia_telefone: string | null
          cpf: string | null
          created_at: string
          created_by: string | null
          data_nascimento: string | null
          email_pessoal: string | null
          estado_civil: string | null
          etnia: string | null
          foto_url: string | null
          genero: string | null
          id: string
          logradouro: string | null
          nacionalidade: string | null
          nome_completo: string
          nome_mae: string | null
          nome_pai: string | null
          numero: string | null
          orgao_emissor: string | null
          origem_contrato_pj_id: string | null
          rg: string | null
          telefone: string | null
          uf: string | null
          updated_at: string
          usuario_id: string | null
        }
        Insert: {
          bairro?: string | null
          cep?: string | null
          cidade?: string | null
          complemento?: string | null
          contato_emergencia_nome?: string | null
          contato_emergencia_telefone?: string | null
          cpf?: string | null
          created_at?: string
          created_by?: string | null
          data_nascimento?: string | null
          email_pessoal?: string | null
          estado_civil?: string | null
          etnia?: string | null
          foto_url?: string | null
          genero?: string | null
          id?: string
          logradouro?: string | null
          nacionalidade?: string | null
          nome_completo: string
          nome_mae?: string | null
          nome_pai?: string | null
          numero?: string | null
          orgao_emissor?: string | null
          origem_contrato_pj_id?: string | null
          rg?: string | null
          telefone?: string | null
          uf?: string | null
          updated_at?: string
          usuario_id?: string | null
        }
        Update: {
          bairro?: string | null
          cep?: string | null
          cidade?: string | null
          complemento?: string | null
          contato_emergencia_nome?: string | null
          contato_emergencia_telefone?: string | null
          cpf?: string | null
          created_at?: string
          created_by?: string | null
          data_nascimento?: string | null
          email_pessoal?: string | null
          estado_civil?: string | null
          etnia?: string | null
          foto_url?: string | null
          genero?: string | null
          id?: string
          logradouro?: string | null
          nacionalidade?: string | null
          nome_completo?: string
          nome_mae?: string | null
          nome_pai?: string | null
          numero?: string | null
          orgao_emissor?: string | null
          origem_contrato_pj_id?: string | null
          rg?: string | null
          telefone?: string | null
          uf?: string | null
          updated_at?: string
          usuario_id?: string | null
        }
        Relationships: []
      }
      planilha_fatura_vinculo: {
        Row: {
          created_at: string
          fatura_id: string
          id: string
          planilha_id: string
          valor_vinculado: number
        }
        Insert: {
          created_at?: string
          fatura_id: string
          id?: string
          planilha_id: string
          valor_vinculado: number
        }
        Update: {
          created_at?: string
          fatura_id?: string
          id?: string
          planilha_id?: string
          valor_vinculado?: number
        }
        Relationships: [
          {
            foreignKeyName: "planilha_fatura_vinculo_fatura_id_fkey"
            columns: ["fatura_id"]
            isOneToOne: false
            referencedRelation: "faturas_cartao"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "planilha_fatura_vinculo_fatura_id_fkey"
            columns: ["fatura_id"]
            isOneToOne: false
            referencedRelation: "vw_faturas_cartao_resumo"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "planilha_fatura_vinculo_planilha_id_fkey"
            columns: ["planilha_id"]
            isOneToOne: false
            referencedRelation: "itau_pagamentos_stage"
            referencedColumns: ["id"]
          },
        ]
      }
      plano_contas: {
        Row: {
          ativo: boolean | null
          bling_id: string | null
          centro_custo_id: string | null
          codigo: string
          created_at: string | null
          id: string
          natureza: string | null
          nivel: number
          nome: string
          origem: string | null
          parent_id: string | null
          tipo: string
          updated_at: string | null
        }
        Insert: {
          ativo?: boolean | null
          bling_id?: string | null
          centro_custo_id?: string | null
          codigo: string
          created_at?: string | null
          id?: string
          natureza?: string | null
          nivel?: number
          nome: string
          origem?: string | null
          parent_id?: string | null
          tipo: string
          updated_at?: string | null
        }
        Update: {
          ativo?: boolean | null
          bling_id?: string | null
          centro_custo_id?: string | null
          codigo?: string
          created_at?: string | null
          id?: string
          natureza?: string | null
          nivel?: number
          nome?: string
          origem?: string | null
          parent_id?: string | null
          tipo?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "plano_contas_centro_custo_id_fkey"
            columns: ["centro_custo_id"]
            isOneToOne: false
            referencedRelation: "centros_custo"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "plano_contas_centro_custo_id_fkey"
            columns: ["centro_custo_id"]
            isOneToOne: false
            referencedRelation: "vw_custo_pessoas"
            referencedColumns: ["centro_custo_id"]
          },
          {
            foreignKeyName: "plano_contas_centro_custo_id_fkey"
            columns: ["centro_custo_id"]
            isOneToOne: false
            referencedRelation: "vw_dimensionamento_areas"
            referencedColumns: ["centro_custo_id"]
          },
          {
            foreignKeyName: "plano_contas_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "plano_contas"
            referencedColumns: ["id"]
          },
        ]
      }
      politica_reserva_estoque: {
        Row: {
          atualizado_em: string
          descricao: string | null
          estagio: string
          reserva: boolean
        }
        Insert: {
          atualizado_em?: string
          descricao?: string | null
          estagio: string
          reserva?: boolean
        }
        Update: {
          atualizado_em?: string
          descricao?: string | null
          estagio?: string
          reserva?: boolean
        }
        Relationships: []
      }
      politica_visibilidade_salario: {
        Row: {
          atualizado_em: string
          contexto: Database["public"]["Enums"]["contexto_acesso_salario"]
          id: string
          modo: string
          observacao: string | null
          perfil_codigo: string
        }
        Insert: {
          atualizado_em?: string
          contexto: Database["public"]["Enums"]["contexto_acesso_salario"]
          id?: string
          modo: string
          observacao?: string | null
          perfil_codigo: string
        }
        Update: {
          atualizado_em?: string
          contexto?: Database["public"]["Enums"]["contexto_acesso_salario"]
          id?: string
          modo?: string
          observacao?: string | null
          perfil_codigo?: string
        }
        Relationships: [
          {
            foreignKeyName: "politica_visibilidade_salario_perfil_codigo_fkey"
            columns: ["perfil_codigo"]
            isOneToOne: false
            referencedRelation: "perfis"
            referencedColumns: ["codigo"]
          },
        ]
      }
      posicoes: {
        Row: {
          area: string | null
          centro_custo: string | null
          colaborador_id: string | null
          contrato_pj_id: string | null
          created_at: string
          departamento: string
          filial: string | null
          id: string
          id_pai: string | null
          nivel_hierarquico: number
          salario_previsto: number | null
          status: string
          titulo_cargo: string
          updated_at: string
        }
        Insert: {
          area?: string | null
          centro_custo?: string | null
          colaborador_id?: string | null
          contrato_pj_id?: string | null
          created_at?: string
          departamento: string
          filial?: string | null
          id?: string
          id_pai?: string | null
          nivel_hierarquico?: number
          salario_previsto?: number | null
          status?: string
          titulo_cargo: string
          updated_at?: string
        }
        Update: {
          area?: string | null
          centro_custo?: string | null
          colaborador_id?: string | null
          contrato_pj_id?: string | null
          created_at?: string
          departamento?: string
          filial?: string | null
          id?: string
          id_pai?: string | null
          nivel_hierarquico?: number
          salario_previsto?: number | null
          status?: string
          titulo_cargo?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "posicoes_colaborador_id_fkey"
            columns: ["colaborador_id"]
            isOneToOne: false
            referencedRelation: "colaboradores_clt"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "posicoes_contrato_pj_id_fkey"
            columns: ["contrato_pj_id"]
            isOneToOne: false
            referencedRelation: "contratos_pj"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "posicoes_id_pai_fkey"
            columns: ["id_pai"]
            isOneToOne: false
            referencedRelation: "posicoes"
            referencedColumns: ["id"]
          },
        ]
      }
      posicoes_planejadas: {
        Row: {
          ativo: boolean
          cargo_id: string | null
          centro_custo_id: string | null
          created_at: string
          created_by: string | null
          data_abertura: string
          data_prevista_ocupacao: string | null
          departamento_id: string | null
          descricao: string | null
          id: string
          observacoes: string | null
          senioridade: string | null
          status: string
          tipo_vinculo: string | null
          titulo: string
          unidade_id: string | null
          updated_at: string
          vinculo_id: string | null
        }
        Insert: {
          ativo?: boolean
          cargo_id?: string | null
          centro_custo_id?: string | null
          created_at?: string
          created_by?: string | null
          data_abertura?: string
          data_prevista_ocupacao?: string | null
          departamento_id?: string | null
          descricao?: string | null
          id?: string
          observacoes?: string | null
          senioridade?: string | null
          status?: string
          tipo_vinculo?: string | null
          titulo: string
          unidade_id?: string | null
          updated_at?: string
          vinculo_id?: string | null
        }
        Update: {
          ativo?: boolean
          cargo_id?: string | null
          centro_custo_id?: string | null
          created_at?: string
          created_by?: string | null
          data_abertura?: string
          data_prevista_ocupacao?: string | null
          departamento_id?: string | null
          descricao?: string | null
          id?: string
          observacoes?: string | null
          senioridade?: string | null
          status?: string
          tipo_vinculo?: string | null
          titulo?: string
          unidade_id?: string | null
          updated_at?: string
          vinculo_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "posicoes_planejadas_cargo_id_fkey"
            columns: ["cargo_id"]
            isOneToOne: false
            referencedRelation: "cargos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "posicoes_planejadas_centro_custo_id_fkey"
            columns: ["centro_custo_id"]
            isOneToOne: false
            referencedRelation: "centros_custo"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "posicoes_planejadas_centro_custo_id_fkey"
            columns: ["centro_custo_id"]
            isOneToOne: false
            referencedRelation: "vw_custo_pessoas"
            referencedColumns: ["centro_custo_id"]
          },
          {
            foreignKeyName: "posicoes_planejadas_centro_custo_id_fkey"
            columns: ["centro_custo_id"]
            isOneToOne: false
            referencedRelation: "vw_dimensionamento_areas"
            referencedColumns: ["centro_custo_id"]
          },
          {
            foreignKeyName: "posicoes_planejadas_departamento_id_fkey"
            columns: ["departamento_id"]
            isOneToOne: false
            referencedRelation: "departamentos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "posicoes_planejadas_unidade_id_fkey"
            columns: ["unidade_id"]
            isOneToOne: false
            referencedRelation: "unidades"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "posicoes_planejadas_vinculo_id_fkey"
            columns: ["vinculo_id"]
            isOneToOne: false
            referencedRelation: "vinculos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "posicoes_planejadas_vinculo_id_fkey"
            columns: ["vinculo_id"]
            isOneToOne: false
            referencedRelation: "vw_custo_pessoas"
            referencedColumns: ["vinculo_id"]
          },
          {
            foreignKeyName: "posicoes_planejadas_vinculo_id_fkey"
            columns: ["vinculo_id"]
            isOneToOne: false
            referencedRelation: "vw_nf_vinculo_pessoa"
            referencedColumns: ["vinculo_id"]
          },
          {
            foreignKeyName: "posicoes_planejadas_vinculo_id_fkey"
            columns: ["vinculo_id"]
            isOneToOne: false
            referencedRelation: "vw_organograma"
            referencedColumns: ["vinculo_id"]
          },
          {
            foreignKeyName: "posicoes_planejadas_vinculo_id_fkey"
            columns: ["vinculo_id"]
            isOneToOne: false
            referencedRelation: "vw_pj_notas_fiscais"
            referencedColumns: ["vinculo_id"]
          },
          {
            foreignKeyName: "posicoes_planejadas_vinculo_id_fkey"
            columns: ["vinculo_id"]
            isOneToOne: false
            referencedRelation: "vw_pj_pagamentos"
            referencedColumns: ["vinculo_id"]
          },
          {
            foreignKeyName: "posicoes_planejadas_vinculo_id_fkey"
            columns: ["vinculo_id"]
            isOneToOne: false
            referencedRelation: "vw_vinculo_custo_total"
            referencedColumns: ["vinculo_id"]
          },
        ]
      }
      prazo_liquidacao: {
        Row: {
          ativo: boolean
          banco_id: string
          created_at: string
          forma_pagamento_id: string | null
          id: string
          meio_pagamento: string
          offset_entre_parcelas_dias: number | null
          offset_primeira_dias: number | null
          updated_at: string
          usa_vencimento: boolean
        }
        Insert: {
          ativo?: boolean
          banco_id: string
          created_at?: string
          forma_pagamento_id?: string | null
          id?: string
          meio_pagamento: string
          offset_entre_parcelas_dias?: number | null
          offset_primeira_dias?: number | null
          updated_at?: string
          usa_vencimento?: boolean
        }
        Update: {
          ativo?: boolean
          banco_id?: string
          created_at?: string
          forma_pagamento_id?: string | null
          id?: string
          meio_pagamento?: string
          offset_entre_parcelas_dias?: number | null
          offset_primeira_dias?: number | null
          updated_at?: string
          usa_vencimento?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "prazo_liquidacao_banco_id_fkey"
            columns: ["banco_id"]
            isOneToOne: false
            referencedRelation: "banco_recebimento"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "prazo_liquidacao_forma_pagamento_id_fkey"
            columns: ["forma_pagamento_id"]
            isOneToOne: false
            referencedRelation: "formas_pagamento"
            referencedColumns: ["id"]
          },
        ]
      }
      processos: {
        Row: {
          area_negocio_id: string | null
          codigo: string
          created_at: string
          criado_por: string | null
          descricao: string | null
          diagrama_mermaid: string | null
          id: string
          importacao_pdf_id: string | null
          importado_de_pdf: boolean | null
          narrativa: string | null
          natureza_valor: string
          nome: string
          owner_perfil_codigo: string | null
          owner_user_id: string | null
          sensivel: boolean
          status_valor: string
          tags: string[] | null
          template_sncf_id: string | null
          updated_at: string
          versao_atual: number
          versao_vigente_em: string | null
        }
        Insert: {
          area_negocio_id?: string | null
          codigo: string
          created_at?: string
          criado_por?: string | null
          descricao?: string | null
          diagrama_mermaid?: string | null
          id?: string
          importacao_pdf_id?: string | null
          importado_de_pdf?: boolean | null
          narrativa?: string | null
          natureza_valor?: string
          nome: string
          owner_perfil_codigo?: string | null
          owner_user_id?: string | null
          sensivel?: boolean
          status_valor?: string
          tags?: string[] | null
          template_sncf_id?: string | null
          updated_at?: string
          versao_atual?: number
          versao_vigente_em?: string | null
        }
        Update: {
          area_negocio_id?: string | null
          codigo?: string
          created_at?: string
          criado_por?: string | null
          descricao?: string | null
          diagrama_mermaid?: string | null
          id?: string
          importacao_pdf_id?: string | null
          importado_de_pdf?: boolean | null
          narrativa?: string | null
          natureza_valor?: string
          nome?: string
          owner_perfil_codigo?: string | null
          owner_user_id?: string | null
          sensivel?: boolean
          status_valor?: string
          tags?: string[] | null
          template_sncf_id?: string | null
          updated_at?: string
          versao_atual?: number
          versao_vigente_em?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "processos_area_negocio_id_fkey"
            columns: ["area_negocio_id"]
            isOneToOne: false
            referencedRelation: "parametros"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "processos_importacao_pdf_id_fkey"
            columns: ["importacao_pdf_id"]
            isOneToOne: false
            referencedRelation: "processos_importacoes_pdf"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "processos_owner_perfil_codigo_fkey"
            columns: ["owner_perfil_codigo"]
            isOneToOne: false
            referencedRelation: "perfis"
            referencedColumns: ["codigo"]
          },
          {
            foreignKeyName: "processos_template_sncf_id_fkey"
            columns: ["template_sncf_id"]
            isOneToOne: false
            referencedRelation: "sncf_templates_processos"
            referencedColumns: ["id"]
          },
        ]
      }
      processos_importacoes_pdf: {
        Row: {
          arquivo_nome: string
          arquivo_paginas: number | null
          arquivo_tamanho_kb: number | null
          created_at: string
          erro_mensagem: string | null
          id: string
          importado_por: string | null
          importado_por_nome: string | null
          processos_criados: string[] | null
          resultado_ia: Json | null
          status: string
          updated_at: string
        }
        Insert: {
          arquivo_nome: string
          arquivo_paginas?: number | null
          arquivo_tamanho_kb?: number | null
          created_at?: string
          erro_mensagem?: string | null
          id?: string
          importado_por?: string | null
          importado_por_nome?: string | null
          processos_criados?: string[] | null
          resultado_ia?: Json | null
          status: string
          updated_at?: string
        }
        Update: {
          arquivo_nome?: string
          arquivo_paginas?: number | null
          arquivo_tamanho_kb?: number | null
          created_at?: string
          erro_mensagem?: string | null
          id?: string
          importado_por?: string | null
          importado_por_nome?: string | null
          processos_criados?: string[] | null
          resultado_ia?: Json | null
          status?: string
          updated_at?: string
        }
        Relationships: []
      }
      processos_ligacoes: {
        Row: {
          criado_em: string
          criado_por: string | null
          descricao: string | null
          id: string
          ordem: number
          processo_destino_id: string
          processo_origem_id: string
          tipo_ligacao: string
        }
        Insert: {
          criado_em?: string
          criado_por?: string | null
          descricao?: string | null
          id?: string
          ordem?: number
          processo_destino_id: string
          processo_origem_id: string
          tipo_ligacao: string
        }
        Update: {
          criado_em?: string
          criado_por?: string | null
          descricao?: string | null
          id?: string
          ordem?: number
          processo_destino_id?: string
          processo_origem_id?: string
          tipo_ligacao?: string
        }
        Relationships: [
          {
            foreignKeyName: "processos_ligacoes_processo_destino_id_fkey"
            columns: ["processo_destino_id"]
            isOneToOne: false
            referencedRelation: "processos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "processos_ligacoes_processo_destino_id_fkey"
            columns: ["processo_destino_id"]
            isOneToOne: false
            referencedRelation: "processos_unificados"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "processos_ligacoes_processo_origem_id_fkey"
            columns: ["processo_origem_id"]
            isOneToOne: false
            referencedRelation: "processos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "processos_ligacoes_processo_origem_id_fkey"
            columns: ["processo_origem_id"]
            isOneToOne: false
            referencedRelation: "processos_unificados"
            referencedColumns: ["id"]
          },
        ]
      }
      processos_log_consultas: {
        Row: {
          consultado_em: string
          id: string
          processo_id: string
          user_id: string | null
        }
        Insert: {
          consultado_em?: string
          id?: string
          processo_id: string
          user_id?: string | null
        }
        Update: {
          consultado_em?: string
          id?: string
          processo_id?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "processos_log_consultas_processo_id_fkey"
            columns: ["processo_id"]
            isOneToOne: false
            referencedRelation: "processos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "processos_log_consultas_processo_id_fkey"
            columns: ["processo_id"]
            isOneToOne: false
            referencedRelation: "processos_unificados"
            referencedColumns: ["id"]
          },
        ]
      }
      processos_sugestoes: {
        Row: {
          avaliado_em: string | null
          avaliado_por: string | null
          descricao: string
          id: string
          motivo_decisao: string | null
          origem: string | null
          processo_id: string | null
          status: string
          sugerido_em: string
          sugerido_por: string | null
          titulo_sugerido: string | null
        }
        Insert: {
          avaliado_em?: string | null
          avaliado_por?: string | null
          descricao: string
          id?: string
          motivo_decisao?: string | null
          origem?: string | null
          processo_id?: string | null
          status?: string
          sugerido_em?: string
          sugerido_por?: string | null
          titulo_sugerido?: string | null
        }
        Update: {
          avaliado_em?: string | null
          avaliado_por?: string | null
          descricao?: string
          id?: string
          motivo_decisao?: string | null
          origem?: string | null
          processo_id?: string | null
          status?: string
          sugerido_em?: string
          sugerido_por?: string | null
          titulo_sugerido?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "processos_sugestoes_processo_id_fkey"
            columns: ["processo_id"]
            isOneToOne: false
            referencedRelation: "processos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "processos_sugestoes_processo_id_fkey"
            columns: ["processo_id"]
            isOneToOne: false
            referencedRelation: "processos_unificados"
            referencedColumns: ["id"]
          },
        ]
      }
      processos_tags_areas: {
        Row: {
          area_id: string
          processo_id: string
        }
        Insert: {
          area_id: string
          processo_id: string
        }
        Update: {
          area_id?: string
          processo_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "processos_tags_areas_area_id_fkey"
            columns: ["area_id"]
            isOneToOne: false
            referencedRelation: "parametros"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "processos_tags_areas_processo_id_fkey"
            columns: ["processo_id"]
            isOneToOne: false
            referencedRelation: "processos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "processos_tags_areas_processo_id_fkey"
            columns: ["processo_id"]
            isOneToOne: false
            referencedRelation: "processos_unificados"
            referencedColumns: ["id"]
          },
        ]
      }
      processos_tags_cargos: {
        Row: {
          cargo_id: string
          processo_id: string
        }
        Insert: {
          cargo_id: string
          processo_id: string
        }
        Update: {
          cargo_id?: string
          processo_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "processos_tags_cargos_cargo_id_fkey"
            columns: ["cargo_id"]
            isOneToOne: false
            referencedRelation: "cargos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "processos_tags_cargos_processo_id_fkey"
            columns: ["processo_id"]
            isOneToOne: false
            referencedRelation: "processos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "processos_tags_cargos_processo_id_fkey"
            columns: ["processo_id"]
            isOneToOne: false
            referencedRelation: "processos_unificados"
            referencedColumns: ["id"]
          },
        ]
      }
      processos_tags_departamentos: {
        Row: {
          departamento_id: string
          processo_id: string
        }
        Insert: {
          departamento_id: string
          processo_id: string
        }
        Update: {
          departamento_id?: string
          processo_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "processos_tags_departamentos_departamento_id_fkey"
            columns: ["departamento_id"]
            isOneToOne: false
            referencedRelation: "parametros"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "processos_tags_departamentos_processo_id_fkey"
            columns: ["processo_id"]
            isOneToOne: false
            referencedRelation: "processos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "processos_tags_departamentos_processo_id_fkey"
            columns: ["processo_id"]
            isOneToOne: false
            referencedRelation: "processos_unificados"
            referencedColumns: ["id"]
          },
        ]
      }
      processos_tags_sistemas: {
        Row: {
          processo_id: string
          sistema_id: string
        }
        Insert: {
          processo_id: string
          sistema_id: string
        }
        Update: {
          processo_id?: string
          sistema_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "processos_tags_sistemas_processo_id_fkey"
            columns: ["processo_id"]
            isOneToOne: false
            referencedRelation: "processos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "processos_tags_sistemas_processo_id_fkey"
            columns: ["processo_id"]
            isOneToOne: false
            referencedRelation: "processos_unificados"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "processos_tags_sistemas_sistema_id_fkey"
            columns: ["sistema_id"]
            isOneToOne: false
            referencedRelation: "sncf_sistemas"
            referencedColumns: ["id"]
          },
        ]
      }
      processos_tags_tipos_colaborador: {
        Row: {
          processo_id: string
          tipo: string
        }
        Insert: {
          processo_id: string
          tipo: string
        }
        Update: {
          processo_id?: string
          tipo?: string
        }
        Relationships: [
          {
            foreignKeyName: "processos_tags_tipos_colaborador_processo_id_fkey"
            columns: ["processo_id"]
            isOneToOne: false
            referencedRelation: "processos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "processos_tags_tipos_colaborador_processo_id_fkey"
            columns: ["processo_id"]
            isOneToOne: false
            referencedRelation: "processos_unificados"
            referencedColumns: ["id"]
          },
        ]
      }
      processos_tags_unidades: {
        Row: {
          processo_id: string
          unidade_id: string
        }
        Insert: {
          processo_id: string
          unidade_id: string
        }
        Update: {
          processo_id?: string
          unidade_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "processos_tags_unidades_processo_id_fkey"
            columns: ["processo_id"]
            isOneToOne: false
            referencedRelation: "processos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "processos_tags_unidades_processo_id_fkey"
            columns: ["processo_id"]
            isOneToOne: false
            referencedRelation: "processos_unificados"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "processos_tags_unidades_unidade_id_fkey"
            columns: ["unidade_id"]
            isOneToOne: false
            referencedRelation: "unidades"
            referencedColumns: ["id"]
          },
        ]
      }
      processos_versoes: {
        Row: {
          descricao_snapshot: string | null
          diagrama_snapshot: string | null
          id: string
          motivo_alteracao: string | null
          narrativa_snapshot: string | null
          natureza_snapshot: string | null
          nome_snapshot: string
          numero: number
          passos_snapshot: Json | null
          processo_id: string
          publicado_em: string
          publicado_por: string | null
          tags_snapshot: Json | null
        }
        Insert: {
          descricao_snapshot?: string | null
          diagrama_snapshot?: string | null
          id?: string
          motivo_alteracao?: string | null
          narrativa_snapshot?: string | null
          natureza_snapshot?: string | null
          nome_snapshot: string
          numero: number
          passos_snapshot?: Json | null
          processo_id: string
          publicado_em?: string
          publicado_por?: string | null
          tags_snapshot?: Json | null
        }
        Update: {
          descricao_snapshot?: string | null
          diagrama_snapshot?: string | null
          id?: string
          motivo_alteracao?: string | null
          narrativa_snapshot?: string | null
          natureza_snapshot?: string | null
          nome_snapshot?: string
          numero?: number
          passos_snapshot?: Json | null
          processo_id?: string
          publicado_em?: string
          publicado_por?: string | null
          tags_snapshot?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "processos_versoes_processo_id_fkey"
            columns: ["processo_id"]
            isOneToOne: false
            referencedRelation: "processos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "processos_versoes_processo_id_fkey"
            columns: ["processo_id"]
            isOneToOne: false
            referencedRelation: "processos_unificados"
            referencedColumns: ["id"]
          },
        ]
      }
      produtos: {
        Row: {
          ativo: boolean | null
          bling_id: string | null
          categoria: string | null
          codigo: string | null
          created_at: string | null
          descricao: string | null
          estoque_atual: number | null
          estoque_minimo: number | null
          gtin: string | null
          id: string
          imagem_url: string | null
          linha: string | null
          marca: string | null
          ncm: string | null
          nome: string
          origem: string | null
          peso_bruto: number | null
          peso_liquido: number | null
          preco_custo: number | null
          preco_venda: number | null
          tipo: string | null
          unidade: string | null
          updated_at: string | null
        }
        Insert: {
          ativo?: boolean | null
          bling_id?: string | null
          categoria?: string | null
          codigo?: string | null
          created_at?: string | null
          descricao?: string | null
          estoque_atual?: number | null
          estoque_minimo?: number | null
          gtin?: string | null
          id?: string
          imagem_url?: string | null
          linha?: string | null
          marca?: string | null
          ncm?: string | null
          nome: string
          origem?: string | null
          peso_bruto?: number | null
          peso_liquido?: number | null
          preco_custo?: number | null
          preco_venda?: number | null
          tipo?: string | null
          unidade?: string | null
          updated_at?: string | null
        }
        Update: {
          ativo?: boolean | null
          bling_id?: string | null
          categoria?: string | null
          codigo?: string | null
          created_at?: string | null
          descricao?: string | null
          estoque_atual?: number | null
          estoque_minimo?: number | null
          gtin?: string | null
          id?: string
          imagem_url?: string | null
          linha?: string | null
          marca?: string | null
          ncm?: string | null
          nome?: string
          origem?: string | null
          peso_bruto?: number | null
          peso_liquido?: number | null
          preco_custo?: number | null
          preco_venda?: number | null
          tipo?: string | null
          unidade?: string | null
          updated_at?: string | null
        }
        Relationships: []
      }
      profiles: {
        Row: {
          acesso_ativado_em: string | null
          approved: boolean
          avatar_url: string | null
          colaborador_tipo: string | null
          created_at: string
          departamento_id: string | null
          department: string | null
          full_name: string | null
          id: string
          position: string | null
          termo_uso_aceito_em: string | null
          termo_uso_versao: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          acesso_ativado_em?: string | null
          approved?: boolean
          avatar_url?: string | null
          colaborador_tipo?: string | null
          created_at?: string
          departamento_id?: string | null
          department?: string | null
          full_name?: string | null
          id?: string
          position?: string | null
          termo_uso_aceito_em?: string | null
          termo_uso_versao?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          acesso_ativado_em?: string | null
          approved?: boolean
          avatar_url?: string | null
          colaborador_tipo?: string | null
          created_at?: string
          departamento_id?: string | null
          department?: string | null
          full_name?: string | null
          id?: string
          position?: string | null
          termo_uso_aceito_em?: string | null
          termo_uso_versao?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "profiles_departamento_id_fkey"
            columns: ["departamento_id"]
            isOneToOne: false
            referencedRelation: "parametros"
            referencedColumns: ["id"]
          },
        ]
      }
      programa_niveis_beneficios: {
        Row: {
          a_vista_boleto_pct: number | null
          ativo: boolean
          atualizado_em: string
          atualizado_por: string | null
          cartao_sem_juros_max_parcelas: number
          criado_em: string
          desconto_pct: number
          id: string
          nome: string
          ordem_hierarquia: number | null
          pix_antecipado_pct: number | null
          prazo_padrao_dias: number
          slug: string
        }
        Insert: {
          a_vista_boleto_pct?: number | null
          ativo?: boolean
          atualizado_em?: string
          atualizado_por?: string | null
          cartao_sem_juros_max_parcelas?: number
          criado_em?: string
          desconto_pct?: number
          id?: string
          nome: string
          ordem_hierarquia?: number | null
          pix_antecipado_pct?: number | null
          prazo_padrao_dias: number
          slug: string
        }
        Update: {
          a_vista_boleto_pct?: number | null
          ativo?: boolean
          atualizado_em?: string
          atualizado_por?: string | null
          cartao_sem_juros_max_parcelas?: number
          criado_em?: string
          desconto_pct?: number
          id?: string
          nome?: string
          ordem_hierarquia?: number | null
          pix_antecipado_pct?: number | null
          prazo_padrao_dias?: number
          slug?: string
        }
        Relationships: []
      }
      reembolso_categorias: {
        Row: {
          ativo: boolean
          created_at: string
          id: string
          nome: string
          plano_contas_id: string | null
          updated_at: string
        }
        Insert: {
          ativo?: boolean
          created_at?: string
          id?: string
          nome: string
          plano_contas_id?: string | null
          updated_at?: string
        }
        Update: {
          ativo?: boolean
          created_at?: string
          id?: string
          nome?: string
          plano_contas_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "reembolso_categorias_plano_contas_id_fkey"
            columns: ["plano_contas_id"]
            isOneToOne: false
            referencedRelation: "plano_contas"
            referencedColumns: ["id"]
          },
        ]
      }
      reembolsos_colaborador: {
        Row: {
          aprovado_em: string | null
          aprovado_por: string | null
          categoria_id: string
          competencia: string
          comprovante_url: string | null
          cpr_id: string | null
          created_at: string
          created_by: string | null
          descricao: string | null
          id: string
          motivo_rejeicao: string | null
          sem_comprovante: boolean
          status: string
          updated_at: string
          valor: number
          vinculo_id: string
        }
        Insert: {
          aprovado_em?: string | null
          aprovado_por?: string | null
          categoria_id: string
          competencia: string
          comprovante_url?: string | null
          cpr_id?: string | null
          created_at?: string
          created_by?: string | null
          descricao?: string | null
          id?: string
          motivo_rejeicao?: string | null
          sem_comprovante?: boolean
          status?: string
          updated_at?: string
          valor: number
          vinculo_id: string
        }
        Update: {
          aprovado_em?: string | null
          aprovado_por?: string | null
          categoria_id?: string
          competencia?: string
          comprovante_url?: string | null
          cpr_id?: string | null
          created_at?: string
          created_by?: string | null
          descricao?: string | null
          id?: string
          motivo_rejeicao?: string | null
          sem_comprovante?: boolean
          status?: string
          updated_at?: string
          valor?: number
          vinculo_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "reembolsos_colaborador_categoria_id_fkey"
            columns: ["categoria_id"]
            isOneToOne: false
            referencedRelation: "reembolso_categorias"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reembolsos_colaborador_cpr_id_fkey"
            columns: ["cpr_id"]
            isOneToOne: false
            referencedRelation: "contas_pagar"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reembolsos_colaborador_cpr_id_fkey"
            columns: ["cpr_id"]
            isOneToOne: false
            referencedRelation: "contas_pagar_receber"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reembolsos_colaborador_cpr_id_fkey"
            columns: ["cpr_id"]
            isOneToOne: false
            referencedRelation: "contas_pagar_receber_ativas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reembolsos_colaborador_cpr_id_fkey"
            columns: ["cpr_id"]
            isOneToOne: false
            referencedRelation: "v_cpr_bola_redonda"
            referencedColumns: ["cpr_id"]
          },
          {
            foreignKeyName: "reembolsos_colaborador_cpr_id_fkey"
            columns: ["cpr_id"]
            isOneToOne: false
            referencedRelation: "vw_conciliacao_furos"
            referencedColumns: ["sugestao_cpr_id"]
          },
          {
            foreignKeyName: "reembolsos_colaborador_cpr_id_fkey"
            columns: ["cpr_id"]
            isOneToOne: false
            referencedRelation: "vw_contas_pagar_consolidado"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reembolsos_colaborador_cpr_id_fkey"
            columns: ["cpr_id"]
            isOneToOne: false
            referencedRelation: "vw_despesas_match_sugestoes"
            referencedColumns: ["cpr_id"]
          },
          {
            foreignKeyName: "reembolsos_colaborador_cpr_id_fkey"
            columns: ["cpr_id"]
            isOneToOne: false
            referencedRelation: "vw_documentos_envio_estados"
            referencedColumns: ["conta_id"]
          },
          {
            foreignKeyName: "reembolsos_colaborador_cpr_id_fkey"
            columns: ["cpr_id"]
            isOneToOne: false
            referencedRelation: "vw_pj_pagamentos"
            referencedColumns: ["cpr_id"]
          },
          {
            foreignKeyName: "reembolsos_colaborador_vinculo_id_fkey"
            columns: ["vinculo_id"]
            isOneToOne: false
            referencedRelation: "vinculos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reembolsos_colaborador_vinculo_id_fkey"
            columns: ["vinculo_id"]
            isOneToOne: false
            referencedRelation: "vw_custo_pessoas"
            referencedColumns: ["vinculo_id"]
          },
          {
            foreignKeyName: "reembolsos_colaborador_vinculo_id_fkey"
            columns: ["vinculo_id"]
            isOneToOne: false
            referencedRelation: "vw_nf_vinculo_pessoa"
            referencedColumns: ["vinculo_id"]
          },
          {
            foreignKeyName: "reembolsos_colaborador_vinculo_id_fkey"
            columns: ["vinculo_id"]
            isOneToOne: false
            referencedRelation: "vw_organograma"
            referencedColumns: ["vinculo_id"]
          },
          {
            foreignKeyName: "reembolsos_colaborador_vinculo_id_fkey"
            columns: ["vinculo_id"]
            isOneToOne: false
            referencedRelation: "vw_pj_notas_fiscais"
            referencedColumns: ["vinculo_id"]
          },
          {
            foreignKeyName: "reembolsos_colaborador_vinculo_id_fkey"
            columns: ["vinculo_id"]
            isOneToOne: false
            referencedRelation: "vw_pj_pagamentos"
            referencedColumns: ["vinculo_id"]
          },
          {
            foreignKeyName: "reembolsos_colaborador_vinculo_id_fkey"
            columns: ["vinculo_id"]
            isOneToOne: false
            referencedRelation: "vw_vinculo_custo_total"
            referencedColumns: ["vinculo_id"]
          },
        ]
      }
      regras_automaticas_ofx: {
        Row: {
          ativa: boolean
          categoria_id: string
          conta_bancaria_id: string | null
          created_at: string
          criado_por: string | null
          descricao_override: string | null
          id: string
          nome: string
          padrao_descricao: string
          parceiro_id: string | null
          tipo_transacao: string
          updated_at: string
          valor_exato: number | null
        }
        Insert: {
          ativa?: boolean
          categoria_id: string
          conta_bancaria_id?: string | null
          created_at?: string
          criado_por?: string | null
          descricao_override?: string | null
          id?: string
          nome: string
          padrao_descricao: string
          parceiro_id?: string | null
          tipo_transacao: string
          updated_at?: string
          valor_exato?: number | null
        }
        Update: {
          ativa?: boolean
          categoria_id?: string
          conta_bancaria_id?: string | null
          created_at?: string
          criado_por?: string | null
          descricao_override?: string | null
          id?: string
          nome?: string
          padrao_descricao?: string
          parceiro_id?: string | null
          tipo_transacao?: string
          updated_at?: string
          valor_exato?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "regras_automaticas_ofx_categoria_id_fkey"
            columns: ["categoria_id"]
            isOneToOne: false
            referencedRelation: "plano_contas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "regras_automaticas_ofx_conta_bancaria_id_fkey"
            columns: ["conta_bancaria_id"]
            isOneToOne: false
            referencedRelation: "contas_bancarias"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "regras_automaticas_ofx_parceiro_id_fkey"
            columns: ["parceiro_id"]
            isOneToOne: false
            referencedRelation: "parceiros_comerciais"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "regras_automaticas_ofx_parceiro_id_fkey"
            columns: ["parceiro_id"]
            isOneToOne: false
            referencedRelation: "v_credito_resumo_financeiro"
            referencedColumns: ["parceiro_id"]
          },
          {
            foreignKeyName: "regras_automaticas_ofx_parceiro_id_fkey"
            columns: ["parceiro_id"]
            isOneToOne: false
            referencedRelation: "vw_logistica_agregado"
            referencedColumns: ["transportadora_id"]
          },
          {
            foreignKeyName: "regras_automaticas_ofx_parceiro_id_fkey"
            columns: ["parceiro_id"]
            isOneToOne: false
            referencedRelation: "vw_recebivel_por_conta"
            referencedColumns: ["conta_id"]
          },
        ]
      }
      regras_cadencia_credito: {
        Row: {
          ativa: boolean
          atualizado_em: string
          atualizado_por: string | null
          condicao_default: Json | null
          criado_em: string
          criado_por: string | null
          criterio: Json
          descricao: string | null
          id: string
          nome: string
          ordem: number
          parecer_template: string | null
        }
        Insert: {
          ativa?: boolean
          atualizado_em?: string
          atualizado_por?: string | null
          condicao_default?: Json | null
          criado_em?: string
          criado_por?: string | null
          criterio?: Json
          descricao?: string | null
          id?: string
          nome: string
          ordem?: number
          parecer_template?: string | null
        }
        Update: {
          ativa?: boolean
          atualizado_em?: string
          atualizado_por?: string | null
          condicao_default?: Json | null
          criado_em?: string
          criado_por?: string | null
          criterio?: Json
          descricao?: string | null
          id?: string
          nome?: string
          ordem?: number
          parecer_template?: string | null
        }
        Relationships: []
      }
      regras_categorizacao: {
        Row: {
          aprendida_automaticamente: boolean
          ativo: boolean | null
          centro_custo_id: string | null
          cnpj_emitente: string | null
          confianca: number
          created_at: string | null
          criada_por: string | null
          criado_por: string | null
          descricao_contem: string | null
          escopo_origem: string
          fornecedor_id: string | null
          id: string
          ncm_prefixo: string | null
          parceiro_id: string | null
          plano_contas_id: string
          prioridade: number | null
          token_principal: string | null
          ultima_aplicacao_em: string | null
          updated_at: string | null
          vezes_aplicada: number
          vezes_corrigida: number
        }
        Insert: {
          aprendida_automaticamente?: boolean
          ativo?: boolean | null
          centro_custo_id?: string | null
          cnpj_emitente?: string | null
          confianca?: number
          created_at?: string | null
          criada_por?: string | null
          criado_por?: string | null
          descricao_contem?: string | null
          escopo_origem?: string
          fornecedor_id?: string | null
          id?: string
          ncm_prefixo?: string | null
          parceiro_id?: string | null
          plano_contas_id: string
          prioridade?: number | null
          token_principal?: string | null
          ultima_aplicacao_em?: string | null
          updated_at?: string | null
          vezes_aplicada?: number
          vezes_corrigida?: number
        }
        Update: {
          aprendida_automaticamente?: boolean
          ativo?: boolean | null
          centro_custo_id?: string | null
          cnpj_emitente?: string | null
          confianca?: number
          created_at?: string | null
          criada_por?: string | null
          criado_por?: string | null
          descricao_contem?: string | null
          escopo_origem?: string
          fornecedor_id?: string | null
          id?: string
          ncm_prefixo?: string | null
          parceiro_id?: string | null
          plano_contas_id?: string
          prioridade?: number | null
          token_principal?: string | null
          ultima_aplicacao_em?: string | null
          updated_at?: string | null
          vezes_aplicada?: number
          vezes_corrigida?: number
        }
        Relationships: [
          {
            foreignKeyName: "regras_categorizacao_centro_custo_id_fkey"
            columns: ["centro_custo_id"]
            isOneToOne: false
            referencedRelation: "centros_custo"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "regras_categorizacao_centro_custo_id_fkey"
            columns: ["centro_custo_id"]
            isOneToOne: false
            referencedRelation: "vw_custo_pessoas"
            referencedColumns: ["centro_custo_id"]
          },
          {
            foreignKeyName: "regras_categorizacao_centro_custo_id_fkey"
            columns: ["centro_custo_id"]
            isOneToOne: false
            referencedRelation: "vw_dimensionamento_areas"
            referencedColumns: ["centro_custo_id"]
          },
          {
            foreignKeyName: "regras_categorizacao_fornecedor_id_fkey"
            columns: ["fornecedor_id"]
            isOneToOne: false
            referencedRelation: "parceiros_comerciais"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "regras_categorizacao_fornecedor_id_fkey"
            columns: ["fornecedor_id"]
            isOneToOne: false
            referencedRelation: "v_credito_resumo_financeiro"
            referencedColumns: ["parceiro_id"]
          },
          {
            foreignKeyName: "regras_categorizacao_fornecedor_id_fkey"
            columns: ["fornecedor_id"]
            isOneToOne: false
            referencedRelation: "vw_logistica_agregado"
            referencedColumns: ["transportadora_id"]
          },
          {
            foreignKeyName: "regras_categorizacao_fornecedor_id_fkey"
            columns: ["fornecedor_id"]
            isOneToOne: false
            referencedRelation: "vw_recebivel_por_conta"
            referencedColumns: ["conta_id"]
          },
          {
            foreignKeyName: "regras_categorizacao_parceiro_id_fkey"
            columns: ["parceiro_id"]
            isOneToOne: false
            referencedRelation: "parceiros_comerciais"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "regras_categorizacao_parceiro_id_fkey"
            columns: ["parceiro_id"]
            isOneToOne: false
            referencedRelation: "v_credito_resumo_financeiro"
            referencedColumns: ["parceiro_id"]
          },
          {
            foreignKeyName: "regras_categorizacao_parceiro_id_fkey"
            columns: ["parceiro_id"]
            isOneToOne: false
            referencedRelation: "vw_logistica_agregado"
            referencedColumns: ["transportadora_id"]
          },
          {
            foreignKeyName: "regras_categorizacao_parceiro_id_fkey"
            columns: ["parceiro_id"]
            isOneToOne: false
            referencedRelation: "vw_recebivel_por_conta"
            referencedColumns: ["conta_id"]
          },
          {
            foreignKeyName: "regras_categorizacao_plano_contas_id_fkey"
            columns: ["plano_contas_id"]
            isOneToOne: false
            referencedRelation: "plano_contas"
            referencedColumns: ["id"]
          },
        ]
      }
      regras_classificacao_extrato: {
        Row: {
          ativo: boolean
          campo_alvo: string
          classe_destino: string
          conta_bancaria_id: string | null
          created_at: string
          descricao_regra: string | null
          id: string
          operador: string
          ordem: number
          padrao: string
          tipo_meio_destino: string | null
          updated_at: string
        }
        Insert: {
          ativo?: boolean
          campo_alvo?: string
          classe_destino: string
          conta_bancaria_id?: string | null
          created_at?: string
          descricao_regra?: string | null
          id?: string
          operador?: string
          ordem?: number
          padrao: string
          tipo_meio_destino?: string | null
          updated_at?: string
        }
        Update: {
          ativo?: boolean
          campo_alvo?: string
          classe_destino?: string
          conta_bancaria_id?: string | null
          created_at?: string
          descricao_regra?: string | null
          id?: string
          operador?: string
          ordem?: number
          padrao?: string
          tipo_meio_destino?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "regras_classificacao_extrato_conta_bancaria_id_fkey"
            columns: ["conta_bancaria_id"]
            isOneToOne: false
            referencedRelation: "contas_bancarias"
            referencedColumns: ["id"]
          },
        ]
      }
      regras_pagamento_pedido: {
        Row: {
          ativo: boolean
          codigo: string
          created_at: string
          espera_pagamento: boolean
          forma: string
          id: string
          nome: string
          ordem: number
          parcela_unica: boolean
          passa_por_analise: boolean
          updated_at: string
        }
        Insert: {
          ativo?: boolean
          codigo: string
          created_at?: string
          espera_pagamento: boolean
          forma: string
          id?: string
          nome: string
          ordem?: number
          parcela_unica: boolean
          passa_por_analise: boolean
          updated_at?: string
        }
        Update: {
          ativo?: boolean
          codigo?: string
          created_at?: string
          espera_pagamento?: boolean
          forma?: string
          id?: string
          nome?: string
          ordem?: number
          parcela_unica?: boolean
          passa_por_analise?: boolean
          updated_at?: string
        }
        Relationships: []
      }
      regua_cobranca_acoes_log: {
        Row: {
          canal_efetivo: string | null
          dias_offset: number | null
          etapa_codigo: string
          executada_em: string
          executada_por: string | null
          id: string
          mensagem_snapshot: string | null
          observacao: string | null
          perfil_usado: string
          resultado: string
          titulo_id: string
        }
        Insert: {
          canal_efetivo?: string | null
          dias_offset?: number | null
          etapa_codigo: string
          executada_em?: string
          executada_por?: string | null
          id?: string
          mensagem_snapshot?: string | null
          observacao?: string | null
          perfil_usado?: string
          resultado: string
          titulo_id: string
        }
        Update: {
          canal_efetivo?: string | null
          dias_offset?: number | null
          etapa_codigo?: string
          executada_em?: string
          executada_por?: string | null
          id?: string
          mensagem_snapshot?: string | null
          observacao?: string | null
          perfil_usado?: string
          resultado?: string
          titulo_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "regua_cobranca_acoes_log_titulo_id_fkey"
            columns: ["titulo_id"]
            isOneToOne: false
            referencedRelation: "titulo_a_receber"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "regua_cobranca_acoes_log_titulo_id_fkey"
            columns: ["titulo_id"]
            isOneToOne: false
            referencedRelation: "vw_previsao_recebimentos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "regua_cobranca_acoes_log_titulo_id_fkey"
            columns: ["titulo_id"]
            isOneToOne: false
            referencedRelation: "vw_recebivel_b2b"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "regua_cobranca_acoes_log_titulo_id_fkey"
            columns: ["titulo_id"]
            isOneToOne: false
            referencedRelation: "vw_titulos_cobranca"
            referencedColumns: ["id"]
          },
        ]
      }
      regua_cobranca_etapas: {
        Row: {
          ativa: boolean
          canal_sugerido: string
          codigo: string
          created_at: string
          custo_externo_previsto: number | null
          descricao_acao: string
          dias_offset: number
          id: string
          ordem: number
          perfil_cadencia: string
          requer_aprovacao: boolean
          responsavel_default: string | null
          template_mensagem: string | null
          updated_at: string
        }
        Insert: {
          ativa?: boolean
          canal_sugerido: string
          codigo: string
          created_at?: string
          custo_externo_previsto?: number | null
          descricao_acao: string
          dias_offset: number
          id?: string
          ordem: number
          perfil_cadencia?: string
          requer_aprovacao?: boolean
          responsavel_default?: string | null
          template_mensagem?: string | null
          updated_at?: string
        }
        Update: {
          ativa?: boolean
          canal_sugerido?: string
          codigo?: string
          created_at?: string
          custo_externo_previsto?: number | null
          descricao_acao?: string
          dias_offset?: number
          id?: string
          ordem?: number
          perfil_cadencia?: string
          requer_aprovacao?: boolean
          responsavel_default?: string | null
          template_mensagem?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      remessas_contador: {
        Row: {
          created_at: string
          descricao: string | null
          destinatarios: string[]
          enviada_em: string
          enviada_por: string | null
          id: string
          link_expira_em: string | null
          link_signed: string | null
          metodo: string
          observacao: string | null
          periodo_fim: string
          periodo_inicio: string
          qtd_contas: number
          qtd_documentos: number
        }
        Insert: {
          created_at?: string
          descricao?: string | null
          destinatarios?: string[]
          enviada_em?: string
          enviada_por?: string | null
          id?: string
          link_expira_em?: string | null
          link_signed?: string | null
          metodo: string
          observacao?: string | null
          periodo_fim: string
          periodo_inicio: string
          qtd_contas?: number
          qtd_documentos?: number
        }
        Update: {
          created_at?: string
          descricao?: string | null
          destinatarios?: string[]
          enviada_em?: string
          enviada_por?: string | null
          id?: string
          link_expira_em?: string | null
          link_signed?: string | null
          metodo?: string
          observacao?: string | null
          periodo_fim?: string
          periodo_inicio?: string
          qtd_contas?: number
          qtd_documentos?: number
        }
        Relationships: []
      }
      remessas_contador_itens: {
        Row: {
          conta_id: string
          created_at: string
          doc_ids: string[]
          id: string
          remessa_id: string
        }
        Insert: {
          conta_id: string
          created_at?: string
          doc_ids?: string[]
          id?: string
          remessa_id: string
        }
        Update: {
          conta_id?: string
          created_at?: string
          doc_ids?: string[]
          id?: string
          remessa_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "remessas_contador_itens_conta_id_fkey"
            columns: ["conta_id"]
            isOneToOne: false
            referencedRelation: "contas_pagar"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "remessas_contador_itens_conta_id_fkey"
            columns: ["conta_id"]
            isOneToOne: false
            referencedRelation: "contas_pagar_receber"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "remessas_contador_itens_conta_id_fkey"
            columns: ["conta_id"]
            isOneToOne: false
            referencedRelation: "contas_pagar_receber_ativas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "remessas_contador_itens_conta_id_fkey"
            columns: ["conta_id"]
            isOneToOne: false
            referencedRelation: "v_cpr_bola_redonda"
            referencedColumns: ["cpr_id"]
          },
          {
            foreignKeyName: "remessas_contador_itens_conta_id_fkey"
            columns: ["conta_id"]
            isOneToOne: false
            referencedRelation: "vw_conciliacao_furos"
            referencedColumns: ["sugestao_cpr_id"]
          },
          {
            foreignKeyName: "remessas_contador_itens_conta_id_fkey"
            columns: ["conta_id"]
            isOneToOne: false
            referencedRelation: "vw_contas_pagar_consolidado"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "remessas_contador_itens_conta_id_fkey"
            columns: ["conta_id"]
            isOneToOne: false
            referencedRelation: "vw_despesas_match_sugestoes"
            referencedColumns: ["cpr_id"]
          },
          {
            foreignKeyName: "remessas_contador_itens_conta_id_fkey"
            columns: ["conta_id"]
            isOneToOne: false
            referencedRelation: "vw_documentos_envio_estados"
            referencedColumns: ["conta_id"]
          },
          {
            foreignKeyName: "remessas_contador_itens_conta_id_fkey"
            columns: ["conta_id"]
            isOneToOne: false
            referencedRelation: "vw_pj_pagamentos"
            referencedColumns: ["cpr_id"]
          },
          {
            foreignKeyName: "remessas_contador_itens_remessa_id_fkey"
            columns: ["remessa_id"]
            isOneToOne: false
            referencedRelation: "remessas_contador"
            referencedColumns: ["id"]
          },
        ]
      }
      remessas_safra: {
        Row: {
          arquivo_nome: string
          enviada_em: string | null
          enviada_por: string | null
          gerado_em: string
          gerado_por: string | null
          id: string
          nro_sequencial: number
          observacao: string | null
          qtd_titulos: number
          retorno_processado_em: string | null
          status: string
          tipo: string
          valor_total: number
        }
        Insert: {
          arquivo_nome: string
          enviada_em?: string | null
          enviada_por?: string | null
          gerado_em?: string
          gerado_por?: string | null
          id?: string
          nro_sequencial: number
          observacao?: string | null
          qtd_titulos: number
          retorno_processado_em?: string | null
          status?: string
          tipo?: string
          valor_total: number
        }
        Update: {
          arquivo_nome?: string
          enviada_em?: string | null
          enviada_por?: string | null
          gerado_em?: string
          gerado_por?: string | null
          id?: string
          nro_sequencial?: number
          observacao?: string | null
          qtd_titulos?: number
          retorno_processado_em?: string | null
          status?: string
          tipo?: string
          valor_total?: number
        }
        Relationships: []
      }
      responsabilidades_catalogo: {
        Row: {
          area: string
          ativo: boolean | null
          created_at: string | null
          criado_por: string | null
          id: string
          nivel: string
          responsabilidade: string
        }
        Insert: {
          area: string
          ativo?: boolean | null
          created_at?: string | null
          criado_por?: string | null
          id?: string
          nivel?: string
          responsabilidade: string
        }
        Update: {
          area?: string
          ativo?: boolean | null
          created_at?: string | null
          criado_por?: string | null
          id?: string
          nivel?: string
          responsabilidade?: string
        }
        Relationships: []
      }
      role_permissions: {
        Row: {
          colaborador_tipo: string
          created_at: string
          granted: boolean
          id: string
          module: string
          nivel_minimo: Database["public"]["Enums"]["nivel_cargo"] | null
          permission: string
          role_name: string
          updated_at: string
        }
        Insert: {
          colaborador_tipo?: string
          created_at?: string
          granted?: boolean
          id?: string
          module: string
          nivel_minimo?: Database["public"]["Enums"]["nivel_cargo"] | null
          permission: string
          role_name: string
          updated_at?: string
        }
        Update: {
          colaborador_tipo?: string
          created_at?: string
          granted?: boolean
          id?: string
          module?: string
          nivel_minimo?: Database["public"]["Enums"]["nivel_cargo"] | null
          permission?: string
          role_name?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "role_permissions_role_name_fkey"
            columns: ["role_name"]
            isOneToOne: false
            referencedRelation: "custom_roles"
            referencedColumns: ["name"]
          },
        ]
      }
      safra_motivos_rejeicao: {
        Row: {
          codigo: string
          created_at: string
          descricao: string
          observacao: string | null
        }
        Insert: {
          codigo: string
          created_at?: string
          descricao: string
          observacao?: string | null
        }
        Update: {
          codigo?: string
          created_at?: string
          descricao?: string
          observacao?: string | null
        }
        Relationships: []
      }
      safra_ocorrencias_retorno: {
        Row: {
          ativo: boolean
          categoria: string
          codigo: string
          created_at: string
          descricao: string
          gera_data_credito: boolean
          observacao: string | null
        }
        Insert: {
          ativo?: boolean
          categoria: string
          codigo: string
          created_at?: string
          descricao: string
          gera_data_credito?: boolean
          observacao?: string | null
        }
        Update: {
          ativo?: boolean
          categoria?: string
          codigo?: string
          created_at?: string
          descricao?: string
          gera_data_credito?: boolean
          observacao?: string | null
        }
        Relationships: []
      }
      shopify_checkouts: {
        Row: {
          abandoned_checkout_url: string | null
          billing_address: Json | null
          buyer_accepts_marketing: boolean | null
          buyer_accepts_sms_marketing: boolean | null
          cart_token: string | null
          closed_at: string | null
          completed_at: string | null
          created_at: string
          created_at_shopify: string | null
          currency: string | null
          customer: Json | null
          customer_locale: string | null
          device_id: string | null
          discount_codes: Json | null
          email: string | null
          gateway: string | null
          landing_site: string | null
          line_items: Json | null
          location_id: string | null
          name: string | null
          note: string | null
          note_attributes: Json | null
          phone: string | null
          presentment_currency: string | null
          referring_site: string | null
          reservation_token: string | null
          shipping_address: Json | null
          shipping_lines: Json | null
          sms_marketing_phone: string | null
          source: string | null
          source_identifier: string | null
          source_name: string | null
          source_url: string | null
          subtotal_price: number | null
          tax_lines: Json | null
          taxes_included: boolean | null
          token: string
          total_discounts: number | null
          total_duties: number | null
          total_line_items_price: number | null
          total_price: number | null
          total_tax: number | null
          total_weight: number | null
          updated_at: string
          updated_at_shopify: string | null
          user_id: string | null
        }
        Insert: {
          abandoned_checkout_url?: string | null
          billing_address?: Json | null
          buyer_accepts_marketing?: boolean | null
          buyer_accepts_sms_marketing?: boolean | null
          cart_token?: string | null
          closed_at?: string | null
          completed_at?: string | null
          created_at?: string
          created_at_shopify?: string | null
          currency?: string | null
          customer?: Json | null
          customer_locale?: string | null
          device_id?: string | null
          discount_codes?: Json | null
          email?: string | null
          gateway?: string | null
          landing_site?: string | null
          line_items?: Json | null
          location_id?: string | null
          name?: string | null
          note?: string | null
          note_attributes?: Json | null
          phone?: string | null
          presentment_currency?: string | null
          referring_site?: string | null
          reservation_token?: string | null
          shipping_address?: Json | null
          shipping_lines?: Json | null
          sms_marketing_phone?: string | null
          source?: string | null
          source_identifier?: string | null
          source_name?: string | null
          source_url?: string | null
          subtotal_price?: number | null
          tax_lines?: Json | null
          taxes_included?: boolean | null
          token: string
          total_discounts?: number | null
          total_duties?: number | null
          total_line_items_price?: number | null
          total_price?: number | null
          total_tax?: number | null
          total_weight?: number | null
          updated_at?: string
          updated_at_shopify?: string | null
          user_id?: string | null
        }
        Update: {
          abandoned_checkout_url?: string | null
          billing_address?: Json | null
          buyer_accepts_marketing?: boolean | null
          buyer_accepts_sms_marketing?: boolean | null
          cart_token?: string | null
          closed_at?: string | null
          completed_at?: string | null
          created_at?: string
          created_at_shopify?: string | null
          currency?: string | null
          customer?: Json | null
          customer_locale?: string | null
          device_id?: string | null
          discount_codes?: Json | null
          email?: string | null
          gateway?: string | null
          landing_site?: string | null
          line_items?: Json | null
          location_id?: string | null
          name?: string | null
          note?: string | null
          note_attributes?: Json | null
          phone?: string | null
          presentment_currency?: string | null
          referring_site?: string | null
          reservation_token?: string | null
          shipping_address?: Json | null
          shipping_lines?: Json | null
          sms_marketing_phone?: string | null
          source?: string | null
          source_identifier?: string | null
          source_name?: string | null
          source_url?: string | null
          subtotal_price?: number | null
          tax_lines?: Json | null
          taxes_included?: boolean | null
          token?: string
          total_discounts?: number | null
          total_duties?: number | null
          total_line_items_price?: number | null
          total_price?: number | null
          total_tax?: number | null
          total_weight?: number | null
          updated_at?: string
          updated_at_shopify?: string | null
          user_id?: string | null
        }
        Relationships: []
      }
      shopify_clientes: {
        Row: {
          addresses: Json | null
          admin_graphql_api_id: string | null
          created_at: string
          created_at_shopify: string | null
          currency: string | null
          default_address: Json | null
          email: string | null
          first_name: string | null
          last_name: string | null
          multipass_identifier: string | null
          note: string | null
          phone: string | null
          shopify_id: string
          state: string | null
          tax_exempt: boolean | null
          tax_exemptions: Json | null
          updated_at: string
          updated_at_shopify: string | null
          verified_email: boolean | null
        }
        Insert: {
          addresses?: Json | null
          admin_graphql_api_id?: string | null
          created_at?: string
          created_at_shopify?: string | null
          currency?: string | null
          default_address?: Json | null
          email?: string | null
          first_name?: string | null
          last_name?: string | null
          multipass_identifier?: string | null
          note?: string | null
          phone?: string | null
          shopify_id: string
          state?: string | null
          tax_exempt?: boolean | null
          tax_exemptions?: Json | null
          updated_at?: string
          updated_at_shopify?: string | null
          verified_email?: boolean | null
        }
        Update: {
          addresses?: Json | null
          admin_graphql_api_id?: string | null
          created_at?: string
          created_at_shopify?: string | null
          currency?: string | null
          default_address?: Json | null
          email?: string | null
          first_name?: string | null
          last_name?: string | null
          multipass_identifier?: string | null
          note?: string | null
          phone?: string | null
          shopify_id?: string
          state?: string | null
          tax_exempt?: boolean | null
          tax_exemptions?: Json | null
          updated_at?: string
          updated_at_shopify?: string | null
          verified_email?: boolean | null
        }
        Relationships: []
      }
      shopify_estoque: {
        Row: {
          admin_graphql_api_id: string | null
          available: number | null
          created_at: string
          inventory_item_id: string
          location_id: string
          updated_at: string
          updated_at_shopify: string | null
        }
        Insert: {
          admin_graphql_api_id?: string | null
          available?: number | null
          created_at?: string
          inventory_item_id: string
          location_id: string
          updated_at?: string
          updated_at_shopify?: string | null
        }
        Update: {
          admin_graphql_api_id?: string | null
          available?: number | null
          created_at?: string
          inventory_item_id?: string
          location_id?: string
          updated_at?: string
          updated_at_shopify?: string | null
        }
        Relationships: []
      }
      shopify_eventos_raw: {
        Row: {
          em: string
          event_id: string | null
          id: number
          payload: Json | null
          topic: string | null
        }
        Insert: {
          em?: string
          event_id?: string | null
          id?: never
          payload?: Json | null
          topic?: string | null
        }
        Update: {
          em?: string
          event_id?: string | null
          id?: never
          payload?: Json | null
          topic?: string | null
        }
        Relationships: []
      }
      shopify_frete_sla: {
        Row: {
          ativo: boolean
          descricao: string | null
          dias_corridos: number
          modalidade: string
          updated_at: string
        }
        Insert: {
          ativo?: boolean
          descricao?: string | null
          dias_corridos: number
          modalidade: string
          updated_at?: string
        }
        Update: {
          ativo?: boolean
          descricao?: string | null
          dias_corridos?: number
          modalidade?: string
          updated_at?: string
        }
        Relationships: []
      }
      shopify_fulfillments: {
        Row: {
          admin_graphql_api_id: string | null
          created_at: string
          created_at_shopify: string | null
          destination: Json | null
          email: string | null
          line_items: Json | null
          location_id: string | null
          name: string | null
          order_id: string | null
          origin_address: Json | null
          receipt: Json | null
          service: string | null
          shipment_status: string | null
          shopify_id: string
          status: string | null
          tracking_company: string | null
          tracking_number: string | null
          tracking_numbers: Json | null
          tracking_url: string | null
          tracking_urls: Json | null
          updated_at: string
          updated_at_shopify: string | null
        }
        Insert: {
          admin_graphql_api_id?: string | null
          created_at?: string
          created_at_shopify?: string | null
          destination?: Json | null
          email?: string | null
          line_items?: Json | null
          location_id?: string | null
          name?: string | null
          order_id?: string | null
          origin_address?: Json | null
          receipt?: Json | null
          service?: string | null
          shipment_status?: string | null
          shopify_id: string
          status?: string | null
          tracking_company?: string | null
          tracking_number?: string | null
          tracking_numbers?: Json | null
          tracking_url?: string | null
          tracking_urls?: Json | null
          updated_at?: string
          updated_at_shopify?: string | null
        }
        Update: {
          admin_graphql_api_id?: string | null
          created_at?: string
          created_at_shopify?: string | null
          destination?: Json | null
          email?: string | null
          line_items?: Json | null
          location_id?: string | null
          name?: string | null
          order_id?: string | null
          origin_address?: Json | null
          receipt?: Json | null
          service?: string | null
          shipment_status?: string | null
          shopify_id?: string
          status?: string | null
          tracking_company?: string | null
          tracking_number?: string | null
          tracking_numbers?: Json | null
          tracking_url?: string | null
          tracking_urls?: Json | null
          updated_at?: string
          updated_at_shopify?: string | null
        }
        Relationships: []
      }
      shopify_importacoes: {
        Row: {
          created_at: string
          id: string
          mensagem_erro: string | null
          status: string
          total_itens: number | null
          total_linhas: number | null
          total_pedidos: number | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          mensagem_erro?: string | null
          status: string
          total_itens?: number | null
          total_linhas?: number | null
          total_pedidos?: number | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          mensagem_erro?: string | null
          status?: string
          total_itens?: number | null
          total_linhas?: number | null
          total_pedidos?: number | null
          updated_at?: string
        }
        Relationships: []
      }
      shopify_itens: {
        Row: {
          created_at: string
          fulfillment_status: string | null
          id: string
          pedido_id: string
          product_name: string | null
          quantity: number
          sku: string | null
          unit_price: number
        }
        Insert: {
          created_at?: string
          fulfillment_status?: string | null
          id?: string
          pedido_id: string
          product_name?: string | null
          quantity?: number
          sku?: string | null
          unit_price?: number
        }
        Update: {
          created_at?: string
          fulfillment_status?: string | null
          id?: string
          pedido_id?: string
          product_name?: string | null
          quantity?: number
          sku?: string | null
          unit_price?: number
        }
        Relationships: [
          {
            foreignKeyName: "shopify_itens_pedido_id_fkey"
            columns: ["pedido_id"]
            isOneToOne: false
            referencedRelation: "shopify_pedidos"
            referencedColumns: ["shopify_id"]
          },
          {
            foreignKeyName: "shopify_itens_pedido_id_fkey"
            columns: ["pedido_id"]
            isOneToOne: false
            referencedRelation: "vw_gestao_b2c"
            referencedColumns: ["shopify_id"]
          },
          {
            foreignKeyName: "shopify_itens_pedido_id_fkey"
            columns: ["pedido_id"]
            isOneToOne: false
            referencedRelation: "vw_shopify_pedidos_rastreio"
            referencedColumns: ["shopify_id"]
          },
        ]
      }
      shopify_pagamento_ref: {
        Row: {
          created_at: string
          fonte: string
          id: number
          order_name: string
          shopify_id: string | null
          token: string
        }
        Insert: {
          created_at?: string
          fonte?: string
          id?: never
          order_name: string
          shopify_id?: string | null
          token: string
        }
        Update: {
          created_at?: string
          fonte?: string
          id?: never
          order_name?: string
          shopify_id?: string | null
          token?: string
        }
        Relationships: []
      }
      shopify_pedidos: {
        Row: {
          cancelled_at: string | null
          created_at: string
          created_at_shopify: string
          discount_amount: number
          financial_status: string
          fulfilled_at: string | null
          fulfillment_status: string | null
          importacao_id: string | null
          order_name: string
          paid_at: string | null
          payment_method: string | null
          payment_method_raw: string | null
          payment_reference: string | null
          refunded_amount: number
          shipping_city: string | null
          shipping_cost: number
          shipping_method: string | null
          shipping_province: string | null
          shipping_zip: string | null
          shopify_id: string
          subtotal: number
          total: number
          tracking_company: string | null
          tracking_number: string | null
          tracking_url: string | null
          updated_at: string
          wns_pedido_id: string | null
        }
        Insert: {
          cancelled_at?: string | null
          created_at?: string
          created_at_shopify: string
          discount_amount?: number
          financial_status: string
          fulfilled_at?: string | null
          fulfillment_status?: string | null
          importacao_id?: string | null
          order_name: string
          paid_at?: string | null
          payment_method?: string | null
          payment_method_raw?: string | null
          payment_reference?: string | null
          refunded_amount?: number
          shipping_city?: string | null
          shipping_cost?: number
          shipping_method?: string | null
          shipping_province?: string | null
          shipping_zip?: string | null
          shopify_id: string
          subtotal?: number
          total?: number
          tracking_company?: string | null
          tracking_number?: string | null
          tracking_url?: string | null
          updated_at?: string
          wns_pedido_id?: string | null
        }
        Update: {
          cancelled_at?: string | null
          created_at?: string
          created_at_shopify?: string
          discount_amount?: number
          financial_status?: string
          fulfilled_at?: string | null
          fulfillment_status?: string | null
          importacao_id?: string | null
          order_name?: string
          paid_at?: string | null
          payment_method?: string | null
          payment_method_raw?: string | null
          payment_reference?: string | null
          refunded_amount?: number
          shipping_city?: string | null
          shipping_cost?: number
          shipping_method?: string | null
          shipping_province?: string | null
          shipping_zip?: string | null
          shopify_id?: string
          subtotal?: number
          total?: number
          tracking_company?: string | null
          tracking_number?: string | null
          tracking_url?: string | null
          updated_at?: string
          wns_pedido_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "shopify_pedidos_importacao_id_fkey"
            columns: ["importacao_id"]
            isOneToOne: false
            referencedRelation: "shopify_importacoes"
            referencedColumns: ["id"]
          },
        ]
      }
      shopify_produtos: {
        Row: {
          admin_graphql_api_id: string | null
          body_html: string | null
          category: Json | null
          created_at: string
          created_at_shopify: string | null
          handle: string | null
          has_variants_that_requires_components: boolean | null
          image: Json | null
          images: Json | null
          media: Json | null
          options: Json | null
          product_type: string | null
          published_at: string | null
          published_scope: string | null
          shopify_id: string
          status: string | null
          tags: Json | null
          template_suffix: string | null
          title: string | null
          updated_at: string
          updated_at_shopify: string | null
          variant_gids: Json | null
          variants: Json | null
          vendor: string | null
        }
        Insert: {
          admin_graphql_api_id?: string | null
          body_html?: string | null
          category?: Json | null
          created_at?: string
          created_at_shopify?: string | null
          handle?: string | null
          has_variants_that_requires_components?: boolean | null
          image?: Json | null
          images?: Json | null
          media?: Json | null
          options?: Json | null
          product_type?: string | null
          published_at?: string | null
          published_scope?: string | null
          shopify_id: string
          status?: string | null
          tags?: Json | null
          template_suffix?: string | null
          title?: string | null
          updated_at?: string
          updated_at_shopify?: string | null
          variant_gids?: Json | null
          variants?: Json | null
          vendor?: string | null
        }
        Update: {
          admin_graphql_api_id?: string | null
          body_html?: string | null
          category?: Json | null
          created_at?: string
          created_at_shopify?: string | null
          handle?: string | null
          has_variants_that_requires_components?: boolean | null
          image?: Json | null
          images?: Json | null
          media?: Json | null
          options?: Json | null
          product_type?: string | null
          published_at?: string | null
          published_scope?: string | null
          shopify_id?: string
          status?: string | null
          tags?: Json | null
          template_suffix?: string | null
          title?: string | null
          updated_at?: string
          updated_at_shopify?: string | null
          variant_gids?: Json | null
          variants?: Json | null
          vendor?: string | null
        }
        Relationships: []
      }
      shopify_reembolsos: {
        Row: {
          additional_fees: Json | null
          admin_graphql_api_id: string | null
          created_at: string
          created_at_shopify: string | null
          duties: Json | null
          note: string | null
          order_adjustments: Json | null
          order_id: string | null
          processed_at: string | null
          refund_line_items: Json | null
          refund_shipping_lines: Json | null
          restock: boolean | null
          return: Json | null
          shopify_id: string
          total_additional_fees_set: Json | null
          total_duties_set: Json | null
          transactions: Json | null
          updated_at: string
          user_id: string | null
        }
        Insert: {
          additional_fees?: Json | null
          admin_graphql_api_id?: string | null
          created_at?: string
          created_at_shopify?: string | null
          duties?: Json | null
          note?: string | null
          order_adjustments?: Json | null
          order_id?: string | null
          processed_at?: string | null
          refund_line_items?: Json | null
          refund_shipping_lines?: Json | null
          restock?: boolean | null
          return?: Json | null
          shopify_id: string
          total_additional_fees_set?: Json | null
          total_duties_set?: Json | null
          transactions?: Json | null
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          additional_fees?: Json | null
          admin_graphql_api_id?: string | null
          created_at?: string
          created_at_shopify?: string | null
          duties?: Json | null
          note?: string | null
          order_adjustments?: Json | null
          order_id?: string | null
          processed_at?: string | null
          refund_line_items?: Json | null
          refund_shipping_lines?: Json | null
          restock?: boolean | null
          return?: Json | null
          shopify_id?: string
          total_additional_fees_set?: Json | null
          total_duties_set?: Json | null
          transactions?: Json | null
          updated_at?: string
          user_id?: string | null
        }
        Relationships: []
      }
      shopify_webhook_log: {
        Row: {
          detalhe: Json | null
          em: string
          etapa: string
          id: number
          shopify_id: string | null
          topic: string | null
        }
        Insert: {
          detalhe?: Json | null
          em?: string
          etapa: string
          id?: never
          shopify_id?: string | null
          topic?: string | null
        }
        Update: {
          detalhe?: Json | null
          em?: string
          etapa?: string
          id?: never
          shopify_id?: string | null
          topic?: string | null
        }
        Relationships: []
      }
      sistema_reportes: {
        Row: {
          atribuido_a: string | null
          descricao: string
          id: string
          imagem_url: string | null
          passos_reproduzir: string | null
          prioridade: string | null
          reportado_em: string
          reportado_por: string | null
          resolvido_em: string | null
          resposta_admin: string | null
          rota: string
          status_valor: string
          tipo_valor: string
          titulo_tela: string | null
          updated_at: string
          user_agent: string | null
          viewport_width: number | null
        }
        Insert: {
          atribuido_a?: string | null
          descricao: string
          id?: string
          imagem_url?: string | null
          passos_reproduzir?: string | null
          prioridade?: string | null
          reportado_em?: string
          reportado_por?: string | null
          resolvido_em?: string | null
          resposta_admin?: string | null
          rota: string
          status_valor?: string
          tipo_valor: string
          titulo_tela?: string | null
          updated_at?: string
          user_agent?: string | null
          viewport_width?: number | null
        }
        Update: {
          atribuido_a?: string | null
          descricao?: string
          id?: string
          imagem_url?: string | null
          passos_reproduzir?: string | null
          prioridade?: string | null
          reportado_em?: string
          reportado_por?: string | null
          resolvido_em?: string | null
          resposta_admin?: string | null
          rota?: string
          status_valor?: string
          tipo_valor?: string
          titulo_tela?: string | null
          updated_at?: string
          user_agent?: string | null
          viewport_width?: number | null
        }
        Relationships: []
      }
      skills_catalogo: {
        Row: {
          area: string
          ativo: boolean | null
          created_at: string | null
          criado_por: string | null
          id: string
          nivel: string
          skill: string
          tipo: string
        }
        Insert: {
          area: string
          ativo?: boolean | null
          created_at?: string | null
          criado_por?: string | null
          id?: string
          nivel?: string
          skill: string
          tipo?: string
        }
        Update: {
          area?: string
          ativo?: boolean | null
          created_at?: string | null
          criado_por?: string | null
          id?: string
          nivel?: string
          skill?: string
          tipo?: string
        }
        Relationships: []
      }
      sla_fase_pedido: {
        Row: {
          ativo: boolean
          dias_uteis: boolean | null
          estagio: string
          fonte_externa: string | null
          observacao: string | null
          ordem: number
          sla_dias: number | null
          tipo_sla: string
          updated_at: string
        }
        Insert: {
          ativo?: boolean
          dias_uteis?: boolean | null
          estagio: string
          fonte_externa?: string | null
          observacao?: string | null
          ordem: number
          sla_dias?: number | null
          tipo_sla: string
          updated_at?: string
        }
        Update: {
          ativo?: boolean
          dias_uteis?: boolean | null
          estagio?: string
          fonte_externa?: string | null
          observacao?: string | null
          ordem?: number
          sla_dias?: number | null
          tipo_sla?: string
          updated_at?: string
        }
        Relationships: []
      }
      sncf_documentacao: {
        Row: {
          ativo: boolean
          autor_nome: string | null
          autor_user_id: string | null
          categoria: string | null
          conteudo: string
          created_at: string
          descricao: string | null
          editado_por: string | null
          editado_por_nome: string | null
          fala_fetely_conhecimento_id: string | null
          id: string
          ordem: number
          slug: string
          sync_fala_fetely: boolean | null
          tags: string[] | null
          tipo: string
          titulo: string
          updated_at: string
          versao: number
        }
        Insert: {
          ativo?: boolean
          autor_nome?: string | null
          autor_user_id?: string | null
          categoria?: string | null
          conteudo: string
          created_at?: string
          descricao?: string | null
          editado_por?: string | null
          editado_por_nome?: string | null
          fala_fetely_conhecimento_id?: string | null
          id?: string
          ordem?: number
          slug: string
          sync_fala_fetely?: boolean | null
          tags?: string[] | null
          tipo: string
          titulo: string
          updated_at?: string
          versao?: number
        }
        Update: {
          ativo?: boolean
          autor_nome?: string | null
          autor_user_id?: string | null
          categoria?: string | null
          conteudo?: string
          created_at?: string
          descricao?: string | null
          editado_por?: string | null
          editado_por_nome?: string | null
          fala_fetely_conhecimento_id?: string | null
          id?: string
          ordem?: number
          slug?: string
          sync_fala_fetely?: boolean | null
          tags?: string[] | null
          tipo?: string
          titulo?: string
          updated_at?: string
          versao?: number
        }
        Relationships: []
      }
      sncf_documentacao_versoes: {
        Row: {
          conteudo: string
          created_at: string
          documento_id: string
          editado_por: string | null
          editado_por_nome: string | null
          id: string
          observacao_mudanca: string | null
          titulo: string
          versao: number
        }
        Insert: {
          conteudo: string
          created_at?: string
          documento_id: string
          editado_por?: string | null
          editado_por_nome?: string | null
          id?: string
          observacao_mudanca?: string | null
          titulo: string
          versao: number
        }
        Update: {
          conteudo?: string
          created_at?: string
          documento_id?: string
          editado_por?: string | null
          editado_por_nome?: string | null
          id?: string
          observacao_mudanca?: string | null
          titulo?: string
          versao?: number
        }
        Relationships: [
          {
            foreignKeyName: "sncf_documentacao_versoes_documento_id_fkey"
            columns: ["documento_id"]
            isOneToOne: false
            referencedRelation: "sncf_documentacao"
            referencedColumns: ["id"]
          },
        ]
      }
      sncf_processos_categorias: {
        Row: {
          ativo: boolean
          cor: string | null
          created_at: string
          criado_por: string | null
          descricao: string | null
          icone: string | null
          id: string
          modulo_origem: string
          natureza: string
          nome: string
          ordem: number
          slug: string
          updated_at: string
        }
        Insert: {
          ativo?: boolean
          cor?: string | null
          created_at?: string
          criado_por?: string | null
          descricao?: string | null
          icone?: string | null
          id?: string
          modulo_origem?: string
          natureza?: string
          nome: string
          ordem?: number
          slug: string
          updated_at?: string
        }
        Update: {
          ativo?: boolean
          cor?: string | null
          created_at?: string
          criado_por?: string | null
          descricao?: string | null
          icone?: string | null
          id?: string
          modulo_origem?: string
          natureza?: string
          nome?: string
          ordem?: number
          slug?: string
          updated_at?: string
        }
        Relationships: []
      }
      sncf_produtos: {
        Row: {
          altura_cm: number | null
          ativo: boolean
          atualizado_em: string
          cest: string | null
          colecao: string | null
          cor_nome: string | null
          descricao_produto: string | null
          ean: string | null
          grupo: string | null
          largura_cm: number | null
          linha: string | null
          marca: string | null
          material: string | null
          material_descritivo: string | null
          multiplos: number
          ncm: string | null
          nome_comercial: string
          nome_completo: string | null
          origem_fisc: string | null
          origem_prod: string | null
          peso_g: number
          preco_atacado: number
          preco_custo: number | null
          profundidade_cm: number | null
          sku: string
          tamanho_numero: string | null
          tipo: string | null
          tipo_embalagem: string | null
        }
        Insert: {
          altura_cm?: number | null
          ativo?: boolean
          atualizado_em?: string
          cest?: string | null
          colecao?: string | null
          cor_nome?: string | null
          descricao_produto?: string | null
          ean?: string | null
          grupo?: string | null
          largura_cm?: number | null
          linha?: string | null
          marca?: string | null
          material?: string | null
          material_descritivo?: string | null
          multiplos?: number
          ncm?: string | null
          nome_comercial: string
          nome_completo?: string | null
          origem_fisc?: string | null
          origem_prod?: string | null
          peso_g?: number
          preco_atacado?: number
          preco_custo?: number | null
          profundidade_cm?: number | null
          sku: string
          tamanho_numero?: string | null
          tipo?: string | null
          tipo_embalagem?: string | null
        }
        Update: {
          altura_cm?: number | null
          ativo?: boolean
          atualizado_em?: string
          cest?: string | null
          colecao?: string | null
          cor_nome?: string | null
          descricao_produto?: string | null
          ean?: string | null
          grupo?: string | null
          largura_cm?: number | null
          linha?: string | null
          marca?: string | null
          material?: string | null
          material_descritivo?: string | null
          multiplos?: number
          ncm?: string | null
          nome_comercial?: string
          nome_completo?: string | null
          origem_fisc?: string | null
          origem_prod?: string | null
          peso_g?: number
          preco_atacado?: number
          preco_custo?: number | null
          profundidade_cm?: number | null
          sku?: string
          tamanho_numero?: string | null
          tipo?: string | null
          tipo_embalagem?: string | null
        }
        Relationships: []
      }
      sncf_rotas_config: {
        Row: {
          ordem: number
          prefixo: string
          status: string
          tela_slug: string | null
          updated_at: string
        }
        Insert: {
          ordem?: number
          prefixo: string
          status?: string
          tela_slug?: string | null
          updated_at?: string
        }
        Update: {
          ordem?: number
          prefixo?: string
          status?: string
          tela_slug?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      sncf_sistemas: {
        Row: {
          ativo: boolean
          cor: string | null
          created_at: string
          descricao: string | null
          icone: string | null
          id: string
          nome: string
          ordem: number
          rota_base: string
          slug: string
        }
        Insert: {
          ativo?: boolean
          cor?: string | null
          created_at?: string
          descricao?: string | null
          icone?: string | null
          id?: string
          nome: string
          ordem?: number
          rota_base: string
          slug: string
        }
        Update: {
          ativo?: boolean
          cor?: string | null
          created_at?: string
          descricao?: string | null
          icone?: string | null
          id?: string
          nome?: string
          ordem?: number
          rota_base?: string
          slug?: string
        }
        Relationships: []
      }
      sncf_tarefas: {
        Row: {
          accountable_role: string | null
          accountable_user_id: string | null
          area_destino: string | null
          bloqueante: boolean | null
          colaborador_id: string | null
          colaborador_nome: string | null
          colaborador_tipo: string | null
          concluida_em: string | null
          concluida_por: string | null
          created_at: string
          criado_por: string | null
          delegado_de_user_id: string | null
          delegado_em: string | null
          delegado_por_user_id: string | null
          descricao: string | null
          evidencia_texto: string | null
          evidencia_url: string | null
          id: string
          informar_user_ids: string[] | null
          iniciada_em: string | null
          link_acao: string | null
          motivo_bloqueio: string | null
          origem_extensao_id: string | null
          prazo_data: string | null
          prazo_dias: number | null
          prioridade: string
          processo_id: string | null
          processo_tipo: string | null
          responsavel_role: string | null
          responsavel_user_id: string | null
          sistema_origem: string
          status: string
          tipo_processo: string
          titulo: string
          updated_at: string
        }
        Insert: {
          accountable_role?: string | null
          accountable_user_id?: string | null
          area_destino?: string | null
          bloqueante?: boolean | null
          colaborador_id?: string | null
          colaborador_nome?: string | null
          colaborador_tipo?: string | null
          concluida_em?: string | null
          concluida_por?: string | null
          created_at?: string
          criado_por?: string | null
          delegado_de_user_id?: string | null
          delegado_em?: string | null
          delegado_por_user_id?: string | null
          descricao?: string | null
          evidencia_texto?: string | null
          evidencia_url?: string | null
          id?: string
          informar_user_ids?: string[] | null
          iniciada_em?: string | null
          link_acao?: string | null
          motivo_bloqueio?: string | null
          origem_extensao_id?: string | null
          prazo_data?: string | null
          prazo_dias?: number | null
          prioridade?: string
          processo_id?: string | null
          processo_tipo?: string | null
          responsavel_role?: string | null
          responsavel_user_id?: string | null
          sistema_origem?: string
          status?: string
          tipo_processo?: string
          titulo: string
          updated_at?: string
        }
        Update: {
          accountable_role?: string | null
          accountable_user_id?: string | null
          area_destino?: string | null
          bloqueante?: boolean | null
          colaborador_id?: string | null
          colaborador_nome?: string | null
          colaborador_tipo?: string | null
          concluida_em?: string | null
          concluida_por?: string | null
          created_at?: string
          criado_por?: string | null
          delegado_de_user_id?: string | null
          delegado_em?: string | null
          delegado_por_user_id?: string | null
          descricao?: string | null
          evidencia_texto?: string | null
          evidencia_url?: string | null
          id?: string
          informar_user_ids?: string[] | null
          iniciada_em?: string | null
          link_acao?: string | null
          motivo_bloqueio?: string | null
          origem_extensao_id?: string | null
          prazo_data?: string | null
          prazo_dias?: number | null
          prioridade?: string
          processo_id?: string | null
          processo_tipo?: string | null
          responsavel_role?: string | null
          responsavel_user_id?: string | null
          sistema_origem?: string
          status?: string
          tipo_processo?: string
          titulo?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "sncf_tarefas_origem_extensao_id_fkey"
            columns: ["origem_extensao_id"]
            isOneToOne: false
            referencedRelation: "sncf_template_extensoes"
            referencedColumns: ["id"]
          },
        ]
      }
      sncf_tarefas_historico: {
        Row: {
          created_at: string
          dados_extras: Json | null
          descricao: string
          id: string
          status_anterior: string | null
          status_novo: string | null
          tarefa_id: string
          tipo: string
          user_id: string
          user_nome: string
        }
        Insert: {
          created_at?: string
          dados_extras?: Json | null
          descricao: string
          id?: string
          status_anterior?: string | null
          status_novo?: string | null
          tarefa_id: string
          tipo: string
          user_id: string
          user_nome: string
        }
        Update: {
          created_at?: string
          dados_extras?: Json | null
          descricao?: string
          id?: string
          status_anterior?: string | null
          status_novo?: string | null
          tarefa_id?: string
          tipo?: string
          user_id?: string
          user_nome?: string
        }
        Relationships: [
          {
            foreignKeyName: "sncf_tarefas_historico_tarefa_id_fkey"
            columns: ["tarefa_id"]
            isOneToOne: false
            referencedRelation: "onboarding_tarefas_view"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sncf_tarefas_historico_tarefa_id_fkey"
            columns: ["tarefa_id"]
            isOneToOne: false
            referencedRelation: "sncf_tarefas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sncf_tarefas_historico_tarefa_id_fkey"
            columns: ["tarefa_id"]
            isOneToOne: false
            referencedRelation: "tarefas_emissao_nf_pendentes"
            referencedColumns: ["tarefa_id"]
          },
        ]
      }
      sncf_template_extensoes: {
        Row: {
          ativo: boolean
          categoria_id: string
          created_at: string
          criado_por: string | null
          descricao: string | null
          dimensao: string
          id: string
          nome: string
          referencia_id: string | null
          referencia_label: string
          updated_at: string
        }
        Insert: {
          ativo?: boolean
          categoria_id: string
          created_at?: string
          criado_por?: string | null
          descricao?: string | null
          dimensao: string
          id?: string
          nome: string
          referencia_id?: string | null
          referencia_label: string
          updated_at?: string
        }
        Update: {
          ativo?: boolean
          categoria_id?: string
          created_at?: string
          criado_por?: string | null
          descricao?: string | null
          dimensao?: string
          id?: string
          nome?: string
          referencia_id?: string | null
          referencia_label?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "sncf_template_extensoes_categoria_id_fkey"
            columns: ["categoria_id"]
            isOneToOne: false
            referencedRelation: "sncf_processos_categorias"
            referencedColumns: ["id"]
          },
        ]
      }
      sncf_template_extensoes_tarefas: {
        Row: {
          accountable_role: string | null
          area_destino: string | null
          bloqueante: boolean | null
          created_at: string
          descricao: string | null
          extensao_id: string
          id: string
          link_acao: string | null
          motivo_bloqueio: string | null
          ordem: number
          prazo_dias: number
          prioridade: string | null
          responsavel_role: string | null
          sistema_origem: string | null
          titulo: string
        }
        Insert: {
          accountable_role?: string | null
          area_destino?: string | null
          bloqueante?: boolean | null
          created_at?: string
          descricao?: string | null
          extensao_id: string
          id?: string
          link_acao?: string | null
          motivo_bloqueio?: string | null
          ordem?: number
          prazo_dias?: number
          prioridade?: string | null
          responsavel_role?: string | null
          sistema_origem?: string | null
          titulo: string
        }
        Update: {
          accountable_role?: string | null
          area_destino?: string | null
          bloqueante?: boolean | null
          created_at?: string
          descricao?: string | null
          extensao_id?: string
          id?: string
          link_acao?: string | null
          motivo_bloqueio?: string | null
          ordem?: number
          prazo_dias?: number
          prioridade?: string | null
          responsavel_role?: string | null
          sistema_origem?: string | null
          titulo?: string
        }
        Relationships: [
          {
            foreignKeyName: "sncf_template_extensoes_tarefas_extensao_id_fkey"
            columns: ["extensao_id"]
            isOneToOne: false
            referencedRelation: "sncf_template_extensoes"
            referencedColumns: ["id"]
          },
        ]
      }
      sncf_templates_processos: {
        Row: {
          ativo: boolean
          categoria_id: string | null
          created_at: string
          descricao: string | null
          id: string
          nome: string
          processos_id: string | null
          tipo_colaborador: string | null
          tipo_processo: string
          updated_at: string
        }
        Insert: {
          ativo?: boolean
          categoria_id?: string | null
          created_at?: string
          descricao?: string | null
          id?: string
          nome: string
          processos_id?: string | null
          tipo_colaborador?: string | null
          tipo_processo: string
          updated_at?: string
        }
        Update: {
          ativo?: boolean
          categoria_id?: string | null
          created_at?: string
          descricao?: string | null
          id?: string
          nome?: string
          processos_id?: string | null
          tipo_colaborador?: string | null
          tipo_processo?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "sncf_templates_processos_categoria_id_fkey"
            columns: ["categoria_id"]
            isOneToOne: false
            referencedRelation: "sncf_processos_categorias"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sncf_templates_processos_processos_id_fkey"
            columns: ["processos_id"]
            isOneToOne: false
            referencedRelation: "processos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sncf_templates_processos_processos_id_fkey"
            columns: ["processos_id"]
            isOneToOne: false
            referencedRelation: "processos_unificados"
            referencedColumns: ["id"]
          },
        ]
      }
      sncf_templates_tarefas: {
        Row: {
          accountable_role: string | null
          area_destino: string | null
          bloqueante: boolean | null
          chave_jsonb: string | null
          condicao_aplicacao: string | null
          created_at: string
          descricao: string | null
          id: string
          motivo_bloqueio: string | null
          ordem: number
          prazo_dias: number
          prioridade: string | null
          responsavel_role: string | null
          sistema_origem: string | null
          somente_clt: boolean
          template_id: string
          titulo: string
        }
        Insert: {
          accountable_role?: string | null
          area_destino?: string | null
          bloqueante?: boolean | null
          chave_jsonb?: string | null
          condicao_aplicacao?: string | null
          created_at?: string
          descricao?: string | null
          id?: string
          motivo_bloqueio?: string | null
          ordem?: number
          prazo_dias?: number
          prioridade?: string | null
          responsavel_role?: string | null
          sistema_origem?: string | null
          somente_clt?: boolean
          template_id: string
          titulo: string
        }
        Update: {
          accountable_role?: string | null
          area_destino?: string | null
          bloqueante?: boolean | null
          chave_jsonb?: string | null
          condicao_aplicacao?: string | null
          created_at?: string
          descricao?: string | null
          id?: string
          motivo_bloqueio?: string | null
          ordem?: number
          prazo_dias?: number
          prioridade?: string | null
          responsavel_role?: string | null
          sistema_origem?: string | null
          somente_clt?: boolean
          template_id?: string
          titulo?: string
        }
        Relationships: [
          {
            foreignKeyName: "sncf_templates_tarefas_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "sncf_templates_processos"
            referencedColumns: ["id"]
          },
        ]
      }
      sncf_user_systems: {
        Row: {
          ativo: boolean
          concedido_em: string
          concedido_por: string | null
          id: string
          role_no_sistema: string
          sistema_id: string
          user_id: string
        }
        Insert: {
          ativo?: boolean
          concedido_em?: string
          concedido_por?: string | null
          id?: string
          role_no_sistema?: string
          sistema_id: string
          user_id: string
        }
        Update: {
          ativo?: boolean
          concedido_em?: string
          concedido_por?: string | null
          id?: string
          role_no_sistema?: string
          sistema_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "sncf_user_systems_sistema_id_fkey"
            columns: ["sistema_id"]
            isOneToOne: false
            referencedRelation: "sncf_sistemas"
            referencedColumns: ["id"]
          },
        ]
      }
      socios_parceiro: {
        Row: {
          cpf_cnpj: string
          criado_em: string
          data_entrada: string | null
          desligado_em: string | null
          fonte: string
          id: string
          nacionalidade: string | null
          nome: string
          parceiro_id: string
          participacao_pct: number | null
          qualificacao: string | null
          ultima_atualizacao: string
        }
        Insert: {
          cpf_cnpj: string
          criado_em?: string
          data_entrada?: string | null
          desligado_em?: string | null
          fonte?: string
          id?: string
          nacionalidade?: string | null
          nome: string
          parceiro_id: string
          participacao_pct?: number | null
          qualificacao?: string | null
          ultima_atualizacao?: string
        }
        Update: {
          cpf_cnpj?: string
          criado_em?: string
          data_entrada?: string | null
          desligado_em?: string | null
          fonte?: string
          id?: string
          nacionalidade?: string | null
          nome?: string
          parceiro_id?: string
          participacao_pct?: number | null
          qualificacao?: string | null
          ultima_atualizacao?: string
        }
        Relationships: [
          {
            foreignKeyName: "socios_parceiro_parceiro_id_fkey"
            columns: ["parceiro_id"]
            isOneToOne: false
            referencedRelation: "parceiros_comerciais"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "socios_parceiro_parceiro_id_fkey"
            columns: ["parceiro_id"]
            isOneToOne: false
            referencedRelation: "v_credito_resumo_financeiro"
            referencedColumns: ["parceiro_id"]
          },
          {
            foreignKeyName: "socios_parceiro_parceiro_id_fkey"
            columns: ["parceiro_id"]
            isOneToOne: false
            referencedRelation: "vw_logistica_agregado"
            referencedColumns: ["transportadora_id"]
          },
          {
            foreignKeyName: "socios_parceiro_parceiro_id_fkey"
            columns: ["parceiro_id"]
            isOneToOne: false
            referencedRelation: "vw_recebivel_por_conta"
            referencedColumns: ["conta_id"]
          },
        ]
      }
      suppressed_emails: {
        Row: {
          created_at: string
          email: string
          id: string
          metadata: Json | null
          reason: string
        }
        Insert: {
          created_at?: string
          email: string
          id?: string
          metadata?: Json | null
          reason: string
        }
        Update: {
          created_at?: string
          email?: string
          id?: string
          metadata?: Json | null
          reason?: string
        }
        Relationships: []
      }
      temas_investimento: {
        Row: {
          ativa: boolean
          codigo: string
          created_at: string
          descricao: string | null
          frente_id: string
          id: string
          nome: string
          ordem: number
          updated_at: string
        }
        Insert: {
          ativa?: boolean
          codigo: string
          created_at?: string
          descricao?: string | null
          frente_id: string
          id?: string
          nome: string
          ordem?: number
          updated_at?: string
        }
        Update: {
          ativa?: boolean
          codigo?: string
          created_at?: string
          descricao?: string | null
          frente_id?: string
          id?: string
          nome?: string
          ordem?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "temas_investimento_frente_id_fkey"
            columns: ["frente_id"]
            isOneToOne: false
            referencedRelation: "frentes_investimento"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "temas_investimento_frente_id_fkey"
            columns: ["frente_id"]
            isOneToOne: false
            referencedRelation: "vw_frentes_investimento_kpis"
            referencedColumns: ["frente_id"]
          },
        ]
      }
      testes_tecnicos: {
        Row: {
          avaliado_em: string | null
          avaliado_por: string | null
          candidato_id: string
          created_at: string | null
          desafio_contexto: string | null
          desafio_criterios: string | null
          desafio_descricao: string | null
          desafio_entregaveis: string | null
          entregue_em: string | null
          enviado_em: string | null
          enviado_por: string | null
          id: string
          link_entrega: string | null
          nota: number | null
          notificacao_rh_enviada: boolean | null
          pontos_avaliados: string | null
          prazo_entrega: string | null
          resultado: string | null
          skills_a_validar: Json | null
          skills_validadas: Json | null
          updated_at: string | null
          vaga_id: string
        }
        Insert: {
          avaliado_em?: string | null
          avaliado_por?: string | null
          candidato_id: string
          created_at?: string | null
          desafio_contexto?: string | null
          desafio_criterios?: string | null
          desafio_descricao?: string | null
          desafio_entregaveis?: string | null
          entregue_em?: string | null
          enviado_em?: string | null
          enviado_por?: string | null
          id?: string
          link_entrega?: string | null
          nota?: number | null
          notificacao_rh_enviada?: boolean | null
          pontos_avaliados?: string | null
          prazo_entrega?: string | null
          resultado?: string | null
          skills_a_validar?: Json | null
          skills_validadas?: Json | null
          updated_at?: string | null
          vaga_id: string
        }
        Update: {
          avaliado_em?: string | null
          avaliado_por?: string | null
          candidato_id?: string
          created_at?: string | null
          desafio_contexto?: string | null
          desafio_criterios?: string | null
          desafio_descricao?: string | null
          desafio_entregaveis?: string | null
          entregue_em?: string | null
          enviado_em?: string | null
          enviado_por?: string | null
          id?: string
          link_entrega?: string | null
          nota?: number | null
          notificacao_rh_enviada?: boolean | null
          pontos_avaliados?: string | null
          prazo_entrega?: string | null
          resultado?: string | null
          skills_a_validar?: Json | null
          skills_validadas?: Json | null
          updated_at?: string | null
          vaga_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "testes_tecnicos_candidato_id_fkey"
            columns: ["candidato_id"]
            isOneToOne: false
            referencedRelation: "candidatos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "testes_tecnicos_vaga_id_fkey"
            columns: ["vaga_id"]
            isOneToOne: false
            referencedRelation: "vagas"
            referencedColumns: ["id"]
          },
        ]
      }
      ti_ativos: {
        Row: {
          atribuido_em: string | null
          colaborador_id: string | null
          colaborador_nome: string | null
          colaborador_tipo: string | null
          condicao: string | null
          created_at: string
          created_by: string | null
          data_compra: string | null
          devolvido_em: string | null
          em_manutencao: boolean | null
          especificacoes: Json | null
          estado: string
          fornecedor: string | null
          fotos: string[] | null
          garantia_ate: string | null
          hostname: string | null
          id: string
          localizacao: string | null
          marca: string | null
          modelo: string | null
          nota_fiscal: string | null
          numero_patrimonio: string | null
          numero_serie: string | null
          observacoes: string | null
          status: string
          tipo: string
          updated_at: string
          valor_atual_mercado: number | null
          valor_compra: number | null
          valor_estimado_em: string | null
        }
        Insert: {
          atribuido_em?: string | null
          colaborador_id?: string | null
          colaborador_nome?: string | null
          colaborador_tipo?: string | null
          condicao?: string | null
          created_at?: string
          created_by?: string | null
          data_compra?: string | null
          devolvido_em?: string | null
          em_manutencao?: boolean | null
          especificacoes?: Json | null
          estado?: string
          fornecedor?: string | null
          fotos?: string[] | null
          garantia_ate?: string | null
          hostname?: string | null
          id?: string
          localizacao?: string | null
          marca?: string | null
          modelo?: string | null
          nota_fiscal?: string | null
          numero_patrimonio?: string | null
          numero_serie?: string | null
          observacoes?: string | null
          status?: string
          tipo: string
          updated_at?: string
          valor_atual_mercado?: number | null
          valor_compra?: number | null
          valor_estimado_em?: string | null
        }
        Update: {
          atribuido_em?: string | null
          colaborador_id?: string | null
          colaborador_nome?: string | null
          colaborador_tipo?: string | null
          condicao?: string | null
          created_at?: string
          created_by?: string | null
          data_compra?: string | null
          devolvido_em?: string | null
          em_manutencao?: boolean | null
          especificacoes?: Json | null
          estado?: string
          fornecedor?: string | null
          fotos?: string[] | null
          garantia_ate?: string | null
          hostname?: string | null
          id?: string
          localizacao?: string | null
          marca?: string | null
          modelo?: string | null
          nota_fiscal?: string | null
          numero_patrimonio?: string | null
          numero_serie?: string | null
          observacoes?: string | null
          status?: string
          tipo?: string
          updated_at?: string
          valor_atual_mercado?: number | null
          valor_compra?: number | null
          valor_estimado_em?: string | null
        }
        Relationships: []
      }
      ti_ativos_historico: {
        Row: {
          acao: string
          ativo_id: string
          created_at: string
          data_fim: string | null
          data_inicio: string | null
          de_colaborador: string | null
          fornecedor: string | null
          garantia_servico_ate: string | null
          id: string
          observacoes: string | null
          para_colaborador: string | null
          responsavel_id: string | null
          status_anterior: string | null
          tipo_manutencao: string | null
          valor: number | null
        }
        Insert: {
          acao: string
          ativo_id: string
          created_at?: string
          data_fim?: string | null
          data_inicio?: string | null
          de_colaborador?: string | null
          fornecedor?: string | null
          garantia_servico_ate?: string | null
          id?: string
          observacoes?: string | null
          para_colaborador?: string | null
          responsavel_id?: string | null
          status_anterior?: string | null
          tipo_manutencao?: string | null
          valor?: number | null
        }
        Update: {
          acao?: string
          ativo_id?: string
          created_at?: string
          data_fim?: string | null
          data_inicio?: string | null
          de_colaborador?: string | null
          fornecedor?: string | null
          garantia_servico_ate?: string | null
          id?: string
          observacoes?: string | null
          para_colaborador?: string | null
          responsavel_id?: string | null
          status_anterior?: string | null
          tipo_manutencao?: string | null
          valor?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "ti_ativos_historico_ativo_id_fkey"
            columns: ["ativo_id"]
            isOneToOne: false
            referencedRelation: "ti_ativos"
            referencedColumns: ["id"]
          },
        ]
      }
      tipos_contrato: {
        Row: {
          ativo: boolean
          codigo: string
          created_at: string | null
          id: string
          nome: string
        }
        Insert: {
          ativo?: boolean
          codigo: string
          created_at?: string | null
          id?: string
          nome: string
        }
        Update: {
          ativo?: boolean
          codigo?: string
          created_at?: string | null
          id?: string
          nome?: string
        }
        Relationships: []
      }
      titulo_a_receber: {
        Row: {
          analise_credito_id: string | null
          autorizacao_cartao: string | null
          banco_recebimento_id: string | null
          boleto_codigo_rejeicao: string | null
          boleto_enviado_em: string | null
          boleto_status: string | null
          chave_pix: string | null
          codigo_barras_boleto: string | null
          condicao_pagamento: string | null
          conta_id: string
          created_at: string
          created_by: string | null
          data_criacao: string
          data_emissao_nf: string | null
          data_liquidacao_prevista: string | null
          data_pagamento: string | null
          data_pagamento_banco: string | null
          data_proxima_acao_regua: string | null
          data_vencimento_atual: string
          data_vencimento_original: string
          eh_entrada: boolean
          email_cobranca_enviado_em: string | null
          flag_bandeira_amarela: boolean
          flag_grupo_economico_inadimplente: boolean
          forma_pagamento_id: string | null
          id: string
          justificativa_renegociacao: string | null
          linha_digitavel: string | null
          link_pagamento: string | null
          modalidade_renegociacao: number | null
          movimentacao_baixa_id: string | null
          nf_id: string | null
          nosso_numero_safra: string | null
          nosso_numero_seq: string | null
          numero_parcela: number
          numero_titulo: string
          pausa_regua_automatica: boolean
          pedido_id: string
          prorrogacao_nova_data: string | null
          prorrogacao_solicitada_em: string | null
          reemissao_aplicada_em: string | null
          reemissao_motivo: string | null
          reemissao_nova_data: string | null
          reemissao_novo_valor: number | null
          remessa_safra_id: string | null
          status: string
          subestado_atraso: string
          tipo_pagamento: string
          titulo_pai_id: string | null
          titulo_renegociado_origem_id: string | null
          total_parcelas: number
          updated_at: string
          valor_atual: number | null
          valor_bruto: number
          valor_correcao: number
          valor_desconto: number
          valor_juros: number
          valor_multa: number
          vip_relacionamento: boolean
        }
        Insert: {
          analise_credito_id?: string | null
          autorizacao_cartao?: string | null
          banco_recebimento_id?: string | null
          boleto_codigo_rejeicao?: string | null
          boleto_enviado_em?: string | null
          boleto_status?: string | null
          chave_pix?: string | null
          codigo_barras_boleto?: string | null
          condicao_pagamento?: string | null
          conta_id: string
          created_at?: string
          created_by?: string | null
          data_criacao?: string
          data_emissao_nf?: string | null
          data_liquidacao_prevista?: string | null
          data_pagamento?: string | null
          data_pagamento_banco?: string | null
          data_proxima_acao_regua?: string | null
          data_vencimento_atual: string
          data_vencimento_original: string
          eh_entrada?: boolean
          email_cobranca_enviado_em?: string | null
          flag_bandeira_amarela?: boolean
          flag_grupo_economico_inadimplente?: boolean
          forma_pagamento_id?: string | null
          id?: string
          justificativa_renegociacao?: string | null
          linha_digitavel?: string | null
          link_pagamento?: string | null
          modalidade_renegociacao?: number | null
          movimentacao_baixa_id?: string | null
          nf_id?: string | null
          nosso_numero_safra?: string | null
          nosso_numero_seq?: string | null
          numero_parcela?: number
          numero_titulo: string
          pausa_regua_automatica?: boolean
          pedido_id: string
          prorrogacao_nova_data?: string | null
          prorrogacao_solicitada_em?: string | null
          reemissao_aplicada_em?: string | null
          reemissao_motivo?: string | null
          reemissao_nova_data?: string | null
          reemissao_novo_valor?: number | null
          remessa_safra_id?: string | null
          status?: string
          subestado_atraso?: string
          tipo_pagamento: string
          titulo_pai_id?: string | null
          titulo_renegociado_origem_id?: string | null
          total_parcelas?: number
          updated_at?: string
          valor_atual?: number | null
          valor_bruto: number
          valor_correcao?: number
          valor_desconto?: number
          valor_juros?: number
          valor_multa?: number
          vip_relacionamento?: boolean
        }
        Update: {
          analise_credito_id?: string | null
          autorizacao_cartao?: string | null
          banco_recebimento_id?: string | null
          boleto_codigo_rejeicao?: string | null
          boleto_enviado_em?: string | null
          boleto_status?: string | null
          chave_pix?: string | null
          codigo_barras_boleto?: string | null
          condicao_pagamento?: string | null
          conta_id?: string
          created_at?: string
          created_by?: string | null
          data_criacao?: string
          data_emissao_nf?: string | null
          data_liquidacao_prevista?: string | null
          data_pagamento?: string | null
          data_pagamento_banco?: string | null
          data_proxima_acao_regua?: string | null
          data_vencimento_atual?: string
          data_vencimento_original?: string
          eh_entrada?: boolean
          email_cobranca_enviado_em?: string | null
          flag_bandeira_amarela?: boolean
          flag_grupo_economico_inadimplente?: boolean
          forma_pagamento_id?: string | null
          id?: string
          justificativa_renegociacao?: string | null
          linha_digitavel?: string | null
          link_pagamento?: string | null
          modalidade_renegociacao?: number | null
          movimentacao_baixa_id?: string | null
          nf_id?: string | null
          nosso_numero_safra?: string | null
          nosso_numero_seq?: string | null
          numero_parcela?: number
          numero_titulo?: string
          pausa_regua_automatica?: boolean
          pedido_id?: string
          prorrogacao_nova_data?: string | null
          prorrogacao_solicitada_em?: string | null
          reemissao_aplicada_em?: string | null
          reemissao_motivo?: string | null
          reemissao_nova_data?: string | null
          reemissao_novo_valor?: number | null
          remessa_safra_id?: string | null
          status?: string
          subestado_atraso?: string
          tipo_pagamento?: string
          titulo_pai_id?: string | null
          titulo_renegociado_origem_id?: string | null
          total_parcelas?: number
          updated_at?: string
          valor_atual?: number | null
          valor_bruto?: number
          valor_correcao?: number
          valor_desconto?: number
          valor_juros?: number
          valor_multa?: number
          vip_relacionamento?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "titulo_a_receber_analise_credito_id_fkey"
            columns: ["analise_credito_id"]
            isOneToOne: false
            referencedRelation: "analises_credito"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "titulo_a_receber_analise_credito_id_fkey"
            columns: ["analise_credito_id"]
            isOneToOne: false
            referencedRelation: "v_pedidos_fila"
            referencedColumns: ["analise_credito_id"]
          },
          {
            foreignKeyName: "titulo_a_receber_banco_recebimento_id_fkey"
            columns: ["banco_recebimento_id"]
            isOneToOne: false
            referencedRelation: "banco_recebimento"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "titulo_a_receber_conta_id_fkey"
            columns: ["conta_id"]
            isOneToOne: false
            referencedRelation: "contas_pagar"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "titulo_a_receber_conta_id_fkey"
            columns: ["conta_id"]
            isOneToOne: false
            referencedRelation: "contas_pagar_receber"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "titulo_a_receber_conta_id_fkey"
            columns: ["conta_id"]
            isOneToOne: false
            referencedRelation: "contas_pagar_receber_ativas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "titulo_a_receber_conta_id_fkey"
            columns: ["conta_id"]
            isOneToOne: false
            referencedRelation: "v_cpr_bola_redonda"
            referencedColumns: ["cpr_id"]
          },
          {
            foreignKeyName: "titulo_a_receber_conta_id_fkey"
            columns: ["conta_id"]
            isOneToOne: false
            referencedRelation: "vw_conciliacao_furos"
            referencedColumns: ["sugestao_cpr_id"]
          },
          {
            foreignKeyName: "titulo_a_receber_conta_id_fkey"
            columns: ["conta_id"]
            isOneToOne: false
            referencedRelation: "vw_contas_pagar_consolidado"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "titulo_a_receber_conta_id_fkey"
            columns: ["conta_id"]
            isOneToOne: false
            referencedRelation: "vw_despesas_match_sugestoes"
            referencedColumns: ["cpr_id"]
          },
          {
            foreignKeyName: "titulo_a_receber_conta_id_fkey"
            columns: ["conta_id"]
            isOneToOne: false
            referencedRelation: "vw_documentos_envio_estados"
            referencedColumns: ["conta_id"]
          },
          {
            foreignKeyName: "titulo_a_receber_conta_id_fkey"
            columns: ["conta_id"]
            isOneToOne: false
            referencedRelation: "vw_pj_pagamentos"
            referencedColumns: ["cpr_id"]
          },
          {
            foreignKeyName: "titulo_a_receber_forma_pagamento_id_fkey"
            columns: ["forma_pagamento_id"]
            isOneToOne: false
            referencedRelation: "formas_pagamento"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "titulo_a_receber_movimentacao_baixa_id_fkey"
            columns: ["movimentacao_baixa_id"]
            isOneToOne: false
            referencedRelation: "movimentacoes_bancarias"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "titulo_a_receber_movimentacao_baixa_id_fkey"
            columns: ["movimentacao_baixa_id"]
            isOneToOne: false
            referencedRelation: "vw_conciliacao_cartao_sugestoes"
            referencedColumns: ["ofx_id"]
          },
          {
            foreignKeyName: "titulo_a_receber_movimentacao_baixa_id_fkey"
            columns: ["movimentacao_baixa_id"]
            isOneToOne: false
            referencedRelation: "vw_conciliacao_furos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "titulo_a_receber_movimentacao_baixa_id_fkey"
            columns: ["movimentacao_baixa_id"]
            isOneToOne: false
            referencedRelation: "vw_despesas_match_nf_sugestoes"
            referencedColumns: ["mov_id"]
          },
          {
            foreignKeyName: "titulo_a_receber_movimentacao_baixa_id_fkey"
            columns: ["movimentacao_baixa_id"]
            isOneToOne: false
            referencedRelation: "vw_despesas_match_sugestoes"
            referencedColumns: ["mov_id"]
          },
          {
            foreignKeyName: "titulo_a_receber_movimentacao_baixa_id_fkey"
            columns: ["movimentacao_baixa_id"]
            isOneToOne: false
            referencedRelation: "vw_pares_transferencia_sugeridos"
            referencedColumns: ["credito_id"]
          },
          {
            foreignKeyName: "titulo_a_receber_movimentacao_baixa_id_fkey"
            columns: ["movimentacao_baixa_id"]
            isOneToOne: false
            referencedRelation: "vw_pares_transferencia_sugeridos"
            referencedColumns: ["debito_id"]
          },
          {
            foreignKeyName: "titulo_a_receber_movimentacao_baixa_id_fkey"
            columns: ["movimentacao_baixa_id"]
            isOneToOne: false
            referencedRelation: "vw_recebivel_b2c_pedido"
            referencedColumns: ["movimentacao_id"]
          },
          {
            foreignKeyName: "titulo_a_receber_nf_id_fkey"
            columns: ["nf_id"]
            isOneToOne: false
            referencedRelation: "nfs_emitidas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "titulo_a_receber_nf_id_fkey"
            columns: ["nf_id"]
            isOneToOne: false
            referencedRelation: "vw_nf_pedido_resolvido"
            referencedColumns: ["nf_id"]
          },
          {
            foreignKeyName: "titulo_a_receber_pedido_id_fkey"
            columns: ["pedido_id"]
            isOneToOne: false
            referencedRelation: "pedidos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "titulo_a_receber_pedido_id_fkey"
            columns: ["pedido_id"]
            isOneToOne: false
            referencedRelation: "v_pedidos_fila"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "titulo_a_receber_pedido_id_fkey"
            columns: ["pedido_id"]
            isOneToOne: false
            referencedRelation: "v_pedidos_priorizados"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "titulo_a_receber_pedido_id_fkey"
            columns: ["pedido_id"]
            isOneToOne: false
            referencedRelation: "vw_gestao_pedidos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "titulo_a_receber_pedido_id_fkey"
            columns: ["pedido_id"]
            isOneToOne: false
            referencedRelation: "vw_pedido_base"
            referencedColumns: ["pedido_id"]
          },
          {
            foreignKeyName: "titulo_a_receber_pedido_id_fkey"
            columns: ["pedido_id"]
            isOneToOne: false
            referencedRelation: "vw_pedidos_farol"
            referencedColumns: ["pedido_id"]
          },
          {
            foreignKeyName: "titulo_a_receber_remessa_safra_id_fkey"
            columns: ["remessa_safra_id"]
            isOneToOne: false
            referencedRelation: "remessas_safra"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "titulo_a_receber_titulo_pai_id_fkey"
            columns: ["titulo_pai_id"]
            isOneToOne: false
            referencedRelation: "titulo_a_receber"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "titulo_a_receber_titulo_pai_id_fkey"
            columns: ["titulo_pai_id"]
            isOneToOne: false
            referencedRelation: "vw_previsao_recebimentos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "titulo_a_receber_titulo_pai_id_fkey"
            columns: ["titulo_pai_id"]
            isOneToOne: false
            referencedRelation: "vw_recebivel_b2b"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "titulo_a_receber_titulo_pai_id_fkey"
            columns: ["titulo_pai_id"]
            isOneToOne: false
            referencedRelation: "vw_titulos_cobranca"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "titulo_a_receber_titulo_renegociado_origem_id_fkey"
            columns: ["titulo_renegociado_origem_id"]
            isOneToOne: false
            referencedRelation: "titulo_a_receber"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "titulo_a_receber_titulo_renegociado_origem_id_fkey"
            columns: ["titulo_renegociado_origem_id"]
            isOneToOne: false
            referencedRelation: "vw_previsao_recebimentos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "titulo_a_receber_titulo_renegociado_origem_id_fkey"
            columns: ["titulo_renegociado_origem_id"]
            isOneToOne: false
            referencedRelation: "vw_recebivel_b2b"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "titulo_a_receber_titulo_renegociado_origem_id_fkey"
            columns: ["titulo_renegociado_origem_id"]
            isOneToOne: false
            referencedRelation: "vw_titulos_cobranca"
            referencedColumns: ["id"]
          },
        ]
      }
      titulo_instrumento_log: {
        Row: {
          created_at: string
          data_anterior: string | null
          data_nova: string | null
          detalhe: string | null
          evento: string
          id: string
          nosso_numero_anterior: string | null
          nosso_numero_novo: string | null
          origem: string
          titulo_id: string
        }
        Insert: {
          created_at?: string
          data_anterior?: string | null
          data_nova?: string | null
          detalhe?: string | null
          evento: string
          id?: string
          nosso_numero_anterior?: string | null
          nosso_numero_novo?: string | null
          origem?: string
          titulo_id: string
        }
        Update: {
          created_at?: string
          data_anterior?: string | null
          data_nova?: string | null
          detalhe?: string | null
          evento?: string
          id?: string
          nosso_numero_anterior?: string | null
          nosso_numero_novo?: string | null
          origem?: string
          titulo_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "titulo_instrumento_log_titulo_id_fkey"
            columns: ["titulo_id"]
            isOneToOne: false
            referencedRelation: "titulo_a_receber"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "titulo_instrumento_log_titulo_id_fkey"
            columns: ["titulo_id"]
            isOneToOne: false
            referencedRelation: "vw_previsao_recebimentos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "titulo_instrumento_log_titulo_id_fkey"
            columns: ["titulo_id"]
            isOneToOne: false
            referencedRelation: "vw_recebivel_b2b"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "titulo_instrumento_log_titulo_id_fkey"
            columns: ["titulo_id"]
            isOneToOne: false
            referencedRelation: "vw_titulos_cobranca"
            referencedColumns: ["id"]
          },
        ]
      }
      transp_fretes: {
        Row: {
          ad_valorem: number | null
          adicionais: number | null
          atualizado_em: string
          canal: string
          cte_emissao: string | null
          cte_numero: string
          cte_serie: string | null
          data_frete: string | null
          destinatario: string | null
          destinatario_cidade: string | null
          destinatario_uf: string | null
          di_dta: string | null
          doc_anterior: string | null
          frete_peso: number | null
          frete_total: number | null
          gris: number | null
          hawb: string | null
          id: string
          importado_arquivo: string | null
          importado_em: string
          importado_por: string | null
          itr: number | null
          mawb: string | null
          minuta: string | null
          nf_numero: string | null
          ocorrencia_codigo: string | null
          ocorrencia_data: string | null
          ocorrencia_texto: string | null
          outros_valores: number | null
          pct_frete_nf: number | null
          pedido_id: string | null
          peso_real: number | null
          peso_taxado: number | null
          prazo_entrega: string | null
          rastreio_codigo: string | null
          referencia: string | null
          remetente: string | null
          remetente_cidade: string | null
          remetente_uf: string | null
          sec_cat: number | null
          tde: number | null
          tipo_frete: string | null
          transportadora_id: string
          valor_coleta: number | null
          valor_despacho: number | null
          valor_entrega: number | null
          valor_imposto: number | null
          valor_nf: number | null
          valor_pedagio: number | null
          valor_redespacho: number | null
          volumes: number | null
          wns_pedido_id: number | null
        }
        Insert: {
          ad_valorem?: number | null
          adicionais?: number | null
          atualizado_em?: string
          canal?: string
          cte_emissao?: string | null
          cte_numero: string
          cte_serie?: string | null
          data_frete?: string | null
          destinatario?: string | null
          destinatario_cidade?: string | null
          destinatario_uf?: string | null
          di_dta?: string | null
          doc_anterior?: string | null
          frete_peso?: number | null
          frete_total?: number | null
          gris?: number | null
          hawb?: string | null
          id?: string
          importado_arquivo?: string | null
          importado_em?: string
          importado_por?: string | null
          itr?: number | null
          mawb?: string | null
          minuta?: string | null
          nf_numero?: string | null
          ocorrencia_codigo?: string | null
          ocorrencia_data?: string | null
          ocorrencia_texto?: string | null
          outros_valores?: number | null
          pct_frete_nf?: number | null
          pedido_id?: string | null
          peso_real?: number | null
          peso_taxado?: number | null
          prazo_entrega?: string | null
          rastreio_codigo?: string | null
          referencia?: string | null
          remetente?: string | null
          remetente_cidade?: string | null
          remetente_uf?: string | null
          sec_cat?: number | null
          tde?: number | null
          tipo_frete?: string | null
          transportadora_id: string
          valor_coleta?: number | null
          valor_despacho?: number | null
          valor_entrega?: number | null
          valor_imposto?: number | null
          valor_nf?: number | null
          valor_pedagio?: number | null
          valor_redespacho?: number | null
          volumes?: number | null
          wns_pedido_id?: number | null
        }
        Update: {
          ad_valorem?: number | null
          adicionais?: number | null
          atualizado_em?: string
          canal?: string
          cte_emissao?: string | null
          cte_numero?: string
          cte_serie?: string | null
          data_frete?: string | null
          destinatario?: string | null
          destinatario_cidade?: string | null
          destinatario_uf?: string | null
          di_dta?: string | null
          doc_anterior?: string | null
          frete_peso?: number | null
          frete_total?: number | null
          gris?: number | null
          hawb?: string | null
          id?: string
          importado_arquivo?: string | null
          importado_em?: string
          importado_por?: string | null
          itr?: number | null
          mawb?: string | null
          minuta?: string | null
          nf_numero?: string | null
          ocorrencia_codigo?: string | null
          ocorrencia_data?: string | null
          ocorrencia_texto?: string | null
          outros_valores?: number | null
          pct_frete_nf?: number | null
          pedido_id?: string | null
          peso_real?: number | null
          peso_taxado?: number | null
          prazo_entrega?: string | null
          rastreio_codigo?: string | null
          referencia?: string | null
          remetente?: string | null
          remetente_cidade?: string | null
          remetente_uf?: string | null
          sec_cat?: number | null
          tde?: number | null
          tipo_frete?: string | null
          transportadora_id?: string
          valor_coleta?: number | null
          valor_despacho?: number | null
          valor_entrega?: number | null
          valor_imposto?: number | null
          valor_nf?: number | null
          valor_pedagio?: number | null
          valor_redespacho?: number | null
          volumes?: number | null
          wns_pedido_id?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "transp_fretes_pedido_id_fkey"
            columns: ["pedido_id"]
            isOneToOne: false
            referencedRelation: "pedidos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transp_fretes_pedido_id_fkey"
            columns: ["pedido_id"]
            isOneToOne: false
            referencedRelation: "v_pedidos_fila"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transp_fretes_pedido_id_fkey"
            columns: ["pedido_id"]
            isOneToOne: false
            referencedRelation: "v_pedidos_priorizados"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transp_fretes_pedido_id_fkey"
            columns: ["pedido_id"]
            isOneToOne: false
            referencedRelation: "vw_gestao_pedidos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transp_fretes_pedido_id_fkey"
            columns: ["pedido_id"]
            isOneToOne: false
            referencedRelation: "vw_pedido_base"
            referencedColumns: ["pedido_id"]
          },
          {
            foreignKeyName: "transp_fretes_pedido_id_fkey"
            columns: ["pedido_id"]
            isOneToOne: false
            referencedRelation: "vw_pedidos_farol"
            referencedColumns: ["pedido_id"]
          },
          {
            foreignKeyName: "transp_fretes_transportadora_id_fkey"
            columns: ["transportadora_id"]
            isOneToOne: false
            referencedRelation: "parceiros_comerciais"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transp_fretes_transportadora_id_fkey"
            columns: ["transportadora_id"]
            isOneToOne: false
            referencedRelation: "v_credito_resumo_financeiro"
            referencedColumns: ["parceiro_id"]
          },
          {
            foreignKeyName: "transp_fretes_transportadora_id_fkey"
            columns: ["transportadora_id"]
            isOneToOne: false
            referencedRelation: "vw_logistica_agregado"
            referencedColumns: ["transportadora_id"]
          },
          {
            foreignKeyName: "transp_fretes_transportadora_id_fkey"
            columns: ["transportadora_id"]
            isOneToOne: false
            referencedRelation: "vw_recebivel_por_conta"
            referencedColumns: ["conta_id"]
          },
          {
            foreignKeyName: "transp_fretes_wns_pedido_id_fkey"
            columns: ["wns_pedido_id"]
            isOneToOne: false
            referencedRelation: "vw_gestao_b2c"
            referencedColumns: ["wns_pedidowns"]
          },
          {
            foreignKeyName: "transp_fretes_wns_pedido_id_fkey"
            columns: ["wns_pedido_id"]
            isOneToOne: false
            referencedRelation: "wns_pedidos"
            referencedColumns: ["pedidowns"]
          },
        ]
      }
      transp_ocorrencia_depara: {
        Row: {
          ativo: boolean
          codigo: string
          created_at: string
          id: string
          texto_padrao: string
          transportadora_id: string
        }
        Insert: {
          ativo?: boolean
          codigo: string
          created_at?: string
          id?: string
          texto_padrao: string
          transportadora_id: string
        }
        Update: {
          ativo?: boolean
          codigo?: string
          created_at?: string
          id?: string
          texto_padrao?: string
          transportadora_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "transp_ocorrencia_depara_transportadora_id_fkey"
            columns: ["transportadora_id"]
            isOneToOne: false
            referencedRelation: "parceiros_comerciais"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transp_ocorrencia_depara_transportadora_id_fkey"
            columns: ["transportadora_id"]
            isOneToOne: false
            referencedRelation: "v_credito_resumo_financeiro"
            referencedColumns: ["parceiro_id"]
          },
          {
            foreignKeyName: "transp_ocorrencia_depara_transportadora_id_fkey"
            columns: ["transportadora_id"]
            isOneToOne: false
            referencedRelation: "vw_logistica_agregado"
            referencedColumns: ["transportadora_id"]
          },
          {
            foreignKeyName: "transp_ocorrencia_depara_transportadora_id_fkey"
            columns: ["transportadora_id"]
            isOneToOne: false
            referencedRelation: "vw_recebivel_por_conta"
            referencedColumns: ["conta_id"]
          },
        ]
      }
      transp_ocorrencia_tipo: {
        Row: {
          classe: string
          codigo: string
          criado_em: string
          descricao: string
          eh_problema: boolean
          eh_terminal: boolean
          id: string
          ordem_urgencia: number
          transportadora_id: string | null
        }
        Insert: {
          classe: string
          codigo: string
          criado_em?: string
          descricao: string
          eh_problema?: boolean
          eh_terminal?: boolean
          id?: string
          ordem_urgencia?: number
          transportadora_id?: string | null
        }
        Update: {
          classe?: string
          codigo?: string
          criado_em?: string
          descricao?: string
          eh_problema?: boolean
          eh_terminal?: boolean
          id?: string
          ordem_urgencia?: number
          transportadora_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "transp_ocorrencia_tipo_transportadora_id_fkey"
            columns: ["transportadora_id"]
            isOneToOne: false
            referencedRelation: "parceiros_comerciais"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transp_ocorrencia_tipo_transportadora_id_fkey"
            columns: ["transportadora_id"]
            isOneToOne: false
            referencedRelation: "v_credito_resumo_financeiro"
            referencedColumns: ["parceiro_id"]
          },
          {
            foreignKeyName: "transp_ocorrencia_tipo_transportadora_id_fkey"
            columns: ["transportadora_id"]
            isOneToOne: false
            referencedRelation: "vw_logistica_agregado"
            referencedColumns: ["transportadora_id"]
          },
          {
            foreignKeyName: "transp_ocorrencia_tipo_transportadora_id_fkey"
            columns: ["transportadora_id"]
            isOneToOne: false
            referencedRelation: "vw_recebivel_por_conta"
            referencedColumns: ["conta_id"]
          },
        ]
      }
      transp_rastreio_nf: {
        Row: {
          atualizado_em: string
          centro_custo: string | null
          cep_destino: string | null
          chave_nfe: string | null
          cidade_destino: string | null
          cnpj_destinatario: string | null
          cte_numero: string | null
          data_entrega: string | null
          destinatario: string | null
          eh_devolucao: boolean
          id: string
          importado_arquivo: string | null
          importado_em: string
          natureza_mercadoria: string | null
          nf_numero: string
          nf_serie: string | null
          ocorrencia_ativa: string | null
          ocorrencia_codigo: string | null
          ocorrencia_data: string | null
          pedido_id: string | null
          previsao_entrega: string | null
          recebedor: string | null
          status: string | null
          transportadora_id: string
          uf_destino: string | null
          valor_cte: number | null
          valor_nf: number | null
        }
        Insert: {
          atualizado_em?: string
          centro_custo?: string | null
          cep_destino?: string | null
          chave_nfe?: string | null
          cidade_destino?: string | null
          cnpj_destinatario?: string | null
          cte_numero?: string | null
          data_entrega?: string | null
          destinatario?: string | null
          eh_devolucao?: boolean
          id?: string
          importado_arquivo?: string | null
          importado_em?: string
          natureza_mercadoria?: string | null
          nf_numero: string
          nf_serie?: string | null
          ocorrencia_ativa?: string | null
          ocorrencia_codigo?: string | null
          ocorrencia_data?: string | null
          pedido_id?: string | null
          previsao_entrega?: string | null
          recebedor?: string | null
          status?: string | null
          transportadora_id: string
          uf_destino?: string | null
          valor_cte?: number | null
          valor_nf?: number | null
        }
        Update: {
          atualizado_em?: string
          centro_custo?: string | null
          cep_destino?: string | null
          chave_nfe?: string | null
          cidade_destino?: string | null
          cnpj_destinatario?: string | null
          cte_numero?: string | null
          data_entrega?: string | null
          destinatario?: string | null
          eh_devolucao?: boolean
          id?: string
          importado_arquivo?: string | null
          importado_em?: string
          natureza_mercadoria?: string | null
          nf_numero?: string
          nf_serie?: string | null
          ocorrencia_ativa?: string | null
          ocorrencia_codigo?: string | null
          ocorrencia_data?: string | null
          pedido_id?: string | null
          previsao_entrega?: string | null
          recebedor?: string | null
          status?: string | null
          transportadora_id?: string
          uf_destino?: string | null
          valor_cte?: number | null
          valor_nf?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "transp_rastreio_nf_pedido_id_fkey"
            columns: ["pedido_id"]
            isOneToOne: false
            referencedRelation: "pedidos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transp_rastreio_nf_pedido_id_fkey"
            columns: ["pedido_id"]
            isOneToOne: false
            referencedRelation: "v_pedidos_fila"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transp_rastreio_nf_pedido_id_fkey"
            columns: ["pedido_id"]
            isOneToOne: false
            referencedRelation: "v_pedidos_priorizados"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transp_rastreio_nf_pedido_id_fkey"
            columns: ["pedido_id"]
            isOneToOne: false
            referencedRelation: "vw_gestao_pedidos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transp_rastreio_nf_pedido_id_fkey"
            columns: ["pedido_id"]
            isOneToOne: false
            referencedRelation: "vw_pedido_base"
            referencedColumns: ["pedido_id"]
          },
          {
            foreignKeyName: "transp_rastreio_nf_pedido_id_fkey"
            columns: ["pedido_id"]
            isOneToOne: false
            referencedRelation: "vw_pedidos_farol"
            referencedColumns: ["pedido_id"]
          },
          {
            foreignKeyName: "transp_rastreio_nf_transportadora_id_fkey"
            columns: ["transportadora_id"]
            isOneToOne: false
            referencedRelation: "parceiros_comerciais"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transp_rastreio_nf_transportadora_id_fkey"
            columns: ["transportadora_id"]
            isOneToOne: false
            referencedRelation: "v_credito_resumo_financeiro"
            referencedColumns: ["parceiro_id"]
          },
          {
            foreignKeyName: "transp_rastreio_nf_transportadora_id_fkey"
            columns: ["transportadora_id"]
            isOneToOne: false
            referencedRelation: "vw_logistica_agregado"
            referencedColumns: ["transportadora_id"]
          },
          {
            foreignKeyName: "transp_rastreio_nf_transportadora_id_fkey"
            columns: ["transportadora_id"]
            isOneToOne: false
            referencedRelation: "vw_recebivel_por_conta"
            referencedColumns: ["conta_id"]
          },
        ]
      }
      transp_tabela_atendimento: {
        Row: {
          canal: string
          cep_final: number
          cep_inicial: number
          cidade: string | null
          id: string
          prazo: number | null
          tabela_id: string
          tarifa_code: string
          tda_risco: number | null
          uf: string
          zona: string
          zona_pendente: boolean
        }
        Insert: {
          canal?: string
          cep_final: number
          cep_inicial: number
          cidade?: string | null
          id?: string
          prazo?: number | null
          tabela_id: string
          tarifa_code: string
          tda_risco?: number | null
          uf: string
          zona: string
          zona_pendente?: boolean
        }
        Update: {
          canal?: string
          cep_final?: number
          cep_inicial?: number
          cidade?: string | null
          id?: string
          prazo?: number | null
          tabela_id?: string
          tarifa_code?: string
          tda_risco?: number | null
          uf?: string
          zona?: string
          zona_pendente?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "transp_tabela_atendimento_tabela_id_fkey"
            columns: ["tabela_id"]
            isOneToOne: false
            referencedRelation: "transp_tabelas"
            referencedColumns: ["id"]
          },
        ]
      }
      transp_tabela_generalidades: {
        Row: {
          codigo: string
          descricao: string | null
          id: string
          tabela_id: string
          tipo: string | null
          valor: number | null
        }
        Insert: {
          codigo: string
          descricao?: string | null
          id?: string
          tabela_id: string
          tipo?: string | null
          valor?: number | null
        }
        Update: {
          codigo?: string
          descricao?: string | null
          id?: string
          tabela_id?: string
          tipo?: string | null
          valor?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "transp_tabela_generalidades_tabela_id_fkey"
            columns: ["tabela_id"]
            isOneToOne: false
            referencedRelation: "transp_tabelas"
            referencedColumns: ["id"]
          },
        ]
      }
      transp_tabela_tarifas: {
        Row: {
          adm_pct: number | null
          adv_pct: number
          fv_pct: number | null
          gris_base: string
          gris_minimo: number | null
          gris_pct: number
          id: string
          kg_adicional: number
          modelo_peso: string
          pedagio_por_100kg: number | null
          peso_minimo: number | null
          pesos: Json
          suframa: number | null
          tabela_id: string
          tarifa_code: string
          tas: number | null
          tipo: string
          tx_coleta: number | null
          txa: number | null
          uf: string
        }
        Insert: {
          adm_pct?: number | null
          adv_pct?: number
          fv_pct?: number | null
          gris_base?: string
          gris_minimo?: number | null
          gris_pct?: number
          id?: string
          kg_adicional?: number
          modelo_peso?: string
          pedagio_por_100kg?: number | null
          peso_minimo?: number | null
          pesos: Json
          suframa?: number | null
          tabela_id: string
          tarifa_code: string
          tas?: number | null
          tipo: string
          tx_coleta?: number | null
          txa?: number | null
          uf: string
        }
        Update: {
          adm_pct?: number | null
          adv_pct?: number
          fv_pct?: number | null
          gris_base?: string
          gris_minimo?: number | null
          gris_pct?: number
          id?: string
          kg_adicional?: number
          modelo_peso?: string
          pedagio_por_100kg?: number | null
          peso_minimo?: number | null
          pesos?: Json
          suframa?: number | null
          tabela_id?: string
          tarifa_code?: string
          tas?: number | null
          tipo?: string
          tx_coleta?: number | null
          txa?: number | null
          uf?: string
        }
        Relationships: [
          {
            foreignKeyName: "transp_tabela_tarifas_tabela_id_fkey"
            columns: ["tabela_id"]
            isOneToOne: false
            referencedRelation: "transp_tabelas"
            referencedColumns: ["id"]
          },
        ]
      }
      transp_tabelas: {
        Row: {
          adm_pct: number | null
          ativo: boolean
          criado_em: string | null
          gris_base: string | null
          gris_minimo: number | null
          gris_pct: number | null
          id: string
          modal: string
          nome: string
          pedagio_por_100kg: number | null
          suframa: number | null
          tas: number | null
          transportadora_id: string
          tx_coleta: number | null
          vigencia_descricao: string | null
          vigencia_fim: string | null
          vigencia_inicio: string | null
        }
        Insert: {
          adm_pct?: number | null
          ativo?: boolean
          criado_em?: string | null
          gris_base?: string | null
          gris_minimo?: number | null
          gris_pct?: number | null
          id?: string
          modal?: string
          nome: string
          pedagio_por_100kg?: number | null
          suframa?: number | null
          tas?: number | null
          transportadora_id: string
          tx_coleta?: number | null
          vigencia_descricao?: string | null
          vigencia_fim?: string | null
          vigencia_inicio?: string | null
        }
        Update: {
          adm_pct?: number | null
          ativo?: boolean
          criado_em?: string | null
          gris_base?: string | null
          gris_minimo?: number | null
          gris_pct?: number | null
          id?: string
          modal?: string
          nome?: string
          pedagio_por_100kg?: number | null
          suframa?: number | null
          tas?: number | null
          transportadora_id?: string
          tx_coleta?: number | null
          vigencia_descricao?: string | null
          vigencia_fim?: string | null
          vigencia_inicio?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "transp_tabelas_transportadora_id_fkey"
            columns: ["transportadora_id"]
            isOneToOne: false
            referencedRelation: "parceiros_comerciais"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transp_tabelas_transportadora_id_fkey"
            columns: ["transportadora_id"]
            isOneToOne: false
            referencedRelation: "v_credito_resumo_financeiro"
            referencedColumns: ["parceiro_id"]
          },
          {
            foreignKeyName: "transp_tabelas_transportadora_id_fkey"
            columns: ["transportadora_id"]
            isOneToOne: false
            referencedRelation: "vw_logistica_agregado"
            referencedColumns: ["transportadora_id"]
          },
          {
            foreignKeyName: "transp_tabelas_transportadora_id_fkey"
            columns: ["transportadora_id"]
            isOneToOne: false
            referencedRelation: "vw_recebivel_por_conta"
            referencedColumns: ["conta_id"]
          },
        ]
      }
      unidades: {
        Row: {
          ativa: boolean
          atualizado_em: string
          cidade: string | null
          cnpj: string | null
          codigo: string
          criado_em: string
          estado: string | null
          id: string
          nome: string
          tipo: string
        }
        Insert: {
          ativa?: boolean
          atualizado_em?: string
          cidade?: string | null
          cnpj?: string | null
          codigo: string
          criado_em?: string
          estado?: string | null
          id?: string
          nome: string
          tipo: string
        }
        Update: {
          ativa?: boolean
          atualizado_em?: string
          cidade?: string | null
          cnpj?: string | null
          codigo?: string
          criado_em?: string
          estado?: string | null
          id?: string
          nome?: string
          tipo?: string
        }
        Relationships: []
      }
      user_atribuicoes: {
        Row: {
          criado_em: string
          criado_por: string | null
          id: string
          nivel: string | null
          perfil_id: string
          unidade_id: string | null
          user_id: string
          valido_ate: string | null
        }
        Insert: {
          criado_em?: string
          criado_por?: string | null
          id?: string
          nivel?: string | null
          perfil_id: string
          unidade_id?: string | null
          user_id: string
          valido_ate?: string | null
        }
        Update: {
          criado_em?: string
          criado_por?: string | null
          id?: string
          nivel?: string | null
          perfil_id?: string
          unidade_id?: string | null
          user_id?: string
          valido_ate?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "user_atribuicoes_perfil_id_fkey"
            columns: ["perfil_id"]
            isOneToOne: false
            referencedRelation: "perfis"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_atribuicoes_unidade_id_fkey"
            columns: ["unidade_id"]
            isOneToOne: false
            referencedRelation: "unidades"
            referencedColumns: ["id"]
          },
        ]
      }
      user_colaborador_link: {
        Row: {
          colaborador_clt_id: string | null
          contrato_pj_id: string | null
          inativado_em: string | null
          tipo_externo: string | null
          user_id: string
          vinculado_em: string | null
          vinculado_por: string | null
        }
        Insert: {
          colaborador_clt_id?: string | null
          contrato_pj_id?: string | null
          inativado_em?: string | null
          tipo_externo?: string | null
          user_id: string
          vinculado_em?: string | null
          vinculado_por?: string | null
        }
        Update: {
          colaborador_clt_id?: string | null
          contrato_pj_id?: string | null
          inativado_em?: string | null
          tipo_externo?: string | null
          user_id?: string
          vinculado_em?: string | null
          vinculado_por?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "user_colaborador_link_colaborador_clt_id_fkey"
            columns: ["colaborador_clt_id"]
            isOneToOne: false
            referencedRelation: "colaboradores_clt"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_colaborador_link_contrato_pj_id_fkey"
            columns: ["contrato_pj_id"]
            isOneToOne: false
            referencedRelation: "contratos_pj"
            referencedColumns: ["id"]
          },
        ]
      }
      user_preferencias_navegacao: {
        Row: {
          created_at: string
          tema: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          tema?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          tema?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      user_roles: {
        Row: {
          atribuido_manualmente: boolean
          created_at: string
          id: string
          nivel: Database["public"]["Enums"]["nivel_cargo"] | null
          revogado_em: string | null
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          atribuido_manualmente?: boolean
          created_at?: string
          id?: string
          nivel?: Database["public"]["Enums"]["nivel_cargo"] | null
          revogado_em?: string | null
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          atribuido_manualmente?: boolean
          created_at?: string
          id?: string
          nivel?: Database["public"]["Enums"]["nivel_cargo"] | null
          revogado_em?: string | null
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
      usuario_paginas_favoritas: {
        Row: {
          criado_em: string
          icone: string | null
          id: string
          ordem: number | null
          pilar: string | null
          rota: string
          titulo: string
          user_id: string
        }
        Insert: {
          criado_em?: string
          icone?: string | null
          id?: string
          ordem?: number | null
          pilar?: string | null
          rota: string
          titulo: string
          user_id: string
        }
        Update: {
          criado_em?: string
          icone?: string | null
          id?: string
          ordem?: number | null
          pilar?: string | null
          rota?: string
          titulo?: string
          user_id?: string
        }
        Relationships: []
      }
      usuario_paginas_recentes: {
        Row: {
          acessado_em: string
          icone: string | null
          id: string
          pilar: string | null
          rota: string
          titulo: string
          user_id: string
        }
        Insert: {
          acessado_em?: string
          icone?: string | null
          id?: string
          pilar?: string | null
          rota: string
          titulo: string
          user_id: string
        }
        Update: {
          acessado_em?: string
          icone?: string | null
          id?: string
          pilar?: string | null
          rota?: string
          titulo?: string
          user_id?: string
        }
        Relationships: []
      }
      vagas: {
        Row: {
          area: string
          beneficios: string | null
          beneficios_ids: string[] | null
          beneficios_outros: string | null
          cargo_id: string | null
          created_at: string | null
          criado_por: string | null
          departamento: string | null
          descricao: string | null
          faixa_max: number | null
          faixa_min: number | null
          ferramentas: string[] | null
          ferramentas_ids: string[] | null
          ferramentas_outras: string | null
          gestor_id: string | null
          id: string
          is_clevel: boolean | null
          jornada: string | null
          local_trabalho: string | null
          missao: string | null
          nivel: string
          num_vagas: number
          publicado_em: string | null
          responsabilidades: string[] | null
          skills_desejadas: string[] | null
          skills_obrigatorias: string[] | null
          status: string
          tipo_contrato: string
          titulo: string
          updated_at: string | null
          vagas_preenchidas: number
          vigencia_fim: string | null
          vigencia_inicio: string | null
        }
        Insert: {
          area: string
          beneficios?: string | null
          beneficios_ids?: string[] | null
          beneficios_outros?: string | null
          cargo_id?: string | null
          created_at?: string | null
          criado_por?: string | null
          departamento?: string | null
          descricao?: string | null
          faixa_max?: number | null
          faixa_min?: number | null
          ferramentas?: string[] | null
          ferramentas_ids?: string[] | null
          ferramentas_outras?: string | null
          gestor_id?: string | null
          id?: string
          is_clevel?: boolean | null
          jornada?: string | null
          local_trabalho?: string | null
          missao?: string | null
          nivel?: string
          num_vagas?: number
          publicado_em?: string | null
          responsabilidades?: string[] | null
          skills_desejadas?: string[] | null
          skills_obrigatorias?: string[] | null
          status?: string
          tipo_contrato?: string
          titulo: string
          updated_at?: string | null
          vagas_preenchidas?: number
          vigencia_fim?: string | null
          vigencia_inicio?: string | null
        }
        Update: {
          area?: string
          beneficios?: string | null
          beneficios_ids?: string[] | null
          beneficios_outros?: string | null
          cargo_id?: string | null
          created_at?: string | null
          criado_por?: string | null
          departamento?: string | null
          descricao?: string | null
          faixa_max?: number | null
          faixa_min?: number | null
          ferramentas?: string[] | null
          ferramentas_ids?: string[] | null
          ferramentas_outras?: string | null
          gestor_id?: string | null
          id?: string
          is_clevel?: boolean | null
          jornada?: string | null
          local_trabalho?: string | null
          missao?: string | null
          nivel?: string
          num_vagas?: number
          publicado_em?: string | null
          responsabilidades?: string[] | null
          skills_desejadas?: string[] | null
          skills_obrigatorias?: string[] | null
          status?: string
          tipo_contrato?: string
          titulo?: string
          updated_at?: string | null
          vagas_preenchidas?: number
          vigencia_fim?: string | null
          vigencia_inicio?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "vagas_cargo_id_fkey"
            columns: ["cargo_id"]
            isOneToOne: false
            referencedRelation: "cargos"
            referencedColumns: ["id"]
          },
        ]
      }
      vinculo_beneficios: {
        Row: {
          beneficio_id: string
          created_at: string
          created_by: string | null
          data_fim: string | null
          data_inicio: string
          id: string
          numero_cartao: string | null
          observacoes: string | null
          operadora: string | null
          status: string
          updated_at: string
          valor_desconto: number
          valor_empresa: number
          vinculo_id: string
        }
        Insert: {
          beneficio_id: string
          created_at?: string
          created_by?: string | null
          data_fim?: string | null
          data_inicio?: string
          id?: string
          numero_cartao?: string | null
          observacoes?: string | null
          operadora?: string | null
          status?: string
          updated_at?: string
          valor_desconto?: number
          valor_empresa?: number
          vinculo_id: string
        }
        Update: {
          beneficio_id?: string
          created_at?: string
          created_by?: string | null
          data_fim?: string | null
          data_inicio?: string
          id?: string
          numero_cartao?: string | null
          observacoes?: string | null
          operadora?: string | null
          status?: string
          updated_at?: string
          valor_desconto?: number
          valor_empresa?: number
          vinculo_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "vinculo_beneficios_beneficio_id_fkey"
            columns: ["beneficio_id"]
            isOneToOne: false
            referencedRelation: "beneficios_catalogo"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vinculo_beneficios_vinculo_id_fkey"
            columns: ["vinculo_id"]
            isOneToOne: false
            referencedRelation: "vinculos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vinculo_beneficios_vinculo_id_fkey"
            columns: ["vinculo_id"]
            isOneToOne: false
            referencedRelation: "vw_custo_pessoas"
            referencedColumns: ["vinculo_id"]
          },
          {
            foreignKeyName: "vinculo_beneficios_vinculo_id_fkey"
            columns: ["vinculo_id"]
            isOneToOne: false
            referencedRelation: "vw_nf_vinculo_pessoa"
            referencedColumns: ["vinculo_id"]
          },
          {
            foreignKeyName: "vinculo_beneficios_vinculo_id_fkey"
            columns: ["vinculo_id"]
            isOneToOne: false
            referencedRelation: "vw_organograma"
            referencedColumns: ["vinculo_id"]
          },
          {
            foreignKeyName: "vinculo_beneficios_vinculo_id_fkey"
            columns: ["vinculo_id"]
            isOneToOne: false
            referencedRelation: "vw_pj_notas_fiscais"
            referencedColumns: ["vinculo_id"]
          },
          {
            foreignKeyName: "vinculo_beneficios_vinculo_id_fkey"
            columns: ["vinculo_id"]
            isOneToOne: false
            referencedRelation: "vw_pj_pagamentos"
            referencedColumns: ["vinculo_id"]
          },
          {
            foreignKeyName: "vinculo_beneficios_vinculo_id_fkey"
            columns: ["vinculo_id"]
            isOneToOne: false
            referencedRelation: "vw_vinculo_custo_total"
            referencedColumns: ["vinculo_id"]
          },
        ]
      }
      vinculo_extras: {
        Row: {
          competencia: string | null
          created_at: string
          created_by: string | null
          data_fim: string | null
          data_inicio: string | null
          extra_id: string
          id: string
          natureza: string
          observacoes: string | null
          status: string
          updated_at: string
          valor: number
          vinculo_id: string
        }
        Insert: {
          competencia?: string | null
          created_at?: string
          created_by?: string | null
          data_fim?: string | null
          data_inicio?: string | null
          extra_id: string
          id?: string
          natureza: string
          observacoes?: string | null
          status?: string
          updated_at?: string
          valor?: number
          vinculo_id: string
        }
        Update: {
          competencia?: string | null
          created_at?: string
          created_by?: string | null
          data_fim?: string | null
          data_inicio?: string | null
          extra_id?: string
          id?: string
          natureza?: string
          observacoes?: string | null
          status?: string
          updated_at?: string
          valor?: number
          vinculo_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "vinculo_extras_extra_id_fkey"
            columns: ["extra_id"]
            isOneToOne: false
            referencedRelation: "extras_catalogo"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vinculo_extras_vinculo_id_fkey"
            columns: ["vinculo_id"]
            isOneToOne: false
            referencedRelation: "vinculos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vinculo_extras_vinculo_id_fkey"
            columns: ["vinculo_id"]
            isOneToOne: false
            referencedRelation: "vw_custo_pessoas"
            referencedColumns: ["vinculo_id"]
          },
          {
            foreignKeyName: "vinculo_extras_vinculo_id_fkey"
            columns: ["vinculo_id"]
            isOneToOne: false
            referencedRelation: "vw_nf_vinculo_pessoa"
            referencedColumns: ["vinculo_id"]
          },
          {
            foreignKeyName: "vinculo_extras_vinculo_id_fkey"
            columns: ["vinculo_id"]
            isOneToOne: false
            referencedRelation: "vw_organograma"
            referencedColumns: ["vinculo_id"]
          },
          {
            foreignKeyName: "vinculo_extras_vinculo_id_fkey"
            columns: ["vinculo_id"]
            isOneToOne: false
            referencedRelation: "vw_pj_notas_fiscais"
            referencedColumns: ["vinculo_id"]
          },
          {
            foreignKeyName: "vinculo_extras_vinculo_id_fkey"
            columns: ["vinculo_id"]
            isOneToOne: false
            referencedRelation: "vw_pj_pagamentos"
            referencedColumns: ["vinculo_id"]
          },
          {
            foreignKeyName: "vinculo_extras_vinculo_id_fkey"
            columns: ["vinculo_id"]
            isOneToOne: false
            referencedRelation: "vw_vinculo_custo_total"
            referencedColumns: ["vinculo_id"]
          },
        ]
      }
      vinculos: {
        Row: {
          agencia: string | null
          banco_codigo: string | null
          banco_nome: string | null
          cargo_id: string | null
          categoria_pj: string | null
          centro_custo_id: string | null
          chave_pix: string | null
          cnpj: string | null
          conta: string | null
          created_at: string
          created_by: string | null
          ctps_numero: string | null
          ctps_serie: string | null
          ctps_uf: string | null
          data_admissao: string | null
          data_fim: string | null
          data_inicio: string
          departamento_id: string | null
          dia_vencimento: number | null
          email_corporativo: string | null
          fim_periodo_experiencia_1: string | null
          fim_periodo_experiencia_2: string | null
          forma_pagamento_id: string | null
          gestor_pessoa_id: string | null
          id: string
          inscricao_estadual: string | null
          inscricao_municipal: string | null
          jornada_semanal: number | null
          matricula: string | null
          nome_fantasia: string | null
          objeto: string | null
          observacoes: string | null
          origem_contrato_pj_id: string | null
          parceiro_comercial_id: string | null
          pessoa_id: string
          pis_pasep: string | null
          razao_social: string | null
          status: string
          telefone_corporativo: string | null
          tipo_conta: string | null
          tipo_vinculo: string
          unidade_id: string | null
          updated_at: string
          valor_base: number | null
          valor_beneficios_extras: number | null
          valor_transporte: number | null
        }
        Insert: {
          agencia?: string | null
          banco_codigo?: string | null
          banco_nome?: string | null
          cargo_id?: string | null
          categoria_pj?: string | null
          centro_custo_id?: string | null
          chave_pix?: string | null
          cnpj?: string | null
          conta?: string | null
          created_at?: string
          created_by?: string | null
          ctps_numero?: string | null
          ctps_serie?: string | null
          ctps_uf?: string | null
          data_admissao?: string | null
          data_fim?: string | null
          data_inicio: string
          departamento_id?: string | null
          dia_vencimento?: number | null
          email_corporativo?: string | null
          fim_periodo_experiencia_1?: string | null
          fim_periodo_experiencia_2?: string | null
          forma_pagamento_id?: string | null
          gestor_pessoa_id?: string | null
          id?: string
          inscricao_estadual?: string | null
          inscricao_municipal?: string | null
          jornada_semanal?: number | null
          matricula?: string | null
          nome_fantasia?: string | null
          objeto?: string | null
          observacoes?: string | null
          origem_contrato_pj_id?: string | null
          parceiro_comercial_id?: string | null
          pessoa_id: string
          pis_pasep?: string | null
          razao_social?: string | null
          status?: string
          telefone_corporativo?: string | null
          tipo_conta?: string | null
          tipo_vinculo: string
          unidade_id?: string | null
          updated_at?: string
          valor_base?: number | null
          valor_beneficios_extras?: number | null
          valor_transporte?: number | null
        }
        Update: {
          agencia?: string | null
          banco_codigo?: string | null
          banco_nome?: string | null
          cargo_id?: string | null
          categoria_pj?: string | null
          centro_custo_id?: string | null
          chave_pix?: string | null
          cnpj?: string | null
          conta?: string | null
          created_at?: string
          created_by?: string | null
          ctps_numero?: string | null
          ctps_serie?: string | null
          ctps_uf?: string | null
          data_admissao?: string | null
          data_fim?: string | null
          data_inicio?: string
          departamento_id?: string | null
          dia_vencimento?: number | null
          email_corporativo?: string | null
          fim_periodo_experiencia_1?: string | null
          fim_periodo_experiencia_2?: string | null
          forma_pagamento_id?: string | null
          gestor_pessoa_id?: string | null
          id?: string
          inscricao_estadual?: string | null
          inscricao_municipal?: string | null
          jornada_semanal?: number | null
          matricula?: string | null
          nome_fantasia?: string | null
          objeto?: string | null
          observacoes?: string | null
          origem_contrato_pj_id?: string | null
          parceiro_comercial_id?: string | null
          pessoa_id?: string
          pis_pasep?: string | null
          razao_social?: string | null
          status?: string
          telefone_corporativo?: string | null
          tipo_conta?: string | null
          tipo_vinculo?: string
          unidade_id?: string | null
          updated_at?: string
          valor_base?: number | null
          valor_beneficios_extras?: number | null
          valor_transporte?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "vinculos_cargo_id_fkey"
            columns: ["cargo_id"]
            isOneToOne: false
            referencedRelation: "cargos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vinculos_centro_custo_id_fkey"
            columns: ["centro_custo_id"]
            isOneToOne: false
            referencedRelation: "centros_custo"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vinculos_centro_custo_id_fkey"
            columns: ["centro_custo_id"]
            isOneToOne: false
            referencedRelation: "vw_custo_pessoas"
            referencedColumns: ["centro_custo_id"]
          },
          {
            foreignKeyName: "vinculos_centro_custo_id_fkey"
            columns: ["centro_custo_id"]
            isOneToOne: false
            referencedRelation: "vw_dimensionamento_areas"
            referencedColumns: ["centro_custo_id"]
          },
          {
            foreignKeyName: "vinculos_departamento_id_fkey"
            columns: ["departamento_id"]
            isOneToOne: false
            referencedRelation: "departamentos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vinculos_forma_pagamento_id_fkey"
            columns: ["forma_pagamento_id"]
            isOneToOne: false
            referencedRelation: "formas_pagamento"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vinculos_gestor_pessoa_id_fkey"
            columns: ["gestor_pessoa_id"]
            isOneToOne: false
            referencedRelation: "pessoas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vinculos_gestor_pessoa_id_fkey"
            columns: ["gestor_pessoa_id"]
            isOneToOne: false
            referencedRelation: "vw_custo_pessoas"
            referencedColumns: ["pessoa_id"]
          },
          {
            foreignKeyName: "vinculos_gestor_pessoa_id_fkey"
            columns: ["gestor_pessoa_id"]
            isOneToOne: false
            referencedRelation: "vw_nf_vinculo_pessoa"
            referencedColumns: ["pessoa_id"]
          },
          {
            foreignKeyName: "vinculos_gestor_pessoa_id_fkey"
            columns: ["gestor_pessoa_id"]
            isOneToOne: false
            referencedRelation: "vw_organograma"
            referencedColumns: ["pessoa_id"]
          },
          {
            foreignKeyName: "vinculos_gestor_pessoa_id_fkey"
            columns: ["gestor_pessoa_id"]
            isOneToOne: false
            referencedRelation: "vw_pj_notas_fiscais"
            referencedColumns: ["pessoa_id"]
          },
          {
            foreignKeyName: "vinculos_gestor_pessoa_id_fkey"
            columns: ["gestor_pessoa_id"]
            isOneToOne: false
            referencedRelation: "vw_pj_pagamentos"
            referencedColumns: ["pessoa_id"]
          },
          {
            foreignKeyName: "vinculos_parceiro_comercial_id_fkey"
            columns: ["parceiro_comercial_id"]
            isOneToOne: false
            referencedRelation: "parceiros_comerciais"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vinculos_parceiro_comercial_id_fkey"
            columns: ["parceiro_comercial_id"]
            isOneToOne: false
            referencedRelation: "v_credito_resumo_financeiro"
            referencedColumns: ["parceiro_id"]
          },
          {
            foreignKeyName: "vinculos_parceiro_comercial_id_fkey"
            columns: ["parceiro_comercial_id"]
            isOneToOne: false
            referencedRelation: "vw_logistica_agregado"
            referencedColumns: ["transportadora_id"]
          },
          {
            foreignKeyName: "vinculos_parceiro_comercial_id_fkey"
            columns: ["parceiro_comercial_id"]
            isOneToOne: false
            referencedRelation: "vw_recebivel_por_conta"
            referencedColumns: ["conta_id"]
          },
          {
            foreignKeyName: "vinculos_pessoa_id_fkey"
            columns: ["pessoa_id"]
            isOneToOne: false
            referencedRelation: "pessoas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vinculos_pessoa_id_fkey"
            columns: ["pessoa_id"]
            isOneToOne: false
            referencedRelation: "vw_custo_pessoas"
            referencedColumns: ["pessoa_id"]
          },
          {
            foreignKeyName: "vinculos_pessoa_id_fkey"
            columns: ["pessoa_id"]
            isOneToOne: false
            referencedRelation: "vw_nf_vinculo_pessoa"
            referencedColumns: ["pessoa_id"]
          },
          {
            foreignKeyName: "vinculos_pessoa_id_fkey"
            columns: ["pessoa_id"]
            isOneToOne: false
            referencedRelation: "vw_organograma"
            referencedColumns: ["pessoa_id"]
          },
          {
            foreignKeyName: "vinculos_pessoa_id_fkey"
            columns: ["pessoa_id"]
            isOneToOne: false
            referencedRelation: "vw_pj_notas_fiscais"
            referencedColumns: ["pessoa_id"]
          },
          {
            foreignKeyName: "vinculos_pessoa_id_fkey"
            columns: ["pessoa_id"]
            isOneToOne: false
            referencedRelation: "vw_pj_pagamentos"
            referencedColumns: ["pessoa_id"]
          },
          {
            foreignKeyName: "vinculos_unidade_id_fkey"
            columns: ["unidade_id"]
            isOneToOne: false
            referencedRelation: "unidades"
            referencedColumns: ["id"]
          },
        ]
      }
      wns_fase_para_estagio: {
        Row: {
          ativo: boolean
          created_at: string
          estagio_destino: string
          id: string
          updated_at: string
          wns_fase_id: number
        }
        Insert: {
          ativo?: boolean
          created_at?: string
          estagio_destino: string
          id?: string
          updated_at?: string
          wns_fase_id: number
        }
        Update: {
          ativo?: boolean
          created_at?: string
          estagio_destino?: string
          id?: string
          updated_at?: string
          wns_fase_id?: number
        }
        Relationships: [
          {
            foreignKeyName: "wns_fase_para_estagio_wns_fase_id_fkey"
            columns: ["wns_fase_id"]
            isOneToOne: true
            referencedRelation: "wns_fases_xpm"
            referencedColumns: ["wns_id"]
          },
        ]
      }
      wns_fases_xpm: {
        Row: {
          ativo: boolean
          codigo: string
          descricao: string
          icone: string | null
          sequencia: number
          wns_id: number
        }
        Insert: {
          ativo?: boolean
          codigo: string
          descricao: string
          icone?: string | null
          sequencia: number
          wns_id: number
        }
        Update: {
          ativo?: boolean
          codigo?: string
          descricao?: string
          icone?: string | null
          sequencia?: number
          wns_id?: number
        }
        Relationships: []
      }
      wns_importacoes: {
        Row: {
          arquivo_nome: string | null
          concluida_em: string | null
          criada_em: string
          erro_detalhe: string | null
          id: string
          linhas_atualizadas: number | null
          linhas_novas: number | null
          status: string
          total_linhas: number | null
        }
        Insert: {
          arquivo_nome?: string | null
          concluida_em?: string | null
          criada_em?: string
          erro_detalhe?: string | null
          id?: string
          linhas_atualizadas?: number | null
          linhas_novas?: number | null
          status?: string
          total_linhas?: number | null
        }
        Update: {
          arquivo_nome?: string | null
          concluida_em?: string | null
          criada_em?: string
          erro_detalhe?: string | null
          id?: string
          linhas_atualizadas?: number | null
          linhas_novas?: number | null
          status?: string
          total_linhas?: number | null
        }
        Relationships: []
      }
      wns_linhas: {
        Row: {
          barra: string | null
          cidade: string | null
          cliente_nome: string | null
          cliente_wns_id: number | null
          cpf_cnpj: string | null
          created_at: string
          data_pre: string | null
          estado: string | null
          evento_wns_id: number | null
          evento_xpm_raw: string | null
          filial: number | null
          frete_pedido: number | null
          frete_pre: number | null
          id: string
          importacao_id: string | null
          n_pedido_cliente: string | null
          nota_numero: number | null
          numero: string | null
          pedidowns: number
          preco: number | null
          prefaturamento: number | null
          prefaturamento_xpm: number | null
          produto_id: number | null
          quantidade: number
          sku: string
          tipo_empresa: number | null
          tipo_pedido_codigo: number | null
          tipo_pedido_raw: string | null
          total: number | null
          updated_at: string
        }
        Insert: {
          barra?: string | null
          cidade?: string | null
          cliente_nome?: string | null
          cliente_wns_id?: number | null
          cpf_cnpj?: string | null
          created_at?: string
          data_pre?: string | null
          estado?: string | null
          evento_wns_id?: number | null
          evento_xpm_raw?: string | null
          filial?: number | null
          frete_pedido?: number | null
          frete_pre?: number | null
          id?: string
          importacao_id?: string | null
          n_pedido_cliente?: string | null
          nota_numero?: number | null
          numero?: string | null
          pedidowns: number
          preco?: number | null
          prefaturamento?: number | null
          prefaturamento_xpm?: number | null
          produto_id?: number | null
          quantidade?: number
          sku: string
          tipo_empresa?: number | null
          tipo_pedido_codigo?: number | null
          tipo_pedido_raw?: string | null
          total?: number | null
          updated_at?: string
        }
        Update: {
          barra?: string | null
          cidade?: string | null
          cliente_nome?: string | null
          cliente_wns_id?: number | null
          cpf_cnpj?: string | null
          created_at?: string
          data_pre?: string | null
          estado?: string | null
          evento_wns_id?: number | null
          evento_xpm_raw?: string | null
          filial?: number | null
          frete_pedido?: number | null
          frete_pre?: number | null
          id?: string
          importacao_id?: string | null
          n_pedido_cliente?: string | null
          nota_numero?: number | null
          numero?: string | null
          pedidowns?: number
          preco?: number | null
          prefaturamento?: number | null
          prefaturamento_xpm?: number | null
          produto_id?: number | null
          quantidade?: number
          sku?: string
          tipo_empresa?: number | null
          tipo_pedido_codigo?: number | null
          tipo_pedido_raw?: string | null
          total?: number | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "wns_linhas_evento_wns_id_fkey"
            columns: ["evento_wns_id"]
            isOneToOne: false
            referencedRelation: "wns_fases_xpm"
            referencedColumns: ["wns_id"]
          },
          {
            foreignKeyName: "wns_linhas_importacao_id_fkey"
            columns: ["importacao_id"]
            isOneToOne: false
            referencedRelation: "wns_importacoes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "wns_linhas_tipo_pedido_codigo_fkey"
            columns: ["tipo_pedido_codigo"]
            isOneToOne: false
            referencedRelation: "wns_tipos_pedido"
            referencedColumns: ["codigo"]
          },
        ]
      }
      wns_pedidos: {
        Row: {
          cidade: string | null
          cliente_nome: string | null
          cliente_wns_id: number | null
          cpf_cnpj: string | null
          estado: string | null
          evento_atual_wns_id: number | null
          filial: number | null
          n_pedido_cliente: string | null
          notas_fiscais: number[] | null
          pedido_sncf_id: string | null
          pedidowns: number
          primeira_data: string | null
          tipo_pedido_codigo: number | null
          total_linhas: number
          total_quantidade: number
          total_remessas: number
          ultima_data: string | null
          updated_at: string
          valor_total: number
        }
        Insert: {
          cidade?: string | null
          cliente_nome?: string | null
          cliente_wns_id?: number | null
          cpf_cnpj?: string | null
          estado?: string | null
          evento_atual_wns_id?: number | null
          filial?: number | null
          n_pedido_cliente?: string | null
          notas_fiscais?: number[] | null
          pedido_sncf_id?: string | null
          pedidowns: number
          primeira_data?: string | null
          tipo_pedido_codigo?: number | null
          total_linhas?: number
          total_quantidade?: number
          total_remessas?: number
          ultima_data?: string | null
          updated_at?: string
          valor_total?: number
        }
        Update: {
          cidade?: string | null
          cliente_nome?: string | null
          cliente_wns_id?: number | null
          cpf_cnpj?: string | null
          estado?: string | null
          evento_atual_wns_id?: number | null
          filial?: number | null
          n_pedido_cliente?: string | null
          notas_fiscais?: number[] | null
          pedido_sncf_id?: string | null
          pedidowns?: number
          primeira_data?: string | null
          tipo_pedido_codigo?: number | null
          total_linhas?: number
          total_quantidade?: number
          total_remessas?: number
          ultima_data?: string | null
          updated_at?: string
          valor_total?: number
        }
        Relationships: [
          {
            foreignKeyName: "wns_pedidos_evento_atual_wns_id_fkey"
            columns: ["evento_atual_wns_id"]
            isOneToOne: false
            referencedRelation: "wns_fases_xpm"
            referencedColumns: ["wns_id"]
          },
          {
            foreignKeyName: "wns_pedidos_tipo_pedido_codigo_fkey"
            columns: ["tipo_pedido_codigo"]
            isOneToOne: false
            referencedRelation: "wns_tipos_pedido"
            referencedColumns: ["codigo"]
          },
        ]
      }
      wns_skus: {
        Row: {
          barra: string | null
          produto_id: number | null
          sku: string
          tipo_pedido_codigo: number
          total_pedidos: number
          total_quantidade: number
          total_remessas: number
          updated_at: string
          valor_total: number
        }
        Insert: {
          barra?: string | null
          produto_id?: number | null
          sku: string
          tipo_pedido_codigo: number
          total_pedidos?: number
          total_quantidade?: number
          total_remessas?: number
          updated_at?: string
          valor_total?: number
        }
        Update: {
          barra?: string | null
          produto_id?: number | null
          sku?: string
          tipo_pedido_codigo?: number
          total_pedidos?: number
          total_quantidade?: number
          total_remessas?: number
          updated_at?: string
          valor_total?: number
        }
        Relationships: [
          {
            foreignKeyName: "wns_skus_tipo_pedido_codigo_fkey"
            columns: ["tipo_pedido_codigo"]
            isOneToOne: false
            referencedRelation: "wns_tipos_pedido"
            referencedColumns: ["codigo"]
          },
        ]
      }
      wns_tipos_pedido: {
        Row: {
          ativo: boolean
          codigo: number
          compoe_receita: boolean
          descricao: string
          movimenta_estoque: boolean
        }
        Insert: {
          ativo?: boolean
          codigo: number
          compoe_receita?: boolean
          descricao: string
          movimenta_estoque?: boolean
        }
        Update: {
          ativo?: boolean
          codigo?: number
          compoe_receita?: boolean
          descricao?: string
          movimenta_estoque?: boolean
        }
        Relationships: []
      }
    }
    Views: {
      contas_pagar: {
        Row: {
          aprovado_em: string | null
          aprovado_por: string | null
          bling_id: string | null
          canal_venda_id: string | null
          categoria_confirmada: boolean | null
          categoria_sugerida_ia: boolean | null
          centro_custo_id: string | null
          compromisso_parcelado_id: string | null
          compromisso_recorrente_id: string | null
          comprovante_url: string | null
          conciliado_em: string | null
          conciliado_por: string | null
          conta_id: string | null
          created_at: string | null
          criado_por: string | null
          dados_bancarios_fornecedor: Json | null
          dados_enriquecidos_qive: boolean | null
          dados_pagamento_fornecedor: Json | null
          data_compra: string | null
          data_pagamento: string | null
          data_vencimento: string | null
          descricao: string | null
          docs_status: string | null
          editado_em: string | null
          editado_por: string | null
          eh_cartao: boolean | null
          email_pagamento_enviado: boolean | null
          enviado_pagamento_em: string | null
          enviado_pagamento_por: string | null
          forma_pagamento_id: string | null
          fornecedor_cliente: string | null
          fornecedor_id: string | null
          id: string | null
          meio_codigo: string | null
          meio_pagamento_id: string | null
          movimentacao_bancaria_id: string | null
          nf_cfop: string | null
          nf_chave_acesso: string | null
          nf_cnpj_emitente: string | null
          nf_data_emissao: string | null
          nf_natureza_operacao: string | null
          nf_ncm: string | null
          nf_numero: string | null
          nf_pdf_url: string | null
          nf_serie: string | null
          nf_valor_impostos: number | null
          nf_valor_produtos: number | null
          nf_xml_url: string | null
          numero_parcela: number | null
          observacao: string | null
          observacao_pagamento: string | null
          observacao_pagamento_manual: string | null
          origem: string | null
          pago_em: string | null
          pago_em_conta_id: string | null
          pago_por: string | null
          parceiro_id: string | null
          parcela_atual: number | null
          parcela_grupo_id: string | null
          parcelas: number | null
          sla_aprovacao_dias: number | null
          sla_pagamento_dias: number | null
          status: string | null
          tags: Json | null
          tarefa_id: string | null
          tipo: string | null
          total_parcelas: number | null
          unidade_id: string | null
          updated_at: string | null
          valor: number | null
          valor_pago: number | null
        }
        Relationships: [
          {
            foreignKeyName: "contas_pagar_receber_canal_venda_id_fkey"
            columns: ["canal_venda_id"]
            isOneToOne: false
            referencedRelation: "canais_venda"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contas_pagar_receber_centro_custo_id_fkey"
            columns: ["centro_custo_id"]
            isOneToOne: false
            referencedRelation: "centros_custo"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contas_pagar_receber_centro_custo_id_fkey"
            columns: ["centro_custo_id"]
            isOneToOne: false
            referencedRelation: "vw_custo_pessoas"
            referencedColumns: ["centro_custo_id"]
          },
          {
            foreignKeyName: "contas_pagar_receber_centro_custo_id_fkey"
            columns: ["centro_custo_id"]
            isOneToOne: false
            referencedRelation: "vw_dimensionamento_areas"
            referencedColumns: ["centro_custo_id"]
          },
          {
            foreignKeyName: "contas_pagar_receber_compromisso_parcelado_id_fkey"
            columns: ["compromisso_parcelado_id"]
            isOneToOne: false
            referencedRelation: "compromissos_parcelados"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contas_pagar_receber_compromisso_recorrente_id_fkey"
            columns: ["compromisso_recorrente_id"]
            isOneToOne: false
            referencedRelation: "compromissos_recorrentes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contas_pagar_receber_forma_pagamento_id_fkey"
            columns: ["forma_pagamento_id"]
            isOneToOne: false
            referencedRelation: "formas_pagamento"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contas_pagar_receber_meio_pagamento_id_fkey"
            columns: ["meio_pagamento_id"]
            isOneToOne: false
            referencedRelation: "meios_pagamento"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contas_pagar_receber_movimentacao_bancaria_id_fkey"
            columns: ["movimentacao_bancaria_id"]
            isOneToOne: false
            referencedRelation: "movimentacoes_bancarias"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contas_pagar_receber_movimentacao_bancaria_id_fkey"
            columns: ["movimentacao_bancaria_id"]
            isOneToOne: false
            referencedRelation: "vw_conciliacao_cartao_sugestoes"
            referencedColumns: ["ofx_id"]
          },
          {
            foreignKeyName: "contas_pagar_receber_movimentacao_bancaria_id_fkey"
            columns: ["movimentacao_bancaria_id"]
            isOneToOne: false
            referencedRelation: "vw_conciliacao_furos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contas_pagar_receber_movimentacao_bancaria_id_fkey"
            columns: ["movimentacao_bancaria_id"]
            isOneToOne: false
            referencedRelation: "vw_despesas_match_nf_sugestoes"
            referencedColumns: ["mov_id"]
          },
          {
            foreignKeyName: "contas_pagar_receber_movimentacao_bancaria_id_fkey"
            columns: ["movimentacao_bancaria_id"]
            isOneToOne: false
            referencedRelation: "vw_despesas_match_sugestoes"
            referencedColumns: ["mov_id"]
          },
          {
            foreignKeyName: "contas_pagar_receber_movimentacao_bancaria_id_fkey"
            columns: ["movimentacao_bancaria_id"]
            isOneToOne: false
            referencedRelation: "vw_pares_transferencia_sugeridos"
            referencedColumns: ["credito_id"]
          },
          {
            foreignKeyName: "contas_pagar_receber_movimentacao_bancaria_id_fkey"
            columns: ["movimentacao_bancaria_id"]
            isOneToOne: false
            referencedRelation: "vw_pares_transferencia_sugeridos"
            referencedColumns: ["debito_id"]
          },
          {
            foreignKeyName: "contas_pagar_receber_movimentacao_bancaria_id_fkey"
            columns: ["movimentacao_bancaria_id"]
            isOneToOne: false
            referencedRelation: "vw_recebivel_b2c_pedido"
            referencedColumns: ["movimentacao_id"]
          },
          {
            foreignKeyName: "contas_pagar_receber_pago_em_conta_id_fkey"
            columns: ["pago_em_conta_id"]
            isOneToOne: false
            referencedRelation: "contas_bancarias"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contas_pagar_receber_parceiro_id_fkey"
            columns: ["parceiro_id"]
            isOneToOne: false
            referencedRelation: "parceiros_comerciais"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contas_pagar_receber_parceiro_id_fkey"
            columns: ["parceiro_id"]
            isOneToOne: false
            referencedRelation: "v_credito_resumo_financeiro"
            referencedColumns: ["parceiro_id"]
          },
          {
            foreignKeyName: "contas_pagar_receber_parceiro_id_fkey"
            columns: ["parceiro_id"]
            isOneToOne: false
            referencedRelation: "vw_logistica_agregado"
            referencedColumns: ["transportadora_id"]
          },
          {
            foreignKeyName: "contas_pagar_receber_parceiro_id_fkey"
            columns: ["parceiro_id"]
            isOneToOne: false
            referencedRelation: "vw_recebivel_por_conta"
            referencedColumns: ["conta_id"]
          },
          {
            foreignKeyName: "contas_pagar_receber_plano_contas_id_fkey"
            columns: ["conta_id"]
            isOneToOne: false
            referencedRelation: "plano_contas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contas_pagar_receber_unidade_id_fkey"
            columns: ["unidade_id"]
            isOneToOne: false
            referencedRelation: "unidades"
            referencedColumns: ["id"]
          },
        ]
      }
      contas_pagar_receber_ativas: {
        Row: {
          aprovado_em: string | null
          aprovado_por: string | null
          bling_id: string | null
          canal_venda_id: string | null
          categoria_confirmada: boolean | null
          categoria_sugerida_ia: boolean | null
          centro_custo_id: string | null
          compromisso_parcelado_id: string | null
          compromisso_recorrente_id: string | null
          comprovante_url: string | null
          conciliado_em: string | null
          conciliado_por: string | null
          conta_id: string | null
          created_at: string | null
          criado_por: string | null
          dados_bancarios_fornecedor: Json | null
          dados_enriquecidos_qive: boolean | null
          dados_pagamento_fornecedor: Json | null
          data_compra: string | null
          data_pagamento: string | null
          data_vencimento: string | null
          deleted_at: string | null
          deleted_por: string | null
          descricao: string | null
          docs_status: string | null
          editado_em: string | null
          editado_por: string | null
          eh_cartao: boolean | null
          email_pagamento_enviado: boolean | null
          enviado_pagamento_em: string | null
          enviado_pagamento_por: string | null
          forma_pagamento_id: string | null
          fornecedor_cliente: string | null
          fornecedor_id: string | null
          id: string | null
          meio_codigo: string | null
          meio_pagamento_id: string | null
          movimentacao_bancaria_id: string | null
          nf_cfop: string | null
          nf_chave_acesso: string | null
          nf_cnpj_emitente: string | null
          nf_data_emissao: string | null
          nf_natureza_operacao: string | null
          nf_ncm: string | null
          nf_numero: string | null
          nf_pdf_url: string | null
          nf_serie: string | null
          nf_valor_impostos: number | null
          nf_valor_produtos: number | null
          nf_xml_url: string | null
          numero_parcela: number | null
          observacao: string | null
          observacao_pagamento: string | null
          observacao_pagamento_manual: string | null
          origem: string | null
          pago_em: string | null
          pago_em_conta_id: string | null
          pago_por: string | null
          parceiro_id: string | null
          parcela_atual: number | null
          parcela_grupo_id: string | null
          parcelas: number | null
          sla_aprovacao_dias: number | null
          sla_pagamento_dias: number | null
          status: string | null
          tags: Json | null
          tarefa_id: string | null
          tem_sugestao_nf: boolean | null
          tipo: string | null
          total_parcelas: number | null
          unidade_id: string | null
          updated_at: string | null
          valor: number | null
          valor_original_item: number | null
          valor_pago: number | null
        }
        Relationships: [
          {
            foreignKeyName: "contas_pagar_receber_canal_venda_id_fkey"
            columns: ["canal_venda_id"]
            isOneToOne: false
            referencedRelation: "canais_venda"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contas_pagar_receber_centro_custo_id_fkey"
            columns: ["centro_custo_id"]
            isOneToOne: false
            referencedRelation: "centros_custo"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contas_pagar_receber_centro_custo_id_fkey"
            columns: ["centro_custo_id"]
            isOneToOne: false
            referencedRelation: "vw_custo_pessoas"
            referencedColumns: ["centro_custo_id"]
          },
          {
            foreignKeyName: "contas_pagar_receber_centro_custo_id_fkey"
            columns: ["centro_custo_id"]
            isOneToOne: false
            referencedRelation: "vw_dimensionamento_areas"
            referencedColumns: ["centro_custo_id"]
          },
          {
            foreignKeyName: "contas_pagar_receber_compromisso_parcelado_id_fkey"
            columns: ["compromisso_parcelado_id"]
            isOneToOne: false
            referencedRelation: "compromissos_parcelados"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contas_pagar_receber_compromisso_recorrente_id_fkey"
            columns: ["compromisso_recorrente_id"]
            isOneToOne: false
            referencedRelation: "compromissos_recorrentes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contas_pagar_receber_forma_pagamento_id_fkey"
            columns: ["forma_pagamento_id"]
            isOneToOne: false
            referencedRelation: "formas_pagamento"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contas_pagar_receber_meio_pagamento_id_fkey"
            columns: ["meio_pagamento_id"]
            isOneToOne: false
            referencedRelation: "meios_pagamento"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contas_pagar_receber_movimentacao_bancaria_id_fkey"
            columns: ["movimentacao_bancaria_id"]
            isOneToOne: false
            referencedRelation: "movimentacoes_bancarias"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contas_pagar_receber_movimentacao_bancaria_id_fkey"
            columns: ["movimentacao_bancaria_id"]
            isOneToOne: false
            referencedRelation: "vw_conciliacao_cartao_sugestoes"
            referencedColumns: ["ofx_id"]
          },
          {
            foreignKeyName: "contas_pagar_receber_movimentacao_bancaria_id_fkey"
            columns: ["movimentacao_bancaria_id"]
            isOneToOne: false
            referencedRelation: "vw_conciliacao_furos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contas_pagar_receber_movimentacao_bancaria_id_fkey"
            columns: ["movimentacao_bancaria_id"]
            isOneToOne: false
            referencedRelation: "vw_despesas_match_nf_sugestoes"
            referencedColumns: ["mov_id"]
          },
          {
            foreignKeyName: "contas_pagar_receber_movimentacao_bancaria_id_fkey"
            columns: ["movimentacao_bancaria_id"]
            isOneToOne: false
            referencedRelation: "vw_despesas_match_sugestoes"
            referencedColumns: ["mov_id"]
          },
          {
            foreignKeyName: "contas_pagar_receber_movimentacao_bancaria_id_fkey"
            columns: ["movimentacao_bancaria_id"]
            isOneToOne: false
            referencedRelation: "vw_pares_transferencia_sugeridos"
            referencedColumns: ["credito_id"]
          },
          {
            foreignKeyName: "contas_pagar_receber_movimentacao_bancaria_id_fkey"
            columns: ["movimentacao_bancaria_id"]
            isOneToOne: false
            referencedRelation: "vw_pares_transferencia_sugeridos"
            referencedColumns: ["debito_id"]
          },
          {
            foreignKeyName: "contas_pagar_receber_movimentacao_bancaria_id_fkey"
            columns: ["movimentacao_bancaria_id"]
            isOneToOne: false
            referencedRelation: "vw_recebivel_b2c_pedido"
            referencedColumns: ["movimentacao_id"]
          },
          {
            foreignKeyName: "contas_pagar_receber_pago_em_conta_id_fkey"
            columns: ["pago_em_conta_id"]
            isOneToOne: false
            referencedRelation: "contas_bancarias"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contas_pagar_receber_parceiro_id_fkey"
            columns: ["parceiro_id"]
            isOneToOne: false
            referencedRelation: "parceiros_comerciais"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contas_pagar_receber_parceiro_id_fkey"
            columns: ["parceiro_id"]
            isOneToOne: false
            referencedRelation: "v_credito_resumo_financeiro"
            referencedColumns: ["parceiro_id"]
          },
          {
            foreignKeyName: "contas_pagar_receber_parceiro_id_fkey"
            columns: ["parceiro_id"]
            isOneToOne: false
            referencedRelation: "vw_logistica_agregado"
            referencedColumns: ["transportadora_id"]
          },
          {
            foreignKeyName: "contas_pagar_receber_parceiro_id_fkey"
            columns: ["parceiro_id"]
            isOneToOne: false
            referencedRelation: "vw_recebivel_por_conta"
            referencedColumns: ["conta_id"]
          },
          {
            foreignKeyName: "contas_pagar_receber_plano_contas_id_fkey"
            columns: ["conta_id"]
            isOneToOne: false
            referencedRelation: "plano_contas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contas_pagar_receber_unidade_id_fkey"
            columns: ["unidade_id"]
            isOneToOne: false
            referencedRelation: "unidades"
            referencedColumns: ["id"]
          },
        ]
      }
      kpis_nf_pj_mensal: {
        Row: {
          despesa_variavel: number | null
          folha_contratual: number | null
          mes_submissao: string | null
          taxa_aprovacao_1a_tentativa_pct: number | null
          total_aprovadas: number | null
          total_em_disputa: number | null
          total_rejeitadas: number | null
          total_submetidas: number | null
          valor_medio: number | null
        }
        Relationships: []
      }
      meus_acessos_salario: {
        Row: {
          ator_nome: string | null
          ator_user_id: string | null
          contexto: string | null
          criado_em: string | null
          em_lote: boolean | null
          id: string | null
          justificativa: string | null
          quantidade_alvos: number | null
        }
        Relationships: []
      }
      onboarding_tarefas_view: {
        Row: {
          checklist_id: string | null
          concluida_em: string | null
          concluida_por: string | null
          created_at: string | null
          descricao: string | null
          id: string | null
          prazo_data: string | null
          prazo_dias: number | null
          responsavel_role: Database["public"]["Enums"]["app_role"] | null
          responsavel_user_id: string | null
          status: string | null
          titulo: string | null
          updated_at: string | null
        }
        Insert: {
          checklist_id?: string | null
          concluida_em?: string | null
          concluida_por?: string | null
          created_at?: string | null
          descricao?: string | null
          id?: string | null
          prazo_data?: string | null
          prazo_dias?: number | null
          responsavel_role?: never
          responsavel_user_id?: string | null
          status?: string | null
          titulo?: string | null
          updated_at?: string | null
        }
        Update: {
          checklist_id?: string | null
          concluida_em?: string | null
          concluida_por?: string | null
          created_at?: string | null
          descricao?: string | null
          id?: string | null
          prazo_data?: string | null
          prazo_dias?: number | null
          responsavel_role?: never
          responsavel_user_id?: string | null
          status?: string | null
          titulo?: string | null
          updated_at?: string | null
        }
        Relationships: []
      }
      processos_ligacoes_expandidas: {
        Row: {
          criado_em: string | null
          descricao: string | null
          destino_codigo: string | null
          destino_nome: string | null
          id: string | null
          ordem: number | null
          origem_codigo: string | null
          origem_nome: string | null
          processo_destino_id: string | null
          processo_origem_id: string | null
          tipo_ligacao: string | null
          tipo_ligacao_label: string | null
        }
        Relationships: [
          {
            foreignKeyName: "processos_ligacoes_processo_destino_id_fkey"
            columns: ["processo_destino_id"]
            isOneToOne: false
            referencedRelation: "processos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "processos_ligacoes_processo_destino_id_fkey"
            columns: ["processo_destino_id"]
            isOneToOne: false
            referencedRelation: "processos_unificados"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "processos_ligacoes_processo_origem_id_fkey"
            columns: ["processo_origem_id"]
            isOneToOne: false
            referencedRelation: "processos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "processos_ligacoes_processo_origem_id_fkey"
            columns: ["processo_origem_id"]
            isOneToOne: false
            referencedRelation: "processos_unificados"
            referencedColumns: ["id"]
          },
        ]
      }
      processos_unificados: {
        Row: {
          area_negocio_id: string | null
          area_nome: string | null
          codigo: string | null
          consultas_30d: number | null
          created_at: string | null
          descricao: string | null
          diagrama_mermaid: string | null
          id: string | null
          narrativa: string | null
          natureza_valor: string | null
          nome: string | null
          owner_nome: string | null
          owner_perfil_codigo: string | null
          owner_user_id: string | null
          sensivel: boolean | null
          status_valor: string | null
          sugestoes_pendentes: number | null
          tags_areas: Json | null
          tags_cargos: Json | null
          tags_departamentos: Json | null
          tags_sistemas: Json | null
          tags_tipos_colaborador: Json | null
          tags_unidades: Json | null
          template_sncf_id: string | null
          total_consultas: number | null
          updated_at: string | null
          versao_atual: number | null
          versao_vigente_em: string | null
        }
        Relationships: [
          {
            foreignKeyName: "processos_area_negocio_id_fkey"
            columns: ["area_negocio_id"]
            isOneToOne: false
            referencedRelation: "parametros"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "processos_owner_perfil_codigo_fkey"
            columns: ["owner_perfil_codigo"]
            isOneToOne: false
            referencedRelation: "perfis"
            referencedColumns: ["codigo"]
          },
          {
            foreignKeyName: "processos_template_sncf_id_fkey"
            columns: ["template_sncf_id"]
            isOneToOne: false
            referencedRelation: "sncf_templates_processos"
            referencedColumns: ["id"]
          },
        ]
      }
      revogacoes_acesso_historico: {
        Row: {
          ator_nome: string | null
          ator_user_id: string | null
          criado_em: string | null
          dados_antes: Json | null
          dados_depois: Json | null
          id: string | null
          justificativa: string | null
          tabela: string | null
          tipo_acao: string | null
          user_id_revogado: string | null
        }
        Insert: {
          ator_nome?: string | null
          ator_user_id?: string | null
          criado_em?: string | null
          dados_antes?: Json | null
          dados_depois?: Json | null
          id?: string | null
          justificativa?: string | null
          tabela?: string | null
          tipo_acao?: string | null
          user_id_revogado?: string | null
        }
        Update: {
          ator_nome?: string | null
          ator_user_id?: string | null
          criado_em?: string | null
          dados_antes?: Json | null
          dados_depois?: Json | null
          id?: string | null
          justificativa?: string | null
          tabela?: string | null
          tipo_acao?: string | null
          user_id_revogado?: string | null
        }
        Relationships: []
      }
      tarefas_emissao_nf_pendentes: {
        Row: {
          contrato_id: string | null
          created_at: string | null
          departamento: string | null
          email_corporativo: string | null
          pj_nome: string | null
          pj_user_id: string | null
          prazo_data: string | null
          razao_social: string | null
          status: string | null
          tarefa_id: string | null
          titulo: string | null
          valor_mensal: number | null
        }
        Relationships: []
      }
      v_cpr_bola_redonda: {
        Row: {
          bola_redonda: boolean | null
          cpr_id: string | null
          forma_codigo: string | null
          o_que_falta: string[] | null
        }
        Relationships: []
      }
      v_credito_resumo_financeiro: {
        Row: {
          a_vencer: number | null
          atraso_medio_dias: number | null
          cnpj: string | null
          em_aberto: number | null
          maior_compra: number | null
          pago: number | null
          parceiro_id: string | null
          razao_social: string | null
          ultima_compra_em: string | null
          vencidos: number | null
        }
        Relationships: []
      }
      v_credito_resumo_financeiro_grupo: {
        Row: {
          a_vencer: number | null
          atraso_medio_dias: number | null
          em_aberto: number | null
          grupo_economico_id: string | null
          grupo_nome: string | null
          maior_compra: number | null
          pago: number | null
          qtd_parceiros: number | null
          ultima_compra_em: string | null
          vencidos: number | null
        }
        Relationships: []
      }
      v_parceiro_timeline: {
        Row: {
          criado_em: string | null
          id: string | null
          motivo: string | null
          operador_email: string | null
          operador_id: string | null
          parceiro_id: string | null
          referencia_id: string | null
          referencia_tipo: string | null
          tipo_marco: string | null
          valor_anterior: string | null
          valor_novo: string | null
        }
        Relationships: [
          {
            foreignKeyName: "parceiro_marcos_parceiro_id_fkey"
            columns: ["parceiro_id"]
            isOneToOne: false
            referencedRelation: "parceiros_comerciais"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "parceiro_marcos_parceiro_id_fkey"
            columns: ["parceiro_id"]
            isOneToOne: false
            referencedRelation: "v_credito_resumo_financeiro"
            referencedColumns: ["parceiro_id"]
          },
          {
            foreignKeyName: "parceiro_marcos_parceiro_id_fkey"
            columns: ["parceiro_id"]
            isOneToOne: false
            referencedRelation: "vw_logistica_agregado"
            referencedColumns: ["transportadora_id"]
          },
          {
            foreignKeyName: "parceiro_marcos_parceiro_id_fkey"
            columns: ["parceiro_id"]
            isOneToOne: false
            referencedRelation: "vw_recebivel_por_conta"
            referencedColumns: ["conta_id"]
          },
        ]
      }
      v_pedidos_fila: {
        Row: {
          analise_credito_id: string | null
          area_atual: string | null
          bandeira_vermelha: boolean | null
          bling_id_destino: string | null
          cancelado_em: string | null
          cancelado_motivo: string | null
          categoria_ka: string | null
          condicao_solicitada: string | null
          data_pedido: string | null
          estagio: string | null
          faturado_em: string | null
          forma_solicitada: string | null
          id: string | null
          id_externo: string | null
          idade_minutos: number | null
          marcacao: string | null
          nivel_programa: string | null
          origem: string | null
          parceiro_cnpj: string | null
          parceiro_id: string | null
          parceiro_razao: string | null
          prioridade_motivo: string | null
          prioridade_score: number | null
          proxima_acao: string | null
          recebido_em: string | null
          recebido_via: string | null
          sla_estourado: boolean | null
          tipo_pagamento: string | null
          valor_bruto: number | null
          valor_liquido: number | null
          vendedor: string | null
        }
        Relationships: [
          {
            foreignKeyName: "pedidos_parceiro_id_fkey"
            columns: ["parceiro_id"]
            isOneToOne: false
            referencedRelation: "parceiros_comerciais"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pedidos_parceiro_id_fkey"
            columns: ["parceiro_id"]
            isOneToOne: false
            referencedRelation: "v_credito_resumo_financeiro"
            referencedColumns: ["parceiro_id"]
          },
          {
            foreignKeyName: "pedidos_parceiro_id_fkey"
            columns: ["parceiro_id"]
            isOneToOne: false
            referencedRelation: "vw_logistica_agregado"
            referencedColumns: ["transportadora_id"]
          },
          {
            foreignKeyName: "pedidos_parceiro_id_fkey"
            columns: ["parceiro_id"]
            isOneToOne: false
            referencedRelation: "vw_recebivel_por_conta"
            referencedColumns: ["conta_id"]
          },
        ]
      }
      v_pedidos_pipeline: {
        Row: {
          area_atual: string | null
          estagio: string | null
          qtd: number | null
          qtd_sla_estourado: number | null
          soma_valor: number | null
        }
        Relationships: []
      }
      v_pedidos_priorizados: {
        Row: {
          area_atual: string | null
          categoria_ka: string | null
          estagio: string | null
          estagio_atualizado_em: string | null
          forma_solicitada: string | null
          id: string | null
          id_externo: string | null
          nivel_programa: string | null
          parceiro_cadastro_incompleto: boolean | null
          parceiro_cnpj: string | null
          parceiro_id: string | null
          parceiro_razao_social: string | null
          recebido_em: string | null
          s_destrava: number | null
          s_expira: number | null
          s_idade: number | null
          s_ka_mestre: number | null
          s_urgencia: number | null
          s_valor: number | null
          score_breakdown: Json | null
          score_total: number | null
          urgencia_declarada: string | null
          urgencia_observacao: string | null
          valor_liquido: number | null
        }
        Relationships: [
          {
            foreignKeyName: "pedidos_parceiro_id_fkey"
            columns: ["parceiro_id"]
            isOneToOne: false
            referencedRelation: "parceiros_comerciais"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pedidos_parceiro_id_fkey"
            columns: ["parceiro_id"]
            isOneToOne: false
            referencedRelation: "v_credito_resumo_financeiro"
            referencedColumns: ["parceiro_id"]
          },
          {
            foreignKeyName: "pedidos_parceiro_id_fkey"
            columns: ["parceiro_id"]
            isOneToOne: false
            referencedRelation: "vw_logistica_agregado"
            referencedColumns: ["transportadora_id"]
          },
          {
            foreignKeyName: "pedidos_parceiro_id_fkey"
            columns: ["parceiro_id"]
            isOneToOne: false
            referencedRelation: "vw_recebivel_por_conta"
            referencedColumns: ["conta_id"]
          },
        ]
      }
      vw_analise_despesas: {
        Row: {
          bloco: string | null
          centro_custo_id: string | null
          centro_nome: string | null
          classificacao_completa: boolean | null
          competencia: string | null
          conciliada: boolean | null
          conta_pagar_id: string | null
          descricao: string | null
          fornecedor_cliente: string | null
          grupo_codigo: string | null
          grupo_nome: string | null
          id: string | null
          nf_numero: string | null
          parceiro_id: string | null
          plano_codigo: string | null
          plano_contas_id: string | null
          plano_nome: string | null
          revisao_origem: string | null
          status: string | null
          tipo_plano: string | null
          valor: number | null
        }
        Relationships: [
          {
            foreignKeyName: "nfs_stage_conta_pagar_id_fkey"
            columns: ["conta_pagar_id"]
            isOneToOne: false
            referencedRelation: "contas_pagar"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "nfs_stage_conta_pagar_id_fkey"
            columns: ["conta_pagar_id"]
            isOneToOne: false
            referencedRelation: "contas_pagar_receber"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "nfs_stage_conta_pagar_id_fkey"
            columns: ["conta_pagar_id"]
            isOneToOne: false
            referencedRelation: "contas_pagar_receber_ativas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "nfs_stage_conta_pagar_id_fkey"
            columns: ["conta_pagar_id"]
            isOneToOne: false
            referencedRelation: "v_cpr_bola_redonda"
            referencedColumns: ["cpr_id"]
          },
          {
            foreignKeyName: "nfs_stage_conta_pagar_id_fkey"
            columns: ["conta_pagar_id"]
            isOneToOne: false
            referencedRelation: "vw_conciliacao_furos"
            referencedColumns: ["sugestao_cpr_id"]
          },
          {
            foreignKeyName: "nfs_stage_conta_pagar_id_fkey"
            columns: ["conta_pagar_id"]
            isOneToOne: false
            referencedRelation: "vw_contas_pagar_consolidado"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "nfs_stage_conta_pagar_id_fkey"
            columns: ["conta_pagar_id"]
            isOneToOne: false
            referencedRelation: "vw_despesas_match_sugestoes"
            referencedColumns: ["cpr_id"]
          },
          {
            foreignKeyName: "nfs_stage_conta_pagar_id_fkey"
            columns: ["conta_pagar_id"]
            isOneToOne: false
            referencedRelation: "vw_documentos_envio_estados"
            referencedColumns: ["conta_id"]
          },
          {
            foreignKeyName: "nfs_stage_conta_pagar_id_fkey"
            columns: ["conta_pagar_id"]
            isOneToOne: false
            referencedRelation: "vw_pj_pagamentos"
            referencedColumns: ["cpr_id"]
          },
        ]
      }
      vw_beneficios_consolidado: {
        Row: {
          beneficio: string | null
          data_fim: string | null
          data_inicio: string | null
          departamento: string | null
          id: string | null
          numero_cartao: string | null
          operadora: string | null
          pessoa: string | null
          status: string | null
          tipo_vinculo: string | null
          valor_desconto: number | null
          valor_empresa: number | null
          vinculo_id: string | null
        }
        Relationships: [
          {
            foreignKeyName: "vinculo_beneficios_vinculo_id_fkey"
            columns: ["vinculo_id"]
            isOneToOne: false
            referencedRelation: "vinculos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vinculo_beneficios_vinculo_id_fkey"
            columns: ["vinculo_id"]
            isOneToOne: false
            referencedRelation: "vw_custo_pessoas"
            referencedColumns: ["vinculo_id"]
          },
          {
            foreignKeyName: "vinculo_beneficios_vinculo_id_fkey"
            columns: ["vinculo_id"]
            isOneToOne: false
            referencedRelation: "vw_nf_vinculo_pessoa"
            referencedColumns: ["vinculo_id"]
          },
          {
            foreignKeyName: "vinculo_beneficios_vinculo_id_fkey"
            columns: ["vinculo_id"]
            isOneToOne: false
            referencedRelation: "vw_organograma"
            referencedColumns: ["vinculo_id"]
          },
          {
            foreignKeyName: "vinculo_beneficios_vinculo_id_fkey"
            columns: ["vinculo_id"]
            isOneToOne: false
            referencedRelation: "vw_pj_notas_fiscais"
            referencedColumns: ["vinculo_id"]
          },
          {
            foreignKeyName: "vinculo_beneficios_vinculo_id_fkey"
            columns: ["vinculo_id"]
            isOneToOne: false
            referencedRelation: "vw_pj_pagamentos"
            referencedColumns: ["vinculo_id"]
          },
          {
            foreignKeyName: "vinculo_beneficios_vinculo_id_fkey"
            columns: ["vinculo_id"]
            isOneToOne: false
            referencedRelation: "vw_vinculo_custo_total"
            referencedColumns: ["vinculo_id"]
          },
        ]
      }
      vw_cobranca_divergencias: {
        Row: {
          dia: string | null
          diferenca: number | null
          linhas_extrato: number | null
          qtd_sinteticas: number | null
          soma_sinteticas: number | null
          valor_extrato: number | null
        }
        Relationships: []
      }
      vw_conciliacao_cartao_sugestoes: {
        Row: {
          bandeira: string | null
          delta: number | null
          n_parcelas: number | null
          natureza: string | null
          ofx_data: string | null
          ofx_id: string | null
          ofx_valor: number | null
          parcela_ids: string[] | null
          soma_grupo: number | null
          status: string | null
        }
        Relationships: []
      }
      vw_conciliacao_furos: {
        Row: {
          banco: string | null
          contraparte_documento: string | null
          contraparte_nome: string | null
          data_transacao: string | null
          descricao: string | null
          dias_em_aberto: number | null
          fonte_sugestao: string | null
          id: string | null
          sugestao_contraparte: string | null
          sugestao_cpr_id: string | null
          sugestao_score: number | null
          sugestao_stage_id: string | null
          tem_sugestao: boolean | null
          tipo_meio: string | null
          valor: number | null
        }
        Relationships: []
      }
      vw_contas_pagar_consolidado: {
        Row: {
          aprovado_em: string | null
          aprovado_por: string | null
          atrasada: boolean | null
          cartao_id: string | null
          centro_custo_id: string | null
          comprovante_url: string | null
          created_at: string | null
          criado_por: string | null
          data_pagamento: string | null
          data_vencimento: string | null
          descricao: string | null
          eh_cartao: boolean | null
          enviado_pagamento_em: string | null
          forma_pagamento_id: string | null
          fornecedor_id: string | null
          id: string | null
          meio_codigo: string | null
          meio_pagamento_id: string | null
          mov_conciliada: boolean | null
          mov_data: string | null
          mov_descricao: string | null
          mov_valor: number | null
          movimentacao_bancaria_id: string | null
          nf_fornecedor: string | null
          nf_numero_repositorio: string | null
          nf_stage_id: string | null
          nf_tipo: string | null
          nf_valor: number | null
          numero_parcela: number | null
          observacao: string | null
          origem: string | null
          pago_em_conta_id: string | null
          parceiro_id: string | null
          parcela_atual: number | null
          parcela_grupo_id: string | null
          pasta_contrato_id: string | null
          plano_contas_id: string | null
          status: string | null
          status_efetivo: string | null
          tags: Json | null
          tem_doc_pendente: boolean | null
          updated_at: string | null
          valor: number | null
        }
        Relationships: [
          {
            foreignKeyName: "contas_pagar_receber_cartao_id_fkey"
            columns: ["cartao_id"]
            isOneToOne: false
            referencedRelation: "cartoes_credito"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contas_pagar_receber_centro_custo_id_fkey"
            columns: ["centro_custo_id"]
            isOneToOne: false
            referencedRelation: "centros_custo"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contas_pagar_receber_centro_custo_id_fkey"
            columns: ["centro_custo_id"]
            isOneToOne: false
            referencedRelation: "vw_custo_pessoas"
            referencedColumns: ["centro_custo_id"]
          },
          {
            foreignKeyName: "contas_pagar_receber_centro_custo_id_fkey"
            columns: ["centro_custo_id"]
            isOneToOne: false
            referencedRelation: "vw_dimensionamento_areas"
            referencedColumns: ["centro_custo_id"]
          },
          {
            foreignKeyName: "contas_pagar_receber_forma_pagamento_id_fkey"
            columns: ["forma_pagamento_id"]
            isOneToOne: false
            referencedRelation: "formas_pagamento"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contas_pagar_receber_meio_pagamento_id_fkey"
            columns: ["meio_pagamento_id"]
            isOneToOne: false
            referencedRelation: "meios_pagamento"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contas_pagar_receber_movimentacao_bancaria_id_fkey"
            columns: ["movimentacao_bancaria_id"]
            isOneToOne: false
            referencedRelation: "movimentacoes_bancarias"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contas_pagar_receber_movimentacao_bancaria_id_fkey"
            columns: ["movimentacao_bancaria_id"]
            isOneToOne: false
            referencedRelation: "vw_conciliacao_cartao_sugestoes"
            referencedColumns: ["ofx_id"]
          },
          {
            foreignKeyName: "contas_pagar_receber_movimentacao_bancaria_id_fkey"
            columns: ["movimentacao_bancaria_id"]
            isOneToOne: false
            referencedRelation: "vw_conciliacao_furos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contas_pagar_receber_movimentacao_bancaria_id_fkey"
            columns: ["movimentacao_bancaria_id"]
            isOneToOne: false
            referencedRelation: "vw_despesas_match_nf_sugestoes"
            referencedColumns: ["mov_id"]
          },
          {
            foreignKeyName: "contas_pagar_receber_movimentacao_bancaria_id_fkey"
            columns: ["movimentacao_bancaria_id"]
            isOneToOne: false
            referencedRelation: "vw_despesas_match_sugestoes"
            referencedColumns: ["mov_id"]
          },
          {
            foreignKeyName: "contas_pagar_receber_movimentacao_bancaria_id_fkey"
            columns: ["movimentacao_bancaria_id"]
            isOneToOne: false
            referencedRelation: "vw_pares_transferencia_sugeridos"
            referencedColumns: ["credito_id"]
          },
          {
            foreignKeyName: "contas_pagar_receber_movimentacao_bancaria_id_fkey"
            columns: ["movimentacao_bancaria_id"]
            isOneToOne: false
            referencedRelation: "vw_pares_transferencia_sugeridos"
            referencedColumns: ["debito_id"]
          },
          {
            foreignKeyName: "contas_pagar_receber_movimentacao_bancaria_id_fkey"
            columns: ["movimentacao_bancaria_id"]
            isOneToOne: false
            referencedRelation: "vw_recebivel_b2c_pedido"
            referencedColumns: ["movimentacao_id"]
          },
          {
            foreignKeyName: "contas_pagar_receber_pago_em_conta_id_fkey"
            columns: ["pago_em_conta_id"]
            isOneToOne: false
            referencedRelation: "contas_bancarias"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contas_pagar_receber_parceiro_id_fkey"
            columns: ["parceiro_id"]
            isOneToOne: false
            referencedRelation: "parceiros_comerciais"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contas_pagar_receber_parceiro_id_fkey"
            columns: ["parceiro_id"]
            isOneToOne: false
            referencedRelation: "v_credito_resumo_financeiro"
            referencedColumns: ["parceiro_id"]
          },
          {
            foreignKeyName: "contas_pagar_receber_parceiro_id_fkey"
            columns: ["parceiro_id"]
            isOneToOne: false
            referencedRelation: "vw_logistica_agregado"
            referencedColumns: ["transportadora_id"]
          },
          {
            foreignKeyName: "contas_pagar_receber_parceiro_id_fkey"
            columns: ["parceiro_id"]
            isOneToOne: false
            referencedRelation: "vw_recebivel_por_conta"
            referencedColumns: ["conta_id"]
          },
          {
            foreignKeyName: "contas_pagar_receber_pasta_contrato_id_fkey"
            columns: ["pasta_contrato_id"]
            isOneToOne: false
            referencedRelation: "pasta_contratos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contas_pagar_receber_plano_contas_id_fkey"
            columns: ["plano_contas_id"]
            isOneToOne: false
            referencedRelation: "plano_contas"
            referencedColumns: ["id"]
          },
        ]
      }
      vw_custo_pessoas: {
        Row: {
          cargo: string | null
          centro_custo_id: string | null
          centro_custo_nome: string | null
          custo_recorrente_mensal: number | null
          departamento: string | null
          nome: string | null
          pessoa_id: string | null
          tipo_vinculo: string | null
          total_beneficios: number | null
          total_extras_recorrentes: number | null
          valor_base: number | null
          valor_transporte: number | null
          vinculo_id: string | null
        }
        Relationships: []
      }
      vw_despesas_match_nf_sugestoes: {
        Row: {
          data_transacao: string | null
          fornecedor_cnpj: string | null
          fornecedor_razao_social: string | null
          mov_descricao: string | null
          mov_id: string | null
          nf_data_emissao: string | null
          nf_numero: string | null
          nf_valor: number | null
          rk: number | null
          score: number | null
          stage_id: string | null
          valor_abs: number | null
        }
        Relationships: []
      }
      vw_despesas_match_sugestoes: {
        Row: {
          cpr_descricao: string | null
          cpr_id: string | null
          cpr_status: string | null
          cpr_valor: number | null
          data_pagamento: string | null
          data_transacao: string | null
          data_vencimento: string | null
          mov_descricao: string | null
          mov_id: string | null
          parceiro_cnpj: string | null
          parceiro_nome: string | null
          rk: number | null
          score: number | null
          valor_abs: number | null
        }
        Relationships: []
      }
      vw_dimensionamento_areas: {
        Row: {
          centro_custo: string | null
          centro_custo_id: string | null
          custo_beneficios_extras: number | null
          custo_transporte: number | null
          custo_valor_base: number | null
          ocupados: number | null
          ocupados_clt: number | null
          ocupados_pj: number | null
          tamanho_planejado: number | null
          vagas_abertas: number | null
          vagas_em_processo: number | null
          vagas_futuras: number | null
        }
        Relationships: []
      }
      vw_documentos_envio_estados: {
        Row: {
          cancelada_apos_envio: boolean | null
          conta_id: string | null
          data_pagamento: string | null
          data_vencimento: string | null
          descricao: string | null
          dias_aguardando: number | null
          docs_status: string | null
          estado_envio: string | null
          fornecedor_cliente: string | null
          nf_aplicavel: boolean | null
          nf_aplicavel_motivo: string | null
          nf_numero: string | null
          nf_stage_id: string | null
          parceiro_cnpj: string | null
          parceiro_id: string | null
          parceiro_nome_fantasia: string | null
          parceiro_razao_social: string | null
          status_conta: string | null
          tem_nf_anexada: boolean | null
          ultima_remessa_em: string | null
          ultima_remessa_id: string | null
          valor: number | null
        }
        Relationships: [
          {
            foreignKeyName: "contas_pagar_receber_parceiro_id_fkey"
            columns: ["parceiro_id"]
            isOneToOne: false
            referencedRelation: "parceiros_comerciais"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contas_pagar_receber_parceiro_id_fkey"
            columns: ["parceiro_id"]
            isOneToOne: false
            referencedRelation: "v_credito_resumo_financeiro"
            referencedColumns: ["parceiro_id"]
          },
          {
            foreignKeyName: "contas_pagar_receber_parceiro_id_fkey"
            columns: ["parceiro_id"]
            isOneToOne: false
            referencedRelation: "vw_logistica_agregado"
            referencedColumns: ["transportadora_id"]
          },
          {
            foreignKeyName: "contas_pagar_receber_parceiro_id_fkey"
            columns: ["parceiro_id"]
            isOneToOne: false
            referencedRelation: "vw_recebivel_por_conta"
            referencedColumns: ["conta_id"]
          },
          {
            foreignKeyName: "remessas_contador_itens_remessa_id_fkey"
            columns: ["ultima_remessa_id"]
            isOneToOne: false
            referencedRelation: "remessas_contador"
            referencedColumns: ["id"]
          },
        ]
      }
      vw_exposicao_por_grupo: {
        Row: {
          grupo_ativo: boolean | null
          grupo_id: string | null
          grupo_nome: string | null
          qtd_contas_12m: number | null
          qtd_parceiros_ativos: number | null
          qtd_parceiros_total: number | null
          tipo_controle: string | null
          total_pagar_12m: number | null
          total_receber_12m: number | null
        }
        Relationships: []
      }
      vw_faturas_cartao_resumo: {
        Row: {
          cartao_id: string | null
          created_at: string | null
          data_emissao: string | null
          data_vencimento: string | null
          fonte_importacao: string | null
          id: string | null
          numero_documento: string | null
          observacao: string | null
          pdf_nome_original: string | null
          pdf_storage_path: string | null
          periodo_fim: string | null
          periodo_inicio: string | null
          qtd_conciliados: number | null
          qtd_ignorados: number | null
          qtd_lancamentos: number | null
          qtd_pendentes: number | null
          status: string | null
          valor_conciliado: number | null
          valor_ignorado: number | null
          valor_pendente: number | null
          valor_total: number | null
        }
        Relationships: [
          {
            foreignKeyName: "faturas_cartao_cartao_id_fkey"
            columns: ["cartao_id"]
            isOneToOne: false
            referencedRelation: "cartoes_credito"
            referencedColumns: ["id"]
          },
        ]
      }
      vw_fluxo_caixa_futuro: {
        Row: {
          mes_referencia: string | null
          qtd_compromissos: number | null
          qtd_parcelas: number | null
          valor_total: number | null
        }
        Relationships: []
      }
      vw_fluxo_futuro_investimento: {
        Row: {
          data_evento: string | null
          evento_descricao: string | null
          evento_id: string | null
          frente_codigo: string | null
          frente_id: string | null
          frente_nome: string | null
          frente_ordem: number | null
          linha_descricao: string | null
          linha_id: string | null
          origem: string | null
          status_cpr: string | null
          tema_id: string | null
          tema_nome: string | null
          valor: number | null
        }
        Relationships: []
      }
      vw_frentes_investimento_kpis: {
        Row: {
          ativa: boolean | null
          codigo: string | null
          descricao: string | null
          frente_id: string | null
          nome: string | null
          ordem: number | null
          qtd_cpr_pagos: number | null
          qtd_linhas: number | null
          qtd_temas_com_linhas: number | null
          total_fechado: number | null
          total_inicial: number | null
          total_lancado: number | null
          total_pago: number | null
          total_saldo: number | null
          total_saving: number | null
        }
        Relationships: []
      }
      vw_ged_documentos_soltos: {
        Row: {
          tamanho_total_bytes: number | null
          total: number | null
        }
        Relationships: []
      }
      vw_ged_pastas_kpis: {
        Row: {
          area: string | null
          ativa: boolean | null
          contratos_vigentes: number | null
          cor: string | null
          created_at: string | null
          descricao: string | null
          id: string | null
          nome: string | null
          parceiro_id: string | null
          parceiro_nome: string | null
          parent_id: string | null
          proximo_vencimento_contrato: string | null
          responsavel_id: string | null
          status: string | null
          tamanho_total_bytes: number | null
          tipo: string | null
          total_contratos: number | null
          total_documentos: number | null
          ultimo_upload: string | null
          updated_at: string | null
          valor_mensal_estimado: number | null
        }
        Relationships: [
          {
            foreignKeyName: "ged_pastas_parceiro_id_fkey"
            columns: ["parceiro_id"]
            isOneToOne: false
            referencedRelation: "parceiros_comerciais"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ged_pastas_parceiro_id_fkey"
            columns: ["parceiro_id"]
            isOneToOne: false
            referencedRelation: "v_credito_resumo_financeiro"
            referencedColumns: ["parceiro_id"]
          },
          {
            foreignKeyName: "ged_pastas_parceiro_id_fkey"
            columns: ["parceiro_id"]
            isOneToOne: false
            referencedRelation: "vw_logistica_agregado"
            referencedColumns: ["transportadora_id"]
          },
          {
            foreignKeyName: "ged_pastas_parceiro_id_fkey"
            columns: ["parceiro_id"]
            isOneToOne: false
            referencedRelation: "vw_recebivel_por_conta"
            referencedColumns: ["conta_id"]
          },
          {
            foreignKeyName: "ged_pastas_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "ged_pastas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ged_pastas_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "vw_ged_pastas_kpis"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ged_pastas_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "vw_pastas_kpis"
            referencedColumns: ["id"]
          },
        ]
      }
      vw_gestao_b2c: {
        Row: {
          alerta: string | null
          cancelled_at: string | null
          created_at_shopify: string | null
          discount_amount: number | null
          estagio_derivado: string | null
          financial_status: string | null
          frete_realizado: number | null
          fulfilled_at: string | null
          fulfillment_status: string | null
          order_name: string | null
          paid_at: string | null
          payment_method: string | null
          rastreio_atualizado_em: string | null
          rastreio_classe: string | null
          rastreio_codigo: string | null
          rastreio_cte: string | null
          rastreio_data: string | null
          rastreio_entregue: boolean | null
          rastreio_label: string | null
          rastreio_prazo: string | null
          rastreio_status: string | null
          rastreio_texto: string | null
          refunded_amount: number | null
          shipping_city: string | null
          shipping_cost: number | null
          shipping_method: string | null
          shipping_province: string | null
          shipping_zip: string | null
          shopify_id: string | null
          subtotal: number | null
          total: number | null
          tracking_company: string | null
          tracking_number: string | null
          wns_fase_descricao: string | null
          wns_pedidowns: number | null
          wns_sequencia: number | null
        }
        Relationships: []
      }
      vw_gestao_pedidos: {
        Row: {
          a_receber_valor: number | null
          alerta_logistica: string | null
          area_atual: string | null
          bandeira_vermelha: boolean | null
          condicao_solicitada: string | null
          data_entrega_real: string | null
          data_pedido: string | null
          entrada_status: string | null
          estagio: string | null
          faturado_valor: number | null
          forma_pagamento: string | null
          forma_solicitada: string | null
          frete_cobrado: number | null
          frete_cotacao: number | null
          frete_cotacao_pct: number | null
          frete_desvio: number | null
          frete_realizado: number | null
          frete_realizado_pct: number | null
          frete_tipo: string | null
          id: string | null
          id_externo: string | null
          idade_minutos: number | null
          marcacao: string | null
          nf_chave: string | null
          nf_numero: string | null
          nf_situacao: string | null
          nf_tem: boolean | null
          nivel_programa: string | null
          origem: string | null
          parceiro_cnpj: string | null
          parceiro_razao: string | null
          previsao_entrega: string | null
          prioridade_score: number | null
          proposta_original_bruto: number | null
          proposta_original_liquido: number | null
          proposta_real_bruto: number | null
          proposta_real_liquido: number | null
          proxima_acao: string | null
          rastreio_codigo: string | null
          rastreio_entregue: boolean | null
          rastreio_status: string | null
          recebido_em: string | null
          recebido_via: string | null
          remessa_qtd: number | null
          splits_qtd: number | null
          status_remessas: string | null
          tem_split: boolean | null
          tipo_pagamento: string | null
          titulos_abertos_qtd: number | null
          titulos_criados: boolean | null
          titulos_entrada_qtd: number | null
          titulos_qtd: number | null
          titulos_total_parcelas: number | null
          titulos_valor_parcela: number | null
          titulos_valor_total: number | null
          transportadora_definida: string | null
          transportadora_nf: string | null
          vendedor: string | null
        }
        Relationships: []
      }
      vw_lancamentos_caixa_banco: {
        Row: {
          cartao_id: string | null
          cartao_nome: string | null
          conciliado_em: string | null
          conciliado_por: string | null
          conta_bancaria_nome: string | null
          conta_pagar_id: string | null
          created_at: string | null
          data_enviada_para_pagamento: string | null
          data_pagamento: string | null
          data_vencimento: string | null
          descricao: string | null
          fatura_id: string | null
          fatura_vencimento: string | null
          forma_pagamento_id: string | null
          fornecedor_cliente: string | null
          id: string | null
          meio_pagamento_id: string | null
          movimentacao_bancaria_id: string | null
          nf_numero: string | null
          observacao_pagamento_manual: string | null
          origem_view: string | null
          pago_em: string | null
          pago_em_conta_id: string | null
          parceiro_id: string | null
          plano_contas_id: string | null
          status_caixa: string | null
          status_conta_pagar: string | null
          tipo: string | null
          unidade_id: string | null
          valor: number | null
          vinculada_cartao: boolean | null
        }
        Relationships: []
      }
      vw_linhas_investimento_kpis: {
        Row: {
          ativa: boolean | null
          data_prevista_pagamento: string | null
          descricao: string | null
          frente_id: string | null
          linha_id: string | null
          observacao: string | null
          qtd_cpr: number | null
          qtd_cpr_pagos: number | null
          responsavel_id: string | null
          saldo: number | null
          saving: number | null
          tema_id: string | null
          valor_fechado: number | null
          valor_inicial: number | null
          valor_lancado: number | null
          valor_pago: number | null
        }
        Relationships: [
          {
            foreignKeyName: "linhas_investimento_tema_id_fkey"
            columns: ["tema_id"]
            isOneToOne: false
            referencedRelation: "temas_investimento"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "linhas_investimento_tema_id_fkey"
            columns: ["tema_id"]
            isOneToOne: false
            referencedRelation: "vw_temas_investimento_kpis"
            referencedColumns: ["tema_id"]
          },
          {
            foreignKeyName: "temas_investimento_frente_id_fkey"
            columns: ["frente_id"]
            isOneToOne: false
            referencedRelation: "frentes_investimento"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "temas_investimento_frente_id_fkey"
            columns: ["frente_id"]
            isOneToOne: false
            referencedRelation: "vw_frentes_investimento_kpis"
            referencedColumns: ["frente_id"]
          },
        ]
      }
      vw_logistica_agregado: {
        Row: {
          atencao: number | null
          cnpj: string | null
          coletados: number | null
          com_pedido: number | null
          devolucoes: number | null
          em_transito: number | null
          entregues: number | null
          frete_total: number | null
          pct_frete_nf: number | null
          total_ctes: number | null
          total_nfs: number | null
          transportadora: string | null
          transportadora_id: string | null
          uf: string | null
          valor_nf_total: number | null
        }
        Relationships: []
      }
      vw_logistica_custo_transportadora: {
        Row: {
          frete_medio: number | null
          frete_total: number | null
          pct_frete_nf_medio: number | null
          peso_taxado_total: number | null
          qtd_fretes: number | null
          transportadora: string | null
          transportadora_id: string | null
        }
        Relationships: [
          {
            foreignKeyName: "transp_fretes_transportadora_id_fkey"
            columns: ["transportadora_id"]
            isOneToOne: false
            referencedRelation: "parceiros_comerciais"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transp_fretes_transportadora_id_fkey"
            columns: ["transportadora_id"]
            isOneToOne: false
            referencedRelation: "v_credito_resumo_financeiro"
            referencedColumns: ["parceiro_id"]
          },
          {
            foreignKeyName: "transp_fretes_transportadora_id_fkey"
            columns: ["transportadora_id"]
            isOneToOne: false
            referencedRelation: "vw_logistica_agregado"
            referencedColumns: ["transportadora_id"]
          },
          {
            foreignKeyName: "transp_fretes_transportadora_id_fkey"
            columns: ["transportadora_id"]
            isOneToOne: false
            referencedRelation: "vw_recebivel_por_conta"
            referencedColumns: ["conta_id"]
          },
        ]
      }
      vw_logistica_frete_mensal: {
        Row: {
          frete_total: number | null
          mes: string | null
          pct_frete_nf_medio: number | null
          qtd_fretes: number | null
        }
        Relationships: []
      }
      vw_logistica_pnl_mensal: {
        Row: {
          base_nf: number | null
          cnpj_raiz: string | null
          ctes: number | null
          custo_frete: number | null
          margem: number | null
          mes: string | null
          nfs: number | null
          nfs_com_frete: number | null
          receita_frete: number | null
          receita_sem_custo: boolean | null
          transportadora: string | null
        }
        Relationships: []
      }
      vw_motor_fila_por_cnpj: {
        Row: {
          fornecedor: string | null
          fornecedor_cnpj: string | null
          qtd_a_revisar: number | null
          valor_total: number | null
        }
        Relationships: []
      }
      vw_motor_resumo: {
        Row: {
          a_revisar: number | null
          carimbadas_humano: number | null
          carimbadas_motor: number | null
          regras_confirmadas: number | null
          revisadas: number | null
          total_ativas: number | null
        }
        Relationships: []
      }
      vw_movimentacoes_gerencial: {
        Row: {
          categoria_confirmada: boolean | null
          centro_custo_id: string | null
          centro_custo_nome: string | null
          classificacao_completa: boolean | null
          competencia: string | null
          data_pagamento: string | null
          data_vencimento: string | null
          descricao: string | null
          fornecedor_cliente: string | null
          id: string | null
          nf_numero: string | null
          parceiro_id: string | null
          plano_contas_id: string | null
          plano_contas_nome: string | null
          status: string | null
          tipo: string | null
          valor: number | null
        }
        Relationships: []
      }
      vw_nf_pedido_resolvido: {
        Row: {
          canal: string | null
          nf_id: string | null
          pedido_ref: string | null
        }
        Relationships: []
      }
      vw_nf_vinculo_pessoa: {
        Row: {
          fornecedor_cnpj: string | null
          fornecedor_razao_social: string | null
          nf_data_emissao: string | null
          nf_numero: string | null
          pessoa_id: string | null
          pessoa_nome: string | null
          plano_contas_id: string | null
          revisada_em: string | null
          stage_id: string | null
          tem_vinculo_pessoa: boolean | null
          tipo_vinculo: string | null
          valor: number | null
          vinculo_id: string | null
          vinculo_status: string | null
        }
        Relationships: [
          {
            foreignKeyName: "nfs_stage_plano_contas_id_fkey"
            columns: ["plano_contas_id"]
            isOneToOne: false
            referencedRelation: "plano_contas"
            referencedColumns: ["id"]
          },
        ]
      }
      vw_nfs_stage_completude: {
        Row: {
          categoria_id: string | null
          categoria_sugerida_ia: boolean | null
          centro_custo_id: string | null
          completude: string | null
          conta_pagar_id: string | null
          created_at: string | null
          criada_por: string | null
          data_vencimento: string | null
          descricao: string | null
          documentos: Json | null
          duplicatas: Json | null
          fonte: string | null
          fornecedor_cliente: string | null
          fornecedor_cnpj: string | null
          fornecedor_razao_social: string | null
          id: string | null
          importacao_lote_id: string | null
          itens: Json | null
          match_motivos: string | null
          match_score: number | null
          moeda: string | null
          motivo_descarte: string | null
          nf_chave_acesso: string | null
          nf_data_emissao: string | null
          nf_numero: string | null
          nf_serie: string | null
          numero_documento_referencia: string | null
          numero_parcela: number | null
          pais_emissor: string | null
          parceiro_id: string | null
          plano_contas_id: string | null
          qtd_boletos: number | null
          resumo_pdf_gerado_em: string | null
          resumo_pdf_pendente: boolean | null
          resumo_pdf_storage_path: string | null
          revisada_em: string | null
          revisada_por: string | null
          soma_boletos: number | null
          status: string | null
          taxa_conversao: number | null
          tem_boleto: boolean | null
          tem_pdf: boolean | null
          tem_xml: boolean | null
          tem_xml_obrigatorio: boolean | null
          tipo_documento: string | null
          total_parcelas: number | null
          updated_at: string | null
          valor: number | null
          valor_exibido: number | null
          valor_origem: number | null
        }
        Relationships: [
          {
            foreignKeyName: "nfs_stage_centro_custo_id_fkey"
            columns: ["centro_custo_id"]
            isOneToOne: false
            referencedRelation: "centros_custo"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "nfs_stage_centro_custo_id_fkey"
            columns: ["centro_custo_id"]
            isOneToOne: false
            referencedRelation: "vw_custo_pessoas"
            referencedColumns: ["centro_custo_id"]
          },
          {
            foreignKeyName: "nfs_stage_centro_custo_id_fkey"
            columns: ["centro_custo_id"]
            isOneToOne: false
            referencedRelation: "vw_dimensionamento_areas"
            referencedColumns: ["centro_custo_id"]
          },
          {
            foreignKeyName: "nfs_stage_conta_pagar_id_fkey"
            columns: ["conta_pagar_id"]
            isOneToOne: false
            referencedRelation: "contas_pagar"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "nfs_stage_conta_pagar_id_fkey"
            columns: ["conta_pagar_id"]
            isOneToOne: false
            referencedRelation: "contas_pagar_receber"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "nfs_stage_conta_pagar_id_fkey"
            columns: ["conta_pagar_id"]
            isOneToOne: false
            referencedRelation: "contas_pagar_receber_ativas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "nfs_stage_conta_pagar_id_fkey"
            columns: ["conta_pagar_id"]
            isOneToOne: false
            referencedRelation: "v_cpr_bola_redonda"
            referencedColumns: ["cpr_id"]
          },
          {
            foreignKeyName: "nfs_stage_conta_pagar_id_fkey"
            columns: ["conta_pagar_id"]
            isOneToOne: false
            referencedRelation: "vw_conciliacao_furos"
            referencedColumns: ["sugestao_cpr_id"]
          },
          {
            foreignKeyName: "nfs_stage_conta_pagar_id_fkey"
            columns: ["conta_pagar_id"]
            isOneToOne: false
            referencedRelation: "vw_contas_pagar_consolidado"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "nfs_stage_conta_pagar_id_fkey"
            columns: ["conta_pagar_id"]
            isOneToOne: false
            referencedRelation: "vw_despesas_match_sugestoes"
            referencedColumns: ["cpr_id"]
          },
          {
            foreignKeyName: "nfs_stage_conta_pagar_id_fkey"
            columns: ["conta_pagar_id"]
            isOneToOne: false
            referencedRelation: "vw_documentos_envio_estados"
            referencedColumns: ["conta_id"]
          },
          {
            foreignKeyName: "nfs_stage_conta_pagar_id_fkey"
            columns: ["conta_pagar_id"]
            isOneToOne: false
            referencedRelation: "vw_pj_pagamentos"
            referencedColumns: ["cpr_id"]
          },
          {
            foreignKeyName: "nfs_stage_parceiro_id_fkey"
            columns: ["parceiro_id"]
            isOneToOne: false
            referencedRelation: "parceiros_comerciais"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "nfs_stage_parceiro_id_fkey"
            columns: ["parceiro_id"]
            isOneToOne: false
            referencedRelation: "v_credito_resumo_financeiro"
            referencedColumns: ["parceiro_id"]
          },
          {
            foreignKeyName: "nfs_stage_parceiro_id_fkey"
            columns: ["parceiro_id"]
            isOneToOne: false
            referencedRelation: "vw_logistica_agregado"
            referencedColumns: ["transportadora_id"]
          },
          {
            foreignKeyName: "nfs_stage_parceiro_id_fkey"
            columns: ["parceiro_id"]
            isOneToOne: false
            referencedRelation: "vw_recebivel_por_conta"
            referencedColumns: ["conta_id"]
          },
          {
            foreignKeyName: "nfs_stage_plano_contas_id_fkey"
            columns: ["plano_contas_id"]
            isOneToOne: false
            referencedRelation: "plano_contas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "nfs_stage_plano_contas_id_fkey"
            columns: ["categoria_id"]
            isOneToOne: false
            referencedRelation: "plano_contas"
            referencedColumns: ["id"]
          },
        ]
      }
      vw_organograma: {
        Row: {
          cargo: string | null
          data_inicio: string | null
          departamento: string | null
          eh_topo: boolean | null
          gestor_nome: string | null
          gestor_pessoa_id: string | null
          nome: string | null
          pessoa_id: string | null
          status: string | null
          tipo_vinculo: string | null
          unidade: string | null
          vinculo_id: string | null
        }
        Relationships: [
          {
            foreignKeyName: "vinculos_gestor_pessoa_id_fkey"
            columns: ["gestor_pessoa_id"]
            isOneToOne: false
            referencedRelation: "pessoas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vinculos_gestor_pessoa_id_fkey"
            columns: ["gestor_pessoa_id"]
            isOneToOne: false
            referencedRelation: "vw_custo_pessoas"
            referencedColumns: ["pessoa_id"]
          },
          {
            foreignKeyName: "vinculos_gestor_pessoa_id_fkey"
            columns: ["gestor_pessoa_id"]
            isOneToOne: false
            referencedRelation: "vw_nf_vinculo_pessoa"
            referencedColumns: ["pessoa_id"]
          },
          {
            foreignKeyName: "vinculos_gestor_pessoa_id_fkey"
            columns: ["gestor_pessoa_id"]
            isOneToOne: false
            referencedRelation: "vw_organograma"
            referencedColumns: ["pessoa_id"]
          },
          {
            foreignKeyName: "vinculos_gestor_pessoa_id_fkey"
            columns: ["gestor_pessoa_id"]
            isOneToOne: false
            referencedRelation: "vw_pj_notas_fiscais"
            referencedColumns: ["pessoa_id"]
          },
          {
            foreignKeyName: "vinculos_gestor_pessoa_id_fkey"
            columns: ["gestor_pessoa_id"]
            isOneToOne: false
            referencedRelation: "vw_pj_pagamentos"
            referencedColumns: ["pessoa_id"]
          },
        ]
      }
      vw_pares_transferencia_sugeridos: {
        Row: {
          conta_destino_id: string | null
          conta_origem_id: string | null
          contraparte_credito: string | null
          contraparte_debito: string | null
          credito_id: string | null
          data_credito: string | null
          data_debito: string | null
          debito_id: string | null
          descricao_credito: string | null
          descricao_debito: string | null
          dias_diferenca: number | null
          score: number | null
          valor: number | null
        }
        Relationships: [
          {
            foreignKeyName: "movimentacoes_bancarias_conta_bancaria_id_fkey"
            columns: ["conta_origem_id"]
            isOneToOne: false
            referencedRelation: "contas_bancarias"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "movimentacoes_bancarias_conta_bancaria_id_fkey"
            columns: ["conta_destino_id"]
            isOneToOne: false
            referencedRelation: "contas_bancarias"
            referencedColumns: ["id"]
          },
        ]
      }
      vw_pastas_kpis: {
        Row: {
          area: string | null
          ativa: boolean | null
          contratos_vigentes: number | null
          cor: string | null
          created_at: string | null
          descricao: string | null
          id: string | null
          nome: string | null
          parceiro_id: string | null
          parceiro_nome: string | null
          parent_id: string | null
          proximo_vencimento_contrato: string | null
          responsavel_id: string | null
          status: string | null
          tamanho_total_bytes: number | null
          tipo: string | null
          total_contratos: number | null
          total_documentos: number | null
          ultimo_upload: string | null
          updated_at: string | null
          valor_mensal_estimado: number | null
        }
        Relationships: [
          {
            foreignKeyName: "ged_pastas_parceiro_id_fkey"
            columns: ["parceiro_id"]
            isOneToOne: false
            referencedRelation: "parceiros_comerciais"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ged_pastas_parceiro_id_fkey"
            columns: ["parceiro_id"]
            isOneToOne: false
            referencedRelation: "v_credito_resumo_financeiro"
            referencedColumns: ["parceiro_id"]
          },
          {
            foreignKeyName: "ged_pastas_parceiro_id_fkey"
            columns: ["parceiro_id"]
            isOneToOne: false
            referencedRelation: "vw_logistica_agregado"
            referencedColumns: ["transportadora_id"]
          },
          {
            foreignKeyName: "ged_pastas_parceiro_id_fkey"
            columns: ["parceiro_id"]
            isOneToOne: false
            referencedRelation: "vw_recebivel_por_conta"
            referencedColumns: ["conta_id"]
          },
          {
            foreignKeyName: "ged_pastas_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "ged_pastas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ged_pastas_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "vw_ged_pastas_kpis"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ged_pastas_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "vw_pastas_kpis"
            referencedColumns: ["id"]
          },
        ]
      }
      vw_pedido_base: {
        Row: {
          cliente: string | null
          correios_data: string | null
          correios_entregue: boolean | null
          dias_sem_confirmacao: number | null
          entrega_fonte: string | null
          entrega_transportadora: string | null
          entregue: boolean | null
          entregue_com_atraso: boolean | null
          entregue_em: string | null
          estagio_atualizado_em: string | null
          estagio_comercial: string | null
          expedido: boolean | null
          fase_logistica: string | null
          faturado_em: string | null
          id_externo: string | null
          meta: string | null
          parceiro_id: string | null
          pedido_id: string | null
          pre_faturado_em: string | null
          pre_separacao_em: string | null
          recebido_em: string | null
          split_de_pedido_id: string | null
          transportadora_id: string | null
          triado_em: string | null
          valor_bruto: number | null
          valor_liquido: number | null
          wns_fase_desc: string | null
          wns_seq: number | null
          wns_ultima_data: string | null
        }
        Relationships: [
          {
            foreignKeyName: "pedidos_parceiro_id_fkey"
            columns: ["parceiro_id"]
            isOneToOne: false
            referencedRelation: "parceiros_comerciais"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pedidos_parceiro_id_fkey"
            columns: ["parceiro_id"]
            isOneToOne: false
            referencedRelation: "v_credito_resumo_financeiro"
            referencedColumns: ["parceiro_id"]
          },
          {
            foreignKeyName: "pedidos_parceiro_id_fkey"
            columns: ["parceiro_id"]
            isOneToOne: false
            referencedRelation: "vw_logistica_agregado"
            referencedColumns: ["transportadora_id"]
          },
          {
            foreignKeyName: "pedidos_parceiro_id_fkey"
            columns: ["parceiro_id"]
            isOneToOne: false
            referencedRelation: "vw_recebivel_por_conta"
            referencedColumns: ["conta_id"]
          },
          {
            foreignKeyName: "pedidos_split_de_pedido_id_fkey"
            columns: ["split_de_pedido_id"]
            isOneToOne: false
            referencedRelation: "pedidos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pedidos_split_de_pedido_id_fkey"
            columns: ["split_de_pedido_id"]
            isOneToOne: false
            referencedRelation: "v_pedidos_fila"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pedidos_split_de_pedido_id_fkey"
            columns: ["split_de_pedido_id"]
            isOneToOne: false
            referencedRelation: "v_pedidos_priorizados"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pedidos_split_de_pedido_id_fkey"
            columns: ["split_de_pedido_id"]
            isOneToOne: false
            referencedRelation: "vw_gestao_pedidos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pedidos_split_de_pedido_id_fkey"
            columns: ["split_de_pedido_id"]
            isOneToOne: false
            referencedRelation: "vw_pedido_base"
            referencedColumns: ["pedido_id"]
          },
          {
            foreignKeyName: "pedidos_split_de_pedido_id_fkey"
            columns: ["split_de_pedido_id"]
            isOneToOne: false
            referencedRelation: "vw_pedidos_farol"
            referencedColumns: ["pedido_id"]
          },
          {
            foreignKeyName: "pedidos_transportadora_id_fkey"
            columns: ["transportadora_id"]
            isOneToOne: false
            referencedRelation: "parceiros_comerciais"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pedidos_transportadora_id_fkey"
            columns: ["transportadora_id"]
            isOneToOne: false
            referencedRelation: "v_credito_resumo_financeiro"
            referencedColumns: ["parceiro_id"]
          },
          {
            foreignKeyName: "pedidos_transportadora_id_fkey"
            columns: ["transportadora_id"]
            isOneToOne: false
            referencedRelation: "vw_logistica_agregado"
            referencedColumns: ["transportadora_id"]
          },
          {
            foreignKeyName: "pedidos_transportadora_id_fkey"
            columns: ["transportadora_id"]
            isOneToOne: false
            referencedRelation: "vw_recebivel_por_conta"
            referencedColumns: ["conta_id"]
          },
        ]
      }
      vw_pedidos_farol: {
        Row: {
          bloqueio: string | null
          cliente: string | null
          data_estagio: string | null
          data_pg: string | null
          dias_sem_confirmacao: number | null
          dias_vs_meta: number | null
          entregue_com_atraso: boolean | null
          estagio: string | null
          eta_vivo: string | null
          expedido: boolean | null
          fase_gargalo: string | null
          fase_logistica: string | null
          id_externo: string | null
          meta: string | null
          pago_apos_expedicao: boolean | null
          parceiro_id: string | null
          pedido_id: string | null
          prazo: string | null
          sla_cor: string | null
          sla_fase_atual: number | null
          status_label: string | null
          tempo_na_fase: number | null
          valor_liquido: number | null
        }
        Relationships: [
          {
            foreignKeyName: "pedidos_parceiro_id_fkey"
            columns: ["parceiro_id"]
            isOneToOne: false
            referencedRelation: "parceiros_comerciais"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pedidos_parceiro_id_fkey"
            columns: ["parceiro_id"]
            isOneToOne: false
            referencedRelation: "v_credito_resumo_financeiro"
            referencedColumns: ["parceiro_id"]
          },
          {
            foreignKeyName: "pedidos_parceiro_id_fkey"
            columns: ["parceiro_id"]
            isOneToOne: false
            referencedRelation: "vw_logistica_agregado"
            referencedColumns: ["transportadora_id"]
          },
          {
            foreignKeyName: "pedidos_parceiro_id_fkey"
            columns: ["parceiro_id"]
            isOneToOne: false
            referencedRelation: "vw_recebivel_por_conta"
            referencedColumns: ["conta_id"]
          },
        ]
      }
      vw_pedidos_venda: {
        Row: {
          bling_id: string | null
          canal: string | null
          cliente_cnpj_cpf: string | null
          cliente_nome: string | null
          created_at: string | null
          data_pedido: string | null
          data_prevista_entrega: string | null
          data_saida: string | null
          id: string | null
          nf_chave_acesso: string | null
          nf_numero: string | null
          nf_serie: string | null
          numero: string | null
          numero_loja: string | null
          observacoes: string | null
          origem: string | null
          parceiro_id: string | null
          situacao: string | null
          situacao_cor: string | null
          situacao_label: string | null
          situacao_nome: string | null
          situacao_raw: Json | null
          updated_at: string | null
          valor_desconto: number | null
          valor_frete: number | null
          valor_produtos: number | null
          valor_total: number | null
        }
        Relationships: [
          {
            foreignKeyName: "pedidos_venda_parceiro_id_fkey"
            columns: ["parceiro_id"]
            isOneToOne: false
            referencedRelation: "parceiros_comerciais"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pedidos_venda_parceiro_id_fkey"
            columns: ["parceiro_id"]
            isOneToOne: false
            referencedRelation: "v_credito_resumo_financeiro"
            referencedColumns: ["parceiro_id"]
          },
          {
            foreignKeyName: "pedidos_venda_parceiro_id_fkey"
            columns: ["parceiro_id"]
            isOneToOne: false
            referencedRelation: "vw_logistica_agregado"
            referencedColumns: ["transportadora_id"]
          },
          {
            foreignKeyName: "pedidos_venda_parceiro_id_fkey"
            columns: ["parceiro_id"]
            isOneToOne: false
            referencedRelation: "vw_recebivel_por_conta"
            referencedColumns: ["conta_id"]
          },
        ]
      }
      vw_pj_notas_fiscais: {
        Row: {
          cnpj_prestador: string | null
          data_vencimento: string | null
          nf_data_emissao: string | null
          nf_id: string | null
          nf_numero: string | null
          nf_serie: string | null
          pessoa: string | null
          pessoa_id: string | null
          status: string | null
          valor: number | null
          vinculo_id: string | null
        }
        Relationships: []
      }
      vw_pj_pagamentos: {
        Row: {
          cnpj_prestador: string | null
          cpr_id: string | null
          data_pagamento: string | null
          data_vencimento: string | null
          descricao: string | null
          pessoa: string | null
          pessoa_id: string | null
          status: string | null
          tipo: string | null
          valor: number | null
          valor_pago: number | null
          vinculo_id: string | null
        }
        Relationships: []
      }
      vw_previsao_recebimentos: {
        Row: {
          cliente: string | null
          condicional: boolean | null
          conta_id: string | null
          data_liquidacao_prevista: string | null
          data_vencimento: string | null
          estagio: string | null
          id: string | null
          meio_pagamento: string | null
          mes_referencia: string | null
          nf_id: string | null
          nf_numero: string | null
          numero_parcela: number | null
          numero_titulo: string | null
          parceiro_id: string | null
          total_parcelas: number | null
          valor: number | null
        }
        Relationships: [
          {
            foreignKeyName: "contas_pagar_receber_parceiro_id_fkey"
            columns: ["parceiro_id"]
            isOneToOne: false
            referencedRelation: "parceiros_comerciais"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contas_pagar_receber_parceiro_id_fkey"
            columns: ["parceiro_id"]
            isOneToOne: false
            referencedRelation: "v_credito_resumo_financeiro"
            referencedColumns: ["parceiro_id"]
          },
          {
            foreignKeyName: "contas_pagar_receber_parceiro_id_fkey"
            columns: ["parceiro_id"]
            isOneToOne: false
            referencedRelation: "vw_logistica_agregado"
            referencedColumns: ["transportadora_id"]
          },
          {
            foreignKeyName: "contas_pagar_receber_parceiro_id_fkey"
            columns: ["parceiro_id"]
            isOneToOne: false
            referencedRelation: "vw_recebivel_por_conta"
            referencedColumns: ["conta_id"]
          },
          {
            foreignKeyName: "titulo_a_receber_conta_id_fkey"
            columns: ["conta_id"]
            isOneToOne: false
            referencedRelation: "contas_pagar"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "titulo_a_receber_conta_id_fkey"
            columns: ["conta_id"]
            isOneToOne: false
            referencedRelation: "contas_pagar_receber"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "titulo_a_receber_conta_id_fkey"
            columns: ["conta_id"]
            isOneToOne: false
            referencedRelation: "contas_pagar_receber_ativas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "titulo_a_receber_conta_id_fkey"
            columns: ["conta_id"]
            isOneToOne: false
            referencedRelation: "v_cpr_bola_redonda"
            referencedColumns: ["cpr_id"]
          },
          {
            foreignKeyName: "titulo_a_receber_conta_id_fkey"
            columns: ["conta_id"]
            isOneToOne: false
            referencedRelation: "vw_conciliacao_furos"
            referencedColumns: ["sugestao_cpr_id"]
          },
          {
            foreignKeyName: "titulo_a_receber_conta_id_fkey"
            columns: ["conta_id"]
            isOneToOne: false
            referencedRelation: "vw_contas_pagar_consolidado"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "titulo_a_receber_conta_id_fkey"
            columns: ["conta_id"]
            isOneToOne: false
            referencedRelation: "vw_despesas_match_sugestoes"
            referencedColumns: ["cpr_id"]
          },
          {
            foreignKeyName: "titulo_a_receber_conta_id_fkey"
            columns: ["conta_id"]
            isOneToOne: false
            referencedRelation: "vw_documentos_envio_estados"
            referencedColumns: ["conta_id"]
          },
          {
            foreignKeyName: "titulo_a_receber_conta_id_fkey"
            columns: ["conta_id"]
            isOneToOne: false
            referencedRelation: "vw_pj_pagamentos"
            referencedColumns: ["cpr_id"]
          },
          {
            foreignKeyName: "titulo_a_receber_nf_id_fkey"
            columns: ["nf_id"]
            isOneToOne: false
            referencedRelation: "nfs_emitidas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "titulo_a_receber_nf_id_fkey"
            columns: ["nf_id"]
            isOneToOne: false
            referencedRelation: "vw_nf_pedido_resolvido"
            referencedColumns: ["nf_id"]
          },
        ]
      }
      vw_produtos_estoque_virtual: {
        Row: {
          ativo: boolean | null
          codigo: string | null
          estoque_minimo: number | null
          estoque_real: number | null
          estoque_virtual: number | null
          nome: string | null
          reservado: number | null
          status_venda: string | null
        }
        Relationships: []
      }
      vw_recebivel_b2b: {
        Row: {
          banco_nome: string | null
          banco_recebimento_id: string | null
          cliente: string | null
          conciliado: boolean | null
          conta_id: string | null
          data_compra: string | null
          data_liquidacao: string | null
          data_vencimento: string | null
          id: string | null
          liquidacao_confirmada_banco: boolean | null
          liquidacao_realizada: boolean | null
          liquidado: boolean | null
          meio_pagamento: string | null
          nf_id: string | null
          nf_numero: string | null
          numero_parcela: number | null
          numero_titulo: string | null
          pago: boolean | null
          parceiro_id: string | null
          status_gestao: string | null
          total_parcelas: number | null
          valor: number | null
        }
        Relationships: [
          {
            foreignKeyName: "contas_pagar_receber_parceiro_id_fkey"
            columns: ["parceiro_id"]
            isOneToOne: false
            referencedRelation: "parceiros_comerciais"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contas_pagar_receber_parceiro_id_fkey"
            columns: ["parceiro_id"]
            isOneToOne: false
            referencedRelation: "v_credito_resumo_financeiro"
            referencedColumns: ["parceiro_id"]
          },
          {
            foreignKeyName: "contas_pagar_receber_parceiro_id_fkey"
            columns: ["parceiro_id"]
            isOneToOne: false
            referencedRelation: "vw_logistica_agregado"
            referencedColumns: ["transportadora_id"]
          },
          {
            foreignKeyName: "contas_pagar_receber_parceiro_id_fkey"
            columns: ["parceiro_id"]
            isOneToOne: false
            referencedRelation: "vw_recebivel_por_conta"
            referencedColumns: ["conta_id"]
          },
          {
            foreignKeyName: "titulo_a_receber_banco_recebimento_id_fkey"
            columns: ["banco_recebimento_id"]
            isOneToOne: false
            referencedRelation: "banco_recebimento"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "titulo_a_receber_conta_id_fkey"
            columns: ["conta_id"]
            isOneToOne: false
            referencedRelation: "contas_pagar"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "titulo_a_receber_conta_id_fkey"
            columns: ["conta_id"]
            isOneToOne: false
            referencedRelation: "contas_pagar_receber"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "titulo_a_receber_conta_id_fkey"
            columns: ["conta_id"]
            isOneToOne: false
            referencedRelation: "contas_pagar_receber_ativas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "titulo_a_receber_conta_id_fkey"
            columns: ["conta_id"]
            isOneToOne: false
            referencedRelation: "v_cpr_bola_redonda"
            referencedColumns: ["cpr_id"]
          },
          {
            foreignKeyName: "titulo_a_receber_conta_id_fkey"
            columns: ["conta_id"]
            isOneToOne: false
            referencedRelation: "vw_conciliacao_furos"
            referencedColumns: ["sugestao_cpr_id"]
          },
          {
            foreignKeyName: "titulo_a_receber_conta_id_fkey"
            columns: ["conta_id"]
            isOneToOne: false
            referencedRelation: "vw_contas_pagar_consolidado"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "titulo_a_receber_conta_id_fkey"
            columns: ["conta_id"]
            isOneToOne: false
            referencedRelation: "vw_despesas_match_sugestoes"
            referencedColumns: ["cpr_id"]
          },
          {
            foreignKeyName: "titulo_a_receber_conta_id_fkey"
            columns: ["conta_id"]
            isOneToOne: false
            referencedRelation: "vw_documentos_envio_estados"
            referencedColumns: ["conta_id"]
          },
          {
            foreignKeyName: "titulo_a_receber_conta_id_fkey"
            columns: ["conta_id"]
            isOneToOne: false
            referencedRelation: "vw_pj_pagamentos"
            referencedColumns: ["cpr_id"]
          },
          {
            foreignKeyName: "titulo_a_receber_nf_id_fkey"
            columns: ["nf_id"]
            isOneToOne: false
            referencedRelation: "nfs_emitidas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "titulo_a_receber_nf_id_fkey"
            columns: ["nf_id"]
            isOneToOne: false
            referencedRelation: "vw_nf_pedido_resolvido"
            referencedColumns: ["nf_id"]
          },
        ]
      }
      vw_recebivel_b2b_por_conta: {
        Row: {
          cliente: string | null
          dias_atraso_max: number | null
          faixa_1_7: number | null
          faixa_31_60: number | null
          faixa_60_mais: number | null
          faixa_8_30: number | null
          faixa_a_vencer: number | null
          parceiro_id: string | null
          qtd_titulos: number | null
          total_a_receber: number | null
          total_vencido: number | null
        }
        Relationships: [
          {
            foreignKeyName: "contas_pagar_receber_parceiro_id_fkey"
            columns: ["parceiro_id"]
            isOneToOne: false
            referencedRelation: "parceiros_comerciais"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contas_pagar_receber_parceiro_id_fkey"
            columns: ["parceiro_id"]
            isOneToOne: false
            referencedRelation: "v_credito_resumo_financeiro"
            referencedColumns: ["parceiro_id"]
          },
          {
            foreignKeyName: "contas_pagar_receber_parceiro_id_fkey"
            columns: ["parceiro_id"]
            isOneToOne: false
            referencedRelation: "vw_logistica_agregado"
            referencedColumns: ["transportadora_id"]
          },
          {
            foreignKeyName: "contas_pagar_receber_parceiro_id_fkey"
            columns: ["parceiro_id"]
            isOneToOne: false
            referencedRelation: "vw_recebivel_por_conta"
            referencedColumns: ["conta_id"]
          },
        ]
      }
      vw_recebivel_b2b_por_conta_full: {
        Row: {
          cliente: string | null
          dias_atraso_max: number | null
          faixa_1_7: number | null
          faixa_31_60: number | null
          faixa_60_mais: number | null
          faixa_8_30: number | null
          faixa_a_vencer: number | null
          parceiro_id: string | null
          qtd_titulos: number | null
          total_a_receber: number | null
          total_vencido: number | null
        }
        Relationships: [
          {
            foreignKeyName: "contas_pagar_receber_parceiro_id_fkey"
            columns: ["parceiro_id"]
            isOneToOne: false
            referencedRelation: "parceiros_comerciais"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contas_pagar_receber_parceiro_id_fkey"
            columns: ["parceiro_id"]
            isOneToOne: false
            referencedRelation: "v_credito_resumo_financeiro"
            referencedColumns: ["parceiro_id"]
          },
          {
            foreignKeyName: "contas_pagar_receber_parceiro_id_fkey"
            columns: ["parceiro_id"]
            isOneToOne: false
            referencedRelation: "vw_logistica_agregado"
            referencedColumns: ["transportadora_id"]
          },
          {
            foreignKeyName: "contas_pagar_receber_parceiro_id_fkey"
            columns: ["parceiro_id"]
            isOneToOne: false
            referencedRelation: "vw_recebivel_por_conta"
            referencedColumns: ["conta_id"]
          },
        ]
      }
      vw_recebivel_b2c_pedido: {
        Row: {
          created_at_shopify: string | null
          data_transacao: string | null
          financial_status: string | null
          movimentacao_id: string | null
          mp_payment_id: string | null
          mp_token: string | null
          order_name: string | null
          pedido_total_bruto: number | null
          shipping_city: string | null
          shipping_province: string | null
          shopify_id: string | null
          status_atribuicao: string | null
          tipo_meio: string | null
          valor_liquido_mp: number | null
          via_chave: string | null
        }
        Relationships: []
      }
      vw_recebivel_por_conta: {
        Row: {
          cliente: string | null
          cnpj: string | null
          conta_id: string | null
          dias_atraso_max: number | null
          faixa_1_15: number | null
          faixa_16_30: number | null
          faixa_31_60: number | null
          faixa_60_mais: number | null
          faixa_a_vencer: number | null
          qtd_titulos_abertos: number | null
          total_a_receber: number | null
          total_vencido: number | null
        }
        Relationships: []
      }
      vw_reserva_skus_orfaos: {
        Row: {
          pedidos: number | null
          qtd_reservada_perdida: number | null
          sku: string | null
        }
        Relationships: []
      }
      vw_shopify_pedidos_rastreio: {
        Row: {
          cancelled_at: string | null
          created_at: string | null
          created_at_shopify: string | null
          discount_amount: number | null
          financial_status: string | null
          fulfilled_at: string | null
          fulfillment_status: string | null
          importacao_id: string | null
          order_name: string | null
          paid_at: string | null
          payment_method: string | null
          payment_method_raw: string | null
          rastreio_atualizado_em: string | null
          rastreio_entregue: boolean | null
          rastreio_status: string | null
          refunded_amount: number | null
          shipping_city: string | null
          shipping_cost: number | null
          shipping_method: string | null
          shipping_province: string | null
          shipping_zip: string | null
          shopify_id: string | null
          subtotal: number | null
          total: number | null
          tracking_company: string | null
          tracking_number: string | null
          tracking_url: string | null
          updated_at: string | null
          wns_pedido_id: string | null
        }
        Relationships: [
          {
            foreignKeyName: "shopify_pedidos_importacao_id_fkey"
            columns: ["importacao_id"]
            isOneToOne: false
            referencedRelation: "shopify_importacoes"
            referencedColumns: ["id"]
          },
        ]
      }
      vw_temas_investimento_kpis: {
        Row: {
          ativa: boolean | null
          codigo: string | null
          frente_id: string | null
          nome: string | null
          ordem: number | null
          qtd_cpr: number | null
          qtd_cpr_pagos: number | null
          qtd_linhas: number | null
          tema_id: string | null
          total_fechado: number | null
          total_inicial: number | null
          total_lancado: number | null
          total_pago: number | null
          total_saldo: number | null
          total_saving: number | null
        }
        Relationships: [
          {
            foreignKeyName: "temas_investimento_frente_id_fkey"
            columns: ["frente_id"]
            isOneToOne: false
            referencedRelation: "frentes_investimento"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "temas_investimento_frente_id_fkey"
            columns: ["frente_id"]
            isOneToOne: false
            referencedRelation: "vw_frentes_investimento_kpis"
            referencedColumns: ["frente_id"]
          },
        ]
      }
      vw_titulos_cobranca: {
        Row: {
          banco_nome: string | null
          banco_recebimento_id: string | null
          boleto_codigo_rejeicao: string | null
          boleto_enviado_em: string | null
          boleto_status: string | null
          conta_id: string | null
          created_at: string | null
          data_liquidacao_prevista: string | null
          data_liquidacao_real: string | null
          data_pagamento: string | null
          data_pagamento_banco: string | null
          data_proxima_acao_regua: string | null
          data_vencimento_atual: string | null
          data_vencimento_original: string | null
          dias_atraso: number | null
          eh_entrada: boolean | null
          email_cobranca_enviado_em: string | null
          flag_bandeira_amarela: boolean | null
          flag_grupo_economico_inadimplente: boolean | null
          id: string | null
          inconsistencia_pagamento: boolean | null
          linha_digitavel: string | null
          modalidade_renegociacao: number | null
          nf_id: string | null
          nf_numero: string | null
          nosso_numero_seq: string | null
          numero_parcela: number | null
          numero_titulo: string | null
          parceiro_cnpj: string | null
          parceiro_email: string | null
          parceiro_email_cobranca: string | null
          parceiro_id: string | null
          parceiro_nome_fantasia: string | null
          parceiro_razao_social: string | null
          pausa_regua_automatica: boolean | null
          pedido_estagio: string | null
          pedido_id: string | null
          pedido_id_externo: string | null
          prorrogacao_nova_data: string | null
          prorrogacao_solicitada_em: string | null
          reemissao_aplicada_em: string | null
          reemissao_motivo: string | null
          reemissao_nova_data: string | null
          reemissao_novo_valor: number | null
          remessa_safra_id: string | null
          status_gestao: string | null
          status_real: string | null
          subestado_atraso: string | null
          tipo_pagamento: string | null
          titulo_renegociado_origem_id: string | null
          total_parcelas: number | null
          valor_bruto: number | null
          valor_desconto: number | null
          valor_efetivo: number | null
          valor_juros: number | null
          valor_multa: number | null
          vip_relacionamento: boolean | null
        }
        Relationships: [
          {
            foreignKeyName: "contas_pagar_receber_parceiro_id_fkey"
            columns: ["parceiro_id"]
            isOneToOne: false
            referencedRelation: "parceiros_comerciais"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contas_pagar_receber_parceiro_id_fkey"
            columns: ["parceiro_id"]
            isOneToOne: false
            referencedRelation: "v_credito_resumo_financeiro"
            referencedColumns: ["parceiro_id"]
          },
          {
            foreignKeyName: "contas_pagar_receber_parceiro_id_fkey"
            columns: ["parceiro_id"]
            isOneToOne: false
            referencedRelation: "vw_logistica_agregado"
            referencedColumns: ["transportadora_id"]
          },
          {
            foreignKeyName: "contas_pagar_receber_parceiro_id_fkey"
            columns: ["parceiro_id"]
            isOneToOne: false
            referencedRelation: "vw_recebivel_por_conta"
            referencedColumns: ["conta_id"]
          },
          {
            foreignKeyName: "titulo_a_receber_banco_recebimento_id_fkey"
            columns: ["banco_recebimento_id"]
            isOneToOne: false
            referencedRelation: "banco_recebimento"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "titulo_a_receber_conta_id_fkey"
            columns: ["conta_id"]
            isOneToOne: false
            referencedRelation: "contas_pagar"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "titulo_a_receber_conta_id_fkey"
            columns: ["conta_id"]
            isOneToOne: false
            referencedRelation: "contas_pagar_receber"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "titulo_a_receber_conta_id_fkey"
            columns: ["conta_id"]
            isOneToOne: false
            referencedRelation: "contas_pagar_receber_ativas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "titulo_a_receber_conta_id_fkey"
            columns: ["conta_id"]
            isOneToOne: false
            referencedRelation: "v_cpr_bola_redonda"
            referencedColumns: ["cpr_id"]
          },
          {
            foreignKeyName: "titulo_a_receber_conta_id_fkey"
            columns: ["conta_id"]
            isOneToOne: false
            referencedRelation: "vw_conciliacao_furos"
            referencedColumns: ["sugestao_cpr_id"]
          },
          {
            foreignKeyName: "titulo_a_receber_conta_id_fkey"
            columns: ["conta_id"]
            isOneToOne: false
            referencedRelation: "vw_contas_pagar_consolidado"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "titulo_a_receber_conta_id_fkey"
            columns: ["conta_id"]
            isOneToOne: false
            referencedRelation: "vw_despesas_match_sugestoes"
            referencedColumns: ["cpr_id"]
          },
          {
            foreignKeyName: "titulo_a_receber_conta_id_fkey"
            columns: ["conta_id"]
            isOneToOne: false
            referencedRelation: "vw_documentos_envio_estados"
            referencedColumns: ["conta_id"]
          },
          {
            foreignKeyName: "titulo_a_receber_conta_id_fkey"
            columns: ["conta_id"]
            isOneToOne: false
            referencedRelation: "vw_pj_pagamentos"
            referencedColumns: ["cpr_id"]
          },
          {
            foreignKeyName: "titulo_a_receber_nf_id_fkey"
            columns: ["nf_id"]
            isOneToOne: false
            referencedRelation: "nfs_emitidas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "titulo_a_receber_nf_id_fkey"
            columns: ["nf_id"]
            isOneToOne: false
            referencedRelation: "vw_nf_pedido_resolvido"
            referencedColumns: ["nf_id"]
          },
          {
            foreignKeyName: "titulo_a_receber_pedido_id_fkey"
            columns: ["pedido_id"]
            isOneToOne: false
            referencedRelation: "pedidos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "titulo_a_receber_pedido_id_fkey"
            columns: ["pedido_id"]
            isOneToOne: false
            referencedRelation: "v_pedidos_fila"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "titulo_a_receber_pedido_id_fkey"
            columns: ["pedido_id"]
            isOneToOne: false
            referencedRelation: "v_pedidos_priorizados"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "titulo_a_receber_pedido_id_fkey"
            columns: ["pedido_id"]
            isOneToOne: false
            referencedRelation: "vw_gestao_pedidos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "titulo_a_receber_pedido_id_fkey"
            columns: ["pedido_id"]
            isOneToOne: false
            referencedRelation: "vw_pedido_base"
            referencedColumns: ["pedido_id"]
          },
          {
            foreignKeyName: "titulo_a_receber_pedido_id_fkey"
            columns: ["pedido_id"]
            isOneToOne: false
            referencedRelation: "vw_pedidos_farol"
            referencedColumns: ["pedido_id"]
          },
          {
            foreignKeyName: "titulo_a_receber_remessa_safra_id_fkey"
            columns: ["remessa_safra_id"]
            isOneToOne: false
            referencedRelation: "remessas_safra"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "titulo_a_receber_titulo_renegociado_origem_id_fkey"
            columns: ["titulo_renegociado_origem_id"]
            isOneToOne: false
            referencedRelation: "titulo_a_receber"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "titulo_a_receber_titulo_renegociado_origem_id_fkey"
            columns: ["titulo_renegociado_origem_id"]
            isOneToOne: false
            referencedRelation: "vw_previsao_recebimentos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "titulo_a_receber_titulo_renegociado_origem_id_fkey"
            columns: ["titulo_renegociado_origem_id"]
            isOneToOne: false
            referencedRelation: "vw_recebivel_b2b"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "titulo_a_receber_titulo_renegociado_origem_id_fkey"
            columns: ["titulo_renegociado_origem_id"]
            isOneToOne: false
            referencedRelation: "vw_titulos_cobranca"
            referencedColumns: ["id"]
          },
        ]
      }
      vw_transp_fretes: {
        Row: {
          ad_valorem: number | null
          adicionais: number | null
          atualizado_em: string | null
          classe: string | null
          cte_emissao: string | null
          cte_numero: string | null
          cte_serie: string | null
          data_frete: string | null
          destinatario: string | null
          destinatario_cidade: string | null
          destinatario_uf: string | null
          di_dta: string | null
          doc_anterior: string | null
          eh_problema: boolean | null
          eh_terminal: boolean | null
          frete_peso: number | null
          frete_total: number | null
          gris: number | null
          hawb: string | null
          id: string | null
          importado_arquivo: string | null
          importado_em: string | null
          importado_por: string | null
          itr: number | null
          mawb: string | null
          minuta: string | null
          nf_numero: string | null
          ocorrencia_codigo: string | null
          ocorrencia_data: string | null
          ocorrencia_label: string | null
          ocorrencia_texto: string | null
          ordem_urgencia: number | null
          outros_valores: number | null
          pct_frete_nf: number | null
          peso_real: number | null
          peso_taxado: number | null
          prazo_entrega: string | null
          referencia: string | null
          remetente: string | null
          remetente_cidade: string | null
          remetente_uf: string | null
          sec_cat: number | null
          tde: number | null
          tipo_frete: string | null
          transportadora_id: string | null
          valor_coleta: number | null
          valor_despacho: number | null
          valor_entrega: number | null
          valor_imposto: number | null
          valor_nf: number | null
          valor_pedagio: number | null
          valor_redespacho: number | null
          volumes: number | null
          wns_pedido_id: number | null
        }
        Relationships: [
          {
            foreignKeyName: "transp_fretes_transportadora_id_fkey"
            columns: ["transportadora_id"]
            isOneToOne: false
            referencedRelation: "parceiros_comerciais"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transp_fretes_transportadora_id_fkey"
            columns: ["transportadora_id"]
            isOneToOne: false
            referencedRelation: "v_credito_resumo_financeiro"
            referencedColumns: ["parceiro_id"]
          },
          {
            foreignKeyName: "transp_fretes_transportadora_id_fkey"
            columns: ["transportadora_id"]
            isOneToOne: false
            referencedRelation: "vw_logistica_agregado"
            referencedColumns: ["transportadora_id"]
          },
          {
            foreignKeyName: "transp_fretes_transportadora_id_fkey"
            columns: ["transportadora_id"]
            isOneToOne: false
            referencedRelation: "vw_recebivel_por_conta"
            referencedColumns: ["conta_id"]
          },
          {
            foreignKeyName: "transp_fretes_wns_pedido_id_fkey"
            columns: ["wns_pedido_id"]
            isOneToOne: false
            referencedRelation: "vw_gestao_b2c"
            referencedColumns: ["wns_pedidowns"]
          },
          {
            foreignKeyName: "transp_fretes_wns_pedido_id_fkey"
            columns: ["wns_pedido_id"]
            isOneToOne: false
            referencedRelation: "wns_pedidos"
            referencedColumns: ["pedidowns"]
          },
        ]
      }
      vw_transp_rastreio_nf: {
        Row: {
          atualizado_em: string | null
          centro_custo: string | null
          cep_destino: string | null
          chave_nfe: string | null
          cidade_destino: string | null
          classe: string | null
          cnpj_destinatario: string | null
          cte_numero: string | null
          data_entrega: string | null
          destinatario: string | null
          eh_devolucao: boolean | null
          eh_problema: boolean | null
          eh_terminal: boolean | null
          id: string | null
          importado_arquivo: string | null
          importado_em: string | null
          natureza_mercadoria: string | null
          nf_numero: string | null
          nf_serie: string | null
          ocorrencia_ativa: string | null
          ocorrencia_codigo: string | null
          ocorrencia_data: string | null
          ocorrencia_label: string | null
          ordem_urgencia: number | null
          pedido_id: string | null
          pedido_numero: string | null
          previsao_entrega: string | null
          recebedor: string | null
          status: string | null
          transportadora_id: string | null
          transportadora_nome: string | null
          uf_destino: string | null
          valor_cte: number | null
          valor_nf: number | null
        }
        Relationships: [
          {
            foreignKeyName: "transp_rastreio_nf_pedido_id_fkey"
            columns: ["pedido_id"]
            isOneToOne: false
            referencedRelation: "pedidos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transp_rastreio_nf_pedido_id_fkey"
            columns: ["pedido_id"]
            isOneToOne: false
            referencedRelation: "v_pedidos_fila"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transp_rastreio_nf_pedido_id_fkey"
            columns: ["pedido_id"]
            isOneToOne: false
            referencedRelation: "v_pedidos_priorizados"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transp_rastreio_nf_pedido_id_fkey"
            columns: ["pedido_id"]
            isOneToOne: false
            referencedRelation: "vw_gestao_pedidos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transp_rastreio_nf_pedido_id_fkey"
            columns: ["pedido_id"]
            isOneToOne: false
            referencedRelation: "vw_pedido_base"
            referencedColumns: ["pedido_id"]
          },
          {
            foreignKeyName: "transp_rastreio_nf_pedido_id_fkey"
            columns: ["pedido_id"]
            isOneToOne: false
            referencedRelation: "vw_pedidos_farol"
            referencedColumns: ["pedido_id"]
          },
          {
            foreignKeyName: "transp_rastreio_nf_transportadora_id_fkey"
            columns: ["transportadora_id"]
            isOneToOne: false
            referencedRelation: "parceiros_comerciais"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transp_rastreio_nf_transportadora_id_fkey"
            columns: ["transportadora_id"]
            isOneToOne: false
            referencedRelation: "v_credito_resumo_financeiro"
            referencedColumns: ["parceiro_id"]
          },
          {
            foreignKeyName: "transp_rastreio_nf_transportadora_id_fkey"
            columns: ["transportadora_id"]
            isOneToOne: false
            referencedRelation: "vw_logistica_agregado"
            referencedColumns: ["transportadora_id"]
          },
          {
            foreignKeyName: "transp_rastreio_nf_transportadora_id_fkey"
            columns: ["transportadora_id"]
            isOneToOne: false
            referencedRelation: "vw_recebivel_por_conta"
            referencedColumns: ["conta_id"]
          },
        ]
      }
      vw_vendas_produto: {
        Row: {
          cfops: string[] | null
          colecao: string | null
          cor_nome: string | null
          mes: string | null
          nfs_distintas: number | null
          nome_produto: string | null
          quantidade_outros: number | null
          quantidade_total: number | null
          quantidade_venda: number | null
          sku: string | null
          sku_sem_cadastro: boolean | null
          tem_cfop_nao_classificado: boolean | null
          valor_outros: number | null
          valor_total: number | null
          valor_venda: number | null
        }
        Relationships: []
      }
      vw_vinculo_beneficios_resumo: {
        Row: {
          qtd_beneficios_ativos: number | null
          total_custo_empresa: number | null
          total_desconto_colaborador: number | null
          vinculo_id: string | null
        }
        Relationships: [
          {
            foreignKeyName: "vinculo_beneficios_vinculo_id_fkey"
            columns: ["vinculo_id"]
            isOneToOne: false
            referencedRelation: "vinculos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vinculo_beneficios_vinculo_id_fkey"
            columns: ["vinculo_id"]
            isOneToOne: false
            referencedRelation: "vw_custo_pessoas"
            referencedColumns: ["vinculo_id"]
          },
          {
            foreignKeyName: "vinculo_beneficios_vinculo_id_fkey"
            columns: ["vinculo_id"]
            isOneToOne: false
            referencedRelation: "vw_nf_vinculo_pessoa"
            referencedColumns: ["vinculo_id"]
          },
          {
            foreignKeyName: "vinculo_beneficios_vinculo_id_fkey"
            columns: ["vinculo_id"]
            isOneToOne: false
            referencedRelation: "vw_organograma"
            referencedColumns: ["vinculo_id"]
          },
          {
            foreignKeyName: "vinculo_beneficios_vinculo_id_fkey"
            columns: ["vinculo_id"]
            isOneToOne: false
            referencedRelation: "vw_pj_notas_fiscais"
            referencedColumns: ["vinculo_id"]
          },
          {
            foreignKeyName: "vinculo_beneficios_vinculo_id_fkey"
            columns: ["vinculo_id"]
            isOneToOne: false
            referencedRelation: "vw_pj_pagamentos"
            referencedColumns: ["vinculo_id"]
          },
          {
            foreignKeyName: "vinculo_beneficios_vinculo_id_fkey"
            columns: ["vinculo_id"]
            isOneToOne: false
            referencedRelation: "vw_vinculo_custo_total"
            referencedColumns: ["vinculo_id"]
          },
        ]
      }
      vw_vinculo_custo_total: {
        Row: {
          custo_recorrente_mensal: number | null
          total_beneficios: number | null
          total_extras_recorrentes: number | null
          valor_base: number | null
          valor_transporte: number | null
          vinculo_id: string | null
        }
        Relationships: []
      }
    }
    Functions: {
      _meio_pagamento_nascida_paga: { Args: never; Returns: string }
      ajustar_haver_cliente:
        | {
            Args: {
              p_haver_id_alvo?: string
              p_haver_ids_alvo?: string[]
              p_motivo: string
              p_parceiro_id: string
              p_tipo: string
              p_validade_dias?: number
              p_valor: number
            }
            Returns: Json
          }
        | {
            Args: {
              p_haver_id_alvo?: string
              p_motivo: string
              p_parceiro_id: string
              p_tipo: string
              p_validade_dias?: number
              p_valor: number
            }
            Returns: Json
          }
      analisar_pedido_vs_programa: {
        Args: { p_pedido_id: string }
        Returns: Json
      }
      ancorar_boleto_em_cpr: {
        Args: { p_boleto_stage_id: string; p_cpr_id: string }
        Returns: Json
      }
      apagar_conta_pagar: {
        Args: { p_apagar_grupo_inteiro?: boolean; p_id: string }
        Returns: Json
      }
      aplicar_haver_pedido: {
        Args: { p_haver_id: string; p_pedido_id: string }
        Returns: Json
      }
      aplicar_ia_categoria_em_massa: { Args: never; Returns: Json }
      aplicar_regras_automaticas_ofx: {
        Args: { p_conta_bancaria_id: string; p_user_id?: string }
        Returns: Json
      }
      aplicar_regras_categorizacao_stage: {
        Args: { p_stage_id: string }
        Returns: Json
      }
      aplicar_template_cargo: {
        Args: {
          _area_perfil_codigo: string
          _atribuidor?: string
          _template_id: string
          _unidade_id: string
          _user_id: string
        }
        Returns: {
          atribuicao_id: string
          nivel: string
          perfil_nome: string
          unidade_nome: string
        }[]
      }
      aplicar_template_cargo_v3: {
        Args: {
          _atribuidor?: string
          _departamento_id: string
          _template_id: string
          _unidade_id: string
          _user_id: string
        }
        Returns: {
          atribuicao_id: string
          nivel: string
          perfil_nome: string
          unidade_nome: string
        }[]
      }
      apontar_matches_conciliacao: {
        Args: { p_conta_bancaria_id: string }
        Returns: Json
      }
      aprender_regra_de_classificacao: {
        Args: { p_stage_id: string; p_user_id?: string }
        Returns: Json
      }
      aprovar_cpr_em_cascata: {
        Args: { p_cpr_id: string; p_status_alvo?: string }
        Returns: Json
      }
      aprovar_nf_pj: {
        Args: { _nota_id: string; _observacao_rh?: string }
        Returns: Json
      }
      aprovar_reembolso: { Args: { p_reembolso_id: string }; Returns: string }
      atualizar_condicao_pagamento: {
        Args: {
          p_nova_condicao: string
          p_nova_regra_id: string
          p_pedido_id: string
        }
        Returns: Json
      }
      atualizar_conta_pagar_v2: {
        Args: {
          p_centro_custo?: string
          p_conta_id?: string
          p_data_vencimento?: string
          p_descricao?: string
          p_forma_pagamento_id?: string
          p_id: string
          p_nf_chave_acesso?: string
          p_nf_numero?: string
          p_nf_serie?: string
          p_observacao?: string
        }
        Returns: Json
      }
      atualizar_contas_atrasadas: { Args: never; Returns: undefined }
      atualizar_docs_status: {
        Args: { p_conta_id: string }
        Returns: undefined
      }
      atualizar_frete_pedido: {
        Args: {
          p_estimativa_json?: Json
          p_estimativa_valor?: number
          p_frete_tipo?: string
          p_pedido_id: string
          p_peso_bruto_total?: number
          p_transportadora_id?: string
          p_valor_frete?: number
        }
        Returns: Json
      }
      autosave_convite_cadastro: {
        Args: { _dados: Json; _token: string }
        Returns: boolean
      }
      baixar_bandeira_vermelha: {
        Args: { p_motivo: string; p_parceiro_id: string }
        Returns: Json
      }
      baixar_titulo_conciliacao: {
        Args: {
          p_data_pagamento?: string
          p_movimentacao_id: string
          p_titulo_id: string
        }
        Returns: Json
      }
      buscar_docs_pagamento: {
        Args: { p_cpr_id: string }
        Returns: {
          bucket: string
          fonte: string
          nome_arquivo: string
          storage_path: string
          tipo: string
        }[]
      }
      buscar_nfs_stage_para_conta: {
        Args: { p_conta_id: string }
        Returns: {
          categoria_codigo: string
          categoria_id: string
          categoria_nome: string
          descricao: string
          fornecedor_cliente: string
          fornecedor_cnpj: string
          fornecedor_razao_social: string
          motivos: string
          nf_chave_acesso: string
          nf_data_emissao: string
          nf_id: string
          nf_numero: string
          score: number
          valor_total: number
        }[]
      }
      buscar_nfs_stage_v2: {
        Args: { p_conta_id: string }
        Returns: {
          data_emissao: string
          fornecedor_cnpj: string
          fornecedor_razao_social: string
          motivos: string
          nf_id: string
          nf_numero: string
          score: number
          valor_nf: number
        }[]
      }
      buscar_parceiro_por_cnpj_ou_nome: {
        Args: { p_termo: string }
        Returns: Json
      }
      calcular_docs_status: { Args: { p_conta_id: string }; Returns: string }
      calcular_peso_pedido: { Args: { p_pedido_id: string }; Returns: Json }
      cancelar_conta_pagar: { Args: { p_conta_id: string }; Returns: Json }
      cancelar_item_pedido: {
        Args: { p_item_id: string; p_motivo: string }
        Returns: Json
      }
      cancelar_parcelas_futuras_recorrente: {
        Args: { p_recorrente_id: string }
        Returns: number
      }
      cancelar_pedido: {
        Args: { p_motivo: string; p_pedido_id: string }
        Returns: Json
      }
      cancelar_pedido_inteiro_via_cpr: {
        Args: { p_cpr_id: string }
        Returns: Json
      }
      cancelar_pedido_pedido: {
        Args: { p_motivo: string; p_pedido_id: string }
        Returns: Json
      }
      cancelar_prorrogacao_boleto: {
        Args: { p_titulo_id: string }
        Returns: Json
      }
      cancelar_reemissao_boleto: {
        Args: { p_titulo_id: string }
        Returns: Json
      }
      capturar_custo_mensal: { Args: never; Returns: number }
      clonar_pedido_cancelado: { Args: { p_pedido_id: string }; Returns: Json }
      comentar_pedido: {
        Args: { p_conteudo: string; p_pedido_id: string }
        Returns: Json
      }
      conciliar_credito_cesta: {
        Args: { p_movimentacao_id: string; p_titulo_ids: string[] }
        Returns: Json
      }
      conciliar_credito_titulo: {
        Args: { p_movimentacao_id: string; p_titulo_id: string }
        Returns: Json
      }
      conciliar_debito_com_nf: {
        Args: { p_mov_id: string; p_stage_id: string; p_user_id?: string }
        Returns: Json
      }
      conciliar_em_lote_ofx: {
        Args: {
          p_conta_ids: string[]
          p_movimentacao_id: string
          p_user_id?: string
        }
        Returns: {
          contas_conciliadas: number
          erro: string
          ok: boolean
          valor_total: number
        }[]
      }
      conciliar_lancamento: {
        Args: { p_conta_pagar_id: string; p_lancamento_id: string }
        Returns: Json
      }
      conciliar_lote_cartao: {
        Args: { p_ofx_id: string; p_parcela_ids: string[] }
        Returns: Json
      }
      conciliar_movimentacao_com_ofx: {
        Args: { p_mov_id: string; p_ofx_id: string; p_user_id?: string }
        Returns: Json
      }
      conciliar_multiplas_contas_a_ofx: {
        Args: { p_contas_pagar_ids: string[]; p_ofx_id: string }
        Returns: Json
      }
      conciliar_semov_com_ofx: {
        Args: { p_ofx_id: string; p_planilha_id: string }
        Returns: Json
      }
      conciliar_semov_fatura: {
        Args: { p_fatura_id: string; p_ofx_id?: string; p_planilha_id: string }
        Returns: Json
      }
      conciliar_transacao_ofx: {
        Args: { p_conta_pagar_id: string; p_ofx_id: string }
        Returns: Json
      }
      confirmar_batimento_titulo_pago: {
        Args: { p_movimentacao_id: string; p_titulo_id: string }
        Returns: Json
      }
      confirmar_itau_lote_auto: {
        Args: { p_importacao_id: string }
        Returns: Json
      }
      confirmar_itau_pagamento_unitario: {
        Args: { p_conta_pagar_id: string; p_pagamento_id: string }
        Returns: Json
      }
      confirmar_match_despesa: {
        Args: { p_cpr_id: string; p_mov_id: string; p_user_id?: string }
        Returns: Json
      }
      confirmar_par_transferencia: {
        Args: { p_credito_id: string; p_debito_id: string }
        Returns: Json
      }
      confirmar_portao_pago: {
        Args: {
          p_data_pagamento?: string
          p_observacao?: string
          p_pedido_id: string
        }
        Returns: Json
      }
      confirmar_pre_aprovacao: { Args: { p_analise_id: string }; Returns: Json }
      contar_boletos_pendentes_mesmo_parceiro: {
        Args: { p_boleto_stage_id_referencia: string }
        Returns: Json
      }
      contar_pendentes_mesmo_cnpj: {
        Args: { p_ged_documento_id_referencia: string }
        Returns: Json
      }
      contar_uso_template: { Args: { _template_id: string }; Returns: Json }
      contas_para_match_ofx: {
        Args: never
        Returns: {
          data_pagamento: string
          data_vencimento: string
          fornecedor_cliente: string
          id: string
          nf_numero: string
          parceiro_cnpj: string
          parceiro_id: string
          parceiro_razao_social: string
          status: string
          valor: number
        }[]
      }
      converter_titulo_em_haver: {
        Args: { p_motivo: string; p_titulo_id: string }
        Returns: Json
      }
      criar_cpr_de_boleto: {
        Args: {
          p_boleto_stage_id: string
          p_categoria_id: string
          p_descricao_extra?: string
          p_forma_pagamento_id?: string
        }
        Returns: Json
      }
      criar_cpr_de_boleto_em_lote: {
        Args: {
          p_boleto_stage_ids: string[]
          p_categoria_id: string
          p_forma_pagamento_id: string
        }
        Returns: Json
      }
      criar_cpr_e_vincular_stage_1: {
        Args: {
          p_categoria_id: string
          p_descricao: string
          p_parceiro_id?: string
          p_planilha_id: string
          p_user_id?: string
        }
        Returns: Json
      }
      criar_cpr_e_vincular_stage_2_debito: {
        Args: {
          p_categoria_id: string
          p_descricao: string
          p_ofx_id: string
          p_parceiro_id?: string
          p_user_id?: string
        }
        Returns: Json
      }
      criar_cpr_receita_stage_2_credito: {
        Args: {
          p_categoria_id: string
          p_descricao: string
          p_ofx_id: string
          p_parceiro_id?: string
          p_user_id?: string
        }
        Returns: Json
      }
      criar_despesa_agrupada: {
        Args: { p_lancamento_ids: string[] }
        Returns: Json
      }
      criar_despesa_de_lancamento_v2: {
        Args: {
          p_gerar_todas?: boolean
          p_lancamento_id: string
          p_total_parcelas?: number
        }
        Returns: Json
      }
      criar_despesa_direta_ofx: {
        Args: {
          p_categoria_id: string
          p_descricao: string
          p_movimentacao_id: string
          p_parceiro_id?: string
          p_user_id?: string
        }
        Returns: {
          conta_pagar_id: string
          erro: string
          ok: boolean
        }[]
      }
      criar_pedido_compra: {
        Args: {
          p_centro_custo_id?: string
          p_descricao_geral?: string
          p_itens?: Json
          p_justificativa?: string
          p_linha_investimento_id?: string
          p_parceiro_preferencial_id?: string
        }
        Returns: Json
      }
      criar_portao_provisorio: {
        Args: { p_pedido_id: string; p_titulos_editados: Json }
        Returns: Json
      }
      criar_remessa: {
        Args: {
          p_data_entrega_prevista?: string
          p_delta_financeiro?: number
          p_itens_json?: Json
          p_observacao?: string
          p_pedido_id: string
          p_status?: string
          p_valor_remessa?: number
        }
        Returns: Json
      }
      criar_split_pedido: {
        Args: {
          p_data_entrega_prevista?: string
          p_estagio_inicial?: string
          p_financeiro_coberto?: boolean
          p_itens_original: Json
          p_itens_split: Json
          p_observacao?: string
          p_pedido_id: string
          p_valor_original: number
          p_valor_split: number
        }
        Returns: Json
      }
      criar_tarefa_aprovacao_nf_pj: {
        Args: { _nota_id: string }
        Returns: string
      }
      criar_tarefa_correcao_nf_pj: {
        Args: { _erros: Json; _nota_id: string }
        Returns: string
      }
      criar_tarefa_emissao_nf_pj: {
        Args: { _competencia: string; _contrato_id: string }
        Returns: string
      }
      criar_tarefas_emissao_nf_pj_mensal: { Args: never; Returns: number }
      debug_kalunga: {
        Args: never
        Returns: {
          step: string
          valor: string
        }[]
      }
      decisao_salario: {
        Args: {
          _alvo_user_id: string
          _contexto: Database["public"]["Enums"]["contexto_acesso_salario"]
          _viewer_id: string
        }
        Returns: string
      }
      decisao_salario_lote: {
        Args: {
          _alvo_user_ids: string[]
          _contexto: Database["public"]["Enums"]["contexto_acesso_salario"]
        }
        Returns: {
          alvo_user_id: string
          modo: string
        }[]
      }
      definir_exige_portao: {
        Args: { p_pedido_id: string; p_valor: boolean }
        Returns: Json
      }
      delegacao_ativa_entre: {
        Args: { _gestor: string; _substituto: string }
        Returns: boolean
      }
      delete_email: {
        Args: { message_id: number; queue_name: string }
        Returns: boolean
      }
      descartar_ofx_stage: {
        Args: { p_importacao_stage_id: string }
        Returns: Json
      }
      desconciliar_movimentacao: { Args: { p_mov_id: string }; Returns: Json }
      desfazer_conciliacao_ofx: { Args: { p_ofx_id: string }; Returns: Json }
      desfazer_remessa: { Args: { p_remessa_id: string }; Returns: Json }
      despausar_regua_titulo: { Args: { p_titulo_id: string }; Returns: Json }
      detectar_duplicatas_nf: {
        Args: { p_chaves: string[]; p_cnpj_numero?: Json }
        Returns: {
          chave_ou_par: string
          fonte: string
        }[]
      }
      detectar_match_score_nf: {
        Args: { p_candidatos: Json }
        Returns: {
          idx: number
          match_data_emissao: string
          match_fornecedor: string
          match_id: string
          match_nf_numero: string
          match_parcela: string
          match_score: number
          match_tipo_documento: string
          match_valor: number
        }[]
      }
      detectar_pares_provaveis_nf: {
        Args: { p_score_minimo?: number }
        Returns: {
          a_categoria_id: string
          a_data: string
          a_fornecedor: string
          a_numero: string
          a_status: string
          a_tipo: string
          a_valor: number
          b_categoria_id: string
          b_data: string
          b_fornecedor: string
          b_numero: string
          b_status: string
          b_tipo: string
          b_valor: number
          id_a: string
          id_b: string
          motivo_match: string
          score: number
        }[]
      }
      detectar_tipo_pagamento: { Args: { descricao: string }; Returns: string }
      diagnostico_match_mov_sem_cnpj: {
        Args: never
        Returns: {
          match_data: string
          match_valor: string
          mov_data_compra: string
          mov_descricao: string
          mov_id: string
          mov_valor: number
          nf_data_emissao: string
          nf_id: string
          nf_razao_social: string
          nf_valor: number
          score_total: number
          similaridade_texto: number
          token_extraido: string
        }[]
      }
      disparar_enriquecimento_parceiro: {
        Args: { p_parceiro_id: string }
        Returns: number
      }
      dividir_remessa: {
        Args: { p_itens_para_nova: Json; p_remessa_origem_id: string }
        Returns: Json
      }
      documentos_envio_agrupados: {
        Args: {
          p_busca?: string
          p_estado?: string
          p_periodo_fim?: string
          p_periodo_inicio?: string
        }
        Returns: {
          contas_json: Json
          mais_antigo_dias: number
          parceiro_id: string
          parceiro_razao_social: string
          qtd_canceladas_apos_envio: number
          qtd_contas: number
          total_valor: number
        }[]
      }
      documentos_pendentes_agrupados: {
        Args: {
          p_periodo_fim?: string
          p_periodo_inicio?: string
          p_status?: string
        }
        Returns: {
          contas_json: Json
          contas_parcial: number
          contas_pendente: number
          mais_antigo_dias: number
          parceiro_id: string
          parceiro_razao_social: string
          total_contas: number
          total_valor: number
        }[]
      }
      duplicar_pedido_alterar_pagamento: {
        Args: {
          p_nova_condicao: string
          p_nova_regra_id: string
          p_pedido_id: string
        }
        Returns: Json
      }
      editar_comentario_pedido: {
        Args: { p_comentario_id: string; p_conteudo_novo: string }
        Returns: Json
      }
      enqueue_email: {
        Args: { payload: Json; queue_name: string }
        Returns: number
      }
      enriquecer_fatura_cartao: {
        Args: { p_fatura_id: string }
        Returns: {
          ambiguos: number
          enriquecidos: number
          ja_enriquecidos: number
          sem_match: number
          total_processados: number
        }[]
      }
      enriquecer_lancamento_cartao: {
        Args: { p_lancamento_id: string }
        Returns: {
          out_cnpj: string
          out_fonte: string
          out_parceiro_id: string
          out_score: number
        }[]
      }
      enriquecer_parceiro_com_bancarios: {
        Args: { p_dados: Json; p_parceiro_id: string }
        Returns: Json
      }
      enriquecer_todos_lancamentos_cartao: {
        Args: never
        Returns: {
          ambiguos: number
          enriquecidos: number
          sem_match: number
          total_processados: number
        }[]
      }
      enviar_pedido_compra: { Args: { p_pedido_id: string }; Returns: Json }
      enviar_stage_para_pagamento: {
        Args: { p_stage_id: string; p_user_id?: string }
        Returns: Json
      }
      erguer_bandeira_vermelha: {
        Args: { p_motivo: string; p_parceiro_id: string }
        Returns: Json
      }
      excluir_comentario_pedido: {
        Args: { p_comentario_id: string }
        Returns: Json
      }
      excluir_compra_registrada: {
        Args: { p_compra_id: string; p_motivo: string }
        Returns: Json
      }
      excluir_parceiro_seguro: {
        Args: { p_parceiro_id: string }
        Returns: Json
      }
      executar_pagamento: {
        Args: {
          p_cpr_id: string
          p_dados_pagamento: Json
          p_email_destinatario?: string
          p_forma_pagamento_id: string
          p_numero_parcela?: number
          p_observacao?: string
        }
        Returns: Json
      }
      expirar_haveres_vencidos: { Args: never; Returns: Json }
      exportar_pacote_documentos: {
        Args: { p_periodo_fim: string; p_periodo_inicio: string }
        Returns: {
          conta_data_pagamento: string
          conta_descricao: string
          conta_id: string
          conta_valor: number
          doc_id: string
          doc_nome_arquivo: string
          doc_storage_path: string
          doc_tipo: string
          parceiro_razao_social: string
        }[]
      }
      extrair_token_principal: {
        Args: { p_descricao: string }
        Returns: string
      }
      finalizar_conciliacao_v2: {
        Args: {
          p_itau_pag_id: string
          p_movimentacao_id: string
          p_usuario_id?: string
        }
        Returns: Json
      }
      fix_lancamentos_origem_constraint: { Args: never; Returns: string }
      fn_add_dias_uteis: {
        Args: { p_data: string; p_dias: number }
        Returns: string
      }
      fn_alocar_trilha_pedido: {
        Args: { p_pedido_id: string }
        Returns: string
      }
      fn_aplicar_cadencia_credito: {
        Args: { p_analise_id: string }
        Returns: string
      }
      fn_calcular_meta_entrega: {
        Args: { p_pedido_id: string }
        Returns: string
      }
      fn_casar_sinteticas_extrato: { Args: never; Returns: Json }
      fn_classificar_pagamento: {
        Args: {
          p_condicao_solicitada: string
          p_forma_solicitada: string
          p_valor_liquido: number
        }
        Returns: string
      }
      fn_criar_analise_desde_pedido: {
        Args: { p_pedido_id: string }
        Returns: string
      }
      fn_cron_rolling_contratos: { Args: never; Returns: number }
      fn_dias_uteis_entre: {
        Args: { p_ate: string; p_de: string }
        Returns: number
      }
      fn_fluxo_caixa_projetado: {
        Args: { p_horizonte?: number; p_saldo_inicial?: number }
        Returns: {
          dia: string
          entradas_conservador_dia: number
          entradas_dia: number
          saidas_dia: number
          saldo_conservador: number
          saldo_otimista: number
        }[]
      }
      fn_frete_estimado: {
        Args: {
          p_cep_destino: string
          p_data_referencia?: string
          p_peso_cobrado: number
          p_transportadora_id: string
          p_valor_mercantil?: number
        }
        Returns: Json
      }
      fn_gerar_cprs_de_contrato: {
        Args: { p_contrato_id: string }
        Returns: number
      }
      fn_gerar_numero_titulo: { Args: { p_parcela: number }; Returns: string }
      fn_importar_cobertura_cep: {
        Args: { p_ceps: Json; p_tabela_id: string }
        Returns: Json
      }
      fn_importar_rastreio_nf: {
        Args: { p_arquivo: string; p_nfs: Json; p_transportadora_id: string }
        Returns: Json
      }
      fn_importar_tabela_preco: {
        Args: {
          p_modal: string
          p_nome: string
          p_taxas: Json
          p_transportadora_id: string
          p_vigencia_descricao: string
          p_vigencia_inicio: string
          p_zonas: Json
        }
        Returns: Json
      }
      fn_job_entregue_por_eta: { Args: never; Returns: number }
      fn_log_evento_pedido: {
        Args: {
          p_payload?: Json
          p_pedido_id: string
          p_tipo: string
          p_usuario_id?: string
        }
        Returns: string
      }
      fn_maior_compra_parceiro: {
        Args: { p_parceiro_id: string }
        Returns: number
      }
      fn_marcar_titulos_boleto_vencidos: { Args: never; Returns: Json }
      fn_materializar_itens_pedido: {
        Args: { p_pedido_id: string }
        Returns: undefined
      }
      fn_obter_ou_criar_pasta_parceiro: {
        Args: { p_parceiro_id: string }
        Returns: string
      }
      fn_parse_condicao: {
        Args: {
          p_condicao_solicitada: string
          p_data_referencia?: string
          p_valor_liquido: number
        }
        Returns: Json
      }
      fn_pedido_deve_esperar_pagamento: {
        Args: { p_pedido_id: string }
        Returns: boolean
      }
      fn_recalcular_tags_doc_cpr: {
        Args: { p_cpr_id: string }
        Returns: undefined
      }
      fn_recalcular_vinculo_nf_cpr: {
        Args: { p_cpr_id: string }
        Returns: undefined
      }
      fn_regras_aplicar: { Args: never; Returns: Json }
      fn_regua_materializar: { Args: never; Returns: Json }
      fn_tem_nf_anexada: { Args: { p_conta_id: string }; Returns: boolean }
      fn_transicionar_entregues: { Args: never; Returns: Json }
      fn_transicionar_expedidos: { Args: never; Returns: Json }
      fn_transicionar_pedido: {
        Args: {
          p_acao: string
          p_delta?: Json
          p_estagio_destino: string
          p_motivo?: string
          p_pedido_id: string
        }
        Returns: string
      }
      fn_wns_consolidar: { Args: never; Returns: Json }
      fn_wns_limpar_zumbis: { Args: { p_chaves: Json }; Returns: number }
      fn_wns_truncar_linhas: { Args: never; Returns: number }
      fn_wns_vincular_pedidos: { Args: never; Returns: Json }
      gerar_celebracoes_aniversario_mural: { Args: never; Returns: number }
      gerar_celebracoes_tempo_casa_mural: { Args: never; Returns: number }
      gerar_movimentacao_de_conta: {
        Args: { p_conta_id: string }
        Returns: Json
      }
      gerar_parcelas_contrato_inicial: {
        Args: { p_contrato_id: string }
        Returns: undefined
      }
      gerar_parcelas_pasta_contrato: {
        Args: { p_contrato_id: string }
        Returns: undefined
      }
      gerar_parcelas_previstas: {
        Args: {
          p_compromisso_id: string
          p_parcela_final?: number
          p_parcela_inicial?: number
        }
        Returns: number
      }
      gerar_parcelas_recorrentes: {
        Args: { p_meses_a_frente?: number; p_recorrente_id: string }
        Returns: number
      }
      gerar_periodos_ferias_pendentes: { Args: never; Returns: undefined }
      gerar_proximas_parcelas_pasta: { Args: never; Returns: number }
      get_convite_by_token: { Args: { _token: string }; Returns: Json }
      get_folha_competencia: {
        Args: { p_competencia: string }
        Returns: {
          departamento: string
          extras_pontuais: number
          extras_recorrentes: number
          pessoa: string
          tipo_vinculo: string
          total_beneficios: number
          total_mes: number
          valor_base: number
          valor_transporte: number
          vinculo_id: string
        }[]
      }
      get_organograma_tree: {
        Args: never
        Returns: {
          area: string
          centro_custo: string
          colaborador_id: string
          contrato_pj_id: string
          created_at: string
          departamento: string
          depth: number
          filial: string
          id: string
          id_pai: string
          nivel_hierarquico: number
          path: string[]
          salario_previsto: number
          status: string
          titulo_cargo: string
          updated_at: string
        }[]
      }
      get_profile_id_from_user: { Args: { _user_id: string }; Returns: string }
      get_user_colaborador_tipo: {
        Args: { _user_id: string }
        Returns: string[]
      }
      get_user_departamento_unidade: {
        Args: { p_user_id: string }
        Returns: {
          departamento_id: string
          unidade_id: string
        }[]
      }
      get_user_id_from_profile: {
        Args: { _profile_id: string }
        Returns: string
      }
      get_user_roles: {
        Args: { _user_id: string }
        Returns: Database["public"]["Enums"]["app_role"][]
      }
      get_vault_secret: { Args: { p_name: string }; Returns: string }
      has_permission: {
        Args: { _module: string; _permission: string; _user_id: string }
        Returns: boolean
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      has_role_with_level: {
        Args: {
          _nivel_minimo?: Database["public"]["Enums"]["nivel_cargo"]
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      ia_listar_ambiguos: {
        Args: never
        Returns: {
          conta_id: string
          descricao: string
          parcela_grupo_id: string
          qtd_parcelas: number
          tipo: string
          valor_referencia: number
        }[]
      }
      ia_listar_nfs_candidatas: {
        Args: { p_conta_id: string }
        Returns: {
          arquivo_nome: string
          data_emissao: string
          fornecedor_cnpj: string
          fornecedor_razao_social: string
          itens: Json
          nf_chave_acesso: string
          nf_id: string
          nf_numero: string
          nf_serie: string
          valor_nf: number
        }[]
      }
      ignorar_lancamento: { Args: { p_lancamento_id: string }; Returns: Json }
      iniciar_compra_pedido: { Args: { p_pedido_id: string }; Returns: Json }
      lancar_ofx_como_movimentacao: {
        Args: { p_ofx_id: string }
        Returns: Json
      }
      limpar_atencao_pedido: {
        Args: { p_motivo_remocao?: string; p_pedido_id: string }
        Returns: Json
      }
      limpar_rascunhos_antigos: { Args: never; Returns: number }
      listar_faturas_disponiveis_para_planilha: {
        Args: { p_planilha_id: string }
        Returns: {
          cartao_nome: string
          data_vencimento: string
          fatura_id: string
          ja_vinculada: boolean
          parceiros: string
          qtd_lancamentos: number
          valor_total: number
        }[]
      }
      listar_movimentacoes_elegiveis: {
        Args: never
        Returns: {
          conta_pagar_id: string
          cpr_descricao: string
          data_transacao: string
          descricao: string
          fatura_vencimento: string
          forma_pagamento_nome: string
          fornecedor_cliente: string
          id: string
          valor: number
        }[]
      }
      listar_rotas_config: {
        Args: never
        Returns: {
          ordem: number
          prefixo: string
          status: string
          tela_slug: string
        }[]
      }
      marcar_atencao_pedido: {
        Args: { p_motivo: string; p_nivel: string; p_pedido_id: string }
        Returns: Json
      }
      marcar_compra_como_realizada: {
        Args: { p_compra_id: string; p_observacao?: string }
        Returns: Json
      }
      marcar_credito_nao_recebivel: {
        Args: { p_motivo: string; p_movimentacao_id: string }
        Returns: Json
      }
      marcar_documento_classificado: {
        Args: { p_ged_documento_id: string; p_resultado_ia: Json }
        Returns: Json
      }
      marcar_haver_devolucao: {
        Args: { p_haver_id: string; p_motivo?: string }
        Returns: Json
      }
      marcar_nf_enviada_pagamento: {
        Args: { _email_destinatario: string; _nota_id: string }
        Returns: Json
      }
      marcar_pares_diferentes: {
        Args: { p_id_a: string; p_id_b: string; p_user_id?: string }
        Returns: {
          erro: string
          ok: boolean
        }[]
      }
      marcar_remessa_manual_em_lote: {
        Args: {
          p_conta_ids?: string[]
          p_descricao: string
          p_destinatarios?: string[]
          p_observacao?: string
          p_periodo_fim: string
          p_periodo_inicio: string
        }
        Returns: Json
      }
      marcar_resumo_nfe_para_regerar: {
        Args: { _nfs_stage_id: string }
        Returns: undefined
      }
      marcar_titulo_pago: {
        Args: {
          p_data_pagamento?: string
          p_observacao?: string
          p_titulo_id: string
        }
        Returns: Json
      }
      materializar_cobranca: {
        Args: { p_pedido_id: string; p_titulos_editados: Json }
        Returns: Json
      }
      materializar_cobranca_com_haver: {
        Args: {
          p_haver_id: string
          p_pedido_id: string
          p_titulos_editados: Json
          p_valor_haver: number
        }
        Returns: Json
      }
      merge_contas_duplicadas: {
        Args: { p_id_descartar: string; p_id_manter: string }
        Returns: Json
      }
      merge_nf_stage: {
        Args: { p_nf: Json; p_user_id?: string }
        Returns: {
          acao: string
          stage_id: string
        }[]
      }
      mesclar_pares_nf: {
        Args: {
          p_id_descartar: string
          p_id_manter: string
          p_user_id?: string
        }
        Returns: {
          erro: string
          id_resultante: string
          ok: boolean
        }[]
      }
      meu_contrato_pj_ativo: {
        Args: never
        Returns: {
          categoria_pj: string
          cnpj: string
          contato_nome: string
          data_fim: string
          data_inicio: string
          id: string
          nome_fantasia: string
          razao_social: string
          status: string
          valor_mensal: number
        }[]
      }
      meus_atalhos_personalizados: {
        Args: { _limite?: number }
        Returns: {
          acessos: number
          rota: string
          titulo: string
          ultimo_acesso: string
        }[]
      }
      move_to_dlq: {
        Args: {
          dlq_name: string
          message_id: number
          payload: Json
          source_queue: string
        }
        Returns: number
      }
      nivel_rank: { Args: { _nivel: string }; Returns: number }
      normalizar_descricao_cartao: {
        Args: { p_descricao: string }
        Returns: string
      }
      normalizar_numero_nf: { Args: { p_numero: string }; Returns: string }
      normalizar_tipo_movimentacao: {
        Args: { p_tipo_ofx: string; p_valor: number }
        Returns: string
      }
      obter_destinatario_pagamento: {
        Args: { p_cpr_id: string }
        Returns: Json
      }
      org_sync_in_progress: { Args: never; Returns: boolean }
      pagar_fatura_cartao: {
        Args: {
          p_conta_bancaria_id?: string
          p_data_pagamento?: string
          p_fatura_id: string
        }
        Returns: Json
      }
      perfil_area_do_departamento: {
        Args: { _departamento_id: string }
        Returns: {
          area_label: string
          departamento_label: string
          perfil_codigo: string
          perfil_nome: string
        }[]
      }
      persistir_ofx_stage: {
        Args: { p_importacao_stage_id: string }
        Returns: Json
      }
      pessoa_aparece_no_mural: { Args: { _user_id: string }; Returns: boolean }
      pipeline_enriquecer_cartao: {
        Args: never
        Returns: {
          ambiguos: number
          enriquecidos: number
          parceiros_criados: number
          sem_match: number
          total_processados: number
        }[]
      }
      preview_template_cargo: {
        Args: {
          _area_perfil_codigo: string
          _template_id: string
          _unidade_id: string
        }
        Returns: {
          nivel: string
          perfil_nome: string
          perfil_tipo: string
          unidade_nome: string
        }[]
      }
      processar_exclusao_dados_usuario: {
        Args: { _user_id: string }
        Returns: Json
      }
      processar_itau_pagamentos: {
        Args: { p_importacao_id: string }
        Returns: Json
      }
      processar_mural_fetely_diario: { Args: never; Returns: Json }
      processos_publicar_versao: {
        Args: { _motivo?: string; _processo_id: string }
        Returns: number
      }
      propor_cobranca: { Args: { p_pedido_id: string }; Returns: Json }
      qualidade_dado_contas: {
        Args: { p_conta_ids: string[] }
        Returns: {
          conta_id: string
          motivos: string[]
          nivel: string
        }[]
      }
      reabrir_nf_pj: {
        Args: { _motivo: string; _nota_id: string }
        Returns: Json
      }
      read_email_batch: {
        Args: { batch_size: number; queue_name: string; vt: number }
        Returns: {
          message: Json
          msg_id: number
          read_ct: number
        }[]
      }
      reaplicar_regras_stage_em_lote: {
        Args: { p_ids?: string[] }
        Returns: {
          acao: string
          categoria_id: string
          stage_id: string
        }[]
      }
      reativar_lancamento: { Args: { p_lancamento_id: string }; Returns: Json }
      recalcular_status_fatura: {
        Args: { p_conta_pagar_id: string }
        Returns: undefined
      }
      recalcular_status_nf_stage: {
        Args: { p_stage_id: string }
        Returns: undefined
      }
      receber_pedido_externo: {
        Args: {
          p_bairro?: string
          p_canal_fop?: string
          p_cep?: string
          p_cidade?: string
          p_cnpj: string
          p_complemento?: string
          p_condicao_solicitada: string
          p_contatos?: Json
          p_data_pedido: string
          p_desconto_pct?: number
          p_email?: string
          p_endereco_entrega?: Json
          p_forma_solicitada: string
          p_id_externo: string
          p_inscricao_estadual?: string
          p_isento_ie?: boolean
          p_itens_json?: Json
          p_logradouro?: string
          p_nome_fantasia?: string
          p_numero?: string
          p_observacao?: string
          p_observacao_cliente?: string
          p_observacao_pedido?: string
          p_origem?: string
          p_premissas?: Json
          p_razao_social?: string
          p_recebido_via?: string
          p_regiao_atuacao?: string
          p_segmento?: string
          p_situacao_cadastral?: string
          p_tags?: string[]
          p_telefone?: string
          p_uf?: string
          p_valor_bruto: number
          p_valor_liquido: number
          p_vendedor?: string
        }
        Returns: Json
      }
      registrar_acao_regua: {
        Args: {
          p_canal_efetivo?: string
          p_dias_offset: number
          p_etapa_codigo: string
          p_mensagem?: string
          p_observacao?: string
          p_resultado: string
          p_titulo_id: string
        }
        Returns: Json
      }
      registrar_aceite_termo_uso: {
        Args: { _versao: string }
        Returns: undefined
      }
      registrar_acesso_dado: {
        Args: {
          _alvo_user_id: string
          _contexto?: string
          _registro_id?: string
          _tabela_origem?: string
          _tipo_dado: string
        }
        Returns: undefined
      }
      registrar_acesso_salario_lote: {
        Args: {
          _alvo_user_ids: string[]
          _contexto: Database["public"]["Enums"]["contexto_acesso_salario"]
          _justificativa: string
        }
        Returns: number
      }
      registrar_audit: {
        Args: {
          _acao: string
          _dados_antes?: Json
          _dados_depois?: Json
          _justificativa?: string
          _registro_id: string
          _tabela: string
        }
        Returns: string
      }
      registrar_classificacao: {
        Args: {
          p_categoria_id: string
          p_cnpj: string
          p_descricao: string
          p_origem?: string
          p_parceiro_id: string
          p_user_id?: string
        }
        Returns: string
      }
      registrar_compra_pedido: {
        Args: {
          p_compra_id?: string
          p_conta_id?: string
          p_data_compra: string
          p_intervalo_dias?: number
          p_linhas: Json
          p_meio_pagamento_id: string
          p_observacao?: string
          p_parceiro_id: string
          p_parceiro_id_pedido_original?: string
          p_parcelas_count?: number
          p_pedido_id: string
          p_periodicidade?: string
          p_primeira_parcela_data?: string
          p_status_alvo: string
        }
        Returns: Json
      }
      registrar_consulta_processo: {
        Args: { _processo_id: string }
        Returns: undefined
      }
      registrar_correcao_regra: {
        Args: { p_regra_id: string }
        Returns: undefined
      }
      registrar_documento_intake: { Args: { p_dados: Json }; Returns: Json }
      registrar_evento_pedido: {
        Args: {
          p_descricao: string
          p_metadata?: Json
          p_pedido_id: string
          p_tipo_evento: string
        }
        Returns: Json
      }
      registrar_log_fiscal_nf: {
        Args: {
          _ator_papel?: string
          _detalhes?: Json
          _email_destinatario?: string
          _nota_id: string
          _tipo_evento: string
        }
        Returns: string
      }
      registrar_operacao_pedido: {
        Args: {
          p_descricao: string
          p_metadata?: Json
          p_pedido_id: string
          p_proxima_acao?: string
          p_tipo_evento: string
        }
        Returns: Json
      }
      rejeitar_nf_pj: {
        Args: { _motivo: string; _nota_id: string }
        Returns: Json
      }
      renegociar_titulo: {
        Args: {
          p_justificativa: string
          p_modalidade: number
          p_novo_tipo_pagamento?: string
          p_parcelas: Json
          p_titulo_id: string
        }
        Returns: Json
      }
      resolver_parceiro_do_documento: {
        Args: {
          p_dados_novo_parceiro?: Json
          p_decisao: string
          p_ged_documento_id: string
          p_parceiro_id?: string
        }
        Returns: Json
      }
      resolver_parceiro_em_lote: {
        Args: {
          p_cnpj_ia: string
          p_dados_novo_parceiro?: Json
          p_decisao: string
          p_parceiro_id?: string
        }
        Returns: Json
      }
      restaurar_snapshot_completo: {
        Args: { p_pedido_id: string; p_usuario_id: string }
        Returns: Json
      }
      reverter_para_cobranca: { Args: { p_pedido_id: string }; Returns: Json }
      revogar_acessos_ex_colaboradores: { Args: never; Returns: number }
      rotear_documento_para_boleto: {
        Args: { p_ged_documento_id: string }
        Returns: Json
      }
      rotear_pedido: { Args: { p_pedido_id: string }; Returns: Json }
      salvar_itens_pedido: {
        Args: { p_itens: Json; p_pedido_id: string }
        Returns: Json
      }
      score_match_nf: {
        Args: {
          p_cnpj_a: string
          p_cnpj_b: string
          p_data_a: string
          p_data_b: string
          p_numero_a: string
          p_numero_b: string
          p_valor_a: number
          p_valor_b: number
        }
        Returns: number
      }
      set_rota_status: {
        Args: { p_prefixo: string; p_status: string }
        Returns: {
          ordem: number
          prefixo: string
          status: string
          tela_slug: string | null
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "sncf_rotas_config"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      set_user_tema: {
        Args: { p_tema: string }
        Returns: {
          created_at: string
          tema: string
          updated_at: string
          user_id: string
        }
        SetofOptions: {
          from: "*"
          to: "user_preferencias_navegacao"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      show_limit: { Args: never; Returns: number }
      show_trgm: { Args: { "": string }; Returns: string[] }
      solicitar_prorrogacao_boleto: {
        Args: { p_nova_data: string; p_titulo_id: string }
        Returns: Json
      }
      solicitar_reemissao_boleto: {
        Args: {
          p_motivo?: string
          p_nova_data: string
          p_novo_valor?: number
          p_titulo_id: string
        }
        Returns: Json
      }
      submit_convite_cadastro: {
        Args: { _dados: Json; _token: string }
        Returns: boolean
      }
      sugerir_categoria: {
        Args: {
          p_cnpj?: string
          p_descricao?: string
          p_ncm?: string
          p_origem?: string
          p_parceiro_id?: string
        }
        Returns: {
          categoria_id: string
          centro_custo: string
          confianca: number
          motivo: string
          regra_id: string
          tipo_match: string
        }[]
      }
      sugerir_categoria_para_lancamento: {
        Args: {
          p_cnpj: string
          p_conta_id?: string
          p_descricao: string
          p_parceiro_id: string
        }
        Returns: {
          amostra_count: number
          amostra_descricao: string
          categoria_codigo: string
          categoria_id: string
          categoria_nome: string
          motivo: string
          score: number
          similares: Json
        }[]
      }
      sugerir_matches_lancamento: {
        Args: { p_lancamento_id: string }
        Returns: {
          conta_pagar_id: string
          data_vencimento: string
          descricao: string
          fornecedor_cliente: string
          score: number
          status: string
          valor: number
        }[]
      }
      sugerir_matches_ofx: {
        Args: { p_ofx_id: string }
        Returns: {
          conta_pagar_id: string
          data_vencimento: string
          descricao: string
          fornecedor_cliente: string
          score: number
          status: string
          valor: number
        }[]
      }
      sugerir_titulos_para_credito: {
        Args: { p_janela_dias?: number; p_movimentacao_id: string }
        Returns: {
          cliente: string
          data_vencimento_atual: string
          dias_distancia: number
          diff_valor: number
          nivel: string
          numero_titulo: string
          score: number
          status: string
          titulo_id: string
          valor_atual: number
        }[]
      }
      tem_consentimento_ativo: {
        Args: { _tipo: string; _user_id: string }
        Returns: boolean
      }
      tem_permissao: {
        Args: {
          _acao: string
          _modulo: string
          _unidade_id?: string
          _user_id: string
        }
        Returns: boolean
      }
      tem_qualquer_acesso_modulo: {
        Args: { _modulo: string; _user_id: string }
        Returns: boolean
      }
      template_sugerido_para_cargo: {
        Args: { _cargo_id: string }
        Returns: string
      }
      tentar_match_parceiro_retroativo: { Args: never; Returns: Json }
      termo_uso_versao_vigente: { Args: never; Returns: string }
      transicionar_analise: {
        Args: {
          p_acao: string
          p_analise_id: string
          p_delta_ia?: Json
          p_estagio_destino?: string
          p_formas_aceitas?: string[]
          p_limite_concedido?: number
          p_motivo?: string
          p_parecer_final?: string
          p_perfil_aplicado?: string
          p_prazo_max_dias?: number
          p_ressalva?: string
          p_validade_ate?: string
        }
        Returns: Json
      }
      transicionar_pedido: {
        Args: {
          p_automatico?: boolean
          p_motivo?: string
          p_para_estagio: string
          p_pedido_id: string
          p_proxima_acao?: string
        }
        Returns: Json
      }
      unaccent: { Args: { "": string }; Returns: string }
      user_perfis_detalhados: {
        Args: { _user_id: string }
        Returns: {
          atribuicao_id: string
          nivel: string
          perfil_codigo: string
          perfil_nome: string
          perfil_tipo: string
          unidade_id: string
          unidade_nome: string
          valido_ate: string
        }[]
      }
      user_unidades_acessiveis: {
        Args: { _user_id: string }
        Returns: {
          unidade_codigo: string
          unidade_id: string
          unidade_nome: string
        }[]
      }
      usuario_pode: {
        Args: { p_acao?: string; p_permissao_slug: string; p_user_id: string }
        Returns: boolean
      }
      usuario_telas_permitidas: {
        Args: { p_user_id: string }
        Returns: {
          slug: string
        }[]
      }
      validar_email_corporativo: { Args: { _email: string }; Returns: Json }
      validar_nf_pj: { Args: { _nota_id: string }; Returns: Json }
      validar_prontidao_sistema: { Args: never; Returns: Json }
      verificar_user_orfao: { Args: { _user_id: string }; Returns: boolean }
      vincular_conciliacao: {
        Args: {
          p_movimentacao_id: string
          p_ofx_id?: string
          p_planilha_id: string
        }
        Returns: Json
      }
      vincular_documento_polimorfico: {
        Args: {
          p_entidade_id: string
          p_entidade_tipo: string
          p_ged_documento_id: string
          p_observacao?: string
        }
        Returns: Json
      }
      vincular_lote_conciliacao: {
        Args: {
          p_movimentacao_ids: string[]
          p_ofx_id: string
          p_planilha_ids: string[]
        }
        Returns: Json
      }
      vincular_nf_a_conta: {
        Args: { p_conta_id: string; p_nf_id: string }
        Returns: Json
      }
      vincular_nf_a_parceiro: {
        Args: { p_nf_stage_id: string; p_parceiro_id: string }
        Returns: Json
      }
      vincular_planilha_fatura: {
        Args: { p_fatura_id: string; p_planilha_id: string }
        Returns: Json
      }
      vincular_planilha_multiplas_movs: {
        Args: { p_movimentacao_ids: string[]; p_planilha_id: string }
        Returns: Json
      }
      vincular_stage_2: {
        Args: { p_ofx_id: string; p_planilha_ids: string[] }
        Returns: Json
      }
      vincular_titulos_nf: { Args: never; Returns: number }
    }
    Enums: {
      app_role:
        | "super_admin"
        | "gestor_rh"
        | "gestor_direto"
        | "colaborador"
        | "financeiro"
        | "admin_rh"
        | "admin_ti"
        | "fiscal"
        | "operacional"
        | "recrutador"
        | "rh"
        | "administrativo"
        | "ti"
        | "recrutamento"
        | "gestao_direta"
        | "estagiario"
        | "diretoria_executiva"
      compra_anexo_tipo_enum:
        | "nf"
        | "recibo"
        | "comprovante_pagamento"
        | "outro"
      compra_registrada_status_enum: "rascunho" | "finalizada" | "excluida"
      contexto_acesso_salario:
        | "proprio"
        | "folha"
        | "holerite"
        | "admissao"
        | "convite"
        | "revisao_salarial"
        | "recrutamento"
        | "dashboard_custos"
        | "organograma"
        | "relatorio_pj"
        | "auditoria"
      nivel_cargo:
        | "estagio"
        | "assistente"
        | "analista"
        | "coordenador"
        | "gerente"
        | "diretor"
      pedido_compra_anexo_tipo_enum:
        | "cotacao"
        | "orcamento"
        | "proposta"
        | "imagem_referencia"
        | "outro"
      pedido_compra_item_status_enum: "pendente" | "comprado" | "cancelado"
      pedido_compra_status_enum:
        | "rascunho"
        | "aberto"
        | "em_compra"
        | "comprado"
        | "cancelado"
      pedido_compra_sub_estado_enum: "em_compra" | "aguardando_orcamento"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      app_role: [
        "super_admin",
        "gestor_rh",
        "gestor_direto",
        "colaborador",
        "financeiro",
        "admin_rh",
        "admin_ti",
        "fiscal",
        "operacional",
        "recrutador",
        "rh",
        "administrativo",
        "ti",
        "recrutamento",
        "gestao_direta",
        "estagiario",
        "diretoria_executiva",
      ],
      compra_anexo_tipo_enum: [
        "nf",
        "recibo",
        "comprovante_pagamento",
        "outro",
      ],
      compra_registrada_status_enum: ["rascunho", "finalizada", "excluida"],
      contexto_acesso_salario: [
        "proprio",
        "folha",
        "holerite",
        "admissao",
        "convite",
        "revisao_salarial",
        "recrutamento",
        "dashboard_custos",
        "organograma",
        "relatorio_pj",
        "auditoria",
      ],
      nivel_cargo: [
        "estagio",
        "assistente",
        "analista",
        "coordenador",
        "gerente",
        "diretor",
      ],
      pedido_compra_anexo_tipo_enum: [
        "cotacao",
        "orcamento",
        "proposta",
        "imagem_referencia",
        "outro",
      ],
      pedido_compra_item_status_enum: ["pendente", "comprado", "cancelado"],
      pedido_compra_status_enum: [
        "rascunho",
        "aberto",
        "em_compra",
        "comprado",
        "cancelado",
      ],
      pedido_compra_sub_estado_enum: ["em_compra", "aguardando_orcamento"],
    },
  },
} as const
