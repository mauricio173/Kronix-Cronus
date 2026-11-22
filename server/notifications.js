const db = require("./db");
const clean = (value) =>
  String(value ?? "")
    .replace(/[\r\n]/g, " ")
    .trim();
async function notifyOrder(orderId, event, extra = "") {
  const order = db
    .prepare(
      "SELECT id,product_name,email,customer_name,status,payment_status,tracking_code,expected_delivery_date FROM orders WHERE id=?",
    )
    .get(orderId);
  if (!order || !order.email)
    return { sent: false, reason: "missing_order_or_email" };
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.EMAIL_FROM;
  const testMode =
    String(process.env.EMAIL_TEST_MODE || "").toLowerCase() === "true";
  const testRecipient = clean(process.env.EMAIL_TEST_TO || "");
  const recipient = testMode && testRecipient ? testRecipient : order.email;
  if (!apiKey || !from || (testMode && !testRecipient)) {
    db.prepare(
      "INSERT INTO audit_log(order_id,action,details,created_at) VALUES(?,?,?,?)",
    ).run(
      orderId,
      "customer_notification_skipped",
      "Configure RESEND_API_KEY e EMAIL_FROM; em modo de teste, informe também EMAIL_TEST_TO.",
      new Date().toISOString(),
    );
    return { sent: false, reason: "email_not_configured" };
  }
  const base = String(process.env.BASE_URL || "").replace(/\/$/, "");
  const tracking = base ? `${base}/acompanhar-pedido` : "/acompanhar-pedido";
  const messages = {
    paid: [
      "Pagamento confirmado",
      `Olá, ${order.customer_name}. Recebemos a confirmação do pagamento do pedido ${order.id}. A Kronix fará a análise e seguirá com o processamento. Consulte: ${tracking}`,
    ],
    supplier_ordered: [
      "Compra do pedido registrada",
      `Olá, ${order.customer_name}. A compra referente ao pedido ${order.id} foi registrada. Previsão informada: ${order.expected_delivery_date || "a confirmar"}. Acompanhe: ${tracking}`,
    ],
    shipped: [
      "Compra confirmada e código de rastreio",
      `Olá, ${order.customer_name}. Sua compra do pedido ${order.id} foi confirmada e o pedido foi enviado. Código de rastreio: ${order.tracking_code || "não informado"}. Acompanhe a atualização: ${tracking}`,
    ],
    delivery_estimate_updated: [
      "Previsão de entrega atualizada",
      `Olá, ${order.customer_name}. A previsão de entrega do pedido ${order.id} foi atualizada para ${order.expected_delivery_date || "a confirmar"}. Consulte: ${tracking}`,
    ],
    delivered: [
      "Pedido marcado como entregue",
      `Olá, ${order.customer_name}. O pedido ${order.id} foi marcado como entregue. Em caso de divergência, entre em contato com o atendimento da Kronix Store.`,
    ],
    rejected: [
      "Atualização do pedido",
      `Olá, ${order.customer_name}. O pedido ${order.id} teve uma atualização. Consulte a situação e entre em contato com a Kronix Store se precisar de ajuda: ${tracking}`,
    ],
    expired: [
      "Cobrança expirada",
      `Olá, ${order.customer_name}. A cobrança do pedido ${order.id} expirou. Consulte o atendimento da Kronix Store para receber orientação sobre uma nova tentativa.`,
    ],
    refunded: [
      "Atualização de pagamento",
      `Olá, ${order.customer_name}. O pagamento do pedido ${order.id} foi marcado como estornado ou contestado pelo provedor. Consulte o atendimento da Kronix Store.`,
    ],
    declined: [
      "Pagamento não aprovado",
      `Olá, ${order.customer_name}. O pagamento do pedido ${order.id} não foi aprovado. Consulte o atendimento da Kronix Store para verificar as opções disponíveis.`,
    ],
  };
  const message = messages[event];
  if (!message) return { sent: false, reason: "unknown_event" };
  try {
    const response = await fetch(
      process.env.EMAIL_API_URL || "https://api.resend.com/emails",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          from,
          to: [recipient],
          subject: `${testMode ? "[TESTE KRONIX] " : ""}${message[0]}`,
          text: `${testMode ? `MODO DE TESTE: esta notificação seria enviada para ${order.email}.\n\n` : ""}${message[1]}`,
        }),
        signal: AbortSignal.timeout(10000),
      },
    );
    const result = await response.json().catch(() => ({}));
    if (!response.ok)
      throw new Error(
        `Email API HTTP ${response.status}: ${clean(result.message || result.name || "falha").slice(0, 160)}`,
      );
    db.prepare(
      "INSERT INTO audit_log(order_id,action,details,created_at) VALUES(?,?,?,?)",
    ).run(
      orderId,
      "customer_notification_sent",
      `${event}; destino ${recipient}; ${testMode ? "modo de teste; " : ""}${clean(result.id || "id indisponível")}`,
      new Date().toISOString(),
    );
    return { sent: true };
  } catch (error) {
    db.prepare(
      "INSERT INTO audit_log(order_id,action,details,created_at) VALUES(?,?,?,?)",
    ).run(
      orderId,
      "customer_notification_failed",
      `${event}; ${clean(error.message).slice(0, 220)}`,
      new Date().toISOString(),
    );
    return { sent: false, reason: error.message };
  }
}
module.exports = { notifyOrder };
