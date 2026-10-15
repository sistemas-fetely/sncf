import { useEffect } from "react";

/** Rota legada: redireciona para /definir-senha preservando query string e hash. */
export default function ResetPassword() {
  useEffect(() => {
    window.location.replace(`/definir-senha${window.location.search}${window.location.hash}`);
  }, []);
  return null;
}
