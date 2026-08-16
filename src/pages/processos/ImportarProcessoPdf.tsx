import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, FileText, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { ImportarPdfDialog } from "@/components/processos/ImportarPdfDialog";
import { RevisaoProcessoIA } from "@/components/processos/RevisaoProcessoIA";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";

export default function ImportarProcessoPdf() {
  const navigate = useNavigate();
  const { user } = useAuth();

  const [dialogAberto, setDialogAberto] = useState(true);
  const [resultadoUnico, setResultadoUnico] = useState<any>(null);
  const [importacaoId, setImportacaoId] = useState<string | null>(null);
  const [multiplos, setMultiplos] = useState<any[] | null>(null);
  const [arquivoNome, setArquivoNome] = useState("");

  const handleProcessoUnico = (resultado: any, impId: string) => {
    setResultadoUnico({ ...resultado, arquivo_nome: arquivoNome || resultado.arquivo_nome });
    setImportacaoId(impId);
    setDialogAberto(false);
  };

  const handleMultiplos = (processos: any[], nomeArq: string, impId: string) => {
    setMultiplos(processos);
    setArquivoNome(nomeArq);
    setImportacaoId(impId);
    setDialogAberto(false);
  };

  const handleCancel = () => {
    navigate("/processos");
  };

  // Quando Flavio escolhe 1 dos múltiplos, registra os outros como sugestão
  const handleEscolherDosMultiplos = async (escolhido: any, indiceEscolhido: number) => {
    if (!multiplos) return;

    const naoEscolhidos = multiplos.filter((_, idx) => idx !== indiceEscolhido);

    if (naoEscolhidos.length > 0 && user?.id) {
      try {
        const sugestoes = naoEscolhidos.map((p: any) => ({
          processo_id: null,
          titulo_sugerido: p.nome || `Processo de ${arquivoNome}`,
          descricao: `${p.descricao || "Processo descoberto durante importação de PDF."}\n\n[Origem: importação PDF "${arquivoNome}" — não foi o escolhido inicialmente]`,
          origem: "descoberto_em_importacao_pdf",
          sugerido_por: user.id,
          status: "pendente",
        }));

        const { error: errSug } = await supabase.from("processos_sugestoes").insert(sugestoes);

        if (errSug) throw errSug;

        toast.success(
          `${naoEscolhidos.length} processo${naoEscolhidos.length > 1 ? "s" : ""} extra${naoEscolhidos.length > 1 ? "s" : ""} registrado${naoEscolhidos.length > 1 ? "s" : ""} como sugestão para importação futura.`
        );
      } catch (e: any) {
        console.error("Erro ao registrar sugestões:", e);
        toast.warning("Não conseguimos registrar os outros processos como sugestão (não bloqueia o atual).");
      }
    }

    setResultadoUnico({ ...escolhido, arquivo_nome: arquivoNome });
  };

  // 1 processo único → tela de revisão
  if (resultadoUnico && importacaoId) {
    return (
      <RevisaoProcessoIA
        resultadoIa={resultadoUnico}
        importacaoId={importacaoId}
        onCancel={handleCancel}
      />
    );
  }

  // Múltiplos → lista pra escolher
  if (multiplos && multiplos.length > 0) {
    return (
      <div className="container mx-auto py-6 space-y-5 max-w-3xl">
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" onClick={handleCancel} className="gap-1.5">
            <ArrowLeft className="h-3.5 w-3.5" /> Voltar
          </Button>
        </div>

        <div>
          <h1 className="text-2xl font-medium tracking-tight flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-info" />
            Múltiplos processos identificados
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            O PDF <strong>{arquivoNome}</strong> parece conter mais de um processo. Qual você quer importar agora?
          </p>
        </div>

        <div className="grid gap-2">
          {multiplos.map((p: any, idx: number) => (
            <Card
              key={idx}
              className="cursor-pointer hover:shadow-md hover:border-primary/30 transition-all"
              onClick={() => handleEscolherDosMultiplos(p, idx)}
            >
              <CardContent className="p-4">
                <div className="flex items-start gap-3">
                  <FileText className="h-5 w-5 text-primary mt-0.5 shrink-0" />
                  <div className="flex-1 min-w-0">
                    <h3 className="font-medium leading-tight">
                      {p.nome || `Processo ${idx + 1}`}
                    </h3>
                    {p.descricao && (
                      <p className="text-xs text-muted-foreground mt-1">{p.descricao}</p>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        <div className="pt-2 space-y-2">
          <Button variant="outline" onClick={handleCancel}>
            <ArrowLeft className="h-3.5 w-3.5 mr-1.5" /> Descartar tudo
          </Button>
          <p className="text-[10px] text-muted-foreground">
            Ao escolher um, os outros são salvos como sugestões pra você importar depois.
          </p>
        </div>
      </div>
    );
  }

  return (
    <ImportarPdfDialog
      open={dialogAberto}
      onOpenChange={(open) => {
        setDialogAberto(open);
        if (!open && !resultadoUnico && !multiplos) {
          navigate("/processos");
        }
      }}
      onProcessoUnico={handleProcessoUnico}
      onMultiplos={handleMultiplos}
    />
  );
}
