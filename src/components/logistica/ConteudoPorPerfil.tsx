import { useEffect } from "react";
import { cn } from "@/lib/utils";
import { nomeExibicao } from "@/lib/parceiros/nome";
import { FaturasConciliacao } from "./FaturasConciliacao";
import { DocumentosFrete } from "./DocumentosFrete";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { OcorrenciasDepara } from "./OcorrenciasDepara";
import { CotacaoApiCorreios } from "./CotacaoApiCorreios";
import { GestaoTabelasPreco } from "./GestaoTabelasPreco";
import { ConteudoTabelaPreco } from "./ConteudoTabelaPreco";
import { TabelaPreco } from "./TabelaPreco";
import { usePerfilDe, useTransportadoraPerfis } from "@/hooks/logistica/useTransportadoraPerfil";
import type { TransportadoraLogistica } from "@/hooks/logistica/useTransportadorasLogistica";

/** Custos & Faturas de UMA transportadora — decisão pelo perfil, nunca pelo nome. */
export function CustosFaturasTransportadora({ id, nome }: { id: string; nome: string }) {
  const perfil = usePerfilDe(id);
  if (!perfil) return null;
  const comOcorrencias = perfil.modo_rastreio !== "correios_api";
  return (
    <Tabs defaultValue="documentos">
      <TabsList>
        <TabsTrigger value="documentos">Documentos</TabsTrigger>
        <TabsTrigger value="faturas">Faturas & conciliação</TabsTrigger>
        {comOcorrencias && <TabsTrigger value="ocorrencias">Ocorrências (de-para)</TabsTrigger>}
      </TabsList>
      <TabsContent value="documentos" className="mt-4"><DocumentosFrete transportadoraId={id} /></TabsContent>
      <TabsContent value="faturas" className="mt-4">
        <FaturasConciliacao
          transportadoraId={id}
          transportadoraNome={nome}
          carrierB2C={perfil.modo_custo === "lancamento_postagem" ? "Correios" : null}
        />
      </TabsContent>
      {comOcorrencias && (
        <TabsContent value="ocorrencias" className="mt-4"><OcorrenciasDepara transportadoraId={id} /></TabsContent>
      )}
    </Tabs>
  );
}

/** Tabelas & Cotação de UMA transportadora — decisão pelo perfil. */
export function TabelasCotacaoTransportadora({ id }: { id: string }) {
  const perfil = usePerfilDe(id);
  if (!perfil) return null;
  if (!perfil.tem_cotacao_api && !perfil.tem_tabela_preco) {
    return (
      <div className="rounded-lg border p-8 text-center text-sm text-muted-foreground">
        Esta transportadora ainda não tem tabela nem cotação cadastrada
      </div>
    );
  }
  return (
    <div className="space-y-4">
      {perfil.tem_cotacao_api && <CotacaoApiCorreios />}
      {perfil.tem_tabela_preco && (
        <>
          <GestaoTabelasPreco transportadoraId={id} />
          <ConteudoTabelaPreco transportadoraId={id} />
          <TabelaPreco transportadoraId={id} />
        </>
      )}
    </div>
  );
}

/** Pills de transportadora (obrigatório escolher uma). */
export function SeletorTransportadora({
  transportadoras, valor, onChange, preferir,
}: {
  transportadoras: TransportadoraLogistica[];
  valor: string | null;
  onChange: (id: string) => void;
  preferir?: "importa_fatura";
}) {
  const { data: perfis } = useTransportadoraPerfis();
  useEffect(() => {
    if (valor && transportadoras.some((t) => t.id === valor)) return;
    if (!transportadoras.length || (preferir && !perfis)) return;
    const pref = preferir ? transportadoras.find((t) => perfis?.[t.id]?.[preferir]) : undefined;
    onChange((pref ?? transportadoras[0]).id);
  }, [valor, transportadoras, perfis, preferir, onChange]);

  return (
    <div className="flex flex-wrap gap-1.5">
      {transportadoras.map((t) => (
        <button
          key={t.id}
          onClick={() => onChange(t.id)}
          className={cn(
            "rounded-full px-3 py-1 text-xs border transition",
            valor === t.id ? "bg-primary text-primary-foreground border-primary" : "bg-card hover:bg-muted border-border",
          )}
        >
          {nomeExibicao(t.razao_social, t.nome_fantasia)}
        </button>
      ))}
    </div>
  );
}
