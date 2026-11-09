# NF substitute
- Keep creation/recovery in gerar.ts with injected Bling/register dependencies; this permits failure tests without creating real fiscal documents.
- Use only the existing service-role gate/data/register RPCs and shared Bling client; never transmit the draft or resend the order.