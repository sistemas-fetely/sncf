import { useState, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Search,
  SlidersHorizontal,
  Users,
  Shield,
  Briefcase,
  FileBarChart,
  FileText,
  ChevronRight,
  Eye,
  FolderTree,
  Wand2,
  Filter,
  Timer,
} from "lucide-react";
import { PageShell } from "@/components/layout/PageShell";
import { PageTitle } from "@/components/layout/PageTitle";

interface ConfigItem {
  value: string;
  label: string;
  description: string;
  icon: React.ComponentType<{ className?: string }>;
  path: string;
  secao: string;
}

const ITENS: ConfigItem[] = [
  // Acessos
  { value: "usuarios", label: "Usuários", description: "Gerenciar usuários do sistema", icon: Users, path: "/admin/usuarios", secao: "Acessos" },
  { value: "perfis", label: "Perfis de Acesso", description: "Permissões por perfil e módulo", icon: Shield, path: "/admin/usuarios/perfis", secao: "Acessos" },
  { value: "cargos", label: "Cargos", description: "Cargos e estrutura de função", icon: Briefcase, path: "/pessoas/cargos", secao: "Acessos" },
  { value: "visibilidade", label: "Visibilidade", description: "O que cada perfil enxerga em cada tela", icon: Eye, path: "/admin/visibilidade", secao: "Acessos" },

  // Cadastros
  { value: "parametros", label: "Parâmetros", description: "Listas de cadastro: áreas, departamentos, sistemas, benefícios, unidades e empresas", icon: SlidersHorizontal, path: "/admin/parametros", secao: "Cadastros" },
  { value: "plano-contas", label: "Plano de Contas", description: "Estrutura contábil de receitas e despesas", icon: FolderTree, path: "/admin/plano-contas", secao: "Cadastros" },

  // Regras
  { value: "regras-ofx", label: "Regras de OFX", description: "Classificação automática de lançamentos do extrato", icon: Wand2, path: "/admin/regras-ofx", secao: "Regras" },
  { value: "extrato-regras", label: "Regras do Inbox", description: "Tratamento automático de entradas do extrato", icon: Filter, path: "/admin/extrato-regras", secao: "Regras" },
  { value: "sla", label: "SLA da Operação", description: "Prazos e limiares da operação: XPM, fases do pedido, frete e vigilância", icon: Timer, path: "/admin/sla", secao: "Regras" },

  // Sistema
  { value: "reportes", label: "Reportes do Sistema", description: "Logs e relatórios técnicos", icon: FileBarChart, path: "/ti/reportes", secao: "Sistema" },
  { value: "importacoes", label: "Importações PDF", description: "Histórico de importações de documentos", icon: FileText, path: "/admin/importacoes-pdf", secao: "Sistema" },
];

export default function Configuracoes() {
  const navigate = useNavigate();
  const [searchTerm, setSearchTerm] = useState("");

  const filtered = useMemo(() => {
    const lower = searchTerm.toLowerCase();
    if (!lower) return ITENS;
    return ITENS.filter(
      (i) =>
        i.label.toLowerCase().includes(lower) ||
        i.description.toLowerCase().includes(lower)
    );
  }, [searchTerm]);

  const secoes = useMemo(() => {
    const map = new Map<string, ConfigItem[]>();
    for (const item of filtered) {
      const list = map.get(item.secao) ?? [];
      list.push(item);
      map.set(item.secao, list);
    }
    return map;
  }, [filtered]);

  return (
    <PageShell>
      <PageTitle titulo="Configurações" estado="Ajustes e parâmetros gerais do sistema" />

      <div className="relative max-w-md">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Buscar configuração..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="pl-9"
        />
      </div>

      {filtered.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-sm text-muted-foreground">
            Nenhuma configuração com esse termo. Tente o nome do módulo.
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-6">
          {Array.from(secoes.entries()).map(([secao, itens]) => (
            <div key={secao} className="space-y-3">
              <h2 className="text-[15px] font-medium">{secao}</h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3">
                {itens.map((item) => {
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
            </div>
          ))}
        </div>
      )}
    </PageShell>
  );
}
