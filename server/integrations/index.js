// Adaptadores deliberadamente fechados: nenhum pedido é enviado sem credenciais,
// escopos aprovados e implementação validada para o fluxo de compra permitido.
const providers = {
 shopee: {
  label: 'Shopee', docs: 'https://open.shopee.com/',
  readiness() { return Boolean(process.env.SHOPEE_PARTNER_ID && process.env.SHOPEE_PARTNER_KEY); },
  async placeOrder() { throw new Error('A Shopee Open Platform é voltada principalmente à gestão da loja vendedora. Não foi confirmada uma API pública autorizada para comprar como consumidor. Configure um fluxo permitido pela plataforma antes de habilitar.'); }
 },
 aliexpress: {
  label: 'AliExpress', docs: 'https://developer.alibaba.com/',
  readiness() { return Boolean(process.env.ALIEXPRESS_APP_KEY && process.env.ALIEXPRESS_APP_SECRET); },
  async placeOrder() { throw new Error('A aplicação AliExpress ainda não tem credenciais nem permissões aprovadas para o fluxo de pedido. A compra automática permanece bloqueada até validação do escopo de dropshipping.'); }
 },
 mercadolivre: {
  label: 'Mercado Livre', docs: 'https://developers.mercadolivre.com.br/',
  readiness() { return Boolean(process.env.MELI_CLIENT_ID && process.env.MELI_CLIENT_SECRET); },
  async placeOrder() { throw new Error('A API do Mercado Livre documenta recursos de gestão da conta vendedora; não foi identificada uma API pública para efetuar compras como consumidor. Use fluxo de fornecedor autorizado ou operação manual.'); }
 },
 other: {
  label: 'Outros fornecedores', docs: '',
  readiness() { return false; },
  async placeOrder() { throw new Error('Conector genérico ainda não configurado.'); }
 }
};
function getProvider(id) { return providers[id] || null; }
function publicStatus(id) {
 const p = providers[id];
 return { id, name: p.label, credentialsPresent: p.readiness(), status: p.readiness() ? 'credentials_present_not_validated' : 'not_configured', docs: p.docs };
}
module.exports = { getProvider, publicStatus, ids: Object.keys(providers) };
