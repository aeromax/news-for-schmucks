(() => {
  const contactLink = document.getElementById('contact-link');
  const mainPanel = document.getElementById('main-panel');
  const contactPanel = document.getElementById('contact-panel');
  const form = document.getElementById('contact-form');
  const backButton = document.getElementById('back-button');
  const cancelButton = document.getElementById('cancel-contact');
  const formError = document.getElementById('form-error');
  const emailInput = document.getElementById('email');
  const nameInput = document.getElementById('name');
  const messageInput = document.getElementById('message');
  const websiteInput = document.getElementById('website'); // honeypot
  const humanCheck = document.getElementById('human-check');

  let openedAt = 0;
  let lastFocus = null;

  function showContactPanel() {
    lastFocus = document.activeElement;
    openedAt = Date.now();
    if (mainPanel) mainPanel.hidden = true;
    if (contactPanel) {
      contactPanel.hidden = false;
      // reset state
      document.getElementById('contact-result').hidden = true;
      form.hidden = false;
      formError.hidden = true;
      formError.textContent = '';
      // Focus first meaningful field
      (emailInput || nameInput).focus({ preventScroll: true });
    }
  }

  function hideContactPanel() {
    if (contactPanel) contactPanel.hidden = true;
    if (mainPanel) mainPanel.hidden = false;
    try {
      form.reset();
      humanCheck.checked = false;
    } catch { }
    if (lastFocus && typeof lastFocus.focus === 'function') {
      lastFocus.focus({ preventScroll: true });
    } else if (contactLink) {
      contactLink.focus({ preventScroll: true });
    }
  }

  function validateEmail(value) {
    // Simple RFC5322-lite email check
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
  }

  function setError(msg) {
    if (!formError) return;
    formError.textContent = msg;
    formError.hidden = false;
  }

  function clearError() {
    if (!formError) return;
    formError.textContent = '';
    formError.hidden = true;
  }

  async function handleSubmit(evt) {
    evt.preventDefault();
    clearError();

    const email = (emailInput?.value || '').trim();
    const message = (messageInput?.value || '').trim();
    const name = (nameInput?.value || '').trim();

    if (!email || !validateEmail(email)) {
      setError('Please enter a valid email address.');
      emailInput?.focus();
      return;
    }
    if (!message) {
      setError('Tell us something useful, at least a sentence.');
      messageInput?.focus();
      return;
    }
    if (websiteInput && websiteInput.value) {
      setError('Submission blocked.');
      return;
    }
    const dwellMs = Date.now() - openedAt;
    if (isFinite(dwellMs) && dwellMs < 3000) {
      setError('Slow down, speed racer.');
      return;
    }
    if (!humanCheck?.checked) {
      setError('Please confirm you are not a robot.');
      humanCheck?.focus();
      return;
    }

    // Submit to backend
    try {
      const res = await fetch('/contact', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, email, message, website: websiteInput?.value || '', human: true, dwellMs })
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.ok) {
        throw new Error(data?.error || 'Failed to send');
      }
    } catch (err) {
      setError(err?.message || 'Failed to send message.');
      return;
    }

    // Success state
    form.hidden = true;
    document.getElementById('contact-result').hidden = false;
    backButton?.focus({ preventScroll: true });
  }

  // Progressive enhancement: use mailto as fallback if JS disabled.
  contactLink?.addEventListener('click', (e) => {
    // Keep mailto as fallback; but show form inline when JS is enabled.
    e.preventDefault();
    showContactPanel();
  });

  cancelButton?.addEventListener('click', hideContactPanel);
  backButton?.addEventListener('click', hideContactPanel);
  form?.addEventListener('submit', handleSubmit);
})();
