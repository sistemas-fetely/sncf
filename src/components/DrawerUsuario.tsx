import { useState, useEffect } from "react";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Button } from "@/components/ui/button";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useNavigate } from "react-router-dom";
import { Mail, Phone, Calendar, Briefcase, Users, ExternalLink, Shield, Loader2 } from "lucide-react";

interface Props {
  userId: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const ROLE_LABELS: Record<string, string> = {
  super_admin: "Super Admin",
  diretoria_executiva: "Diretoria Executiva",
  rh: "RH",
  gestao_direta: "Gestão Direta",
  financeiro: "Financeiro",
  administrativo: "Administrativo",
  operacional: "Operacional",
  ti: "TI",
  recrutamento: "Recrutamento",
  fiscal: "Fiscal",
  estagiario: "Estagiário",
  colaborador: "Colaborador",
};

export function DrawerUsuario({ userId, open, onOpenChange }: Props) {
  const navigate = useNavigate();
  // Permite trocar de usuário sem fechar (ex: clicar no líder direto)
  const [activeUserId, setActiveUserId] = useState<string | null>(userId);

  useEffect(() => {
    if (open) setActiveUserId(userId);
  }, [userId, open]);

  const { data, isLoading } = useQuery({
    queryKey: ["drawer-usuario", activeUserId],
    enabled: !!activeUserId && open,
    queryFn: async () => {
      if (!activeUserId) return null;

      const [profileRes, cltRes, pjRes, rolesRes] = await Promise.all([
        supabase.from("profiles").select("*").eq("user_id", activeUserId).maybeSingle(),
        supabase
          .from("colaboradores_clt")
          .select("id, cargo, departamento, data_admissao, gestor_direto_id, foto_url, email_corporativo, email_pessoal, telefone_corporativo, telefone")
          .eq("user_id", activeUserId)
          .maybeSingle(),
        supabase
          .from("contratos_pj")
          .select("id, cargo_id, departamento, data_inicio, gestor_direto_id, foto_url, contato_email, tipo_servico, email_corporativo, telefone_corporativo, telefone, contato_telefone")
          .eq("user_id", activeUserId)
          .maybeSingle(),
        supabase.from("user_roles").select("role, nivel").eq("user_id", activeUserId),
      ]);

      // Resolve cargo PJ via cargos table
      let cargoPj: string | null = null;
      if (pjRes.data?.cargo_id) {
        const { data: c } = await supabase
          .from("cargos")
          .select("nome")
          .eq("id", pjRes.data.cargo_id)
          .maybeSingle();
        cargoPj = c?.nome || null;
      }

      // gestor_direto_id referencia profiles.id (não user_id)
      const gestorProfileId = cltRes.data?.gestor_direto_id || pjRes.data?.gestor_direto_id;
      let gestorData: { user_id: string; full_name: string | null } | null = null;
      if (gestorProfileId) {
        const { data: g } = await supabase
          .from("profiles")
          .select("user_id, full_name")
          .eq("id", gestorProfileId)
          .maybeSingle();
        gestorData = g;
      }

      const cltData = cltRes.data as any;
      const pjData = pjRes.data as any;
      const email_corporativo = cltData?.email_corporativo || pjData?.email_corporativo || null;
      const email_fallback = cltData?.email_pessoal || pjData?.contato_email || null;
      const telefone_corporativo =
        cltData?.telefone_corporativo ||
        pjData?.telefone_corporativo ||
        cltData?.telefone ||
        pjData?.telefone ||
        pjData?.contato_telefone ||
        null;

      // Mantido para compat: email genérico (prioriza corporativo, depois fallback)
      const email = email_corporativo || email_fallback;

      return {
        profile: profileRes.data,
        clt: cltRes.data,
        pj: pjRes.data,
        cargoPj,
        roles: rolesRes.data || [],
        gestor: gestorData,
        email,
        email_corporativo,
        email_fallback,
        telefone_corporativo,
      };
    },
  });

  const tipo = data?.clt ? "CLT" : data?.pj ? "PJ" : "Externo";
  const cargo = data?.clt?.cargo || data?.cargoPj || data?.pj?.tipo_servico || "—";
  const departamento = data?.clt?.departamento || data?.pj?.departamento || "—";
  const dataAdmissao = data?.clt?.data_admissao || data?.pj?.data_inicio;
  const fotoUrl = data?.clt?.foto_url || data?.pj?.foto_url || data?.profile?.avatar_url || null;

  const nome = data?.profile?.full_name || "Sem nome";
  const iniciais = nome
    .split(" ")
    .filter(Boolean)
    .map((p) => p[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full sm:max-w-md overflow-y-auto">
        {isLoading || !data ? (
          <div className="flex flex-col items-center justify-center h-full gap-3 py-12">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            <p className="text-sm text-muted-foreground">Carregando...</p>
          </div>
        ) : (
          <>
            <SheetHeader className="text-left">
              <div className="flex items-start gap-4">
                <Avatar className="h-16 w-16">
                  {fotoUrl && <AvatarImage src={fotoUrl} alt={nome} className="object-cover" />}
                  <AvatarFallback className="bg-primary/10 text-primary text-base font-medium">
                    {iniciais}
                  </AvatarFallback>
                </Avatar>
                <div className="flex-1 min-w-0">
                  <SheetTitle className="text-lg leading-tight truncate">{nome}</SheetTitle>
                  <SheetDescription className="flex items-center gap-2 mt-1 flex-wrap">
                    <Badge
                      variant="outline"
                      className={
                        tipo === "CLT"
                          ? "bg-info/10 text-info border-0 text-[10px]"
                          : tipo === "PJ"
                          ? "bg-warning/10 text-warning border-0 text-[10px]"
                          : "bg-muted text-muted-foreground border-0 text-[10px]"
                      }
                    >
                      {tipo}
                    </Badge>
                    {data.email && <span className="text-xs truncate">{data.email}</span>}
                  </SheetDescription>
                </div>
              </div>
            </SheetHeader>

            <Separator className="my-4" />

            {/* Cargo / Área */}
            <div className="space-y-3">
              <div className="flex items-start gap-3">
                <Briefcase className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />
                <div className="min-w-0">
                  <p className="text-xs text-muted-foreground">Cargo atual</p>
                  <p className="text-sm font-medium">{cargo}</p>
                </div>
              </div>

              <div className="flex items-start gap-3">
                <Users className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />
                <div className="min-w-0">
                  <p className="text-xs text-muted-foreground">Área / Departamento</p>
                  <p className="text-sm font-medium">{departamento}</p>
                </div>
              </div>

              <div className="flex items-start gap-3">
                <Users className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />
                <div className="min-w-0">
                  <p className="text-xs text-muted-foreground">Líder direto</p>
                  {data.gestor ? (
                    <button
                      type="button"
                      onClick={() => setActiveUserId(data.gestor!.user_id)}
                      className="text-sm font-medium text-left hover:underline hover:text-primary transition-colors"
                    >
                      {data.gestor.full_name || "Sem nome"}
                    </button>
                  ) : (
                    <p className="text-sm text-muted-foreground italic">Sem líder cadastrado</p>
                  )}
                </div>
              </div>

              {dataAdmissao && (
                <div className="flex items-start gap-3">
                  <Calendar className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />
                  <div className="min-w-0">
                    <p className="text-xs text-muted-foreground">
                      {tipo === "CLT" ? "Data de admissão" : "Início do contrato"}
                    </p>
                    <p className="text-sm font-medium">
                      {new Date(dataAdmissao).toLocaleDateString("pt-BR", {
                        day: "2-digit",
                        month: "long",
                        year: "numeric",
                      })}
                    </p>
                  </div>
                </div>
              )}
            </div>

            <Separator className="my-4" />

            {/* Perfis de acesso */}
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <Shield className="h-4 w-4 text-muted-foreground" />
                <p className="text-sm font-medium">Perfis de acesso</p>
              </div>
              {data.roles.length === 0 ? (
                <p className="text-xs text-muted-foreground italic ml-6">Sem perfis atribuídos</p>
              ) : (
                <div className="flex flex-wrap gap-1.5 ml-6">
                  {data.roles.map((r, i) => (
                    <Badge key={i} variant="secondary" className="text-[11px]">
                      {ROLE_LABELS[r.role] || r.role}
                      {r.nivel && (
                        <span className="ml-1 text-muted-foreground">({r.nivel})</span>
                      )}
                    </Badge>
                  ))}
                </div>
              )}
            </div>

            <Separator className="my-4" />

            {/* Dados corporativos */}
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <Mail className="h-4 w-4 text-muted-foreground" />
                <p className="text-sm font-medium">Dados corporativos</p>
              </div>
              <div className="ml-6 space-y-1.5">
                {data.email_corporativo ? (
                  <button
                    type="button"
                    onClick={() => (window.location.href = `mailto:${data.email_corporativo}`)}
                    className="flex items-center gap-2 text-xs hover:text-primary transition w-full text-left"
                  >
                    <Mail className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                    <span className="truncate">{data.email_corporativo}</span>
                  </button>
                ) : data.email_fallback ? (
                  <div className="flex items-center gap-2 text-xs text-muted-foreground italic">
                    <Mail className="h-3.5 w-3.5 shrink-0" />
                    <span className="truncate">{data.email_fallback} (pessoal)</span>
                  </div>
                ) : null}

                {data.telefone_corporativo && (
                  <a
                    href={`tel:${data.telefone_corporativo}`}
                    className="flex items-center gap-2 text-xs hover:text-primary transition"
                  >
                    <Phone className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                    {data.telefone_corporativo}
                  </a>
                )}

                {!data.email_corporativo && !data.email_fallback && !data.telefone_corporativo && (
                  <p className="text-xs text-muted-foreground italic">
                    Sem dados corporativos cadastrados
                  </p>
                )}
              </div>
            </div>

            <Separator className="my-4" />

            {/* Ações */}
            <div className="space-y-2">
              {(data.clt?.id || data.pj?.id) && (
                <Button
                  variant="outline"
                  className="w-full justify-start gap-2"
                  onClick={() => {
                    onOpenChange(false);
                    if (data.clt?.id) navigate(`/colaboradores/${data.clt.id}`);
                    else if (data.pj?.id) navigate(`/contratos-pj/${data.pj.id}`);
                  }}
                >
                  <ExternalLink className="h-4 w-4" />
                  Abrir ficha completa
                </Button>
              )}
            </div>
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}
