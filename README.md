# Kronix Store

## Requisitos
- Node.js 22 LTS (faixa suportada pelo pacote: >=22 e <24). O projeto utiliza `better-sqlite3`; a versão 22 evita o problema de compilação nativa observado com Node 24 no ambiente Windows.
- Windows, Linux ou macOS.

## Primeira instalação
1. Copie `.env.example` para `.env`.
2. Execute `npm install`.
3. Execute `npm run db:init` para cadastrar a senha administrativa.
4. Execute `npm start`.
5. Acesse `http://localhost:3000` e `/admin`.

## Atualização preservando dados
1. Pare o servidor.
2. Faça cópia de `.env` e de `server/db/kronix.sqlite` (inclua os arquivos `-wal`/`-shm` se ainda existirem após o encerramento).
3. Extraia os arquivos novos sobre o projeto sem apagar `.env` e `server/db/kronix.sqlite`.
4. Execute `npm install`.
5. Como o `.env` enviado na versão anterior continha segredo de sessão e hash administrativo, recomendamos executar `npm run db:init`, definir uma nova senha administrativa e rotacionar o segredo. As demais variáveis do `.env` são preservadas e todas as sessões antigas são revogadas.
6. Execute `npm start`. As novas tabelas e índices são criados por migrações idempotentes na inicialização.

## Backup e restauração
- Backup automático: primeiro backup após iniciar e depois a cada `BACKUP_INTERVAL_HOURS` (padrão 24).
- Backup manual: painel administrativo ou `npm run backup`.
- Restaurar: pare o servidor e execute `npm run restore -- "server/backups/ARQUIVO.sqlite"`. O script valida integridade e guarda cópia do banco atual antes de substituir.
- Configure `BACKUP_DIR` em armazenamento persistente e externo à pasta pública. Mantenha também cópia fora do servidor.

## Segurança
- Nunca publique `.env`, banco de produção ou backups.
- Use HTTPS em produção e `NODE_ENV=production`.
- Configure segredos longos e únicos. Use `npm run db:init` para gerar novo hash de senha e segredo. Isso substitui as credenciais no `.env` e revoga todas as sessões administrativas existentes automaticamente.
- `TRUST_PROXY=true` somente quando houver proxy reverso confiável configurado.
- Teste em homologação antes de produção.

## Notificações por e-mail
A aplicação possui envio opcional via API Resend para pagamento confirmado, compra registrada, envio, entrega e rejeição. Configure `RESEND_API_KEY`, `EMAIL_FROM` com domínio verificado no provedor e `BASE_URL` HTTPS. Sem credenciais, pedidos continuam funcionando e a tentativa é registrada como ignorada.

## Pagamentos e fornecedores
O código implementa registro e validações internas, mas credenciais, documentação vigente, autorização de conta, formato de assinatura e callbacks do gateway devem ser confirmados com o PicPay. Nenhum pacote de código pode garantir pagamento real sem credenciais e teste real em HTTPS. Fornecedores permanecem em operação manual; conectores não realizam compra automática.

## E-mail de rastreamento em modo de teste
Consulte `CONFIGURAR-EMAIL-TESTE.md`. Em desenvolvimento, use `EMAIL_TEST_MODE=true` e defina `EMAIL_TEST_TO` com o endereço autorizado na sua conta Resend. Ao salvar o código de rastreio no painel, o servidor tentará enviar a mensagem de teste para esse endereço e informará o resultado.

## Fornecedor e referência por pedido
No painel operacional, cada pedido possui seleção de fornecedor, campo para referência externa e botão para salvar. A opção Sim/Não de compra realizada ao fornecedor permanece independente.
