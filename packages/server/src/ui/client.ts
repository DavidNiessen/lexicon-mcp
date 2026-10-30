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
  let toolCallAvailable = false, hostBridgeFailed = false;
  let authoritative = false, restoring = false, savedSnapshot, lastHeight = 0;
  const text = value => String(value ?? '—').slice(0, 401);
  const node = (tag, value) => { const item = document.createElement(tag); if (value !== undefined) item.textContent = text(value); return item; };
  const expires = value => typeof value === 'number' ? value : Date.parse(value);
  const bridgeFailure = "Claude's widget tool-call bridge is unavailable (IPC unavailable). This preview cannot confirm the operation. Inspect the saved plan in Claude's Chat tab or another UI-capable client before trying again. This view will not retry automatically.";
  const own = (value, key) => value && Object.prototype.hasOwnProperty.call(value, key);
  const final = value => ['completed','cancelled','failed','interrupted'].includes(value?.plan?.status);
  function snapshot(value) {
    if (!value || !Array.isArray(value.rows) || !Array.isArray(value.columns)) return;
    return {
      title:text(value.title),description:text(value.description),status:text(value.status),note:text(value.note),
      columns:value.columns.slice(0,6).map(text),rows:value.rows.slice(0,100).filter(Array.isArray).map(row=>row.slice(0,6).map(text)),
      facts:(Array.isArray(value.facts)?value.facts:[]).slice(0,8).filter(Array.isArray).map(pair=>pair.slice(0,2).map(text)),
      total:Number.isFinite(value.total)?value.total:0,
      ...(value.plan?{plan:{id:text(value.plan.id),hash:text(value.plan.hash),status:text(value.plan.status)}}:{})
    };
  }
  function persist() {
    if (restoring || !model || typeof window.openai?.setWidgetState !== 'function') return;
    // A presentation cache is never approval authority. In particular, never persist grant.
    const state={privateContent:{lexicon:{version:1,preview:snapshot(model),filter:search.value.slice(0,200),detailsOpen:!document.getElementById('details').hidden}}};
    const serialized=JSON.stringify(state);
    if (serialized===savedSnapshot) return;
    try { window.openai.setWidgetState(state); savedSnapshot=serialized; } catch { /* Host persistence is optional. */ }
  }
  function restore(state) {
    const cached=state?.privateContent?.lexicon;
    if (cached?.version!==1 || authoritative) return;
    const value=snapshot(cached.preview);
    if (!value || (model?.plan && value.plan?.id!==model.plan.id)) return;
    restoring=true;
    if (typeof cached.filter==='string') search.value=cached.filter.slice(0,200);
    const details=document.getElementById('details');details.hidden=cached.detailsOpen!==true;
    if (value) render(value);
    details.textContent=details.hidden?'':JSON.stringify(model,null,2);
    document.getElementById('show-details').setAttribute('aria-expanded',String(!details.hidden));
    document.getElementById('show-details').textContent=details.hidden?'Show preview data':'Hide preview data';
    restoring=false;
  }
  function resize(force = false) {
    const height = Math.ceil(Math.max(document.body?.scrollHeight ?? 0,document.documentElement.scrollHeight));
    if (!ready || document.visibilityState==='hidden' || !Number.isFinite(height) || height <= 0 || (!force && height===lastHeight)) return;
    lastHeight=height;
    if (typeof window.openai?.notifyIntrinsicHeight === 'function') window.openai.notifyIntrinsicHeight(height);
    else if (window.parent !== window) window.parent.postMessage({jsonrpc:'2.0',method:'ui/notifications/size-changed',params:{height}},'*');
  }
  function available() {
    return ready && toolCallAvailable && !hostBridgeFailed && !inFlight && model?.plan?.status === 'pending' && grant &&
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
    else if (hostBridgeFailed) feedback.textContent = bridgeFailure;
    else if (!ready) feedback.textContent = 'This client has not connected the confirmation UI. Changes remain blocked.';
    else if (!toolCallAvailable) feedback.textContent = 'This host can display previews but does not advertise MCP tool-call support. Approval controls are disabled. Open it in a client or surface that can forward widget tool calls.';
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
    // Hosts may replay the original planner result after restoring a completed widget.
    if (final(model) && model.plan.id===value.plan?.id && model.plan.hash===value.plan.hash && value.plan.status==='pending') return;
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
    filter(); buttons(); resize(); persist();
  }
  function theme(context) {
    const root=document.documentElement;
    if (context?.theme === 'light' || context?.theme === 'dark') {
      root.dataset.theme=context.theme;
      // An iframe scheme mismatch paints an opaque UA canvas even with transparent CSS.
      root.style.setProperty('color-scheme',context.theme);
    }
    for(const [name,value] of Object.entries(context?.styles?.variables ?? {})) {
      if(!/^--(?:color-[a-z0-9-]+|font-sans|font-mono)$/.test(name) || typeof value!=='string' || value.length>1024 || /[;{}]|url\s*\(/i.test(value)) continue;
      root.style.setProperty(name,value);
    }
  }
  function output(result) {
    const parts=[],seen=new Set();
    function visit(value,depth=0) {
      if (!value || typeof value!=='object' || depth>5 || seen.has(value)) return;
      seen.add(value);parts.push(value);
      for(const key of ['_meta','mcp_tool_result','call_tool_result']) visit(value[key],depth+1);
      if(value.result && (value.result._meta || value.result.structuredContent || value.result.content)) visit(value.result,depth+1);
    }
    visit(result);
    let preview,plan,hasGrant=false,nextGrant;
    for(const part of parts) {
      if(own(part,'lexicon/preview')) preview=part['lexicon/preview'];
      if(own(part,'lexicon/approval')) {hasGrant=true;nextGrant=part['lexicon/approval'];}
      const data=part.structuredContent?.result;
      if(data) plan=data.plan ?? data;
      if(!preview && Array.isArray(part.content)) {
        const html=part.content.find(item=>item.type==='resource' && typeof item.resource?.text==='string')?.resource.text;
        const initial=html?.match(/<script id="initial" type="application\/json">([\s\S]*?)<\/script>/)?.[1];
        if(initial) {try {preview=JSON.parse(initial);} catch {/* Ignore incomplete host snapshots. */}}
      }
    }
    if (preview) {authoritative=true;render(snapshot(preview));}
    else {
      if (model?.plan && plan?.id === model.plan.id && plan?.hash === model.plan.hash && typeof plan.status === 'string') {
        authoritative=true;
        render({...model,status:plan.status,plan:{...model.plan,status:plan.status}});
      }
    }
    if(hasGrant) grant=nextGrant;
    if(final(model) || (grant && (grant.id!==model?.plan?.id || grant.hash!==model?.plan?.hash))) grant=undefined;
    buttons();
  }
  function globals(value=window.openai) {
    if(typeof window.openai?.callTool==='function') {ready=true;if(!hostBridgeFailed)toolCallAvailable=true;}
    theme(value);
    restore(value?.widgetState ?? window.openai?.widgetState);
    output({structuredContent:value?.toolOutput ?? window.openai?.toolOutput,_meta:value?.toolResponseMetadata ?? window.openai?.toolResponseMetadata});
    buttons();resize(true);
  }
  function visible() {
    if(document.visibilityState==='hidden') return;
    globals();resize(true);
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
      const detail=String(error?.message ?? 'Approval failed. Inspect the plan before retrying.');
      if(detail.includes('IPC not available for MCP tool call')) {
        hostBridgeFailed=true;toolCallAvailable=false;message=bridgeFailure;
      } else message=detail;
    } finally {
      inFlight = false;
      buttons(message);
    }
  }
  apply.addEventListener('click',()=>decide('apply'));
  cancel.addEventListener('click',()=>decide('cancel'));
  search.addEventListener('input', ()=>{filter();persist();});
  document.getElementById('show-details').addEventListener('click', () => {
    const details = document.getElementById('details'); details.hidden = !details.hidden;
    details.textContent = model ? JSON.stringify(model, null, 2) : 'No result received.';
    document.getElementById('show-details').setAttribute('aria-expanded', String(!details.hidden));
    document.getElementById('show-details').textContent = details.hidden ? 'Show preview data' : 'Hide preview data';
    resize();persist();
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
    if (message.method === 'ui/notifications/host-context-changed') {theme(message.params);resize(true);}
  });
  window.addEventListener('message',event=>{
    if (event.source !== window.parent && event.source !== window) return;
    if (event.data?.type !== 'ui-lifecycle-iframe-render-data') return;
    const data=event.data.payload?.renderData;theme(data);output(data?.toolOutput);
  });
  window.addEventListener('openai:set_globals',event=>{
    globals(event.detail?.globals);
  });
  window.addEventListener('pageshow',visible);
  window.addEventListener('focus',visible);
  window.addEventListener('pagehide',persist);
  document.addEventListener('visibilitychange',visible);
  const initial=document.getElementById('initial');
  restoring=true;
  if(initial.textContent){try{render(JSON.parse(initial.textContent));}catch{/* Stay safely empty. */}}
  restoring=false;
  globals();
  if(!ready && window.parent !== window) {
    rpc('ui/initialize',{appInfo:{name:'Lexicon library preview',version:'1.0.0'},appCapabilities:{},protocolVersion:'2026-01-26'},15000)
      .then(result=>{ready=true;const proxy=result?.hostCapabilities?.serverTools;toolCallAvailable=!hostBridgeFailed && Boolean(proxy && typeof proxy==='object' && !Array.isArray(proxy));theme(result?.hostContext);window.parent.postMessage({jsonrpc:'2.0',method:'ui/notifications/initialized',params:{}},'*');buttons();resize();})
      .catch(()=>{if(!ready)buttons('This client does not provide the MCP Apps confirmation bridge. Changes remain blocked.');});
  }
  window.parent.postMessage({type:'ui-lifecycle-iframe-ready'},'*');
  if (typeof ResizeObserver === 'function') new ResizeObserver(()=>resize()).observe(document.body);
  setInterval(()=>{if(!ready && typeof window.openai?.callTool==='function')globals();if(grant && expires(grant.expiresAt)<=Date.now()){grant=undefined;buttons('This approval expired. Reopen the plan preview to refresh it.');}},1000);
  buttons();
})();`;
