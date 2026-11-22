# Teste de e-mail de rastreamento (Resend)

1. Crie/acesse sua conta em https://resend.com e gere uma API Key com permissão de envio.
2. Se uma chave já foi compartilhada em um arquivo, revogue-a e gere outra.
3. No `.env` local (não compartilhe nem envie esse arquivo), configure:

```env
RESEND_API_KEY=re_SUA_CHAVE_NOVA
EMAIL_FROM="Kronix Store <onboarding@resend.dev>"
EMAIL_API_URL=https://api.resend.com/emails
EMAIL_TEST_MODE=true
EMAIL_TEST_TO=seu-email-verificado-na-conta-resend@exemplo.com
```

4. `EMAIL_TEST_TO` deve ser o endereço permitido pela conta Resend para usar o remetente de teste `onboarding@resend.dev`.
5. Reinicie o servidor (`Ctrl+C` e `npm start`).
6. No painel administrativo, marque **Pedido feito na loja = Sim**, informe um código de rastreio e clique em **Salvar rastreamento**.
7. O servidor salva o rastreio e envia uma mensagem de teste para `EMAIL_TEST_TO`, com o assunto `[TESTE KRONIX]`. O corpo informa qual seria o e-mail do comprador. A resposta do painel informa se o envio ocorreu ou falhou; consulte também **Histórico/Auditoria**.

Enquanto `EMAIL_TEST_MODE=true`, o e-mail nunca é enviado ao endereço do comprador: ele é redirecionado para `EMAIL_TEST_TO`. Para produção, configure um domínio verificado no Resend e então use `EMAIL_TEST_MODE=false` e um remetente desse domínio.

## Fornecedor e referência

Cada cartão de pedido no painel operacional agora permite selecionar Shopee, AliExpress, Mercado Livre ou Outro fornecedor, informar a referência externa e salvar os dois campos sem usar janelas `prompt`. O campo **Pedido feito ao fornecedor (Sim/Não)** continua separado para registrar se a compra foi efetivamente realizada.
