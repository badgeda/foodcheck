const $=id=>document.getElementById(id);
const KEYS={hist:"fc_history",favs:"fc_favs",meals:"fc_meals_v2",journal:"fc_journal_v2",foods:"fc_food_catalog_v1"};
const read=(k,d=[])=>{try{return JSON.parse(localStorage.getItem(k)||JSON.stringify(d))}catch{return d}};
let history=read(KEYS.hist),favorites=read(KEYS.favs),mealLibrary=read(KEYS.meals),journal=read(KEYS.journal),foodCatalog=read(KEYS.foods,{});
let mealItems=[],photos=[],lastProduct=null,lastMealResult=null,scanner=null;
const PHOTO_DB="foodcheck_photos",PHOTO_STORE="images";
let photoDbPromise=null;
const photoIds=new Map();
function openPhotoDB(){
 if(!("indexedDB" in window))return Promise.reject(new Error("Το πρόγραμμα περιήγησης δεν υποστηρίζει IndexedDB."));
 if(!photoDbPromise)photoDbPromise=new Promise((resolve,reject)=>{const req=indexedDB.open(PHOTO_DB,1);req.onupgradeneeded=()=>{const db=req.result;if(!db.objectStoreNames.contains(PHOTO_STORE))db.createObjectStore(PHOTO_STORE,{keyPath:"id"})};req.onsuccess=()=>resolve(req.result);req.onerror=()=>reject(req.error||new Error("Αποτυχία ανοίγματος αποθήκευσης φωτογραφιών."));req.onblocked=()=>reject(new Error("Η αποθήκευση φωτογραφιών είναι προσωρινά κλειδωμένη."))});
 return photoDbPromise;
}
function dataURLtoBlob(dataURL){const [head,body]=dataURL.split(",");const mime=(head.match(/data:(.*?);base64/)||[])[1]||"image/jpeg";const raw=atob(body);const bytes=new Uint8Array(raw.length);for(let i=0;i<raw.length;i++)bytes[i]=raw.charCodeAt(i);return new Blob([bytes],{type:mime})}
function blobToDataURL(blob){return new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(reader.result);reader.onerror=()=>reject(reader.error);reader.readAsDataURL(blob)})}
async function storePhoto(dataURL){if(typeof dataURL!=="string"||!dataURL.startsWith("data:"))return dataURL;let id=photoIds.get(dataURL);if(!id){id="photo-"+(crypto.randomUUID?crypto.randomUUID():Date.now()+"-"+Math.random().toString(36).slice(2));photoIds.set(dataURL,id)}const db=await openPhotoDB();await new Promise((resolve,reject)=>{const tx=db.transaction(PHOTO_STORE,"readwrite");tx.objectStore(PHOTO_STORE).put({id,blob:dataURLtoBlob(dataURL),savedAt:Date.now()});tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error||new Error("Η αποθήκευση φωτογραφίας ακυρώθηκε."))});return "idb:"+id}
async function loadPhoto(reference){if(typeof reference!=="string"||!reference.startsWith("idb:"))return reference;const db=await openPhotoDB();const record=await new Promise((resolve,reject)=>{const req=db.transaction(PHOTO_STORE,"readonly").objectStore(PHOTO_STORE).get(reference.slice(4));req.onsuccess=()=>resolve(req.result);req.onerror=()=>reject(req.error)});if(!record?.blob)throw new Error("Δεν βρέθηκε αποθηκευμένη φωτογραφία.");const url=await blobToDataURL(record.blob);photoIds.set(url,reference.slice(4));return url}
async function hydratePhotos(records){for(const record of records){if(Array.isArray(record.photos)){const restored=[];for(const photo of record.photos)restored.push(await loadPhoto(photo));record.photos=restored}}}
let saveQueue=Promise.resolve();
function save(){
 // Οι φωτογραφίες αποθηκεύονται ως Blob στο IndexedDB. Τα υπόλοιπα δεδομένα μένουν στο localStorage.
 const operation=async()=>{
  const persist=async records=>Promise.all(records.map(async record=>({...record,photos:Array.isArray(record.photos)?await Promise.all(record.photos.map(storePhoto)):[]})));
  try{const [savedMeals,savedJournal]=await Promise.all([persist(mealLibrary),persist(journal)]);localStorage.setItem(KEYS.hist,JSON.stringify(history));localStorage.setItem(KEYS.favs,JSON.stringify(favorites));localStorage.setItem(KEYS.meals,JSON.stringify(savedMeals));localStorage.setItem(KEYS.journal,JSON.stringify(savedJournal));localStorage.setItem(KEYS.foods,JSON.stringify(foodCatalog));return true}
  catch(error){console.error("FoodCheck save:",error);alert("Δεν ήταν δυνατή η ασφαλής αποθήκευση. Τα στοιχεία παραμένουν προσωρινά στην οθόνη. Έλεγξε τον διαθέσιμο χώρο και δοκίμασε ξανά.");return false}
 };
 saveQueue=saveQueue.then(operation,operation);return saveQueue;
}
const num=id=>{let v=parseFloat($(id).value);return Number.isFinite(v)&&v>=0?v:null};
const val=(v)=>{if(v===null||v===undefined||v==="")return null;const n=Number(v);return Number.isFinite(n)&&n>=0?n:null};
const esc=s=>String(s??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
function tab(name){document.querySelectorAll("main>section").forEach(s=>s.classList.toggle("hidden",s.id!=="tab-"+name));document.querySelectorAll("[data-tab]").forEach(b=>b.classList.toggle("active",b.dataset.tab===name))}
document.querySelectorAll("[data-tab]").forEach(b=>b.onclick=()=>tab(b.dataset.tab));
function checkProductValues(p){
 const warnings={};
 const valid=v=>v!==null&&v!==undefined&&Number.isFinite(Number(v))&&Number(v)>=0;
 const mark=(field,message)=>warnings[field]=message;

 for(const field of ["carbs","sugars","fat","sat","fiber","salt","protein","trans"]){
  if(valid(p[field])&&Number(p[field])>100){
   mark(field,"Η τιμή υπερβαίνει τα 100 g ανά 100 g προϊόντος.");
  }
 }

 if(valid(p.sugars)&&valid(p.carbs)&&Number(p.sugars)>Number(p.carbs)+0.1)
  mark("sugars","Τα σάκχαρα υπερβαίνουν τους συνολικούς υδατάνθρακες.");

 if(valid(p.sat)&&valid(p.fat)&&Number(p.sat)>Number(p.fat)+0.1)
  mark("sat","Τα κορεσμένα λιπαρά υπερβαίνουν τα συνολικά λιπαρά.");

 if(valid(p.trans)&&valid(p.fat)&&Number(p.trans)>Number(p.fat))
  mark("trans","Τα trans λιπαρά υπερβαίνουν τα συνολικά λιπαρά. Χρειάζεται επιβεβαίωση.");

 if(p.fruitVegPercent!=null&&Number.isFinite(Number(p.fruitVegPercent))&&Number(p.fruitVegPercent)>100)mark("fruitVegPercent","Το ποσοστό δεν μπορεί να υπερβαίνει το 100%.");
 if(p.novaGroup!=null&&p.novaGroup!==""){
  const n=Number(p.novaGroup);
  if(!Number.isInteger(n)||n<1||n>4)
   mark("novaGroup","Μη έγκυρη κατηγορία NOVA. Επιτρεπτές τιμές: 1 έως 4.");
 }

 const identity=(String(p.name||"")+" "+String(p.ingredients||"")).toLocaleLowerCase("el");
 const isWater=/\b(eau|water|aqua|vittel|evian|perrier|san pellegrino)\b|νερ(ό|ου|α)/i.test(identity);

 if(isWater){
  for(const field of ["carbs","sugars","fat","sat","fiber","protein","trans"]){
   if(valid(p[field])&&Number(p[field])>0.1)
    mark(field,"Ασυνήθιστη τιμή για προϊόν που αναγνωρίζεται ως νερό. Χρειάζεται επιβεβαίωση.");
  }
 }

 return warnings;
}
function pointsAbove(value,thresholds){return thresholds.reduce((sum,t)=>sum+(Number(value)>t?1:0),0)}
function nutriScore2023(p){
 const required=[p.energyKj,p.sugars,p.sat,p.salt];
 if(required.some(v=>v==null||!Number.isFinite(Number(v))||Number(v)<0))
  return {score:null,grade:null,reason:"Λείπουν υποχρεωτικά στοιχεία (ενέργεια kJ, σάκχαρα, κορεσμένα ή αλάτι)."};
 const energy=Number(p.energyKj),sugars=Number(p.sugars),sat=Number(p.sat),salt=Number(p.salt);
 const nEnergy=pointsAbove(energy,[335,670,1005,1340,1675,2010,2345,2680,3015,3350]);
 const nSat=pointsAbove(sat,[1,2,3,4,5,6,7,8,9,10]);
 const nSugar=pointsAbove(sugars,[3.4,6.8,10,14,17,20,24,27,31,34,37,41,44,48,51]);
 const nSalt=pointsAbove(salt,[.2,.4,.6,.8,1,1.2,1.4,1.6,1.8,2,2.2,2.4,2.6,2.8,3,3.2,3.4,3.6,3.8,4]);
 const N=nEnergy+nSat+nSugar+nSalt;
 const fiber=p.fiber==null?0:Number(p.fiber);
 const protein=p.protein==null?0:Number(p.protein);
 const fruit=p.fruitVegPercent==null?0:Number(p.fruitVegPercent);
 const fiberPoints=pointsAbove(fiber,[3,4.1,5.2,6.3,7.4]);
 const proteinPoints=pointsAbove(protein,[2.4,4.8,7.2,9.6,12,14,17]);
 const fruitPoints=fruit>80?5:fruit>60?2:fruit>40?1:0;
 const P=fiberPoints+proteinPoints+fruitPoints;
 const score=N>=11?N-fiberPoints-fruitPoints:N-P;
 const grade=score<=-1?"A":score<=2?"B":score<=10?"C":score<=18?"D":"E";
 return {score,grade,N,P,nEnergy,nSat,nSugar,nSalt,fiberPoints,proteinPoints,fruitPoints,
  reason:"Υπολογισμός Nutri-Score 2023 για γενικά τρόφιμα. Για ειδικές κατηγορίες (π.χ. ποτά, τυριά, λίπη/ξηρούς καρπούς και κόκκινο κρέας) απαιτούνται ξεχωριστοί κανόνες."};
}
function assess(p,portion=100){
 const warnings=checkProductValues(p);
 const data={...p};
 Object.keys(warnings).forEach(field=>{data[field]=null});
 const valid=v=>v!=null&&Number.isFinite(Number(v))&&Number(v)>=0;
 const per=v=>valid(v)?Number(v)*portion/100:null;
 const carbs=per(data.carbs),sugars=per(data.sugars);
 const sugarImpact=sugars==null?null:(sugars<=5?5:sugars<=10?25:sugars<=15?45:sugars<=20?65:sugars<=30?85:100);
 const sat=per(data.sat),trans=per(data.trans);
 const notes=[];
 const clamp=n=>Math.max(0,Math.min(100,Math.round(n)));
 const diabetes=carbs==null?null:clamp(carbs<=5?5:carbs<=10?15:carbs<=15?28:carbs<=20?42:carbs<=30?60:carbs<=45?80:95);
 let triglycerides=null;
 if(carbs!=null){
  let t=carbs<=10?8:carbs<=20?22:carbs<=30?40:carbs<=45?60:82;
  if(sugars!=null)t+=Math.min(18,sugars*0.9);
  if(Number(data.novaGroup)>=3)t+=8;
  triglycerides=clamp(t);
 }
 let cholesterol=null;
 if(sat!=null||trans!=null){
  const s=sat==null?0:sat,t=trans==null?0:trans;
  const base=s<=1?5:s<=2?18:s<=3?32:s<=5?52:s<=7?72:90;
  cholesterol=clamp(base+(t>0?Math.min(25,t*100):0));
 }
 if(diabetes!=null&&diabetes>=67)notes.push("Αυξημένοι συνολικοί υδατάνθρακες στη μερίδα.");
 if(triglycerides!=null&&triglycerides>=67)notes.push("Αυξημένη επιβάρυνση από υδατάνθρακες/σάκχαρα στη μερίδα.");
 if(cholesterol!=null&&cholesterol>=67)notes.push("Υψηλή επιβάρυνση από κορεσμένα ή/και trans λιπαρά.");
 if(valid(data.fiber)&&per(data.fiber)>=3)notes.push("Οι φυτικές ίνες είναι θετικό στοιχείο.");
 if(valid(data.protein)&&per(data.protein)>=10)notes.push("Καλή ποσότητα πρωτεΐνης στη μερίδα.");
 if(valid(data.salt)&&data.salt>1.5)notes.push("Υψηλή περιεκτικότητα σε αλάτι ανά 100 g.");
 const nova=Number(data.novaGroup);
 const ing=String(data.ingredients||"").toLocaleLowerCase("el");
 const confirmedTrans=valid(data.trans)&&Number(data.trans)>0;
 const ingredientTrans=/trans[-\s]*fat/.test(ing);
 const partiallyHydrogenated=/μερικώς υδρογονωμέν|partially hydrogenated/.test(ing);
 const forbiddenReasons=[];
 if(nova===4)forbiddenReasons.push("Υπερεπεξεργασμένο προϊόν (NOVA 4).");
 if(confirmedTrans||ingredientTrans)forbiddenReasons.push("Περιέχει trans λιπαρά.");
 else if(partiallyHydrogenated)forbiddenReasons.push("Περιέχει μερικώς υδρογονωμένα λιπαρά.");
 const nutri=nutriScore2023(data);
 const gradeLabels={A:"Πολύ καλή διατροφική ποιότητα",B:"Καλή διατροφική ποιότητα",C:"Μέτρια διατροφική ποιότητα",D:"Χαμηλή διατροφική ποιότητα",E:"Πολύ χαμηλή διατροφική ποιότητα"};
 const qualityReasons=[];
 if(nutri.score!=null){
  qualityReasons.push("Αρνητικοί βαθμοί N: "+nutri.N+" (ενέργεια "+nutri.nEnergy+", κορεσμένα "+nutri.nSat+", σάκχαρα "+nutri.nSugar+", αλάτι "+nutri.nSalt+").");
  qualityReasons.push("Θετικοί βαθμοί P: "+nutri.P+" (ίνες "+nutri.fiberPoints+", πρωτεΐνη "+nutri.proteinPoints+", φρούτα/λαχανικά/όσπρια "+nutri.fruitPoints+")."+(nutri.N>=11?" Επειδή N ≥ 11, οι βαθμοί πρωτεΐνης δεν αφαιρούνται από το τελικό αποτέλεσμα.":""));
  notes.push(nutri.reason);
  if(data.fiber==null)notes.push("Δεν υπάρχουν στοιχεία φυτικών ινών· δεν αποδόθηκαν θετικοί βαθμοί ινών.");
  if(data.fruitVegPercent==null)notes.push("Δεν υπάρχει εκτίμηση ποσοστού φρούτων/λαχανικών/οσπρίων· δεν αποδόθηκαν σχετικοί θετικοί βαθμοί.");
 }else notes.push(nutri.reason);
 if(nova===4)qualityReasons.push("NOVA 4: υπερεπεξεργασμένο προϊόν — ξεχωριστός κανόνας απαγόρευσης.");
 if(confirmedTrans||ingredientTrans)qualityReasons.push("Εντοπίστηκαν trans λιπαρά — ξεχωριστός κανόνας απαγόρευσης.");
 if(partiallyHydrogenated)qualityReasons.push("Εντοπίστηκαν μερικώς υδρογονωμένα λιπαρά στα συστατικά — ξεχωριστός κανόνας απαγόρευσης.");
 const known=[data.energyKj,data.carbs,data.sugars,data.sat,data.salt,data.fiber,data.fat,data.protein,data.trans,data.novaGroup].filter(valid).length;
 const confidence=known>=7?"Καλή":known>=5?"Μέτρια":"Χαμηλή";
 if(!valid(data.carbs))notes.push("Δεν υπάρχουν αξιόπιστα στοιχεία υδατανθράκων.");
 if(!valid(data.sat)&&!valid(data.trans))notes.push("Δεν υπάρχουν αξιόπιστα στοιχεία κορεσμένων ή trans λιπαρών.");
 return {
  score:nutri.score,grade:nutri.grade,gradeLabel:gradeLabels[nutri.grade]||"Δεν υπολογίστηκε",
  level:nutri.grade==null||nutri.grade==="C"?"risk-mid":nutri.grade==="A"||nutri.grade==="B"?"risk-low":"risk-high",
  confidence,notes,portionCarbs:carbs,portionSat:sat,portionTrans:trans,portionProtein:per(data.protein),known,
  diabetesScore:diabetes,triglyceridesScore:triglycerides,cholesterolScore:cholesterol,sugarsScore:sugarImpact,
  qualityReasons,forbiddenReasons,warnings
 };
}
function barHTML(label,value,reason){
 if(value==null)return `<div class="impact"><div class="impact-head"><b>${label}</b><span>Ανεπαρκή δεδομένα</span></div><div class="impact-track unavailable"></div><p class="muted">Δεν υπάρχουν αρκετά στοιχεία για αξιόπιστη ένδειξη.</p></div>`;
 const color=value<=33?'#279653':value<=66?'#e5ad27':'#d94747';
 return `<div class="impact"><div class="impact-head"><b>${label}</b><span>${value}/100 · ${value<=33?'Χαμηλή':value<=66?'Μέτρια':'Υψηλή'} επιβάρυνση</span></div><div class="impact-track"><span class="impact-marker" style="left:${value}%;--marker-color:${color}"></span></div><p class="muted">${reason}</p></div>`;
}
function resultHTML(p,portion,r){
 const scoreText=r.score==null?"Nutri-Score: μη διαθέσιμο":`Nutri-Score ${r.grade} · ${r.score} βαθμοί`;
 const qualityLabel=r.gradeLabel||"Ανεπαρκή στοιχεία";

 const valueHTML=(field,value,unit="g")=>{
  const warning=r.warnings?.[field];
  return `${value??"—"}${unit?" "+unit:""}${warning?` <strong style="color:#c62828" title="${esc(warning)}">ΠΡΟΣΟΧΗ – ΑΣΥΝΗΘΙΣΤΗ ΤΙΜΗ</strong>`:""}`;
 };

 return `<div class="result ${r.level}">
 <div class="scoreline"><div class="score">${scoreText}</div><div><b>${qualityLabel}</b><br><span class="pill">Ποιότητα δεδομένων: ${r.confidence}</span></div></div>
 ${r.diabetesScore!=null&&r.diabetesScore>33?'<div style="background:#ffebee;border:2px solid #c62828;color:#b71c1c;padding:10px;margin:10px 0;border-radius:8px;font-size:18px;font-weight:900;text-align:center;">⛔ ΑΚΑΤΑΛΛΗΛΟ ΓΙΑ ΔΙΑΒΗΤΙΚΟΥΣ</div>':""}
 ${r.cholesterolScore!=null&&r.cholesterolScore>33?'<div style="background:#fff8e1;border:2px solid #e5ad27;color:#805600;padding:10px;margin:10px 0;border-radius:8px;font-size:17px;font-weight:900;text-align:center;">⚠️ ΚΙΝΔΥΝΟΣ ΑΥΞΗΣΗΣ ΧΟΛΗΣΤΕΡΙΝΗΣ</div>':""}
 ${r.triglyceridesScore!=null&&r.triglyceridesScore>33?'<div style="background:#fff8e1;border:2px solid #e5ad27;color:#805600;padding:10px;margin:10px 0;border-radius:8px;font-size:17px;font-weight:900;text-align:center;">⚠️ ΚΙΝΔΥΝΟΣ ΑΥΞΗΣΗΣ ΤΡΙΓΛΥΚΕΡΙΔΙΩΝ</div>':""}
 ${r.forbiddenReasons?.length?'<div style="background:#ffebee;border:2px solid #c62828;color:#b71c1c;padding:12px;margin:12px 0;border-radius:8px;font-size:20px;font-weight:900;text-align:center;">⛔ ΑΚΑΤΑΛΛΗΛΟ ΠΡΟΣ ΚΑΤΑΝΑΛΩΣΗ</div><ul style="color:#b71c1c;font-weight:700;">'+r.forbiddenReasons.map(x=>"<li>"+esc(x)+"</li>").join("")+"</ul>":""}
 <b>${esc(p.name||"Τρόφιμο")}</b>
 <h3>Γενική διατροφική ποιότητα</h3>
 <p>Υπολογισμός βάσει Nutri-Score 2023 ανά 100 g. Η βαθμολογία είναι οι επίσημοι βαθμοί του αλγορίθμου και όχι ποσοστό /100. Η εφαρμογή διακρίνει την άγνωστη πληροφορία από το μηδέν.</p>
 ${r.qualityReasons?.length?"<ul>"+r.qualityReasons.map(x=>"<li>"+esc(x)+"</li>").join("")+"</ul>":"<p class='muted'>Δεν εντοπίστηκε καταχωρισμένος παράγοντας αφαίρεσης.</p>"}
 <h3>Επιβάρυνση στη μερίδα των ${portion} g</h3>
 ${barHTML("Διαβήτης",r.diabetesScore,`Συνολικοί υδατάνθρακες: ${r.portionCarbs==null?"—":r.portionCarbs.toFixed(1)+" g"} στη μερίδα.`)}
 ${barHTML("Σάκχαρα",r.sugarsScore,`Σάκχαρα: ${r.warnings?.sugars?"μη αξιόπιστη τιμή":(r.sugarsScore==null?"—":"υπολογίστηκαν στη μερίδα των "+portion+" g")}. Η ένδειξη αφορά τα γραμμάρια σακχάρων, όχι μέτρηση γλυκόζης αίματος.`)}
 ${barHTML("Τριγλυκερίδια",r.triglyceridesScore,"Συνεκτιμώνται οι υδατάνθρακες, τα σάκχαρα και η ένδειξη επεξεργασίας όπου είναι γνωστή.")}
 ${barHTML("Χοληστερίνη",r.cholesterolScore,`Κορεσμένα λιπαρά: ${r.portionSat==null?"—":r.portionSat.toFixed(1)+" g"} · Trans λιπαρά: ${r.portionTrans==null?"—":r.portionTrans.toFixed(2)+" g"} στη μερίδα.`)}
 <h3>Διατροφικά στοιχεία ανά 100 g</h3>
 <p>Ενέργεια: ${valueHTML("energyKj",p.energyKj,"kJ")} · Υδατάνθρακες: ${valueHTML("carbs",p.carbs)} · Σάκχαρα: ${valueHTML("sugars",p.sugars)} · Πρωτεΐνες: ${valueHTML("protein",p.protein)}.</p>
<p>Συνολικά λιπαρά: ${valueHTML("fat",p.fat)} · Κορεσμένα: ${valueHTML("sat",p.sat)} · <strong style="${Number(p.trans)>0?'color:#d00000;font-weight:900':''}">Trans: ${valueHTML("trans",p.trans)}</strong> · Ίνες: ${valueHTML("fiber",p.fiber)} · Αλάτι: ${valueHTML("salt",p.salt)}.</p> <h3>Συστατικά και επεξεργασία</h3>
 <p>${esc(p.ingredients||"Δεν καταχωρίστηκε λίστα συστατικών.")}</p>
 <p>Ποσοστό φρούτων/λαχανικών/οσπρίων: ${valueHTML("fruitVegPercent",p.fruitVegPercent,"%")} · Κατηγορία NOVA: ${valueHTML("novaGroup",p.novaGroup,"")} · Πρόσθετα: ${esc(p.additives||"Δεν υπάρχουν διαθέσιμα στοιχεία.")}</p>
 ${r.notes.length?"<b>Παρατηρήσεις</b><ul>"+r.notes.map(n=>"<li>"+esc(n)+"</li>").join("")+"</ul>":""}
 <p class="muted">Οι μπάρες είναι ενδεικτικές διατροφικές ενδείξεις και όχι ιατρική οδηγία. Τα πρόσθετα Ε δεν τιμωρούνται αυτομάτως: απαιτείται αξιολόγηση της συγκεκριμένης ουσίας και της χρήσης της.</p>
 </div>`;
}

function assessMeal(p,portion=100){
 const c=p.carbs;
 if(c==null)return {score:null};
 const portionCarbs=Number(c)*portion/100;
 // Προσωρινή ένδειξη γεύματος: βασίζεται μόνο στους γνωστούς υδατάνθρακες.
 // Δεν παρουσιάζεται ως συνολική ποιότητα όταν λείπουν τα υπόλοιπα στοιχεία.
 return {score:Math.max(0,Math.min(69,Math.round(100-(portionCarbs*1.2))))};
}
function currentProduct(){return {name:$("pname").value.trim()||"Χειροκίνητο προϊόν",code:$("barcode").value.trim(),energyKj:num("energyKj"),carbs:num("carbs"),sugars:num("sugars"),fat:num("fat"),sat:num("sat"),fiber:num("fiber"),salt:num("salt"),protein:num("protein"),fruitVegPercent:num("fruitVegPercent"),ingredients:$("ingredients").value.trim(),novaGroup:num("novaGroup"),additives:$("additives").value.trim(),trans:num("trans")}}
function showProduct(p,saveHistory=true){lastProduct=p;let portion=num("portion")||50,r=assess(p,portion);$("productResult").innerHTML=resultHTML(p,portion,r);if(saveHistory){history.unshift({name:p.name,portion,date:new Date().toLocaleString("el-GR"),product:p,score:r.score,grade:r.grade});history=history.slice(0,40);save();drawProductLists()}}
$("rateProduct").onclick=()=>{let p=currentProduct();if(Object.values(p).filter(v=>typeof v==="number").length===0){alert("Συμπλήρωσε τουλάχιστον ένα διατροφικό στοιχείο.");return}showProduct(p)};
$("saveFav").onclick=()=>{let p=lastProduct||currentProduct();if(!p.name){alert("Πρώτα αξιολόγησε ή συμπλήρωσε ένα προϊόν.");return}if(!favorites.some(x=>x.code===p.code&&x.name===p.name)){favorites.unshift(p);save();drawProductLists()}};
function drawProductLists(){
 $("productHistory").innerHTML=history.length?history.map((h,i)=>`<div class="item"><b>${esc(h.name)}</b> <span class="pill">${esc(h.date||"")}</span><br><span class="muted">Μερίδα ${h.portion||"—"} g · Nutri-Score ${h.grade??"—"} (${h.score??"—"} βαθμοί)</span> <button class="secondary small" data-h="${i}">Προβολή</button></div>`).join(""):"Δεν υπάρχουν καταχωρίσεις.";
$("productHistory").querySelectorAll("[data-h]").forEach(b=>b.onclick=e=>{
 e.preventDefault();
 const h=history[+b.dataset.h];
 const p=h?.product||h;
 if(!p){alert("Δεν βρέθηκαν αποθηκευμένα στοιχεία προϊόντος.");return}
 fillProduct(p);
 if(h.portion)$("portion").value=h.portion;
 showProduct(p,false);
});
 $("productFavorites").innerHTML=favorites.length?favorites.map((p,i)=>`<div class="item"><b>${esc(p.name)}</b> <button class="secondary small" data-f="${i}">Έλεγχος</button> <button class="danger small" data-r="${i}">Αφαίρεση</button></div>`).join(""):"Δεν υπάρχουν αγαπημένα.";
 $("productFavorites").querySelectorAll("[data-f]").forEach(b=>b.onclick=()=>{let p=favorites[+b.dataset.f];fillProduct(p);showProduct(p,false)});
 $("productFavorites").querySelectorAll("[data-r]").forEach(b=>b.onclick=()=>{favorites.splice(+b.dataset.r,1);save();drawProductLists()});
}

function fillProduct(p){$("pname").value=p.name||"";$("barcode").value=p.code||"";for(let k of ["energyKj","carbs","sugars","fat","sat","fiber","salt","protein","fruitVegPercent","trans","novaGroup"])$(k).value=p[k]??"";$("ingredients").value=p.ingredients||"";$("additives").value=p.additives||""}
$("lookupBtn").onclick=async()=>{let code=$("barcode").value.replace(/\D/g,"");if(!code){alert("Πληκτρολόγησε barcode.");return}let b=$("lookupBtn");b.disabled=true;b.textContent="Αναζήτηση…";try{let res=await fetch(`https://world.openfoodfacts.org/api/v2/product/${encodeURIComponent(code)}.json`);if(!res.ok)throw 0;let d=await res.json();if(d.status!==1)throw 1;let x=d.product,n=x.nutriments||{};const novaRaw=x.nova_group??x.nova_groups??n["nova-group_100g"]??n["nova-group"]??(Array.isArray(x.nova_groups_tags)?(x.nova_groups_tags.find(t=>/^en:[1-4]-/.test(t))||"").match(/^en:([1-4])-/)?.[1]:null);const fruitRaw=x["fruits-vegetables-nuts-estimate-from-ingredients_100g"]??x["fruits-vegetables-legumes-estimate-from-ingredients_100g"];let p={code,name:x.product_name_el||x.product_name||x.generic_name||"Άγνωστο προϊόν",energyKj:val(n["energy-kj_100g"])??(val(n["energy-kcal_100g"])==null?null:val(n["energy-kcal_100g"])*4.184),carbs:val(n.carbohydrates_100g),sugars:val(n.sugars_100g),fat:val(n.fat_100g),sat:val(n["saturated-fat_100g"]),fiber:val(n.fiber_100g),salt:val(n.salt_100g),protein:val(n.proteins_100g),fruitVegPercent:val(fruitRaw),ingredients:x.ingredients_text_el||x.ingredients_text||"",novaGroup:val(novaRaw),additives:(x.additives_tags||[]).map(t=>t.replace(/^en:/,"" )).join(", "),trans:val(n["trans-fat_100g"]??n["trans_fat_100g"])};fillProduct(p);showProduct(p)}catch(e){console.error("FoodCheck API error:",e);alert(e===1?"Δεν βρέθηκε το προϊόν.":"Αποτυχία σύνδεσης με τη βάση.\nΤεχνική ένδειξη: "+(e?.name||"Error")+" – "+(e?.message||String(e)))}finally{b.disabled=false;b.textContent="Αναζήτηση προϊόντος"}};


$("scanBtn").onclick=async()=>{
 if(!window.ZXing||!ZXing.BrowserMultiFormatReader){
  alert("Δεν φορτώθηκε η νέα βιβλιοθήκη σάρωσης. Έλεγξε τη σύνδεση στο διαδίκτυο.");
  return;
 }

 const box=$("scanner");

 if(scanner){
  try{scanner.reset()}catch{}
  scanner=null;
  box.classList.add("hidden");
  box.innerHTML="";
  return;
 }

 box.classList.remove("hidden");

 box.innerHTML=`
  <video id="foodcheck-video"
   style="width:100%;max-height:60vh;object-fit:contain;background:#000"
   autoplay muted playsinline></video>
 `;

 const video=$("foodcheck-video");

 const hints=new Map();
 hints.set(ZXing.DecodeHintType.POSSIBLE_FORMATS,[
  ZXing.BarcodeFormat.EAN_13,
  ZXing.BarcodeFormat.EAN_8,
  ZXing.BarcodeFormat.UPC_A,
  ZXing.BarcodeFormat.UPC_E
 ]);

 const reader=new ZXing.BrowserMultiFormatReader(hints,250);
 scanner=reader;
 let handled=false;

 try{
  await reader.decodeFromConstraints(
   {
    audio:false,
    video:{facingMode:{ideal:"environment"}}
   },
   video,
   (result,error)=>{
    if(!result||handled)return;

    const code=result.getText().replace(/[^0-9]/g,"");

    if(!/^\d{13}$/.test(code))return;

    handled=true;
    $("barcode").value=code;

    try{reader.reset()}catch{}
    scanner=null;
    box.classList.add("hidden");
    box.innerHTML="";

    $("lookupBtn").click();
   }
  );
 }catch(e){
  console.error("FoodCheck ZXing scanner:",e);

  try{reader.reset()}catch{}

  scanner=null;
  box.classList.add("hidden");
  box.innerHTML="";

  alert("Δεν ξεκίνησε η σάρωση. Έλεγξε την άδεια κάμερας.");
 }
};

function foodKey(name){return String(name||"").normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLocaleLowerCase("el").replace(/[^\p{L}\p{N}]+/gu," ").trim()}
function categoryFoods(type){return Array.isArray(foodCatalog[type])?foodCatalog[type]:[]}
let foodSuggestionsOpen=false;
function drawFoodSuggestions(open=foodSuggestionsOpen){const type=$("foodItemType").value,query=foodKey($("foodItemName").value);const list=categoryFoods(type).filter(x=>!query||foodKey(x.name).includes(query));const box=$("foodSuggestions");box.innerHTML=list.length?list.map((x,i)=>`<button type="button" role="option" data-foodpick="${i}" data-foodname="${esc(x.name)}">${esc(x.name)}</button>`).join(""):'<div class="food-empty">Δεν υπάρχουν αποθηκευμένα τρόφιμα σε αυτή την κατηγορία. Μπορείς να γράψεις νέα ονομασία.</div>';box.classList.toggle("hidden",!open);if(open){box.querySelectorAll("[data-foodpick]").forEach(b=>b.onclick=()=>{const name=b.dataset.foodname;$("foodItemName").value=name;recallFood();foodSuggestionsOpen=false;drawFoodSuggestions(false)})}}
$("foodItemName").addEventListener("focus",()=>{foodSuggestionsOpen=true;drawFoodSuggestions(true)});
document.addEventListener("click",e=>{if(!e.target.closest(".food-picker")){foodSuggestionsOpen=false;drawFoodSuggestions(false)}});
function clearFoodNutrition(){["itemCarbs","itemSugars","itemSat","itemFiber","itemSalt"].forEach(id=>$(id).value="")}
function recallFood(){const name=$("foodItemName").value.trim(),type=$("foodItemType").value,key=foodKey(name);if(!key)return;const found=categoryFoods(type).find(x=>foodKey(x.name)===key);if(found){for(const [field,id] of Object.entries({carbs:"itemCarbs",sugars:"itemSugars",sat:"itemSat",fiber:"itemFiber",salt:"itemSalt"}))if(found[field]!=null)$(id).value=found[field]}}
function rememberFood(item){const type=item.type,key=foodKey(item.name);if(!key)return;const list=categoryFoods(type),index=list.findIndex(x=>foodKey(x.name)===key);const saved={...(index>=0?list[index]:{}),name:index>=0?list[index].name:item.name};for(const field of ["carbs","sugars","sat","fiber","salt"])if(item[field]!=null)saved[field]=item[field];if(index>=0)list[index]=saved;else list.unshift(saved);foodCatalog[type]=list.slice(0,250);localStorage.setItem(KEYS.foods,JSON.stringify(foodCatalog));drawFoodSuggestions()}
function addItem(){let name=$("foodItemName").value.trim();if(!name){alert("Γράψε το τρόφιμο.");return}if(num("itemWeight")==null){alert("Συμπλήρωσε το βάρος του τροφίμου σε γραμμάρια.");return}let it={name,type:$("foodItemType").value,carbs:num("itemCarbs"),plannedWeight:num("itemWeight"),consumedWeight:num("itemConsumedWeight"),weight:num("itemWeight"),vessel:$("itemVessel").value,vesselDiameter:num("itemVesselDiameter"),sugars:num("itemSugars"),sat:num("itemSat"),fiber:num("itemFiber"),salt:num("itemSalt")};mealItems.push(it);rememberFood(it);$("foodItemName").value="";foodSuggestionsOpen=false;drawFoodSuggestions(false);["itemCarbs","itemWeight","itemConsumedWeight","itemVesselDiameter","itemSugars","itemSat","itemFiber","itemSalt"].forEach(id=>$(id).value="");$("itemVessel").value="";drawMealItems()}
$("foodItemType").onchange=()=>{$("foodItemName").value="";clearFoodNutrition();foodSuggestionsOpen=true;drawFoodSuggestions(true)};
$("foodItemName").addEventListener("change",recallFood);
$("foodItemName").addEventListener("input",()=>{const key=foodKey($("foodItemName").value);const found=categoryFoods($("foodItemType").value).find(x=>foodKey(x.name)===key);if(found)recallFood();else clearFoodNutrition();foodSuggestionsOpen=true;drawFoodSuggestions(true)});
$("addFood").onclick=addItem;
function drawMealItems(){$("mealItems").innerHTML=mealItems.length?`<h3>Στοιχεία γεύματος</h3>`+mealItems.map((x,i)=>`<div class="item"><b>${esc(x.name)}</b> <span class="pill">${esc(x.type)}</span><br><span class="muted">Προγραμματισμένα: ${x.plannedWeight??x.weight??"—"} g · Καταναλώθηκαν: ${x.consumedWeight??"Δεν καταγράφηκε"} g · Σκεύος: ${esc(x.vessel||"Δεν καταγράφηκε")}${x.vesselDiameter!=null?` · Διάμετρος: ${x.vesselDiameter} cm`:""} · Υδατάνθρακες: ${x.carbs??"—"} g/100g</span> <button class="danger small" data-del="${i}">Αφαίρεση</button></div>`).join(""):`<p class='muted'>Δεν έχουν προστεθεί τρόφιμα.</p>`;$("mealItems").querySelectorAll("[data-del]").forEach(b=>b.onclick=()=>{mealItems.splice(+b.dataset.del,1);drawMealItems()})}
function mealPayload(){let items=mealItems.map(x=>({...x,plannedWeight:x.plannedWeight??x.weight??null,consumedWeight:x.consumedWeight??null}));let plannedCarbs=0,consumedCarbs=0,plannedCount=0,consumedCount=0,plannedSugars=0,sugarCount=0;for(const x of items){if(x.carbs!=null&&x.plannedWeight!=null){plannedCarbs+=x.carbs*x.plannedWeight/100;plannedCount++}if(x.sugars!=null&&x.plannedWeight!=null){plannedSugars+=x.sugars*x.plannedWeight/100;sugarCount++}if(x.carbs!=null&&x.consumedWeight!=null){consumedCarbs+=x.carbs*x.consumedWeight/100;consumedCount++}}let totalWeight=items.reduce((a,x)=>a+(x.plannedWeight||0),0);let avg=field=>{let weight=0,total=0;for(const x of items){const w=x.plannedWeight??x.weight??0;if(x[field]!=null&&w>0){total+=Number(x[field])*w/100;weight+=w}}return weight?total/weight*100:null};let r=assess({carbs:totalWeight?plannedCarbs/totalWeight*100:null,sugars:avg("sugars"),sat:avg("sat"),fiber:avg("fiber"),salt:avg("salt")},100);return {id:crypto.randomUUID?crypto.randomUUID():String(Date.now()),name:$("mealName").value.trim()||"Γεύμα",date:new Date().toLocaleString("el-GR"),preGlucose:num("preGlucose"),preTime:$("preTime").value,trend:$("trend").value,items,estimatedWeight:totalWeight||null,method:$("method").value,photos:[],rapidDose:num("rapidDose"),rapidTime:$("rapidTime").value,plannedCarbs:plannedCount===items.length?plannedCarbs:null,consumedCarbs:consumedCount===items.length?consumedCarbs:null,totalCarbs:plannedCount===items.length?plannedCarbs:null,carbDataCount:plannedCount,consumedCarbDataCount:consumedCount,score:plannedCount===items.length&&items.length>0?r.score:null,impact:{diabetes:r.diabetesScore,triglycerides:r.triglyceridesScore,cholesterol:r.cholesterolScore,sugars:sugarCount? (plannedSugars<=5?5:plannedSugars<=10?25:plannedSugars<=15?45:plannedSugars<=20?65:plannedSugars<=30?85:100):null},post:[]}}
function mealScoreLabel(m){return m.score==null?"Δεν υπολογίστηκε — ανεπαρκή διατροφικά στοιχεία":`${m.score}/100`}
function mealDetailsHTML(m){const items=Array.isArray(m.items)?m.items:[];return `<div class="meal-details"><h3>Αναλυτική σύνθεση γεύματος</h3>${items.length?items.map((x,i)=>`<div class="item"><b>${i+1}. ${esc(x.name||"Τρόφιμο χωρίς ονομασία")}</b> <span class="pill">${esc(x.type||"Χωρίς κατηγορία")}</span><p>Προγραμματισμένη ποσότητα: ${x.plannedWeight??x.weight??"—"} g · Πραγματικά καταναλωμένη: ${x.consumedWeight??"Δεν καταγράφηκε"} g</p><p>Σκεύος: ${esc(x.vessel||"Δεν καταγράφηκε")} · Διάμετρος: ${x.vesselDiameter!=null?esc(x.vesselDiameter)+" cm":"Δεν καταγράφηκε"}</p><p class="muted">Ανά 100 g: Υδατάνθρακες ${x.carbs??"—"} g · Σάκχαρα ${x.sugars??"—"} g · Κορεσμένα ${x.sat??"—"} g · Ίνες ${x.fiber??"—"} g · Αλάτι ${x.salt??"—"} g</p></div>`).join(""):`<p>Δεν υπάρχουν αποθηκευμένα επιμέρους τρόφιμα.</p>`}<h3>Στοιχεία γεύματος</h3><p>Τρόπος παρασκευής / πρόσθετα υλικά: ${esc(m.method||"Δεν καταγράφηκαν")}</p><p>Σάκχαρο πριν: ${m.preGlucose??"—"} mg/dL · Ώρα: ${esc(m.preTime||"—")} · Τάση CGM: ${esc(m.trend||"Δεν καταγράφηκε")}</p><p>Ταχεία ινσουλίνη που καταγράφηκε: ${m.rapidDose??"—"} μονάδες · Ώρα: ${esc(m.rapidTime||"—")}</p><p>Προγραμματισμένοι υδατάνθρακες: ${m.plannedCarbs==null?"Ανεπαρκή στοιχεία":m.plannedCarbs.toFixed(1)+" g"} · Καταναλωμένοι: ${m.consumedCarbs==null?"Δεν καταγράφηκαν πλήρως":m.consumedCarbs.toFixed(1)+" g"}</p><p>Βαθμολογία: ${mealScoreLabel(m)}</p>${m.post?.length?`<p>Μεταγευματικές μετρήσεις: ${m.post.map(p=>`+${p.after} ώρα: ${p.glucose} mg/dL`).join(" · ")}</p>`:""}</div>`}
function mealHTML(m){let planned=m.plannedCarbs==null?"ελλιπή στοιχεία":m.plannedCarbs.toFixed(1)+" g",consumed=m.consumedCarbs==null?"δεν καταγράφηκε πλήρως":m.consumedCarbs.toFixed(1)+" g";return `<div class="result"><div class="score">${mealScoreLabel(m)}</div><b>${esc(m.name)}</b>${m.impact?`<h3>Ενδείξεις επιβάρυνσης γεύματος</h3>${barHTML("Διαβήτης",m.impact.diabetes,"Με βάση τους υπολογισμένους υδατάνθρακες του γεύματος.")}${barHTML("Τριγλυκερίδια",m.impact.triglycerides,"Με βάση τους διαθέσιμους υδατάνθρακες και τα σάκχαρα.")}${barHTML("Χοληστερίνη",m.impact.cholesterol,"Με βάση τα διαθέσιμα κορεσμένα λιπαρά.")}${barHTML("Σάκχαρα",m.impact.sugars,"Με βάση τα συνολικά γραμμάρια σακχάρων των προγραμματισμένων ποσοτήτων.")}`:""}<p>Προγραμματισμένοι υδατάνθρακες: ${planned}. Υδατάνθρακες από την καταναλωμένη ποσότητα: ${consumed}.</p><p>Σάκχαρο πριν: ${m.preGlucose??"—"} mg/dL (${esc(m.preTime||"χωρίς ώρα")}) · Ταχεία ινσουλίνη που καταγράφηκε: ${m.rapidDose??"—"} μονάδες (${esc(m.rapidTime||"χωρίς ώρα")}).</p><p>Συνολικό προγραμματισμένο βάρος τροφίμων: ${m.estimatedWeight??"—"} g</p><p class="muted">Η βαθμολογία είναι ενδεικτική και δεν αποτελεί ιατρική αξιολόγηση ή πρόβλεψη γλυκόζης.</p></div>`}
async function saveJournal(m){journal.unshift(m);const ok=await save();drawJournal();if(!ok)$("mealResult").insertAdjacentHTML("beforeend",'<p class="muted">Προσοχή: η αποθήκευση στο ημερολόγιο δεν επιβεβαιώθηκε.</p>');return ok}
$("analyzeMeal").onclick=async()=>{if(!mealItems.length){alert("Πρόσθεσε τουλάχιστον ένα τρόφιμο.");return}let m=mealPayload();lastMealResult=m;$("mealResult").innerHTML=mealHTML(m);await saveJournal(m)};
$("saveMealTemplate").onclick=()=>{if(!mealItems.length){alert("Πρόσθεσε πρώτα τα τρόφιμα του γεύματος.");return}let m=mealPayload();mealLibrary.unshift({...m,id:"lib-"+m.id});save();drawLibrary();alert("Το γεύμα αποθηκεύτηκε στη βιβλιοθήκη.")};
function resetMealForm(){
 const ids=["mealName","preGlucose","preTime","method","rapidDose","rapidTime","foodItemName","itemWeight","itemConsumedWeight","itemVesselDiameter","itemCarbs","itemSugars","itemSat","itemFiber","itemSalt"];
 ids.forEach(id=>{const el=$(id);if(el)el.value=""});
 $("itemVessel").value="";
 $("foodItemType").selectedIndex=0;
 $("trend").value="";
 mealItems=[];
 lastMealResult=null;
 $("mealResult").innerHTML="";
 drawFoodSuggestions();clearFoodNutrition();drawMealItems();
 $("mealName").focus();
}
$("newMeal").onclick=()=>{
 const hasData=mealItems.length||["mealName","preGlucose","preTime","method","rapidDose","rapidTime","foodItemName","itemWeight","itemConsumedWeight","itemVessel","itemVesselDiameter"].some(id=>$(id).value.trim());
 if(hasData&&!confirm("Να ξεκινήσει νέα καταχώριση; Τα στοιχεία της τρέχουσας φόρμας θα καθαριστούν. Το ιστορικό και η βιβλιοθήκη τροφίμων δεν θα διαγραφούν."))return;
 resetMealForm();
};
function drawLibrary(){$("mealLibrary").innerHTML=mealLibrary.length?mealLibrary.map((m,i)=>`<div class="item"><b>${esc(m.name)}</b><br><span class="muted">${esc(m.date)} · ${(m.items||[]).length} τρόφιμα · ${mealScoreLabel(m)}</span><div class="actions"><button class="secondary small" data-libdetail="${i}" aria-expanded="false">Προβολή σύνθεσης</button><button class="danger small" data-libdel="${i}">Διαγραφή</button></div><div id="libdetail-${i}" class="hidden">${mealDetailsHTML(m)}</div>${m.photos?.length?`<div class="photo-grid">${m.photos.map(p=>`<img src="${p}" alt="Φωτογραφία γεύματος">`).join("")}</div>`:""}</div>`).join(""):"Δεν υπάρχουν αποθηκευμένα γεύματα.";$("mealLibrary").querySelectorAll("[data-libdetail]").forEach(b=>b.onclick=()=>{const panel=$("libdetail-"+b.dataset.libdetail),open=panel.classList.contains("hidden");panel.classList.toggle("hidden",!open);b.textContent=open?"Απόκρυψη σύνθεσης":"Προβολή σύνθεσης";b.setAttribute("aria-expanded",String(open))});$("mealLibrary").querySelectorAll("[data-libdel]").forEach(b=>b.onclick=()=>{mealLibrary.splice(+b.dataset.libdel,1);save();drawLibrary()})}
function normalizedMealName(name){return String(name||"").normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLocaleLowerCase("el").replace(/[^\p{L}\p{N}]+/gu," ").trim()}
function drawComparisons(){
 const groups=new Map();
 journal.forEach(m=>{
  const key=normalizedMealName(m.name);
  if(!key)return;
  if(!groups.has(key))groups.set(key,[]);
  groups.get(key).push(m);
 });
 const repeated=[...groups.values()].filter(g=>g.length>=2);
 if(!repeated.length){
  $("mealComparisons").textContent="Δεν υπάρχουν ακόμη τουλάχιστον δύο καταγραφές με ίδιο όνομα γεύματος.";
  return;
 }
 $("mealComparisons").innerHTML=repeated.map(group=>{
  const label=group[0].name;
  const records=group.map(m=>{
   const items=(m.items||[]).map(it=>{
    const planned=it.plannedWeight??it.weight;
    const consumed=it.consumedWeight;
    return `<li>${esc(it.name)}: προγραμματισμένα ${planned??"—"} g · καταναλωμένα ${consumed??"δεν καταγράφηκαν"} g</li>`;
   }).join("");
   const posts=(m.post||[]).slice().sort((a,b)=>Number(a.after)-Number(b.after)).map(p=>{
    const delta=m.preGlucose!=null&&p.glucose!=null?Number(p.glucose)-Number(m.preGlucose):null;
    return `<span class="pill">+${esc(p.after)}h: ${esc(p.glucose)} mg/dL${delta==null?"":` · μεταβολή ${delta>=0?"+":""}${delta.toFixed(0)}`}</span>`;
   }).join(" ");
   const plannedTotal=(m.items||[]).reduce((a,it)=>a+Number(it.plannedWeight??it.weight??0),0);
   const consumedValues=(m.items||[]).map(it=>it.consumedWeight);
   const consumedTotal=consumedValues.length&&consumedValues.every(v=>v!=null)?consumedValues.reduce((a,v)=>a+Number(v),0):null;
   return `<div class="item"><b>${esc(m.date||"Χωρίς ημερομηνία")}</b><p>Πριν: ${m.preGlucose??"—"} mg/dL · Τάση CGM: ${esc(m.trend||"—")} · Ταχεία: ${m.rapidDose??"—"} U (${esc(m.rapidTime||"—")})</p><p>Συνολικό βάρος: προγραμματισμένο ${plannedTotal||"—"} g · πραγματικά καταναλωμένο ${consumedTotal==null?"δεν καταγράφηκε πλήρως":consumedTotal+" g"}</p><p>${posts||"Δεν υπάρχουν μεταγευματικές μετρήσεις."}</p><details><summary>Σύνθεση και ποσότητες</summary><ul>${items||"<li>Δεν υπάρχουν στοιχεία τροφίμων.</li>"}</ul></details></div>`;
  }).join("");
  return `<div class="item"><h4>${esc(label)} · ${group.length} καταγραφές</h4><p class="muted">Παρουσιάζονται χωριστά οι πραγματικές καταγραφές, ώστε να φαίνονται οι διαφορές σε ποσότητες, σύνθεση, προγευματικό σάκχαρο, τάση CGM, δόση και μεταγευματικές τιμές. Το ίδιο όνομα δεν σημαίνει απαραίτητα ίδιο γεύμα.</p>${records}</div>`;
 }).join("");
}
function drawJournal(){$("journalList").innerHTML=journal.length?journal.map((m,i)=>`<div class="item"><b>${esc(m.name)}</b> <span class="pill">${esc(m.date)}</span><br><span class="muted">Πριν: ${m.preGlucose??"—"} · Προγραμματισμένοι υδατάνθρακες: ${m.plannedCarbs==null?(m.totalCarbs==null?"—":m.totalCarbs.toFixed(1)+" g"):m.plannedCarbs.toFixed(1)+" g"} · Καταναλωμένοι: ${m.consumedCarbs==null?"—":m.consumedCarbs.toFixed(1)+" g"} · Ταχεία: ${m.rapidDose??"—"} U</span><br>${(m.post||[]).map(p=>`<span class="pill">+${p.after}h: ${p.glucose} mg/dL</span>`).join(" ")} <div class="actions"><button class="secondary small" data-jdetail="${i}" aria-expanded="false">Προβολή σύνθεσης</button><button class="secondary small" data-j="${i}">Επιλογή για μέτρηση</button></div><div id="jdetail-${i}" class="hidden">${mealDetailsHTML(m)}</div></div>`).join(""):"Δεν υπάρχουν καταγραφές.";$("journalList").querySelectorAll("[data-jdetail]").forEach(b=>b.onclick=()=>{const panel=$("jdetail-"+b.dataset.jdetail),open=panel.classList.contains("hidden");panel.classList.toggle("hidden",!open);b.textContent=open?"Απόκρυψη σύνθεσης":"Προβολή σύνθεσης";b.setAttribute("aria-expanded",String(open))});let sel=$("postEntry");sel.innerHTML=journal.map((m,i)=>`<option value="${i}">${esc(m.name)} – ${esc(m.date)}</option>`).join("")||"<option value=''>Δεν υπάρχουν γεύματα</option>";$("journalList").querySelectorAll("[data-j]").forEach(b=>{b.onclick=()=>{sel.value=b.dataset.j;tab("journal");$("postGlucose").focus()}});const ce=$("consumedEntry");ce.innerHTML=journal.map((m,i)=>`<option value="${i}">${esc(m.name)} – ${esc(m.date)}</option>`).join("")||"<option value=''>Δεν υπάρχουν γεύματα</option>";function refreshConsumedFoods(){const m=journal[Number(ce.value)];$("consumedFood").innerHTML=(m?.items||[]).map((it,i)=>`<option value="${i}">${esc(it.name)} (προγραμματισμένα ${it.plannedWeight??it.weight??"—"} g)</option>`).join("")||"<option value=''>Δεν υπάρχουν τρόφιμα</option>"}ce.onchange=refreshConsumedFoods;refreshConsumedFoods();drawComparisons()}
$("saveConsumed").onclick=async()=>{const mi=Number($("consumedEntry").value),ii=Number($("consumedFood").value),w=num("actualConsumedWeight"),m=journal[mi];if(!m||!m.items?.[ii]||w==null){$("consumedFeedback").textContent="Επίλεξε γεύμα και τρόφιμο και συμπλήρωσε τα γραμμάρια.";return}m.items[ii].consumedWeight=w;const complete=m.items.every(it=>it.carbs!=null&&it.consumedWeight!=null);m.consumedCarbDataCount=m.items.filter(it=>it.carbs!=null&&it.consumedWeight!=null).length;m.consumedCarbs=complete?m.items.reduce((a,it)=>a+it.carbs*it.consumedWeight/100,0):null;const ok=await save();if(ok){drawJournal();$("consumedFeedback").textContent="Η πραγματική ποσότητα αποθηκεύτηκε."}else $("consumedFeedback").textContent="Δεν αποθηκεύτηκε. Δοκίμασε ξανά."};
$("savePost").onclick=async()=>{let i=Number($("postEntry").value),g=num("postGlucose");if(!journal.length||!Number.isInteger(i)||!journal[i]||g==null){alert("Επίλεξε γεύμα και συμπλήρωσε τη γλυκόζη.");return}let m=journal[i];m.post=m.post||[];const after=Number($("postAfter").value);m.post=m.post.filter(p=>Number(p.after)!==after);m.post.push({after,glucose:g,time:$("postTime").value||new Date().toLocaleTimeString("el-GR",{hour:"2-digit",minute:"2-digit"})});const ok=await save();drawJournal();$("postFeedback").textContent=ok?"Η μέτρηση αποθηκεύτηκε. Η σύγκριση ενημερώθηκε με τις πραγματικές καταγραφές.":"Δεν επιβεβαιώθηκε η αποθήκευση. Μην κλείσεις την εφαρμογή και δοκίμασε ξανά."};
async function exportBackup(){try{const saved=await save();if(!saved)throw new Error("Δεν επιβεβαιώθηκε η αποθήκευση πριν από την εξαγωγή.");const storedJournal=JSON.parse(localStorage.getItem(KEYS.journal)||"[]");if(!Array.isArray(storedJournal)||storedJournal.length!==journal.length)throw new Error("Το ημερολόγιο δεν αποθηκεύτηκε πλήρως. Δεν δημιουργήθηκε αντίγραφο για να μη χαθούν καταγραφές.");const storedMeals=JSON.parse(localStorage.getItem(KEYS.meals)||"[]");if(!Array.isArray(storedMeals)||storedMeals.length!==mealLibrary.length)throw new Error("Η βιβλιοθήκη γευμάτων δεν αποθηκεύτηκε πλήρως. Δεν δημιουργήθηκε αντίγραφο.");const portable=async records=>Promise.all(records.map(async record=>({...record,photos:Array.isArray(record.photos)?await Promise.all(record.photos.map(loadPhoto)):[]})));const [backupMeals,backupJournal]=await Promise.all([portable(storedMeals),portable(storedJournal)]);const payload={app:"FoodCheck",schemaVersion:3,exportedAt:new Date().toISOString(),history,favorites,mealLibrary:backupMeals,journal:backupJournal,foodCatalog};const blob=new Blob([JSON.stringify(payload)],{type:"application/json"});const url=URL.createObjectURL(blob),a=document.createElement("a");a.href=url;a.download=`FoodCheck-backup-${new Date().toISOString().slice(0,10)}.json`;document.body.appendChild(a);a.click();a.remove();URL.revokeObjectURL(url);$("backupFeedback").textContent="Το αντίγραφο δημιουργήθηκε. Περιλαμβάνει το ιστορικό, τα γεύματα και την προσωπική βιβλιοθήκη τροφίμων. Φύλαξέ το σε ασφαλές σημείο."}catch(e){console.error(e);$("backupFeedback").textContent="Δεν δημιουργήθηκε το αντίγραφο: "+e.message}}
$("exportBackup").onclick=exportBackup;
$("importBackup").onchange=async e=>{const file=e.target.files?.[0];if(!file)return;if(!confirm("Η επαναφορά θα αντικαταστήσει τα υπάρχοντα δεδομένα FoodCheck σε αυτή τη συσκευή. Έχεις ήδη κρατήσει αντίγραφο των τωρινών δεδομένων;")){e.target.value="";return}try{if(file.size>50*1024*1024)throw new Error("Το αρχείο είναι μεγαλύτερο από 50 MB.");const data=JSON.parse(await file.text());if(data.app!=="FoodCheck"||!Array.isArray(data.history)||!Array.isArray(data.favorites)||!Array.isArray(data.mealLibrary)||!Array.isArray(data.journal))throw new Error("Το αρχείο δεν είναι έγκυρο αντίγραφο FoodCheck.");const old={history,favorites,mealLibrary,journal,foodCatalog,raw:Object.fromEntries(Object.values(KEYS).map(k=>[k,localStorage.getItem(k)]))};history=data.history;favorites=data.favorites;mealLibrary=data.mealLibrary;journal=data.journal;foodCatalog=data.foodCatalog&&typeof data.foodCatalog==="object"&&!Array.isArray(data.foodCatalog)?data.foodCatalog:{};const ok=await save();if(!ok){history=old.history;favorites=old.favorites;mealLibrary=old.mealLibrary;journal=old.journal;foodCatalog=old.foodCatalog;for(const [k,v] of Object.entries(old.raw)){if(v===null)localStorage.removeItem(k);else localStorage.setItem(k,v)}throw new Error("Δεν ήταν δυνατή η αποθήκευση των δεδομένων.")}await Promise.all([hydratePhotos(mealLibrary),hydratePhotos(journal)]);drawProductLists();drawFoodSuggestions();drawLibrary();drawJournal();$("backupFeedback").textContent="Η επαναφορά ολοκληρώθηκε."}catch(err){console.error(err);$("backupFeedback").textContent="Αποτυχία επαναφοράς: "+err.message}finally{e.target.value=""}};
async function startApp(){
 try{
  await Promise.all([hydratePhotos(mealLibrary),hydratePhotos(journal)]);
  const hasLegacyPhotos=[...mealLibrary,...journal].some(record=>(record.photos||[]).some(photo=>typeof photo==="string"&&photo.startsWith("data:")));
  if(hasLegacyPhotos)await save(); // Μεταφέρει αυτόματα τις παλιές φωτογραφίες στο IndexedDB.
 }
 catch(error){console.error("FoodCheck photo restore:",error);alert("Κάποιες παλιές φωτογραφίες δεν ήταν δυνατό να φορτωθούν. Μην διαγράψεις τα δεδομένα του browser.");}
 drawProductLists();drawFoodSuggestions();drawMealItems();drawLibrary();drawJournal();
}
startApp();
