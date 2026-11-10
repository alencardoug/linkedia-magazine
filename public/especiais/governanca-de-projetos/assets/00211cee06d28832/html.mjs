const markup = Symbol('markup');
const entities = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
const escape = value => String(value ?? '').replace(/[&<>"']/g, character => entities[character]);

export const raw = value => ({ [markup]: String(value) });

export function html(parts, ...values) {
  return parts.reduce((result, part, index) => {
    const value = values[index - 1];
    return result + (index === 0 ? '' : value?.[markup] ?? escape(value)) + part;
  }, '');
}
