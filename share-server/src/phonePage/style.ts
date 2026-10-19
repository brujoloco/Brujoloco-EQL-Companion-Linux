// phonePage/style.ts — the phone app's stylesheet, as one string the page nonces into a <style>.
//
// Same arrangement as `pageStyle.ts` and the same palette tokens (website/additional.css: ground
// #0c0a1f, panel #1a1638, line #2d2757, ink #efeaff, cyan #5ee6ff, pink #ff5fb8), so the share page
// and the phone app are recognisably one product. It is MOBILE FIRST rather than a narrowed desktop
// page: a fixed bottom tab bar, safe-area insets for the notch and the home indicator, 16px side
// gutters, and no horizontal scroll at any width.
//
// NO @font-face, for `pageStyle.ts`'s reason exactly: the CSP has no `font-src`, so every face is
// named with a system fallback. Nothing here emits a `style=` attribute either - the CSP is
// nonce-based and an inline style attribute is not nonce-able, so the meter bars are sized by a
// CSS custom property the script sets, which IS allowed.

export const PHONE_STYLE = `
:root{--ground:#0c0a1f;--ground2:#13102c;--panel:#1a1638;--line:#2d2757;--ink:#efeaff;
--ink2:#b8b0d9;--ink3:#7d75a6;--cyan:#5ee6ff;--pink:#ff5fb8;--violet:#a98fe0;--sun:#c7a2ff;
--good:#6ee7a8;--bar:56px;
--display:'Chakra Petch','Bahnschrift','Segoe UI',sans-serif;
--body:'Source Sans 3','Segoe UI',system-ui,sans-serif;
--mono:'JetBrains Mono','Cascadia Code',Consolas,monospace}
*{box-sizing:border-box}
html,body{overflow-x:hidden}
body{margin:0;background:var(--ground);color:var(--ink);font-family:var(--body);font-size:16px;
line-height:1.45;-webkit-text-size-adjust:100%}
a{color:var(--cyan);text-decoration:none}
main{padding:12px 16px calc(var(--bar) + 28px + env(safe-area-inset-bottom));max-width:720px;margin:0 auto}
h1{font-family:var(--display);font-size:26px;margin:0 0 8px}
h2{font-family:var(--display);font-size:12px;letter-spacing:.16em;text-transform:uppercase;
color:var(--pink);margin:0 0 10px}
p{margin:0 0 10px}
.muted{color:var(--ink3);font-size:14px}
.panel{background:var(--panel);border:1px solid var(--line);border-radius:12px;padding:14px;margin:0 0 12px}
.top{position:sticky;top:0;z-index:5;background:var(--ground);padding:calc(8px + env(safe-area-inset-top)) 16px 8px;
border-bottom:1px solid var(--line);display:flex;align-items:center;gap:10px;flex-wrap:wrap}
.who{font-family:var(--display);font-size:17px;flex:1 1 auto;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.sub{color:var(--ink3);font-size:13px;font-family:var(--mono)}
.pill{font-family:var(--mono);font-size:11px;letter-spacing:.1em;text-transform:uppercase;
padding:4px 9px;border-radius:999px;border:1px solid var(--line);color:var(--ink3);white-space:nowrap}
.pill.live{color:#0c0a1f;background:var(--good);border-color:var(--good)}
.pill.wait{color:#0c0a1f;background:var(--sun);border-color:var(--sun)}
.pill.off{color:var(--ink);background:transparent;border-color:var(--pink)}
.tabs{position:fixed;left:0;right:0;bottom:0;z-index:6;display:flex;background:var(--ground2);
border-top:1px solid var(--line);padding-bottom:env(safe-area-inset-bottom)}
.tabs button{flex:1 1 0;min-width:0;height:var(--bar);border:0;background:transparent;color:var(--ink3);
font-family:var(--display);font-size:12px;letter-spacing:.08em;text-transform:uppercase;cursor:pointer}
.tabs button[aria-selected="true"]{color:var(--cyan);box-shadow:inset 0 2px 0 var(--cyan)}
.rows{list-style:none;margin:0;padding:0}
.rows li{padding:8px 0;border-top:1px solid var(--line)}
.rows li:first-child{border-top:0}
.meter{display:grid;grid-template-columns:1fr auto;gap:2px 10px;align-items:baseline}
.meter .nm{font-size:15px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.meter .nm.you{color:var(--cyan);font-weight:600}
.meter .v{font-family:var(--mono);font-size:13px;color:var(--ink2);text-align:right;white-space:nowrap}
.track{grid-column:1 / -1;height:7px;border-radius:4px;background:var(--ground2);border:1px solid var(--line);overflow:hidden}
.fill{display:block;height:100%;width:var(--w,0%);background:linear-gradient(90deg,var(--cyan),var(--pink))}
.fill.you{background:linear-gradient(90deg,var(--cyan),var(--sun))}
.stats{display:flex;flex-wrap:wrap;gap:8px;list-style:none;margin:0;padding:0}
.stats li{background:var(--ground2);border:1px solid var(--line);border-radius:8px;padding:6px 10px;font-size:14px;
display:flex;gap:8px}
.stats .k{color:var(--ink3)}
.stats .v{font-family:var(--mono);color:var(--cyan)}
.timer{display:grid;grid-template-columns:1fr auto;gap:2px 10px;align-items:baseline}
.timer .t{font-family:var(--mono);font-size:15px;color:var(--cyan);white-space:nowrap}
.timer .t.open{color:var(--pink)}
.timer .t.up::before{content:'+';opacity:.7}
.timer .where{grid-column:1;color:var(--ink3);font-size:13px}
.ev{display:grid;grid-template-columns:1fr auto;gap:2px 10px}
.ev .k{grid-column:1;font-family:var(--mono);font-size:11px;letter-spacing:.1em;text-transform:uppercase;color:var(--violet)}
.ev .when{font-family:var(--mono);font-size:12px;color:var(--ink3);white-space:nowrap}
.slots{list-style:none;margin:0;padding:0}
.slots>li{display:grid;grid-template-columns:96px 1fr;gap:2px 10px;padding:8px 0;border-top:1px solid var(--line)}
.slots>li:first-child{border-top:0}
.slot{color:var(--ink3);font-size:13px;font-family:var(--mono)}
.item{color:var(--ink)}
.rank{display:inline-block;margin-left:6px;padding:0 6px;border-radius:999px;font-family:var(--mono);
font-size:11px;line-height:18px;color:#0c0a1f;background:linear-gradient(135deg,var(--cyan),var(--sun))}
.gear summary{cursor:pointer;list-style:none}
.gear summary::-webkit-details-marker{display:none}
.facts{margin:8px 0 2px;padding:10px;border:1px solid var(--line);border-radius:8px;background:var(--ground2)}
.facts .stats{margin:0}
.ex{grid-column:2;color:var(--violet);font-size:13px}
.btn{font-family:var(--display);font-weight:700;font-size:15px;letter-spacing:.03em;padding:11px 18px;
border:0;border-radius:8px;cursor:pointer;color:#0c0a1f;background:linear-gradient(135deg,var(--cyan),#8ab4ff 55%,var(--pink))}
.btn.ghost{background:transparent;color:var(--ink2);border:1px solid var(--line)}
.row{display:flex;gap:10px;flex-wrap:wrap;align-items:center}
.hide{display:none!important}
.first{padding:28px 16px;max-width:520px;margin:0 auto;text-align:center}
.first ol{text-align:left;color:var(--ink2);font-size:15px;padding-left:20px}
@media (prefers-reduced-motion:reduce){*{transition:none!important;animation:none!important}}
`
