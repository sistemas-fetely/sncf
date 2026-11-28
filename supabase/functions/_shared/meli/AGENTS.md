# _shared/meli

- Mercado Livre OAuth tokens are read/renewed only through `_shared/meli/token.ts` (`meliAccessToken`/`meliFetch`), with renewal reserved per account by `fn_meli_reservar_refresh` and the new pair saved by `fn_meli_gravar_tokens` before use, because the refresh token is single-use and a double refresh disconnects the store.
