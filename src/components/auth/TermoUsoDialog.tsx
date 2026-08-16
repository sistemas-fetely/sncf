import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Button } from "@/components/ui/button";
import { ShieldCheck } from "lucide-react";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  versao: string;
}

export function TermoUsoDialog({ open, onOpenChange, versao }: Props) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[80vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ShieldCheck className="h-5 w-5 text-primary" />
            Termo de Uso do Fetély — v{versao}
          </DialogTitle>
          <DialogDescription>
            Política interna de uso aceitável dos sistemas da Fetely.
          </DialogDescription>
        </DialogHeader>

        <ScrollArea className="flex-1 pr-4">
          <div className="space-y-5 text-sm text-foreground">
            <section>
              <h3 className="font-medium mb-1">1. O que é este termo</h3>
              <p className="text-muted-foreground leading-relaxed">
                Este termo define as regras de uso do <strong>Fetély</strong> e
                dos sistemas associados pela Fetely Comércio Importação e Exportação Ltda.
                Ao clicar em "Aceito", você confirma que leu, entendeu e concorda com as
                diretrizes abaixo.
              </p>
            </section>

            <section>
              <h3 className="font-medium mb-1">2. Uso aceitável</h3>
              <p className="text-muted-foreground leading-relaxed">Você se compromete a:</p>
              <ul className="list-disc list-inside text-muted-foreground space-y-1 mt-1 ml-2">
                <li>Acessar o sistema apenas para atividades relacionadas ao seu trabalho na Fetely</li>
                <li>Não compartilhar sua senha, acesso ou dispositivo autenticado com terceiros</li>
                <li>Não tentar acessar dados de outros colaboradores que estejam fora do seu escopo de atribuição</li>
                <li>Comunicar imediatamente ao RH qualquer suspeita de acesso indevido ou credenciais comprometidas</li>
                <li>Utilizar senha forte e alterá-la periodicamente conforme orientação</li>
              </ul>
            </section>

            <section>
              <h3 className="font-medium mb-1">3. Confidencialidade</h3>
              <p className="text-muted-foreground leading-relaxed">
                Todas as informações acessadas via Fetély são <strong>confidenciais</strong>,
                incluindo (sem limitação): dados pessoais de colaboradores, salários, benefícios,
                contratos, documentos fiscais, estratégias comerciais, e qualquer outra informação
                identificada como sensível. Você não deve reproduzir, transmitir, armazenar fora
                dos canais oficiais ou divulgar essas informações sem autorização expressa.
              </p>
            </section>

            <section>
              <h3 className="font-medium mb-1">4. Proteção de Dados Pessoais (LGPD)</h3>
              <p className="text-muted-foreground leading-relaxed">
                A Fetely trata seus dados pessoais de acordo com a Lei 13.709/2018 (LGPD), e você
                tem direito a: acessar seus dados, corrigi-los, solicitar exclusão quando aplicável,
                ser informado sobre tratamentos e portabilidade. Consultas por terceiros ao seu
                salário ou dados sensíveis são registradas em log e você pode visualizá-las em
                <strong> "Meus Acessos"</strong>. Para solicitações LGPD, contate o RH.
              </p>
            </section>

            <section>
              <h3 className="font-medium mb-1">5. Monitoramento e auditoria</h3>
              <p className="text-muted-foreground leading-relaxed">
                <strong>Todas as ações realizadas no sistema são registradas</strong> para fins de
                auditoria, compliance e segurança. Isso inclui acessos, consultas, alterações e
                tentativas de login. Os logs podem ser utilizados em investigações internas ou
                conforme exigência legal.
              </p>
            </section>

            <section>
              <h3 className="font-medium mb-1">6. Ativos corporativos</h3>
              <p className="text-muted-foreground leading-relaxed">
                Seu email corporativo, sistemas e equipamentos fornecidos pela Fetely são
                <strong> ativos da empresa</strong>. Na saída de colaborador, esses acessos são revogados
                imediatamente, e os equipamentos devem ser devolvidos em condição adequada.
              </p>
            </section>

            <section>
              <h3 className="font-medium mb-1">7. Consequências do descumprimento</h3>
              <p className="text-muted-foreground leading-relaxed">
                O descumprimento deste termo pode resultar em medidas disciplinares previstas
                em lei e nas normas internas da Fetely, incluindo revogação de acessos, advertência
                formal, ou, em casos graves, rescisão contratual por justa causa, além das sanções
                civis e penais cabíveis.
              </p>
            </section>

            <section>
              <h3 className="font-medium mb-1">8. Atualizações</h3>
              <p className="text-muted-foreground leading-relaxed">
                Este termo pode ser atualizado. Versões anteriores ficam arquivadas e você será
                solicitado a aceitar a nova versão quando necessário. A versão vigente é exibida
                no cabeçalho deste documento.
              </p>
            </section>

            <div className="pt-4 mt-4 border-t">
              <p className="text-xs text-muted-foreground italic">
                Versão {versao} — vigente desde abril de 2026. <em>Gesto não se delega, compromisso também não.</em>
              </p>
            </div>
          </div>
        </ScrollArea>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Fechar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
