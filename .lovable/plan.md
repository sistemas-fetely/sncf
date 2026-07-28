Investigação read-only. Nada a alterar.

Respostas:

1. **Card/linha da oportunidade**: `src/pages/Comercial/Oportunidades.tsx` (a tabela é montada direto na página, sem componente separado).
2. **Tipo e leitura da view**: também em `src/pages/Comercial/Oportunidades.tsx` — não existe hook dedicado. A interface está na linha ~30 e a query `.from("vw_oportunidades_comercial")` está na linha 101.
3. **Campo `motivo`**: `src/pages/Comercial/Oportunidades.tsx` — declarado na **linha 30** e renderizado nas **linhas 252–254**.

Se quiser evoluir algo a partir disso (extrair hook, mudar renderização do `motivo`, etc.), me diga o objetivo que eu monto um plano.
