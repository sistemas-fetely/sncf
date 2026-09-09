/**
 * IDENTIFICAÇÃO DA CONTA BANCÁRIA (09/09/2026)
 *
 * O OFX resolve a conta pelo próprio cabeçalho (banco, agência, número). Quando
 * o cadastro tem esses campos vazios, o arquivo legítimo era recusado. A
 * operação precisa completar isso sozinha, sem depender de acesso ao banco.
 */

import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Loader2, Pencil, Save, X, Landmark, AlertTriangle } from "lucide-react";
import { toast } from "sonner";
import { formatError } from "@/lib/format-error";

type Conta = {
  id: string;
  nome_exibicao: string;
  banco_codigo: string | null;
  agencia: string | null;
  numero_conta: string | null;
  ativo: boolean | null;
};

export function ParametrosContasBancariasIdentificacao() {
  const qc = useQueryClient();
  const [editando, setEditando] = useState<string | null>(null);
  const [rascunho, setRascunho] = useState({ banco_codigo: "", agencia: "", numero_conta: "" });
  const [salvando, setSalvando] = useState(false);

  const { data: contas = [], isLoading, isError, error } = useQuery({
    queryKey: ["parametros-contas-bancarias-identificacao"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("contas_bancarias")
        .select("id, nome_exibicao, banco_codigo, agencia, numero_conta, ativo")
        .order("nome_exibicao");
      if (error) throw error;
      return (data || []) as Conta[];
    },
  });

  function abrir(c: Conta) {
    setEditando(c.id);
    setRascunho({
      banco_codigo: c.banco_codigo ?? "",
      agencia: c.agencia ?? "",
      numero_conta: c.numero_conta ?? "",
    });
  }

  async function salvar(id: string) {
    setSalvando(true);
    try {
      const { error } = await supabase
        .from("contas_bancarias")
        .update({
          banco_codigo: rascunho.banco_codigo.trim() || null,
          agencia: rascunho.agencia.trim() || null,
          numero_conta: rascunho.numero_conta.trim() || null,
        })
        .eq("id", id);
      if (error) throw error;
      toast.success("Identificação da conta atualizada");
      setEditando(null);
      qc.invalidateQueries({ queryKey: ["parametros-contas-bancarias-identificacao"] });
      qc.invalidateQueries({ queryKey: ["extrato-import-contas"] });
      qc.invalidateQueries({ queryKey: ["contas-bancarias"] });
    } catch (e) {
      toast.error("Falha ao salvar: " + formatError(e));
    } finally {
      setSalvando(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Landmark className="h-4 w-4" />
          Identificação das contas bancárias
        </CardTitle>
        <p className="mt-1 text-xs text-muted-foreground">
          Banco, agência e número da conta são o que faz o OFX cair na conta certa. Campo vazio
          funciona como curinga e é completado automaticamente no primeiro arquivo que declarar o
          número — preencha aqui quando o banco não declarar.
        </p>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="flex justify-center py-6">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : isError ? (
          <p className="text-sm text-destructive">Falha ao carregar: {formatError(error)}</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Conta</TableHead>
                <TableHead>Banco</TableHead>
                <TableHead>Agência</TableHead>
                <TableHead>Número</TableHead>
                <TableHead className="w-[110px]" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {contas.map((c) => {
                const emEdicao = editando === c.id;
                const incompleta = !c.banco_codigo || !c.numero_conta;
                return (
                  <TableRow key={c.id}>
                    <TableCell className="font-medium">
                      <div className="flex items-center gap-2">
                        {c.nome_exibicao}
                        {c.ativo === false && (
                          <Badge variant="secondary" className="text-[10px]">inativa</Badge>
                        )}
                        {incompleta && (
                          <span className="inline-flex items-center gap-1 text-warning text-xs">
                            <AlertTriangle className="h-3 w-3" />
                            incompleta
                          </span>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>
                      {emEdicao ? (
                        <Input
                          className="h-8"
                          value={rascunho.banco_codigo}
                          onChange={(e) =>
                            setRascunho({ ...rascunho, banco_codigo: e.target.value })
                          }
                          placeholder="422"
                        />
                      ) : (
                        c.banco_codigo || "—"
                      )}
                    </TableCell>
                    <TableCell>
                      {emEdicao ? (
                        <Input
                          className="h-8"
                          value={rascunho.agencia}
                          onChange={(e) => setRascunho({ ...rascunho, agencia: e.target.value })}
                          placeholder="0001"
                        />
                      ) : (
                        c.agencia || "—"
                      )}
                    </TableCell>
                    <TableCell>
                      {emEdicao ? (
                        <Input
                          className="h-8"
                          value={rascunho.numero_conta}
                          onChange={(e) =>
                            setRascunho({ ...rascunho, numero_conta: e.target.value })
                          }
                          placeholder="00055804446"
                        />
                      ) : (
                        c.numero_conta || "—"
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      {emEdicao ? (
                        <div className="flex justify-end gap-1">
                          <Button
                            size="sm"
                            variant="ghost"
                            disabled={salvando}
                            onClick={() => salvar(c.id)}
                            aria-label="Salvar"
                          >
                            {salvando ? (
                              <Loader2 className="h-4 w-4 animate-spin" />
                            ) : (
                              <Save className="h-4 w-4" />
                            )}
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => setEditando(null)}
                            aria-label="Cancelar"
                          >
                            <X className="h-4 w-4" />
                          </Button>
                        </div>
                      ) : (
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => abrir(c)}
                          aria-label={`Editar ${c.nome_exibicao}`}
                        >
                          <Pencil className="h-4 w-4" />
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}
