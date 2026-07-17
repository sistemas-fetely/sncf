import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Upload, Loader2, FileText } from "lucide-react";
import { toast } from "sonner";
import { parseOFX } from "@/lib/financeiro/ofx-parser";
import { parseXlsxSafraLancamentos } from "@/lib/financeiro/xlsx-safra-lancamentos-parser";
import { parseXlsxMpWithdraw } from "@/lib/financeiro/xlsx-mp-withdraw-parser";
import * as XLSX from "xlsx";
import { gerarHashMov } from "@/lib/financeiro/hash-mov";

import { formatDateBR } from "@/lib/format-currency";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const sb = supabase as any;

type Conta = { id: string; nome_exibicao: string };
type Importacao = {
  id: string;
  conta_bancaria_id: string | null;
  fonte_tipo: string;
  nome_arquivo: string;
  periodo_inicio: string | null;
  periodo_fim: string | null;
  status: string;
  linhas_lidas: number | null;
  linhas_novas: number | null;
  linhas_enriquecidas: number | null;
  linhas_duplicadas: number | null;
  divergencia_saldo: number | null;
  erro_detalhe: string | null;
  created_at: string;
};

type Fonte = "ofx" | "safra_lancamentos" | "mp_withdraw";

function detectarFonteBase(file: File): "ofx" | "xlsx" | null {
  const nome = file.name.toLowerCase();
  if (nome.endsWith(".ofx")) return "ofx";
  if (nome.endsWith(".xlsx")) return "xlsx";
  return null;
}

