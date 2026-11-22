(() => {
  "use strict";
  const PRODUCT = { id: "cronus-zen", name: "Cronus Zen", price: 102990 };
  // Links de pagamento por produto. Se vazio/ausente, usa o WhatsApp.
  const PAYMENT_LINKS = {
    "cronus-zen": "https://buy.stripe.com/test_5kQeVc8g69cZ2tC382efC01",
  };
  const money = (cents) =>
    new Intl.NumberFormat("pt-BR", {
      style: "currency",
      currency: "BRL",
    }).format(cents / 100);
  const $ = (id) => document.getElementById(id);

  document.addEventListener("DOMContentLoaded", async () => {
    const form = $("checkout-form"),
      qtyInput = $("quantity"),
      message = $("success-message");
    const cepInput = $("postalCode"),
      cepStatus = $("cep-status");
    const testOption = $("test-payment-option"),
      testCheckbox = $("test-payment");
    let quantity = 1,
      lastCep = "",
      cepRequest = null,
      testEnabled = false;

    try {
      const saved = JSON.parse(localStorage.getItem("kronix_cart") || "null");
      if (Array.isArray(saved) && saved.length)
        quantity = Math.max(1, Math.min(5, Number(saved[0].quantity) || 1));
    } catch (_) {}
    try {
      const cfg = await fetch("/api/config").then((r) => r.json());
      testEnabled = cfg.testPixEnabled === true;
      testOption.hidden = !testEnabled;
    } catch (_) {
      testOption.hidden = true;
    }

    $("product-name").textContent = PRODUCT.name;
    $("product-price").textContent = money(PRODUCT.price);
    $("unit-price").textContent = money(PRODUCT.price);
    qtyInput.value = String(quantity);

    let quoteSequence = 0;
    async function updateTotals() {
      const sequence = ++quoteSequence;
      quantity = Math.max(1, Math.min(5, Number(qtyInput.value) || 1));
      qtyInput.value = String(quantity);
      const isTest = testCheckbox?.checked === true;
      qtyInput.disabled = isTest;
      $("quantity-minus").disabled = isTest || quantity <= 1;
      $("quantity-plus").disabled = isTest || quantity >= 5;
      try {
        localStorage.setItem(
          "kronix_cart",
          JSON.stringify([
            {
              id: PRODUCT.id,
              name: PRODUCT.name,
              price: PRODUCT.price,
              quantity,
            },
          ]),
        );
      } catch (_) {}
      if (isTest) {
        $("total").textContent = money(1);
        $("price-warning").textContent =
          "MODO DE TESTE: o pedido será criado por R$ 0,01. Nenhum pedido comercial será gerado.";
      } else {
        $("total").textContent = "Calculando…";
        $("price-warning").textContent =
          "Consultando frete e tributos calculados pelo servidor…";
      }
      document.querySelector(".price-breakdown").style.opacity = isTest
        ? ".45"
        : "1";
      const state = $("state").value.trim().toUpperCase();
      if (!/^[A-Z]{2}$/.test(state)) {
        $("product-subtotal").textContent = money(PRODUCT.price * quantity);
        $("supplier-freight").textContent = "—";
        $("import-tax").textContent = "—";
        $("icms-tax").textContent = "—";
        $("icms-rate").textContent = "—";
        $("charges-subtotal").textContent = "—";
        if (!isTest) {
          $("total").textContent = "Informe a UF";
          $("price-warning").textContent =
            "Informe o estado de entrega para calcular os tributos.";
        }
        return;
      }
      try {
        const response = await fetch(
          `/api/quote/${encodeURIComponent(state)}?quantity=${quantity}`,
          { cache: "no-store" },
        );
        const data = await response.json();
        if (!response.ok)
          throw new Error(data.error || "Não foi possível calcular o pedido.");
        if (sequence !== quoteSequence) return;
        const a = data.amounts;
        $("product-subtotal").textContent = money(a.productSubtotal);
        $("supplier-freight").textContent = money(a.supplierFreight);
        $("import-tax").textContent = money(a.importTax);
        $("icms-tax").textContent = money(a.icmsTax);
        $("icms-rate").textContent = `${a.taxRate}%`;
        $("charges-subtotal").textContent = money(
          a.supplierFreight + a.importTax + a.icmsTax,
        );
        if (!isTest) $("total").textContent = money(a.total);
        if (!isTest)
          $("price-warning").textContent =
            "O total definitivo será calculado novamente no servidor e cobrado pelo gateway Pix. O ICMS é uma estimativa RTS conforme a UF informada.";
      } catch (error) {
        if (sequence !== quoteSequence) return;
        if (!isTest) {
          $("total").textContent = "—";
          $("price-warning").textContent = error.message;
        }
      }
    }

    async function lookupCep() {
      const cep = cepInput.value.replace(/\D/g, "");
      if (cep.length !== 8) {
        lastCep = "";
        if (cep.length) cepStatus.textContent = "O CEP deve conter 8 números.";
        return;
      }
      if (cep === lastCep) return;
      lastCep = cep;
      if (cepRequest) cepRequest.abort();
      cepRequest = new AbortController();
      cepStatus.textContent = "Consultando CEP…";
      cepInput.setAttribute("aria-busy", "true");
      try {
        const response = await fetch(`/api/cep/${cep}`, {
          signal: cepRequest.signal,
        });
        const data = await response.json();
        if (!response.ok)
          throw new Error(data.error || "Não foi possível localizar este CEP.");
        $("street").value = data.street || "";
        $("neighborhood").value = data.neighborhood || "";
        $("city").value = data.city || "";
        $("state").value = data.state || "";
        updateTotals();
        cepStatus.textContent = `Endereço localizado (${data.city}/${data.state}). Confira e informe o número.`;
        $("streetNumber").focus();
      } catch (error) {
        if (error.name !== "AbortError") {
          lastCep = "";
          cepStatus.textContent = `${error.message} Você pode preencher o endereço manualmente.`;
        }
      } finally {
        cepInput.removeAttribute("aria-busy");
      }
    }

    let paymentPollTimer = null;
    let expiryTimer = null;
    function showExpiry(expiresAt) {
      const el = $("pix-expiry");
      if (expiryTimer) clearInterval(expiryTimer);
      if (!expiresAt) {
        el.hidden = true;
        return;
      }
      el.hidden = false;
      const update = () => {
        const remaining = Math.max(
          0,
          new Date(expiresAt).getTime() - Date.now(),
        );
        const mins = Math.floor(remaining / 60000),
          secs = Math.floor((remaining % 60000) / 1000);
        el.textContent =
          remaining > 0
            ? `Este Pix expira em ${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")}.`
            : "O prazo deste Pix terminou. Consulte o status ou fale com a Kronix Store.";
        if (remaining <= 0 && expiryTimer) clearInterval(expiryTimer);
      };
      update();
      expiryTimer = setInterval(update, 1000);
    }
    async function pollPaymentStatus(orderId) {
      if (paymentPollTimer) clearInterval(paymentPollTimer);
      const started = Date.now();
      const poll = async () => {
        try {
          const response = await fetch(
            `/api/orders/${encodeURIComponent(orderId)}/payment-status`,
            { cache: "no-store" },
          );
          if (!response.ok) return;
          const status = await response.json();
          if (status.paymentStatus === "paid") {
            clearInterval(paymentPollTimer);
            $("payment-status").textContent = status.isTest
              ? "Pagamento de teste confirmado."
              : "Pagamento recebido e confirmado! Seu pedido está aguardando análise da Kronix.";
          } else if (status.paymentStatus === "expired") {
            clearInterval(paymentPollTimer);
            $("payment-status").textContent =
              "O Pix expirou. Gere uma nova cobrança ou fale com a loja pelo WhatsApp.";
          } else if (status.paymentStatus === "declined") {
            clearInterval(paymentPollTimer);
            $("payment-status").textContent =
              "O pagamento foi recusado. Entre em contato com a Kronix Store.";
          } else if (status.paymentStatus === "refunded") {
            clearInterval(paymentPollTimer);
            $("payment-status").textContent =
              "Este pagamento foi estornado. Entre em contato com a loja se precisar de ajuda.";
          } else if (status.paymentStatus === "under_review") {
            $("payment-status").textContent =
              "Pagamento recebido e em análise pelo provedor.";
          }
          if (
            ["paid", "expired", "declined", "refunded"].includes(
              status.paymentStatus,
            )
          )
            showExpiry(null);
          else showExpiry(status.expiresAt);
        } catch (_) {}
        if (Date.now() - started > 15 * 60 * 1000)
          clearInterval(paymentPollTimer);
      };
      paymentPollTimer = setInterval(poll, 5000);
      await poll();
    }

    function showPayment(result) {
      const panel = $("payment-result");
      const isTest = result.testMode === true;
      $("payment-result-title").textContent = isTest
        ? "Pix de teste · R$ 0,01"
        : "Pagamento Pix";
      $("payment-result-text").textContent = isTest
        ? `Pedido de teste ${result.orderId}. Clique em “Simular pagamento aprovado” para testar a confirmação automática. Nenhum valor será transferido.`
        : `Pedido ${result.orderId}. Escaneie o QR Code ou copie o código Pix. O painel será atualizado após confirmação autenticada do PicPay.`;
      const qr = $("payment-qr");
      if (result.pix?.qrBase64)
        qr.src = result.pix.qrBase64.startsWith("data:")
          ? result.pix.qrBase64
          : `data:image/png;base64,${result.pix.qrBase64}`; 
      else qr.src = result.pix?.qrImage || "";
      qr.hidden = !qr.src;
      $("pix-copy-code").value = result.pix?.qrCode || "";
      $("pix-copy-code").hidden = false;
      document.querySelector('label[for="pix-copy-code"]').hidden = false;
      $("copy-pix-code").hidden = false;
      $("payment-test-warning").hidden = !isTest;
      $("simulate-test-payment").hidden = !isTest;
      $("simulate-test-payment").dataset.orderId = result.orderId;
      $("payment-status").textContent = "";
      $("checkout-track-link").href =
        `/acompanhar-pedido.html?code=${encodeURIComponent(result.orderId)}&email=${encodeURIComponent($("email").value.trim())}`;
      $("checkout-track-link").hidden = false;
      showExpiry(result.expiresAt || result.paymentExpiresAt || null);
      $("whatsapp-payment-link").hidden = true;
      panel.hidden = false;
      panel.scrollIntoView({ behavior: "smooth", block: "center" });
      if (!isTest) pollPaymentStatus(result.orderId);
    }



    $("quantity-minus").addEventListener("click", () => {
      qtyInput.value = String(quantity - 1);
      updateTotals();
    });
    $("quantity-plus").addEventListener("click", () => {
      qtyInput.value = String(quantity + 1);
      updateTotals();
    });
    qtyInput.addEventListener("change", updateTotals);
    $("state").addEventListener("change", updateTotals);
    testCheckbox?.addEventListener("change", () => {
      if (testCheckbox.checked) {
        quantity = 1;
        qtyInput.value = "1";
      }
      updateTotals();
    });
    cepInput.addEventListener("input", () => {
      const digits = cepInput.value.replace(/\D/g, "").slice(0, 8);
      cepInput.value =
        digits.length > 5 ? `${digits.slice(0, 5)}-${digits.slice(5)}` : digits;
      if (digits.length === 8) lookupCep();
      else {
        lastCep = "";
        cepStatus.textContent =
          "Digite os 8 números do CEP para preencher o endereço automaticamente.";
      }
    });
    cepInput.addEventListener("blur", lookupCep);
    $("copy-pix-code").addEventListener("click", async () => {
      try {
        await navigator.clipboard.writeText($("pix-copy-code").value);
        $("copy-pix-code").textContent = "COPIADO!";
      } catch (_) {
        $("pix-copy-code").select();
        document.execCommand("copy");
      }
    });
    $("simulate-test-payment").addEventListener("click", async () => {
      const button = $("simulate-test-payment");
      const orderId = button.dataset.orderId;
      if (
        !orderId ||
        !confirm(
          "Simular que o Pix de R$ 0,01 foi aprovado? Nenhum dinheiro será movimentado.",
        )
      )
        return;
      button.disabled = true;
      try {
        const response = await fetch(
          `/api/test-payments/${encodeURIComponent(orderId)}/simulate-paid`,
          { method: "POST" },
        );
        const result = await response.json();
        if (!response.ok)
          throw new Error(
            result.error || "Não foi possível simular o pagamento.",
          );
        $("payment-status").textContent =
          "Pagamento de teste confirmado automaticamente. O pedido já está atualizado no painel administrativo.";
        button.textContent = "PAGAMENTO DE TESTE CONFIRMADO";
      } catch (error) {
        $("payment-status").textContent = error.message;
        button.disabled = false;
      }
    });

    updateTotals();

    form.addEventListener("submit", async (event) => {
      event.preventDefault();
      if (!form.reportValidity()) return;
      if (testCheckbox?.checked && !testEnabled) return;
      const payload = {
        productId: PRODUCT.id,
        quantity,
        testMode: testCheckbox?.checked === true,
        cpf: $("cpf").value.replace(/\D/g, ""),
        name: $("name").value.trim(),
        email: $("email").value.trim(),
        phone: $("phone").value.trim(),
        platform: $("platform").value,
        notes: $("notes").value.trim(),
        postalCode: cepInput.value.trim(),
        street: $("street").value.trim(),
        streetNumber: $("streetNumber").value.trim(),
        complement: $("complement").value.trim(),
        neighborhood: $("neighborhood").value.trim(),
        city: $("city").value.trim(),
        state: $("state").value.trim().toUpperCase(),
        termsAccepted: $("terms").checked,
      };
      // Abre uma guia vazia durante o gesto do usuário para evitar bloqueio de popup
      // caso o checkout precise encaminhar o cliente ao WhatsApp após a resposta do servidor.
      const whatsappTab = window.open("about:blank", "_blank");
      const button = $("checkout-submit");
      button.disabled = true;
      button.textContent = "GERANDO PIX…";
      message.hidden = false;
      message.textContent =
        "Calculando o total e criando o pagamento com segurança…";
      $("payment-result").hidden = true;
      try {
        const requestFingerprint = JSON.stringify(payload);
        let savedAttempt = null;
        try {
          savedAttempt = JSON.parse(
            sessionStorage.getItem("kronix_checkout_attempt") || "null",
          );
        } catch (_) {}
        let idempotencyKey =
          savedAttempt?.fingerprint === requestFingerprint
            ? savedAttempt.key
            : null;
        if (!idempotencyKey) {
          idempotencyKey = crypto.randomUUID
            ? crypto.randomUUID()
            : `${Date.now()}-${Math.random().toString(36).slice(2)}-${Math.random().toString(36).slice(2)}`;
          sessionStorage.setItem(
            "kronix_checkout_attempt",
            JSON.stringify({
              key: idempotencyKey,
              fingerprint: requestFingerprint,
            }),
          );
        }
        const response = await fetch("/api/orders", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Idempotency-Key": idempotencyKey,
          },
          body: JSON.stringify(payload),
        });
        const result = await response.json();
        if (!response.ok)
          throw new Error(
            result.error || "Não foi possível criar o pagamento.",
          );
        try {
          localStorage.setItem(
            "kronix_last_order",
            JSON.stringify({
              orderId: result.orderId,
              product: PRODUCT.id,
              quantity: payload.testMode ? 1 : quantity,
              total: result.total,
              createdAt: new Date().toISOString(),
            }),
          );
        } catch (_) {}
        message.textContent = `Pedido ${result.orderId} criado. Total calculado pelo servidor: ${money(result.total)}.`;
        sessionStorage.removeItem("kronix_checkout_attempt");
        if (result.manualPayment === true) {
          const whatsappMessage = `Olá! Gostaria de finalizar o pagamento do meu pedido.\nCódigo do pedido: ${result.orderId}\nE-mail da compra: ${payload.email}\nNão foi possível gerar o Pix PicPay pelo checkout. Motivo: ${result.error || "pagamento indisponível"}.`;
          const whatsappUrl = `https://wa.me/5551983312299?text=${encodeURIComponent(whatsappMessage)}`;
          message.textContent = `Pedido ${result.orderId} criado. O pagamento automático não foi concluído. Use o botão abaixo para finalizar pelo WhatsApp.`;
          showExpiry(null);
          $("payment-result-title").textContent =
            "Finalize seu pagamento pelo WhatsApp";
          $("payment-result-text").textContent =
            `Seu pedido ${result.orderId} foi registrado, mas nenhuma confirmação de pagamento foi recebida. Clique no botão para conversar com a Kronix Store.`;
          $("payment-qr").hidden = true;
          $("pix-copy-code").hidden = true;
          document.querySelector('label[for="pix-copy-code"]').hidden = true;
          $("copy-pix-code").hidden = true;
          $("payment-result").hidden = false;
          const trackingLink = $("checkout-track-link");
          trackingLink.href = `/acompanhar-pedido.html?code=${encodeURIComponent(result.orderId)}&email=${encodeURIComponent(payload.email)}`;
         // trackingLink.hidden = false;
          trackingLink.hidden = false;
          const whatsappLink = $("whatsapp-payment-link");
          // WhatsApp permanece visível como alternativa manual se o Stripe não abrir,
          // se o cliente cancelar ou se o checkout externo apresentar algum problema.
          whatsappLink.href = whatsappUrl;
          whatsappLink.textContent = "PRECISA DE AJUDA? FINALIZAR PELO WHATSAPP";
          whatsappLink.hidden = false;
          whatsappLink.scrollIntoView({ behavior: "smooth", block: "center" });

          const stripeUrl = PAYMENT_LINKS[PRODUCT.id];
          if (stripeUrl && /^https:\/\/buy\.stripe\.com\//i.test(stripeUrl)) {
            if (whatsappTab && !whatsappTab.closed) {
              whatsappTab.location.href = stripeUrl;
            } else {
              // Caso o navegador tenha fechado/bloqueado a guia previamente aberta.
              const stripeTab = window.open(stripeUrl, "_blank", "noopener,noreferrer");
              if (!stripeTab) {
                window.open(whatsappUrl, "_blank", "noopener,noreferrer");
              }
            }
            message.textContent = `Pedido ${result.orderId} criado. O link de pagamento foi aberto. Se precisar, use o botão para falar com a Kronix pelo WhatsApp.`;
            $("payment-result-title").textContent = "Finalize o pagamento seguro";
            $("payment-result-text").textContent = `Pedido ${result.orderId} registrado. A página de pagamento Stripe foi aberta em outra guia. Se o link não abrir ou você tiver dificuldades, use o botão WhatsApp abaixo.`;
          } else {
            message.textContent = `Pedido ${result.orderId} criado. Abrindo atendimento pelo WhatsApp para finalizar o pagamento.`;
            if (whatsappTab && !whatsappTab.closed)
              whatsappTab.location.href = whatsappUrl;
            else window.open(whatsappUrl, "_blank", "noopener,noreferrer");
          }
          return;
        }
        if (whatsappTab && !whatsappTab.closed) whatsappTab.close();
        showPayment(result);
      } catch (err) {
        if (whatsappTab && !whatsappTab.closed) whatsappTab.close();
        message.textContent = `Não foi possível gerar o pagamento: ${err.message}`;
      } finally {
        button.disabled = false;
        button.innerHTML = "GERAR PAGAMENTO PIX <span>→</span>";
      }
    });
  });
})();
