# Kronix Store — melhorias desta versão

## Incluído
- Bloqueio persistente de login após 5 falhas por IP (15 minutos), além do rate limit por janela; redefinição administrativa revoga sessões anteriores.
- Sessões com token CSRF reforçado, cookies HttpOnly/SameSite e verificação de Origin em mutações administrativas.
- Migrações SQLite idempotentes para tentativas, idempotência, eventos/transações de pagamento, histórico de status, histórico de custos e backups.
- Chave Idempotency-Key no checkout e recuperação de pedido existente para evitar duplicação por reenvio.
- Webhook PicPay com token Bearer configurado, verificação de merchantChargeId, payment_id e valor, registro idempotente de eventos, mapeamento de estados e expiração local de cobranças.
- Backup SQLite consistente automático (inicial + intervalo configurável), retenção e botão administrativo/manual CLI.
- Métricas administrativas, busca por pedido/cliente/e-mail e conciliação de eventos.
- Página de consulta de pedido por código + e-mail: /acompanhar-pedido.
- Página de políticas com privacidade, pedidos, envio, trocas/devoluções e atendimento (campos comerciais ainda exigem preenchimento pelo proprietário).
- Notificações automáticas opcionais por e-mail via Resend para pagamento, compra, envio, entrega e rejeição.
- Registro de comprovante HTTPS e previsão de entrega no fluxo de compra manual; status de pedido entregue.
- Registro de histórico de mudanças de status por trigger e histórico de custos de fornecedor.
- .env removido do pacote; .env.example seguro; node_modules, banco de dados e backups fora do pacote.

## Importante antes de produção
1. O pacote não inclui .env nem banco SQLite. Preserve seu banco atual e faça backup antes de substituir arquivos. As migrações são aplicadas ao iniciar.
2. O .env original do ZIP contém segredo de sessão e hash de senha; considere a sessão/credenciais comprometidas: gere nova senha com `npm run db:init`, altere segredos e encerre sessões existentes.
3. A integração PicPay ainda depende de credenciais aprovadas, endpoint/contrato oficial habilitado na conta e teste de ponta a ponta em HTTPS. O formato do webhook e OAuth deve ser confirmado com a documentação/conta PicPay; este pacote não declara transação real validada.
4. O header Authorization do webhook usa token estático configurado. Se a documentação do produto PicPay exigir assinatura HMAC, mTLS ou outro mecanismo, adapte ao mecanismo oficial antes de produção.
5. Configure BACKUP_DIR em volume persistente fora da pasta pública e teste restauração. Backups no mesmo disco não substituem cópia externa.
6. Configure `RESEND_API_KEY`, `EMAIL_FROM` e domínio verificado para habilitar e-mails; sem isso, notificações ficam desativadas.
7. Configure HTTPS, firewall, proxy confiável (TRUST_PROXY=true somente atrás de proxy conhecido), política de privacidade e retenção de dados.
8. Fornecedores permanecem manuais: não há API autorizada/validada de compra como consumidor. Aprovação não executa compra automaticamente.
9. O preço do Cronus Zen permanece R$ 1.029,90. Frete e tributos continuam estimativas da configuração atual; valide a tributação com contador e operação logística.

## Instalação
- Pare o servidor.
- Faça cópia de segurança da pasta atual, especialmente `.env` e `server/db/kronix.sqlite` (incluindo WAL/SHM após desligar corretamente o servidor).
- Extraia os arquivos deste ZIP sobre uma cópia do projeto, sem apagar `.env` nem `server/db/kronix.sqlite`.
- Rode `npm install` e `npm start`.
- Teste login, checkout de teste, reenvio com chave idempotente, consulta do pedido, backup e restauração em ambiente de homologação.
- Não habilite pagamentos reais até validar webhook e credenciais com o PicPay.

## Dashboard experimental e exclusão individual de pedidos de teste
- O painel administrativo original permanece disponível em `/admin` e mantém suas funções existentes.
- Foi criado um segundo painel visual independente em `/admin/dashboard`, inspirado na referência enviada, com resumo financeiro, indicadores de status, filtros por período/status, busca e tabela de pedidos.
- Os dois painéis usam a mesma autenticação administrativa e sessão protegida.
- Pedidos identificados como teste podem ser excluídos individualmente. A exclusão exige confirmação digitada e remove os registros relacionados; pedidos reais são bloqueados no servidor.
- O dashboard também permite limpar todos os pedidos de teste, preservando os pedidos reais.

## Fluxo de pagamento e gerenciamento individual (07/11/2026)

- Pedidos são registrados com status `awaiting_payment` e aparecem na fila administrativa assim que a cobrança Pix é gerada com sucesso.
- A confirmação automática permanece vinculada ao webhook autenticado do PicPay; quando o provedor confirma `PAID`, o pedido passa para `awaiting_owner_approval`.
- Se o webhook não chegar, o administrador pode usar **Marcar pagamento conferido**, após conferir o crédito no provedor/banco.
- A exclusão individual está disponível para pedidos reais e de teste, com confirmação explícita e remoção dos registros financeiros e históricos relacionados. A auditoria da exclusão permanece registrada.
- Rastreamento pode ser atualizado em pedidos já registrados no fornecedor ou enviados; a atualização dispara notificação por e-mail quando o serviço de e-mail está configurado.
- A previsão de entrega pode ser editada ou removida individualmente; a atualização também dispara e-mail quando configurado.

A confirmação automática depende de `PICPAY_WEBHOOK_TOKEN`, URL pública HTTPS e webhook corretamente configurado no painel PicPay. Sem webhook, a confirmação manual continua disponível.
