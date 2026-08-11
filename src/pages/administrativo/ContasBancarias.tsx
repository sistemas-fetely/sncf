import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Plus,
  Landmark,
  PiggyBank,
  Banknote,
  Pencil,
  Trash2,
  Power,
  CreditCard,
} from "lucide-react";
import { formatBRL } from "@/lib/format-currency";
import {
  ContaBancariaFormSheet,
  type ContaBancaria,
} from "@/components/financeiro/ContaBancariaFormSheet";
import {
  NovoCartaoSheet,
  type CartaoCredito,
} from "@/components/financeiro/NovoCartaoSheet";

const TIPO_LABEL: Record<string, string> = {
  corrente: "Conta Corrente",
  poupanca: "Poupança",
  caixa_fisico: "Caixa Físico",
};

const TIPO_ICON: Record<string, typeof Landmark> = {
  corrente: Landmark,
  poupanca: PiggyBank,
  caixa_fisico: Banknote,
};

const UNIDADE_LABEL: Record<string, string> = {
  matriz_sp: "Matriz SP",
  joinville: "Joinville",
  fabrica_sp: "Fábrica SP",
  ecommerce_sp: "Ecommerce SP",
};

export default function ContasBancarias() {
  const qc = useQueryClient();
  const navigate = useNavigate();

  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<ContaBancaria | null>(null);
  const [paraExcluir, setParaExcluir] = useState<ContaBancaria | null>(null);

  const [cartaoFormOpen, setCartaoFormOpen] = useState(false);
  const [editingCartao, setEditingCartao] = useState<CartaoCredito | null>(null);
  const [paraExcluirCartao, setParaExcluirCartao] = useState<CartaoCredito | null>(null);

  const { data: contas, isLoading } = useQuery({
    queryKey: ["contas-bancarias"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("contas_bancarias")
        .select("*")
        .not("tipo", "in", "(cartao_credito,cartao_debito)")
        .order("ativo", { ascending: false })
        .order("nome_exibicao");
      if (error) throw error;
      return data as ContaBancaria[];
    },
  });

  const { data: cartoes, isLoading: cartoesLoading } = useQuery({
    queryKey: ["cartoes-credito-listagem-v2"],
    queryFn: async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any)
        .from("cartoes_credito")
        .select("*")
        .order("ativo", { ascending: false })
        .order("nome");
      if (error) throw error;
      return (data || []) as CartaoCredito[];
    },
  });

  function handleNova() {
    setEditing(null);
    setFormOpen(true);
  }

  function handleEditar(c: ContaBancaria) {
    setEditing(c);
    setFormOpen(true);
  }

  function handleNovoCartao() {
    setEditingCartao(null);
    setCartaoFormOpen(true);
  }

  function handleEditarCartao(c: CartaoCredito) {
    setEditingCartao(c);
    setCartaoFormOpen(true);
  }

  async function handleToggleAtivo(c: ContaBancaria) {
    const { error } = await supabase
      .from("contas_bancarias")
      .update({ ativo: !c.ativo })
      .eq("id", c.id);
    if (error) {
      toast.error("Erro ao atualizar: " + error.message);
      return;
    }
    toast.success(c.ativo ? "Conta inativada" : "Conta ativada");
    qc.invalidateQueries({ queryKey: ["contas-bancarias"] });
  }

  async function handleToggleAtivoCartao(c: CartaoCredito) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error } = await (supabase as any)
      .from("cartoes_credito")
      .update({ ativo: !c.ativo })
      .eq("id", c.id);
    if (error) {
      toast.error("Erro ao atualizar: " + error.message);
      return;
    }
    toast.success(c.ativo ? "Cartão inativado" : "Cartão ativado");
    qc.invalidateQueries({ queryKey: ["cartoes-credito-listagem-v2"] });
  }

  async function handleConfirmarExcluir() {
    if (!paraExcluir) return;
    const { count } = await supabase
      .from("movimentacoes_bancarias")
      .select("id", { count: "exact", head: true })
      .eq("conta_bancaria_id", paraExcluir.id);

    if (count && count > 0) {
      const { error } = await supabase
        .from("contas_bancarias")
        .update({ ativo: false })
        .eq("id", paraExcluir.id);
      if (error) { toast.error("Erro: " + error.message); return; }
      toast.success(`Conta inativada (tem ${count} movimentações - não pode ser excluída)`);
    } else {
      const { error } = await supabase
        .from("contas_bancarias")
        .delete()
        .eq("id", paraExcluir.id);
      if (error) { toast.error("Erro: " + error.message); return; }
      toast.success("Conta excluída");
    }
    qc.invalidateQueries({ queryKey: ["contas-bancarias"] });
    setParaExcluir(null);
  }

  async function handleConfirmarExcluirCartao() {
    if (!paraExcluirCartao) return;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error } = await (supabase as any)
      .from("cartoes_credito")
      .update({ ativo: false })
      .eq("id", paraExcluirCartao.id);
    if (error) { toast.error("Erro: " + error.message); return; }
    toast.success("Cartão inativado");
    qc.invalidateQueries({ queryKey: ["cartoes-credito-listagem-v2"] });
    setParaExcluirCartao(null);
  }

  const ativas = (contas || []).filter((c) => c.ativo !== false);
  const inativas = (contas || []).filter((c) => c.ativo === false);
  const cartoesAtivos = (cartoes || []).filter((c) => c.ativo !== false);

  const totalSaldo = ativas.reduce((s, c) => s + Number(c.saldo_atual || 0), 0);

  return (
    <div className="space-y-6 p-6">
      {/* Header contas */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Landmark className="h-6 w-6 text-admin" />
            Contas Bancárias
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Cadastro de contas correntes, poupanças e caixas físicos.
          </p>
        </div>
        <Button onClick={handleNova} className="gap-2">
          <Plus className="h-4 w-4" />
          Nova conta bancária
        </Button>
      </div>

      {/* KPIs contas */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-xs uppercase tracking-wide text-muted-foreground">
              Saldo total (contas ativas)
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">{formatBRL(totalSaldo)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-xs uppercase tracking-wide text-muted-foreground">
              Contas ativas
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">{ativas.length}</p>
          </CardContent>
        </Card>
      </div>

      {/* Lista de contas ativas */}
      {isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-40" />
          ))}
        </div>
      ) : ativas.length === 0 ? (
        <Card>
          <CardContent className="py-10 text-center space-y-3">
            <Landmark className="h-10 w-10 text-muted-foreground mx-auto" />
            <p className="text-sm text-muted-foreground">
              Nenhuma conta bancária cadastrada ainda.
            </p>
            <Button onClick={handleNova} className="gap-2">
              <Plus className="h-4 w-4" />
              Cadastrar primeira conta
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          {ativas.map((c) => {
            const Icon = TIPO_ICON[c.tipo] || Landmark;
            return (
              <Card
                key={c.id}
                role="button"
                tabIndex={0}
                title="Ver extrato da conta"
                className="cursor-pointer transition-colors hover:border-admin/50"
                onClick={() => navigate(`/administrativo/caixa-banco/contas/${c.id}`)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    navigate(`/administrativo/caixa-banco/contas/${c.id}`);
                  }
                }}
              >
                <CardHeader className="pb-2">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-start gap-2">
                      <div
                        className="h-10 w-10 rounded-md flex items-center justify-center shrink-0"
                        style={{ backgroundColor: c.cor || "#1A3D2B" }}
                      >
                        <Icon className="h-5 w-5 text-white" />
                      </div>
                      <div>
                        <CardTitle className="text-base">{c.nome_exibicao}</CardTitle>
                        <p className="text-xs text-muted-foreground">
                          {TIPO_LABEL[c.tipo] || c.tipo}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-0.5">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7"
                        onClick={(e) => { e.stopPropagation(); handleEditar(c); }}
                        title="Editar"
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7"
                        onClick={(e) => { e.stopPropagation(); handleToggleAtivo(c); }}
                        title="Inativar"
                      >
                        <Power className="h-3.5 w-3.5" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7 text-destructive"
                        onClick={(e) => { e.stopPropagation(); setParaExcluir(c); }}
                        title="Excluir"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="space-y-2">
                  {c.tipo !== "caixa_fisico" && (
                    <div className="text-xs space-y-0.5">
                      <p className="font-medium">{c.banco}</p>
                      {(c.agencia || c.numero_conta) && (
                        <p className="text-muted-foreground">
                          {c.agencia ? `Ag ${c.agencia}` : ""}
                          {c.agencia && c.numero_conta ? " · " : ""}
                          {c.numero_conta ? `C/C ${c.numero_conta}` : ""}
                        </p>
                      )}
                    </div>
                  )}
                  <div>
                    <p className="text-[10px] uppercase tracking-wide text-muted-foreground">
                      Saldo atual
                    </p>
                    <p className="text-lg font-bold">
                      {formatBRL(Number(c.saldo_atual || 0))}
                    </p>
                  </div>
                  {c.unidade && (
                    <Badge variant="outline" className="text-[10px]">
                      {UNIDADE_LABEL[c.unidade] || c.unidade}
                    </Badge>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* Inativas */}
      {inativas.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-sm text-muted-foreground">
              Contas inativas ({inativas.length})
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {inativas.map((c) => (
              <div key={c.id} className="flex items-center justify-between border rounded-md p-2">
                <div className="flex items-center gap-2 text-sm">
                  <span className="font-medium">{c.nome_exibicao}</span>
                  <span className="text-muted-foreground">·</span>
                  <span className="text-xs text-muted-foreground">{TIPO_LABEL[c.tipo] || c.tipo}</span>
                </div>
                <div className="flex items-center gap-1">
                  <Button variant="ghost" size="sm" onClick={() => handleToggleAtivo(c)}>
                    Ativar
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7 text-destructive"
                    onClick={() => setParaExcluir(c)}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {/* ── SEÇÃO CARTÕES DE CRÉDITO ── */}
      <div className="pt-6 border-t space-y-4">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="text-xl font-bold flex items-center gap-2">
              <CreditCard className="h-5 w-5 text-admin" />
              Cartões de Crédito
            </h2>
            <p className="text-sm text-muted-foreground mt-1">
              Cartões usados para importação de faturas.
            </p>
          </div>
          <Button onClick={handleNovoCartao} className="gap-2">
            <Plus className="h-4 w-4" />
            Novo cartão
          </Button>
        </div>

        {cartoesLoading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {Array.from({ length: 2 }).map((_, i) => (
              <Skeleton key={i} className="h-40" />
            ))}
          </div>
        ) : cartoesAtivos.length === 0 ? (
          <Card>
            <CardContent className="py-10 text-center space-y-3">
              <CreditCard className="h-10 w-10 text-muted-foreground mx-auto" />
              <p className="text-sm text-muted-foreground">
                Nenhum cartão cadastrado ainda.
              </p>
              <Button onClick={handleNovoCartao} className="gap-2">
                <Plus className="h-4 w-4" />
                Cadastrar primeiro cartão
              </Button>
            </CardContent>
          </Card>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {cartoesAtivos.map((c) => (
              <Card
                key={c.id}
                role="button"
                tabIndex={0}
                title="Ver faturas do cartão"
                className="cursor-pointer transition-colors hover:border-admin/50"
                onClick={() => navigate("/administrativo/faturas-cartao")}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    navigate("/administrativo/faturas-cartao");
                  }
                }}
              >
                <CardHeader className="pb-2">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-start gap-2">
                      <div className="h-10 w-10 rounded-md flex items-center justify-center shrink-0 bg-admin">
                        <CreditCard className="h-5 w-5 text-white" />
                      </div>
                      <div>
                        <CardTitle className="text-base">{c.nome}</CardTitle>
                        <p className="text-xs text-muted-foreground">
                          {c.bandeira || "Cartão de crédito"}
                          {c.ultimos_digitos && ` · ****${c.ultimos_digitos}`}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-0.5">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7"
                        onClick={(e) => { e.stopPropagation(); handleEditarCartao(c); }}
                        title="Editar"
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7"
                        onClick={(e) => { e.stopPropagation(); setParaExcluirCartao(c); }}
                        title="Inativar"
                      >
                        <Power className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="space-y-1">
                  <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Limite</p>
                  <p className="text-lg font-bold">{formatBRL(Number(c.limite || 0))}</p>
                  {c.dia_fechamento && c.dia_vencimento && (
                    <p className="text-xs text-muted-foreground pt-1">
                      Fecha dia {c.dia_fechamento} · Vence dia {c.dia_vencimento}
                    </p>
                  )}
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>

      {/* Forms */}
      <ContaBancariaFormSheet
        open={formOpen}
        onOpenChange={setFormOpen}
        editing={editing}
      />

      <NovoCartaoSheet
        open={cartaoFormOpen}
        onOpenChange={setCartaoFormOpen}
        editing={editingCartao}
      />

      {/* AlertDialog excluir conta */}
      <AlertDialog open={!!paraExcluir} onOpenChange={(v) => !v && setParaExcluir(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir conta bancária?</AlertDialogTitle>
            <AlertDialogDescription>
              Você está prestes a excluir <strong>{paraExcluir?.nome_exibicao}</strong>.
              <br />
              Se houver movimentações vinculadas, ela será apenas inativada (não pode ser excluída para preservar o histórico).
              <br />
              Caso contrário, será excluída permanentemente.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                handleConfirmarExcluir();
              }}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Confirmar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* AlertDialog inativar cartão */}
      <AlertDialog open={!!paraExcluirCartao} onOpenChange={(v) => !v && setParaExcluirCartao(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Inativar cartão?</AlertDialogTitle>
            <AlertDialogDescription>
              O cartão <strong>{paraExcluirCartao?.nome}</strong> será inativado.
              O histórico de faturas é preservado.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                handleConfirmarExcluirCartao();
              }}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Inativar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
