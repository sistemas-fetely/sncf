import { Link } from "react-router-dom";
import { Upload } from "lucide-react";
import { ImportadorNFs } from "@/components/financeiro/ImportadorNFs";
import { PageShell } from "@/components/layout/PageShell";
import { PageHeader } from "@/components/layout/PageHeader";

export default function ImportarDados() {
  return (
    <PageShell>
      <PageHeader
        titulo="Importar NFs"
        icone={Upload}
        estado="Importe notas fiscais por CSV (Qive), XML ou PDF."
      />

      <ImportadorNFs />

      <p className="text-xs text-muted-foreground border-l-2 border-muted pl-3">
        Importação de extratos, relatórios bancários e faturas de cartão foi centralizada em{" "}
        <Link
          to="/administrativo/extrato-importacao"
          className="text-admin hover:underline font-medium"
        >
          Importar Extratos
        </Link>
        .
      </p>
    </PageShell>
  );
}
