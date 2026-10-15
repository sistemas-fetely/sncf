/**
 * Converte mensagens de erro técnicas em mensagens amigáveis para o usuário.
 * Use sempre que for exibir error.message diretamente em toast/UI.
 */
export function humanizeError(raw: string | null | undefined): string {
  if (!raw) return "Algo deu errado. Tente novamente ou reporte o problema.";
  if (raw.includes("non-2xx"))
    return "O servidor encontrou um problema ao processar sua solicitação. Se o erro persistir, use o botão de report.";
  if (raw.includes("email") && raw.includes("not found"))
    return "E-mail não encontrado. Verifique se o e-mail corporativo foi cadastrado.";
  if (raw.includes("already registered") || raw.includes("already been registered"))
    return "Este e-mail já possui um usuário cadastrado.";
  const low = raw.toLowerCase();
  if (low.includes("session missing") || low.includes("auth session") || (low.includes("link") && low.includes("expired")) || low.includes("otp_expired"))
    return "Seu link de acesso expirou ou foi aberto em outro navegador. Peça um novo link.";
  if (low.includes("should be different from the old password") || low.includes("same_password"))
    return "A nova senha precisa ser diferente da anterior.";
  if (low.includes("pwned") || low.includes("known") && low.includes("password"))
    return `Esta senha aparece em vazamentos conhecidos. Escolha outra. ${REGRA_SENHA_TEXTO}`;
  if (low.includes("weak") || (low.includes("password") && low.includes("at least")))
    return `Senha fraca. ${REGRA_SENHA_TEXTO}`;
  if (raw.includes("JWT") || raw.includes("expired"))
    return "Sua sessão expirou. Faça login novamente.";
  if (low.includes("invalid login credentials"))
    return "E-mail ou senha incorretos.";
  if (raw.includes("duplicate key value violates unique constraint")) {
    if (raw.includes("uq_vinculo_ativo_por_pessoa"))
      return "Esta pessoa já tem um vínculo ativo. Encerre o vínculo atual antes de criar outro.";
    return "Este registro já existe.";
  }
  if (raw.includes("violates foreign key constraint"))
    return "Um dos itens selecionados não existe mais. Recarregue a tela.";
  if (raw.includes("violates check constraint"))
    return "Um dos valores preenchidos não é aceito neste campo.";
  if (raw.includes("violates row-level security"))
    return "Você não tem permissão para gravar este registro.";
  return raw;

}
