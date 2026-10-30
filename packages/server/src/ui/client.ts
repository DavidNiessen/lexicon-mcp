// Approval credentials arrive only in UI-private metadata; never put them in the DOM.
export const previewClient = String.raw`
(() => {
  const root = document.getElementById('preview');
  const search = document.getElementById('filter');
  const status = document.getElementById('row-status');
  const apply = document.getElementById('apply-changes');
  const cancel = document.getElementById('cancel-changes');
  const feedback = document.getElementById('approval-status');
  const controls = document.getElementById('approval-controls');
  const pending = new Map();
  let model, grant, inFlight = false, ready = false, sequence = 0;
  const text = value => String(value ?? '—').slice(0, 401);
  const node = (tag, value) => { const item = document.createElement(tag); if (value !== undefined) item.textContent = text(value); return item; };
  const expires = value => typeof value === 'number' ? value : Date.parse(value);
  function resize() {
    const height = document.documentElement.scrollHeight;
    if (!ready || !Number.isFinite(height) || height <= 0) return;
    if (typeof window.openai?.notifyIntrinsicHeight === 'function') window.openai.notifyIntrinsicHeight(height);
    else if (window.parent !== window) window.parent.postMessage({jsonrpc:'2.0',method:'ui/notifications/size-changed',params:{height}},'*');
  }
  function available() {
    return ready && !inFlight && model?.plan?.status === 'pending' && grant &&
      grant.id === model.plan.id && grant.hash === model.plan.hash &&
      typeof grant.token === 'string' && grant.token.length === 64 && expires(grant.expiresAt) > Date.now();
  }
  function buttons(message) {
    controls.hidden = !model?.plan;
    apply.disabled = cancel.disabled = !available();
    apply.textContent = inFlight ? 'Applying…' : 'Apply changes';
    if (message) feedback.textContent = text(message);
    else if (inFlight) feedback.textContent = 'Waiting for the server. Do not close this preview.';
    else if (model?.plan?.status === 'completed') feedback.textContent = 'Changes applied.';
    else if (model?.plan?.status === 'cancelled') feedback.textContent = 'Plan cancelled. No changes were applied.';
    else if (['failed','interrupted','applying'].includes(model?.plan?.status)) feedback.textContent = 'Inspect the recorded outcomes and reconcile this plan before making further changes.';
    else if (!ready) feedback.textContent = 'This client has not connected the confirmation UI. Changes remain blocked.';
    else if (!available()) feedback.textContent = 'No current approval is available. Reopen the plan preview to refresh it.';
    else feedback.textContent = 'Apply changes once to approve this exact preview. No chat confirmation is needed.';
  }
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
      if (!Array.isArray(row)) return;
      row.slice(0, 6).forEach((cell,index) => { const td=node('td',cell);td.dataset.label=text(value.columns[index]);tr.append(td); });
      body.append(tr);
    });
    table.append(body); root.replaceChildren(table);
    document.getElementById('truncation').hidden = !(value.total > value.rows.length);
    search.disabled = value.rows.length === 0;
    filter(); buttons(); resize();
  }
  function theme(context) {
    if (context?.theme === 'light' || context?.theme === 'dark') document.documentElement.dataset.theme = context.theme;
  }
  function output(result) {
    const metadata = result?._meta ?? {};
    grant = metadata['lexicon/approval'];
    const preview = metadata['lexicon/preview'];
    if (preview) render(preview);
    else {
      const plan = result?.structuredContent?.result;
      if (model?.plan && plan?.id === model.plan.id && plan?.hash === model.plan.hash && typeof plan.status === 'string') {
        render({...model,status:plan.status,plan:{...model.plan,status:plan.status}});
      }
    }
    buttons();
  }
  function rpc(method, params, timeout = 120000) {
    if (window.parent === window) return Promise.reject(new Error('No MCP Apps host is connected.'));
    const id = 'lexicon-ui-' + (++sequence);
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => { pending.delete(id); reject(new Error('The server response timed out. Inspect the plan before retrying.')); }, timeout);
      pending.set(id,{resolve,reject,timer});
      window.parent.postMessage({jsonrpc:'2.0',id,method,params},'*');
    });
  }
  async function decide(decision) {
    if (!available()) return;
    const current = grant;
    let message;
    inFlight = true; grant = undefined; buttons(decision === 'cancel' ? 'Cancelling this plan…' : undefined);
    try {
      const args = {id:current.id,hash:current.hash,token:current.token,decision};
      const result = typeof window.openai?.callTool === 'function'
        ? await window.openai.callTool('lexicon_confirm_change_plan',args)
        : await rpc('tools/call',{name:'lexicon_confirm_change_plan',arguments:args});
      if (result?.isError) throw new Error(result.content?.find(item=>item.type==='text')?.text ?? 'The server rejected this approval.');
      output(result);
      if (model?.plan?.status === 'pending') message = 'Approval returned no final plan state. Inspect the plan before retrying.';
    } catch (error) {
      grant = undefined;
      message = error?.message ?? 'Approval failed. Inspect the plan before retrying.';
    } finally {
      inFlight = false;
      buttons(message);
    }
  }
  apply.addEventListener('click',()=>decide('apply'));
  cancel.addEventListener('click',()=>decide('cancel'));
  search.addEventListener('input', filter);
  document.getElementById('show-details').addEventListener('click', () => {
    const details = document.getElementById('details'); details.hidden = !details.hidden;
    details.textContent = model ? JSON.stringify(model, null, 2) : 'No result received.';
    document.getElementById('show-details').setAttribute('aria-expanded', String(!details.hidden));
    document.getElementById('show-details').textContent = details.hidden ? 'Show preview data' : 'Hide preview data';
    resize();
  });
  window.addEventListener('message',event=>{
    if (event.source !== window.parent) return;
    const message = event.data;
    if (!message || message.jsonrpc !== '2.0') return;
    if (pending.has(message.id)) {
      const request = pending.get(message.id);pending.delete(message.id);clearTimeout(request.timer);
      if (message.error) request.reject(new Error(message.error.message ?? 'Host request failed.'));
      else request.resolve(message.result);
      return;
    }
    if (message.method === 'ui/notifications/tool-result') output(message.params);
    if (message.method === 'ui/notifications/host-context-changed') theme(message.params);
  });
  window.addEventListener('message',event=>{
    if (event.source !== window.parent && event.source !== window) return;
    if (event.data?.type !== 'ui-lifecycle-iframe-render-data') return;
    const data=event.data.payload?.renderData;theme(data);output(data?.toolOutput);
  });
  window.addEventListener('openai:set_globals',event=>{
    const globals=event.detail?.globals;
    if (globals?.toolOutput || globals?.toolResponseMetadata) output({structuredContent:globals.toolOutput,_meta:globals.toolResponseMetadata});
  });
  const initial=document.getElementById('initial');
  if(initial.textContent){try{render(JSON.parse(initial.textContent));}catch{/* Stay safely empty. */}}
  if(typeof window.openai?.callTool==='function'){
    ready=true;output({structuredContent:window.openai.toolOutput,_meta:window.openai.toolResponseMetadata});
  } else if(window.parent !== window) {
    rpc('ui/initialize',{appInfo:{name:'Lexicon library preview',version:'1.0.0'},appCapabilities:{},protocolVersion:'2025-11-21'},15000)
      .then(result=>{ready=true;theme(result?.hostContext);window.parent.postMessage({jsonrpc:'2.0',method:'ui/notifications/initialized',params:{}},'*');buttons();resize();})
      .catch(()=>buttons('This client does not provide the MCP Apps confirmation bridge. Changes remain blocked.'));
  }
  window.parent.postMessage({type:'ui-lifecycle-iframe-ready'},'*');
  if (typeof ResizeObserver === 'function') new ResizeObserver(resize).observe(document.body);
  setInterval(()=>{if(grant && expires(grant.expiresAt)<=Date.now()){grant=undefined;buttons('This approval expired. Reopen the plan preview to refresh it.');}},1000);
  buttons();
})();`;
