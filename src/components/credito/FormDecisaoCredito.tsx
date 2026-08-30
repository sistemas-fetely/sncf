import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Wand2 } from "lucide-react";
import { CurrencyInput } from "./CurrencyInput";
import { useFormasPagamento } from "@/hooks/financeiro/useFormasPagamento";
import type { PerfilCredito, FormaPagamento, SugestaoIA } from "@/types/credito";

export interface CamposDecisao {
  perfil_aplicado: PerfilCredito; // mantido internamente, vem da IA
  limite_concedido: number;
  prazo_max_dias: number;
  formas_aceitas: FormaPagamento[];
  parecer_final: string;
  ressalva: string;
  validade_ate: string;
  contexto_anotacao: string;
}

interface Props {
  valores: CamposDecisao;
  sugestaoIA: SugestaoIA | null;
  onChange: (next: CamposDecisao) => void;
  disabled?: boolean;
}



function diferente(a: unknown, b: unknown): boolean {
  if (Array.isArray(a) && Array.isArray(b)) {
    return JSON.stringify([...a].sort()) !== JSON.stringify([...b].sort());
  }
  return a !== b;
}

function MarcadorDelta({ alterado }: { alterado: boolean }) {
  if (!alterado) return null;
  return (
    <Badge variant="outline" className="gap-1 text-[10px] py-0 px-1.5 border-info/40 text-info">
      <Wand2 className="h-2.5 w-2.5" />
      editado
    </Badge>
  );
}

export function FormDecisaoCredito({ valores, sugestaoIA, onChange, disabled }: Props) {
  const formasQ = useFormasPagamento(true);

  const set = <K extends keyof CamposDecisao>(k: K, v: CamposDecisao[K]) => {
    onChange({ ...valores, [k]: v });
  };

  // Dimensão via tabela: todas as ativas + códigos legados salvos que não existem mais
  const codigosAtivos = new Set((formasQ.data ?? []).map((f) => f.codigo));
  const legados = valores.formas_aceitas.filter((c) => !codigosAtivos.has(c));
  const opcoes = [
    ...(formasQ.data ?? []).map((f) => ({ codigo: f.codigo, nome: f.nome })),
    ...legados.map((c) => ({ codigo: c, nome: `${c} (legado)` })),
  ];

  const toggleForma = (f: FormaPagamento) => {
    const has = valores.formas_aceitas.includes(f);
    set(
      "formas_aceitas",
      has ? valores.formas_aceitas.filter((x) => x !== f) : [...valores.formas_aceitas, f],
    );
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Decisão</CardTitle>
        <CardDescription>
          Joseph tem autonomia total — edite tudo. Sistema registra a diferença em relação à IA pra aprendizado.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <Label className="text-xs">Limite concedido</Label>
              <MarcadorDelta
                alterado={
                  !!sugestaoIA &&
                  diferente(sugestaoIA.limite_concedido, valores.limite_concedido)
                }
              />
            </div>
            <CurrencyInput
              value={valores.limite_concedido}
              onChange={(v) => set("limite_concedido", v)}
              disabled={disabled}
            />
          </div>

          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <Label className="text-xs">Prazo máximo (dias)</Label>
              <MarcadorDelta
                alterado={
                  !!sugestaoIA &&
                  diferente(sugestaoIA.prazo_max_dias, valores.prazo_max_dias)
                }
              />
            </div>
            <Input
              type="number"
              min={0}
              value={valores.prazo_max_dias}
              onChange={(e) => set("prazo_max_dias", Number(e.target.value))}
              disabled={disabled}
            />
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs">Validade da decisão</Label>
            <Input
              type="date"
              value={valores.validade_ate}
              onChange={(e) => set("validade_ate", e.target.value)}
              disabled={disabled}
            />
            <p className="text-[11px] text-muted-foreground">Vazio = 90 dias automático</p>
          </div>
        </div>

        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <Label className="text-xs">Formas aceitas</Label>
            <MarcadorDelta
              alterado={
                !!sugestaoIA &&
                diferente(sugestaoIA.formas_aceitas, valores.formas_aceitas)
              }
            />
          </div>
          <div className="flex flex-wrap gap-4">
            {opcoes.map((f) => (
              <label key={f.codigo} className="flex items-center gap-2 text-sm cursor-pointer">
                <Checkbox
                  checked={valores.formas_aceitas.includes(f.codigo)}
                  onCheckedChange={() => toggleForma(f.codigo)}
                  disabled={disabled}
                />
                {f.nome}
              </label>
            ))}
          </div>
        </div>

        <div className="space-y-1.5">
          <div className="flex items-center justify-between">
            <Label className="text-xs">Parecer público (Mariana repassa ao lojista)</Label>
            <MarcadorDelta
              alterado={
                !!sugestaoIA && diferente(sugestaoIA.parecer_final, valores.parecer_final)
              }
            />
          </div>
          <Textarea
            rows={3}
            value={valores.parecer_final}
            onChange={(e) => set("parecer_final", e.target.value)}
            disabled={disabled}
            placeholder="Mensagem curta e calorosa pro lojista."
          />
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <Label className="text-xs">Ressalva (se aprovação com ressalva)</Label>
            <Textarea
              rows={2}
              value={valores.ressalva}
              onChange={(e) => set("ressalva", e.target.value)}
              disabled={disabled}
              placeholder="Opcional. Preencha se for aprovar com ressalva."
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">
              💬 Anotar contexto (opcional — vai pra aprendizado da IA)
            </Label>
            <Textarea
              rows={2}
              value={valores.contexto_anotacao}
              onChange={(e) => set("contexto_anotacao", e.target.value)}
              disabled={disabled}
              placeholder="Por que editou? Vai pra próxima análise da IA."
              className="text-sm"
            />
          </div>
        </div>

        <div className="space-y-1.5 pt-2 border-t">
          <div className="flex items-center justify-between">
            <Label className="text-xs">Perfil de crédito</Label>
            <MarcadorDelta
              alterado={
                !!sugestaoIA &&
                diferente(sugestaoIA.perfil_aplicado, valores.perfil_aplicado)
              }
            />
          </div>
          <Select
            value={valores.perfil_aplicado}
            onValueChange={(v) => onChange({ ...valores, perfil_aplicado: v as PerfilCredito })}
            disabled={disabled}
          >
            <SelectTrigger className="w-full md:w-[320px]">
              <SelectValue placeholder="Selecione o perfil" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="novo_entrada">Novo (entrada)</SelectItem>
              <SelectItem value="novo_qualificado">Novo qualificado</SelectItem>
              <SelectItem value="recorrente_bom_pagador">Recorrente bom pagador</SelectItem>
              <SelectItem value="premium">Premium</SelectItem>
              <SelectItem value="bandeira_vermelha">Bandeira vermelha</SelectItem>
            </SelectContent>
          </Select>
          {sugestaoIA?.perfil_aplicado && sugestaoIA.perfil_aplicado !== valores.perfil_aplicado && (
            <p className="text-[11px] text-muted-foreground flex items-center gap-1">
              <Wand2 className="h-3 w-3 text-info" />
              Sugestão IA: {" "}
              <span className="font-medium capitalize">
                {sugestaoIA.perfil_aplicado.replace(/_/g, " ")}
              </span>
            </p>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
