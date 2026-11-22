require("dotenv").config();
const express = require("express");
const helmet = require("helmet");
const rateLimit = require("express-rate-limit");
const crypto = require("node:crypto");
const path = require("node:path");
const db = require("./db");
const {
  createSession,
  requireAdmin,
  destroySession,
  safeEqual,
} = require("./security");
const integrations = require("./integrations");
const backups = require("./backup");
const notifications = require("./notifications");
const app = express();
const PORT = Number(process.env.PORT || 3000);
const PRODUCT = {
  id: "cronus-zen",
  name: "Cronus Zen",
  unitPrice: 102990,
  supplierCost: 60799,
  supplierFreight: 6941,
  importTax: 22925,
};
// Alíquotas de ICMS para remessas internacionais no RTS, conforme tabela COMSEFAZ.
// A estimativa só é válida quando a operação realmente se enquadrar no RTS.
const RTS_ICMS_RATE = {
  AC: 20,
  AL: 20,
  AM: 17,
  AP: 18,
  BA: 20,
  CE: 20,
  DF: 17,
  ES: 17,
  GO: 17,
  MA: 17,
  MG: 17,
  MS: 17,
  MT: 17,
  PA: 17,
  PB: 20,
  PE: 17,
  PI: 20,
  PR: 17,
  RJ: 17,
  RN: 20,
  RO: 17,
  RR: 20,
  RS: 17,
  SC: 17,
  SE: 20,
  SP: 17,
  TO: 17,
};
const roundMoney = (n) => Math.round(n);
const orderAmounts = (quantity, state) => {
  const rate = RTS_ICMS_RATE[String(state || "").toUpperCase()];
  if (!rate) throw new Error("Informe uma UF válida para estimar o ICMS.");
  const productSubtotal = PRODUCT.unitPrice * quantity;
  const supplierFreight = PRODUCT.supplierFreight * quantity;
  const importTax = PRODUCT.importTax * quantity; // valor de II informado na cotação do fornecedor
  const importBaseWithII =
    (PRODUCT.supplierCost + PRODUCT.supplierFreight + PRODUCT.importTax) *
    quantity;
  const icmsTax = roundMoney((importBaseWithII * rate) / (100 - rate));
  return {
    productSubtotal,
    supplierFreight,
    importTax,
    icmsTax,
    taxRate: rate,
    total: productSubtotal + supplierFreight + importTax + icmsTax,
  };
};
app.disable("x-powered-by");
if (process.env.TRUST_PROXY === "true") app.set("trust proxy", 1);
app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
        fontSrc: ["'self'", "https://fonts.gstatic.com"],
        imgSrc: ["'self'", "data:", "https:"],
        scriptSrc: ["'self'"],
        connectSrc: ["'self'"],
      },
    },
  }),
);
app.use(express.json({ limit: "30kb" }));
app.use(express.urlencoded({ extended: false, limit: "10kb" }));
app.use(
  "/api/",
  rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 180,
    standardHeaders: true,
    legacyHeaders: false,
  }),
);
const publicRoot = path.join(__dirname, "..");
app.use("/css", express.static(path.join(publicRoot, "css")));
app.use("/js", express.static(path.join(publicRoot, "js")));
app.use("/assets", express.static(path.join(publicRoot, "assets")));
app.use("/admin/static", express.static(path.join(publicRoot, "admin")));
app.get("/", (_req, res) => res.sendFile(path.join(publicRoot, "index.html")));
app.get("/checkout.html", (_req, res) =>
  res.sendFile(path.join(publicRoot, "checkout.html")),
);
const adminLimiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: 8, standardHeaders: true, legacyHeaders: false, message: { error: "Muitas tentativas. Aguarde e tente novamente." } });
const now = () => new Date().toISOString();
// Reabre pedidos interrompidos por reinício durante a etapa de encaminhamento.
db.prepare("DELETE FROM sessions WHERE expires_at<=?").run(Date.now());
db.prepare("DELETE FROM login_attempts WHERE updated_at<?").run(new Date(Date.now() - 7 * 86400000).toISOString());
db.prepare(
  "UPDATE orders SET status='supplier_setup_required', updated_at=? WHERE status='processing_supplier'",
).run(now());
const log = (orderId, action, details = "") =>
  db
    .prepare(
      "INSERT INTO audit_log(order_id,action,details,created_at) VALUES(?,?,?,?)",
    )
    .run(orderId, action, details, now());
const clean = (v) => String(v ?? "").trim();
const validEmail = (v) => typeof v === "string" && v.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);
const validCPF = (value) => {
  const cpf = String(value || "").replace(/\D/g, "");
  if (!/^\d{11}$/.test(cpf) || /^(\d)\1{10}$/.test(cpf)) return false;
  const digit = (length) => { let sum = 0; for (let i = 0; i < length; i++) sum += Number(cpf[i]) * (length + 1 - i); const rest = (sum * 10) % 11; return rest === 10 ? 0 : rest; };
  return digit(9) === Number(cpf[9]) && digit(10) === Number(cpf[10]);
};

