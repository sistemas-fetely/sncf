const b64url = (b: Uint8Array) => btoa(String.fromCharCode(...b)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
export const aleatorio = (n = 48) => b64url(crypto.getRandomValues(new Uint8Array(n)));
export async function desafioS256(verifier: string) {
  return b64url(new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier))));
}
