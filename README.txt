KRONIX STORE — INTEGRAÇÃO DE PEDIDOS E FORNECEDORES
===================================================

PREÇO OFICIAL
Cronus Zen: R$ 1.029,90 por unidade (102990 centavos).
O backend é a fonte de verdade do preço; o navegador não pode enviar outro preço.

O QUE FOI IMPLEMENTADO
- Backend Node.js + Express e banco SQLite persistente.
- Endpoint de registro de pedidos com validação no servidor.
- Checkout com endereço de entrega obrigatório, consentimento registrado e registro no backend.
- Painel administrativo em /admin com login, sessão HttpOnly, proteção CSRF e limitação de tentativas.
- Fila de pedidos, registro de atividades e estados de pagamento/fornecedor.
- Confirmação manual do recebimento pelo proprietário antes de aprovar.
- Cadastro de vínculos de produtos de fornecedores (Shopee, AliExpress, Mercado Livre e outros), com edição e exclusão pelo painel.
- Todo vínculo novo ou editado permanece com status “Aguardando conferência” até validação manual.
- Ferramenta administrativa para limpar pedidos de teste, protegida por confirmação digitada.
- Links de retorno do checkout apontam para a raiz do site e funcionam em localhost ou domínio publicado.
- Estrutura de conectores para Shopee, AliExpress, Mercado Livre e outros fornecedores.
- Bloqueio de compra quando a integração não tem credenciais, permissões ou operação de compra comprovadamente autorizada.
- Fluxo alternativo: o proprietário realiza a compra diretamente no marketplace e registra o identificador externo no painel; depois pode inserir o rastreio.

IMPORTANTE SOBRE O STATUS ATUAL DAS INTEGRAÇÕES
Este projeto NÃO está conectado às APIs e NÃO realiza compra automática real neste momento.
A Shopee Open Platform é orientada a operações da loja vendedora (pedidos, produtos, estoque e logística); não presumimos que permita comprar como consumidor.
A API do Mercado Livre consultada é voltada a operações da conta vendedora; não foi identificada uma API pública para finalizar compras como consumidor.
O AliExpress exige cadastro de desenvolvedor, aprovação da categoria da aplicação, credenciais e permissões específicas. O fluxo de dropshipping disponível precisa ser confirmado para a conta e o escopo concedido.
Os adaptadores retornam erro explícito e não simulam sucesso. Mesmo com credenciais preenchidas, a operação continua bloqueada até que um fluxo de compra oficial e permitido seja implementado e validado.

REQUISITOS
- Node.js 20 ou superior.
- Hospedagem com HTTPS e processo Node persistente (VPS, Render, Railway ou similar).
- Volume/disco persistente para server/db/kronix.sqlite.

INSTALAÇÃO LOCAL
1. Extraia o ZIP.
2. Abra um terminal na pasta do projeto.
3. Execute: npm install
4. Execute: npm run db:init
   Crie uma senha administrativa com pelo menos 12 caracteres. O script cria .env com hash e segredo aleatório.
5. Execute: npm start
6. Abra http://localhost:3000 para a loja.
7. Abra http://localhost:3000/admin para o painel.

PUBLICAÇÃO
- Configure NODE_ENV=production e BASE_URL com o domínio HTTPS.
- Nunca publique ou envie o arquivo .env ao Git, ao navegador ou ao cliente.
- Configure backup automático do arquivo server/db/kronix.sqlite.
- Restrinja acesso ao painel administrativo e use senha exclusiva e forte.
- O arquivo .env.example contém os nomes das variáveis de credenciais para futuras integrações.
- Credenciais e tokens devem ser armazenados apenas no servidor, idealmente em um gerenciador de segredos da hospedagem.

FLUXO OPERACIONAL ATUAL
1. Cliente envia pedido e endereço no checkout. O status inicial é "Aguardando pagamento".
2. O proprietário confere o recebimento no banco/provedor externo e marca pagamento como conferido no painel.
   Atenção: essa ação é manual; ainda não há gateway de pagamento conectado.
3. O pedido passa para "Aguardando aprovação".
4. Ao tentar aprovar com um conector sem suporte/permissão, o sistema informa que nenhuma compra foi feita.
5. Para operação manual, o proprietário compra na plataforma por conta própria e registra no painel o fornecedor e a referência do pedido externo.
6. Depois, registra o código de rastreamento.

