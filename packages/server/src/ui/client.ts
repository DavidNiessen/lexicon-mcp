// Deliberately read-only: the embedded preview never sends tool calls or approvals.
export const previewClient = String.raw`
(() => {
  const root = document.getElementById('preview');
  const search = document.getElementById('filter');
  const status = document.getElementById('row-status');
  let model;
  const text = (value) => String(value ?? '—').slice(0, 401);
  const node = (tag, value) => { const item = document.createElement(tag); if (value !== undefined) item.textContent = text(value); return item; };
  function filter() {
    const query = search.value.toLocaleLowerCase();
    let visible = 0;
    root.querySelectorAll('tbody tr').forEach(row => {
      row.hidden = !row.textContent.toLocaleLowerCase().includes(query);
      if (!row.hidden) visible++;
    });
    status.textContent = model ? visible + ' of ' + model.total + ' rows shown' : '';
    const empty = document.getElementById('empty');
    empty.hidden = !model || visible > 0;
    empty.textContent = model?.rows.length ? 'No visible rows match your filter.' : 'No results to display.';
  }
  function render(value) {
    if (!value || !Array.isArray(value.rows) || !Array.isArray(value.columns)) return;
    model = value;
    document.getElementById('title').textContent = text(value.title);
    document.getElementById('description').textContent = text(value.description);
    document.getElementById('state').textContent = text(value.status);
    document.getElementById('note').textContent = text(value.note);
    const facts = document.getElementById('facts'); facts.replaceChildren();
    (value.facts || []).slice(0, 8).forEach(pair => { facts.append(node('dt', pair[0]), node('dd', pair[1])); });
    const table = node('table'); table.dataset.columns = String(value.columns.length);
    const caption = node('caption', value.title); caption.className = 'sr-only'; table.append(caption);
    const head = node('thead'), header = node('tr');
    value.columns.slice(0, 6).forEach(column => { const th = node('th', column); th.scope = 'col'; header.append(th); });
    head.append(header); table.append(head);
    const body = node('tbody');
    value.rows.slice(0, 100).forEach(row => {
      const tr = node('tr');
      row.slice(0, 6).forEach((cell,index) => { const td=node('td',cell);td.dataset.label=text(value.columns[index]);tr.append(td); });
      body.append(tr);
    });
    table.append(body); root.replaceChildren(table);
    document.getElementById('empty').hidden = value.rows.length > 0;
    document.getElementById('truncation').hidden = !(value.total > value.rows.length);
    search.disabled = value.rows.length === 0;
    filter();
  }
  search.addEventListener('input', filter);
  document.getElementById('show-details').addEventListener('click', () => {
    const details = document.getElementById('details'); details.hidden = !details.hidden;
    details.textContent = model ? JSON.stringify(model, null, 2) : 'No result received.';
    document.getElementById('show-details').setAttribute('aria-expanded', String(!details.hidden));
    document.getElementById('show-details').textContent = details.hidden ? 'Show preview data' : 'Hide preview data';
  });
  window.addEventListener('message', event => {
    if (event.source !== window.parent && event.source !== window) return;
    const data = event.data;
    if (!data || data.type !== 'ui-lifecycle-iframe-render-data') return;
    const payload = data.payload?.renderData;
    if (payload?.theme === 'light' || payload?.theme === 'dark') document.documentElement.dataset.theme = payload.theme;
    const output = payload?.toolOutput;
    const next = output?._meta?.['lexicon/preview'];
    if (next) render(next);
  });
  const initial = document.getElementById('initial');
  if (initial.textContent) { try { render(JSON.parse(initial.textContent)); } catch { /* Remain in the safe empty state. */ } }
  window.parent.postMessage({type:'ui-lifecycle-iframe-ready'}, '*');
})();`;