async function detectarSubtipoXlsx(file: File): Promise<"safra_lancamentos" | "mp_withdraw"> {
  const buf = await file.arrayBuffer();
  const wb = XLSX.read(buf, { type: "array" });
  const sheet = wb.Sheets[wb.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, defval: null }) as unknown[][];
  // Vasculhar até 20 primeiras linhas por keyword
  for (let i = 0; i < Math.min(rows.length, 20); i++) {
    const s = (rows[i] || [])
      .map((c) => String(c ?? "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, ""))
      .join("|");
    if (/retirad|withdraw|mercado pago|mercadopago/.test(s)) return "mp_withdraw";
  }
  return "safra_lancamentos";
}


export default function ExtratoImportacao() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [conta, setConta] = useState<string>("");
  const [arquivos, setArquivos] = useState<File[]>([]);
  const [processando, setProcessando] = useState(false);

  const { data: contas = [] } = useQuery({
    queryKey: ["extrato-import-contas"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("contas_bancarias")
        .select("id, nome_exibicao")
        .eq("ativo", true)
        .order("nome_exibicao");
      if (error) throw error;
      return (data || []) as Conta[];
    },
  });

  const { data: historico = [], refetch } = useQuery({
    queryKey: ["extrato-importacoes"],
    queryFn: async () => {
      const { data, error } = await sb
        .from("extrato_importacoes")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(50);
      if (error) throw error;
      return (data || []) as Importacao[];
    },
  });

  async function processarArquivo(file: File) {
    if (!conta || !user) throw new Error("Selecione a conta bancária");
    const base = detectarFonteBase(file);
    if (!base) throw new Error(`Extensão não reconhecida: ${file.name}`);
    const fonte: Fonte = base === "ofx" ? "ofx" : await detectarSubtipoXlsx(file);


    const { data: impRow, error: errImp } = await sb
      .from("extrato_importacoes")
      .insert({
        conta_bancaria_id: conta,
        fonte_tipo: fonte,
        nome_arquivo: file.name,
        status: "processando",
        importado_por: user.id,
      })
      .select("id")
      .single();
    if (errImp) throw errImp;
    const impId = impRow.id as string;

    try {
      let linhasLidas = 0;
      let novas = 0;
      let enriquecidas = 0;
      let duplicadas = 0;
      let periodoInicio: string | null = null;
      let periodoFim: string | null = null;

      if (fonte === "ofx") {
        const text = await file.text();
        const parsed = parseOFX(text);
        linhasLidas = parsed.movimentacoes.length;
        if (linhasLidas === 0) throw new Error("Nenhuma movimentação no OFX");

        const movs = parsed.movimentacoes.filter((m) => m.data_transacao);
        const datas = movs.map((m) => m.data_transacao!).sort();
        periodoInicio = datas[0] || null;
        periodoFim = datas[datas.length - 1] || null;

        const comHash = await Promise.all(
          movs.map(async (m) => ({
            ...m,
            hash_unico: await gerarHashMov(
              conta,
              m.data_transacao!,
              m.valor,
              m.descricao,
              m.id_transacao_banco || undefined
            ),
          }))
        );

        const hashes = comHash.map((m) => m.hash_unico);
        const { data: existentes } = await sb
          .from("movimentacoes_bancarias")
          .select("id, hash_unico, contraparte_documento")
          .in("hash_unico", hashes);
        const mapExist = new Map<string, { id: string; contraparte_documento: string | null }>();
        for (const e of existentes || []) mapExist.set(e.hash_unico, e);

        const novasRows: Record<string, unknown>[] = [];
        for (const m of comHash) {
          const jaExiste = mapExist.get(m.hash_unico);
          if (jaExiste) {
            duplicadas++;
            // Enriquecer se antes estava null
            if (!jaExiste.contraparte_documento && m.contraparte_documento) {
              const { error: errUp } = await sb
                .from("movimentacoes_bancarias")
                .update({
                  contraparte_nome: m.contraparte_nome,
                  contraparte_documento: m.contraparte_documento,
                  tipo_meio: m.tipo_meio,
                })
                .eq("id", jaExiste.id);
              if (errUp) throw errUp;
              enriquecidas++;
            }
            continue;
          }
          novasRows.push({
            conta_bancaria_id: conta,
            data_transacao: m.data_transacao,
            descricao: m.descricao,
            valor: m.valor,
            tipo: m.tipo,
            id_transacao_banco: m.id_transacao_banco,
            hash_unico: m.hash_unico,
            origem: "ofx",
            contraparte_nome: m.contraparte_nome,
            contraparte_documento: m.contraparte_documento,
            tipo_meio: m.tipo_meio,
            fonte_importacao_id: impId,
          });
        }

        for (let i = 0; i < novasRows.length; i += 100) {
          const lote = novasRows.slice(i, i + 100);
          const { error } = await sb.from("movimentacoes_bancarias").insert(lote);
          if (error) throw error;
        }
        novas = novasRows.length;
      } else if (fonte === "safra_lancamentos") {
        const buf = await file.arrayBuffer();
        const parsed = parseXlsxSafraLancamentos(buf);
        linhasLidas = parsed.movimentacoes.length;
        if (linhasLidas === 0) throw new Error("Nenhuma linha válida na planilha");

        const datas = parsed.movimentacoes
          .map((m) => m.data_transacao!)
          .filter(Boolean)
          .sort();
        periodoInicio = datas[0] || null;
        periodoFim = datas[datas.length - 1] || null;

        for (const m of parsed.movimentacoes) {
          const valorAssinado = m.tipo === "credito" ? m.valor : -m.valor;
          const hashPrincipal = await gerarHashMov(
            conta,
            m.data_transacao!,
            valorAssinado,
            m.descricao,
            m.id_transacao_banco || undefined
          );

          // Buscar por hash principal (E2E se houver)
          const { data: exist } = await sb
            .from("movimentacoes_bancarias")
            .select("id, hash_unico, contraparte_documento, id_transacao_banco")
            .eq("hash_unico", hashPrincipal)
            .maybeSingle();

          if (exist) {
            duplicadas++;
            const patch: Record<string, unknown> = {};
            if (!exist.contraparte_documento && m.contraparte_documento) {
              patch.contraparte_nome = m.contraparte_nome;
              patch.contraparte_documento = m.contraparte_documento;
            }
            if (m.id_transacao_banco && !exist.id_transacao_banco) {
              patch.id_transacao_banco = m.id_transacao_banco;
            }
            patch.tipo_meio = "pix";
            if (m.referencia_pedido) patch.referencia_pedido = m.referencia_pedido;
            if (m.data_hora) patch.data_hora = m.data_hora;
            if (Object.keys(patch).length > 0) {
              const { error: errUp } = await sb
                .from("movimentacoes_bancarias")
                .update(patch)
                .eq("id", exist.id);
              if (errUp) throw errUp;
              enriquecidas++;
            }
            continue;
          }

          // Tentar casar com OFX prévio: mesma conta, mesma data, mesmo valor, sem contraparte
          const { data: candidatos } = await sb
            .from("movimentacoes_bancarias")
            .select("id, contraparte_documento")
            .eq("conta_bancaria_id", conta)
            .eq("data_transacao", m.data_transacao)
            .eq("valor", valorAssinado)
            .is("contraparte_documento", null)
            .limit(1);

          if (candidatos && candidatos.length > 0) {
            const alvo = candidatos[0];
            const { error: errUp } = await sb
              .from("movimentacoes_bancarias")
              .update({
                contraparte_nome: m.contraparte_nome,
                contraparte_documento: m.contraparte_documento,
                tipo_meio: "pix",
                referencia_pedido: m.referencia_pedido,
                data_hora: m.data_hora,
                id_transacao_banco: m.id_transacao_banco,
              })
              .eq("id", alvo.id);
            if (errUp) throw errUp;
            enriquecidas++;
            continue;
          }

          // Inserir nova
          const { error: errIns } = await sb
            .from("movimentacoes_bancarias")
            .insert({
              conta_bancaria_id: conta,
              data_transacao: m.data_transacao,
              data_hora: m.data_hora,
              descricao: m.descricao,
              valor: valorAssinado,
              tipo: m.tipo,
              id_transacao_banco: m.id_transacao_banco,
              hash_unico: hashPrincipal,
              origem: "safra_lancamentos",
              contraparte_nome: m.contraparte_nome,
              contraparte_documento: m.contraparte_documento,
              tipo_meio: "pix",
              referencia_pedido: m.referencia_pedido,
              fonte_importacao_id: impId,
            });
          if (errIns) throw errIns;
          novas++;
        }
      }

      await sb
        .from("extrato_importacoes")
        .update({
          status: "concluida",
          linhas_lidas: linhasLidas,
          linhas_novas: novas,
          linhas_enriquecidas: enriquecidas,
          linhas_duplicadas: duplicadas,
          periodo_inicio: periodoInicio,
          periodo_fim: periodoFim,
        })
        .eq("id", impId);

      toast.success(
        `${file.name}: ${novas} novas · ${enriquecidas} enriquecidas · ${duplicadas} duplicadas`
      );
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      await sb
        .from("extrato_importacoes")
        .update({ status: "erro", erro_detalhe: msg })
        .eq("id", impId);
      throw e;
    }
  }

  async function handleImportar() {
    if (!conta) {
      toast.error("Selecione a conta bancária");
      return;
    }
    if (arquivos.length === 0) {
      toast.error("Selecione ao menos um arquivo");
      return;
    }
    setProcessando(true);
    try {
      for (const f of arquivos) {
        try {
          await processarArquivo(f);
        } catch (e) {
          toast.error(
            `Falha em ${f.name}: ${e instanceof Error ? e.message : String(e)}`
          );
        }
      }
      setArquivos([]);
      qc.invalidateQueries({ queryKey: ["movimentacoes-bancarias"] });
      qc.invalidateQueries({ queryKey: ["extrato-inbox"] });
      refetch();
    } finally {
      setProcessando(false);
    }
  }

  return (
    <div className="p-6 space-y-6 max-w-6xl">
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <Upload className="h-6 w-6 text-admin" />
          Importar Extratos
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          OFX (Itaú/Safra/qualquer banco) e XLSX Safra Lançamentos e Devoluções.
        </p>
      </div>

      <Card>
        <CardContent className="pt-6 space-y-4">
          <div>
            <Label>Conta bancária</Label>
            <Select value={conta} onValueChange={setConta}>
              <SelectTrigger><SelectValue placeholder="Selecione a conta" /></SelectTrigger>
              <SelectContent>
                {contas.map((c) => (
                  <SelectItem key={c.id} value={c.id}>{c.nome_exibicao}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Arquivos (.ofx, .xlsx — múltiplos)</Label>
            <Input
              type="file"
              multiple
              accept=".ofx,.xlsx"
              onChange={(e) => setArquivos(Array.from(e.target.files || []))}
            />
            {arquivos.length > 0 && (
              <ul className="mt-2 text-xs text-muted-foreground space-y-1">
                {arquivos.map((f) => (
                  <li key={f.name} className="flex items-center gap-2">
                    <FileText className="h-3 w-3" />
                    {f.name}
                    <span className="text-[10px] uppercase">
                      {detectarFonteBase(f) || "?"}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
          <Button
            onClick={handleImportar}
            disabled={processando || !conta || arquivos.length === 0}
            className="bg-admin hover:bg-admin/90 text-admin-foreground gap-2"
          >
            {processando ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
            Importar {arquivos.length > 0 ? `(${arquivos.length})` : ""}
          </Button>
        </CardContent>
      </Card>

      <div>
        <h2 className="text-lg font-semibold mb-2">Histórico de importações</h2>
        <Card>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Data</TableHead>
                  <TableHead>Fonte</TableHead>
                  <TableHead>Arquivo</TableHead>
                  <TableHead>Período</TableHead>
                  <TableHead className="text-right">Lidas</TableHead>
                  <TableHead className="text-right">Novas</TableHead>
                  <TableHead className="text-right">Enriq.</TableHead>
                  <TableHead className="text-right">Dup.</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {historico.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={9} className="text-center text-muted-foreground py-6">
                      Nenhuma importação ainda
                    </TableCell>
                  </TableRow>
                )}
                {historico.map((h) => (
                  <TableRow key={h.id}>
                    <TableCell className="text-xs">{formatDateBR(h.created_at)}</TableCell>
                    <TableCell><Badge variant="outline">{h.fonte_tipo}</Badge></TableCell>
                    <TableCell className="max-w-[240px] truncate" title={h.nome_arquivo}>
                      {h.nome_arquivo}
                    </TableCell>
                    <TableCell className="text-xs">
                      {h.periodo_inicio ? formatDateBR(h.periodo_inicio) : "—"}
                      {" → "}
                      {h.periodo_fim ? formatDateBR(h.periodo_fim) : "—"}
                    </TableCell>
                    <TableCell className="text-right">{h.linhas_lidas ?? "—"}</TableCell>
                    <TableCell className="text-right">{h.linhas_novas ?? "—"}</TableCell>
                    <TableCell className="text-right">{h.linhas_enriquecidas ?? "—"}</TableCell>
                    <TableCell className="text-right">{h.linhas_duplicadas ?? "—"}</TableCell>
                    <TableCell>
                      <Badge
                        variant={
                          h.status === "concluida"
                            ? "default"
                            : h.status === "erro"
                            ? "destructive"
                            : "outline"
                        }
                        className={
                          h.status === "concluida"
                            ? "bg-success text-success-foreground"
                            : ""
                        }
                        title={h.erro_detalhe || undefined}
                      >
                        {h.status}
                      </Badge>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
