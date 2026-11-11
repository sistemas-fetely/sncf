import { useEffect, useState } from "react";
import { Download, Loader2, Printer, RefreshCw, ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { escolherImpressora, gerarCertificadoQz, imprimirZpl, listarImpressoras, obterCertificadoQz, qzDisponivel, salvarImpressora, ZPL_TESTE } from "@/lib/impressao/qz";

export function ImpressaoZebraQz() {
  const { hasAnyRole } = useAuth();
  const [status, setStatus] = useState("Não conectado");
  const [conectado, setConectado] = useState(false);
  const [impressoras, setImpressoras] = useState<string[]>([]);
  const [impressora, setImpressora] = useState<string | null>(null);
  const [certificado, setCertificado] = useState<string | null>(null);
  const [semCertificado, setSemCertificado] = useState(false);
  const [ocupado, setOcupado] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const admin = hasAnyRole(["super_admin", "admin_ti", "admin_rh"]);

  useEffect(() => {
    if (!admin) return;
    let ativo = true;
    void obterCertificadoQz().then(pem => { if (ativo) setCertificado(pem); }).catch(e => {
      if (!ativo) return;
      if (e instanceof Error && e.message.includes("ainda não gerado")) setSemCertificado(true);
      else setErro(e instanceof Error ? e.message : String(e));
    });
    return () => { ativo = false; };
  }, [admin]);

  async function executar(fn: () => Promise<void>) {
    setOcupado(true); setErro(null);
    try { await fn(); } catch (e) { const msg = e instanceof Error ? e.message : String(e); setErro(msg); toast.error(msg); }
    finally { setOcupado(false); }
  }
  async function conectar() {
    if (!await qzDisponivel()) { setConectado(false); setImpressoras([]); setStatus("QZ Tray não encontrado"); return; }
    setConectado(true);
    setStatus("Conectado");
    const lista = await listarImpressoras(); setImpressoras(lista); setImpressora(escolherImpressora(lista));
  }
  if (!admin) return null;
  return <Card aria-label="Impressão Zebra (QZ Tray)">
    <CardHeader>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <CardTitle>Impressão Zebra (QZ Tray)</CardTitle>
        <Badge variant="outline" className={conectado ? "border-success/30 bg-success/10 text-success" : "border-warning/30 bg-warning/10 text-warning"} role="status">{status}</Badge>
      </div>
      <CardDescription>Certificado de impressão e impressora Zebra desta estação.</CardDescription>
    </CardHeader>
    <CardContent className="space-y-4">
    <ol className="list-decimal space-y-2 pl-5 text-sm text-muted-foreground">
      <li>Gerar certificado (só na primeira vez).</li>
      <li>Baixar <span className="font-mono">override.crt</span>.</li>
      <li>Copiar para <span className="break-all font-mono">C:\Program Files\QZ Tray\</span> e reiniciar o QZ Tray.</li>
      <li>Conectar QZ, escolher a impressora e imprimir o teste.</li>
    </ol>
    <div className="flex flex-wrap gap-2">
      {semCertificado && <Button variant="outline" size="sm" disabled={ocupado} onClick={() => void executar(async () => { setCertificado(await gerarCertificadoQz()); setSemCertificado(false); toast.success("Certificado QZ gerado."); })}><ShieldCheck className="size-4" />Gerar certificado</Button>}
      <Button variant="outline" size="sm" disabled={!certificado} onClick={() => {
        if (!certificado) return;
        const url = URL.createObjectURL(new Blob([certificado], { type: "application/x-pem-file" }));
        const link = document.createElement("a"); link.href = url; link.download = "override.crt"; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
      }}><Download className="size-4" />Baixar override.crt</Button>
    </div>
    <div className="flex flex-wrap items-center gap-3 border-t border-border pt-4">
      <Button variant="outline" size="sm" disabled={ocupado} onClick={() => void executar(conectar)}><RefreshCw className="size-4" />Conectar QZ</Button>
    </div>
    <div className="max-w-md space-y-2"><Label htmlFor="impressora-zebra">Impressora da estação</Label>
      <Select value={impressora ?? ""} onValueChange={nome => { setImpressora(nome); salvarImpressora(nome); }} disabled={ocupado || !conectado || !impressoras.length}>
        <SelectTrigger id="impressora-zebra"><SelectValue placeholder="Selecionar impressora" /></SelectTrigger>
        <SelectContent>{impressoras.map(nome => <SelectItem key={nome} value={nome}>{nome}</SelectItem>)}</SelectContent>
      </Select>
    </div>
    <div className="flex flex-wrap gap-2">
      <Button variant="outline" size="sm" disabled={ocupado || !conectado || !impressora || !certificado} onClick={() => void executar(async () => {
        if (!impressora) return;
        await imprimirZpl(impressora, ZPL_TESTE); toast.success("Teste enviado à Zebra.");
      })}><Printer className="size-4" />Imprimir teste</Button>
      {ocupado && <Loader2 className="size-4 animate-spin self-center text-muted-foreground" />}
    </div>
    {erro && <p role="alert" className="break-words text-sm text-destructive">{erro}</p>}
    </CardContent>
  </Card>;
}