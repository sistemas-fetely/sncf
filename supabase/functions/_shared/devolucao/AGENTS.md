# Devolução (shared)

- Devolution NF auto-transmission runs only through `_shared/devolucao/transmitir-nf-dev.ts` (durable reservation in `devolucao_nf_envio.envio_em` before the POST, never resent), gated by `fn_devolucao_nf_auto`, so the on/off switch lives in the database.
