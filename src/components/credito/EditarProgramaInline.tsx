import { useState } from "react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Pencil, Check, X } from "lucide-react";
import { useAtualizarPrograma } from "@/hooks/credito/useAtualizarPrograma";
import type { NivelPrograma, CategoriaKa } from "@/types/credito";

interface Props {
  parceiro_id: string;
  nivel_atual: NivelPrograma;
  categoria_ka_atual: CategoriaKa;
}

const NIVEIS: { value: NivelPrograma; label: string }[] = [
  { value: "convive", label: "Convive" },
  { value: "anfitriao", label: "Anfitrião" },
  { value: "embaixador", label: "Embaixador" },
  { value: "mestre", label: "Mestre de Cerimônia" },
];

const KA_OPCOES: { value: string; label: string }[] = [
  { value: "_null", label: "Não é KA" },
  { value: "parceiro", label: "KA Parceiro" },
  { value: "familia", label: "KA Família" },
];

export function EditarProgramaInline({ parceiro_id, nivel_atual, categoria_ka_atual }: Props) {
  const [editing, setEditing] = useState(false);
  const [nivel, setNivel] = useState<NivelPrograma>(nivel_atual);
  const [ka, setKa] = useState<CategoriaKa>(categoria_ka_atual);
  const atualizar = useAtualizarPrograma();

  const handleSave = async () => {
    await atualizar.mutateAsync({
      parceiro_id,
      nivel_programa: nivel,
      categoria_ka: ka,
    });
    setEditing(false);
  };

  const handleCancel = () => {
    setNivel(nivel_atual);
    setKa(categoria_ka_atual);
    setEditing(false);
  };

  if (!editing) {
    return (
      <div className="space-y-1">
        <div className="flex items-center justify-between">
          <Label className="text-xs text-muted-foreground">Programa de Parceiros</Label>
          <Button
            variant="ghost"
            size="sm"
            className="h-6 px-2 gap-1 text-xs"
            onClick={() => setEditing(true)}
          >
            <Pencil className="h-3 w-3" />
            Editar
          </Button>
        </div>
        <p className="text-sm capitalize">
          {(nivel_atual || "convive").replace("_", " ")}
          {categoria_ka_atual && (
            <span className="text-muted-foreground"> · KA {categoria_ka_atual}</span>
          )}
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-2 p-2 rounded-md border bg-muted/30">
      <div className="space-y-1">
        <Label className="text-xs">Nível</Label>
        <Select value={nivel} onValueChange={(v) => setNivel(v as NivelPrograma)}>
          <SelectTrigger className="h-8">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {NIVEIS.map((n) => (
              <SelectItem key={n.value} value={n.value}>
                {n.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="space-y-1">
        <Label className="text-xs">Categoria KA</Label>
        <Select
          value={ka ?? "_null"}
          onValueChange={(v) => setKa(v === "_null" ? null : (v as CategoriaKa))}
        >
          <SelectTrigger className="h-8">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {KA_OPCOES.map((k) => (
              <SelectItem key={k.value} value={k.value}>
                {k.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="flex gap-2 pt-1">
        <Button size="sm" className="h-7 gap-1" onClick={handleSave} disabled={atualizar.isPending}>
          <Check className="h-3 w-3" />
          Salvar
        </Button>
        <Button size="sm" variant="ghost" className="h-7 gap-1" onClick={handleCancel}>
          <X className="h-3 w-3" />
          Cancelar
        </Button>
      </div>
    </div>
  );
}
