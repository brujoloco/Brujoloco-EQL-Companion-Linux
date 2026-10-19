// phonePage/app.ts — the phone app's own script: pairing, the socket, the cipher, the tabs.
//
// Embedded as a string for `render.ts`'s reason (that file's header says it at length). Everything
// here runs in the browser under a strict CSP: one nonce'd `<script>`, `connect-src 'self'` plus
// the one wss origin, and no `eval`, no `new Function`, no injected `<script>`.
//
// ── THE KEY LEAVES THE ADDRESS BAR ON FIRST OPEN ───────────────────────────────────────────────
//
// The pair link is `…/phone/#r=<roomId>&k=<viewKey>`. A fragment is never sent to a server, so the
// key reaches this page and nothing else. On first open it is copied into `localStorage` and then
// REMOVED from the address bar with `history.replaceState`, because the most likely way somebody
// accidentally shares their key is a screenshot of a browser with the URL visible. "Forget this PC"
// is the way back out.
//
// ── EVERY localStorage CALL IS WRAPPED ─────────────────────────────────────────────────────────
//
// It throws in a private window and where site data is blocked, and it can come back empty for a
// dozen reasons. A page that cannot store still works for the session; it simply asks to be paired
// again next time.
//
// ── THE TAG IS AT THE FRONT AND WebCrypto WANTS IT AT THE BACK ─────────────────────────────────
//
// The wire is `tag ‖ ciphertext` (so a truncated frame fails a length check rather than
// authenticating a prefix); `crypto.subtle.decrypt` takes `ciphertext ‖ tag`. `open()` moves it,
// and that is the only place the two conventions meet.
//
// NO TEMPLATE LITERALS below - this file is one, so a `$` and a brace in the client source would
// interpolate here instead of shipping.

