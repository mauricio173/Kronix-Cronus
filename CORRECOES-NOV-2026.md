# Correções do painel e acompanhamento — novembro de 2026

- O painel administrativo agora permite anexar comprovantes de pagamento em PNG, JPG, WEBP ou PDF (máximo de 5 MB). Os arquivos ficam em armazenamento local do servidor e a visualização exige sessão administrativa.
- O status financeiro pode ser alterado no próprio pedido: pendente, em análise, confirmado, recusado, expirado ou estornado. Pedidos de teste continuam usando a ação própria de confirmação de teste.
- As consultas administrativas e de acompanhamento usam respostas sem cache para refletir as alterações mais recentes.
- Ao desmarcar a compra na Kronix ou a compra no fornecedor, o sistema remove o rastreamento relacionado e recalcula a etapa do pedido. Assim, a página pública deixa de exibir "Pedido enviado" quando essa etapa foi desfeita.
- Os dois controles foram renomeados e receberam explicações: "Compra registrada na Kronix?" (libera o rastreamento) e "Compra efetivada com fornecedor?" (confirma a compra externa).
- Quando o checkout precisar encaminhar o cliente ao WhatsApp por não conseguir gerar o Pix automático, o WhatsApp é aberto em uma nova guia, preservando o checkout.

## Observações de implantação

- A coluna `payment_receipt_url` é criada automaticamente pela migração de banco já existente ao iniciar o servidor.
- A pasta `server/uploads` é criada automaticamente no primeiro início e deve ter permissão de escrita para o processo Node.js.
- Para validar em outro ambiente, execute `npm install` e `npm test`. Neste ambiente de edição, a suíte não pôde carregar o módulo nativo `better-sqlite3` incluído no ZIP original (binário incompatível com o sistema operacional); a verificação sintática dos arquivos JavaScript foi concluída sem erros.
