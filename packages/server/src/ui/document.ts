import { createHash } from "node:crypto";
import { createUIResource } from "@mcp-ui/server";
import { previewClient } from "./client.js";
import type { Preview } from "./model.js";

export const PREVIEW_URI = "ui://lexicon/library-review/v2.html";
export const PREVIEW_MIME = "text/html;profile=mcp-app";
const styles = `button:disabled{opacity:.5;cursor:not-allowed}button.primary{background:var(--accent);color:var(--bg);font-weight:650}button.primary:hover:not(:disabled){filter:brightness(.94)}.approval{border-top:1px solid var(--line);margin-top:20px;padding-top:16px}.approval-buttons{display:flex;gap:8px;justify-content:flex-end}.approval p{margin-top:10px;font-size:13px}
:root{color-scheme:light dark;--bg:#fafaf8;--fg:#202622;--muted:#59635d;--line:#d7ddd8;--accent:#245d3e;--soft:#edf3ee;font:14px/1.55 ui-sans-serif,system-ui,-apple-system,"Segoe UI",sans-serif}
@media(prefers-color-scheme:dark){:root{--bg:#151b18;--fg:#e5ece7;--muted:#a7b7ad;--line:#3c4b42;--accent:#9ad5b0;--soft:#24332a}}
:root[data-theme=light]{color-scheme:light;--bg:#fafaf8;--fg:#202622;--muted:#59635d;--line:#d7ddd8;--accent:#245d3e;--soft:#edf3ee}
:root[data-theme=dark]{color-scheme:dark;--bg:#151b18;--fg:#e5ece7;--muted:#a7b7ad;--line:#3c4b42;--accent:#9ad5b0;--soft:#24332a}
*{box-sizing:border-box}body{margin:0;padding:24px;background:var(--bg);color:var(--fg)}main{max-width:1040px;margin:auto}h1{font-size:24px;line-height:1.25;letter-spacing:-.02em;margin:0 0 8px;font-weight:650}p{margin:0;color:var(--muted);max-width:72ch}.heading{display:flex;align-items:start;justify-content:space-between;gap:16px}.state{white-space:nowrap;color:var(--accent);background:var(--soft);padding:4px 10px;border-radius:6px;font-size:12px;font-weight:650;text-transform:capitalize}dl{display:flex;flex-wrap:wrap;gap:4px 12px;padding:16px 0;margin:0 0 8px;border-bottom:1px solid var(--line);font-variant-numeric:tabular-nums}dt{color:var(--muted)}dd{margin:0 24px 0 0;overflow-wrap:anywhere}.toolbar{display:flex;align-items:end;justify-content:space-between;gap:16px;margin:20px 0 12px}label{display:block;font-weight:600}input{display:block;margin-top:5px;min-width:250px;padding:9px 12px;border:1px solid var(--line);border-radius:6px;background:var(--bg);color:var(--fg);font:inherit;caret-color:var(--accent)}input::placeholder{color:var(--muted)}input:disabled{opacity:.7}button{padding:8px 11px;border:1px solid var(--line);background:var(--bg);color:var(--fg);border-radius:6px;font:inherit;cursor:pointer}button:hover{background:var(--soft)}input:focus-visible,button:focus-visible{outline:2px solid var(--accent);outline-offset:3px}.table-wrap{max-height:min(45vh,420px);overflow:auto;border-top:1px solid var(--line);border-bottom:1px solid var(--line);scrollbar-color:var(--line) var(--bg)}table{width:100%;border-collapse:collapse;font-variant-numeric:tabular-nums;text-align:left}th{font-weight:650;color:var(--muted);font-size:12px;background:var(--soft);padding:10px 12px;white-space:nowrap}td{padding:14px 12px;border-top:1px solid var(--line);vertical-align:top;min-width:100px;max-width:300px;overflow-wrap:anywhere}td{white-space:pre-wrap}td:first-child{font-weight:550}tbody tr:hover{background:var(--soft)}[hidden]{display:none!important}.support{font-size:12px;color:var(--muted)}.notice{margin-top:14px;font-size:13px}.footer{display:flex;gap:16px;align-items:center;justify-content:space-between;margin-top:20px}.empty{padding:30px 12px}.sr-only{position:absolute;width:1px;height:1px;padding:0;overflow:hidden;clip:rect(0,0,0,0);white-space:nowrap;border:0}pre{max-height:280px;overflow:auto;white-space:pre-wrap;background:var(--soft);padding:14px;border-radius:6px;font-size:12px}::selection{background:var(--accent);color:var(--bg)}
@media(max-width:520px){body{padding:16px}h1{font-size:21px}.heading{display:block}.state{display:inline-block;margin-top:12px}.toolbar{display:block}.toolbar .support{margin-top:10px}input{width:100%;min-width:0}.footer{align-items:start;flex-direction:column;gap:12px}table,tbody{display:block}thead{display:none}tr{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);border-top:1px solid var(--line);padding:8px 0;gap:8px 16px}td{display:block;border:0;padding:5px 0;min-width:0;max-width:none}td:first-child,table[data-columns="4"] td:nth-child(2),td:last-child:nth-child(3){grid-column:1/-1}td::before{content:attr(data-label);display:block;font-size:11px;font-weight:600;color:var(--muted);margin-bottom:3px}dl{gap:4px 8px}dd{margin-right:12px}}
`;