app.get("/api/health", (_req, res) => res.json({
  ok: true,
  product: { id: PRODUCT.id, name: PRODUCT.name, unitPrice: PRODUCT.unitPrice },
  integrations: integrations.ids.map(integrations.publicStatus),
}));
app.get("/api/config", (_req, res) =>
  res.json({
    testPixEnabled:
      process.env.NODE_ENV !== "production" &&
      process.env.ENABLE_TEST_PIX !== "false",
    paymentGateway:
      process.env.PICPAY_CLIENT_ID && process.env.PICPAY_CLIENT_SECRET
        ? "picpay"
        : null,
  }),
);
app.get("/api/quote/:state", (req, res) => {
  const qty = Number(req.query.quantity || 1);
  if (!Number.isInteger(qty) || qty < 1 || qty > 5)
    return res.status(400).json({ error: "Quantidade inválida." });
  try {
    res.json({
      amounts: orderAmounts(qty, clean(req.params.state).toUpperCase()),
    });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});
app.get("/api/cep/:cep", async (req, res) => {
  const cep = clean(req.params.cep).replace(/\D/g, "");
  if (!/^\d{8}$/.test(cep))
    return res
      .status(400)
      .json({ error: "Informe um CEP válido com 8 números." });
  try {
    const response = await fetch(`https://viacep.com.br/ws/${cep}/json/`, {
      signal: AbortSignal.timeout(5000),
    });
    if (!response.ok)
      return res
        .status(502)
        .json({
          error:
            "O serviço de consulta de CEP está indisponível. Preencha o endereço manualmente.",
        });
    const data = await response.json();
    if (data.erro)
      return res
        .status(404)
        .json({
          error:
            "CEP não encontrado. Confira o número ou preencha o endereço manualmente.",
        });
    res.set("Cache-Control", "public, max-age=86400");
    res.json({
      postalCode: data.cep || cep,
      street: data.logradouro || "",
      neighborhood: data.bairro || "",
      city: data.localidade || "",
      state: data.uf || "",
      complement: data.complemento || "",
    });
  } catch (_) {
    res
      .status(502)
      .json({
        error:
          "Não foi possível consultar o CEP agora. Preencha o endereço manualmente.",
      });
  }
});
const orderCreationLimiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: 8, standardHeaders: true, legacyHeaders: false, message: { error: "Muitas tentativas de checkout. Aguarde alguns minutos." } });
app.post("/api/orders", orderCreationLimiter, async (req, res) => {
  const b = req.body || {};
  const idemKey = clean(req.get("Idempotency-Key"));
  if (!/^[A-Za-z0-9._:-]{16,128}$/.test(idemKey)) return res.status(400).json({ error: "Chave de idempotência ausente ou inválida. Reenvie a solicitação pelo checkout." });
  const requestHash = crypto.createHash("sha256").update(JSON.stringify(b)).digest("hex");
  const previous = db.prepare("SELECT i.request_hash,i.order_id,o.* FROM idempotency_keys i JOIN orders o ON o.id=i.order_id WHERE i.key=?").get(idemKey);
  if (previous) {
    if (previous.request_hash !== requestHash) return res.status(409).json({ error: "Esta chave já foi utilizada com dados diferentes. Atualize o checkout." });
    if (previous.payment_qr_code) return res.status(200).json({ orderId: previous.id, total: previous.total, status: previous.status, testMode: previous.is_test === 1, amounts: { productSubtotal: previous.product_subtotal, supplierFreight: previous.supplier_freight, importTax: previous.import_tax, icmsTax: previous.icms_tax, taxRate: previous.tax_rate, total: previous.total }, pix: { qrCode: previous.payment_qr_code, qrBase64: previous.payment_qr_base64 || null, qrImage: previous.is_test ? "/assets/pix-teste-001.png" : undefined }, message: "Pedido recuperado. Não foi criada uma segunda cobrança." });
    return res.status(409).json({ error: "O pedido já existe, mas a cobrança precisa ser reconciliada. Entre em contato com a loja informando o código " + previous.id + ".", orderId: previous.id });
  }
  const required = [
    "name",
    "email",
    "postalCode",
    "street",
    "streetNumber",
    "neighborhood",
    "city",
    "state",
  ];
  if (!/^\d{5}-?\d{3}$/.test(clean(b.postalCode)))
    return res
      .status(400)
      .json({ error: "Informe um CEP válido com 8 números." });
  if (clean(b.productId) !== PRODUCT.id)
    return res.status(400).json({ error: "Produto inválido." });
  if (b.termsAccepted !== true)
    return res
      .status(400)
      .json({
        error:
          "É necessário aceitar o uso dos dados para processar a solicitação.",
      });
  if (required.some((k) => !clean(b[k])) || !validEmail(clean(b.email)) || clean(b.name).length < 2 || clean(b.name).length > 100 || clean(b.street).length > 160 || clean(b.streetNumber).length > 30 || clean(b.complement).length > 100 || clean(b.neighborhood).length > 100 || clean(b.city).length > 100 || clean(b.state).length !== 2 || clean(b.phone).length > 30 || clean(b.platform).length > 40)
    return res
      .status(400)
      .json({ error: "Confira os dados obrigatórios e o e-mail." });
  const testMode = b.testMode === true;
  const cpf = clean(b.cpf).replace(/\D/g, "");
  const phoneDigits = clean(b.phone).replace(/\D/g, "");
  if (!testMode && (!validCPF(cpf) || !/^\d{10,11}$/.test(phoneDigits)))
    return res
      .status(400)
      .json({
        error:
          "Informe CPF válido (11 números) e celular com DDD para gerar o Pix PicPay.",
      });
  const qty = Number(b.quantity);
  if (!Number.isInteger(qty) || qty < 1 || qty > 5)
    return res.status(400).json({ error: "Quantidade inválida." });
  if (clean(b.name).length > 100 || clean(b.notes).length > 600)
    return res
      .status(400)
      .json({ error: "Algum campo excede o limite permitido." });
  const state = clean(b.state).toUpperCase();
  if (
    testMode &&
    !(
      process.env.NODE_ENV !== "production" &&
      process.env.ENABLE_TEST_PIX !== "false"
    )
  )
    return res
      .status(403)
      .json({ error: "O pagamento de teste está desativado." });
  if (
    !testMode &&
    (!process.env.PICPAY_CLIENT_ID ||
      !process.env.PICPAY_CLIENT_SECRET ||
      !process.env.PICPAY_WEBHOOK_TOKEN)
  )
    return res
      .status(503)
      .json({
        error:
          "O PicPay ainda não está configurado. Cadastre as credenciais e o token de webhook no .env do servidor. Nenhuma cobrança foi criada.",
      });
  if (
    !testMode &&
    process.env.NODE_ENV === "production" &&
    !String(process.env.BASE_URL || "").startsWith("https://")
  )
    return res
      .status(503)
      .json({
        error:
          "Configure BASE_URL com o endereço HTTPS público da loja antes de receber pagamentos.",
      });
  let amounts;
  try {
    amounts = testMode
      ? {
          productSubtotal: 1,
          supplierFreight: 0,
          importTax: 0,
          icmsTax: 0,
          taxRate: RTS_ICMS_RATE[state] || 0,
          total: 1,
        }
      : orderAmounts(qty, state);
  } catch (err) {
    return res.status(400).json({ error: err.message });
  }
  const id = `KX-${Date.now().toString(36).toUpperCase()}-${crypto.randomBytes(12).toString("hex").toUpperCase()}`;
  const total = amounts.total;
  const stamp = now();
  try {
    db.transaction(() => {
    db.prepare(
      `INSERT INTO orders(id,product_id,product_name,unit_price,quantity,total,product_subtotal,supplier_freight,import_tax,icms_tax,tax_rate,is_test,customer_name,email,phone,platform,notes,postal_code,street,street_number,complement,neighborhood,city,state,consent_at,payment_status,status,created_at,updated_at)
   VALUES(@id,@product_id,@product_name,@unit_price,@quantity,@total,@product_subtotal,@supplier_freight,@import_tax,@icms_tax,@tax_rate,@is_test,@customer_name,@email,@phone,@platform,@notes,@postal_code,@street,@street_number,@complement,@neighborhood,@city,@state,@consent_at,'pending','awaiting_payment',@created_at,@updated_at)`,
    ).run({
      id,
      product_id: PRODUCT.id,
      product_name: PRODUCT.name,
      unit_price: testMode ? 1 : PRODUCT.unitPrice,
      quantity: testMode ? 1 : qty,
      total,
      product_subtotal: amounts.productSubtotal,
      supplier_freight: amounts.supplierFreight,
      import_tax: amounts.importTax,
      icms_tax: amounts.icmsTax,
      tax_rate: amounts.taxRate,
      is_test: testMode ? 1 : 0,
      customer_name: clean(b.name),
      email: clean(b.email).toLowerCase(),
      phone: clean(b.phone),
      platform: clean(b.platform),
      notes: clean(b.notes),
      postal_code: clean(b.postalCode),
      street: clean(b.street),
      street_number: clean(b.streetNumber),
      complement: clean(b.complement),
      neighborhood: clean(b.neighborhood),
      city: clean(b.city),
      state,
      consent_at: stamp,
      created_at: stamp,
      updated_at: stamp,
    });
    db.prepare("INSERT INTO idempotency_keys(key,request_hash,order_id,created_at) VALUES(?,?,?,?)").run(idemKey, requestHash, id, stamp);
    })();
    if (testMode) {
      const qrPayload =
        "00020101021226360014BR.GOV.BCB.PIX0114+555198331229952040000530398654040.015802BR5912KRONIX STORE6012PORTO ALEGRE62070503***6304972D";
      db.prepare("UPDATE orders SET payment_provider='pix-static-test',payment_qr_code=? WHERE id=?").run(qrPayload, id);
      db.prepare("INSERT INTO payment_transactions(order_id,provider,payment_id,amount,status,provider_response,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?)").run(id, "pix-static-test", null, 1, "pending", JSON.stringify({ simulationOnly: true }), now(), now());
      log(
        id,
        "test_order_created",
        "Pedido de teste de R$ 0,01. QR estático Pix; confirmar manualmente após verificar o crédito.",
      );
      return res
        .status(201)
        .json({
          orderId: id,
          total: 1,
          amounts,
          status: "awaiting_payment",
          testMode: true,
          pix: {
            qrCode: qrPayload,
            qrImage: "/assets/pix-teste-001.png",
            key: "+5551983312299",
            amount: "0.01",
          },
          message:
            "Pedido de teste criado. O pagamento será confirmado no painel somente após conferir o crédito de R$ 0,01.",
        });
    }
    const apiBase = String(
      process.env.PICPAY_API_BASE_URL ||
        "https://api.picpay.com/ecommerce/public/v1",
    ).replace(/\/$/, "");
    const tokenResponse = await fetch("https://api.picpay.com/oauth2/token", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify({
        grant_type: "client_credentials",
        client_id: process.env.PICPAY_CLIENT_ID,
        client_secret: process.env.PICPAY_CLIENT_SECRET,
      }),
      signal: AbortSignal.timeout(15000),
    });
    const tokenData = await tokenResponse.json().catch(() => ({}));
    if (!tokenResponse.ok || !tokenData.access_token) {
      db.prepare(
        "UPDATE orders SET status='payment_setup_error',updated_at=? WHERE id=?",
      ).run(now(), id);
      log(
        id,
        "picpay_auth_error",
        `PicPay OAuth HTTP ${tokenResponse.status}.`,
      );
      return res
        .status(502)
        .json({
          error:
            "Não foi possível autenticar no PicPay. Confira as credenciais da API.",
        });
    }
    const digits = phoneDigits;
    const chargeResponse = await fetch(`${apiBase}/charge/pix`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${tokenData.access_token}`,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify({
        paymentSource: "GATEWAY",
        merchantChargeId: id,
        customer: {
          name: clean(b.name),
          email: clean(b.email).toLowerCase(),
          documentType: "CPF",
          document: cpf,
          phone: {
            countryCode: "55",
            areaCode: digits.slice(0, 2),
            number: digits.slice(2),
            type: "MOBILE",
          },
        },
        transactions: [{ amount: total, pix: { expiration: 900 } }],
        deviceInformation: {
          ip: String(req.ip || req.socket.remoteAddress || "").slice(0, 64),
          ipCountryCode: "BRA",
          ipRegion: state,
          ipCity: clean(b.city),
        },
      }),
      signal: AbortSignal.timeout(20000),
    });
    const charge = await chargeResponse.json().catch(() => ({}));
    const tx = Array.isArray(charge.transactions)
      ? charge.transactions.find((t) => t.paymentType === "PIX") ||
        charge.transactions[0]
      : null;
    const qrCode = tx?.pix?.qrCode;
    const qrBase64 = tx?.pix?.qrCodeBase64;
    if (
      !chargeResponse.ok ||
      !charge.id ||
      !qrCode ||
      Number(charge.amount) !== total
    ) {
      db.prepare(
        "UPDATE orders SET status='payment_setup_error',updated_at=? WHERE id=?",
      ).run(now(), id);
      log(
        id,
        "picpay_charge_error",
        `PicPay charge HTTP ${chargeResponse.status}: ${clean(charge.message || charge.businessCode || "resposta sem QR Code ou valor divergente").slice(0, 180)}`,
      );
      return res
        .status(502)
        .json({
          error:
            "O PicPay não gerou a cobrança com o valor exato do pedido. Nenhuma cobrança foi considerada válida.",
        });
    }
    const expiresAt = new Date(Date.now() + 15 * 60 * 1000).toISOString();
    db.prepare("UPDATE orders SET payment_provider='picpay',payment_id=?,payment_qr_code=?,payment_qr_base64=?,payment_expires_at=?,updated_at=? WHERE id=?").run(String(charge.id), qrCode, qrBase64 || null, expiresAt, now(), id);
    db.prepare("INSERT INTO payment_transactions(order_id,provider,payment_id,amount,status,provider_response,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?)").run(id, "picpay", String(charge.id), total, "pending", JSON.stringify(charge).slice(0,20000), now(), now());
    log(
      id,
      "picpay_pix_created",
      `PicPay charge ${charge.id}; valor ${total} centavos.`,
    );
    res
      .status(201)
      .json({
        orderId: id,
        total,
        amounts,
        status: "awaiting_payment",
        testMode: false,
        pix: {
          qrCode,
          qrBase64: qrBase64 || null,
          paymentId: String(charge.id),
        },
        message:
          "Pix PicPay gerado. O pedido será liberado somente após confirmação autenticada do webhook.",
      });
  } catch (err) {
    console.error("Falha ao criar pedido/pagamento:", err);
    res
      .status(502)
      .json({
        error:
          "Não foi possível gerar o pagamento agora. Nenhuma confirmação foi registrada.",
      });
  }
});

app.get("/api/orders/:id/payment-status", (req, res) => {
  const order = db
    .prepare("SELECT id,payment_status,status,is_test FROM orders WHERE id=?")
    .get(clean(req.params.id));
  if (!order) return res.status(404).json({ error: "Pedido não encontrado." });
  res.set("Cache-Control", "no-store");
  res.json({
    orderId: order.id,
    paymentStatus: order.payment_status,
    status: order.status,
    isTest: order.is_test === 1,
  });
});
app.post("/api/payments/picpay/webhook", (req, res) => {
  const expected = process.env.PICPAY_WEBHOOK_TOKEN;
  const supplied = clean(req.headers.authorization).replace(/^Bearer\s+/i, "");
  if (!expected || !supplied || !safeEqual(expected, supplied)) return res.sendStatus(401);
  try {
    const data = req.body?.data || req.body || {};
    const merchantChargeId = clean(data.merchantChargeId);
    const paymentId = clean(data.id || data.chargeId || req.body?.id);
    const eventKey = clean(req.body?.eventId || req.body?.id || `${merchantChargeId}:${data.status}:${data.amount}`);
    const order = db.prepare("SELECT * FROM orders WHERE id=?").get(merchantChargeId);
    const payload = JSON.stringify(req.body || {}).slice(0, 20000);
    const amount = Number(data.amount);
    const status = clean(data.status).toUpperCase();
    const eventInsert = db.prepare(`INSERT OR IGNORE INTO payment_events(provider,event_key,order_id,payment_id,event_status,amount,payload_json,processing_status,received_at)
      VALUES('picpay',?,?,?,?,?,?,'received',?)`).run(eventKey, order?.id || null, paymentId || null, status, Number.isFinite(amount) ? amount : null, payload, now());
    if (!eventInsert.changes) return res.sendStatus(200);
    if (!order || order.is_test || order.payment_provider !== "picpay" || !paymentId || paymentId !== String(order.payment_id) || amount !== order.total) {
      db.prepare("UPDATE payment_events SET processing_status='ignored',error=?,processed_at=? WHERE id=?").run("Pedido, cobrança ou valor não corresponde ao registro interno.", now(), eventInsert.lastInsertRowid);
      return res.sendStatus(200);
    }
    let nextPayment = null, nextStatus = order.status;
    if (status === "PAID") { nextPayment = "paid"; nextStatus = "awaiting_owner_approval"; }
    else if (["DENIED", "ERROR"].includes(status)) nextPayment = "declined";
    else if (["CANCELED", "EXPIRED"].includes(status)) nextPayment = "expired";
    else if (["REFUNDED", "CHARGEBACK"].includes(status)) nextPayment = "refunded";
    else if (["IN_ANALYSIS", "UNDER_REVIEW"].includes(status)) nextPayment = "under_review";
    else if (status === "PENDING") nextPayment = "pending";
    if (nextPayment) {
      // Evita que notificações atrasadas façam um pagamento confirmado voltar para pendente/recusado.
      if (order.payment_status === "refunded" || (order.payment_status === "paid" && nextPayment !== "refunded")) {
        db.prepare("UPDATE payment_events SET processing_status='ignored',error=?,processed_at=? WHERE id=?").run("Evento antigo ou incompatível com o estado financeiro atual.", now(), eventInsert.lastInsertRowid);
        return res.sendStatus(200);
      }
      if (nextPayment === "paid" && ["expired", "declined"].includes(order.payment_status)) {
        nextPayment = "under_review";
        nextStatus = order.status;
      }
      db.transaction(() => {
        db.prepare("UPDATE orders SET payment_status=?,status=?,updated_at=? WHERE id=?").run(nextPayment, nextStatus, now(), order.id);
        db.prepare("INSERT INTO payment_transactions(order_id,provider,payment_id,amount,status,provider_response,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?)")
          .run(order.id, "picpay", paymentId, amount, nextPayment, payload, now(), now());
        db.prepare("UPDATE payment_events SET processing_status='processed',processed_at=? WHERE id=?").run(now(), eventInsert.lastInsertRowid);
        log(order.id, "payment_webhook_" + nextPayment, `Evento PicPay ${eventKey}; cobrança ${paymentId}; valor ${amount} centavos.`);
      })();
      if (["paid", "expired", "refunded", "declined"].includes(nextPayment)) notifications.notifyOrder(order.id, nextPayment).catch(() => {});
    } else {
      db.prepare("UPDATE payment_events SET processing_status='ignored',error=?,processed_at=? WHERE id=?").run("Status de pagamento não mapeado.", now(), eventInsert.lastInsertRowid);
    }
    res.sendStatus(200);
  } catch (err) {
    console.error("Webhook PicPay:", err);
    res.sendStatus(500);
  }
});

app.post("/api/test-payments/:id/simulate-paid", (req, res) => {
  if (
    process.env.NODE_ENV === "production" ||
    process.env.ENABLE_TEST_PIX === "false"
  )
    return res.sendStatus(404);
  const order = db
    .prepare("SELECT * FROM orders WHERE id=?")
    .get(clean(req.params.id));
  if (
    !order ||
    order.is_test !== 1 ||
    order.total !== 1 ||
    order.payment_provider !== "pix-static-test"
  )
    return res.status(404).json({ error: "Pedido de teste não encontrado." });
  if (order.payment_status === "paid")
    return res.status(409).json({ error: "Pagamento de teste já simulado." });
  const changed = db
    .prepare(
      "UPDATE orders SET payment_status='paid',status='test_paid',updated_at=? WHERE id=? AND is_test=1 AND payment_status!='paid'",
    )
    .run(now(), order.id);
  if (changed.changes) {
    db.prepare("UPDATE payment_transactions SET status='paid',updated_at=? WHERE order_id=? AND provider='pix-static-test'").run(now(), order.id);
    log(
      order.id,
      "test_payment_simulated",
      "Pagamento de teste simulado como aprovado; nenhum dinheiro foi movimentado.",
    );
  }
  res.json({
    ok: true,
    orderId: order.id,
    status: "test_paid",
    message: "Pagamento de teste simulado como aprovado. Atualize o painel.",
  });
});
app.post("/api/admin/login", adminLimiter, (req, res) => {
  const identity = crypto.createHash("sha256").update(String(req.ip || req.socket.remoteAddress || "unknown")).digest("hex");
  const attempt = db.prepare("SELECT * FROM login_attempts WHERE identity=?").get(identity);
  if (attempt && attempt.blocked_until > Date.now()) return res.status(429).json({ error: "Acesso temporariamente bloqueado. Tente novamente em alguns minutos." });
  const configured = process.env.ADMIN_PASSWORD_HASH;
  if (
    !configured ||
    !process.env.SESSION_SECRET ||
    process.env.SESSION_SECRET.length < 32
  )
    return res
      .status(503)
      .json({
        error:
          "Configure ADMIN_PASSWORD_HASH e SESSION_SECRET no arquivo .env antes de acessar o painel.",
      });
  const password = clean(req.body?.password);
  const actual = crypto
    .scryptSync(password, process.env.SESSION_SECRET, 64)
    .toString("hex");
  if (!safeEqual(actual, configured)) {
    const stamp = now();
    const failures = attempt && Date.now() - attempt.window_started_at < 15 * 60 * 1000 ? attempt.failures + 1 : 1;
    const blockedUntil = failures >= 5 ? Date.now() + 15 * 60 * 1000 : 0;
    db.prepare(`INSERT INTO login_attempts(identity,failures,window_started_at,blocked_until,updated_at) VALUES(?,?,?,?,?)
      ON CONFLICT(identity) DO UPDATE SET failures=excluded.failures,window_started_at=excluded.window_started_at,blocked_until=excluded.blocked_until,updated_at=excluded.updated_at`)
      .run(identity, failures, failures === 1 ? Date.now() : attempt.window_started_at, blockedUntil, stamp);
    return res.status(blockedUntil ? 429 : 401).json({ error: blockedUntil ? "Muitas tentativas. Acesso bloqueado por 15 minutos." : "Senha incorreta." });
  }
  db.prepare("DELETE FROM login_attempts WHERE identity=?").run(identity);
  const csrfToken = createSession(res);
  res.json({ ok: true, csrfToken });
});
app.get("/api/admin/session", requireAdmin, (req, res) =>
  res.json({ ok: true, csrfToken: req.adminSession.csrf_token }),
);
app.post("/api/admin/logout", requireAdmin, (req, res) => {
  destroySession(req, res);
  res.json({ ok: true });
});
const supplierHosts = {
  shopee: ["shopee.com.br", "www.shopee.com.br"],
  aliexpress: ["aliexpress.com", "www.aliexpress.com", "pt.aliexpress.com"],
  mercadolivre: [
    "mercadolivre.com.br",
    "www.mercadolivre.com.br",
    "produto.mercadolivre.com.br",
  ],
};
function parseSupplierProduct(body) {
  const supplier = clean(body?.supplier);
  const productId = clean(body?.productId);
  const rawUrl = clean(body?.url);
  if (!["shopee", "aliexpress", "mercadolivre", "other"].includes(supplier))
    return { error: "Selecione um fornecedor válido." };
  if (productId !== PRODUCT.id) return { error: "Produto da Kronix inválido." };
  let parsed;
  try {
    parsed = new URL(rawUrl);
  } catch (_) {
    return { error: "Informe um link de produto válido." };
  }
  if (parsed.protocol !== "https:" || parsed.username || parsed.password)
    return { error: "O link deve ser HTTPS e não pode conter credenciais." };
  if (
    supplier !== "other" &&
    !supplierHosts[supplier].includes(parsed.hostname.toLowerCase())
  )
    return {
      error: "O domínio do link não corresponde ao fornecedor selecionado.",
    };
  let itemId = "";
  if (supplier === "shopee") {
    const m = parsed.pathname.match(/(?:product\/)?(\d+)\/(\d+)/);
    if (m) itemId = `${m[1]}-${m[2]}`;
  } else {
    const m = parsed.pathname.match(/(?:item\/)?(\d{8,})/);
    if (m) itemId = m[1];
  }
  if (!itemId)
    itemId = parsed.pathname.replace(/\/$/, "").slice(-180) || parsed.hostname;
  if (body?.deliveryDays != null && body.deliveryDays !== "" && (!Number.isInteger(Number(body.deliveryDays)) || Number(body.deliveryDays) < 1 || Number(body.deliveryDays) > 365)) return { error: "Prazo estimado deve ser entre 1 e 365 dias." };
  return {
    supplier,
    productId,
    supplierUrl: `${parsed.origin}${parsed.pathname}`,
    itemId,
    title: clean(body?.title).slice(0, 180) || null,
    deliveryDays: body?.deliveryDays === "" || body?.deliveryDays == null ? null : Number(body.deliveryDays),
    conditions: clean(body?.conditions).slice(0, 500) || null,
  };
}
app.get("/api/admin/supplier-products", requireAdmin, (_req, res) => {
  const products = db.prepare("SELECT * FROM supplier_products ORDER BY created_at DESC").all().map(product => ({
    ...product,
    costHistory: db.prepare("SELECT old_cost,new_cost,note,changed_at FROM supplier_cost_history WHERE supplier_product_id=? ORDER BY id DESC LIMIT 10").all(product.id),
  }));
  res.json({ products });
});
app.post("/api/admin/supplier-products", requireAdmin, (req, res) => {
  const parsed = parseSupplierProduct(req.body);
  if (parsed.error) return res.status(400).json({ error: parsed.error });
  try {
    const stamp = now();
    const result = db
      .prepare(
        `INSERT INTO supplier_products
   (product_id,supplier,supplier_url,supplier_item_id,supplier_title,supplier_cost,status,created_at,updated_at,estimated_delivery_days,conditions)
   VALUES (?,?,?,?,?,?, 'pending_review',?,?,?,?)`,
      )
      .run(
        parsed.productId,
        parsed.supplier,
        parsed.supplierUrl,
        parsed.itemId,
        parsed.title,
        null,
        stamp,
        stamp,
        parsed.deliveryDays,
        parsed.conditions,
      );
    log(
      null,
      "supplier_product_linked",
      `${parsed.supplier} ${parsed.itemId} vinculado ao produto ${parsed.productId}; aguardando conferência.`,
    );
    res
      .status(201)
      .json({
        ok: true,
        id: result.lastInsertRowid,
        status: "pending_review",
        message: "Produto vinculado e marcado como Aguardando conferência.",
      });
  } catch (err) {
    if (String(err.code).includes("SQLITE_CONSTRAINT"))
      return res
        .status(409)
        .json({ error: "Este item do fornecedor já está cadastrado." });
    throw err;
  }
});
app.put("/api/admin/supplier-products/:id", requireAdmin, (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isSafeInteger(id) || id < 1)
    return res.status(400).json({ error: "Identificador inválido." });
  const current = db
    .prepare("SELECT * FROM supplier_products WHERE id=?")
    .get(id);
  if (!current)
    return res.status(404).json({ error: "Vínculo não encontrado." });
  const parsed = parseSupplierProduct(req.body);
  if (parsed.error) return res.status(400).json({ error: parsed.error });
  try {
    db.prepare(
      `UPDATE supplier_products SET product_id=?,supplier=?,supplier_url=?,supplier_item_id=?,
   supplier_title=?,status='pending_review',updated_at=?,estimated_delivery_days=?,conditions=? WHERE id=?`,
    ).run(
      parsed.productId,
      parsed.supplier,
      parsed.supplierUrl,
      parsed.itemId,
      parsed.title,
      now(),
      parsed.deliveryDays,
      parsed.conditions,
      id,
    );
    log(
      null,
      "supplier_product_updated",
      `Vínculo #${id} atualizado; voltou para Aguardando conferência.`,
    );
    res.json({
      ok: true,
      message: "Vínculo atualizado e retornou para Aguardando conferência.",
    });
  } catch (err) {
    if (String(err.code).includes("SQLITE_CONSTRAINT"))
      return res
        .status(409)
        .json({
          error: "Já existe outro vínculo com esse item do fornecedor.",
        });
    throw err;
  }
});
app.post(
  "/api/admin/supplier-products/:id/review",
  requireAdmin,
  (req, res) => {
    const id = Number(req.params.id),
      decision = clean(req.body?.decision);
    const cost = Number(req.body?.supplierCost),
      note = clean(req.body?.note).slice(0, 500);
    if (!Number.isSafeInteger(id) || id < 1)
      return res.status(400).json({ error: "Identificador inválido." });
    if (!["approved", "rejected"].includes(decision))
      return res.status(400).json({ error: "Decisão inválida." });
    if (decision === "approved" && (!Number.isSafeInteger(cost) || cost < 1))
      return res
        .status(400)
        .json({ error: "Informe o custo do fornecedor em centavos." });
    const product = db
      .prepare("SELECT * FROM supplier_products WHERE id=?")
      .get(id);
    if (!product)
      return res.status(404).json({ error: "Vínculo não encontrado." });
    db.transaction(() => {
      if (decision === "approved" && Number(product.supplier_cost) !== cost) db.prepare("INSERT INTO supplier_cost_history(supplier_product_id,old_cost,new_cost,note,changed_at) VALUES(?,?,?,?,?)").run(id, product.supplier_cost, cost, note, now());
      db.prepare("UPDATE supplier_products SET status=?,supplier_cost=?,updated_at=? WHERE id=?").run(decision, decision === "approved" ? cost : product.supplier_cost, now(), id);
    })();
    log(
      null,
      decision === "approved"
        ? "supplier_product_approved"
        : "supplier_product_rejected",
      `Vínculo #${id} ${decision}. ${note}`,
    );
    res.json({
      ok: true,
      message:
        decision === "approved" ? "Vínculo aprovado." : "Vínculo rejeitado.",
    });
  },
);
app.delete("/api/admin/supplier-products/:id", requireAdmin, (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isSafeInteger(id) || id < 1)
    return res.status(400).json({ error: "Identificador inválido." });
  const result = db.prepare("DELETE FROM supplier_products WHERE id=?").run(id);
  if (!result.changes)
    return res.status(404).json({ error: "Vínculo não encontrado." });
  log(null, "supplier_product_deleted", `Vínculo #${id} removido.`);
  res.json({ ok: true, message: "Vínculo removido." });
});
app.get("/api/admin/orders", requireAdmin, (req, res) => {
  const orders = db
    .prepare("SELECT * FROM orders ORDER BY created_at DESC LIMIT 250")
    .all();
  res.json({
    orders,
    audit: db.prepare("SELECT * FROM audit_log ORDER BY id DESC LIMIT 120").all(),
    history: db.prepare("SELECT * FROM order_status_history ORDER BY id DESC LIMIT 300").all(),
  });
});
app.delete("/api/admin/orders/:id", requireAdmin, (req, res) => {
  if (clean(req.body?.confirmation) !== "EXCLUIR PEDIDO") {
    return res.status(400).json({ error: 'Confirmação inválida. Digite EXCLUIR PEDIDO.' });
  }
  const order = db.prepare("SELECT id,is_test FROM orders WHERE id=?").get(req.params.id);
  if (!order) return res.status(404).json({ error: "Pedido não encontrado." });
  const tx = db.transaction(() => {
    db.prepare("DELETE FROM payment_transactions WHERE order_id=?").run(order.id);
    db.prepare("DELETE FROM idempotency_keys WHERE order_id=?").run(order.id);
    db.prepare("DELETE FROM order_status_history WHERE order_id=?").run(order.id);
    db.prepare("DELETE FROM payment_events WHERE order_id=?").run(order.id);
    db.prepare("DELETE FROM audit_log WHERE order_id=?").run(order.id);
    db.prepare("DELETE FROM orders WHERE id=?").run(order.id);
    log(null, "order_deleted", `Pedido ${order.id} (${order.is_test ? 'TESTE' : 'REAL'}) removido individualmente pelo administrador.`);
  });
  tx();
  res.json({ ok: true, message: "Pedido removido individualmente." });
});
app.delete("/api/admin/orders", requireAdmin, (req, res) => {
  if (clean(req.body?.confirmation) !== "LIMPAR PEDIDOS")
    return res
      .status(400)
      .json({
        error: "Confirmação inválida. Digite LIMPAR PEDIDOS para continuar.",
      });
  const count = db
    .prepare("SELECT COUNT(*) AS total FROM orders WHERE is_test=1")
    .get().total;
  const tx = db.transaction(() => {
    db.prepare("DELETE FROM payment_transactions WHERE order_id IN (SELECT id FROM orders WHERE is_test=1)").run();
    db.prepare("DELETE FROM idempotency_keys WHERE order_id IN (SELECT id FROM orders WHERE is_test=1)").run();
    db.prepare("DELETE FROM order_status_history WHERE order_id IN (SELECT id FROM orders WHERE is_test=1)").run();
    db.prepare("DELETE FROM payment_events WHERE order_id IN (SELECT id FROM orders WHERE is_test=1)").run();
    db.prepare("DELETE FROM audit_log WHERE order_id IN (SELECT id FROM orders WHERE is_test=1)").run();
    db.prepare("DELETE FROM orders WHERE is_test=1").run();
    log(
      null,
      "test_orders_cleared",
      `${count} pedido(s) de teste apagado(s); pedidos reais foram preservados.`,
    );
  });
  tx();
  res.json({
    ok: true,
    deleted: count,
    message: `${count} pedido(s) removido(s).`,
  });
});
app.post(
  "/api/admin/orders/:id/confirm-test-payment",
  requireAdmin,
  (req, res) => {
    const order = db
      .prepare("SELECT * FROM orders WHERE id=?")
      .get(req.params.id);
    if (!order)
      return res.status(404).json({ error: "Pedido não encontrado." });
    if (
      order.is_test !== 1 ||
      order.total !== 1 ||
      order.payment_provider !== "pix-static-test"
    )
      return res
        .status(403)
        .json({ error: "Ação exclusiva para pedido Pix de teste de R$ 0,01." });
    if (order.payment_status === "paid")
      return res
        .status(409)
        .json({ error: "Pagamento de teste já confirmado." });
    db.prepare("UPDATE orders SET payment_status='paid',status='test_paid',updated_at=? WHERE id=?").run(now(), order.id);
    db.prepare("UPDATE payment_transactions SET status='paid',updated_at=? WHERE order_id=? AND provider='pix-static-test'").run(now(), order.id);
    log(
      order.id,
      "test_payment_confirmed",
      "Administrador confirmou manualmente o recebimento do Pix de teste após conferência bancária.",
    );
    res.json({
      ok: true,
      message:
        "Pagamento de teste confirmado; pedido enviado à fila de aprovação.",
    });
  },
);
app.post("/api/admin/orders/:id/mark-paid", requireAdmin, (req, res) => {
  const order = db
    .prepare("SELECT * FROM orders WHERE id=?")
    .get(req.params.id);
  if (!order) return res.status(404).json({ error: "Pedido não encontrado." });
  if (order.is_test === 1)
    return res
      .status(403)
      .json({
        error: "Pedidos de teste devem usar a confirmação específica de teste.",
      });
  if (order.status !== "awaiting_payment")
    return res
      .status(409)
      .json({ error: "O pedido não está aguardando pagamento." });
  db.prepare("UPDATE orders SET payment_status='paid', status='awaiting_owner_approval', updated_at=? WHERE id=?").run(now(), order.id);
  db.prepare("UPDATE payment_transactions SET status='paid',updated_at=? WHERE order_id=? AND status IN ('pending','under_review')").run(now(), order.id);
  notifications.notifyOrder(order.id, 'paid').catch(() => {});
  log(
    order.id,
    "payment_marked_paid",
    "Confirmação manual do proprietário; verificar comprovante no provedor de pagamento.",
  );
  res.json({
    ok: true,
    message:
      "Pagamento marcado como conferido manualmente. Confira o recebimento no seu provedor antes de aprovar.",
  });
});
app.post("/api/admin/orders/:id/approve", requireAdmin, async (req, res) => {
  const order = db
    .prepare("SELECT * FROM orders WHERE id=?")
    .get(req.params.id);
  if (!order) return res.status(404).json({ error: "Pedido não encontrado." });
  if (order.is_test === 1)
    return res
      .status(403)
      .json({
        error: "Pedido de teste não pode ser encaminhado a fornecedor.",
      });
  if (
    order.payment_status !== "paid" ||
    order.status !== "awaiting_owner_approval"
  )
    return res
      .status(409)
      .json({
        error:
          "Somente pedidos reais com pagamento confirmado podem ser aprovados.",
      });
  const supplier = clean(req.body?.supplier);
  const provider = integrations.getProvider(supplier);
  const approvedLink = db
    .prepare(
      "SELECT id FROM supplier_products WHERE product_id=? AND supplier=? AND status='approved' ORDER BY updated_at DESC LIMIT 1",
    )
    .get(order.product_id, supplier);
  if (!approvedLink)
    return res
      .status(409)
      .json({
        error: "Vínculo do fornecedor ainda não foi conferido e aprovado.",
      });
  if (!provider)
    return res.status(400).json({ error: "Selecione um fornecedor válido." });
  const claimed = db
    .prepare(
      "UPDATE orders SET status='processing_supplier',supplier=?,updated_at=? WHERE id=? AND status='awaiting_owner_approval' AND payment_status='paid'",
    )
    .run(supplier, now(), order.id);
  if (!claimed.changes)
    return res
      .status(409)
      .json({
        error: "Este pedido já está sendo processado ou mudou de status.",
      });
  if (!provider.readiness()) {
    db.prepare(
      "UPDATE orders SET status='supplier_setup_required',updated_at=? WHERE id=?",
    ).run(now(), order.id);
    log(
      order.id,
      "supplier_not_configured",
      `Fornecedor ${provider.label}; credenciais ausentes.`,
    );
    return res
      .status(409)
      .json({
        error: `Integração ${provider.label} ainda não configurada. Nenhuma compra foi realizada. Use o fluxo manual ou conclua o credenciamento.`,
        purchaseMade: false,
      });
  }
  try {
    // O adaptador não executa compras enquanto a API não tiver fluxo de compra documentado e aprovado.
    const result = await provider.placeOrder(order);
    db.prepare(
      "UPDATE orders SET status='supplier_ordered',supplier=?,supplier_order_id=?,approved_at=?,updated_at=? WHERE id=?",
    ).run(supplier, result.orderId, now(), now(), order.id);
    log(
      order.id,
      "supplier_order_created",
      `Fornecedor ${supplier}; referência ${result.orderId}`,
    );
    res.json({ ok: true, result });
  } catch (err) {
    db.prepare(
      "UPDATE orders SET status='supplier_setup_required',supplier=?,updated_at=? WHERE id=?",
    ).run(supplier, now(), order.id);
    log(order.id, "supplier_api_blocked", `${supplier}: ${err.message}`);
    res.status(409).json({ error: err.message, purchaseMade: false });
  }
});
app.post("/api/admin/orders/:id/reject", requireAdmin, (req, res) => {
  const order = db
    .prepare("SELECT * FROM orders WHERE id=?")
    .get(req.params.id);
  if (!order) return res.status(404).json({ error: "Pedido não encontrado." });
  const reason = clean(req.body?.reason).slice(0, 300);
  db.prepare(
    "UPDATE orders SET status='rejected',rejection_reason=?,updated_at=? WHERE id=?",
  ).run(reason, now(), order.id);
  log(order.id, "order_rejected", reason);
  notifications.notifyOrder(order.id, 'rejected').catch(() => {});
  res.json({ ok: true });
});
app.post("/api/admin/orders/:id/manual-supplier", requireAdmin, (req, res) => {
  const order = db
    .prepare("SELECT * FROM orders WHERE id=?")
    .get(req.params.id);
  if (!order) return res.status(404).json({ error: "Pedido não encontrado." });
  if (order.is_test === 1)
    return res
      .status(403)
      .json({
        error: "Pedido de teste não pode ser encaminhado a fornecedor.",
      });
  if (
    order.payment_status !== "paid" ||
    !["awaiting_owner_approval", "supplier_setup_required"].includes(
      order.status,
    )
  )
    return res
      .status(409)
      .json({
        error: "Pedido precisa estar pago e aguardando encaminhamento.",
      });
  const supplier = clean(req.body?.supplier);
  const ref = clean(req.body?.supplierOrderId).slice(0, 120);
  const receiptUrl = clean(req.body?.receiptUrl);
  const expectedDeliveryDate = clean(req.body?.expectedDeliveryDate);
  if (receiptUrl) { try { const u = new URL(receiptUrl); if (u.protocol !== 'https:' || u.username || u.password) throw new Error(); } catch (_) { return res.status(400).json({ error: 'Comprovante deve ser um link HTTPS válido.' }); } }
  if (expectedDeliveryDate && !/^\d{4}-\d{2}-\d{2}$/.test(expectedDeliveryDate)) return res.status(400).json({ error: 'Data estimada de entrega inválida.' });
  if (!integrations.ids.includes(supplier) || !ref)
    return res
      .status(400)
      .json({ error: "Informe fornecedor e referência do pedido externo." });
  const approvedLink = db
    .prepare(
      "SELECT id FROM supplier_products WHERE product_id=? AND supplier=? AND status='approved' ORDER BY updated_at DESC LIMIT 1",
    )
    .get(order.product_id, supplier);
  if (!approvedLink)
    return res
      .status(409)
      .json({
        error:
          "Não existe vínculo aprovado para este produto e fornecedor. Faça a conferência antes de registrar a compra.",
      });
  db.prepare(
    "UPDATE orders SET status='supplier_ordered',supplier=?,supplier_order_id=?,supplier_receipt_url=?,expected_delivery_date=?,approved_at=?,updated_at=? WHERE id=?",
  ).run(supplier, ref, receiptUrl || null, expectedDeliveryDate || null, now(), now(), order.id);
  notifications.notifyOrder(order.id, 'supplier_ordered').catch(() => {});
  log(
    order.id,
    "manual_supplier_order_registered",
    `${supplier}; referência ${ref}`,
  );
  res.json({ ok: true });
});
app.post("/api/admin/orders/:id/tracking", requireAdmin, (req, res) => {
  const code = clean(req.body?.trackingCode).slice(0, 100);
  if (!code) return res.status(400).json({ error: "Informe o código de rastreamento." });
  const order = db.prepare("SELECT id,status FROM orders WHERE id=?").get(req.params.id);
  if (!order || !["supplier_ordered", "shipped"].includes(order.status))
    return res.status(409).json({ error: "O rastreamento só pode ser informado após o registro da compra no fornecedor." });
  db.prepare("UPDATE orders SET tracking_code=?,status='shipped',updated_at=? WHERE id=?").run(code, now(), order.id);
  log(order.id, "tracking_updated", code);
  notifications.notifyOrder(order.id, 'shipped').catch(() => {});
  res.json({ ok: true, message: "Rastreamento atualizado e notificação enviada ao cliente." });
});
app.post("/api/admin/orders/:id/delivery-estimate", requireAdmin, (req, res) => {
  const value = clean(req.body?.expectedDeliveryDate);
  if (value && !/^\d{4}-\d{2}-\d{2}$/.test(value))
    return res.status(400).json({ error: "Informe a previsão no formato AAAA-MM-DD ou deixe em branco." });
  const order = db.prepare("SELECT id FROM orders WHERE id=?").get(req.params.id);
  if (!order) return res.status(404).json({ error: "Pedido não encontrado." });
  db.prepare("UPDATE orders SET expected_delivery_date=?,updated_at=? WHERE id=?").run(value || null, now(), order.id);
  log(order.id, "delivery_estimate_updated", value || "Previsão removida");
  notifications.notifyOrder(order.id, 'delivery_estimate_updated').catch(() => {});
  res.json({ ok: true, message: "Previsão de entrega atualizada." });
});
app.get("/api/admin/metrics", requireAdmin, (_req, res) => {
  const totals = db.prepare(`SELECT COUNT(*) AS orders, SUM(CASE WHEN is_test=0 THEN total ELSE 0 END) AS gross,
    SUM(CASE WHEN is_test=0 AND payment_status='paid' THEN total ELSE 0 END) AS paid,
    SUM(CASE WHEN status='awaiting_payment' THEN 1 ELSE 0 END) AS pending,
    SUM(CASE WHEN status='awaiting_owner_approval' THEN 1 ELSE 0 END) AS review,
    SUM(CASE WHEN status IN ('supplier_ordered','shipped') THEN 1 ELSE 0 END) AS sent,
    SUM(CASE WHEN is_test=0 AND EXISTS(SELECT 1 FROM supplier_products sp WHERE sp.product_id=orders.product_id AND sp.status='approved' AND sp.supplier_cost IS NOT NULL)
      THEN product_subtotal - (SELECT sp.supplier_cost FROM supplier_products sp WHERE sp.product_id=orders.product_id AND sp.status='approved' AND sp.supplier_cost IS NOT NULL ORDER BY sp.updated_at DESC LIMIT 1) * quantity ELSE NULL END) AS estimated_margin FROM orders`).get();
  res.json({ metrics: totals });
});
app.get("/api/admin/backups", requireAdmin, (_req, res) => res.json({ backups: db.prepare("SELECT * FROM backup_history ORDER BY id DESC LIMIT 30").all() }));
app.post("/api/admin/backups", requireAdmin, async (_req, res) => {
  try { const result = await backups.createBackup('manual-admin'); log(null, 'backup_created', result.fileName); res.status(201).json({ ok: true, ...result }); }
  catch (error) { res.status(500).json({ error: 'Não foi possível criar o backup: ' + error.message }); }
});
app.get("/api/admin/reconciliation", requireAdmin, (_req, res) => {
  const rows = db.prepare(`SELECT o.id,o.total,o.payment_status,o.status,o.payment_provider,o.payment_id,o.updated_at,
    (SELECT COUNT(*) FROM payment_events e WHERE e.order_id=o.id) AS event_count,
    (SELECT e.event_status FROM payment_events e WHERE e.order_id=o.id ORDER BY e.id DESC LIMIT 1) AS last_event,
    (SELECT e.received_at FROM payment_events e WHERE e.order_id=o.id ORDER BY e.id DESC LIMIT 1) AS last_event_at
    FROM orders o WHERE o.is_test=0 ORDER BY o.created_at DESC LIMIT 250`).all();
  res.json({ orders: rows });
});
app.post("/api/orders/track", (req, res) => {
  const id = clean(req.body?.code), email = clean(req.body?.email).toLowerCase();
  if (!id || !validEmail(email)) return res.status(400).json({ error: 'Informe código do pedido e e-mail válido.' });
  const order = db.prepare("SELECT id,product_name,quantity,status,payment_status,tracking_code,expected_delivery_date,created_at,updated_at,is_test FROM orders WHERE id=? AND email=?").get(id, email);
  if (!order) return res.status(404).json({ error: 'Não encontramos pedido com esses dados.' });
  res.set('Cache-Control','no-store');
  res.json({ order: { ...order, is_test: order.is_test === 1 } });
});
app.post("/api/admin/orders/:id/delivered", requireAdmin, (req, res) => {
  const result = db.prepare("UPDATE orders SET status='delivered',delivered_at=?,updated_at=? WHERE id=? AND status='shipped'").run(now(), now(), req.params.id);
  if (!result.changes) return res.status(409).json({ error: "Pedido precisa estar enviado para marcar como entregue." });
  log(req.params.id, "order_delivered", "Entrega marcada pelo administrador.");
  notifications.notifyOrder(req.params.id, 'delivered').catch(() => {});
  res.json({ ok: true });
});
app.get("/api/admin/suppliers", requireAdmin, (_req, res) =>
  res.json({ suppliers: integrations.ids.map(integrations.publicStatus) }),
);
app.get(["/admin", "/admin/"], (_req, res) =>
  res.sendFile(path.join(__dirname, "..", "admin", "index.html")),
);
app.get("/admin/dashboard", (_req, res) =>
  res.sendFile(path.join(__dirname, "..", "admin", "dashboard.html")),
);
app.use((err, _req, res, _next) => {
  console.error(err);
  res
    .status(500)
    .json({ error: "Erro interno. Consulte os registros do servidor." });
});
const paymentExpiryTimer = setInterval(() => {
  const stamp = now();
  const expired = db.prepare("SELECT id,payment_id FROM orders WHERE is_test=0 AND payment_provider='picpay' AND payment_status='pending' AND payment_expires_at IS NOT NULL AND payment_expires_at<=?").all(stamp);
  if (!expired.length) return;
  db.transaction(() => {
    for (const order of expired) {
      db.prepare("UPDATE orders SET payment_status='expired',updated_at=? WHERE id=? AND payment_status='pending'").run(stamp, order.id);
      db.prepare("UPDATE payment_transactions SET status='expired',updated_at=? WHERE order_id=? AND status='pending'").run(stamp, order.id);
      log(order.id, 'payment_expired_local', `Prazo local de pagamento expirado; cobrança ${order.payment_id || 'sem ID'}.`);
    }
  })();
}, 60000);
paymentExpiryTimer.unref();
backups.start();
app.listen(PORT, () => console.log(`Kronix Store em http://localhost:${PORT}`));
