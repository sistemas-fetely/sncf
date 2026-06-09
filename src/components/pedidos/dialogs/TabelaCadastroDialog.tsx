import { useState } from "react";
import * as XLSX from "xlsx";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter,
  DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Loader2, Download, Mail, FileSpreadsheet } from "lucide-react";

interface TabelaCadastroDialogProps {
  pedido_id: string;
  id_externo: string;
  parceiro_id: string;
  parceiro_nome: string;
}

const COLUNAS: { key: string; label: string }[] = [
  { key: "sku",                 label: "SKU" },
  { key: "ean",                 label: "EAN" },
  { key: "ncm",                 label: "NCM" },
  { key: "cest",                label: "CEST" },
  { key: "marca",               label: "Marca" },
  { key: "linha",               label: "Linha" },
  { key: "grupo",               label: "Grupo" },
  { key: "tipo",                label: "Tipo" },
  { key: "colecao",             label: "Coleção" },
  { key: "nome_comercial",      label: "Nome Comercial" },
  { key: "nome_completo",       label: "Nome Completo" },
  { key: "cor_nome",            label: "Cor (Nome)" },
  { key: "tamanho_numero",      label: "Tamanho (N°)" },
  { key: "descricao_produto",   label: "Descrição" },
  { key: "tipo_embalagem",      label: "Tipo Embalagem" },
  { key: "material_descritivo", label: "Material" },
];

type LinhaExport = Record<string, string | number>;

function buildLinhas(itens: any[], prodMap: Map<string, any>): LinhaExport[] {
  const seen = new Set<string>();
  const result: LinhaExport[] = [];
  for (const item of itens) {
    if (!item.sku || seen.has(item.sku)) continue;
    seen.add(item.sku);
    const p = prodMap.get(item.sku) ?? {};
    result.push({
      sku:                  item.sku,
      ean:                  p.ean                 ?? "",
      ncm:                  p.ncm                 ?? "",
      cest:                 p.cest                ?? "",
      marca:                p.marca               ?? "FETELY",
      linha:                p.linha               ?? "",
      grupo:                p.grupo               ?? "",
      tipo:                 p.tipo                ?? "",
      colecao:              p.colecao             ?? "",
      nome_comercial:       p.nome_comercial      ?? item.descricao ?? "",
      nome_completo:        p.nome_completo       ?? "",
      cor_nome:             p.cor_nome            ?? "",
      tamanho_numero:       p.tamanho_numero      ?? "",
      descricao_produto:    p.descricao_produto   ?? "",
      tipo_embalagem:       p.tipo_embalagem      ?? "",
      material_descritivo:  p.material_descritivo ?? p.material ?? "",
    });
  }
  return result;
}

function buildWorkbook(linhas: LinhaExport[]) {
  const headers = COLUNAS.map((c) => c.label);
  const rows = linhas.map((l) => COLUNAS.map((c) => l[c.key] ?? ""));
  const ws = XLSX.utils.aoa_to_sheet([headers, ...rows]);
  ws["!cols"] = COLUNAS.map((c) => ({ wch: Math.max(c.label.length + 4, 18) }));
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Produtos Fetely");
  return wb;
}

