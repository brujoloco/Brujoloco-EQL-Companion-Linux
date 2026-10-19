// phonePage/render.ts — the five tabs, as browser JavaScript in a string.
//
// WHY A STRING AND NOT A MODULE. `page.ts` embeds `copyScript`, `hoverScript` and `hotspotScript`
// exactly this way, and the reason is the one that decided it there: `share-server/` has NO BUILD
// STEP of its own — wrangler's esbuild bundles `src/index.ts` and nothing else — so a client script
// has to reach the browser as bytes this module can hand to `phonePage.ts`. The alternative is a
// second toolchain for one page.
//
// TWO RULES FOR EVERYTHING BELOW, and both are CSP:
//
//   * NO `style=` ATTRIBUTES. `style-src 'nonce-…'` with no `unsafe-inline` blocks inline style
//     ATTRIBUTES (CSP3 folds `style-src-attr` into it), so a meter bar's width cannot be markup.
//     It is written as `data-w` and applied with `setProperty('--w', …)` — CSSOM from script is not
//     governed by CSP, which is the same trick `page.ts` uses when it emits generated rules.
//   * EVERY VALUE IS ESCAPED. A mob name, an item name and a zone name all come off the log and are
//     arbitrary text; `esc()` is the one door and there is no "it is a number so it is fine" case.
//
// NO TEMPLATE LITERALS in the JavaScript below: this file is itself a template literal, so a `$`
// followed by a brace in the client source would be interpolated here instead of shipped.

