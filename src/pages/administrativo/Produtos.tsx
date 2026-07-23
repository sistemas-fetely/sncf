import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Package, Loader2 } from "lucide-react";

const fmtBRL = (v?: number | null) =>
  v == null ? "—" : new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v);

export default function Produtos() {
  const [busca, setBusca] = useState("");

  const { data: produtos = [], isLoading } = useQuery({
    queryKey: ["produto_fiscal"],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("vw_produto_fiscal")
        .select("*")
        .order("nome_comercial", { ascending: true })
        .limit(2000);
      if (error) throw error;
      return data || [];
    },
  });

  const filtrados = useMemo(() => {
    const q = busca.trim().toLowerCase();
    if (!q) return produtos;
    return produtos.filter((p: any) =>
      [p.nome_comercial, p.ean, p.sku].filter(Boolean).some((v) => String(v).toLowerCase().includes(q))
    );
  }, [produtos, busca]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
          <Package className="h-6 w-6 text-admin" />
          Produtos
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          Catálogo sincronizado do Bling.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Catálogo</CardTitle>
          <Input
            placeholder="Buscar por nome, EAN ou SKU..."
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            className="max-w-md mt-2"
          />
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-6 w-6 animate-spin text-admin" />
            </div>
          ) : filtrados.length === 0 ? (
            <div className="text-center py-12 text-sm text-muted-foreground">
              Nenhum produto encontrado. Sincronize o Bling em Importar Dados.
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-12"></TableHead>
                  <TableHead>Código</TableHead>
                  <TableHead>Nome</TableHead>
                  <TableHead>Linha</TableHead>
                  <TableHead>NCM</TableHead>
                  <TableHead className="text-right">Preço Venda</TableHead>
                  <TableHead>Ativo</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtrados.map((p: any) => (
                  <TableRow key={p.id ?? p.sku}>
                    <TableCell>
                      {p.imagem_url ? (
                        <img
                          src={p.imagem_url}
                          alt={p.nome_comercial}
                          className="h-8 w-8 rounded object-cover border"
                        />
                      ) : (
                        <div className="h-8 w-8 rounded bg-muted" />
                      )}
                    </TableCell>
                    <TableCell className="font-mono text-xs">{p.sku || "—"}</TableCell>
                    <TableCell className="max-w-[320px]">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="truncate">{p.nome_comercial}</span>
                        {Number(p.bling_ids_total) > 1 && (
                          <Badge variant="outline" className="text-[10px]">
                            Bling: {p.bling_ids_total} registros
                          </Badge>
                        )}
                        {p.needs_review && (
                          <Badge variant="outline" className="text-[10px] border-amber-500 text-amber-700">
                            sem preço
                          </Badge>
                        )}
                      </div>
                    </TableCell>
                    <TableCell className="text-xs">{p.linha || "—"}</TableCell>
                    <TableCell className="font-mono text-xs">{p.ncm || "—"}</TableCell>
                    <TableCell className="text-right font-medium">{fmtBRL(p.bling_preco_canonico)}</TableCell>
                    <TableCell>
                      {p.ativo ? (
                        <Badge className="bg-emerald-600 hover:bg-emerald-600">Ativo</Badge>
                      ) : (
                        <Badge variant="outline">Inativo</Badge>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
