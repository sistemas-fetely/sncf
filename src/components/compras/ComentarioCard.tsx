import { useState } from "react";
import { format, formatDistanceToNow } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Pencil, Trash2, Check, X, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { useEditarComentario } from "@/hooks/compras/useEditarComentario";
import { useExcluirComentario } from "@/hooks/compras/useExcluirComentario";
import type { TimelineComentarioItem } from "@/lib/compras/timeline-types";

interface Props {
  item: TimelineComentarioItem;
  pedidoId: string;
}

export function ComentarioCard({ item, pedidoId }: Props) {
  const [editando, setEditando] = useState(false);
  const [textoEdit, setTextoEdit] = useState(item.conteudo);
  const editar = useEditarComentario();
  const excluir = useExcluirComentario();

  const handleSalvarEdicao = async () => {
    const txt = textoEdit.trim();
    if (!txt || txt === item.conteudo) {
      setEditando(false);
      return;
    }
    await editar.mutateAsync({
      comentario_id: item.id,
      conteudo: txt,
      pedido_id: pedidoId,
    });
    setEditando(false);
  };

  const handleExcluir = async () => {
    await excluir.mutateAsync({ comentario_id: item.id, pedido_id: pedidoId });
  };

  const excluido = !!item.excluido_em;

  return (
    <div className="flex gap-3">
      <div className="h-8 w-8 rounded-full bg-primary/10 text-primary flex items-center justify-center text-sm font-medium flex-shrink-0">
        {item.autor_nome.charAt(0).toUpperCase()}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-baseline gap-2 flex-wrap">
          <span className="text-sm font-medium">{item.autor_nome}</span>
          <span className="text-xs text-muted-foreground">
            {format(new Date(item.created_at), "dd MMM, HH:mm", { locale: ptBR })}
            {" · "}
            {formatDistanceToNow(new Date(item.created_at), { addSuffix: true, locale: ptBR })}
          </span>
          {item.editado_em && (
            <span className="text-xs text-muted-foreground italic">(editado)</span>
          )}
          {excluido && (
            <span className="text-xs text-destructive italic">(excluído)</span>
          )}
        </div>

        {editando ? (
          <div className="mt-1 space-y-2">
            <Textarea
              value={textoEdit}
              onChange={(e) => setTextoEdit(e.target.value)}
              rows={3}
              maxLength={5000}
              autoFocus
            />
            <div className="flex gap-2">
              <Button size="sm" onClick={handleSalvarEdicao} disabled={editar.isPending}>
                {editar.isPending ? (
                  <Loader2 className="h-3 w-3 animate-spin" />
                ) : (
                  <Check className="h-3 w-3 mr-1" />
                )}
                Salvar
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => {
                  setEditando(false);
                  setTextoEdit(item.conteudo);
                }}
              >
                <X className="h-3 w-3 mr-1" /> Cancelar
              </Button>
            </div>
          </div>
        ) : (
          <p
            className={`text-sm whitespace-pre-wrap mt-0.5 ${
              excluido ? "text-muted-foreground italic line-through" : "text-foreground"
            }`}
          >
            {excluido ? "Comentário excluído" : item.conteudo}
          </p>
        )}

        {!editando && !excluido && (item.pode_editar || item.pode_excluir) && (
          <div className="flex gap-1 mt-1">
            {item.pode_editar && (
              <Button
                size="sm"
                variant="ghost"
                className="h-7 text-xs"
                onClick={() => setEditando(true)}
              >
                <Pencil className="h-3 w-3 mr-1" /> Editar
              </Button>
            )}
            {item.pode_excluir && (
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-7 text-xs text-destructive hover:text-destructive"
                  >
                    <Trash2 className="h-3 w-3 mr-1" /> Excluir
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Excluir comentário?</AlertDialogTitle>
                    <AlertDialogDescription>
                      Esta ação não pode ser desfeita. O comentário ficará marcado como
                      excluído na timeline.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Cancelar</AlertDialogCancel>
                    <AlertDialogAction
                      onClick={handleExcluir}
                      className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                    >
                      Excluir
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
