(() => {
  const names = {
    awaiting_payment: "Aguardando pagamento",
    payment_setup_error: "Pagamento não finalizado",
    awaiting_owner_approval: "Pagamento confirmado · análise da loja",
    supplier_setup_required: "Aguardando compra da loja",
    supplier_ordered: "Compra realizada",
    shipped: "Pedido enviado",
    delivered: "Pedido entregue",
    rejected: "Pedido cancelado / rejeitado",
    test_paid: "Pedido de teste",
  };
  const pay = {
    pending: "Aguardando confirmação",
    paid: "Confirmado",
    declined: "Recusado",
    expired: "Expirado",
    refunded: "Estornado",
    under_review: "Em análise",
  };
  const form = document.getElementById("track-form"),
    out = document.getElementById("result");
  const params = new URLSearchParams(location.search);
  if (params.get("code"))
    document.getElementById("code").value = params.get("code");
  if (params.get("email"))
    document.getElementById("email").value = params.get("email");
  function addLine(parent, label, value) {
    const p = document.createElement("p"),
      b = document.createElement("strong");
    b.textContent = label + ": ";
    p.append(b, document.createTextNode(value));
    parent.append(p);
  }
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    out.textContent = "Consultando informações atualizadas…";
    try {
      const r = await fetch("/api/orders/track", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        cache: "no-store",
        body: JSON.stringify({
          code: document.getElementById("code").value.trim(),
          email: document.getElementById("email").value.trim(),
        }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || "Falha na consulta");
      const o = d.order;
      out.replaceChildren();
      const heading = document.createElement("h2");
      heading.textContent = "Resumo do pedido";
      out.append(heading);
      addLine(out, "Pedido", o.id);
      addLine(out, "Produto", o.product_name);
      addLine(out, "Quantidade", String(o.quantity));
      addLine(out, "Etapa atual", names[o.status] || o.status);
      addLine(
        out,
        "Situação financeira",
        pay[o.payment_status] || o.payment_status,
      );
      addLine(
        out,
        "Previsão de entrega",
        o.expected_delivery_date || "Não informada",
      );
      addLine(out, "Rastreamento", o.tracking_code || "Ainda não disponível");
      addLine(
        out,
        "Atualizado em",
        new Date(o.updated_at).toLocaleString("pt-BR"),
      );
      const timeline = document.createElement("section"),
        title = document.createElement("h3");
      title.textContent = "Histórico de atualizações";
      timeline.append(title);
      const history = Array.isArray(d.history) ? d.history : [];
      if (!history.length) {
        const p = document.createElement("p");
        p.className = "muted";
        p.textContent = "Nenhuma alteração adicional registrada.";
        timeline.append(p);
      }
      history.forEach((item) => {
        const p = document.createElement("p"),
          strong = document.createElement("strong");
        strong.textContent =
          names[item.new_status] || item.new_status || "Atualização";
        p.append(
          strong,
          document.createTextNode(
            ` · ${new Date(item.changed_at).toLocaleString("pt-BR")}`,
          ),
        );
        if (item.old_payment_status !== item.new_payment_status) {
          const small = document.createElement("small");
          small.textContent = ` · Pagamento: ${pay[item.new_payment_status] || item.new_payment_status}`;
          p.append(small);
        }
        timeline.append(p);
      });
      out.append(timeline);
    } catch (err) {
      out.textContent = err.message;
    }
  });
  if (params.get("code") && params.get("email")) form.requestSubmit();
})();
