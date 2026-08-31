(function () {
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const topbar = document.getElementById('topbar');

  function setHead() {
    if (topbar) {
      document.documentElement.style.setProperty('--head', topbar.offsetHeight + 'px');
    }
  }
  setHead();
  window.addEventListener('resize', setHead, { passive: true });

  if (topbar) {
    let scrolled = null;
    function syncHeader() {
      const next = window.scrollY > 48;
      if (next === scrolled) return;
      scrolled = next;
      topbar.classList.toggle('is-scrolled', next);
      setHead();
    }
    syncHeader();
    window.addEventListener('scroll', syncHeader, { passive: true });
  }

  if (!reduced) {
    document.querySelectorAll('[data-reveal]').forEach(sec => {
      sec.querySelectorAll('.rv').forEach((el, i) => {
        el.style.transitionDelay = `${Math.min(i * 80, 480)}ms`;
      });
    });
    const io = new IntersectionObserver(entries => {
      for (const e of entries) {
        if (e.isIntersecting) {
          e.target.classList.add('in');
          io.unobserve(e.target);
        }
      }
    }, { rootMargin: '0px 0px -10% 0px', threshold: 0.05 });
    document.querySelectorAll('[data-reveal]').forEach(s => io.observe(s));
  } else {
    document.querySelectorAll('[data-reveal]').forEach(s => s.classList.add('in'));
  }

  const KIT_SUBSCRIBE = 'https://app.kit.com/forms/9811187/subscriptions';
  const form = document.getElementById('waitlist-form');
  if (!form) return;

  async function submitToKit(email) {
    const body = new FormData();
    body.append('email_address', email);

    try {
      const res = await fetch(KIT_SUBSCRIBE, {
        method: 'POST',
        body,
        headers: { Accept: 'application/json' }
      });
      let data = null;
      try { data = await res.json(); } catch {}
      if (data && data.status === 'failed') return { ok: false };
      if (res.ok || (data && (data.subscription || data.redirect_url || data.status === 'success'))) {
        return { ok: true };
      }
      return { ok: false };
    } catch {
      return submitToKitFallback(email);
    }
  }

  function submitToKitFallback(email) {
    return new Promise(resolve => {
      const frame = document.createElement('iframe');
      frame.name = 'kit-waitlist';
      frame.title = 'Kit signup';
      frame.hidden = true;
      document.body.appendChild(frame);

      const hop = document.createElement('form');
      hop.action = KIT_SUBSCRIBE;
      hop.method = 'post';
      hop.target = 'kit-waitlist';
      hop.hidden = true;
      const field = document.createElement('input');
      field.name = 'email_address';
      field.value = email;
      hop.appendChild(field);
      document.body.appendChild(hop);
      hop.submit();

      setTimeout(() => {
        hop.remove();
        frame.remove();
        resolve({ ok: true });
      }, 900);
    });
  }

  const emailIn = document.getElementById('email');
  const errEl = document.getElementById('formErr');
  const doneEl = document.getElementById('formDone');
  const submit = form.querySelector('button[type=submit]');
  const honey = document.getElementById('company');
  const looksLikeEmail = v => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v);

  function showError(msg) {
    errEl.textContent = msg;
    errEl.classList.add('show');
    form.classList.add('invalid');
    emailIn.setAttribute('aria-invalid', 'true');
  }
  function clearError() {
    errEl.classList.remove('show');
    form.classList.remove('invalid');
    emailIn.removeAttribute('aria-invalid');
  }
  emailIn.addEventListener('input', clearError);

  form.addEventListener('submit', async ev => {
    ev.preventDefault();
    if (honey && honey.value) return;

    const email = emailIn.value.trim();
    if (!email) return showError('Add an email address and we’ll take it from there.');
    if (!looksLikeEmail(email)) return showError('That address is missing something. Check it and try again.');

    clearError();
    submit.disabled = true;
    submit.textContent = 'Sending…';

    try {
      const res = await submitToKit(email);
      if (!res.ok) throw new Error('rejected');
      form.classList.add('gone');
      setTimeout(() => doneEl.classList.add('show'), reduced ? 0 : 220);
    } catch {
      submit.disabled = false;
      submit.textContent = 'Join the waitlist';
      showError('That didn’t go through. Try again in a moment.');
    }
  });
})();