export const PHONE_APP = `
(function(){
'use strict';
var PAIR='eqzera.phone.pair',TAB='eqzera.phone.tab';
var TABS=['live','run','timers','character','events'];
var data={},pairing=null,key=null,sock=null,desk=false,open=false;
var tab='live',lastAt=0,tries=0,wake=null,timer=null;

function save(k,v){try{if(v===null)localStorage.removeItem(k);else localStorage.setItem(k,v)}catch(e){}}
function load(k){try{return localStorage.getItem(k)}catch(e){return null}}
function el(id){return document.getElementById(id)}

function bytes(s){s=String(s).replace(/-/g,'+').replace(/_/g,'/');
var bin=atob(s),out=new Uint8Array(bin.length);
for(var i=0;i<bin.length;i++)out[i]=bin.charCodeAt(i);return out}

function readPairing(){
var frag=(location.hash||'').replace(/^#/,'');
var r=/(?:^|&)r=([A-Za-z0-9_-]{22})(?:&|$)/.exec(frag);
var k=/(?:^|&)k=([A-Za-z0-9_-]{43})(?:&|$)/.exec(frag);
if(r&&k){var fresh={r:r[1],k:k[1]};save(PAIR,JSON.stringify(fresh));
try{history.replaceState(null,'',location.pathname)}catch(e){}
return fresh}
var held=load(PAIR);if(!held)return null;
try{var q=JSON.parse(held);return q&&/^[A-Za-z0-9_-]{22}$/.test(q.r)&&/^[A-Za-z0-9_-]{43}$/.test(q.k)?q:null}
catch(e){return null}}

function importKey(raw){return crypto.subtle.importKey('raw',bytes(raw),{name:'AES-GCM'},false,['decrypt'])}

function open2(frame){
var iv=bytes(frame.n),blob=bytes(frame.d);
if(iv.length!==12||blob.length<16)return Promise.resolve(null);
var body=new Uint8Array(blob.length);
body.set(blob.subarray(16),0);body.set(blob.subarray(0,16),blob.length-16);
var aad=new TextEncoder().encode('phone-v1|'+frame.c+'|'+frame.s);
// A BOX, not the value: a frame that legitimately says "no fight" decrypts to null, and a frame
// this phone cannot open answers null too. One of those must be drawn and the other ignored.
return crypto.subtle.decrypt({name:'AES-GCM',iv:iv,additionalData:aad,tagLength:128},key,body)
.then(function(plain){return {v:JSON.parse(new TextDecoder().decode(plain))}})
.catch(function(){return null})}

function pill(){
var p=el('pill');if(!p)return;
var cls='pill',text='Reconnecting';
if(open&&desk){cls='pill live';text='Live'}
else if(open&&!desk){cls='pill off';text='Desk offline'}
else{cls='pill wait'}
var stale=lastAt>0&&Date.now()-lastAt>5000;
p.className=cls;
p.textContent=stale?text+' \\u00b7 '+Math.round((Date.now()-lastAt)/1000)+'s':text}

function head(){
var s=data.status;
var who=el('who'),sub=el('sub');
if(!who||!sub)return;
who.textContent=s&&s.name?s.name:'EQ Zera';
var bits=[];
if(s&&s.level)bits.push('Lv '+s.level);
if(s&&s.classes&&s.classes.length)bits.push(s.classes.join('/'));
if(s&&s.zone)bits.push(s.zone);
if(s&&s.inCombat)bits.push('in combat');
sub.textContent=bits.join(' \\u00b7 ')}

function paint(){
var now=Date.now(),body=el('body');
if(!body)return;
if(tab==='live')body.innerHTML=renderLive(data);
else if(tab==='run')body.innerHTML=renderRun(data,now);
else if(tab==='timers')body.innerHTML=renderTimers(data,now);
else if(tab==='character')body.innerHTML=renderCharacter(data);
else body.innerHTML=renderEvents(data,now);
widths(body);
head();pill()}

function pickTab(next){
tab=next;save(TAB,next);
var bs=document.querySelectorAll('.tabs button');
for(var i=0;i<bs.length;i++){bs[i].setAttribute('aria-selected',String(bs[i].getAttribute('data-tab')===next))}
paint()}

function connect(){
if(!pairing||sock)return;
var url=(location.protocol==='https:'?'wss://':'ws://')+location.host+'/phone/room/'+pairing.r+'/view';
try{sock=new WebSocket(url,['eqzera.view.v1'])}catch(e){sock=null;retry();return}
sock.onopen=function(){open=true;tries=0;pill()};
sock.onclose=function(){sock=null;open=false;desk=false;pill();retry()};
sock.onerror=function(){try{sock&&sock.close()}catch(e){}};
sock.onmessage=function(ev){
var m;try{m=JSON.parse(ev.data)}catch(e){return}
if(m.t==='o'){desk=!!m.desk;pill();return}
if(m.t!=='f')return;
open2(m).then(function(box){
if(!box)return;
data[m.c]=box.v;lastAt=Date.now();paint()})}}

function retry(){
var ladder=[1000,2000,5000,15000,30000,60000];
var wait=ladder[Math.min(tries,ladder.length-1)];tries++;
setTimeout(connect,wait)}

function keepAwake(on){
var btn=el('wake');
if(!on){if(wake){try{wake.release()}catch(e){}wake=null}if(btn)btn.textContent='Keep screen on';return}
if(!navigator.wakeLock)return;
navigator.wakeLock.request('screen').then(function(s){wake=s;if(btn)btn.textContent='Screen stays on';
s.addEventListener('release',function(){wake=null;if(btn)btn.textContent='Keep screen on'})})
.catch(function(){})}

function boot(){
pairing=readPairing();
if(!pairing){el('first').classList.remove('hide');return}
el('app').classList.remove('hide');
var held=load(TAB);if(held&&TABS.indexOf(held)>=0)tab=held;
var bs=document.querySelectorAll('.tabs button');
for(var i=0;i<bs.length;i++){(function(b){b.addEventListener('click',function(){pickTab(b.getAttribute('data-tab'))})})(bs[i])}
var w=el('wake');
if(w&&navigator.wakeLock)w.addEventListener('click',function(){keepAwake(!wake)});
else if(w)w.classList.add('hide');
var f=el('forget');
if(f)f.addEventListener('click',function(){save(PAIR,null);location.replace(location.pathname)});
document.addEventListener('visibilitychange',function(){
if(document.visibilityState==='visible'){if(!sock)connect();if(wake===null&&w&&w.textContent!=='Keep screen on')keepAwake(true)}});
pickTab(tab);
importKey(pairing.k).then(function(k){key=k;connect()}).catch(function(){
el('app').classList.add('hide');el('first').classList.remove('hide')});
timer=setInterval(paint,1000);
if('serviceWorker' in navigator){navigator.serviceWorker.register('/phone/sw.js').catch(function(){})}}

if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot);else boot();
})();
`
