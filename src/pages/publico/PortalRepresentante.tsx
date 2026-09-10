import { useCallback, useEffect, useRef, useState } from "react";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { chamarPortal } from "@/lib/portal/api";
import { PortalPainel } from "@/components/portal/PortalPainel";

/**
 * Página pública do Portal do Representante — fora do layout interno do SNCF.
 * Sem sidebar, sem menu, sem link para dentro do sistema.
 *
 * A sessão vive só no estado do React: nada em localStorage/sessionStorage.
 */
export default function PortalRepresentante() {
  const [sessao, setSessao] = useState<string | null>(null);

  // Token da URL, lido uma única vez e imediatamente apagado do histórico.
  const tokenRef = useRef<string | null>(null);
  const [temToken, setTemToken] = useState(false);
  const [abrindo, setAbrindo] = useState(false);
  const [erroAbrir, setErroAbrir] = useState<string | null>(null);

  const [email, setEmail] = useState("");
  const [solicitando, setSolicitando] = useState(false);
  const [mensagemSolicitar, setMensagemSolicitar] = useState<string | null>(null);
  const [erroSolicitar, setErroSolicitar] = useState<string | null>(null);

  const [painel, setPainel] = useState<any | null>(null);
  const [carregandoPainel, setCarregandoPainel] = useState(false);
  const [erroPainel, setErroPainel] = useState<string | null>(null);

  useEffect(() => {
    const t = new URLSearchParams(window.location.search).get("t");
    if (t) {
      tokenRef.current = t;
      setTemToken(true);
      window.history.replaceState({}, "", window.location.pathname);
    }
  }, []);

  // ---------- abrir ----------
  useEffect(() => {
    const token = tokenRef.current;
    if (!token || sessao || abrindo) return;
    tokenRef.current = null;
    setAbrindo(true);
    setErroAbrir(null);
    chamarPortal("abrir", { token })
      .then((data: any) => {
        const s = data?.sessao ?? data?.token ?? null;
        if (!s) {
          setErroAbrir(data?.erro || "Este link não é mais válido.");
          return;
        }
        setSessao(s);
      })
      .catch((e) => setErroAbrir(e instanceof Error ? e.message : String(e)))
      .finally(() => setAbrindo(false));
  }, [sessao, abrindo, temToken]);

  // ---------- painel ----------
  const carregarPainel = useCallback(async (s: string) => {
    setCarregandoPainel(true);
    setErroPainel(null);
    try {
      const data = await chamarPortal("painel", { sessao: s });
      setPainel(data);
    } catch (e) {
      setErroPainel(e instanceof Error ? e.message : String(e));
    } finally {
      setCarregandoPainel(false);
    }
  }, []);

  useEffect(() => {
    if (sessao) void carregarPainel(sessao);
  }, [sessao, carregarPainel]);

  async function solicitar(e: React.FormEvent) {
    e.preventDefault();
    setErroSolicitar(null);
    if (!email.trim() || !email.includes("@")) {
      setErroSolicitar("Informe um e-mail válido.");
      return;
    }
    setSolicitando(true);
    try {
      const data: any = await chamarPortal("solicitar", { email: email.trim() });
      setMensagemSolicitar(data?.mensagem ?? null);
      toast.success("Solicitação enviada.");
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setErroSolicitar(msg);
      toast.error(msg);
    } finally {
      setSolicitando(false);
    }
  }

  async function sair() {
    const s = sessao;
    setSessao(null);
    setPainel(null);
    setMensagemSolicitar(null);
    if (!s) return;
    try {
      await chamarPortal("sair", { sessao: s });
      toast.success("Sessão encerrada.");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e));
    }
  }

  const moldura = (conteudo: React.ReactNode) => (
    <main className="flex min-h-screen items-center justify-center bg-background px-4 py-10">
      <div className="w-full max-w-sm space-y-4">
        <div className="space-y-1 text-center">
          <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">Fetély</p>
          <h1 className="text-xl font-medium tracking-tight">Portal do Representante</h1>
        </div>
        {conteudo}
      </div>
    </main>
  );

  // ---------- estado 2: abrindo ----------
  if (abrindo) {
    return moldura(
      <Card>
        <CardContent className="flex items-center gap-3 p-6">
          <Loader2 className="h-4 w-4 animate-spin" />
          <p className="text-sm text-muted-foreground">Abrindo seu acesso…</p>
        </CardContent>
      </Card>,
    );
  }

  if (erroAbrir && !sessao) {
    return moldura(
      <Card className="border-destructive/60">
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Não foi possível abrir o link</CardTitle>
          <CardDescription>{erroAbrir}</CardDescription>
        </CardHeader>
        <CardContent>
          <Button
            className="w-full"
            onClick={() => {
              setErroAbrir(null);
              setTemToken(false);
            }}
          >
            Pedir um link novo
          </Button>
        </CardContent>
      </Card>,
    );
  }

  // ---------- estado 3: painel ----------
  if (sessao) {
    if (carregandoPainel && !painel) {
      return moldura(
        <Card>
          <CardContent className="flex items-center gap-3 p-6">
            <Loader2 className="h-4 w-4 animate-spin" />
            <p className="text-sm text-muted-foreground">Carregando suas comissões…</p>
          </CardContent>
        </Card>,
      );
    }
    if (erroPainel && !painel) {
      return moldura(
        <Card className="border-destructive/60">
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Não foi possível carregar o painel</CardTitle>
            <CardDescription>{erroPainel}</CardDescription>
          </CardHeader>
          <CardContent className="flex gap-2">
            <Button className="flex-1" onClick={() => void carregarPainel(sessao)}>
              Tentar de novo
            </Button>
            <Button variant="outline" onClick={sair}>
              Sair
            </Button>
          </CardContent>
        </Card>,
      );
    }
    if (painel) {
      return (
        <main className="min-h-screen bg-background">
          {erroPainel && (
            <p className="bg-destructive/10 px-4 py-2 text-center text-xs text-destructive">
              Última atualização falhou: {erroPainel}
            </p>
          )}
          <PortalPainel
            sessao={sessao}
            painel={painel}
            onRecarregar={() => void carregarPainel(sessao)}
            onSair={sair}
          />
        </main>
      );
    }
  }

  // ---------- estado 1: pedir acesso ----------
  return moldura(
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base">Receber link de acesso</CardTitle>
        <CardDescription>
          Informe seu e-mail. Enviamos um link de acesso válido por 15 minutos e de uso único.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form className="space-y-3" onSubmit={solicitar}>
          <div className="space-y-1">
            <Label htmlFor="portal-email" className="text-xs">
              E-mail
            </Label>
            <Input
              id="portal-email"
              type="email"
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="voce@empresa.com.br"
            />
          </div>
          {erroSolicitar && <p className="text-xs text-destructive">{erroSolicitar}</p>}
          <Button type="submit" className="w-full" disabled={solicitando}>
            {solicitando ? "Enviando…" : "Receber link de acesso"}
          </Button>
          {mensagemSolicitar && (
            <p className="rounded-md bg-secondary p-3 text-xs text-secondary-foreground">
              {mensagemSolicitar}
            </p>
          )}
        </form>
      </CardContent>
    </Card>,
  );
}