function serialized(value: unknown) {
  return JSON.stringify(value ?? null).replace(
    /[<>&]/g,
    (character) =>
      String.fromCharCode(92) +
      "u" +
      character.charCodeAt(0).toString(16).padStart(4, "0"),
  );
}

export function previewResource(preview?: Preview, apps = false) {
  const resource = createUIResource({
    uri: PREVIEW_URI,
    encoding: "text",
    content: {
      type: "rawHtml",
      htmlString: `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Lexicon library preview</title><style>${styles}</style></head><body><main aria-label="Lexicon library preview"><div class="heading"><div><h1 id="title">Library preview</h1><p id="description">Run a library report or create a change plan to inspect its results here.</p></div><span id="state" class="state">Waiting for results</span></div><dl id="facts"></dl><div class="toolbar"><label for="filter">Filter visible rows<input id="filter" type="search" placeholder="Track, field, or finding" disabled></label><p id="row-status" class="support" role="status" aria-live="polite"></p></div><div id="preview" class="table-wrap" role="region" aria-label="Changes and report rows" tabindex="0"></div><p id="empty" class="empty">No results to display.</p><p id="truncation" class="notice" hidden>This preview shows a bounded page. Ask the assistant for the next page or full report.</p><section id="approval-controls" class="approval" aria-label="Confirm library changes" hidden><div class="approval-buttons"><button id="cancel-changes" type="button" disabled>Cancel</button><button id="apply-changes" type="button" class="primary" disabled>Apply changes</button></div><p id="approval-status" role="status" aria-live="polite"></p></section><div class="footer"><p id="note" class="support">Library changes require explicit approval in the confirmation controls.</p><button id="show-details" type="button" aria-expanded="false" aria-controls="details">Show preview data</button></div><pre id="details" hidden></pre></main><script id="initial" type="application/json">${serialized(preview)}</script><script>${previewClient}</script></body></html>`,
    },

    metadata: {
      ui: { csp: { connectDomains: [], resourceDomains: [] } },
      "lexicon/renderMode": apps ? "template" : "embedded",
    },
  });
  const html =
    ("text" in resource.resource ? resource.resource.text : "") ?? "";
  const blocks = ["script", "style"].flatMap((tag) =>
    html
      .split(`<${tag}`)
      .slice(1)
      .map((part) =>
        part.slice(part.indexOf(">") + 1, part.indexOf(`</${tag}>`)),
      ),
  );
  const hashes = blocks.map(
    (block) =>
      `'sha256-${createHash("sha256").update(block).digest("base64")}'`,
  );
  const csp = `default-src 'none'; script-src ${hashes.join(" ")}; style-src ${hashes.join(" ")}; connect-src 'none'; img-src 'none'; font-src 'none'; base-uri 'none'; form-action 'none'; frame-src 'none'`;
  const secured = html.replace(
    "<head>",
    `<head><meta http-equiv="Content-Security-Policy" content="${csp}">`,
  );
  return {
    ...resource,
    resource: { ...resource.resource, mimeType: PREVIEW_MIME, text: secured },
  };
}
