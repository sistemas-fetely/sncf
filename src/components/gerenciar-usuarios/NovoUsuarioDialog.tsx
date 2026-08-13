import { useState } from "react";
import { toast } from "sonner";
import { Loader2, Lock, Check, Copy } from "lucide-react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import {
  useCriarUsuarioV2,
  useGruposParaSelecao,
  type CriarUsuarioV2Output,
} from "@/hooks/useCriarUsuarioV2";

interface NovoUsuarioDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export default function NovoUsuarioDialog({ open, onOpenChange }: NovoUsuarioDialogProps) {
  const [step, setStep] = useState<1 | 2>(1);

  // Passo 1
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");

  // Passo 2
  const [grupoIds, setGrupoIds] = useState<string[]>([]);

  // Resultado pós-criação (mostra painel com link de primeiro acesso)
  const [resultado, setResultado] = useState<CriarUsuarioV2Output | null>(null);

  const { data: grupos = [], isLoading: loadingGrupos } = useGruposParaSelecao();
  const criar = useCriarUsuarioV2();

  const reset = () => {
    setStep(1);
    setFullName("");
    setEmail("");
    setGrupoIds([]);
    setResultado(null);
  };

  const handleOpenChange = (next: boolean) => {
    if (!next) reset();
    onOpenChange(next);
  };

  const passo1Valido = fullName.trim().length >= 3 && EMAIL_RE.test(email.trim());

  const toggleGrupo = (id: string) => {
    setGrupoIds((prev) =>
      prev.includes(id) ? prev.filter((g) => g !== id) : [...prev, id]
    );
  };

  const submit = async () => {
    try {
      const out = await criar.mutateAsync({
        email: email.trim(),
        full_name: fullName.trim(),
        grupo_ids: grupoIds,
      });
      setResultado(out);
    } catch {
      // Toast já vem do hook — manter dialog aberto
    }
  };

  const copiarLink = async () => {
    if (!resultado?.link_primeiro_acesso) return;
    try {
      await navigator.clipboard.writeText(resultado.link_primeiro_acesso);
      toast.success("Link copiado");
    } catch {
      toast.error("Não foi possível copiar. Selecione o link manualmente.");
    }
  };

  const stepperItems = [
    { n: 1, label: "Dados" },
    { n: 2, label: "Grupos" },
  ] as const;

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>Novo Usuário</DialogTitle>
        </DialogHeader>

