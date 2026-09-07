// Selo de abrangência: até onde o processo vale.
// "Empresa inteira" ou os nomes das áreas/departamentos alvo.
import { Building2, Briefcase, Users } from "lucide-react";
import { Badge } from "@/components/ui/badge";

interface Tag {
  id: string;
  label: string;
}

export function SeloAbrangencia({
  abrangencia,
  areas = [],
  departamentos = [],
  limite,
}: {
  abrangencia: string | null | undefined;
  areas?: Tag[];
  departamentos?: Tag[];
  /** Quando informado, mostra só os N primeiros alvos e um "+N". */
  limite?: number;
}) {
  if (!abrangencia) return null;

  if (abrangencia === "empresa") {
    return (
      <Badge variant="outline" className="gap-1 border-primary/40 text-[10px] text-primary">
        <Building2 className="h-2.5 w-2.5" /> Empresa inteira
      </Badge>
    );
  }

  const alvos = abrangencia === "area" ? areas : departamentos;
  const Icone = abrangencia === "area" ? Briefcase : Users;

  if (alvos.length === 0) {
    return (
      <Badge variant="outline" className="gap-1 text-[10px] text-muted-foreground">
        <Icone className="h-2.5 w-2.5" />
        {abrangencia === "area" ? "Área não definida" : "Departamento não definido"}
      </Badge>
    );
  }

  const visiveis = limite ? alvos.slice(0, limite) : alvos;
  const restantes = alvos.length - visiveis.length;

  return (
    <>
      {visiveis.map((t) => (
        <Badge key={t.id} variant="outline" className="gap-1 text-[10px]">
          <Icone className="h-2.5 w-2.5" /> {t.label}
        </Badge>
      ))}
      {restantes > 0 && (
        <Badge variant="outline" className="text-[10px] text-muted-foreground">
          +{restantes}
        </Badge>
      )}
    </>
  );
}
