// Small UI helpers: escaping, toasts, dialogs, announcements.

export function esc(v) {
  return String(v ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

export function announce(msg) {
  const el = document.getElementById('sr-status');
  if (!el) return;
  el.textContent = '';
  setTimeout(() => { el.textContent = msg; }, 30);
}

let toastTimer;
export function toast(message, { action, timeout = 7000 } = {}) {
  const region = document.getElementById('toast');
  region.innerHTML = '';
  const box = document.createElement('div');
  box.className = 'toast-box';
  const p = document.createElement('p');
  p.textContent = message;
  box.append(p);
  if (action) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'btn btn-small btn-ghost-light';
    b.textContent = action.label;
    b.addEventListener('click', () => { action.fn(); hideToast(); });
    box.append(b);
  }
  const close = document.createElement('button');
  close.type = 'button';
  close.className = 'icon-btn toast-close';
  close.setAttribute('aria-label', 'Dismiss message');
  close.innerHTML = '<span aria-hidden="true">×</span>';
  close.addEventListener('click', hideToast);
  box.append(close);
  region.append(box);
  region.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(hideToast, timeout);
}
export function hideToast() {
  const region = document.getElementById('toast');
  if (region) { region.hidden = true; region.innerHTML = ''; }
}

/**
 * Open a modal dialog. `build(body, close)` fills it. Returns a promise resolved on close.
 */
export function openDialog({ title, build, wide = false }) {
  return new Promise((resolve) => {
    const prevFocus = document.activeElement;
    const dlg = document.createElement('dialog');
    dlg.className = `dialog${wide ? ' dialog-wide' : ''}`;
    const id = `dlg-${Math.random().toString(36).slice(2, 8)}`;
    dlg.setAttribute('aria-labelledby', id);
    dlg.innerHTML = `
      <div class="dialog-head">
        <h2 id="${id}" class="dialog-title">${esc(title)}</h2>
        <button type="button" class="icon-btn" data-close aria-label="Close"><span aria-hidden="true">×</span></button>
      </div>
      <div class="dialog-body"></div>`;
    document.body.append(dlg);
    let result;
    const close = (value) => { result = value; dlg.close(); };
    dlg.addEventListener('close', () => {
      dlg.remove();
      if (prevFocus && prevFocus.isConnected) prevFocus.focus();
      resolve(result);
    });
    dlg.querySelector('[data-close]').addEventListener('click', () => close(undefined));
    build(dlg.querySelector('.dialog-body'), close);
    dlg.showModal();
    const first = dlg.querySelector('.dialog-body input, .dialog-body select, .dialog-body textarea, .dialog-body button');
    if (first) first.focus();
  });
}

export function confirmDialog({ title, message, confirm = 'Yes', cancel = 'Cancel', danger = false }) {
  return openDialog({
    title,
    build(body, close) {
      body.innerHTML = `<p>${esc(message)}</p>
        <div class="btn-row">
          <button type="button" class="btn ${danger ? 'btn-danger' : 'btn-primary'}" data-yes>${esc(confirm)}</button>
          <button type="button" class="btn btn-secondary" data-no>${esc(cancel)}</button>
        </div>`;
      body.querySelector('[data-yes]').addEventListener('click', () => close(true));
      body.querySelector('[data-no]').addEventListener('click', () => close(false));
    },
  });
}

export function reducedMotion() {
  const pref = document.documentElement.dataset.motion;
  if (pref === 'reduce') return true;
  if (pref === 'full') return false;
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

export function download(filename, text, type = 'text/plain') {
  const blob = new Blob([text], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

export function fieldError(form, name, msg) {
  const el = form.querySelector(`[data-error-for="${name}"]`);
  const input = form.querySelector(`[name="${name}"]`);
  if (el) { el.textContent = msg || ''; el.hidden = !msg; }
  if (input) {
    if (msg) {
      input.setAttribute('aria-invalid', 'true');
      if (el) input.setAttribute('aria-describedby', el.id);
    } else {
      input.removeAttribute('aria-invalid');
    }
  }
}

let idCounter = 0;
export const uid = (p = 'f') => `${p}-${++idCounter}`;
