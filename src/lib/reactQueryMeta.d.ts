import "@tanstack/react-query";

declare module "@tanstack/react-query" {
  interface Register {
    queryMeta: {
      /** Fora da invalidação global pós-mutation (ver src/lib/redeSeguranca.ts). */
      pesada?: boolean;
      [key: string]: unknown;
    };
  }
}
