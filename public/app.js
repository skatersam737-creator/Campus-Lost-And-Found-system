const $ = id => document.getElementById(id);
let allReports = [];
let activeFilter = "all";
let me = null;
const icons = {"Accessories":"🕶️","Electronics":"🎧","Books & stationery":"📚","ID / cards":"🪪","Bags & wallets":"👛","Keys":"🔑","Other":"📦"};
function escapeHtml(s=""){return String(s).replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));}
function dateLabel(s){if(!s)return "Date unknown";return new Date(s+"T12:00:00").toLocaleDateString("en-IN",{day:"numeric",month:"short",year:"numeric"});}
async function api(url, options={}) {
  const response = await fetch(url, options);
  const data = await response.json().catch(()=>({}));
  if(!response.ok) throw new Error(data.error || "Request failed.");
  return data;
}
function toast(msg){$("toast").textContent=msg;$("toast").classList.add("show");setTimeout(()=>$("toast").classList.remove("show"),3000);}
function openModal(title,html){$("modalTitle").textContent=title;$("modalBody").innerHTML=html;$("modal").classList.add("open");}
function closeModal(){$("modal").classList.remove("open");}
function authForm(mode="login"){
 const signup=mode==="signup";
 openModal(signup?"Create your account":"Welcome back",`
 <form id="authForm"><div class="form-grid">
 ${signup?`<div class="field full"><label for="authName">Full name</label><input id="authName" name="name" required minlength="2" maxlength="80"></div>`:""}
 <div class="field full"><label for="authEmail">Email</label><input id="authEmail" name="email" type="email" required autocomplete="email"></div>
 <div class="field full"><label for="authPassword">Password ${signup?"(at least 8 characters)":""}</label><input id="authPassword" name="password" type="password" required minlength="${signup?8:1}" autocomplete="${signup?"new-password":"current-password"}"></div>
 </div><div class="form-actions"><button class="btn primary" type="submit">${signup?"Create account":"Log in"}</button></div>
 <p class="note">${signup?'Already registered? <button class="text-btn" type="button" id="switchAuth">Log in</button>':'New here? <button class="text-btn" type="button" id="switchAuth">Create an account</button>'}</p></form>`);
 $("switchAuth").onclick=()=>authForm(signup?"login":"signup");
 $("authForm").onsubmit=async e=>{e.preventDefault();const fd=new FormData(e.currentTarget);const body=Object.fromEntries(fd.entries());try{const data=await api(signup?"/api/register":"/api/login",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(body)});me=data.user;closeModal();updateAuth();await loadReports();toast("You're signed in.");}catch(err){toast(err.message);}};
}
function reportForm(kind="lost"){
 if(!me){toast("Please log in before creating a report.");authForm("login");return;}
 openModal(kind==="lost"?"Report a lost item":"Report a found item",`
 <form id="reportForm" enctype="multipart/form-data"><div class="form-grid">
 <div class="field"><label for="kind">Report type</label><select id="kind" name="kind"><option value="lost" ${kind==="lost"?"selected":""}>Lost item</option><option value="found" ${kind==="found"?"selected":""}>Found item</option></select></div>
 <div class="field"><label for="itemName">Item name *</label><input id="itemName" name="itemName" required maxlength="80" placeholder="e.g. Black wallet"></div>
 <div class="field"><label for="category">Category *</label><select id="category" name="category" required>${Object.keys(icons).map(c=>`<option>${escapeHtml(c)}</option>`).join("")}</select></div>
 <div class="field"><label for="location">Campus location *</label><input id="location" name="location" required maxlength="100" placeholder="e.g. Library"></div>
 <div class="field"><label for="itemDate">Date *</label><input id="itemDate" name="itemDate" type="date" required value="${new Date().toISOString().slice(0,10)}"></div>
 <div class="field"><label for="colour">Colour</label><input id="colour" name="colour" maxlength="40" placeholder="e.g. Navy blue"></div>
 <div class="field full"><label for="description">Description</label><textarea id="description" name="description" maxlength="500" placeholder="Distinctive details; don't include sensitive information."></textarea></div>
 <div class="field full"><label for="image">Photo (optional, max 3 MB)</label><input id="image" name="image" type="file" accept="image/png,image/jpeg,image/webp,image/gif"></div>
 </div><div class="form-actions"><button type="button" class="btn" data-close>Cancel</button><button class="btn primary" type="submit">Publish report ↗</button></div></form>`);
 $("reportForm").onsubmit=async e=>{e.preventDefault();try{await api("/api/reports",{method:"POST",body:new FormData(e.currentTarget)});closeModal();await loadReports();toast("Report published successfully.");}catch(err){toast(err.message);}};
}
async function showMatches(id){
 try{
  const data=await api(`/api/reports/${id}/matches`);
  if(!data.matches.length){toast("No strong possible matches yet.");return;}
  openModal("Possible matches",`<p class="note">${escapeHtml(data.note)}</p>${data.matches.map(m=>`<article class="match-row"><div><b>${escapeHtml(m.item_name)}</b><p>${escapeHtml(m.kind)} • ${escapeHtml(m.location)} • ${escapeHtml(m.category)}</p></div><strong>${m.score}%<small> similarity</small></strong></article>`).join("")}`);
 }catch(err){toast(err.message);}
}
async function markReturned(id){
 try{await api(`/api/reports/${id}/returned`,{method:"POST"});await loadReports();toast("Report marked as returned.");}catch(err){toast(err.message);}
}
function renderReports(){
 const q=$("searchInput").value.trim().toLowerCase();
 const reports=allReports.filter(r=>(activeFilter==="all"||r.kind===activeFilter)&&(!q||[r.item_name,r.category,r.colour,r.location,r.description,r.kind].join(" ").toLowerCase().includes(q)));
 $("itemsGrid").innerHTML=reports.map(r=>`<article class="item"><div class="item-visual ${r.kind}">${r.image_path?`<img src="${escapeHtml(r.image_path)}" alt="Photo of ${escapeHtml(r.item_name)}">`:`<span>${icons[r.category]||"📦"}</span>`}<span class="status ${r.kind}">${r.status==="returned"?"Returned":r.kind==="lost"?"Lost item":"Found item"}</span><span class="category">${escapeHtml(r.category)}</span></div><div class="item-body"><div class="item-title"><h3>${escapeHtml(r.item_name)}</h3><span>${r.status==="returned"?"✓":"⌕"}</span></div><p class="item-desc">${escapeHtml(r.description||"No additional description.")}</p><div class="meta"><span>⌖ ${escapeHtml(r.location)}</span><span>◷ ${dateLabel(r.item_date)}</span></div><div class="item-foot"><small>${escapeHtml(r.colour||"Colour not specified")}</small><button class="text-btn" data-match="${r.id}">Find matches ↗</button></div>${me&&(me.id===r.user_id||me.role==="admin")&&r.status!=="returned"?`<button class="btn mark-btn" data-return="${r.id}">Mark returned ✓</button>`:""}</div></article>`).join("");
 $("emptyState").classList.toggle("hidden",reports.length>0);
 document.querySelectorAll("[data-match]").forEach(b=>b.onclick=()=>showMatches(b.dataset.match));
 document.querySelectorAll("[data-return]").forEach(b=>b.onclick=()=>markReturned(b.dataset.return));
}
async function loadReports(){
 try{const data=await api("/api/reports");allReports=data.reports;$("openStat").textContent=data.stats.open;$("foundStat").textContent=data.stats.found;$("returnedStat").textContent=data.stats.returned;renderReports();}catch(err){toast("Could not load reports: "+err.message);}
}
async function loadMe(){
 try{const data=await api("/api/me");me=data.user;updateAuth();}catch{me=null;updateAuth();}
}
function updateAuth(){
 $("welcome").textContent=me?`Hi, ${me.name}`:"";
 $("authBtn").classList.toggle("hidden",!!me);$("logoutBtn").classList.toggle("hidden",!me);
 $("mineStat").textContent=me?"Signed in":"—";
}
async function showMyReports(){
 if(!me){authForm("login");return;}
 try{const data=await api("/api/my-reports");openModal("My reports",data.reports.length?data.reports.map(r=>`<article class="match-row"><div><b>${escapeHtml(r.item_name)}</b><p>${escapeHtml(r.kind)} • ${escapeHtml(r.location)} • ${escapeHtml(r.status)}</p></div><span>${dateLabel(r.item_date)}</span></article>`).join(""):"<p>You have not submitted any reports yet.</p>");}catch(err){toast(err.message);}
}
$("authBtn").onclick=()=>authForm("login");$("logoutBtn").onclick=async()=>{try{await api("/api/logout",{method:"POST"});me=null;updateAuth();await loadReports();toast("Logged out.");}catch(err){toast(err.message);}};
$("reportTop").onclick=()=>reportForm("lost");$("lostCta").onclick=()=>reportForm("lost");$("foundCta").onclick=()=>reportForm("found");
$("searchInput").addEventListener("input",renderReports);$("clearSearch").onclick=()=>{$("searchInput").value="";renderReports();};
document.querySelectorAll("[data-filter]").forEach(b=>b.onclick=()=>{document.querySelectorAll("[data-filter]").forEach(x=>x.classList.remove("active"));b.classList.add("active");activeFilter=b.dataset.filter;renderReports();});
$("modal").addEventListener("click",e=>{if(e.target===$("modal")||e.target.matches("[data-close]"))closeModal();});
document.addEventListener("keydown",e=>{if(e.key==="Escape")closeModal();});
loadMe().then(loadReports);