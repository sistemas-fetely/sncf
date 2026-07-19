import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { Heart, Wallet, Search } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { humanizeError } from "@/lib/errorMessages";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { formatBRL, formatDateBR } from "@/lib/format-currency";

type Row = {
  id: string;
  vinculo_id: string;
  pessoa: string;
  tipo_vinculo: "CLT" | "PJ";
  departamento: string | null;
  beneficio: string;
  valor_empresa: number;
  valor_desconto: number;
  operadora: string | null;
  numero_cartao: string | null;
  data_inicio: string;
  data_fim: string | null;
  status: "ativo" | "encerrado";
};

export default function Beneficios() {
  const [busca, setBusca] = useState("");
  const [statusFiltro, setStatusFiltro] = useState<"ativo" | "encerrado" | "todos">("ativo");
  const [beneficioFiltro, setBeneficioFiltro] = useState<string>("__all__");

  const { data = [], isLoading } = useQuery({
    queryKey: ["beneficios-consolidado"],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("vw_beneficios_consolidado")
        .select("*");
      if (error) {
        toast.error(humanizeError(error.message));
        throw error;
      }
      return (data ?? []) as Row[];
    },
  });

  const beneficiosDistinct = useMemo(() => {
    const s = new Set<string>();
    data.forEach((r) => r.beneficio && s.add(r.beneficio));
    return Array.from(s).sort();
  }, [data]);

  const filtered = useMemo(() => {
    const q = busca.trim().toLowerCase();
    return data.filter((r) => {
      if (statusFiltro !== "todos" && r.status !== statusFiltro) return false;
      if (beneficioFiltro !== "__all__" && r.beneficio !== beneficioFiltro) return false;
      if (q) {
        const hay = `${r.pessoa} ${r.beneficio}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [data, busca, statusFiltro, beneficioFiltro]);

  const kpis = useMemo(() => {
    const ativos = data.filter((r) => r.status === "ativo");
    return {
      totalAtivos: ativos.length,
      custoTotal: ativos.reduce((acc, r) => acc + Number(r.valor_empresa || 0), 0),
    };
  }, [data]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Gestão de Benefícios</h1>
        <p className="text-muted-foreground">Benefícios ativos por pessoa</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card>
          <CardContent className="p-5 flex items-center gap-3">
            <div className="h-10 w-10 rounded-lg bg-primary/10 text-primary flex items-center justify-center">
              <Heart className="h-5 w-5" />
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Benefícios ativos</p>
              <p className="text-2xl font-bold tabular-nums">{kpis.totalAtivos}</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-5 flex items-center gap-3">
            <div className="h-10 w-10 rounded-lg bg-success/10 text-success flex items-center justify-center">
              <Wallet className="h-5 w-5" />
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Custo total empresa</p>
              <p className="text-2xl font-bold tabular-nums">{formatBRL(kpis.custoTotal)}</p>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardContent className="p-4 space-y-4">
          <div className="flex flex-col md:flex-row gap-3">
            <div className="relative flex-1">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Buscar por pessoa ou benefício..."
                value={busca}
                onChange={(e) => setBusca(e.target.value)}
                className="pl-8"
              />
            </div>
            <Select value={statusFiltro} onValueChange={(v: any) => setStatusFiltro(v)}>
              <SelectTrigger className="w-full md:w-48"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="todos">Todos</SelectItem>
                <SelectItem value="ativo">Ativos</SelectItem>
                <SelectItem value="encerrado">Encerrados</SelectItem>
              </SelectContent>
            </Select>
            <Select value={beneficioFiltro} onValueChange={setBeneficioFiltro}>
              <SelectTrigger className="w-full md:w-56"><SelectValue placeholder="Benefício" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="__all__">Todos os benefícios</SelectItem>
                {beneficiosDistinct.map((b) => (
                  <SelectItem key={b} value={b}>{b}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {isLoading ? (
            <div className="py-16 text-center text-muted-foreground">Carregando...</div>
          ) : filtered.length === 0 ? (
            <div className="py-16 text-center text-muted-foreground">
              Nenhum benefício atribuído ainda. Atribua benefícios na tela de cada pessoa (Composição de Custo).
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Pessoa</TableHead>
                    <TableHead>Tipo</TableHead>
                    <TableHead>Área</TableHead>
                    <TableHead>Benefício</TableHead>
                    <TableHead className="text-right">Valor empresa</TableHead>
                    <TableHead className="text-right">Desconto</TableHead>
                    <TableHead>Operadora</TableHead>
                    <TableHead>Cartão</TableHead>
                    <TableHead>Início</TableHead>
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.map((r) => (
                    <TableRow key={r.id}>
                      <TableCell className="font-medium">{r.pessoa}</TableCell>
                      <TableCell>
                        <Badge variant={r.tipo_vinculo === "CLT" ? "default" : "secondary"}>
                          {r.tipo_vinculo}
                        </Badge>
                      </TableCell>
                      <TableCell>{r.departamento ?? "—"}</TableCell>
                      <TableCell>{r.beneficio}</TableCell>
                      <TableCell className="text-right tabular-nums">{formatBRL(r.valor_empresa)}</TableCell>
                      <TableCell className="text-right tabular-nums text-muted-foreground">
                        {formatBRL(r.valor_desconto)}
                      </TableCell>
                      <TableCell>{r.operadora ?? "—"}</TableCell>
                      <TableCell>{r.numero_cartao ?? "—"}</TableCell>
                      <TableCell>{formatDateBR(r.data_inicio)}</TableCell>
                      <TableCell>
                        {r.status === "ativo" ? (
                          <Badge className="bg-success/15 text-success hover:bg-success/20 border-0">Ativo</Badge>
                        ) : (
                          <Badge variant="secondary">Encerrado</Badge>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
