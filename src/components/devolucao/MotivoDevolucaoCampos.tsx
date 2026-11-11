import type { ReactNode } from 'react';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectTrigger, SelectValue } from '@/components/ui/select';

export function DesfechoDevolucaoCampo({ value, onChange, children }: { value: string; onChange: (v: string) => void; children: ReactNode }) {
  return <div className="space-y-2"><Label>Desfecho para o cliente</Label><Select value={value} onValueChange={onChange}><SelectTrigger aria-label="Desfecho"><SelectValue placeholder="Escolha o desfecho" /></SelectTrigger><SelectContent>{children}</SelectContent></Select></div>;
}

export function MotivoDevolucaoCampos({ codigo, onCodigo, motivo, onMotivo, opcoes, children }: {
  codigo: string; onCodigo: (v: string) => void; motivo: string; onMotivo: (v: string) => void;
  opcoes: ReactNode; children?: ReactNode;
}) {
  return <div className="space-y-2"><Label>Motivo</Label>
    <Select value={codigo} onValueChange={onCodigo}><SelectTrigger aria-label="Motivo da devolução"><SelectValue placeholder="Escolha o motivo (recomendado)" /></SelectTrigger><SelectContent>{opcoes}</SelectContent></Select>
    {children}
    <Textarea aria-label="Descrição do motivo" value={motivo} onChange={e => onMotivo(e.target.value)} placeholder="Descreva o que aconteceu (mínimo 5 caracteres)" rows={3} />
  </div>;
}