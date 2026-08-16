export const UF_LIST = ["AC","AL","AM","AP","BA","CE","DF","ES","GO","MA","MG","MS","MT","PA","PB","PE","PI","PR","RJ","RN","RO","RR","RS","SC","SE","SP","TO"];

export const bancos = [
  { codigo: "001", nome: "Banco do Brasil" },
  { codigo: "033", nome: "Santander" },
  { codigo: "104", nome: "Caixa Econômica" },
  { codigo: "237", nome: "Bradesco" },
  { codigo: "341", nome: "Itaú Unibanco" },
  { codigo: "077", nome: "Inter" },
  { codigo: "260", nome: "Nubank" },
  { codigo: "336", nome: "C6 Bank" },
  { codigo: "290", nome: "PagSeguro" },
  { codigo: "380", nome: "PicPay" },
  { codigo: "756", nome: "Sicoob" },
  { codigo: "422", nome: "Safra" },
];

export const parentescos = [
  "Cônjuge", "Companheiro(a)", "Filho(a)", "Enteado(a)",
  "Pai", "Mãe", "Irmão(ã)", "Avô(ó)", "Outro",
];

export const statusStyles: Record<string, string> = {
  pendente: "bg-warning/10 text-warning border-0",
  email_enviado: "bg-info/10 text-info border-0",
  preenchido: "bg-success/10 text-success border-0",
  cadastrado: "bg-info/10 text-info border-0",
  expirado: "bg-muted text-muted-foreground border-0",
  cancelado: "bg-destructive/10 text-destructive border-0",
};
