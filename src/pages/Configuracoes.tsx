import { useState, useMemo } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Search,
  SlidersHorizontal,
  Users,
  Shield,
  Briefcase,
  FileBarChart,
  FileText,
  Building2,
  Plug,
  Bell,
  Palette,
  Lock,
  Database,
  Mail,
  ChevronRight,
} from "lucide-react";

interface ConfigItem {
  value: string;
  label: string;
  description: string;
  icon: React.ComponentType<{ className?: string }>;
  path: string;
}

interface ConfigModulo {
  label: string;
  itens: ConfigItem[];
}

const MODULOS: Record<string, ConfigModulo> = {
  geral: {
    label: "Geral",
    itens: [
      { value: "parametros", label: "Parâmetros", description: "Listas de cadastro: áreas, departamentos, sistemas, benefícios", icon: SlidersHorizontal, path: "/admin/parametros" },
      { value: "unidades", label: "Unidades e Empresas", description: "Empresas, filiais e estrutura organizacional", icon: Building2, path: "/admin/parametros?modulo=geral" },
      { value: "marca", label: "Marca e Aparência", description: "Logo, cores e identidade visual do sistema", icon: Palette, path: "/admin/configuracoes" },
      { value: "notificacoes", label: "Notificações", description: "Preferências de e-mail e alertas do sistema", icon: Bell, path: "/admin/configuracoes" },
    ],
  },
  usuarios: {
    label: "Usuários & Acessos",
    itens: [
      { value: "usuarios", label: "Usuários", description: "Gerenciar usuários do sistema", icon: Users, path: "/admin/usuarios" },
      { value: "perfis", label: "Perfis de Acesso", description: "Permissões por perfil e módulo", icon: Shield, path: "/admin/usuarios/perfis" },
      { value: "cargos", label: "Cargos", description: "Cargos e estrutura de função", icon: Briefcase, path: "/admin/cargos" },
      { value: "seguranca", label: "Segurança", description: "Senhas, autenticação e auditoria de acesso", icon: Lock, path: "/admin/configuracoes" },
    ],
  },
  integracoes: {
    label: "Integrações",
    itens: [
      { value: "bling", label: "Bling ERP", description: "Conexão com Bling para sincronização de dados", icon: Plug, path: "/administrativo/bling-callback" },
      { value: "email", label: "E-mail (SMTP)", description: "Configurar servidor de envio de e-mails", icon: Mail, path: "/admin/configuracoes" },
      { value: "api", label: "Chaves de API", description: "Tokens e chaves de integração externa", icon: Database, path: "/admin/configuracoes" },
    ],
  },
  sistema: {
    label: "Sistema",
    itens: [
      { value: "reportes", label: "Reportes do Sistema", description: "Logs e relatórios técnicos", icon: FileBarChart, path: "/admin/reportes" },
      { value: "importacoes", label: "Importações PDF", description: "Histórico de importações de documentos", icon: FileText, path: "/admin/importacoes-pdf" },
    ],
  },
};

export default function Configuracoes() {
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();
  const modulo = searchParams.get("modulo") || "geral";
  const [searchTerm, setSearchTerm] = useState("");

  const handleModuloChange = (m: string) => {
    setSearchParams({ modulo: m });
    setSearchTerm("");
  };

  const filtered = useMemo(() => {
    const lower = searchTerm.toLowerCase();
    const itens = MODULOS[modulo]?.itens ?? [];
    if (!lower) return itens;
    return itens.filter(
      (i) =>
        i.label.toLowerCase().includes(lower) ||
        i.description.toLowerCase().includes(lower)
    );
  }, [modulo, searchTerm]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Configurações</h1>
        <p className="text-muted-foreground text-sm mt-1">
          Ajustes e parâmetros gerais do sistema
        </p>
      </div>

      <Tabs value={modulo} onValueChange={handleModuloChange}>
        <TabsList>
          {Object.entries(MODULOS).map(([key, val]) => (
            <TabsTrigger key={key} value={key}>
              {val.label}
              <Badge variant="secondary" className="text-[10px] ml-2 px-1.5 py-0">
                {val.itens.length}
              </Badge>
            </TabsTrigger>
          ))}
        </TabsList>

        {Object.entries(MODULOS).map(([key]) => (
          <TabsContent key={key} value={key} className="space-y-4">
            <div className="relative max-w-md">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder={`Buscar em ${MODULOS[key].label}...`}
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-9"
              />
            </div>

            {filtered.length === 0 ? (
              <Card>
                <CardContent className="py-12 text-center text-sm text-muted-foreground">
                  Nenhuma configuração encontrada.
                </CardContent>
              </Card>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {filtered.map((item) => {
                  const Icon = item.icon;
                  return (
                    <button
                      key={item.value}
                      onClick={() => navigate(item.path)}
                      className="group text-left"
                    >
                      <Card className="h-full transition-colors hover:bg-muted/50 hover:border-primary/40">
                        <CardContent className="p-4 flex items-start gap-3">
                          <div className="w-10 h-10 rounded-lg bg-muted flex items-center justify-center flex-shrink-0 group-hover:bg-primary/10 transition-colors">
                            <Icon className="h-5 w-5 text-muted-foreground group-hover:text-primary transition-colors" />
                          </div>
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center justify-between gap-2">
                              <p className="font-medium text-sm">{item.label}</p>
                              <ChevronRight className="h-4 w-4 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
                            </div>
                            <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">
                              {item.description}
                            </p>
                          </div>
                        </CardContent>
                      </Card>
                    </button>
                  );
                })}
              </div>
            )}
          </TabsContent>
        ))}
      </Tabs>
    </div>
  );
}
