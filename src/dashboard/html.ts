// Auto-generated from src/dashboard/index.html
// To update: edit index.html then run: bun scripts/gen-dashboard-html.ts
export const DASHBOARD_HTML = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>claude-mem-sync Dashboard</title>
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&display=swap" rel="stylesheet">
<script src="https://cdn.jsdelivr.net/npm/chart.js@4/dist/chart.umd.min.js"></script>
<style>
:root{--bg:#0f1117;--card:#1a1d27;--hover:#252830;--input:#1e2130;--acc:#6366f1;--accl:#818cf8;--vio:#8b5cf6;--cyan:#06b6d4;--tx:#f1f5f9;--txs:#94a3b8;--txm:#64748b;--ok:#22c55e;--warn:#f59e0b;--err:#ef4444;--brd:rgba(255,255,255,.06);--glow:rgba(99,102,241,.15);--r:12px;--rs:8px}
*{margin:0;padding:0;box-sizing:border-box}body{font-family:Inter,system-ui,sans-serif;background:var(--bg);color:var(--tx);display:flex;min-height:100vh}
::-webkit-scrollbar{width:6px}::-webkit-scrollbar-thumb{background:var(--txm);border-radius:3px}::selection{background:var(--acc);color:#fff}
.sb{width:220px;background:linear-gradient(180deg,#13151f,#0f1117);border-right:1px solid var(--brd);padding:24px 16px;display:flex;flex-direction:column;position:fixed;height:100vh;z-index:10}
.logo{display:flex;align-items:center;gap:10px;padding:0 8px 24px;border-bottom:1px solid var(--brd);margin-bottom:16px}.li{width:32px;height:32px;background:linear-gradient(135deg,var(--acc),var(--vio));border-radius:8px;display:flex;align-items:center;justify-content:center;font-size:16px}.lt{font-size:15px;font-weight:700}.lt span{color:var(--accl)}
.nav{flex:1;display:flex;flex-direction:column;gap:2px}.ni{display:flex;align-items:center;gap:10px;padding:10px 12px;border-radius:var(--rs);color:var(--txs);cursor:pointer;transition:all .15s;font-size:13px;font-weight:500;border:1px solid transparent}.ni:hover{background:var(--hover);color:var(--tx)}.ni.a{background:linear-gradient(135deg,rgba(99,102,241,.15),rgba(139,92,246,.1));color:var(--accl);border-color:rgba(99,102,241,.2)}.nic{font-size:16px;width:20px;text-align:center}
.sf{padding-top:16px;border-top:1px solid var(--brd);font-size:11px;color:var(--txm);text-align:center}
.mn{flex:1;margin-left:220px;padding:28px 32px}.pt{font-size:22px;font-weight:700;letter-spacing:-.5px;margin-bottom:24px}.tc{display:none}.tc.a{display:block}
.sg{display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:16px;margin-bottom:28px}
.sc{background:var(--card);border:1px solid var(--brd);border-radius:var(--r);padding:20px;position:relative;overflow:hidden;transition:all .2s}.sc:hover{border-color:rgba(99,102,241,.3);box-shadow:0 0 24px var(--glow);transform:translateY(-1px)}.sc::before{content:"";position:absolute;top:0;left:0;right:0;height:2px;background:linear-gradient(90deg,var(--acc),var(--vio));opacity:.6}.si{font-size:20px;margin-bottom:8px}.sv{font-size:28px;font-weight:700;letter-spacing:-1px;margin-bottom:2px}.sl{font-size:12px;color:var(--txs);font-weight:500;text-transform:uppercase;letter-spacing:.5px}
.cd{background:var(--card);border:1px solid var(--brd);border-radius:var(--r);padding:20px;margin-bottom:20px}.ct2{font-size:14px;font-weight:600;margin-bottom:16px;display:flex;align-items:center;gap:8px}.ct2 .ic{color:var(--accl)}
.tw{overflow-x:auto}table{width:100%;border-collapse:collapse;font-size:13px}th{text-align:left;padding:10px 12px;color:var(--txm);font-weight:600;font-size:11px;text-transform:uppercase;letter-spacing:.5px;border-bottom:1px solid var(--brd)}td{padding:10px 12px;border-bottom:1px solid var(--brd)}tr:hover td{background:var(--hover)}
.b{display:inline-block;padding:2px 8px;border-radius:4px;font-size:11px;font-weight:600}.bd{background:rgba(99,102,241,.15);color:#818cf8}.bb{background:rgba(239,68,68,.15);color:#f87171}.bf{background:rgba(34,197,94,.15);color:#4ade80}.bw{background:rgba(245,158,11,.15);color:#fbbf24}.bv{background:rgba(139,92,246,.15);color:#a78bfa}.bg{background:rgba(100,116,139,.15);color:#94a3b8}
.sbar{display:flex;gap:12px;margin-bottom:20px;flex-wrap:wrap}.sinp{flex:1;min-width:200px;padding:10px 14px;background:var(--input);border:1px solid var(--brd);border-radius:var(--rs);color:var(--tx);font-size:13px;outline:0;transition:border-color .2s}.sinp:focus{border-color:var(--acc)}select{padding:10px 14px;background:var(--input);border:1px solid var(--brd);border-radius:var(--rs);color:var(--tx);font-size:13px;outline:0;cursor:pointer}
.pg{display:flex;align-items:center;justify-content:space-between;padding:12px 0;font-size:13px;color:var(--txs)}.pg button{padding:6px 14px;background:var(--input);border:1px solid var(--brd);border-radius:var(--rs);color:var(--tx);cursor:pointer;font-size:12px;transition:all .15s}.pg button:hover:not(:disabled){border-color:var(--acc)}.pg button:disabled{opacity:.4;cursor:default}
.cg{display:grid;grid-template-columns:1fr 1fr;gap:20px;margin-bottom:20px}.cc{background:var(--card);border:1px solid var(--brd);border-radius:var(--r);padding:20px}.cc canvas{max-height:280px}.cti{font-size:13px;font-weight:600;margin-bottom:12px;color:var(--txs)}
.hm{display:flex;flex-wrap:wrap;gap:3px}.hc{width:14px;height:14px;border-radius:3px;transition:all .15s;cursor:pointer}.hc:hover{transform:scale(1.3);z-index:1}.h0{background:#1a1d27}.h1{background:rgba(6,182,212,.2)}.h2{background:rgba(6,182,212,.4)}.h3{background:rgba(6,182,212,.6)}.h4{background:rgba(6,182,212,.8)}.h5{background:rgb(6,182,212)}.ht{position:fixed;background:#1e2130;border:1px solid var(--brd);padding:6px 10px;border-radius:6px;font-size:11px;pointer-events:none;z-index:100;display:none}
.pjg{display:grid;grid-template-columns:repeat(auto-fill,minmax(320px,1fr));gap:16px}.pjc{background:var(--card);border:1px solid var(--brd);border-radius:var(--r);padding:18px;transition:all .2s}.pjc:hover{border-color:rgba(99,102,241,.3)}.pn{font-size:15px;font-weight:600;margin-bottom:8px;display:flex;align-items:center;gap:8px}.pm{font-size:12px;color:var(--txm);margin-bottom:4px}.pb{height:4px;background:var(--hover);border-radius:2px;margin-top:10px;overflow:hidden}.pf{height:100%;background:linear-gradient(90deg,var(--acc),var(--vio));border-radius:2px;transition:width .5s}
.dot{display:inline-block;width:8px;height:8px;border-radius:50%;margin-right:4px}.dot.ak{background:var(--ok);animation:pu 2s infinite}@keyframes pu{0%,100%{opacity:1}50%{opacity:.4}}
.hig{display:grid;grid-template-columns:repeat(auto-fill,minmax(200px,1fr));gap:12px}.hii{display:flex;align-items:center;gap:10px;padding:12px;background:var(--card);border:1px solid var(--brd);border-radius:var(--rs);font-size:13px}
.modal-overlay{position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,.6);backdrop-filter:blur(4px);z-index:50;display:none;align-items:center;justify-content:center}.modal-overlay.show{display:flex}
.modal{background:var(--card);border:1px solid var(--brd);border-radius:var(--r);max-width:800px;width:90%;max-height:85vh;overflow-y:auto;padding:24px;position:relative}
.modal-close{position:absolute;top:12px;right:16px;background:none;border:none;color:var(--txm);font-size:20px;cursor:pointer;padding:4px 8px;border-radius:4px}.modal-close:hover{background:var(--hover);color:var(--tx)}
.modal h2{font-size:18px;font-weight:700;margin-bottom:4px;padding-right:30px}.modal .meta{font-size:12px;color:var(--txm);margin-bottom:16px}
.modal .field{margin-bottom:14px}.modal .field-label{font-size:11px;font-weight:600;color:var(--txs);text-transform:uppercase;letter-spacing:.5px;margin-bottom:4px}.modal .field-value{font-size:13px;line-height:1.6;white-space:pre-wrap;word-break:break-word}
.modal .field-value a{color:var(--accl);text-decoration:none}.modal .field-value a:hover{text-decoration:underline}
.modal .field-value mark{background:rgba(99,102,241,.25);color:var(--tx);padding:1px 3px;border-radius:2px}
.search-results .sr{padding:14px;border-bottom:1px solid var(--brd);cursor:pointer;transition:background .15s}.search-results .sr:hover{background:var(--hover)}
.search-results .sr-title{font-size:14px;font-weight:600;margin-bottom:4px}.search-results .sr-meta{font-size:12px;color:var(--txm)}.search-results .sr-snippet{font-size:13px;color:var(--txs);margin-top:4px;line-height:1.5}
.search-results .sr-snippet mark{background:rgba(99,102,241,.25);color:var(--tx);padding:1px 3px;border-radius:2px}
@media(max-width:900px){.cg{grid-template-columns:1fr}}@media(max-width:768px){.sb{display:none}.mn{margin-left:0}}
</style>
</head>
<body>
<aside class="sb">
<div class="logo"><div class="li">&#x1F9E0;</div><div class="lt">mem<span>-sync</span></div></div>
<nav class="nav">
<div class="ni a" data-tab="overview"><span class="nic">&#x2302;</span> Overview</div>
<div class="ni" data-tab="observations"><span class="nic">&#x2630;</span> Observations</div>
<div class="ni" data-tab="search"><span class="nic">&#x1F50E;</span> Search</div>
<div class="ni" data-tab="analytics"><span class="nic">&#x2616;</span> Analytics</div>
<div class="ni" data-tab="access"><span class="nic">&#x2604;</span> Access Map</div>
<div class="ni" data-tab="sync"><span class="nic">&#x21C4;</span> Sync History</div>
<div class="ni" data-tab="profiles"><span class="nic">&#x1F464;</span> Dev Profiles</div>
<div class="ni" data-tab="team"><span class="nic">&#x1F465;</span> Team Insights</div>
<div class="ni" data-tab="distilled"><span class="nic">&#x1F4A1;</span> Distilled</div>
</nav>
<div class="sf">claude-mem-sync v1.0.0<br>Made with &#10084;&#65039; in Florence</div>
</aside>
<main class="mn">

<div id="t-overview" class="tc a"><div class="pt">Overview</div>
<div class="sg"><div class="sc"><div class="si">&#x1F4DD;</div><div class="sv" id="so">-</div><div class="sl">Observations</div></div><div class="sc"><div class="si">&#x1F4C1;</div><div class="sv" id="ss">-</div><div class="sl">Sessions</div></div><div class="sc"><div class="si">&#x1F50D;</div><div class="sv" id="sa">-</div><div class="sl">Access Events</div></div><div class="sc"><div class="si">&#x1F4BE;</div><div class="sv" id="sd2">-</div><div class="sl">DB Size</div></div></div>
<div class="cd"><div class="ct2"><span class="ic">&#x1F4E6;</span> Projects</div><div id="pj" class="pjg"></div></div>
<div class="cd"><div class="ct2"><span class="ic">&#x2764;</span> Health</div><div id="hl" class="hig"></div></div></div>

<div id="t-observations" class="tc"><div class="pt">Observations</div>
<div class="sbar"><input class="sinp" id="os" placeholder="Search observations..." type="text"><select id="ot"><option value="">All Types</option><option>decision</option><option>bugfix</option><option>feature</option><option>discovery</option><option>refactor</option><option>change</option></select><select id="op"><option value="">All Projects</option></select></div>
<div class="cd"><div class="tw"><table><thead><tr><th>ID</th><th>Type</th><th>Title</th><th>Project</th><th>Date</th><th>Score</th></tr></thead><tbody id="otb"></tbody></table></div><div class="pg"><span id="oi">-</span><div><button id="opv" disabled>&#8592; Prev</button> <button id="onx">Next &#8594;</button></div></div></div></div>

<div id="t-analytics" class="tc"><div class="pt">Analytics &amp; Metrics</div>
<div class="cg"><div class="cc"><div class="cti">Type Distribution</div><canvas id="cty"></canvas></div><div class="cc"><div class="cti">Activity Timeline</div><canvas id="ctl"></canvas></div><div class="cc"><div class="cti">Top Observations by Score</div><canvas id="csc"></canvas></div><div class="cc"><div class="cti">Developer Contributions</div><canvas id="cdv"></canvas></div></div></div>

<div id="t-access" class="tc"><div class="pt">Access Map</div>
<div class="cd"><div class="ct2"><span class="ic">&#x1F525;</span> Access Heatmap (6 months)</div><div id="hmap" class="hm"></div></div>
<div class="cd"><div class="ct2"><span class="ic">&#x1F3C6;</span> Most Accessed</div><div class="tw"><table><thead><tr><th>ID</th><th>Type</th><th>Title</th><th>Accesses</th><th>Last</th></tr></thead><tbody id="ttb"></tbody></table></div></div></div>

<div id="t-sync" class="tc"><div class="pt">Sync History</div>
<div class="cg"><div class="cc" style="grid-column:span 2"><div class="cti">Monthly Sync</div><canvas id="csy"></canvas></div></div>
<div class="cd"><div class="ct2"><span class="ic">&#x1F4E4;</span> Exports</div><div class="tw"><table><thead><tr><th>Project</th><th>Date</th><th>Obs</th><th>Pushed To</th></tr></thead><tbody id="etb"></tbody></table></div></div>
<div class="cd"><div class="ct2"><span class="ic">&#x1F4E5;</span> Imports</div><div class="tw"><table><thead><tr><th>Project</th><th>Date</th><th>Obs</th><th>Source</th></tr></thead><tbody id="itb"></tbody></table></div></div></div>

<div id="t-search" class="tc"><div class="pt">Search Memories</div>
<div class="sbar"><input class="sinp" id="sq" placeholder="FTS5 search: try AND, OR, NOT, &quot;exact phrase&quot;, title:keyword..." type="text" style="flex:2"><select id="sf-type"><option value="">All Types</option><option>decision</option><option>bugfix</option><option>feature</option><option>discovery</option><option>refactor</option><option>change</option></select><select id="sf-proj"><option value="">All Projects</option></select><button onclick="doSearch()" style="padding:10px 20px;background:var(--acc);border:none;border-radius:var(--rs);color:#fff;cursor:pointer;font-size:13px;font-weight:600">Search</button></div>
<div id="sr-info" style="font-size:13px;color:var(--txs);margin-bottom:12px"></div>
<div class="cd"><div id="sr-results" class="search-results"></div><div class="pg"><span id="sr-count"></span><div><button id="sr-prev" disabled onclick="srPage--;doSearch()">&#8592; Prev</button> <button id="sr-next" onclick="srPage++;doSearch()">Next &#8594;</button></div></div></div>
</div>

<div id="t-profiles" class="tc"><div class="pt">Developer Profiles</div>
<div class="sbar"><select id="pf-dev"><option value="">Select Developer...</option></select><select id="pf-proj"><option value="">All Projects</option></select></div>
<div class="sg" id="pf-stats"></div>
<div class="cg"><div class="cc"><div class="cti">Knowledge Spectrum</div><canvas id="cpf-type"></canvas></div><div class="cc"><div class="cti">Top Concepts</div><canvas id="cpf-concept"></canvas></div></div>
<div class="cg"><div class="cc"><div class="cti">Activity Over Time</div><canvas id="cpf-tempo"></canvas></div><div class="cc"><div class="cti">File Coverage</div><canvas id="cpf-files"></canvas></div></div>
</div>

<div id="t-team" class="tc"><div class="pt">Team Insights</div>
<div class="sg" id="tm-stats"></div>
<div class="cg"><div class="cc"><div class="cti">Team Type Distribution</div><canvas id="ctm-types"></canvas></div><div class="cc"><div class="cti">Concept Coverage</div><canvas id="ctm-concepts"></canvas></div></div>
<div class="cd"><div class="ct2"><span class="ic">&#x26A0;</span> Knowledge Gaps (bus-factor risk)</div><div class="tw"><table><thead><tr><th>Concept</th><th>Contributors</th><th>Team Size</th><th>Risk</th></tr></thead><tbody id="tm-gaps"></tbody></table></div></div>
</div>

<div id="t-distilled" class="tc"><div class="pt">Distilled Knowledge</div>
<div class="sg" id="ds-stats"></div>
<div class="cd"><div class="ct2"><span class="ic">&#x1F4DC;</span> Distilled Rules</div><div id="ds-rules" style="font-size:13px;line-height:1.7;max-height:600px;overflow-y:auto;padding:8px"></div></div>
<div class="cd"><div class="ct2"><span class="ic">&#x1F4DA;</span> Knowledge Base</div><div id="ds-kb" style="font-size:13px;line-height:1.7;max-height:600px;overflow-y:auto;padding:8px"></div></div>
</div>

<div class="modal-overlay" id="obs-modal"><div class="modal"><button class="modal-close" onclick="closeModal()">&#x2715;</button><h2 id="md-title"></h2><div class="meta" id="md-meta"></div><div id="md-body"></div></div></div>

<div class="ht" id="htt"></div>
</main>
<script>
var Q=function(s){return document.querySelector(s)},QQ=function(s){return document.querySelectorAll(s)};
var F=function(p){return fetch(p).then(function(r){return r.json()}).catch(function(){return null})};
var D=function(e){if(!e)return"-";var ts=e>1e12?e:e*1e3;return new Date(ts).toLocaleDateString("en",{year:"numeric",month:"short",day:"numeric"})};
var S=function(b){return b>1048576?(b/1048576).toFixed(1)+" MB":(b/1024).toFixed(0)+" KB"};
var BG=function(t){var m={decision:"bd",bugfix:"bb",feature:"bf",discovery:"bw",refactor:"bv"};return "b "+(m[t]||"bg")};
var P=1,L=50,C={};
var TC={decision:"#6366f1",bugfix:"#ef4444",feature:"#22c55e",discovery:"#f59e0b",refactor:"#8b5cf6",change:"#64748b"};
if(window.Chart){Chart.defaults.color="#94a3b8";Chart.defaults.borderColor="rgba(255,255,255,.06)";Chart.defaults.font.family="Inter"}

QQ(".ni").forEach(function(e){e.addEventListener("click",function(){
  QQ(".ni").forEach(function(n){n.classList.remove("a")});QQ(".tc").forEach(function(t){t.classList.remove("a")});
  e.classList.add("a");Q("#t-"+e.dataset.tab).classList.add("a");
  var fn={observations:LO,analytics:LA,access:LAC,sync:LS,search:function(){},profiles:LP,team:LT,distilled:LD};if(fn[e.dataset.tab])fn[e.dataset.tab]();
})});

function AN(el,v,d){d=d||800;if(typeof v==="string"){el.textContent=v;return}
var s=performance.now();(function u(n){var p=Math.min((n-s)/d,1);el.textContent=Math.floor(v*(1-Math.pow(1-p,3))).toLocaleString();if(p<1)requestAnimationFrame(u)})(s)}

function LV(){F("/api/overview").then(function(d){if(!d)return;
AN(Q("#so"),d.observationCount||0);AN(Q("#ss"),d.sessionCount||0);AN(Q("#sa"),d.accessLogEntries||0);AN(Q("#sd2"),S(d.dbSize||0));
var g=Q("#pj");g.innerHTML="";(d.projects||[]).forEach(function(p){
  var pc=p.cap?Math.min(100,Math.round(p.observationCount/p.cap*100)):0;
  g.innerHTML+="<div class='pjc'><div class='pn'><span class='dot "+(p.enabled?"ak":"")+"'></span>"+p.name+"</div><div class='pm'>"+(p.remote||"-")+" &middot; "+(p.provider||"github")+"</div><div class='pm'>Export: "+D(p.lastExport?p.lastExport.exported_at:0)+" ("+(p.lastExport?p.lastExport.observations_count:"-")+" obs)</div><div class='pm'>Import: "+D(p.lastImport?p.lastImport.imported_at:0)+" ("+(p.lastImport?p.lastImport.observations_count:"-")+" obs)</div><div class='pm'>"+(p.observationCount||0)+" / "+(p.cap||500)+" obs</div><div class='pb'><div class='pf' style='width:"+pc+"%'></div></div></div>";
});
Q("#hl").innerHTML="<div class='hii'><span class='dot ak'></span> Hook: "+(d.evictionStrategy==="hook"?"Active":"Passive")+"</div><div class='hii'>&#x1F6E1; "+(d.evictionStrategy||"passive")+"</div><div class='hii'>&#x1F4BE; "+S(d.dbSize||0)+"</div><div class='hii'>&#x1F4CA; "+S(d.accessDbSize||0)+"</div>";
var sl=Q("#op");sl.innerHTML="<option value=''>All Projects</option>";(d.projects||[]).forEach(function(p){sl.innerHTML+="<option>"+p.name+"</option>"});
})}

function LO(){var s=Q("#os").value,t=Q("#ot").value,p=Q("#op").value,q=new URLSearchParams({page:P,limit:L});
if(s)q.set("search",s);if(t)q.set("type",t);if(p)q.set("project",p);
F("/api/observations?"+q).then(function(d){if(!d)return;var tb=Q("#otb");tb.innerHTML="";
(d.observations||[]).forEach(function(o){tb.innerHTML+="<tr><td>#"+o.id+"</td><td><span class='"+BG(o.type)+"'>"+o.type+"</span></td><td>"+o.title+"</td><td>"+(o.project||"-")+"</td><td>"+D(o.created_at_epoch)+"</td><td>"+(o.score!=null?o.score.toFixed(2):"-")+"</td></tr>"});
Q("#oi").textContent="Showing "+((P-1)*L+1)+"-"+Math.min(P*L,d.total)+" of "+d.total;Q("#opv").disabled=P<=1;Q("#onx").disabled=P*L>=d.total})}

Q("#opv").onclick=function(){P--;LO()};Q("#onx").onclick=function(){P++;LO()};
Q("#os").addEventListener("input",function(){P=1;LO()});Q("#ot").addEventListener("change",function(){P=1;LO()});Q("#op").addEventListener("change",function(){P=1;LO()});

function LA(){Promise.all([F("/api/analytics/types"),F("/api/analytics/timeline"),F("/api/analytics/scores?limit=15"),F("/api/analytics/devs")]).then(function(r){
var ty=r[0],tl=r[1],sc=r[2],dv=r[3];
if(ty&&window.Chart){if(C.ty)C.ty.destroy();var ks=Object.keys(ty.distribution||{});C.ty=new Chart(Q("#cty"),{type:"doughnut",data:{labels:ks,datasets:[{data:Object.values(ty.distribution||{}),backgroundColor:ks.map(function(t){return TC[t]||"#64748b"}),borderWidth:0}]},options:{plugins:{legend:{position:"right",labels:{padding:12,usePointStyle:true,pointStyle:"circle"}}},cutout:"60%"}})}
if(tl&&window.Chart){var x=tl.timeline||[];if(C.tl)C.tl.destroy();C.tl=new Chart(Q("#ctl"),{type:"line",data:{labels:x.map(function(t){return t.month}),datasets:[{label:"Exports",data:x.map(function(t){return t.exports}),borderColor:"#6366f1",backgroundColor:"rgba(99,102,241,.1)",fill:true,tension:.3},{label:"Imports",data:x.map(function(t){return t.imports}),borderColor:"#22c55e",backgroundColor:"rgba(34,197,94,.1)",fill:true,tension:.3}]},options:{plugins:{legend:{labels:{usePointStyle:true,pointStyle:"circle",padding:16}}},scales:{y:{beginAtZero:true,grid:{color:"rgba(255,255,255,.04)"}},x:{grid:{display:false}}}}})}
if(sc&&window.Chart){var x2=(sc.scores||[]).slice(0,15);if(C.sc)C.sc.destroy();C.sc=new Chart(Q("#csc"),{type:"bar",data:{labels:x2.map(function(s){return(s.title||"").substring(0,30)}),datasets:[{data:x2.map(function(s){return s.score}),backgroundColor:x2.map(function(s){return TC[s.type]||"#64748b"}),borderRadius:4}]},options:{indexAxis:"y",plugins:{legend:{display:false}},scales:{x:{beginAtZero:true,max:1,grid:{color:"rgba(255,255,255,.04)"}},y:{grid:{display:false},ticks:{font:{size:11}}}}}})}
if(dv&&window.Chart){var x3=dv.contributions||[];if(C.dv)C.dv.destroy();C.dv=new Chart(Q("#cdv"),{type:"bar",data:{labels:x3.map(function(d){return d.dev}),datasets:[{label:"Exports",data:x3.map(function(d){return d.exports}),backgroundColor:"#6366f1",borderRadius:4},{label:"Obs",data:x3.map(function(d){return d.observations}),backgroundColor:"#8b5cf6",borderRadius:4}]},options:{plugins:{legend:{labels:{usePointStyle:true,pointStyle:"circle",padding:16}}},scales:{y:{beginAtZero:true,grid:{color:"rgba(255,255,255,.04)"}},x:{grid:{display:false}}}}})}
})}

function LAC(){Promise.all([F("/api/access/heatmap?months=6"),F("/api/access/top?limit=20")]).then(function(r){
var hm=r[0],tp=r[1];var el=Q("#hmap"),tip=Q("#htt");el.innerHTML="";
if(hm){var m=new Map();(hm.heatmap||[]).forEach(function(h){m.set(h.date,h.count)});var end=new Date(),st=new Date();st.setMonth(st.getMonth()-6);
for(var d=new Date(st);d<=end;d.setDate(d.getDate()+1)){var ds=d.toISOString().slice(0,10),c=m.get(ds)||0,lv=c===0?0:c<=2?1:c<=5?2:c<=10?3:c<=20?4:5;
var ce=document.createElement("div");ce.className="hc h"+lv;(function(ds2,c2){ce.onmouseenter=function(e){tip.style.display="block";tip.style.left=e.pageX+10+"px";tip.style.top=e.pageY-30+"px";tip.textContent=ds2+": "+c2+" accesses"};ce.onmouseleave=function(){tip.style.display="none"}})(ds,c);el.appendChild(ce)}}
var tb=Q("#ttb");tb.innerHTML="";(tp||[]).forEach(function(o){var mx=(tp[0]&&tp[0].accessCount)||1,pc=Math.round(o.accessCount/mx*100);
tb.innerHTML+="<tr><td>#"+o.id+"</td><td><span class='"+BG(o.type)+"'>"+o.type+"</span></td><td>"+o.title+"</td><td><div style='display:flex;align-items:center;gap:8px'><div style='width:60px;height:4px;background:var(--hover);border-radius:2px;overflow:hidden'><div style='width:"+pc+"%;height:100%;background:var(--cyan);border-radius:2px'></div></div>"+o.accessCount+"</div></td><td>"+D(o.lastAccessed)+"</td></tr>"})
})}

function LS(){Promise.all([F("/api/sync/history"),F("/api/analytics/timeline")]).then(function(r){
var hi=r[0],tl=r[1];
if(tl&&window.Chart){var x=tl.timeline||[];if(C.sy)C.sy.destroy();C.sy=new Chart(Q("#csy"),{type:"bar",data:{labels:x.map(function(t){return t.month}),datasets:[{label:"Exported",data:x.map(function(t){return t.exportedObs||0}),backgroundColor:"rgba(99,102,241,.7)",borderRadius:4},{label:"Imported",data:x.map(function(t){return t.importedObs||0}),backgroundColor:"rgba(34,197,94,.7)",borderRadius:4}]},options:{plugins:{legend:{labels:{usePointStyle:true,pointStyle:"circle",padding:16}}},scales:{y:{beginAtZero:true,stacked:true,grid:{color:"rgba(255,255,255,.04)"}},x:{stacked:true,grid:{display:false}}}}})}
if(hi){var et=Q("#etb");et.innerHTML="";(hi.exports||[]).slice(0,20).forEach(function(e){et.innerHTML+="<tr><td>"+e.project+"</td><td>"+D(e.exported_at)+"</td><td>"+e.observations_count+"</td><td style='max-width:200px;overflow:hidden;text-overflow:ellipsis'>"+(e.pushed_to||"-")+"</td></tr>"});
var it=Q("#itb");it.innerHTML="";(hi.imports||[]).slice(0,20).forEach(function(i){it.innerHTML+="<tr><td>"+i.project+"</td><td>"+D(i.imported_at)+"</td><td>"+i.observations_count+"</td><td>"+(i.source_dev||"-")+"</td></tr>"})}
})}

// -- Linkify: make URLs, PR refs, commit hashes clickable --
function linkify(text){if(!text)return"";
return text.replace(/(https?:\\/\\/[^\\s<>"')\\]]+)/g,'<a href="$1" target="_blank" rel="noopener">$1</a>')
.replace(/\\b([a-f0-9]{7,40})\\b/g,function(m){return m.length>=7?'<a href="https://github.com/search?q='+m+'&type=commits" target="_blank" rel="noopener">'+m+"</a>":m})
.replace(/#(\\d{1,6})\\b/g,'<a href="https://github.com/search?q=%23$1&type=issues" target="_blank" rel="noopener">#$1</a>')}
function escHtml(s){if(!s)return"";return s.replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;")}

// -- Search --
var srPage=1;
function doSearch(){var q=Q("#sq").value,t=Q("#sf-type").value,p=Q("#sf-proj").value;
if(!q.trim()){Q("#sr-results").innerHTML="<div style='padding:20px;color:var(--txm);text-align:center'>Enter a search query above</div>";Q("#sr-info").textContent="";return}
var params=new URLSearchParams({q:q,page:srPage,limit:20});if(t)params.set("type",t);if(p)params.set("project",p);
F("/api/search?"+params).then(function(d){if(!d){Q("#sr-results").innerHTML="<div style='padding:20px;color:var(--err)'>Search failed</div>";return}
Q("#sr-info").textContent=d.total+" results for \\""+d.query+"\\""+(d.fallback?" (LIKE fallback)":"");
var el=Q("#sr-results");el.innerHTML="";
if(d.results.length===0){el.innerHTML="<div style='padding:20px;color:var(--txm);text-align:center'>No results found</div>";return}
d.results.forEach(function(r){var div=document.createElement("div");div.className="sr";div.onclick=function(){openDetail(r.id)};
div.innerHTML="<div class='sr-title'><span class='"+BG(r.type)+"'>"+r.type+"</span> "+escHtml(r.title)+"</div><div class='sr-meta'>#"+r.id+" &middot; "+(r.project||"-")+" &middot; "+D(r.created_at_epoch)+"</div>"+(r.snippet?"<div class='sr-snippet'>"+r.snippet+"</div>":"");
el.appendChild(div)});
Q("#sr-count").textContent="Page "+d.page+" of "+d.totalPages;Q("#sr-prev").disabled=d.page<=1;Q("#sr-next").disabled=d.page>=d.totalPages})}
Q("#sq").addEventListener("keydown",function(e){if(e.key==="Enter"){srPage=1;doSearch()}});

// -- Observation Detail Modal --
function openDetail(id){F("/api/observations/"+id).then(function(o){if(!o||o.error){alert("Could not load observation #"+id);return}
Q("#md-title").textContent=o.title||"Observation #"+id;
Q("#md-meta").innerHTML="<span class='"+BG(o.type)+"'>"+o.type+"</span> &middot; #"+o.id+" &middot; "+(o.project||"-")+" &middot; "+D(o.created_at_epoch);
var body="";
if(o.subtitle)body+="<div class='field'><div class='field-label'>Subtitle</div><div class='field-value'>"+linkify(escHtml(o.subtitle))+"</div></div>";
if(o.narrative)body+="<div class='field'><div class='field-label'>Narrative</div><div class='field-value'>"+linkify(escHtml(o.narrative))+"</div></div>";
if(o.text)body+="<div class='field'><div class='field-label'>Full Text</div><div class='field-value'>"+linkify(escHtml(o.text))+"</div></div>";
if(o.facts)body+="<div class='field'><div class='field-label'>Facts</div><div class='field-value'>"+linkify(escHtml(o.facts))+"</div></div>";
if(o.concepts)body+="<div class='field'><div class='field-label'>Concepts</div><div class='field-value'>"+linkify(escHtml(o.concepts))+"</div></div>";
if(o.files_read)body+="<div class='field'><div class='field-label'>Files Read</div><div class='field-value'>"+escHtml(o.files_read)+"</div></div>";
if(o.files_modified)body+="<div class='field'><div class='field-label'>Files Modified</div><div class='field-value'>"+escHtml(o.files_modified)+"</div></div>";
Q("#md-body").innerHTML=body;Q("#obs-modal").classList.add("show")})}
function closeModal(){Q("#obs-modal").classList.remove("show")}
Q("#obs-modal").addEventListener("click",function(e){if(e.target===Q("#obs-modal"))closeModal()});
document.addEventListener("keydown",function(e){if(e.key==="Escape")closeModal()});

// -- Make observation rows clickable --
var origLO=LO;
LO=function(){origLO();setTimeout(function(){QQ("#otb tr").forEach(function(tr){var id=tr.querySelector("td");if(id){var num=parseInt(id.textContent.replace("#",""));if(num)tr.style.cursor="pointer",tr.onclick=function(){openDetail(num)}}})},100)};

// -- Nav: add search handler --
var origNav=null;

// -- Developer Profiles --
function LP(){
  var proj=Q("#pf-proj").value||"";
  F("/api/profiles/devs"+(proj?"?project="+proj:"")).then(function(d){
    if(!d)return;var sel=Q("#pf-dev");var cur=sel.value;
    sel.textContent="";
    var opt0=document.createElement("option");opt0.value="";opt0.textContent="Select Developer...";sel.appendChild(opt0);
    (d.devNames||[]).forEach(function(n){var o=document.createElement("option");o.value=n;o.textContent=n;if(n===cur)o.selected=true;sel.appendChild(o)});
    if(cur)loadProfile(cur,proj);
  });
}
function loadProfile(dev,proj){
  if(!dev)return;
  F("/api/profiles/"+encodeURIComponent(dev)+(proj?"?project="+proj:"")).then(function(p){
    if(!p||p.error){Q("#pf-stats").textContent="No profile data found";return}
    var el=Q("#pf-stats");el.textContent="";
    [["Observations",p.knowledgeSpectrum.total,"&#x1F4DD;"],["Concept Coverage",p.conceptMap.devCoverage+"%","&#x1F4A1;"],["Survival Rate",(p.survivalRate.rate*100).toFixed(0)+"% ("+p.survivalRate.survived+"/"+p.survivalRate.exported+")","&#x2705;"],["Avg / Week",p.temporalPattern.averagePerWeek+" (consistency: "+p.temporalPattern.consistency+")","&#x1F4C5;"]].forEach(function(x){
      var c=document.createElement("div");c.className="sc";
      var si=document.createElement("div");si.className="si";si.innerHTML=x[2];
      var sv=document.createElement("div");sv.className="sv";sv.textContent=String(x[1]);
      var sl=document.createElement("div");sl.className="sl";sl.textContent=x[0];
      c.appendChild(si);c.appendChild(sv);c.appendChild(sl);el.appendChild(c);
    });
    if(window.Chart){
      var ts=p.knowledgeSpectrum.types.filter(function(t){return t.count>0||t.teamAverage>0});
      if(C.pfType)C.pfType.destroy();
      C.pfType=new Chart(Q("#cpf-type"),{type:"doughnut",data:{labels:ts.map(function(t){return t.type}),datasets:[{label:"Your %",data:ts.map(function(t){return t.percentage}),backgroundColor:ts.map(function(t){return TC[t.type]||"#64748b"}),borderWidth:0}]},options:{plugins:{legend:{position:"right",labels:{padding:12,usePointStyle:true,pointStyle:"circle"}}},cutout:"60%"}});
      var cs=p.conceptMap.concepts.filter(function(c){return c.devCount>0}).slice(0,15);
      if(C.pfCon)C.pfCon.destroy();
      C.pfCon=new Chart(Q("#cpf-concept"),{type:"bar",data:{labels:cs.map(function(c){return c.concept.substring(0,25)}),datasets:[{label:"You",data:cs.map(function(c){return c.devCount}),backgroundColor:"#6366f1",borderRadius:4},{label:"Team",data:cs.map(function(c){return c.teamCount}),backgroundColor:"rgba(99,102,241,.3)",borderRadius:4}]},options:{indexAxis:"y",plugins:{legend:{labels:{usePointStyle:true,pointStyle:"circle",padding:16}}},scales:{x:{beginAtZero:true,grid:{color:"rgba(255,255,255,.04)"}},y:{grid:{display:false},ticks:{font:{size:11}}}}}});
      var wk=p.temporalPattern.monthly||[];
      if(C.pfTmp)C.pfTmp.destroy();
      C.pfTmp=new Chart(Q("#cpf-tempo"),{type:"line",data:{labels:wk.map(function(w){return w.month}),datasets:[{label:"Observations",data:wk.map(function(w){return w.count}),borderColor:"#06b6d4",backgroundColor:"rgba(6,182,212,.1)",fill:true,tension:.3}]},options:{plugins:{legend:{display:false}},scales:{y:{beginAtZero:true,grid:{color:"rgba(255,255,255,.04)"}},x:{grid:{display:false}}}}});
      var fc=p.fileCoverage.directories.slice(0,10);
      if(C.pfFil)C.pfFil.destroy();
      C.pfFil=new Chart(Q("#cpf-files"),{type:"bar",data:{labels:fc.map(function(d){return d.directory.split("/").pop()||d.directory}),datasets:[{data:fc.map(function(d){return d.count}),backgroundColor:"#8b5cf6",borderRadius:4}]},options:{plugins:{legend:{display:false}},scales:{y:{beginAtZero:true,grid:{color:"rgba(255,255,255,.04)"}},x:{grid:{display:false}}}}});
    }
  });
}
Q("#pf-dev").addEventListener("change",function(){loadProfile(Q("#pf-dev").value,Q("#pf-proj").value)});
Q("#pf-proj").addEventListener("change",function(){LP()});

// -- Team Insights --
function LT(){
  var proj=Q("#pf-proj")?Q("#pf-proj").value:"";
  F("/api/team/overview"+(proj?"?project="+proj:"")).then(function(d){
    if(!d)return;
    var el=Q("#tm-stats");el.textContent="";
    [["Developers",d.totalDevs,"&#x1F465;"],["Avg Obs / Dev",d.avgObservationsPerDev,"&#x1F4CA;"],["Avg Survival Rate",(d.avgSurvivalRate*100).toFixed(0)+"%","&#x2705;"],["Avg Concept Coverage",d.avgConceptDiversity+"%","&#x1F4A1;"]].forEach(function(x){
      var c=document.createElement("div");c.className="sc";
      var si=document.createElement("div");si.className="si";si.innerHTML=x[2];
      var sv=document.createElement("div");sv.className="sv";sv.textContent=String(x[1]);
      var sl=document.createElement("div");sl.className="sl";sl.textContent=x[0];
      c.appendChild(si);c.appendChild(sv);c.appendChild(sl);el.appendChild(c);
    });
    if(window.Chart&&d.typeDistribution){
      var ts=d.typeDistribution.filter(function(t){return t.count>0});
      if(C.tmType)C.tmType.destroy();
      C.tmType=new Chart(Q("#ctm-types"),{type:"doughnut",data:{labels:ts.map(function(t){return t.type}),datasets:[{data:ts.map(function(t){return t.count}),backgroundColor:ts.map(function(t){return TC[t.type]||"#64748b"}),borderWidth:0}]},options:{plugins:{legend:{position:"right",labels:{padding:12,usePointStyle:true,pointStyle:"circle"}}},cutout:"60%"}});
    }
  });
  F("/api/team/concepts"+(proj?"?project="+proj:"")).then(function(d){
    if(!d)return;
    if(window.Chart&&d.concepts){
      var cs=d.concepts.slice(0,20);
      if(C.tmCon)C.tmCon.destroy();
      C.tmCon=new Chart(Q("#ctm-concepts"),{type:"bar",data:{labels:cs.map(function(c){return c.concept.substring(0,20)}),datasets:[{label:"Team Count",data:cs.map(function(c){return c.teamCount}),backgroundColor:cs.map(function(c){return c.isGap?"rgba(239,68,68,.6)":"rgba(99,102,241,.6)"}),borderRadius:4}]},options:{plugins:{legend:{display:false}},scales:{y:{beginAtZero:true,grid:{color:"rgba(255,255,255,.04)"}},x:{grid:{display:false},ticks:{font:{size:10}}}}}});
    }
    var tb=Q("#tm-gaps");tb.textContent="";
    var gaps=d.knowledgeGaps||[];
    if(gaps.length===0){var tr=document.createElement("tr");var td=document.createElement("td");td.colSpan=4;td.style.cssText="color:var(--txm);text-align:center";td.textContent="No knowledge gaps detected";tr.appendChild(td);tb.appendChild(tr)}
    else gaps.slice(0,20).forEach(function(g){
      var tr=document.createElement("tr");
      var td1=document.createElement("td");td1.textContent=g.concept;
      var td2=document.createElement("td");td2.textContent=String(g.contributorCount);
      var td3=document.createElement("td");td3.textContent=String(g.totalTeamCount);
      var td4=document.createElement("td");
      var sp=document.createElement("span");sp.className=g.contributorCount<=1?"b bb":"b bw";sp.textContent=g.contributorCount<=1?"High":"Medium";
      td4.appendChild(sp);
      tr.appendChild(td1);tr.appendChild(td2);tr.appendChild(td3);tr.appendChild(td4);tb.appendChild(tr);
    });
  });
}

// -- Distilled Knowledge --
function LD(){
  F("/api/distilled/report").then(function(d){
    var el=Q("#ds-stats");el.textContent="";
    if(!d||!d.exists){
      var c=document.createElement("div");c.className="sc";c.style.gridColumn="1/-1";
      var sv=document.createElement("div");sv.className="sv";sv.textContent="No Distillation Yet";
      var sl=document.createElement("div");sl.className="sl";sl.textContent="Run: mem-sync distill --project <name>";
      c.appendChild(sv);c.appendChild(sl);el.appendChild(c);
      Q("#ds-rules").textContent="No distilled rules available. Run distillation first.";
      Q("#ds-kb").textContent="";return;
    }
    var r=d.report;
    [["Rules Generated",r.outputStats.rulesGenerated,"&#x1F4DC;"],["Avg Confidence",(r.outputStats.avgConfidence*100).toFixed(0)+"%","&#x1F3AF;"],["Knowledge Sections",r.outputStats.knowledgeSections,"&#x1F4DA;"],["API Cost","$"+r.tokenUsage.estimatedCost.toFixed(4)+" ("+r.tokenUsage.totalTokens.toLocaleString()+" tokens)","&#x1F4B0;"]].forEach(function(x){
      var c=document.createElement("div");c.className="sc";
      var si=document.createElement("div");si.className="si";si.innerHTML=x[2];
      var sv=document.createElement("div");sv.className="sv";sv.textContent=String(x[1]);
      var sl=document.createElement("div");sl.className="sl";sl.textContent=x[0];
      c.appendChild(si);c.appendChild(sv);c.appendChild(sl);el.appendChild(c);
    });
  });
  F("/api/distilled/rules").then(function(d){
    var el=Q("#ds-rules");
    if(!d||!d.exists){el.textContent="Not available";return}
    el.textContent=d.content;el.style.whiteSpace="pre-wrap";
  });
  F("/api/distilled/kb").then(function(d){
    var el=Q("#ds-kb");
    if(!d||!d.exists){el.textContent="Not available";return}
    el.textContent=d.content;el.style.whiteSpace="pre-wrap";
  });
}

LV();
</script>
</body>
</html>`;