export const PHONE_RENDER = `
function esc(v){return String(v==null?'':v).replace(/[&<>"']/g,function(c){
return c==='&'?'&amp;':c==='<'?'&lt;':c==='>'?'&gt;':c==='"'?'&quot;':'&#39;'})}
function num(n){n=Number(n)||0;
if(n>=1000000)return (n/1000000).toFixed(1).replace(/\\.0$/,'')+'M';
if(n>=1000)return (n/1000).toFixed(1).replace(/\\.0$/,'')+'k';return String(Math.round(n))}
function clock(ms){ms=Math.max(0,Math.round(ms/1000));
var h=Math.floor(ms/3600),m=Math.floor(ms%3600/60),s=ms%60;
var mm=(m<10&&h>0?'0':'')+m,ss=(s<10?'0':'')+s;
return (h>0?h+':':'')+mm+':'+ss}
function ago(at,now){var s=Math.max(0,Math.round((now-at)/1000));
if(s<60)return s+'s ago';if(s<3600)return Math.floor(s/60)+'m ago';
if(s<86400)return Math.floor(s/3600)+'h ago';return Math.floor(s/86400)+'d ago'}
function empty(text){return '<div class="panel"><p class="muted">'+esc(text)+'</p></div>'}
function widths(root){var bars=root.querySelectorAll('[data-w]');
for(var i=0;i<bars.length;i++){bars[i].style.setProperty('--w',bars[i].getAttribute('data-w')+'%')}}

function renderLive(d){
var f=d.fight;
if(!f)return empty('No fight yet. Pull something.');
var head='<div class="panel"><h2>'+esc(f.mob)+(f.live?' - live':'')+'</h2>'+
'<ul class="stats"><li><span class="k">Total</span><span class="v">'+num(f.total)+'</span></li>'+
'<li><span class="k">Time</span><span class="v">'+clock(f.durationMs)+'</span></li>'+
(f.you?'<li><span class="k">You</span><span class="v">'+num(f.you.dps)+' dps</span></li>'+
'<li><span class="k">Share</span><span class="v">'+Math.round(f.you.share*100)+'%</span></li>':'')+
'</ul></div>';
var top=f.members.length?f.members[0].damage:0;
var rows=f.members.map(function(m){
var w=top>0?Math.round(m.damage/top*100):0;
return '<li><div class="meter"><span class="nm'+(m.you?' you':'')+'">'+esc(m.name)+
(m.pet?' <span class="sub">pet</span>':'')+'</span>'+
'<span class="v">'+num(m.damage)+' &middot; '+num(m.dps)+' dps &middot; '+Math.round(m.share*100)+'%</span>'+
'<span class="track"><span class="fill'+(m.you?' you':'')+'" data-w="'+w+'"></span></span>'+
'</div></li>'}).join('');
return head+'<div class="panel"><h2>Damage</h2><ul class="rows">'+rows+'</ul></div>'}

function renderRun(d,now){
var r=d.run;
if(!r)return empty('No run yet. Zone into an instance, or start one on the PC.');
var kpm=r.killsPerMin==null?'-':r.killsPerMin.toFixed(1);
var head='<div class="panel"><h2>'+esc(r.base||r.zone)+(r.active?' - live':'')+'</h2>'+
'<ul class="stats">'+
'<li><span class="k">Time</span><span class="v">'+clock(r.active?now-r.startedAt:r.elapsedMs)+'</span></li>'+
'<li><span class="k">Kills</span><span class="v">'+r.kills+'</span></li>'+
'<li><span class="k">Group</span><span class="v">'+r.groupKills+'</span></li>'+
'<li><span class="k">Per min</span><span class="v">'+kpm+'</span></li>'+
(r.doors?'<li><span class="k">Doors</span><span class="v">'+r.doors+'</span></li>':'')+
(r.deaths?'<li><span class="k">Deaths</span><span class="v">'+r.deaths+'</span></li>':'')+
'</ul></div>';
var named=r.named.length?'<div class="panel"><h2>Named</h2><ul class="rows">'+
r.named.slice().reverse().map(function(n){
return '<li><div class="ev"><span>'+esc(n.name)+'</span><span class="when">'+ago(n.at,now)+'</span></div></li>'
}).join('')+'</ul></div>':'';
var keys=r.keys.length?'<div class="panel"><h2>Keys</h2><ul class="stats">'+
r.keys.map(function(k){return '<li><span class="k">'+esc(k.name)+'</span><span class="v">'+k.count+'</span></li>'
}).join('')+'</ul></div>':'';
var chest=r.chest.items?'<div class="panel"><h2>Reward chest</h2><ul class="stats">'+
'<li><span class="k">Items</span><span class="v">'+r.chest.items+'</span></li>'+
'<li><span class="k">Kept</span><span class="v">'+r.chest.kept+'</span></li>'+
'<li><span class="k">Sold</span><span class="v">'+r.chest.sold+'</span></li>'+
'<li><span class="k">Merged</span><span class="v">'+r.chest.merged+'</span></li></ul></div>':
(r.active?empty('Reward chest: not yet.'):'');
return head+named+keys+chest}

function renderTimers(d,now){
var rs=d.respawns||[],bs=d.buffs||[];
var spawn=rs.length?'<div class="panel"><h2>Respawns</h2><ul class="rows">'+rs.map(function(t){
var open=t.dueAt!=null&&now>=t.dueAt;
var text=t.dueAt==null?clock(now-t.baseTs):clock(Math.abs(t.dueAt-now));
return '<li><div class="timer"><span class="nm">'+esc(t.mob)+'</span>'+
'<span class="t'+(open?' open':'')+(t.dueAt==null?' up':'')+'">'+(open?'up ':'')+text+'</span>'+
'<span class="where">'+esc(t.zone)+'</span></div></li>'}).join('')+'</ul></div>':
empty('No respawn timers yet.');
var buffs=bs.length?'<div class="panel"><h2>Your buffs</h2><ul class="rows">'+bs.map(function(b){
var down=b.endsAt!=null;
var text=b.mode==='permanent'?'--':down?clock(b.endsAt-now):clock(now-b.startedTs);
return '<li><div class="timer"><span class="nm">'+esc(b.name)+
(b.count?' <span class="sub">x'+b.count+'</span>':'')+'</span>'+
'<span class="t'+(down?'':' up')+'">'+text+'</span></div></li>'}).join('')+'</ul></div>':'';
return spawn+buffs}

function facts(c){
var bits=[];
if(c.ac!=null)bits.push(['AC',c.ac]);
if(c.hp!=null)bits.push(['HP',c.hp]);
if(c.mana!=null)bits.push(['Mana',c.mana]);
if(c.endurance!=null)bits.push(['Endurance',c.endurance]);
(c.stats||[]).forEach(function(s){bits.push([s.label,s.value])});
if(!bits.length&&!(c.effects||[]).length)return '';
var chips=bits.map(function(b){
return '<li><span class="k">'+esc(b[0])+'</span><span class="v">'+esc(b[1])+'</span></li>'}).join('');
var fx=(c.effects||[]).map(function(e){
return '<li>'+esc(e.name)+(e.detail?' <span class="sub">'+esc(e.detail)+'</span>':'')+'</li>'}).join('');
return '<div class="facts">'+(chips?'<ul class="stats">'+chips+'</ul>':'')+
(fx?'<ul class="rows">'+fx+'</ul>':'')+'</div>'}

function renderCharacter(d){
var p=d.character;
if(!p)return empty('No character yet. On the PC, type /outputfile inventory in game.');
var t=p.totals||{stats:[],saves:[],unsummed:[],counted:0,unknown:0};
var head='<div class="panel"><h2>'+esc(p.name||'A character')+'</h2>'+
'<p class="muted">'+(p.level?'Level '+p.level+' ':'')+esc((p.classes||[]).join(' / '))+'</p>'+
'<ul class="stats"><li><span class="k">AC</span><span class="v">'+(t.ac||0)+'</span></li>'+
(t.stats||[]).map(function(s){
return '<li><span class="k">'+esc(s.label)+'</span><span class="v">'+s.total+'</span></li>'}).join('')+
'</ul></div>';
var gear=(p.cells||[]).map(function(c){
var rank=c.tier!=null?'<span class="rank">+'+c.tier+'</span>':'';
var name='<span class="item">'+esc(c.base!=null?c.base:c.item)+'</span>'+rank;
var inner=facts(c);
var body=inner?'<details class="gear"><summary>'+name+'</summary>'+inner+'</details>':name;
var ex=(c.exaltations||[]).length?'<span class="ex">'+esc(c.exaltations.join(' \\u00b7 '))+'</span>':'';
return '<li><span class="slot">'+esc(c.label)+'</span>'+body+ex+'</li>'}).join('');
return head+'<div class="panel"><h2>Worn gear</h2><ul class="slots">'+gear+'</ul></div>'}

var EVENT_LABEL={levelUp:'Level up',bossKill:'Boss',skyQuestComplete:'Quest',
questItem:'Quest item',wishDrop:'Wish list',death:'Death'};
function renderEvents(d,now){
var evs=d.events||[];
if(!evs.length)return empty('Nothing to celebrate yet.');
return '<div class="panel"><h2>Recent</h2><ul class="rows">'+evs.map(function(e){
return '<li><div class="ev"><span class="k">'+esc(EVENT_LABEL[e.kind]||e.kind)+'</span>'+
'<span class="when">'+ago(e.at,now)+'</span>'+
'<span>'+esc(e.title)+(e.subtitle?' <span class="sub">'+esc(e.subtitle)+'</span>':'')+'</span>'+
'</div></li>'}).join('')+'</ul></div>'}
`
