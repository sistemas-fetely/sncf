import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Wand2 } from "lucide-react";
import type { PerfilCredito, FormaPagamento, SugestaoIA } from "@/types/credito";

export interface CamposDecisao {
  perfil_aplicado: PerfilCredito;
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

const PERFIS: { value: PerfilCredito; label: string }[] = [
  { value: "novo_entrada", label: "Novo entrada" },
  { value: "novo_qualificado", label: "Novo qualificado" },
  { value: "recorrente_bom_pagador", label: "Recorrente bom pagador" },
  { value: "premium", label: "Premium" },
  { value: "bandeira_vermelha", label: "Bandeira vermelha" },
];

const FORMAS: FormaPagamento[] = ["boleto", "pix", "cartao"];

function diferente(a: unknown, b: unknown): boolean {
  if (Array.isArray(a) && Array.isArray(b)) {
    return JSON.stringify([...a].sort()) !== JSON.stringify([...b].sort());
  }
  return a !== b;
}

function MarcadorDelta({ alterado }: { alterado: boolean }) {
  if (!alterado) return null;
  return (
    <Badge variant="outline" className="gap-1 text-[10px] py-0 px-1.5 border-blue-300 text-blue-700">
      <Wand2 className="h-2.5 w-2.5" />
      editado
    </Badge>
  );
}

export function FormDecisaoCredito({ valores, sugestaoIA, onChange, disabled }: Props) {
  const set = <K extends keyof CamposDecisao>(k: K, v: CamposDecisao[K]) => {
    onChange({ ...valores, [k]: v });
  };

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
          Campos pré-preenchidos pela IA. Edite o que quiser; o sistema registra a diferença automaticamente.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <Label>Perfil aplicado</Label>
              <MarcadorDelta
                alterado={
                  !!sugestaoIA &&
                  diferente(sugestaoIA.perfil_aplicado, valores.perfil_aplicado)
                }
              />
            </div>
            <Select
              value={valores.perfil_aplicado}
              onValueChange={(v) => set("perfil_aplicado", v as PerfilCredito)}
              disabled={disabled}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {PERFIS.map((p) => (
                  <SelectItem key={p.value} value={p.value}>
                    {p.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <Label>Limite concedido (R$)</Label>
              <MarcadorDelta
                alterado={
                  !!sugestaoIA &&
                  diferente(sugestaoIA.limite_concedido, valores.limite_concedido)
                }
              />
            </div>
            <Input
              type="number"
              min={0}
              value={valores.limite_concedido}
              onChange={(e) => set("limite_concedido", Number(e.target.value))}
              disabled={disabled}
            />
          </div>

          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <Label>Prazo máximo (dias)</Label>
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
            <div className="flex items-center justify-between">
              <Label>Validade da decisão</Label>
            </div>
            <Input
              type="date"
              value={valores.validade_ate}
              onChange={(e) => set("validade_ate", e.target.value)}
              disabled={disabled}
            />
            <p className="text-xs text-muted-foreground">
              Default 90 dias (calculado pelo banco se deixado vazio).
            </p>
          </div>
        </div>

        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <Label>Formas aceitas</Label>
            <MarcadorDelta
              alterado={
                !!sugestaoIA &&
                diferente(sugestaoIA.formas_aceitas, valores.formas_aceitas)
              }
            />
          </div>
          <div className="flex flex-wrap gap-4">
            {FORMAS.map((f) => (
              <label key={f} className="flex items-center gap-2 text-sm capitalize cursor-pointer">
                <Checkbox
                  checked={valores.formas_aceitas.includes(f)}
                  onCheckedChange={() => toggleForma(f)}
                  disabled={disabled}
                />
                {f}
              </label>
            ))}
          </div>
        </div>

        <div className="space-y-1.5">
          <div className="flex items-center justify-between">
            <Label>Parecer público (vai pro lojista via Mariana)</Label>
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

        <div className="space-y-1.5">
          <Label>Ressalva (se aprovação com ressalva)</Label>
          <Textarea
            rows={2}
            value={valores.ressalva}
            onChange={(e) => set("ressalva", e.target.value)}
            disabled={disabled}
            placeholder="Opcional. Preencha se for aprovar com ressalva."
          />
        </div>

        <div className="space-y-1.5">
          <Label className="text-xs text-muted-foreground flex items-center gap-2">
            💬 Anotar contexto (opcional — vai pra aprendizado da IA)
          </Label>
          <Textarea
            rows={2}
            value={valores.contexto_anotacao}
            onChange={(e) => set("contexto_anotacao", e.target.value)}
            disabled={disabled}
            placeholder="Por que editou? Ex: 'reduzi limite porque o sócio tem ações judiciais em outras empresas'"
            className="text-sm"
          />
        </div>
      </CardContent>
    </Card>
  );
}
