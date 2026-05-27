import { Badge } from "@/components/ui/badge";
import { AlertTriangle, Clock, Shield, TrendingUp, UsersRound, CheckCircle2 } from "lucide-react";

interface BadgesContextuaisProps {
  parceiro: {
    bandeira_vermelha?: boolean;
    bandeira_vermelha_motivo?: string | null;
    cadastro_incompleto?: boolean;
    grupo_economico_id?: string | null;
  };
  analisesAnteriores?: Array<{
    status_final: string | null;
    decidido_em: string | null;
  }>;
  kpisGrupo?: { vencidos: number } | null;
  valorPedido?: number;
}

export function BadgesContextuais({
  parceiro,
  analisesAnteriores = [],
  kpisGrupo,
}: BadgesContextuaisProps) {
  const badges: JSX.Element[] = [];

  if (parceiro.bandeira_vermelha) {
    badges.push(
      <Badge key="bv" variant="destructive" className="gap-1" title={parceiro.bandeira_vermelha_motivo || undefined}>
        <AlertTriangle className="h-3 w-3" />
        Bandeira Vermelha
      </Badge>
    );
  }

  const temAnalisesAnteriores = analisesAnteriores.some((a) => a.status_final !== null);
  if (!temAnalisesAnteriores) {
    badges.push(
      <Badge key="novo" variant="secondary" className="gap-1">
        <Shield className="h-3 w-3" />
        Cliente novo
      </Badge>
    );
  }

  const cooldown = analisesAnteriores.find((a) => {
    if (a.status_final !== "reprovado" || !a.decidido_em) return false;
    const dias = (Date.now() - new Date(a.decidido_em).getTime()) / 86_400_000;
    return dias < 90;
  });
  if (cooldown) {
    const dias = Math.floor((Date.now() - new Date(cooldown.decidido_em!).getTime()) / 86_400_000);
    badges.push(
      <Badge key="cooldown" variant="destructive" className="gap-1">
        <Clock className="h-3 w-3" />
        Cooldown ({dias}d)
      </Badge>
    );
  }

  if (parceiro.cadastro_incompleto) {
    badges.push(
      <Badge key="cad" variant="outline" className="gap-1 border-amber-500 text-amber-700">
        <AlertTriangle className="h-3 w-3" />
        Cadastro incompleto
      </Badge>
    );
  }

  if (parceiro.grupo_economico_id && kpisGrupo && kpisGrupo.vencidos > 0) {
    badges.push(
      <Badge key="grupo" variant="outline" className="gap-1 border-amber-500 text-amber-700">
        <UsersRound className="h-3 w-3" />
        Grupo c/ vencidos
      </Badge>
    );
  }

  if (badges.length === 0) {
    return (
      <Badge variant="outline" className="gap-1 border-emerald-500 text-emerald-700">
        <CheckCircle2 className="h-3 w-3" />
        Sem alertas
      </Badge>
    );
  }

  return <div className="flex flex-wrap gap-2">{badges}</div>;
}
