import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, Loader2, Pencil, Plus } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { definirInstrucaoExpedicao, instrucaoMudou } from "@/lib/pedidos/instrucaoExpedicao";
import { invalidarPedido } from "@/lib/pedidos/invalidarPedido";
import { formatError } from "@/lib/format-error";

export function InstrucaoExpedicaoBloco({ pedido }: { pedido: { id: string; instrucao_expedicao?: string | null; instrucao_expedicao_lida_em?: string | null } }) {
  const qc = useQueryClient();
  const [editando, setEditando] = useState(false);
  const [texto, setTexto] = useState("");
  const salvar = useMutation({
    mutationFn: () => definirInstrucaoExpedicao(pedido.id, texto),
    onSuccess: async () => {
      await invalidarPedido(qc, pedido.id);
      setEditando(false);
      toast.success(texto.trim() ? "Instrução para expedição salva." : "Instrução para expedição removida.");
    },
    onError: (e) => toast.error(formatError(e)),
  });
  const abrir = () => { setTexto(pedido.instrucao_expedicao ?? ""); setEditando(true); };
  if (!pedido.instrucao_expedicao && !editando) return <Button variant="outline" onClick={abrir}><Plus className="h-4 w-4" />Adicionar instrução para expedição</Button>;
  return <section aria-label="Instrução para expedição" className="space-y-3 rounded-md border border-warning/50 bg-warning/10 p-4">
    <div className="flex flex-wrap items-center justify-between gap-2">
      <h3 className="flex items-center gap-2 text-sm font-semibold text-warning-strong"><AlertTriangle className="h-5 w-5" />Instrução para expedição</h3>
      {!editando && <Button variant="outline" size="sm" onClick={abrir}><Pencil className="h-4 w-4" />Editar</Button>}
    </div>
    {editando ? <>
      <Textarea aria-label="Instrução para expedição" value={texto} onChange={(e) => setTexto(e.target.value)} disabled={salvar.isPending} autoFocus />
      <div className="flex gap-2"><Button onClick={() => salvar.mutate()} disabled={salvar.isPending || !instrucaoMudou(pedido.instrucao_expedicao, texto)}>{salvar.isPending && <Loader2 className="h-4 w-4 animate-spin" />}Salvar</Button><Button variant="outline" disabled={salvar.isPending} onClick={() => setEditando(false)}>Cancelar</Button></div>
    </> : <>
      <p className="whitespace-pre-wrap break-words text-base font-semibold">{pedido.instrucao_expedicao}</p>
      <p className="text-sm text-warning-strong">{pedido.instrucao_expedicao_lida_em ? `Lida em ${new Date(pedido.instrucao_expedicao_lida_em).toLocaleString("pt-BR")}` : "Pendente de leitura"}</p>
    </>}
  </section>;
}