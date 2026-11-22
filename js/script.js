// Configuração de envio do formulário (EmailJS). Se a biblioteca for bloqueada, usa WhatsApp como alternativa.
const EMAIL_CONFIG = {
  publicKey: "fAeAeVIee_ug1I1Y1_",
  serviceID: "service_kc95z4b",
  templateID: "template_ur5tlii"
};

const contactForm = document.getElementById("contactForm");
const contactStatus = document.getElementById("contactStatus");
const contactSubmit = document.getElementById("contactSubmit");
const contactModal = document.getElementById("contactFormSection");
const contactTrigger = document.querySelector('a[href="#contactEmail"]');
const contactClose = contactModal?.querySelector(".btnFechar");
const CONTACT_WHATSAPP = "5551983312299"; // mantenha/ajuste para o número de atendimento da loja

if (window.emailjs && typeof window.emailjs.init === "function") {
  window.emailjs.init({ publicKey: EMAIL_CONFIG.publicKey });
}


function openContactModal() {
  if (!contactModal) return;
  contactModal.hidden = false;
  contactModal.setAttribute("aria-hidden", "false");
  document.body.classList.add("contact-modal-open");
  contactModal.querySelector("input, textarea, button")?.focus();
}
function closeContactModal() {
  if (!contactModal) return;
  contactModal.hidden = true;
  contactModal.setAttribute("aria-hidden", "true");
  document.body.classList.remove("contact-modal-open");
}
contactTrigger?.addEventListener("click", (event) => {
  event.preventDefault();
  openContactModal();
});
contactClose?.addEventListener("click", (event) => {
  event.preventDefault();
  closeContactModal();
});
contactModal?.addEventListener("click", (event) => {
  if (event.target === contactModal) closeContactModal();
});
document.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && contactModal && !contactModal.hidden) closeContactModal();
});

contactForm?.addEventListener("submit", async (event) => {
  event.preventDefault();
  if (!contactForm.reportValidity()) return;
  contactSubmit.disabled = true;
  contactSubmit.textContent = "Enviando...";
  contactStatus.textContent = "Enviando sua mensagem...";

  // Quando EmailJS estiver bloqueado/indisponível, envia os dados preenchidos ao WhatsApp.
  if (!window.emailjs || typeof window.emailjs.sendForm !== "function") {
    const name = document.getElementById("contactName")?.value.trim() || "";
    const email = document.getElementById("contactEmail")?.value.trim() || "";
    const message = document.getElementById("contactMessage")?.value.trim() || "";
    const text = `Contato pelo site Kronix Store\nNome: ${name}\nE-mail: ${email}\nMensagem: ${message}`;
    const waUrl = `https://wa.me/${CONTACT_WHATSAPP}?text=${encodeURIComponent(text)}`;
    contactStatus.textContent = "O envio por e-mail não está disponível neste navegador. Abrindo WhatsApp para concluir o contato...";
    contactStatus.style.color = "#fbbf24";
    const waWindow = window.open(waUrl, "_blank");
    if (!waWindow) window.location.href = waUrl;
    contactSubmit.disabled = false;
    contactSubmit.textContent = "Enviar mensagem";
    return;
  }

  try {
    await window.emailjs.sendForm(EMAIL_CONFIG.serviceID, EMAIL_CONFIG.templateID, contactForm);
    contactStatus.textContent = "Mensagem enviada com sucesso! Em breve entraremos em contato.";
    contactStatus.style.color = "#22c55e";
    contactForm.reset();
  } catch (error) {
    console.error("Erro ao enviar mensagem:", error);
    contactStatus.textContent = "Não foi possível enviar por e-mail. Abrindo WhatsApp como alternativa...";
    contactStatus.style.color = "#fbbf24";
    const name = document.getElementById("contactName")?.value.trim() || "";
    const email = document.getElementById("contactEmail")?.value.trim() || "";
    const message = document.getElementById("contactMessage")?.value.trim() || "";
    const text = `Contato pelo site Kronix Store\nNome: ${name}\nE-mail: ${email}\nMensagem: ${message}`;
    const waUrl = `https://wa.me/${CONTACT_WHATSAPP}?text=${encodeURIComponent(text)}`;
    const waWindow = window.open(waUrl, "_blank");
    if (!waWindow) window.location.href = waUrl;
  } finally {
    contactSubmit.disabled = false;
    contactSubmit.textContent = "Enviar mensagem";
  }
});