export function TabelaCadastroDialog({
  pedido_id,
  id_externo,
  parceiro_id,
  parceiro_nome,
}: TabelaCadastroDialogProps) {
  const [open, setOpen] = useState(false);
  const [enviandoEmail, setEnviandoEmail] = useState(false);
  const { toast } = useToast();

  const { data, isLoading, error } = useQuery({
    queryKey: ["tabela-catalogo", pedido_id],
    enabled: open,
    queryFn: async () => {
      const [{ data: itens, error: eItens }, { data: parceiro }] = await Promise.all([
        supabase
          .from("pedido_itens")
          .select("sku, descricao, quantidade, ordem")
          .eq("pedido_id", pedido_id)
          .order("ordem"),
        supabase
          .from("parceiros_comerciais")
          .select("email, razao_social")
          .eq("id", parceiro_id)
          .maybeSingle(),
      ]);
      if (eItens) throw eItens;

      const skus = [
        ...new Set((itens ?? []).map((i: any) => i.sku).filter(Boolean)),
      ] as string[];

      const prodMap = new Map<string, any>();
      if (skus.length > 0) {
        const { data: produtos, error: eProds } = await supabase
          .from("sncf_produtos")
          .select("*")
          .in("sku", skus);
        if (eProds) throw eProds;
        for (const p of produtos ?? []) prodMap.set(p.sku, p);
      }

      return {
        linhas: buildLinhas(itens ?? [], prodMap),
        email: parceiro?.email ?? null,
        nomeReal: parceiro?.razao_social ?? parceiro_nome,
      };
    },
  });

  const linhas = data?.linhas ?? [];
  const nomeArquivo = `Catalogo_Fetely_${id_externo.replace(/[^a-zA-Z0-9]/g, "_")}.xlsx`;

  function handleDownload() {
    if (!linhas.length) return;
    const wb = buildWorkbook(linhas);
    const arr = XLSX.write(wb, { bookType: "xlsx", type: "array" });
    const blob = new Blob([arr], {
      type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = nomeArquivo;
    a.click();
    URL.revokeObjectURL(url);
  }

  async function handleEmail() {
    if (!linhas.length || !data?.email) return;
    setEnviandoEmail(true);
    try {
      const wb = buildWorkbook(linhas);
      const base64 = XLSX.write(wb, { bookType: "xlsx", type: "base64" });
      const { error: invErr } = await supabase.functions.invoke(
        "send-transactional-email",
        {
          body: {
            templateName: "catalogo-lojista",
            recipientEmail: data.email,
            templateData: {
              lojista_nome: data.nomeReal,
              id_externo,
              qtd_skus: linhas.length,
            },
            attachments: [{ filename: nomeArquivo, content: base64 }],
          },
        }
      );
      if (invErr) throw invErr;
      toast({
        title: "Email enviado",
        description: `Tabela enviada para ${data.email}`,
      });
    } catch (e) {
      console.error("[TabelaCadastroDialog] email:", e);
      toast({
        title: "Erro ao enviar",
        description: String(e),
        variant: "destructive",
      });
    } finally {
      setEnviandoEmail(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          onClick={(e) => e.stopPropagation()}
          title="Tabela de cadastro"
        >
          <FileSpreadsheet className="h-3 w-3 mr-1" />
          Cadastro
        </Button>
      </DialogTrigger>

      <DialogContent className="max-w-6xl max-h-[90vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>Tabela de Cadastro — {id_externo}</DialogTitle>
          <DialogDescription>
            {parceiro_nome} · {linhas.length} SKU{linhas.length !== 1 ? "s" : ""}
            {data?.email ? ` · ${data.email}` : " · sem email cadastrado"}
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 overflow-auto border rounded-md">
          {isLoading ? (
            <div className="flex items-center justify-center py-16">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : error ? (
            <div className="p-8 text-center text-destructive text-sm">
              Erro ao carregar dados do pedido.
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  {COLUNAS.map((c) => (
                    <TableHead key={c.key} className="whitespace-nowrap text-xs">
                      {c.label}
                    </TableHead>
                  ))}
                </TableRow>
              </TableHeader>
              <TableBody>
                {linhas.length === 0 ? (
                  <TableRow>
                    <TableCell
                      colSpan={COLUNAS.length}
                      className="text-center py-8 text-muted-foreground"
                    >
                      Nenhum produto encontrado para este pedido.
                    </TableCell>
                  </TableRow>
                ) : (
                  linhas.map((linha, i) => (
                    <TableRow key={i}>
                      {COLUNAS.map((c) => (
                        <TableCell key={c.key} className="text-xs whitespace-nowrap">
                          {linha[c.key] || (
                            <span className="text-muted-foreground">—</span>
                          )}
                        </TableCell>
                      ))}
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>
            Fechar
          </Button>
          <Button
            variant="outline"
            onClick={handleEmail}
            disabled={!linhas.length || !data?.email || enviandoEmail}
          >
            {enviandoEmail ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <Mail className="h-4 w-4 mr-2" />
            )}
            Enviar por email
          </Button>
          <Button onClick={handleDownload} disabled={!linhas.length}>
            <Download className="h-4 w-4 mr-2" />
            Baixar Excel
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
