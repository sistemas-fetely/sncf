import { useState, useMemo } from "react";
import { toast } from "sonner";
import { Loader2, Lock, Check, Copy } from "lucide-react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { cn } from "@/lib/utils";
import {
  useCriarUsuarioV2,
  useColaboradoresDisponiveis,
  useGruposParaSelecao,
  type VinculoTipo,
  type CriarUsuarioV2Output,
} from "@/hooks/useCriarUsuarioV2";

interface NovoUsuarioDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

type VinculoOpcao = "externo" | "clt" | "pj";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function iniciais(nome: string) {
  return nome
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((s) => s[0]?.toUpperCase() ?? "")
    .join("");
}

export default function NovoUsuarioDialog({ open, onOpenChange }: NovoUsuarioDialogProps) {
  const [step, setStep] = useState<1 | 2 | 3>(1);

  // Passo 1
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");

  // Passo 2
  const [vinculoOpcao, setVinculoOpcao] = useState<VinculoOpcao>("externo");
  const [tipoExterno, setTipoExterno] = useState("");
  const [colaboradorId, setColaboradorId] = useState("");
  const [pular, setPular] = useState(false);

  // Passo 3
  const [grupoIds, setGrupoIds] = useState<string[]>([]);

  // Resultado pós-criação (mostra painel com link de primeiro acesso)
  const [resultado, setResultado] = useState<CriarUsuarioV2Output | null>(null);

  const colabTipo: "clt" | "pj" | null =
    vinculoOpcao === "clt" ? "clt" : vinculoOpcao === "pj" ? "pj" : null;

  const { data: colaboradores = [], isLoading: loadingColabs } =
    useColaboradoresDisponiveis(colabTipo);
  const { data: grupos = [], isLoading: loadingGrupos } = useGruposParaSelecao();
  const criar = useCriarUsuarioV2();

  const reset = () => {
    setStep(1);
    setFullName("");
    setEmail("");
    setVinculoOpcao("externo");
    setTipoExterno("");
    setColaboradorId("");
    setPular(false);
    setGrupoIds([]);
    setResultado(null);
  };

  const handleOpenChange = (next: boolean) => {
    if (!next) reset();
    onOpenChange(next);
  };

  const passo1Valido = fullName.trim().length >= 3 && EMAIL_RE.test(email.trim());

  const passo2Valido = useMemo(() => {
    if (vinculoOpcao === "externo") return true; // tipo_externo é opcional
    if (pular) return true;
    return colaboradorId.length > 0;
  }, [vinculoOpcao, pular, colaboradorId]);

  const toggleGrupo = (id: string) => {
    setGrupoIds((prev) =>
      prev.includes(id) ? prev.filter((g) => g !== id) : [...prev, id]
    );
  };

  const submit = async () => {
    let vinculo_tipo: VinculoTipo = null;
    let colaborador_clt_id: string | null = null;
    let contrato_pj_id: string | null = null;
    let tipo_externo: string | null = null;

    if (vinculoOpcao === "externo") {
      vinculo_tipo = "externo";
      tipo_externo = tipoExterno.trim() || null;
    } else if (!pular && colaboradorId) {
      vinculo_tipo = vinculoOpcao;
      if (vinculoOpcao === "clt") colaborador_clt_id = colaboradorId;
      else contrato_pj_id = colaboradorId;
    }

    try {
      const out = await criar.mutateAsync({
        email: email.trim(),
        full_name: fullName.trim(),
        vinculo_tipo,
        colaborador_clt_id,
        contrato_pj_id,
        tipo_externo,
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
    { n: 2, label: "Vínculo" },
    { n: 3, label: "Grupos" },
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
            <div className="space-y-5">
              <RadioGroup
                value={vinculoOpcao}
                onValueChange={(v) => {
                  setVinculoOpcao(v as VinculoOpcao);
                  setColaboradorId("");
                  setPular(false);
                }}
                className="flex gap-6"
              >
                <div className="flex items-center gap-2">
                  <RadioGroupItem value="externo" id="vt-ext" />
                  <Label htmlFor="vt-ext" className="cursor-pointer">Sem vínculo (externo)</Label>
                </div>
                <div className="flex items-center gap-2">
                  <RadioGroupItem value="clt" id="vt-clt" />
                  <Label htmlFor="vt-clt" className="cursor-pointer">CLT</Label>
                </div>
                <div className="flex items-center gap-2">
                  <RadioGroupItem value="pj" id="vt-pj" />
                  <Label htmlFor="vt-pj" className="cursor-pointer">PJ</Label>
                </div>
              </RadioGroup>

              {vinculoOpcao === "externo" && (
                <div className="space-y-3">
                  <div className="space-y-2">
                    <Label htmlFor="nu-tipo-ext">Tipo externo (opcional)</Label>
                    <Input
                      id="nu-tipo-ext"
                      value={tipoExterno}
                      onChange={(e) => setTipoExterno(e.target.value)}
                      placeholder="Ex: consultor, contador, fundador"
                    />
                  </div>
                  <p className="text-xs text-muted-foreground leading-relaxed">
                    Usuário sem colaborador associado. Útil pra contadores,
                    consultores e parceiros externos.
                  </p>
                </div>
              )}

              {(vinculoOpcao === "clt" || vinculoOpcao === "pj") && (
                <div className="space-y-3">
                  <div className="space-y-2">
                    <Label>Selecione o colaborador</Label>
                    <Select
                      value={colaboradorId}
                      onValueChange={setColaboradorId}
                      disabled={pular || loadingColabs}
                    >
                      <SelectTrigger>
                        <SelectValue
                          placeholder={
                            loadingColabs
                              ? "Carregando..."
                              : colaboradores.length === 0
                              ? "Nenhum colaborador disponível"
                              : "Selecione..."
                          }
                        />
                      </SelectTrigger>
                      <SelectContent>
                        {colaboradores.map((c) => (
                          <SelectItem key={c.id} value={c.id}>
                            <div className="flex items-center gap-2">
                              <Avatar className="h-6 w-6">
                                <AvatarFallback className="text-[10px]">
                                  {iniciais(c.nome)}
                                </AvatarFallback>
                              </Avatar>
                              <div className="flex flex-col text-left">
                                <span className="text-sm">{c.nome}</span>
                                <span className="text-[11px] text-muted-foreground">
                                  {[c.email, c.cargo].filter(Boolean).join(" · ")}
                                </span>
                              </div>
                            </div>
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    {!loadingColabs && colaboradores.length === 0 && (
                      <p className="text-xs text-muted-foreground">
                        Nenhum colaborador disponível para vincular.
                        Todos já têm usuário.
                      </p>
                    )}
                  </div>

                  <div className="flex items-center gap-2">
                    <Checkbox
                      id="nu-pular"
                      checked={pular}
                      onCheckedChange={(c) => {
                        setPular(c === true);
                        if (c === true) setColaboradorId("");
                      }}
                    />
                    <Label htmlFor="nu-pular" className="cursor-pointer text-sm">
                      Pular — vincular depois
                    </Label>
                  </div>

                  <p className="text-xs text-muted-foreground leading-relaxed">
                    Marcos jurídico: o vínculo é imutável após criação.
                  </p>
                </div>
              )}
            </div>
          )}

          {step === 3 && (
            <div className="space-y-4">
              <p className="text-sm text-muted-foreground leading-relaxed">
                Selecione 1 ou mais grupos. Pode deixar vazio e adicionar
                depois pela aba Grupos de Acesso.
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
            onClick={() => setStep((s) => (s > 1 ? ((s - 1) as 1 | 2 | 3) : s))}
            disabled={step === 1 || criar.isPending}
          >
            Voltar
          </Button>

          {step < 3 ? (
            <Button
              onClick={() => setStep((s) => (s + 1) as 1 | 2 | 3)}
              disabled={(step === 1 && !passo1Valido) || (step === 2 && !passo2Valido)}
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
