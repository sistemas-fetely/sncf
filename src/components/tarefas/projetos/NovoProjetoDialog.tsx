import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { SeletorPessoa } from "@/components/tarefas/detalhe/comuns";
import { useCriarProjeto, type ProjetoVisibilidade } from "@/hooks/tarefas/useProjetosTarefas";
import { cn } from "@/lib/utils";

export const CORES = ["#2563EB", "#0EA5E9", "#10B981", "#F59E0B", "#EF4444", "#8B5CF6", "#EC4899", "#64748B"];

interface Props {
  aberto: boolean;
  onOpenChange: (v: boolean) => void;
}

export function NovoProjetoDialog({ aberto, onOpenChange }: Props) {
  const navigate = useNavigate();
  const criar = useCriarProjeto();
  const [nome, setNome] = useState("");
  const [descricao, setDescricao] = useState("");
  const [cor, setCor] = useState(CORES[0]);
  const [visibilidade, setVisibilidade] = useState<ProjetoVisibilidade>("publica");
  const [responsavel, setResponsavel] = useState<string | null>(null);
  const [inicio, setInicio] = useState("");
  const [fim, setFim] = useState("");

  async function salvar() {
    if (!nome.trim()) return;
    const id = await criar.mutateAsync({
      nome: nome.trim(),
      descricao: descricao.trim() || null,
      cor,
      visibilidade,
      responsavel_id: responsavel,
      data_inicio: inicio || null,
      data_fim_prevista: fim || null,
    });
    onOpenChange(false);
    setNome(""); setDescricao(""); setInicio(""); setFim(""); setResponsavel(null);
    navigate(`/tarefas/projetos/${id}`);
  }

  return (
    <Dialog open={aberto} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Novo projeto</DialogTitle>
          <DialogDescription>Um lugar para agrupar tarefas, seções e responsáveis.</DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-1">
            <Label htmlFor="proj-nome">Nome</Label>
            <Input id="proj-nome" value={nome} onChange={(e) => setNome(e.target.value)} placeholder="Ex.: Lançamento Lumier" />
          </div>

          <div className="space-y-1">
            <Label htmlFor="proj-desc">Descrição</Label>
            <Textarea id="proj-desc" rows={3} value={descricao} onChange={(e) => setDescricao(e.target.value)} />
          </div>

          <div className="space-y-1">
            <Label>Cor</Label>
            <div className="flex flex-wrap gap-2">
              {CORES.map((c) => (
                <button
                  key={c}
                  type="button"
                  aria-label={`cor ${c}`}
                  onClick={() => setCor(c)}
                  className={cn(
                    "h-7 w-7 rounded-full border-2 transition",
                    cor === c ? "border-foreground scale-110" : "border-transparent"
                  )}
                  style={{ backgroundColor: c }}
                />
              ))}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label>Visibilidade</Label>
              <Select value={visibilidade} onValueChange={(v) => setVisibilidade(v as ProjetoVisibilidade)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="publica">Pública</SelectItem>
                  <SelectItem value="departamento">Departamento</SelectItem>
                  <SelectItem value="privada">Privada</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label>Responsável</Label>
              <SeletorPessoa valor={responsavel} onChange={setResponsavel} />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label htmlFor="proj-ini">Início</Label>
              <Input id="proj-ini" type="date" value={inicio} onChange={(e) => setInicio(e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label htmlFor="proj-fim">Fim previsto</Label>
              <Input id="proj-fim" type="date" value={fim} onChange={(e) => setFim(e.target.value)} />
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button onClick={salvar} disabled={!nome.trim() || criar.isPending}>
            {criar.isPending ? "Criando…" : "Criar projeto"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
