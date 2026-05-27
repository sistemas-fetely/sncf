import { useState, useEffect } from "react";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

interface Props {
  value: number;
  onChange: (value: number) => void;
  placeholder?: string;
  disabled?: boolean;
  className?: string;
}

const fmt = (n: number) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(n || 0);

export function CurrencyInput({ value, onChange, className, ...rest }: Props) {
  const [display, setDisplay] = useState(fmt(value));

  useEffect(() => {
    setDisplay(fmt(value));
  }, [value]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const raw = e.target.value.replace(/\D/g, "");
    const num = Number(raw) / 100;
    setDisplay(fmt(num));
    onChange(num);
  };

  return (
    <Input
      value={display}
      onChange={handleChange}
      inputMode="numeric"
      className={cn(className)}
      {...rest}
    />
  );
}
