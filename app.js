const $=id=>document.getElementById(id);
const fields=["carbs","sugars","fat","sat","fiber","salt"];
let history=JSON.parse(localStorage.getItem("fc_history")||"[]");
let favorites=JSON.parse(localStorage.getItem("fc_favs")||"[]");
function num(id){const v=parseFloat($(id).value);return Number.isFinite(v)&&v>=0?v:null}
function scoreFood(p,portion){
  const c=p.carbs,s=p.sugars,f=p.fat,sat=p.sat,fi=p.fiber,salt=p.salt;
  let points=0, notes=[];
  if(c!==null){if(c>=50){points+=2;notes.push("Υψηλοί υδατάνθρακες ανά 100 g.")}else if(c>=30){points++;notes.push("Αρκετοί υδατάνθρακες ανά 100 g.")}}
  if(s!==null){if(s>=15){points+=2;notes.push("Υψηλά σάκχαρα.")}else if(s>=5){points++;notes.push("Μέτρια ποσότητα σακχάρων.")}}
  if(sat!==null){if(sat>=5){points+=2;notes.push("Υψηλά κορεσμένα λιπαρά.")}else if(sat>=1.5){points++;notes.push("Υπάρχουν κορεσμένα λιπαρά.")}}
  if(salt!==null){if(salt>=1.5){points+=2;notes.push("Υψηλό αλάτι.")}else if(salt>=0.3){points++;notes.push("Αξιόλογη ποσότητα αλατιού.")}}
  if(fi!==null&&fi>=6){points=Math.max(0,points-1);notes.push("Καλή περιεκτικότητα σε φυτικές ίνες (θετικό στοιχείο).")}
  const level=points>=5?"red":points>=2?"orange":"green";
  const title=level==="red"?"Χρειάζεται ιδιαίτερη προσοχή":level==="orange"?"Μέτρια επιλογή – έλεγξε τη μερίδα":"Καλύτερη εικόνα στα διαθέσιμα στοιχεία";
  const portionText=fields.map(k=>[k,p[k]]).filter(x=>x[1]!==null).map(([k,v])=>`${({carbs:"Υδατ/κες",sugars:"Σάκχαρα",fat:"Λιπαρά",sat:"Κορεσμένα",fiber:"Ίνες",salt:"Αλάτι"})[k]}: ${(v*portion/100).toFixed(1)} g`);
  return {level,title,points,notes,portionText};
}
function render(p,portion,save=true){
 const r=scoreFood(p,portion),out=$("output");
 out.innerHTML=`<div class="result ${r.level}"><h3>${r.title}</h3><div class="score">${r.points}/8 βαθμοί προσοχής</div><p><b>${escapeHtml(p.name||"Προϊόν")}</b></p><p><b>Ανά 100 g:</b></p><ul>${fields.map(k=>p[k]===null?"":`<li>${({carbs:"Υδατάνθρακες",sugars:"Σάκχαρα",fat:"Λιπαρά",sat:"Κορεσμένα",fiber:"Ίνες",salt:"Αλάτι"})[k]}: ${p[k]} g</li>`).join("")}</ul><p><b>Στην ποσότητα ${portion} g:</b></p><ul>${r.portionText.map(x=>`<li>${x}</li>`).join("")}</ul>${r.notes.length?`<b>Παρατηρήσεις</b><ul>${r.notes.map(x=>`<li>${x}</li>`).join("")}</ul>`:""}<button class="secondary smallbtn" id="favCurrent">☆ Προσθήκη στα αγαπημένα</button></div>`;
 $("favCurrent").onclick=()=>{if(!favorites.some(x=>x.code===p.code&&x.name===p.name)){favorites.unshift(p);persist()}drawLists()};
 if(save){history.unshift({name:p.name,portion,date:new Date().toLocaleString("el-GR"),level:r.level,product:p});history=history.slice(0,30);persist();drawLists()}
}
function escapeHtml(s){return String(s).replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]))}
function persist(){localStorage.setItem("fc_history",JSON.stringify(history));localStorage.setItem("fc_favs",JSON.stringify(favorites))}
function drawLists(){
 $("history").innerHTML=history.length?history.map((h,i)=>`<div class="history-item"><b>${escapeHtml(h.name)}</b> <span class="tag">${h.date}</span><br><span class="muted">Μερίδα ${h.portion} g</span> <button class="secondary smallbtn" data-h="${i}">Προβολή</button></div>`).join(""):"Δεν υπάρχουν ακόμη καταχωρίσεις.";
 $("history").querySelectorAll("[data-h]").forEach(b=>b.onclick=()=>{let h=history[+b.dataset.h];render(h.product,h.portion,false)});
 $("favorites").innerHTML=favorites.length?favorites.map((p,i)=>`<div class="history-item"><b>${escapeHtml(p.name)}</b> <button class="secondary smallbtn" data-f="${i}">Έλεγχος</button> <button class="secondary smallbtn" data-r="${i}">Αφαίρεση</button></div>`).join(""):"Δεν υπάρχουν αγαπημένα.";
 $("favorites").querySelectorAll("[data-f]").forEach(b=>b.onclick=()=>{let p=favorites[+b.dataset.f];render(p,Number($("portion").value)||50,false)});
 $("favorites").querySelectorAll("[data-r]").forEach(b=>b.onclick=()=>{favorites.splice(+b.dataset.r,1);persist();drawLists()});
}
function manualProduct(){
 const p={name:$("foodName").value.trim()||"Χειροκίνητη καταχώριση"};
 fields.forEach(k=>p[k]=num(k));
 if(fields.every(k=>p[k]===null)){alert("Συμπλήρωσε τουλάχιστον ένα διατροφικό στοιχείο.");return}
 render(p,Math.max(1,Number($("portion").value)||50));
}
$("manualBtn").onclick=manualProduct;
$("clearBtn").onclick=()=>{if(confirm("Να διαγραφεί όλο το ιστορικό;")){history=[];persist();drawLists()}};
async function lookup(){
 const code=$("barcode").value.replace(/\D/g,"");if(!code){alert("Πληκτρολόγησε barcode.");return}
 $("lookupBtn").disabled=true;$("lookupBtn").textContent="Αναζήτηση…";
 try{
  const res=await fetch(`https://world.openfoodfacts.org/api/v2/product/${encodeURIComponent(code)}.json`);
  if(!res.ok)throw Error("network");
  const data=await res.json();if(data.status!==1)throw Error("notfound");
  const x=data.product,n=x.nutriments||{};
  const p={code,name:x.product_name_el||x.product_name||x.generic_name||"Άγνωστο προϊόν",
  carbs:val(n.carbohydrates_100g),sugars:val(n.sugars_100g),fat:val(n.fat_100g),sat:val(n["saturated-fat_100g"]),fiber:val(n.fiber_100g),salt:val(n.salt_100g)};
  $("foodName").value=p.name;fields.forEach(k=>$(k).value=p[k]??"");
  render(p,Math.max(1,Number($("portion").value)||50));
 }catch(e){alert(e.message==="notfound"?"Δεν βρέθηκε το προϊόν. Δοκίμασε χειροκίνητη καταχώριση.":"Δεν ήταν δυνατή η σύνδεση. Έλεγξε το διαδίκτυο και ξαναδοκίμασε.")}
 finally{$("lookupBtn").disabled=false;$("lookupBtn").textContent="Έλεγχος προϊόντος"}
}
function val(v){return typeof v==="number"&&Number.isFinite(v)?v:null}
$("lookupBtn").onclick=lookup;
let stream=null;
$("scanBtn").onclick=async()=>{
 const video=$("camera");
 if(!("BarcodeDetector"in window)){alert("Η αυτόματη σάρωση δεν υποστηρίζεται σε αυτό το πρόγραμμα περιήγησης. Πληκτρολόγησε το barcode.");return}
 try{
  const detector=new BarcodeDetector({formats:["ean_13","ean_8","upc_a","upc_e"]});
  stream=await navigator.mediaDevices.getUserMedia({video:{facingMode:"environment"}});
  video.srcObject=stream;video.style.display="block";await video.play();
  $("scanNote").textContent="Στρέψε την κάμερα στο barcode. Η σάρωση θα γίνει αυτόματα.";
  const scan=async()=>{if(!stream)return;try{const codes=await detector.detect(video);if(codes.length){$("barcode").value=codes[0].rawValue;stopScan();lookup();return}}catch(e){}requestAnimationFrame(scan)};
  requestAnimationFrame(scan);
 }catch(e){alert("Δεν ήταν δυνατή η ενεργοποίηση της κάμερας. Έλεγξε την άδεια κάμερας.")}
};
function stopScan(){if(stream){stream.getTracks().forEach(t=>t.stop());stream=null}$("camera").style.display="none"}
if("serviceWorker"in navigator&&location.protocol.startsWith("http"))navigator.serviceWorker.register("./sw.js").catch(()=>{});
drawLists();
