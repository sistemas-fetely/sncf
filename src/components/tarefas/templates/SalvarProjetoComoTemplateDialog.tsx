import { useEffect, useState } from "react";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useSalvarProjetoComoTemplate } from "@/hooks/tarefas/useTemplates";

interface Props {
  projetoId: string;
  nomeSugerido: string;
  aberto: boolean;
  onOpenChange: (v: boolean) => void;
}

export function SalvarProjetoComoTemplateDialog({ projetoId, nomeSugerido, aberto, onOpenChange }: Props) {
  const salvar = useSalvarProjetoComoTemplate();
  const [nome, setNome] = useState(nomeSugerido);
  const [descricao, setDescricao] = useState("");

  useEffect(() => {
    if (aberto) {
      setNome(nomeSugerido ? `${nomeSugerido} (template)` : "");
      setDescricao("");
    }
  }, [aberto, nomeSugerido]);

  return (
    <Dialog open={aberto} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Salvar projeto como template</DialogTitle>
          <DialogDescription>
            As seções e as tarefas atuais viram itens do template. O intervalo entre os prazos é
            convertido em dias após o início.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label>Nome do template</Label>
            <Input value={nome} onChange={(e) => setNome(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label>Descrição</Label>
            <Textarea rows={2} value={descricao} onChange={(e) => setDescricao(e.target.value)} />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button
            disabled={!nome.trim() || salvar.isPending}
            onClick={() =>
              salvar.mutate(
                { projetoId, nome: nome.trim(), descricao: descricao.trim() || null },
                { onSuccess: () => onOpenChange(false) }
              )
            }
          >
            {salvar.isPending ? "Salvando…" : "Salvar template"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
