import { html, raw } from 'hono/html';

export function field({ label, name, type = 'text', value = '', required = false, placeholder = '', autocomplete = '', hint = '' }) {
  return html`
    <label class="field">
      <span class="label">${label}${required ? html`<span class="req"> *</span>` : ''}</span>
      <input
        type="${type}" name="${name}" value="${value}" ${raw(required ? 'required' : '')}
        placeholder="${placeholder}" ${raw(autocomplete ? `autocomplete="${autocomplete}"` : '')}
        class="input" />
      ${hint ? html`<span class="hint">${hint}</span>` : ''}
    </label>`;
}

export function submitBtn(label) {
  return html`<button type="submit" class="btn btn-primary btn-block">${label}</button>`;
}

// Narrow single-column auth/card container.
export function authCard(title, inner, subtitle = '') {
  return html`
    <div class="narrow mt-1">
      <div class="card">
        <h1 style="font-size:1.4rem">${title}</h1>
        ${subtitle ? html`<p class="muted small" style="margin-top:-0.3rem">${subtitle}</p>` : ''}
        <div class="mt-1">${inner}</div>
      </div>
    </div>`;
}

export function alertBox(type, message) {
  const cls = type === 'error' ? 'alert-error' : type === 'success' ? 'alert-ok' : 'alert-info';
  return html`<div class="alert ${cls}">${message}</div>`;
}
