import { Check } from "lucide-react";
import { cn } from "@/lib/utils";

const steps = [
  { label: "Dados Pessoais", number: 1 },
  { label: "Documentos", number: 2 },
  { label: "Profissional", number: 3 },
  { label: "Bancário", number: 4 },
  { label: "Dependentes", number: 5 },
  { label: "Anexos", number: 6 },
];

interface WizardStepsPJProps {
  currentStep: number;
}

export function WizardStepsPJ({ currentStep }: WizardStepsPJProps) {
  return (
    <nav className="flex items-center justify-between mb-8">
      {steps.map((step, i) => {
        const isCompleted = currentStep > step.number;
        const isCurrent = currentStep === step.number;
        return (
          <div key={step.number} className="flex items-center flex-1 last:flex-none">
            <div className="flex flex-col items-center gap-1.5">
              <div
                className={cn(
                  "flex h-9 w-9 items-center justify-center rounded-full text-sm font-medium transition-colors",
                  isCompleted && "bg-primary text-primary-foreground",
                  isCurrent && "bg-primary text-primary-foreground ring-4 ring-primary/20",
                  !isCompleted && !isCurrent && "bg-muted text-muted-foreground"
                )}
              >
                {isCompleted ? <Check className="h-4 w-4" /> : step.number}
              </div>
              <span
                className={cn(
                  "text-xs text-center hidden sm:block",
                  (isCurrent || isCompleted) ? "text-foreground font-medium" : "text-muted-foreground"
                )}
              >
                {step.label}
              </span>
            </div>
            {i < steps.length - 1 && (
              <div
                className={cn(
                  "flex-1 h-0.5 mx-2 mt-[-1rem] sm:mt-0",
                  isCompleted ? "bg-primary" : "bg-muted"
                )}
              />
            )}
          </div>
        );
      })}
    </nav>
  );
}
