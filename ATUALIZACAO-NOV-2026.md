# Atualização Kronix Store — novembro de 2026

## Painel administrativo
- Os campos de seleção agora não são interceptados pelo manipulador de clique, permitindo abrir a lista normalmente.
- Cada pedido tem dois estados independentes: **Pedido feito na loja** e **Pedido feito ao fornecedor**, ambos com Sim/Não e gravação no SQLite.
- O código de rastreio continua liberado somente quando **Pedido feito na loja = Sim**.
- Ao salvar o código de rastreio, o pedido é marcado como enviado e o servidor dispara a notificação por e-mail.

## Checkout / pagamento
- Se as credenciais PicPay ou a configuração HTTPS pública necessária estiverem ausentes, o pedido é salvo como pagamento pendente de atendimento e o checkout exibe um botão de WhatsApp.
- Falhas de autenticação, geração de cobrança ou comunicação com o PicPay também encaminham o cliente ao atendimento, sem marcar o pagamento como confirmado.
- A mensagem do WhatsApp inclui código do pedido e e-mail informado no checkout.
- O checkout apresenta o link para o WhatsApp e tenta abrir a conversa automaticamente.

## E-mail de rastreamento
Para enviar e-mails de verdade, configure no `.env` do servidor: `RESEND_API_KEY` e `EMAIL_FROM`. O endereço remetente precisa estar validado no Resend. O modelo de configuração está em `.env.example`. Sem essas credenciais, o pedido e o código são salvos normalmente, mas o e-mail não pode ser enviado; a tentativa fica registrada na auditoria.

## Inicialização e porta 3000
Se `npm start` informar `EADDRINUSE`, a porta 3000 já está ocupada. No PowerShell: `netstat -ano | findstr :3000`, identifique o PID e encerre somente o processo correto com `taskkill /PID <PID> /F`. Depois execute `npm start`.

## Atualização do banco
A coluna `supplier_order_placed` é criada automaticamente na inicialização, sem apagar os pedidos existentes. Faça backup do arquivo SQLite antes de atualizar.
