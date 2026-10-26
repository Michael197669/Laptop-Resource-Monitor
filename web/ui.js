/* Running Background Processes reference view */
(function(){
"use strict";
const $=id=>document.getElementById(id);
function esc(value){return String(value==null?"":value).replace(/[&<>"']/g,x=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[x]))}
function money(m){m=Number(m||0);return m>=1024?(m/1024).toFixed(1)+" GB":Math.round(m)+" MB"}
function classify(p){
 let n=p.name.toLowerCase(),r=(p.role||"").toLowerCase(),c=(p.command||"").toLowerCase();
 if(n==="chatgpt.exe")return ["chatgpt","◎"];
 if(n==="chrome.exe")return ["chrome",""];
 if(n.includes("asus")||n.includes("aura")||n.includes("lighting"))return ["asus","⚙"];
 if(r.includes("commander")||r.includes("bridge")||r.includes("nas"))return ["bridge","▤"];
 if(n==="ollama.exe")return ["ollama","⬡"];
 if(n==="explorer.exe")return ["system","▣"];
 if(n==="dwm.exe"||n==="svchost.exe"||n==="msmpeng.exe")return ["protected","◆"];
 if(n.includes("phone")||n.includes("crossdevice"))return ["system","▢"];
 if(n.includes("syncthing"))return ["bridge","▤"];
 if(n.includes("node.exe"))return ["bridge","⬢"];
 if(n==="powershell.exe"||n==="cmd.exe")return ["protected",">_"];
 return ["system","▣"];
}
function symbol(p){let x=classify(p);return '<span class="pv-app-icon '+x[0]+'">'+x[1]+'</span>'}
function chip(p){let s=p.safety;return '<span class="pv-safe-pill '+esc(s)+'"><span class="pv-safe-dot">'+(s==="Safe"?"✓":s==="Review"?"!":"◆")+'</span>'+esc(s)+'</span>'}
function typeOf(p){
 let type=(p.type||"").toLowerCase();
 if(type==="helper"||type.includes("helper"))return "Helper";
 let n=p.name.toLowerCase();
 if(n==="chatgpt.exe"||n==="chrome.exe"||["notepad.exe","vlc.exe","spotify.exe","winword.exe"].includes(n))return "Main app";
 return "System / service"
}
function friendlyName(p){
 let name=p.name,typ=typeOf(p);
 if(typ==="Helper"&&p.name.toLowerCase()==="chatgpt.exe")return "ChatGPT Helper";
 if(typ==="Helper"&&p.name.toLowerCase()==="chrome.exe")return "Chrome Helper";
 if(p.role==="Desktop Commander remote agent")return "Desktop Commander";
 return name;
}
function purpose(p){
 let name=p.name.toLowerCase(),r=p.role||"Unknown process";
 if(name==="chatgpt.exe"){return typeOf(p)==="Helper"?"Supporting process for ChatGPT":"Main application (ChatGPT)"}
 if(name==="chrome.exe"){
  let m=/helper:\s*([^\s]+)/i.exec(r);
  return typeOf(p)==="Helper"?(m?"Chrome "+m[1]+" helper":"Chrome helper process"):"Main application (Google Chrome)";
 }
 if(name==="dwm.exe")return "Windows Desktop Window Manager";
 if(name==="msmpeng.exe")return "Microsoft Defender antivirus";
 if(name==="explorer.exe")return "Windows File Explorer";
 if(r==="ASUS Aura")return "ASUS lighting / hardware utility";
 return r;
}
function publisher(p){
 let n=p.name.toLowerCase();
 if(n==="chatgpt.exe")return "OpenAI";
 if(n==="chrome.exe")return "Google";
 if(n.startsWith("asus")||n.startsWith("aura"))return "ASUS";
 if(["explorer.exe","dwm.exe","svchost.exe","msmpeng.exe"].includes(n))return "Microsoft";
 return "Not verified";
}
function info(p){
 let s=p.safety,isSafe=s==="Safe";
 let details="<div class=\"pv-detail-hero\">"+symbol(p)+"<div class=\"pv-detail-hero-info\"><strong>"+esc(friendlyName(p))+"</strong><small>"+esc(purpose(p))+"</small></div>"+chip(p)+"</div>";
 let stamp=p.create_time?new Date(p.create_time*1000).toLocaleString():"Unknown";
 let rows=[["PID",p.pid],["Publisher",publisher(p)],["File location",p.exe||"Unavailable"],["Process type",typeOf(p)],["Start time",stamp],["CPU usage",Number(p.cpu||0).toFixed(1)+"%"],["Memory usage",money(p.ram)],["Command line",p.command||"Unavailable"]];
 details+="<dl class=\"pv-detail-facts\">"+rows.map(row=>"<dt>"+esc(row[0])+"</dt><dd>"+esc(row[1])+"</dd>").join("")+"</dl>";
 let about=typeOf(p)==="Helper"?
  "This helper supports "+(p.name.toLowerCase().includes("chatgpt")?"ChatGPT.":p.name.toLowerCase().includes("chrome")?"Chrome.":"its parent application.")+" Multiple helpers are normal and are not separate copies of the app.":
  purpose(p)+". Processes with the same executable name can serve different functions.";
 details+='<div class="pv-about"><h3><span>ⓘ</span>About this process</h3><p>'+esc(about)+'</p></div>';
 let decision=isSafe?"This application process is approved for manual termination. Ending it will close the associated app and may lose unsaved work.":s==="Review"?"Manual termination is blocked because this process needs review or is an application helper.":"This process is protected to avoid disrupting Windows, hardware, NAS access, monitoring, or other important services.";
 details+='<div class="pv-safety-notice '+esc(s)+'"><strong>'+(isSafe?"✓ Safe to end":s==="Review"?"! Review before ending":"◆ Protected from termination")+'</strong><p>'+esc(decision)+'</p></div>';
 return details
}
function render(model,selection,filter,search,scope,onSelect){
 let all=model.processes||[];
 let counts={All:all.length,Safe:0,Review:0,Protected:0};
 all.forEach(p=>{if(counts[p.safety]!=null)counts[p.safety]++});
 [["All","ct-all"],["Safe","ct-safe"],["Review","ct-review"],["Protected","ct-protected"]].forEach(k=>{let el=$(k[1]);if(el)el.textContent=counts[k[0]]});
 document.querySelectorAll(".pv-filter").forEach(b=>b.classList.toggle("active",b.dataset.filter===filter));
 let query=(search||"").toLowerCase(), filtered=all.filter(p=>
  (filter==="All"||p.safety===filter)&&
  (scope==="All"||(scope==="Helper"?typeOf(p)==="Helper":typeOf(p)==="Main app"))&&
  (!query||[p.name,p.role,p.pid,p.command].join(" ").toLowerCase().includes(query))
 );
 if(selection==null&&!query){
  let first=filtered.find(p=>p.name.toLowerCase()==="chatgpt.exe"&&typeOf(p)==="Main app")||filtered[0];
  if(first){selection=first.pid;onSelect(first.pid,true)}
 }
 let caption=$("process-caption");
 caption.textContent=filtered.length+" shown · "+all.length+" running";
 let body=$("process-rows");
 let lastScroll=body.parentElement.scrollTop;
 body.innerHTML="";
 let frag=document.createDocumentFragment();
 filtered.forEach(p=>{
  let tr=document.createElement("tr");
  let active=selection===p.pid;
  if(active)tr.className="selected";
  let check='<span class="pv-check '+(p.safety==="Safe"&&active?"checked":p.safety==="Safe"?"":"blocked")+'">'+(p.safety==="Safe"&&active?"✓":"")+'</span>';
  let cmd=p.exe||p.command||"Unknown source";
  let main='<span class="pv-app-title">'+esc(friendlyName(p))+'</span>';
  let support=typeOf(p)==="Helper"?"Helper process":typeOf(p)==="Main app"?"Main application":"";
  tr.innerHTML='<td>'+check+'</td><td>'+chip(p)+'</td><td><div class="pv-app">'+symbol(p)+'<div style="min-width:0">'+main+(support?'<small class="pv-app-title"><small>'+esc(support)+'</small></small>':"")+'</div></div></td>'+
  '<td class="pv-purpose">'+esc(purpose(p))+'</td><td class="pv-num">'+p.pid+'</td>'+
  '<td class="pv-num">'+Number(p.cpu||0).toFixed(1)+'%</td><td class="pv-num">'+money(p.ram)+'</td>'+
  '<td>'+esc(typeOf(p))+'</td><td><div class="pv-command"><span title="'+esc(cmd)+'">'+esc(cmd)+'</span><b>⋮</b></div></td>';
  tr.addEventListener("click",()=>onSelect(p.pid,false));
  frag.append(tr)
 });
 body.append(frag);
 body.parentElement.scrollTop=lastScroll;
 let proc=filtered.find(p=>p.pid===selection)||all.find(p=>p.pid===selection);
 $("process-info").innerHTML=proc?info(proc):'<p class="pv-placeholder">Select a process to see its purpose, path, and safe controls.</p>';
 let canKill=!!proc&&proc.safety==="Safe";
 $("kill-btn").disabled=!canKill;
 $("pv-kill-top").disabled=!canKill;
 $("pv-open-file").disabled=!(proc&&proc.safety==="Safe"&&proc.exe);
}
window.ProcessView={render:render,typeOf:typeOf,purpose:purpose};
})();
/* Reference-matched Starts With Windows rendering. Read-only except server allowlisted actions. */
(function(){
"use strict";
function esc(v){return String(v==null?"":v).replace(/[&<>"']/g,function(x){return {"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[x]})}
function byId(id){return document.getElementById(id)}
function iconFor(p){
 var n=p.name.toLowerCase();
 if(n.includes("desktop commander"))return ["folder","▰"];
 if(n.includes("resource monitor"))return ["blue","⌁"];
 if(n.includes("ollama"))return ["teal","⬡"];
 if(n.includes("stakkhub")||n.includes("nas")||n.includes("syncthing"))return ["teal","▤"];
 if(n.includes("jackett"))return ["blue","⚓"];
 if(n.includes("microsoftedge"))return ["teal","e"];
 if(n.includes("btweb")||n.includes("torrent"))return ["purple","◉"];
 if(n.includes("virtual pet"))return ["purple","♟"];
 if(n.includes("securityhealth"))return ["blue","◆"];
 if(n.includes("diabetes")||n.includes("medical"))return ["green","✚"];
 if(n.includes("openclaw"))return ["orange","◌"];
 if(n.includes("asus")||n.includes("aura"))return ["blue","⚙"];
 return ["blue","▣"];
}
function alias(p){
 var n=p.name.toLowerCase();
 if(n.includes("desktop commander"))return "Desktop Commander";
 if(n.includes("microsoftedgeautolaunch"))return "Microsoft Edge";
 if(n==="btweb")return "BitTorrent Web";
 if(n.includes("syncthing"))return "Start Syncthing at logon";
 if(n.includes("stakkhub nas local bridge"))return "StakkHub NAS Local Bridge";
 return p.name;
}
function description(p){
 var n=p.name.toLowerCase();
 if(n.includes("desktop commander"))return "Remote computer access";
 if(n.includes("resource monitor"))return "System monitoring tools";
 if(n.includes("ollama"))return "Local AI runtime";
 if(n.includes("stakkhub")||n.includes("nas"))return "NAS connection service";
 if(n.includes("jackett"))return "Torrent indexer proxy";
 if(n.includes("syncthing"))return "Folder synchronization";
 if(n.includes("microsoftedgeautolaunch"))return "Browser auto launch";
 if(n==="btweb")return "Torrent web client";
 if(n.includes("virtual pet"))return "ASUS optional companion";
 if(n.includes("securityhealth"))return "Windows security client";
 if(n.includes("diabetes")||n.includes("medical"))return "Medical monitoring task";
 if(n.includes("openclaw"))return "Legacy gateway entry";
 return p.method;
}
function icon(p){var x=iconFor(p);return '<span class="sv-app-icon '+x[0]+'">'+x[1]+'</span>'}
function badge(p){return '<span class="sv-mini-status"><i class="sv-status-dot '+esc(p.status)+'"></i><b class="sv-status-pill '+esc(p.status)+'">'+esc(p.status)+'</b></span>'}
function safety(p){var t=p.safety||"Review";return '<span class="sv-permission '+esc(t)+'"><i>'+(t==="Safe"?"✓":t==="Review"?"!":"×")+'</i><span>'+(t==="Safe"?"Yes":t==="Protected"?"No":"Review")+'</span></span>'}
function heat(){return '<span class="sv-heat" title="No measured startup-time impact available"><i></i><i></i><i></i><span>Unknown</span></span>'}
function shortMethod(p){
 if(p.method.includes("HKCU"))return "Registry";
 if(p.method.includes("HKLM"))return "Registry";
 if(p.method.includes("Task Scheduler"))return "Task Scheduler";
 return p.method;
}
function minorMethod(p){
 if(p.method.includes("HKCU"))return "Current User";
 if(p.method.includes("HKLM"))return "Local Machine";
 if(p.method.includes("Task Scheduler"))return "Windows task";
 return "User logon";
}
function source(p){return p.method.includes("Registry")?"Registry entry":p.method==="Startup folder"?"Startup folder":"Task Scheduler"}
function priority(p){
 var n=p.name.toLowerCase();
 if(n==="remote desktop commander")return 0;
 if(n==="laptop resource monitor")return 1;
 if(n==="ollama")return 2;
 if(n==="stakkhub nas local bridge")return 3;
 if(n==="jackett bridge")return 4;
 if(n.includes("syncthing"))return 5;
 if(n.includes("microsoftedgeautolaunch"))return 6;
 if(n==="btweb")return 7;
 if(n==="virtual pet")return 8;
 if(n==="securityhealth")return 9;
 return 15;
}
function details(p){
 var box=byId("startup-info"),button=byId("disable-btn");
 if(!p){
  button.disabled=true;box.innerHTML='<div class="sv-placeholder">Select an entry to see what launches with Windows and whether you can safely disable it.</div>';return
 }
 var enabled=(p.status==="Enabled"&&p.safety==="Safe");button.disabled=!enabled;
 var method=(p.method==="Startup folder"?"Startup folder (Current User)":p.method);
 box.innerHTML='<div class="sv-detail-hero">'+icon(p)+'<div><strong>'+esc(alias(p))+'</strong><span>'+esc(description(p))+'</span></div></div>'+
 '<div class="sv-property"><label>Status</label><div>'+badge(p)+'<small>'+esc(p.status==="Enabled"?"Registered to start with Windows.":"This entry is disabled.")+'</small></div></div>'+
 '<div class="sv-property"><label>Launch type</label><div>'+esc(method)+'</div></div>'+
 '<div class="sv-property"><label>Source / Path</label><div>'+esc(p.command||"Windows Task Scheduler")+'</div></div>'+
 '<div class="sv-property"><label>Startup impact</label><div>'+heat()+'<small>Actual startup impact has not been measured.</small></div></div>'+
 '<div class="sv-property"><label>Safe to disable?</label><div>'+safety(p)+'<small>'+(p.safety==="Safe"?"Optional entry. Can be disabled after confirmation.":"Protected or requires manual review; no changes allowed here.")+'</small></div></div>';
}
function render(model,selected,onSelect){
 var rows=byId("startup-rows");if(!rows)return;
 var all=model.startup||[];
 var enabled=all.filter(function(v){return v.status==="Enabled"}).length;
 var disabled=all.filter(function(v){return v.status==="Disabled"}).length;
 byId("startup-total").textContent=all.length;
 byId("startup-enabled").textContent=enabled;
 byId("startup-disabled").textContent=disabled;
 var percent=all.length?Math.round(enabled*100/all.length):0;
 var off=all.length?Math.round(disabled*100/all.length):0;
 byId("enabled-pct").textContent=percent+"%";
 byId("disabled-pct").textContent=off+"%";
 byId("enabled-ring").style.setProperty("--p",percent);
 byId("disabled-ring").style.setProperty("--p",off);
 var boot=Number((model.metrics||{}).uptime)||0;
 var hours=Math.floor(boot/3600), mins=Math.floor(boot%3600/60);
 byId("startup-uptime").textContent=(hours?hours+"h ":"")+mins+"m";
 byId("startup-boot").textContent="Last boot: "+((model.metrics||{}).boot||"Unknown");
 byId("uptime").textContent=Math.floor(boot/60)+" minutes since last boot";
 byId("startup-impact").textContent="Not measured";
 var search=(byId("startup-search").value||"").toLowerCase().trim();
 var items=all.filter(function(p){return !search||(p.name+" "+p.method+" "+p.command).toLowerCase().includes(search)});
 items.sort(function(a,b){return priority(a)-priority(b)||a.name.localeCompare(b.name)});
 if(selected==null&&!search){var match=items.find(function(p){return p.name.toLowerCase()==="remote desktop commander"});if(match){selected=match.id;onSelect(match.id,true)}}
 var frag=document.createDocumentFragment();
 rows.innerHTML="";
 items.forEach(function(p){
  var tr=document.createElement("tr");
  if(selected===p.id)tr.className="selected";
  var command=p.command||"";
  tr.innerHTML='<td>'+badge(p)+'</td><td><div class="sv-item-cell">'+icon(p)+'<div class="sv-item-content"><strong title="'+esc(p.name)+'">'+esc(alias(p))+'</strong><small>'+esc(description(p))+'</small></div></div></td>'+
  '<td><div class="sv-two-line">'+esc(shortMethod(p))+'<small>'+esc(minorMethod(p))+'</small></div></td>'+
  '<td>'+heat()+'</td><td>'+safety(p)+'</td>'+
  '<td><div class="sv-source"><div><span>'+esc(source(p))+'</span><span title="'+esc(command)+'">'+esc(command||p.method)+'</span></div><b>⋮</b></div></td>';
  tr.addEventListener("click",function(){onSelect(p.id,false)});
  frag.appendChild(tr)
 });
 rows.appendChild(frag);
 details(items.find(function(p){return p.id===selected})||all.find(function(p){return p.id===selected})||null);
}
window.StartupView={render:render,details:details}
})();
"use strict";
(function(){
var $=function(id){return document.getElementById(id)};
var model={metrics:{},groups:[],processes:[],startup:[],history:[],token:""};
var tab="overview",filter="All",selectedPid=null,selectedStartup=null,modalAction=null;
var seriesCpu=[],seriesGpu=[];
function clamp(v,min,max){min=min===undefined?0:min;max=max===undefined?100:max;return Math.max(min,Math.min(max,Number(v)||0))}
function enc(s){return String(s==null?"":s).replace(/[&<>"']/g,function(c){return {"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]})}
function amt(v){v=Number(v||0);return v>=1024?(v/1024).toFixed(1)+" GB":Math.round(v)+" MB"}
function pretty(v){return v==null?"N/A":String(v)}
function setText(id,v){var el=$(id);if(el)el.textContent=v}
function message(msg){var t=$("toast");t.textContent=msg;t.style.display="block";clearTimeout(message.tid);message.tid=setTimeout(function(){t.style.display="none"},5500)}
function ring(id,percent){$(id).style.setProperty("--p",clamp(percent))}
function sparkline(id,list,color){if(list.length<2)return;var pts=list.map(function(v,i){return (i/(list.length-1)*240).toFixed(1)+","+(52*(1-clamp(v)/100)).toFixed(1)}).join(" ");$(id).innerHTML='<svg viewBox="0 0 240 52" preserveAspectRatio="none"><polyline points="'+pts+'" stroke="'+color+'" stroke-width="2.5" fill="none" stroke-linecap="round" stroke-linejoin="round"/></svg>'}
function chart(hist){var arr=hist.slice(-360).map(function(x){return clamp(x.value)});if(!arr.length)return;
 var points=arr.map(function(v,i){return ((i/Math.max(1,arr.length-1))*700).toFixed(1)+","+(270-v*2.7).toFixed(1)}).join(" L");
 if(arr.length===1){$("line-path").setAttribute("d","M0,"+(270-arr[0]*2.7)+" L700,"+(270-arr[0]*2.7));$("area-path").setAttribute("d","")}
 else{$("line-path").setAttribute("d","M"+points);$("area-path").setAttribute("d","M0,270 L"+points+" L700,270 Z")}
 var sum=arr.reduce(function(a,b){return a+b},0);
 setText("trend-now",arr[arr.length-1].toFixed(1)+"%");
 setText("trend-average",(sum/arr.length).toFixed(1)+"%");
 setText("trend-peak",Math.max.apply(null,arr).toFixed(1)+"%");
 setText("trend-low",Math.min.apply(null,arr).toFixed(1)+"%")
}
function showOverview(){var m=model.metrics||{};
 setText("ram-percent",pretty(m.ram)+"%");setText("ram-total",pretty(m.ram_total)+" GB");
 setText("ram-used",pretty(m.ram_used)+" GB");setText("ram-avail",pretty(m.ram_available)+" GB");setText("ram-status",m.ram>=85?"HIGH":"Normal");
 setText("ram-summary",pretty(m.ram_used)+" GB / "+pretty(m.ram_total)+" GB");ring("ram-ring",m.ram);
 setText("cpu-value",pretty(m.cpu)+"%");ring("cpu-ring",m.cpu);setText("gpu-temp",m.gpu_temp==null?"N/A":m.gpu_temp+"°C");
 setText("gpu-load",m.gpu_load==null?"N/A":m.gpu_load+"%");
 $("thermo-fill").style.width=clamp((m.gpu_temp||0)/90*100)+"%";
 var pct=m.gpu_total?Math.round(m.gpu_vram/m.gpu_total*100):0;ring("vram-ring",pct);
 setText("vram-percent",m.gpu_total?pct+"%":"N/A");setText("vram-summary",m.gpu_total?m.gpu_vram+" MB / "+m.gpu_total+" MB":"GPU memory unavailable");
 seriesCpu.push(m.cpu||0);seriesGpu.push(m.gpu_load||0);if(seriesCpu.length>75)seriesCpu.shift();if(seriesGpu.length>75)seriesGpu.shift();
 sparkline("cpu-spark",seriesCpu,"#328af0");sparkline("gpu-spark",seriesGpu,"#40c6b5");
 var groups=model.groups||[],used=(m.ram_used||0)*1024,icons=["◉","◈","▣","▤","⬡","⚙","▦"];
 $("groups").innerHTML=groups.map(function(g,i){var gp=used?Math.round(g.mb/used*100):0;return '<div class="group"><div class="group-label"><span class="ic">'+icons[i]+'</span>'+enc(g.name)+'</div><strong>'+amt(g.mb)+'</strong><small>'+g.count+' processes</small><div class="group-track"><span style="width:'+clamp(gp)+'%"></span></div></div>'}).join("");
 $("top-processes").innerHTML=(model.processes||[]).slice(0,17).map(function(p){return '<tr><td>'+enc(p.name)+'</td><td>'+p.pid+'</td><td>'+amt(p.ram)+'</td></tr>'}).join("");
 chart(model.history||[])
}
function showProcesses(){
 if(!window.ProcessView)return;
 window.ProcessView.render(model,selectedPid,filter,
   $("process-search").value,$("pv-scope").value,function(id,quiet){
    selectedPid=id;
    if(!quiet)showProcesses();
   });
}
function showProcessInfo(){if(selectedPid!=null)showProcesses()}
function showStartup(){
 if(!window.StartupView)return;
 window.StartupView.render(model, selectedStartup, function(id,quiet){
  selectedStartup=id;
  if(!quiet)showStartup();
 });
}
function showStartupInfo(){
 if(!window.StartupView)return;
 window.StartupView.details(model.startup.find(function(p){return p.id===selectedStartup})||null);
}
async function apiPost(path,body){var data=Object.assign({},body,{token:model.token});
 var response=await fetch(path,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(data)});
 var val=await response.json();if(!response.ok||!val.ok)throw Error(val.message||"Action failed");return val}
function confirmDialog(title,description,action){modalAction=action;setText("dialog-title",title);setText("dialog-message",description);$("dialog").hidden=false;$("confirm").focus()}
$("cancel").addEventListener("click",function(){$("dialog").hidden=true;modalAction=null});
$("confirm").addEventListener("click",async function(){var action=modalAction;modalAction=null;$("dialog").hidden=true;if(!action)return;
 try{var response=await action();message(response.message||"Action confirmed");await refresh()}catch(e){message("No change made: "+e.message)}});
$("kill-btn").addEventListener("click",function(){var p=model.processes.find(function(x){return x.pid===selectedPid});if(!p||p.safety!=="Safe")return;
 confirmDialog("Confirm process termination","End "+p.name+" (PID "+p.pid+")?\n\nThis will close the application and may lose unsaved work. No other processes will be targeted.",function(){return apiPost("/api/kill",{pid:p.pid,create_time:p.create_time})})});
$("disable-btn").addEventListener("click",function(){var p=model.startup.find(function(x){return x.id===selectedStartup});if(!p||p.safety!=="Safe")return;
 confirmDialog("Disable optional startup","Disable automatic startup for "+p.name+"?\n\nThe application stays installed and can be opened manually.",function(){return apiPost("/api/startup-disable",{id:p.id})})});
document.querySelectorAll(".tab").forEach(function(b){b.addEventListener("click",function(){tab=b.dataset.tab;document.querySelectorAll(".tab").forEach(function(x){x.classList.toggle("active",x===b)});
 document.querySelectorAll(".page").forEach(function(x){x.classList.toggle("active",x.id===tab)});if(tab==="processes")showProcesses();if(tab==="startup")showStartup()})});
document.querySelectorAll(".pv-filter").forEach(function(b){b.addEventListener("click",function(){filter=b.dataset.filter;showProcesses()})});
$("pv-scope").addEventListener("change",showProcesses);
$("process-search").addEventListener("input",showProcesses);
$("startup-search").addEventListener("input",showStartup);
$("proc-refresh").addEventListener("click",refresh);
$("pv-kill-top").addEventListener("click",function(){$("kill-btn").click()});
$("pv-open-file").addEventListener("click",function(){var p=model.processes.find(function(x){return x.pid===selectedPid});if(!p||p.safety!=="Safe"||!p.exe)return;confirmDialog("Open file location","Open the installed file location of "+p.name+"? This will not change any files.",function(){return apiPost("/api/reveal",{pid:p.pid,create_time:p.create_time})})});
$("startup-refresh").addEventListener("click",refresh);
async function refresh(){try{var response=await fetch("/api/state",{cache:"no-store"});if(!response.ok)throw Error("Dashboard service unavailable");var data=await response.json();
 if(!data.metrics||!data.processes)return;model=data;showOverview();if(tab==="processes")showProcesses();if(tab==="startup")showStartup();
 setText("footer-status","●  Live laptop • updated "+data.stamp)
 }catch(e){setText("footer-status","●  Offline • "+e.message)}}
refresh();setInterval(refresh,10000);
document.title="Laptop Resource Monitor";
})();