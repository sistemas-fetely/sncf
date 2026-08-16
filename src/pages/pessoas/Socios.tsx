import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { Handshake, Info } from "lucide-react";
import { PageShell } from "@/components/layout/PageShell";
import { PageTitle } from "@/components/layout/PageTitle";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { supabase } from "@/integrations/supabase/client";
import { format, parseISO } from "date-fns";
import { useIsSocio } from "@/hooks/useIsSocio";
import SemPermissao from "@/pages/SemPermissao";

interface LinhaSocio {
  pessoa_id: string;
  nome: string;
  cargo: string | null;
  data_inicio: string | null;
  email: string | null;
}

export default function Socios() {
  const navigate = useNavigate();
  const { data: isSocio, isLoading: carregandoPermissao } = useIsSocio();

  const listaQ = useQuery({
    queryKey: ["pessoas-socios"],
    enabled: isSocio === true,
    queryFn: async (): Promise<LinhaSocio[]> => {
      const { data: tipos, error: eTipos } = await supabase
        .from("tipos_vinculo")
        .select("codigo, aparece_em_pessoas")
        .eq("aparece_em_pessoas", false);
      if (eTipos) throw eTipos;
      const codigos = (tipos ?? []).map((t) => t.codigo);
      if (codigos.length === 0) return [];

      const [{ data: vinculos, error: eVinc }, { data: cargos }] = await Promise.all([
        supabase
          .from("vinculos")
          .select("id, pessoa_id, cargo_id, data_inicio, status, email_corporativo, tipo_vinculo, pessoa:pessoas!vinculos_pessoa_id_fkey(id, nome_completo, email_pessoal)")
          .in("tipo_vinculo", codigos)
          .eq("status", "ativo")
          .order("data_inicio", { ascending: true }),
        supabase.from("cargos").select("id, nome"),
      ]);
      if (eVinc) throw eVinc;

      const cargoMap = new Map<string, string>((cargos ?? []).map((c) => [c.id, c.nome]));
      return (vinculos ?? []).map((v) => ({
        pessoa_id: v.pessoa_id,
        nome: v.pessoa?.nome_completo ?? "—",
        cargo: v.cargo_id ? cargoMap.get(v.cargo_id) ?? null : null,
        data_inicio: v.data_inicio ?? null,
        email: v.email_corporativo ?? v.pessoa?.email_pessoal ?? null,
      }));
    },
  });

  if (carregandoPermissao) {
    return (
      <PageShell>
        <p className="text-sm text-muted-foreground">Carregando...</p>
      </PageShell>
    );
  }

  if (isSocio !== true) return <SemPermissao />;

  const linhas = listaQ.data ?? [];

  return (
    <PageShell>
      <PageTitle
        titulo="Sócios"
        icone={Handshake}
        estado={linhas.length > 0 ? `${linhas.length} sócio(s) com vínculo ativo` : undefined}
      />

      <div className="flex items-center gap-2 rounded-lg border border-info/40 bg-info/10 px-4 py-3 text-sm text-info">
        <Info className="h-4 w-4 shrink-0" />
        Esta área é visível apenas para os sócios.
      </div>

      <Card className="card-shadow">
        <CardContent className="p-4">
          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/50">
                  <TableHead className="font-medium">Nome</TableHead>
                  <TableHead className="font-medium">Cargo</TableHead>
                  <TableHead className="font-medium hidden md:table-cell">Início</TableHead>
                  <TableHead className="font-medium hidden md:table-cell">E-mail</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {listaQ.isLoading ? (
                  <TableRow><TableCell colSpan={4} className="py-8 text-center text-muted-foreground">Carregando...</TableCell></TableRow>
                ) : linhas.length === 0 ? (
                  <TableRow><TableCell colSpan={4} className="py-8 text-center text-muted-foreground">Nenhum sócio com vínculo ativo.</TableCell></TableRow>
                ) : linhas.map((s) => (
                  <TableRow
                    key={s.pessoa_id}
                    className="cursor-pointer transition-colors hover:bg-muted/30"
                    onClick={() => navigate(`/pessoas/${s.pessoa_id}/editar`)}
                  >
                    <TableCell className="text-sm font-medium">{s.nome}</TableCell>
                    <TableCell className="text-sm">{s.cargo || "—"}</TableCell>
                    <TableCell className="text-sm text-muted-foreground hidden md:table-cell">
                      {s.data_inicio ? format(parseISO(s.data_inicio), "dd/MM/yyyy") : "—"}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground hidden md:table-cell">{s.email || "—"}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </PageShell>
  );
}
