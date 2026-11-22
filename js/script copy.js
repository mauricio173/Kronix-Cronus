const EMAIL_CONFIG = {
  publicKey: "fAeAeVIee_ugI1Y1_",
  serviceID: "service_kc95z4b",
  templateID: "template_ur5tlii"
};

emailjs.init({
  publicKey: EMAIL_CONFIG.publicKey
});

const contactForm = document.getElementById("contactForm");
const contactStatus = document.getElementById("contactStatus");
const contactSubmit = document.getElementById("contactSubmit");

contactForm.addEventListener("submit", async (event) => {
  event.preventDefault();

  if (!contactForm.reportValidity()) return;

  contactSubmit.disabled = true;
  contactSubmit.textContent = "Enviando...";
  contactStatus.textContent = "Enviando sua mensagem...";

  try {
    await emailjs.sendForm(
      EMAIL_CONFIG.serviceID,
      EMAIL_CONFIG.templateID,
      contactForm
    );

    contactStatus.textContent =
      "Mensagem enviada com sucesso! Em breve entraremos em contato.";

    contactStatus.style.color = "#22c55e";

    contactForm.reset();

  } catch (error) {
    console.error("Erro ao enviar mensagem:", error);

    contactStatus.textContent =
      "Não foi possível enviar sua mensagem. Tente novamente.";

    contactStatus.style.color = "#ef4444";

  } finally {
    contactSubmit.disabled = false;
    contactSubmit.textContent = "Enviar mensagem";
  }
});

const contactFormSection = document.querySelector('#contactFormSection');

// Modal de contatos: abre pelo link "Contatos", fecha pelo X, fundo ou Escape.
const contactModalTrigger = document.querySelector('a[href="#contactEmail"]');
const contactModalClose = contactFormSection?.querySelector('.btnFechar');

function openContactModal() {
  if (!contactFormSection) return;
  contactFormSection.classList.add('is-open');
  contactFormSection.setAttribute('aria-hidden', 'false');
  document.body.classList.add('contact-modal-open');
  contactEmail?.focus({ preventScroll: true });
}
function closeContactModal() {
  if (!contactFormSection) return;
  contactFormSection.classList.remove('is-open');
  contactFormSection.setAttribute('aria-hidden', 'true');
  document.body.classList.remove('contact-modal-open');
}
const contactEmail = document.getElementById('contactEmail');
contactModalTrigger?.addEventListener('click', (event) => {
  event.preventDefault();
  openContactModal();
});
contactModalClose?.addEventListener('click', closeContactModal);
contactFormSection?.addEventListener('click', (event) => {
  if (event.target === contactFormSection) closeContactModal();
});
document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape' && contactFormSection?.classList.contains('is-open')) closeContactModal();
});

