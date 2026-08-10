import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { Loader2, History, Search } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { supabase } from "@/integrations/supabase/client";

interface RastroLinha {
  id: string;
  created_at: string;
  user_nome: string | null;
  alvo_nome: string | null;
  tipo_dado: string | null;
  tabela_origem: string | null;
  contexto: string | null;
  em_lote: boolean | null;
  quantidade_alvos: number | null;
}

const fmtQuando = (iso: string) => {
  const d = new Date(iso);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${p(d.getDate())}/${p(d.getMonth() + 1)} ${p(d.getHours())}:${p(d.getMinutes())}`;
};

export default function RastroAcessoTab() {
  const [tipo, setTipo] = useState<string>("todos");
  const [busca, setBusca] = useState("");

  const { data, isLoading } = useQuery({
    queryKey: ["rastro-acesso-dados-log"],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("acesso_dados_log")
        .select("id, created_at, user_nome, alvo_nome, tipo_dado, tabela_origem, contexto, em_lote, quantidade_alvos")
        .order("created_at", { ascending: false })
        .limit(300);
      if (error) {
        toast.error(`Falha ao carregar rastro de acesso: ${error.message}`);
        throw error;
      }
      return (data || []) as RastroLinha[];
    },
  });

  const linhas = data || [];

  const tipos = useMemo(
    () => Array.from(new Set(linhas.map((l) => l.tipo_dado).filter(Boolean) as string[])).sort(),
    [linhas],
  );

  const filtradas = useMemo(() => {
    const q = busca.trim().toLowerCase();
    return linhas.filter((l) => {
      if (tipo !== "todos" && l.tipo_dado !== tipo) return false;
      if (!q) return true;
      return [l.user_nome, l.alvo_nome, l.contexto].some((v) => (v || "").toLowerCase().includes(q));
    });
  }, [linhas, tipo, busca]);

  return (
    <Card>
      <CardHeader className="space-y-3">
        <CardTitle className="text-base flex items-center gap-2">
          <History className="h-4 w-4" /> Rastro de acesso a dados sensíveis
        </CardTitle>
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <Select value={tipo} onValueChange={setTipo}>
            <SelectTrigger className="w-full sm:w-56"><SelectValue placeholder="Tipo de dado" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="todos">Todos os tipos</SelectItem>
              {tipos.map((t) => (
                <SelectItem key={t} value={t}>{t}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <div className="relative w-full sm:max-w-xs">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              className="pl-8"
              placeholder="Buscar por quem, alvo ou contexto"
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
            />
          </div>
          <span className="text-xs text-muted-foreground sm:ml-auto whitespace-nowrap">
            {filtradas.length} de {linhas.length} eventos (últimos 300)
          </span>
        </div>
      </CardHeader>
      <CardContent className="p-0">
        {isLoading ? (
          <div className="flex justify-center py-16">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : filtradas.length === 0 ? (
          <div className="py-16 text-center text-sm text-muted-foreground">Nenhum evento de acesso registrado.</div>
        ) : (
          <TooltipProvider>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[110px]">Quando</TableHead>
                  <TableHead>Quem</TableHead>
                  <TableHead>Alvo</TableHead>
                  <TableHead className="w-[160px]">Tipo</TableHead>
                  <TableHead>Contexto</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtradas.map((l) => (
                  <TableRow key={l.id}>
                    <TableCell className="text-xs tabular-nums">{fmtQuando(l.created_at)}</TableCell>
                    <TableCell className="text-sm">
                      {l.user_nome || <span className="text-muted-foreground">Sistema/Conexão</span>}
                    </TableCell>
                    <TableCell className="text-sm">
                      {l.em_lote ? (
                        <span className="inline-flex items-center gap-1.5">
                          <Badge variant="secondary">Lote</Badge>
                          {l.quantidade_alvos != null && (
                            <span className="text-xs text-muted-foreground">{l.quantidade_alvos} alvos</span>
                          )}
                          {l.alvo_nome && <span>{l.alvo_nome}</span>}
                        </span>
                      ) : (
                        l.alvo_nome || <span className="text-muted-foreground">—</span>
                      )}
                    </TableCell>
                    <TableCell>
                      {l.tipo_dado ? <Badge variant="outline">{l.tipo_dado}</Badge> : <span className="text-muted-foreground">—</span>}
                    </TableCell>
                    <TableCell className="max-w-[320px]">
                      {l.contexto ? (
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <span className="block truncate text-sm text-muted-foreground">{l.contexto}</span>
                          </TooltipTrigger>
                          <TooltipContent className="max-w-sm">{l.contexto}</TooltipContent>
                        </Tooltip>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TooltipProvider>
        )}
      </CardContent>
    </Card>
  );
}