ENDPOINTS PRINCIPAIS
GET  /api/health
POST /api/orders
POST /api/admin/login
GET  /api/admin/session
GET  /api/admin/orders
POST /api/admin/orders/:id/mark-paid
POST /api/admin/orders/:id/approve
POST /api/admin/orders/:id/reject
POST /api/admin/orders/:id/manual-supplier
POST /api/admin/orders/:id/tracking
GET  /api/admin/suppliers

DOCUMENTAÇÃO OFICIAL PARA CREDENCIAMENTO
Shopee: https://open.shopee.com/
AliExpress: https://developer.alibaba.com/
Mercado Livre: https://developers.mercadolivre.com.br/

PENDÊNCIAS ANTES DE VENDER COM PAGAMENTO ONLINE
- Habilitar a conta comercial PicPay API Pix, configurar credenciais e validar webhooks em ambiente de teste.
- Implementar fluxo de estorno/cancelamento e conciliação.
- Validar juridicamente e operacionalmente a política de dropshipping, impostos, prazos, devoluções e proteção de dados (LGPD).
- Obter acesso aprovado às APIs e confirmar que o escopo permite o tipo exato de operação pretendida.
- Implementar e testar cada conector com sandbox/testes antes de produção.

O sistema não marca automaticamente pagamento como recebido e não afirma que uma compra foi concluída sem confirmação real.

ATUALIZAÇÃO DO CHECKOUT — CUSTOS E CEP
--------------------------------------
O checkout do Cronus Zen apresenta os componentes separadamente:
- Produto Kronix Zen: R$ 1.029,90 por unidade.
- Frete internacional da cotação do fornecedor: R$ 69,41 por unidade.
- Imposto de Importação (federal): R$ 229,25 por unidade.
- ICMS (estadual): R$ 226,71 por unidade.
- Total de referência: R$ 1.555,27 por unidade.

Os valores de frete e tributos são os valores da cotação informada para esta versão e devem ser revisados quando o fornecedor, a operação de importação ou o destino mudar. O CEP consulta o ViaCEP pelo servidor e preenche logradouro, bairro, cidade e UF; número e complemento continuam sendo informados pelo cliente. A consulta de CEP não recalcula os impostos automaticamente.

Para iniciar em uma instalação limpa, instale as dependências com `npm install`, copie `.env.example` para `.env`, configure os segredos administrativos e execute `npm run db:init` conforme as instruções deste README. O arquivo `checkout copy.html` foi preservado sem alterações e não participa do checkout ativo.


PAGAMENTOS E TESTES (NOV/2026)
-----------------------------
O checkout calcula o total no servidor. O ICMS exibido é uma estimativa do RTS por UF, com alíquotas publicadas pelo COMSEFAZ; use somente após confirmar com contador/despachante que a operação da Kronix se enquadra no RTS. O Imposto de Importação continua usando a cotação informada pelo fornecedor (R$ 229,25 por unidade), pois a aplicação ainda não tem dados suficientes para determinar o regime de importação/Remessa Conforme.

Gateway real: integração Pix via PicPay API preparada no backend. Para ativar, habilite a API Pix no Painel Lojista PicPay, obtenha CLIENT_ID e CLIENT_SECRET e configure PICPAY_CLIENT_ID, PICPAY_CLIENT_SECRET e PICPAY_WEBHOOK_TOKEN no .env do servidor. Configure a URL HTTPS https://SEU-DOMINIO/api/payments/picpay/webhook no Painel Lojista. O token do webhook é gerado pelo PicPay ao ativar a URL de notificação. A integração real só fica ativa após credenciais válidas, liberação comercial e teste de cobrança/webhook. O checkout solicita CPF e celular com DDD porque a API Pix exige esses dados.

Teste de 1 centavo: habilite ENABLE_TEST_PIX=true somente em ambiente local/desenvolvimento (NODE_ENV=development). O checkbox aparece automaticamente em ambiente diferente de produção, exceto quando ENABLE_TEST_PIX=false. Ele gera um pedido de teste de R$ 0,01 e exibe QR Pix estático para a chave +5551983312299. Esse QR estático não envia confirmação automática ao servidor. Depois de verificar o crédito na conta bancária, o administrador confirma o teste no painel; o pedido muda para “Teste pago · sem compra” e é bloqueado contra encaminhamento a fornecedor. Em produção, NODE_ENV=production desativa o recurso independentemente da variável ENABLE_TEST_PIX.

O botão “Limpar pedidos (teste)” remove exclusivamente pedidos marcados como teste; pedidos reais permanecem intactos.

Instalação: copie .env.example para .env, preencha os segredos no servidor e execute npm install. O arquivo .env, o banco SQLite e node_modules não devem ser publicados no pacote de distribuição.
