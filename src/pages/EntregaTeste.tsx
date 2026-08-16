import { useState } from "react";
import { publicUrl } from "@/lib/urls";
import { useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { Check, Loader2, Upload } from "lucide-react";

export default function EntregaTeste() {
  const { id } = useParams<{ id: string }>();
  const [email, setEmail] = useState("");
  const [link, setLink] = useState("");
  const [arquivo, setArquivo] = useState<File | null>(null);
  const [enviando, setEnviando] = useState(false);
  const [entregue, setEntregue] = useState(false);
  const [buscando, setBuscando] = useState(false);
  const [teste, setTeste] = useState<any>(null);
  const [candidato, setCandidato] = useState<any>(null);
  const [erro, setErro] = useState("");

  const { data: vaga } = useQuery({
    queryKey: ["vaga-publica", id],
    queryFn: async () => {
      const { data } = await supabase
        .from("vagas")
        .select("titulo, area, tipo_contrato")
        .eq("id", id!)
        .single();
      return data;
    },
    enabled: !!id,
  });

  async function buscarTeste() {
    if (!email || !email.includes("@")) {
      setErro("Informe um e-mail válido.");
      return;
    }
    setBuscando(true);
    setErro("");
    try {
      const { data: cand } = await supabase
        .from("candidatos")
        .select("id, nome, email")
        .eq("vaga_id", id!)
        .eq("email", email.toLowerCase().trim())
        .maybeSingle();

      if (!cand) {
        setErro("E-mail não encontrado nesta vaga. Verifique o e-mail cadastrado.");
        return;
      }

      const { data: t } = await supabase
        .from("testes_tecnicos" as any)
        .select("*")
        .eq("candidato_id", cand.id)
        .eq("vaga_id", id!)
        .maybeSingle();

      if (!t || !(t as any).enviado_em) {
        setErro("Nenhum teste técnico encontrado para este e-mail.");
        return;
      }

      if ((t as any).entregue_em) {
        setErro("Você já entregou este teste. Caso precise reenviar, entre em contato com o RH.");
        return;
      }

      setCandidato(cand);
      setTeste(t);
    } catch (e: any) {
      setErro("Erro ao buscar teste: " + e.message);
    } finally {
      setBuscando(false);
    }
  }

  async function enviarEntrega() {
    if (!link && !arquivo) {
      toast.error("Informe um link ou faça upload do arquivo.");
      return;
    }
    setEnviando(true);
    try {
      let linkFinal = link;

      if (arquivo) {
        const ext = arquivo.name.split(".").pop();
        const path = `testes/${teste.id}/${Date.now()}.${ext}`;
        const { error: uploadError } = await supabase.storage
          .from("documentos-cadastro")
          .upload(path, arquivo);
        if (uploadError) throw uploadError;
        const { data: urlData } = supabase.storage
          .from("documentos-cadastro")
          .getPublicUrl(path);
        linkFinal = urlData.publicUrl;
      }

      const { error } = await supabase
        .from("testes_tecnicos" as any)
        .update({
          link_entrega: linkFinal,
          entregue_em: new Date().toISOString(),
          resultado: "pendente",
          updated_at: new Date().toISOString(),
        } as any)
        .eq("id", teste.id);

      if (error) throw error;

      // Notify HR
      try {
        await supabase.functions.invoke("send-transactional-email", {
          body: {
            templateName: "teste-tecnico-entregue",
            recipientEmail: "rh@fetely.com.br",
            idempotencyKey: `teste-entregue-${teste.id}`,
            templateData: {
              nome_candidato: candidato.nome,
              cargo: vaga?.titulo ?? "",
              vaga_id: id,
            },
          },
        });
      } catch (emailErr) {
        console.error("Erro ao notificar RH:", emailErr);
      }

      setEntregue(true);
    } catch (e: any) {
      toast.error("Erro ao enviar entrega: " + e.message);
    } finally {
      setEnviando(false);
    }
  }

  const prazoFormatado = teste?.prazo_entrega
    ? (() => {
        const [ano, mes, dia] = teste.prazo_entrega.split("-");
        return `${dia}/${mes}/${ano}`;
      })()
    : null;

  const prazoVencido = teste?.prazo_entrega
    ? new Date(teste.prazo_entrega + "T23:59:59") < new Date()
    : false;

  if (entregue) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-muted/10 px-4">
        <div className="max-w-md w-full text-center space-y-6">
          <div className="w-16 h-16 rounded-full bg-success/10 flex items-center justify-center mx-auto">
            <Check className="h-8 w-8 text-success" />
          </div>
          <h1 className="text-2xl font-medium text-muted-foreground">Entrega recebida!</h1>
          <p className="text-muted-foreground">
            Recebemos sua entrega para a vaga de <strong>{vaga?.titulo}</strong>.
            Nossa equipe vai avaliar e entrar em contato em breve.
          </p>
          <p className="text-sm text-muted-foreground italic">
            A memória não guarda o preço, ela guarda a presença.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-muted/10">
      {/* Header */}
      <div className="bg-[#0891B2] text-white py-6 px-6 text-center">
        <h1 className="text-3xl font-medium tracking-tight">Fetély.</h1>
        <p className="text-info text-sm mt-1 italic">
          Vamos celebrar!! Venha criar algo novo...
        </p>
      </div>

      <div className="max-w-2xl mx-auto px-4 py-8 space-y-6">
        {/* Título */}
        <div className="text-center">
          <h2 className="text-xl font-medium text-muted-foreground">Entrega do teste técnico</h2>
          <p className="text-muted-foreground mt-1">{vaga?.titulo}</p>
        </div>

        {/* ETAPA 1 — Identificação */}
        {!teste && (
          <div className="bg-white rounded-xl border p-6 space-y-4">
            <h3 className="text-sm font-medium text-muted-foreground">
              Identificação
            </h3>
            <p className="text-sm text-muted-foreground">
              Informe o e-mail que você usou na candidatura para acessar seu teste.
            </p>
            <div className="space-y-1.5">
              <Label className="text-xs">E-mail</Label>
              <Input
                type="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                placeholder="seu@email.com"
                onKeyDown={e => e.key === "Enter" && buscarTeste()}
              />
            </div>
            {erro && (
              <p className="text-sm text-destructive">{erro}</p>
            )}
            <Button onClick={buscarTeste} disabled={buscando} className="w-full bg-[#0891B2] hover:bg-[#0891B2]/90">
              {buscando
                ? <><Loader2 className="h-4 w-4 animate-spin mr-2" />Buscando...</>
                : "Acessar meu teste"}
            </Button>
          </div>
        )}

        {/* ETAPA 2 — Desafio + Entrega */}
        {teste && (
          <>
            {/* Desafio */}
            <div className="bg-white rounded-xl border p-6 space-y-4">
              <h3 className="text-sm font-medium text-muted-foreground">
                Seu desafio
              </h3>

              {prazoVencido && (
                <div className="rounded-lg bg-destructive/10 border border-destructive/40 p-3">
                  <p className="text-sm font-medium text-destructive">
                    ⚠️ Prazo vencido — {prazoFormatado}
                  </p>
                  <p className="text-xs text-destructive mt-1">
                    O prazo já passou mas você ainda pode enviar sua entrega.
                  </p>
                </div>
              )}

              {!prazoVencido && prazoFormatado && (
                <div className="rounded-lg bg-warning/10 border border-warning/40 p-3">
                  <p className="text-sm font-medium text-warning">
                    ⏰ Prazo: {prazoFormatado}
                  </p>
                </div>
              )}

              {teste.desafio_contexto && (
                <div className="space-y-1">
                  <p className="text-xs font-medium text-muted-foreground uppercase">Contexto</p>
                  <p className="text-sm text-muted-foreground leading-relaxed">{teste.desafio_contexto}</p>
                </div>
              )}
              <div className="space-y-1">
                <p className="text-xs font-medium text-muted-foreground uppercase">Desafio</p>
                <p className="text-sm text-muted-foreground leading-relaxed whitespace-pre-wrap">{teste.desafio_descricao}</p>
              </div>
              {teste.desafio_entregaveis && (
                <div className="space-y-1">
                  <p className="text-xs font-medium text-muted-foreground uppercase">Entregáveis</p>
                  <p className="text-sm text-muted-foreground leading-relaxed">{teste.desafio_entregaveis}</p>
                </div>
              )}
              {teste.desafio_criterios && (
                <div className="space-y-1">
                  <p className="text-xs font-medium text-muted-foreground uppercase">Critérios</p>
                  <p className="text-sm text-muted-foreground leading-relaxed">{teste.desafio_criterios}</p>
                </div>
              )}
            </div>

            {/* Entrega */}
            <div className="bg-white rounded-xl border p-6 space-y-4">
              <h3 className="text-sm font-medium text-muted-foreground">
                Sua entrega
              </h3>
              <p className="text-xs text-muted-foreground">
                Cole o link da sua entrega (Google Drive, GitHub, Notion, Figma...)
                ou faça upload do arquivo.
              </p>

              {/* Link */}
              <div className="space-y-1.5">
                <Label className="text-xs">Link da entrega</Label>
                <Input
                  value={link}
                  onChange={e => setLink(e.target.value)}
                  placeholder="https://drive.google.com/..."
                />
              </div>

              {/* Divisor */}
              <div className="flex items-center gap-3">
                <div className="flex-1 border-t" />
                <span className="text-xs text-muted-foreground">ou</span>
                <div className="flex-1 border-t" />
              </div>

              {/* Upload */}
              <div className="space-y-1.5">
                <Label className="text-xs">Upload de arquivo</Label>
                <div
                  className="border-2 border-dashed rounded-lg p-6 text-center cursor-pointer hover:border-[#0891B2]/50 transition-colors"
                  onClick={() => document.getElementById("arquivo-upload")?.click()}
                >
                  <input
                    id="arquivo-upload"
                    type="file"
                    className="hidden"
                    accept=".pdf,.zip,.doc,.docx,.pptx,.png,.jpg,.jpeg,.fig,.xd"
                    onChange={e => setArquivo(e.target.files?.[0] ?? null)}
                  />
                  {arquivo ? (
                    <div className="flex items-center justify-center gap-2">
                      <Check className="h-4 w-4 text-success" />
                      <p className="text-sm text-muted-foreground">{arquivo.name}</p>
                    </div>
                  ) : (
                    <>
                      <Upload className="h-6 w-6 text-muted-foreground mx-auto mb-2" />
                      <p className="text-sm text-muted-foreground">
                        Clique para selecionar um arquivo
                      </p>
                      <p className="text-xs text-muted-foreground mt-1">
                        PDF, ZIP, DOC, PPTX, PNG, JPG, FIG
                      </p>
                    </>
                  )}
                </div>
              </div>

              <Button
                onClick={enviarEntrega}
                disabled={enviando || (!link && !arquivo)}
                className="w-full bg-[#0891B2] hover:bg-[#0891B2]/90"
              >
                {enviando
                  ? <><Loader2 className="h-4 w-4 animate-spin mr-2" />Enviando...</>
                  : "Enviar minha entrega"}
              </Button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