        {!resultado && (<>
        {/* Stepper */}
        <div className="flex items-start justify-center gap-2 py-4">
          {stepperItems.map((item, idx) => {
            const completo = step > item.n;
            const atual = step === item.n;
            return (
              <div key={item.n} className="flex items-start gap-2">
                <div className="flex flex-col items-center">
                  <div
                    className={cn(
                      "h-8 w-8 rounded-full border-2 flex items-center justify-center text-xs font-semibold transition-colors",
                      atual && "bg-primary text-primary-foreground border-primary",
                      completo && "bg-emerald-500 text-white border-emerald-500",
                      !atual && !completo && "bg-background text-muted-foreground border-muted"
                    )}
                  >
                    {completo ? <Check className="h-4 w-4" /> : item.n}
                  </div>
                  <span
                    className={cn(
                      "text-xs mt-1",
                      atual ? "text-foreground font-medium" : "text-muted-foreground"
                    )}
                  >
                    {item.label}
                  </span>
                </div>
                {idx < stepperItems.length - 1 && (
                  <div
                    className={cn(
                      "h-0.5 w-12 mt-4 transition-colors",
                      step > item.n ? "bg-emerald-500" : "bg-muted"
                    )}
                  />
                )}
              </div>
            );
          })}
        </div>

        {/* Conteúdo */}
        <div className="min-h-[260px] py-2">
          {step === 1 && (
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="nu-nome">Nome completo</Label>
                <Input
                  id="nu-nome"
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  placeholder="Ex: João Silva"
                  autoFocus
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="nu-email">Email</Label>
                <Input
                  id="nu-email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="joao@empresa.com"
                />
              </div>
              <p className="text-xs text-muted-foreground leading-relaxed">
                O usuário receberá um email de boas-vindas com link para definir
                a senha no primeiro acesso.
              </p>
            </div>
          )}

          {step === 2 && (
            <div className="space-y-4">
              <p className="text-sm text-muted-foreground leading-relaxed">
                Selecione 1 ou mais grupos. Pode deixar vazio e adicionar
                depois pela aba Grupos de Acesso.
              </p>
              <p className="text-xs text-muted-foreground leading-relaxed">
                O vínculo com a pessoa (CLT/PJ) é feito depois, pelo botão Vincular na lista de usuários.
              </p>

              {loadingGrupos ? (
                <div className="flex items-center gap-2 text-sm text-muted-foreground py-4">
                  <Loader2 className="h-4 w-4 animate-spin" /> Carregando grupos...
                </div>
              ) : grupos.length === 0 ? (
                <p className="text-sm text-muted-foreground py-4">
                  Nenhum grupo de acesso cadastrado.
                </p>
              ) : (
                <div className="space-y-2 max-h-[280px] overflow-y-auto pr-1">
                  {grupos.map((g) => {
                    const checked = grupoIds.includes(g.id);
                    return (
                      <div
                        key={g.id}
                        className={cn(
                          "flex items-start gap-3 p-3 rounded-md border transition-colors cursor-pointer",
                          checked ? "border-primary bg-primary/5" : "border-border hover:bg-muted/40"
                        )}
                        onClick={() => toggleGrupo(g.id)}
                      >
                        <Checkbox
                          checked={checked}
                          onCheckedChange={() => toggleGrupo(g.id)}
                          className="mt-0.5"
                        />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-medium text-sm">{g.nome}</span>
                            {g.pre_cadastrado && (
                              <>
                                <Lock className="h-3 w-3 text-muted-foreground" />
                                <Badge variant="secondary" className="text-[10px]">
                                  Pré-cadastrado
                                </Badge>
                              </>
                            )}
                          </div>
                          {g.descricao && (
                            <p className="text-xs text-muted-foreground mt-0.5">
                              {g.descricao}
                            </p>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </div>

        <DialogFooter className="flex-row justify-between sm:justify-between gap-2">
          <Button
            variant="outline"
            onClick={() => setStep((s) => (s > 1 ? ((s - 1) as 1 | 2) : s))}
            disabled={step === 1 || criar.isPending}
          >
            Voltar
          </Button>

          {step < 2 ? (
            <Button
              onClick={() => setStep((s) => (s + 1) as 1 | 2)}
              disabled={step === 1 && !passo1Valido}
            >
              Próximo
            </Button>
          ) : (
            <Button onClick={submit} disabled={criar.isPending}>
              {criar.isPending ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" /> Criando...
                </>
              ) : (
                "Criar usuário"
              )}
            </Button>
          )}
        </DialogFooter>
        </>)}

        {resultado && (
          <div className="py-2 space-y-4">
            <div className="flex items-center gap-2">
              <div className="h-8 w-8 rounded-full bg-emerald-500 text-white flex items-center justify-center">
                <Check className="h-4 w-4" />
              </div>
              <div>
                <p className="font-medium text-sm">Usuário criado</p>
                <p className="text-xs text-muted-foreground">{resultado.email}</p>
              </div>
            </div>

            {resultado.link_primeiro_acesso ? (
              <>
                <p className="text-sm leading-relaxed">
                  Envie este link para a pessoa definir a senha (ela ainda <strong>não</strong> tem senha).
                </p>
                <div className="space-y-2">
                  <Label htmlFor="link-acesso">Link de primeiro acesso</Label>
                  <div className="flex gap-2">
                    <Input
                      id="link-acesso"
                      readOnly
                      value={resultado.link_primeiro_acesso}
                      onFocus={(e) => e.currentTarget.select()}
                      className="font-mono text-xs"
                    />
                    <Button type="button" variant="secondary" onClick={copiarLink}>
                      <Copy className="h-4 w-4" /> Copiar
                    </Button>
                  </div>
                </div>
                <Button type="button" className="w-full" onClick={copiarLink}>
                  <Copy className="h-4 w-4" /> Copiar link de primeiro acesso
                </Button>
                <p className="text-xs text-muted-foreground leading-relaxed">
                  O link expira — envie e use logo. Vale só para esta pessoa.
                </p>
              </>
            ) : (
              <p className="text-sm text-muted-foreground leading-relaxed">
                Não foi possível gerar o link automaticamente. Use o botão{" "}
                <strong>Reenviar link</strong> na lista de usuários.
              </p>
            )}

            <DialogFooter>
              <Button variant="outline" onClick={() => handleOpenChange(false)}>
                Fechar
              </Button>
            </DialogFooter>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
