if(localStorage.getItem('zj_theme')==='dark')document.body.classList.add('dark-mode');

// جميع طلبات البيانات تمر عبر الخادم الوسيط؛ لا يوجد اتصال مباشر احتياطي بمخزن البيانات.
const PROXY_ENDPOINT = "/api/zajil";

let taps=0, tmr, deferredPrompt=null, uploadedImgData="", inboxQs=[], totalViews=1;
let pollDelay=30000, pollTimer=null, loginFails=0, lockUntil=0, lastQSent=0, adminToken="";

const CURR=[
  {c:"USD",n:"دولار أمريكي",f:"us",rb:1,rs:1},
  {c:"SAR",n:"ريال سعودي",f:"sa",rb:2220/8325,rs:2387/8950},
  {c:"EGP",n:"جنيه مصري",f:"eg",rb:159.3/8325,rs:171.3/8950},
  {c:"AED",n:"درهم إماراتي",f:"ae",rb:2267/8325,rs:2437/8950},
  {c:"QAR",n:"ريال قطري",f:"qa",rb:2287/8325,rs:2459/8950},
  {c:"EUR",n:"يورو أوروبي",f:"eu",rb:9079/8325,rs:9760/8950},
  {c:"CNY",n:"يوان صيني",f:"cn",rb:1169/8325,rs:1257/8950},
  {c:"MYR",n:"رينغيت ماليزي",f:"my",rb:1936/8325,rs:2081/8950},
  {c:"KWD",n:"دينار كويتي",f:"kw",rb:27295/8325,rs:29344/8950},
  {c:"OMR",n:"ريال عُماني",f:"om",rb:21623/8325,rs:23247/8950},
  {c:"BHD",n:"دينار بحريني",f:"bh",rb:22082/8325,rs:23740/8950},
  {c:"ETB",n:"بير إثيوبي",f:"et",rb:51.33/8325,rs:55.18/8950}
];

const DEF_ART={t:"كيف أحول من تطبيق بنكك إلى فوري أو أوكاش؟",b:"1. استخرج رقم الـ BBAN الخاص بحساب المستفيد عبر أداة زاجل.\n2. افتح تطبيق بنكك واختر التحويل لبنك آخر.\n3. أدخل رقم الـ BBAN والمبلغ وأكمل العملية بسهولة.",i:""};

let st=JSON.parse(localStorage.getItem('zj_state_v11'))||{
  ts:0,b:8325,s:8950,prevB:8325,upd:"تحديث اليوم",tk:"منصة زاجل للنشر | الرسالة الحقيقية",
  banks:{bankak:"ok",fawry:"ok",okash:"warn"},arts:[DEF_ART]
};

const fmt=n=>n>=500?Math.round(n).toLocaleString('en-US'):Number(n.toFixed(2)).toLocaleString('en-US');

// دالة تعقيم النصوص الإضافية للحماية القصوى ضد XSS
function escapeHTML(s){
  return String(s||"").replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');
}

// نظام إشعارات داخلي أنيق بديل لـ alert()
function showToast(msg, type="ok"){
  const box=document.getElementById('toastBox'); if(!box)return;
  const el=document.createElement('div');
  const colors=type==="err"?"bg-rose-900/90 text-white border-rose-500":type==="warn"?"bg-amber-900/90 text-white border-amber-500":"bg-[#380734]/95 text-white border-[#D81B7A]";
  el.className=`toast-msg px-4 py-2.5 rounded-2xl border shadow-xl text-xs font-bold text-center ${colors}`;
  el.textContent=msg;
  box.appendChild(el);
  setTimeout(()=>{el.remove();},3500);
}

// التحقق الصارم من روابط الصور لمنع الروابط الضارة أو غير الآمنة
function isSafeImageUrl(url){
  if(!url)return true;
  if(url.startsWith("data:image/jpeg;base64,")||url.startsWith("data:image/png;base64,")||url.startsWith("data:image/webp;base64,")){
    return url.length < 180000;
  }
  try{
    const u=new URL(url);
    return u.protocol==="https:";
  }catch(e){return false;}
}

function setConnStatus(ok){
  const dot=document.getElementById('connDot');
  const badge=document.getElementById('cloudBadge');
  if(dot)dot.className=ok?"w-2 h-2 rounded-full bg-emerald-500":"w-2 h-2 rounded-full bg-amber-500 animate-pulse";
  if(badge){
    badge.textContent=ok?"● متصل بالسحابة ومحدث للجميع ✅":"● وضع القراءة المؤقتة (جاري استعادة الاتصال...) ⚠️";
    badge.className=ok?"text-[10px] font-bold text-emerald-600":"text-[10px] font-bold text-amber-600";
  }
}

// دالة الاتصال الموحدة؛ لا تتجاوز الخادم الوسيط عند فشله أو رفضه للطلب.
async function cloudFetch(bucket, method="GET", bodyData=null){
  const headers={"Content-Type":"application/json"};
  if(adminToken)headers["Authorization"]="Bearer "+adminToken;
  return fetch(`${PROXY_ENDPOINT}?bucket=${encodeURIComponent(bucket)}&t=${Date.now()}`,{
    method, headers, cache:"no-store", body:bodyData===null?undefined:JSON.stringify(bodyData)
  });
}

function base64UrlToBytes(value){
  const padding="=".repeat((4-value.length%4)%4);
  const base64=(value+padding).replace(/-/g,"+").replace(/_/g,"/");
  const raw=atob(base64);
  return Uint8Array.from(raw,c=>c.charCodeAt(0));
}

async function enableNotif(){
  if(!("serviceWorker" in navigator)||!("PushManager" in window)||!("Notification" in window)){
    return showToast("هذا المتصفح لا يدعم إشعارات Push؛ جرّب تثبيت زاجل على أندرويد","warn");
  }
  if(Notification.permission==="denied"){
    return showToast("الإشعارات محظورة من إعدادات المتصفح؛ فعّلها ثم حاول مجددًا","warn");
  }
  try{
    const registration=await navigator.serviceWorker.ready;
    let subscription=await registration.pushManager.getSubscription();
    if(subscription){
      await subscription.unsubscribe();
      const removed=await fetch(`${PROXY_ENDPOINT}?action=push_unsubscribe`,{
        method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({endpoint:subscription.endpoint})
      });
      syncNotifIcon();
      if(!removed.ok) throw new Error("unsubscribe failed");
      showToast("تم إيقاف إشعارات أسعار زاجل");
      return;
    }
    const permission=await Notification.requestPermission();
    if(permission!=="granted"){
      syncNotifIcon();
      return showToast("لم يتم منح إذن الإشعارات","warn");
    }
    const configResponse=await fetch(`${PROXY_ENDPOINT}?action=push_config`,{cache:"no-store"});
    if(!configResponse.ok)throw new Error("Push is not configured on server");
    const config=await configResponse.json();
    if(!config.publicKey)throw new Error("Missing VAPID public key");
    subscription=await registration.pushManager.subscribe({
      userVisibleOnly:true,
      applicationServerKey:base64UrlToBytes(config.publicKey)
    });
    const saveResponse=await fetch(`${PROXY_ENDPOINT}?action=push_subscribe`,{
      method:"POST",headers:{"Content-Type":"application/json"},
      body:JSON.stringify({subscription:subscription.toJSON()})
    });
    if(!saveResponse.ok){
      await subscription.unsubscribe().catch(()=>{});
      throw new Error("Subscription save failed");
    }
    syncNotifIcon();
    showToast("تم تفعيل إشعارات أسعار الصرف بنجاح");
  }catch(error){
    console.error("Push subscription error:",error);
    showToast("تعذر تفعيل Push؛ تأكد من إعداد مفاتيح الإشعارات على الخادم","err");
  }
}

async function syncNotifIcon(){
  const ic=document.getElementById("notifIcon");
  if(!ic)return;
  let subscribed=false;
  try{
    if("serviceWorker" in navigator){
      const registration=await navigator.serviceWorker.ready;
      subscribed=Boolean(await registration.pushManager.getSubscription());
    }
  }catch(e){}
  ic.className=subscribed
    ?"fa-solid fa-bell text-sm text-emerald-600"
    :"fa-regular fa-bell text-sm text-[#D81B7A]";
  const button=document.getElementById("notifBtn");
  if(button)button.setAttribute("aria-label",subscribed?"إيقاف إشعارات الأسعار":"تفعيل إشعارات الأسعار");
}
syncNotifIcon();

async function loadCloud(manual=false){
  try{
    const r=await cloudFetch("zajil_live","GET");
    if(!r.ok)throw new Error("HTTP "+r.status);
    const d=await r.json();
    if(d&&typeof d.b!=="undefined"){
      const prevB = (Number(d.b)!==Number(st.b)) ? Number(st.b) : (Number(d.prevB)||Number(st.prevB)||Number(d.b));
      st={
        ts:Number(d.ts)||Date.now(),
        b:Math.max(1,Number(d.b)||8325),
        s:Math.max(1,Number(d.s)||8950),
        prevB:prevB,
        upd:String(d.upd||"تحديث اليوم").slice(0,80),
        tk:String(d.tk||"منصة زاجل للنشر | الرسالة الحقيقية").slice(0,300),
        banks:d.banks||{bankak:"ok",fawry:"ok",okash:"warn"},
        arts:Array.isArray(d.arts)&&d.arts.length?d.arts.slice(0,30):[DEF_ART]
      };
      localStorage.setItem('zj_state_v11',JSON.stringify(st));
      renderAll();
      setConnStatus(true);
      pollDelay=30000; // إعادة ضبط العداد عند نجاح الاتصال
      if(manual)showToast("✅ تم تحديث الأسعار والحالات");
    }
  }catch(e){
    setConnStatus(false);
    pollDelay=Math.min(pollDelay*2, 300000); // Exponential Backoff يصل لـ 5 دقائق كحد أقصى
    if(manual)showToast("⚠️ تعذر التحديث حالياً، يتم عرض آخر بيانات محفوظة","warn");
  }
}

async function syncCloud(){
  st.ts=Date.now();
  localStorage.setItem('zj_state_v11',JSON.stringify(st));
  try{
    const res=await cloudFetch("zajil_live","POST",st);
    setConnStatus(res.ok);
    return res.ok;
  }catch(e){
    setConnStatus(false);
    return false;
  }
}

async function loadInbox(countVisit){
  if(countVisit && !sessionStorage.getItem('zj_visited')){
    try{
      const visitRes=await fetch(`${PROXY_ENDPOINT}?action=visit&bucket=zajil_inbox`,{
        method:"POST",headers:{"Content-Type":"application/json"},body:"{}"
      });
      if(visitRes.ok){
        const visitData=await visitRes.json();
        totalViews=Number(visitData.views)||totalViews;
        sessionStorage.setItem('zj_visited','1');
      }
    }catch(e){}
  }
  if(adminToken){
    try{
      const r=await cloudFetch("zajil_inbox","GET");
      if(r.ok){
        const d=await r.json();
        inboxQs=Array.isArray(d.questions)?d.questions.slice(0,50):[];
        totalViews=Number(d.views)||totalViews;
      }else if(r.status===401||r.status===403){
        adminToken="";
        inboxQs=[];
        showToast("انتهت صلاحية الجلسة، يرجى تسجيل الدخول مجدداً","warn");
      }
    }catch(e){}
  }else{
    inboxQs=[];
  }
  renderInbox();
}

async function saveInbox(){
  if(!adminToken)return false;
  try{
    const res=await cloudFetch("zajil_inbox","POST",{questions:inboxQs.slice(0,50),views:totalViews});
    if(res.status===401||res.status===403)adminToken="";
    return res.ok;
  }catch(e){return false;}
}

function clock(){
  try{
    const d=new Date();
    document.getElementById('timeTxt').textContent=d.toLocaleTimeString('ar-EG',{timeZone:'Africa/Khartoum',hour:'2-digit',minute:'2-digit'});
    document.getElementById('dateTxt').textContent=d.toLocaleDateString('ar-u-nu-latn',{timeZone:'Africa/Khartoum',weekday:'long',day:'numeric',month:'long',year:'numeric'});
  }catch(e){}
}
setInterval(clock,10000); clock();

function syncThemeIcon(){
  const isDark=document.body.classList.contains('dark-mode');
  const ic=document.getElementById('themeIcon');
  if(ic)ic.className=isDark?'fa-solid fa-sun text-amber-400 text-sm':'fa-solid fa-moon text-sm';
}
function toggleTheme(){
  const isDark=document.body.classList.toggle('dark-mode');
  localStorage.setItem('zj_theme',isDark?'dark':'light');
  syncThemeIcon();
}
syncThemeIcon();

function switchTab(id,el){
  document.querySelectorAll('.tab-content').forEach(t=>t.classList.remove('active'));
  document.getElementById('tab-'+id).classList.add('active');
  document.querySelectorAll('.nav-btn').forEach(b=>{
    b.classList.remove('text-[#F42C90]','font-bold');
    b.classList.add('text-gray-300');
    b.setAttribute('aria-selected','false');
  });
  el.classList.remove('text-gray-300');
  el.classList.add('text-[#F42C90]','font-bold');
  el.setAttribute('aria-selected','true');
  window.scrollTo({top:0,behavior:'smooth'});
}

// حالة التطبيقات المصرفية من Status.sd فقط؛ لا نفحص المواقع الرسمية.
let externalBankState=null;
const BANK_MONITOR_URL="https://zajil-bank-monitor.a7mdtayb.workers.dev/status";
function getExternalBankStatus(item){
  const ext=item?.externalStatus;
  if(!ext||!ext.reportedStatus||ext.reportedStatus==="unknown")return {key:"unknown",label:"غير معروف"};
  const age=Number(ext.sourceAgeMinutes);
  const stale=!Number.isFinite(age)||age>180;
  if(ext.reportedStatus==="يعمل")return stale?{key:"ok",label:"يعمل (بيانات قديمة)"}:{key:"ok",label:"يعمل"};
  if(ext.reportedStatus==="متذبذب")return stale?{key:"warn",label:"متذبذب (بيانات قديمة)"}:{key:"warn",label:"متذبذب"};
  if(ext.reportedStatus==="متوقف")return stale?{key:"warn",label:"آخر حالة: متوقف (قديمة)"}:{key:"err",label:"متوقف"};
  return {key:"unknown",label:"غير معروف"};
}
function renderBanks(){
  const map={
    ok:{c:"bank-dot-wrap bank-ok",d:"bank-dot bank-dot-green"},
    warn:{c:"bank-dot-wrap bank-warn",d:"bank-dot bank-dot-yellow"},
    err:{c:"bank-dot-wrap bank-err",d:"bank-dot bank-dot-red"},
    unknown:{c:"bank-dot-wrap bank-unknown",d:"bank-dot bank-dot-gray"}
  };
  const items=[{k:"bankak",n:"بنكك"},{k:"fawry",n:"فوري"},{k:"okash",n:"أوكاش"}];
  const grid=document.getElementById('bankStatusGrid');
  if(!grid)return;
  grid.textContent='';
  const frag=document.createDocumentFragment();
  items.forEach(x=>{
    const sourceItem=externalBankState?.apps?.find(a=>a.id===x.k);
    const state=getExternalBankStatus(sourceItem);
    const m=map[state.key]||map.unknown;
    const div=document.createElement('div');
    div.className=`${m.c} flex flex-col items-center justify-center gap-1.5 rounded-xl p-2 text-xs font-bold`;
    div.title=sourceItem?.externalStatus?.sourceAgeText?("آخر تحديث لحالة التطبيق في المصدر: "+sourceItem.externalStatus.sourceAgeText):"حالة التطبيق حسب Status.sd";
    const dot=document.createElement('span'); dot.className=m.d;
    dot.setAttribute('aria-hidden','true');
    const name=document.createElement('span'); name.textContent=x.n;
    const txt=document.createElement('span'); txt.className="bank-status-label"; txt.textContent=state.label;
    const age=document.createElement('span'); age.className="bank-status-age";
    const ageText=sourceItem?.externalStatus?.sourceAgeText;
    age.textContent=ageText ? ("آخر حالة منذ "+ageText) : "وقت الحالة غير متاح";
    div.append(dot,name,txt,age); frag.appendChild(div);
  });
  grid.appendChild(frag);
}
async function loadExternalBankStatus(){
  try{
    const response=await fetch(BANK_MONITOR_URL,{method:"GET",cache:"no-store",mode:"cors",signal:AbortSignal.timeout(8000)});
    if(!response.ok)throw new Error("status source unavailable");
    const data=await response.json();
    if(!Array.isArray(data.apps))throw new Error("invalid status response");
    externalBankState=data;
    renderBanks();
  }catch(e){
    externalBankState=null;
    renderBanks();
  }
}

// العرض الشامل باستخدام DocumentFragment و textContent لمنع XSS وتحسين الأداء
let openArtIndex = -1;

function toggleArt(idx){
  openArtIndex = openArtIndex === idx ? -1 : idx;
  renderAll();
}

function renderAll(){
  document.getElementById('heroBuy').textContent=fmt(st.b);
  document.getElementById('heroSell').textContent=fmt(st.s);
  document.getElementById('heroUpd').textContent=st.upd;
  document.getElementById('ratesUpdSub').textContent="آخر تحديث: "+st.upd;
  document.getElementById('tickerTxt').textContent=st.tk;
  renderBanks();

  const diffBase = Number(st.b) - Number(st.prevB || st.b);
  const currBox = document.getElementById('currList');
  currBox.textContent='';
  const currFrag = document.createDocumentFragment();

  CURR.forEach(x=>{
    const row=document.createElement('div');
    row.className="grid grid-cols-12 items-center py-2.5 px-2 t-num text-xs";
    const c1=document.createElement('div'); c1.className="col-span-5 flex items-center gap-2";
    const img=document.createElement('img'); img.src=`https://flagcdn.com/w40/${x.f}.png`; img.alt=`علم ${x.n}`; img.className="w-7 h-7 rounded-full object-cover border";
    const info=document.createElement('div');
    const nDiv=document.createElement('div'); nDiv.className="font-bold"; nDiv.textContent=x.n;
    const cDiv=document.createElement('div'); cDiv.className="text-[10px] opacity-60 font-bold"; cDiv.textContent=x.c;
    info.appendChild(nDiv); info.appendChild(cDiv); c1.appendChild(img); c1.appendChild(info);
    const c2=document.createElement('div'); c2.className="col-span-3 text-center font-bold"; c2.textContent=fmt(st.b*x.rb);
    const c3=document.createElement('div'); c3.className="col-span-2 text-center font-bold text-[#D81B7A]"; c3.textContent=fmt(st.s*x.rs);
    const c4=document.createElement('div'); c4.dir="ltr";
    const cDiff = diffBase * x.rb;
    if(Math.abs(cDiff) < 0.01){c4.className="col-span-2 text-left font-bold text-gray-400";c4.textContent="• 0";}
    else if(cDiff > 0){c4.className="col-span-2 text-left font-bold text-emerald-600";c4.textContent=`↑ +${fmt(Math.abs(cDiff))}`;}
    else{c4.className="col-span-2 text-left font-bold text-rose-600";c4.textContent=`↓ -${fmt(Math.abs(cDiff))}`;}
    row.appendChild(c1); row.appendChild(c2); row.appendChild(c3); row.appendChild(c4); currFrag.appendChild(row);
  });
  currBox.appendChild(currFrag);

  if(!st.arts||!st.arts.length)st.arts=[DEF_ART];
  const artContainer = document.getElementById('artList');
  artContainer.textContent = '';
  const artFrag = document.createDocumentFragment();

  st.arts.forEach((a, idx) => {
    const isOpen = openArtIndex === idx;
    const card = document.createElement('article');
    card.className = "glass-card rounded-2xl overflow-hidden shadow-sm";
    card.setAttribute('data-art-index', String(idx));

    const trigger = document.createElement('button');
    trigger.type = "button";
    trigger.className = "w-full flex items-center gap-3 p-3.5 text-right focus:outline-none focus-visible:ring-2 focus-visible:ring-[#D81B7A]";
    trigger.setAttribute('aria-expanded', String(isOpen));
    trigger.setAttribute('aria-controls', `art-details-${idx}`);
    trigger.addEventListener('click', () => toggleArt(idx));

    if(a.i && isSafeImageUrl(a.i)){
      const thumb = document.createElement('img');
      thumb.src = a.i;
      thumb.alt = String(a.t||"صورة توضيحية").slice(0,100);
      thumb.loading = "lazy";
      thumb.className = "w-[76px] h-[64px] shrink-0 object-cover rounded-xl border border-purple-100/70";
      trigger.appendChild(thumb);
    } else {
      const placeholder = document.createElement('div');
      placeholder.className = "w-[76px] h-[64px] shrink-0 rounded-xl bg-gradient-to-br from-[#F9E7F1] to-[#EDE3F5] text-[#8B1D59] flex items-center justify-center";
      const pIcon = document.createElement('i'); pIcon.className = "fa-solid fa-circle-question text-2xl"; pIcon.setAttribute('aria-hidden','true');
      placeholder.appendChild(pIcon); trigger.appendChild(placeholder);
    }

    const titleGroup = document.createElement('div');
    titleGroup.className = "flex-1 min-w-0";
    const badge = document.createElement('span');
    badge.className = "inline-block bg-pink-100 text-[#D81B7A] text-[10px] font-bold px-2 py-0.5 rounded-lg mb-1";
    badge.textContent = "سؤال / شرح";
    const title = document.createElement('h4');
    title.className = "text-[14px] font-bold text-[#2D062B] s-txt leading-snug";
    title.textContent = String(a.t||"");
    titleGroup.appendChild(badge); titleGroup.appendChild(title); trigger.appendChild(titleGroup);

    const chevron = document.createElement('i');
    chevron.className = `fa-solid ${isOpen ? "fa-chevron-up" : "fa-chevron-down"} text-[#D81B7A] text-sm shrink-0 transition-transform`;
    chevron.setAttribute('aria-hidden','true');
    trigger.appendChild(chevron);
    card.appendChild(trigger);

    if(isOpen){
      const details = document.createElement('div');
      details.id = `art-details-${idx}`;
      details.className = "px-3.5 pb-3.5 pt-0 space-y-3";
      if(a.i && isSafeImageUrl(a.i)){
        const fullImg = document.createElement('img');
        fullImg.src = a.i; fullImg.alt = String(a.t||"صورة توضيحية").slice(0,100);
        fullImg.loading = "lazy";
        fullImg.className = "w-full max-h-72 object-contain rounded-xl bg-white/60";
        details.appendChild(fullImg);
      }
      const bodyBox = document.createElement('div');
      bodyBox.className = "glass-sub p-3.5 rounded-xl text-[14.5px] leading-relaxed whitespace-pre-line break-words";
      bodyBox.textContent = String(a.b||"");
      details.appendChild(bodyBox);

      const shareBtn = document.createElement('button');
      shareBtn.type = "button";
      shareBtn.className = "glass-sub text-[#D81B7A] px-3 py-2 rounded-xl text-xs font-bold inline-flex items-center gap-1.5";
      const sIcon = document.createElement('i'); sIcon.className="fa-solid fa-share-nodes"; sIcon.setAttribute('aria-hidden','true');
      const sSpan = document.createElement('span'); sSpan.textContent="مشاركة الشرح";
      shareBtn.appendChild(sIcon); shareBtn.appendChild(sSpan);
      shareBtn.addEventListener('click', (event) => { event.stopPropagation(); sharePost(idx); });
      details.appendChild(shareBtn);
      card.appendChild(details);
    }
    artFrag.appendChild(card);
  });
  artContainer.appendChild(artFrag);
  initCalc();
}

function sharePost(idx){
  const a=st.arts[idx]; if(!a)return;
  const txt=`📌 *${a.t}*\n\n${a.b}\n\n🕊️ *منصة زاجل للنشر | الرسالة الحقيقية*\n${location.href}`;
  if(navigator.share){navigator.share({title:a.t,text:txt,url:location.href}).catch(()=>{});}
  else if(navigator.clipboard){navigator.clipboard.writeText(txt);showToast("✅ تم نسخ المنشور مع رابط المنصة!");}
}
function shareSite(){
  const txt=`🕊️ *منصة زاجل للنشر | الرسالة الحقيقية*\nتابع أسعار العملات لحظة بلحظة، وحالة التطبيقات المصرفية (بنكك، فوري، أوكاش)، وحاسبة العملات والشروحات عبر الرابط:\n${location.href}`;
  if(navigator.share){navigator.share({title:"منصة زاجل للنشر",text:txt,url:location.href}).catch(()=>{});}
  else if(navigator.clipboard){navigator.clipboard.writeText(txt);showToast("✅ تم نسخ رابط المنصة لمشاركته!");}
}

function getAllCalcList(){return [{c:"SDG",n:"جنيه سوداني",f:"sd",b:1,s:1},...CURR.map(x=>({c:x.c,n:x.n,f:x.f,b:st.b*x.rb,s:st.s*x.rs}))];}
function initCalc(){
  const all=getAllCalcList();
  const fs=document.getElementById('fSel'),ts=document.getElementById('tSel');
  const kvF=fs.value||"SDG", kvT=ts.value||"EGP";
  fs.textContent=''; ts.textContent='';
  all.forEach(x=>{
    const o1=document.createElement('option'); o1.value=x.c; o1.textContent=`${x.n} (${x.c})`;
    const o2=o1.cloneNode(true);
    fs.appendChild(o1); ts.appendChild(o2);
  });
  fs.value=kvF; ts.value=kvT; calc();
}
function formatCalcAmount(input){
  const raw=String(input.value||"");
  const caret=input.selectionStart??raw.length;
  const before=raw.slice(0,caret);
  const digitsBefore=(before.match(/[0-9]/g)||[]).length;
  let cleaned=raw.replace(/,/g,"").replace(/[^0-9.]/g,"");
  const dot=cleaned.indexOf(".");
  if(dot!==-1)cleaned=cleaned.slice(0,dot+1)+cleaned.slice(dot+1).replace(/\./g,"");
  const parts=cleaned.split(".");
  parts[0]=(parts[0]||"").replace(/^0+(?=\d)/,"");
  parts[0]=parts[0].replace(/\B(?=(\d{3})+(?!\d))/g,",");
  const formatted=parts.length>1?parts[0]+"."+parts[1]:parts[0];
  input.value=formatted;
  let pos=0, seen=0;
  while(pos<formatted.length&&seen<digitsBefore){if(/[0-9]/.test(formatted[pos]))seen++;pos++;}
  if(before.includes(".")&&formatted.includes(".")&&pos<=formatted.indexOf("."))pos=formatted.indexOf(".")+1;
  try{input.setSelectionRange(pos,pos);}catch(e){}
}
function calc(){
  const all=getAllCalcList();
  const fObj=all.find(x=>x.c===document.getElementById('fSel').value)||all[0];
  const tObj=all.find(x=>x.c===document.getElementById('tSel').value)||all[1];
  const amt=Math.max(0, parseFloat(document.getElementById('cAmt').value.replace(/,/g,''))||0);
  document.getElementById('fFlg').src=`https://flagcdn.com/w40/${fObj.f}.png`;
  document.getElementById('tFlg').src=`https://flagcdn.com/w40/${tObj.f}.png`;
  const sdgBuy=amt*fObj.b, sdgSell=amt*fObj.s;
  document.getElementById('cResBuy').textContent=fmt(sdgBuy/tObj.b)+' '+tObj.c;
  document.getElementById('cResSell').textContent=fmt(sdgSell/tObj.s)+' '+tObj.c;

  const listEl=document.getElementById('calcAllList');
  listEl.textContent='';
  const frag=document.createDocumentFragment();
  all.filter(x=>x.c!==fObj.c).forEach(x=>{
    const row=document.createElement('div');
    row.className="grid grid-cols-12 items-center py-2 px-2";
    const c1=document.createElement('div'); c1.className="col-span-6 flex items-center gap-2";
    const img=document.createElement('img'); img.src=`https://flagcdn.com/w40/${x.f}.png`; img.alt=x.n; img.className="w-5 h-5 rounded-full";
    const b=document.createElement('b'); b.textContent=x.n;
    c1.appendChild(img); c1.appendChild(b);

    const c2=document.createElement('div'); c2.className="col-span-3 text-center font-bold"; c2.textContent=fmt(sdgBuy/x.b);
    const c3=document.createElement('div'); c3.className="col-span-3 text-left font-bold text-[#D81B7A]"; c3.textContent=fmt(sdgSell/x.s);
    row.appendChild(c1); row.appendChild(c2); row.appendChild(c3);
    frag.appendChild(row);
  });
  listEl.appendChild(frag);
}
function swapC(){const f=document.getElementById('fSel'),t=document.getElementById('tSel'),x=f.value;f.value=t.value;t.value=x;calc();}

// فحص حجم وصيغة الصورة وتفريغ الذاكرة
function encodeImg(input){
  const file=input.files[0]; if(!file)return;
  if(!['image/jpeg','image/png','image/webp'].includes(file.type)){
    input.value=''; return showToast("⚠️ يرجى اختيار صورة بصيغة JPG أو PNG أو WebP فقط","err");
  }
  if(file.size > 5 * 1024 * 1024){
    input.value=''; return showToast("⚠️ حجم الصورة كبير جداً (الحد الأقصى 5MB)","err");
  }
  const objUrl=URL.createObjectURL(file);
  const img=new Image();
  img.onload=()=>{
    const canvas=document.createElement('canvas');
    const maxW=480, scale=maxW/img.width<1?maxW/img.width:1;
    canvas.width=Math.round(img.width*scale); canvas.height=Math.round(img.height*scale);
    canvas.getContext('2d').drawImage(img,0,0,canvas.width,canvas.height);
    uploadedImgData=canvas.toDataURL('image/jpeg',0.55);
    URL.revokeObjectURL(objUrl);
    document.getElementById('imgLbl').textContent="✅ تم تجهيز الصورة بنجاح";
  };
  img.onerror=()=>{URL.revokeObjectURL(objUrl); showToast("⚠️ تعذر قراءة ملف الصورة","err");};
  img.src=objUrl;
}

// إرسال الأسئلة مع فحص المدخلات وحماية ضد الإغراق (Rate-Limit)
async function submitQuestion(){
  if(Date.now() - lastQSent < 45000){
    return showToast("⏳ يرجى الانتظار قليلاً قبل إرسال سؤال آخر","warn");
  }
  const sender=document.getElementById('qSender').value.trim().slice(0,60)||"متابع زاجل";
  const text=document.getElementById('qText').value.trim().slice(0,500);
  if(text.length < 4)return showToast("⚠️ يرجى كتابة سؤالك بوضوح أولاً","warn");

  const btn=document.getElementById('btnSendQ');
  btn.disabled=true; btn.textContent="جاري إرسال سؤالك...";
  let ok=false;
  try{
    const r=await fetch(`${PROXY_ENDPOINT}?action=submit_question&bucket=zajil_inbox`,{
      method:"POST",
      headers:{"Content-Type":"application/json"},
      body:JSON.stringify({sender,text,time:document.getElementById('timeTxt').textContent})
    });
    ok=r.ok;
  }catch(e){}
  btn.disabled=false;
  btn.innerHTML='<i class="fa-solid fa-paper-plane" aria-hidden="true"></i><span>إرسال السؤال لإدارة زاجل</span>';
  if(ok){
    lastQSent=Date.now();
    document.getElementById('qText').value='';
    showToast("✅ وصل سؤالك لإدارة زاجل بنجاح!");
  }else{
    showToast("⚠️ تعذر الإرسال حالياً، يرجى المحاولة مرة أخرى","err");
  }
}

// بناء صندوق الوارد وقائمة منشورات الإدارة بـ DOM الآمن تماماً بدون innerHTML
function renderInbox(){
  document.getElementById('qCount').textContent=inboxQs.length;
  document.getElementById('vCount').textContent=totalViews.toLocaleString('en-US');

  const box=document.getElementById('inboxList');
  box.textContent='';
  if(!inboxQs.length){
    const empty=document.createElement('p');
    empty.className="text-gray-400 text-center py-2";
    empty.textContent="لا توجد أسئلة واردة حتى الآن";
    box.appendChild(empty);
  }else{
    const frag=document.createDocumentFragment();
    inboxQs.forEach(q=>{
      const item=document.createElement('div');
      item.className="bg-white p-2.5 rounded-xl border border-purple-100 flex justify-between items-start gap-2";

      const content=document.createElement('div');
      const b=document.createElement('b');
      b.className="text-[#6B0F5B]";
      b.textContent=String(q.sender||"متابع")+" ";
      const tm=document.createElement('span');
      tm.className="text-[10px] text-gray-400 font-normal";
      tm.textContent=String(q.time||"");
      b.appendChild(tm);

      const p=document.createElement('p');
      p.className="text-gray-700 mt-0.5 break-words";
      p.textContent=String(q.text||"");
      content.appendChild(b); content.appendChild(p);

      const actions=document.createElement('div');
      actions.className="flex gap-1 shrink-0";

      const rBtn=document.createElement('button');
      rBtn.className="bg-purple-100 text-[#6B0F5B] px-2 py-1 rounded-lg font-bold";
      rBtn.textContent="رد";
      rBtn.addEventListener('click',()=>replyQ(String(q.text||"")));

      const dBtn=document.createElement('button');
      dBtn.className="bg-rose-50 text-rose-600 px-2 py-1 rounded-lg";
      dBtn.textContent="✕";
      dBtn.addEventListener('click',()=>delQ(q.id));

      actions.appendChild(rBtn); actions.appendChild(dBtn);
      item.appendChild(content); item.appendChild(actions);
      frag.appendChild(item);
    });
    box.appendChild(frag);
  }

  const artAdmin=document.getElementById('adminArtList');
  artAdmin.textContent='';
  const artFrag=document.createDocumentFragment();
  (st.arts||[]).forEach((a,i)=>{
    const row=document.createElement('div');
    row.className="bg-white p-2 rounded-lg border flex justify-between items-center gap-2";
    const sp=document.createElement('span');
    sp.className="truncate font-bold";
    sp.textContent=String(a.t||"");
    const del=document.createElement('button');
    del.className="text-rose-600 font-bold px-2 shrink-0";
    del.textContent="حذف";
    del.addEventListener('click',()=>delArt(i));
    row.appendChild(sp); row.appendChild(del);
    artFrag.appendChild(row);
  });
  artAdmin.appendChild(artFrag);
}

function replyQ(txt){document.getElementById('pTit').value=txt;document.getElementById('pBod').focus();}
async function delQ(id){inboxQs=inboxQs.filter(q=>q.id!==id);renderInbox();await saveInbox();showToast("تم حذف السؤال");}
async function delArt(idx){st.arts.splice(idx,1);renderInbox();renderAll();await syncCloud();showToast("تم حذف المنشور");}

function closeModal(id){
  document.getElementById(id).classList.add('hidden');
  if(id==='dashM')uploadedImgData=""; // تفريغ الذاكرة عند إغلاق اللوحة
}
function secretTap(){taps++;clearTimeout(tmr);tmr=setTimeout(()=>taps=0,2000);if(taps>=5){taps=0;document.getElementById('logM').classList.remove('hidden');}}

async function login(){
  if(Date.now() < lockUntil){
    const waitSec=Math.ceil((lockUntil-Date.now())/1000);
    return showToast(`⏳ تم قفل المحاولات مؤقتاً، انتظر ${waitSec} ثانية`,"err");
  }
  const pass=document.getElementById('passIn').value.trim();
  if(!pass)return;

  let authorized=false;
  try{
    const r=await fetch(PROXY_ENDPOINT+"?action=login",{
      method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({password:pass})
    });
    if(r.ok){
      const d=await r.json();
      if(d.token){authorized=true; adminToken=d.token;}
    }else if(r.status===503){
      showToast("إعدادات حماية الإدارة غير مكتملة على الخادم","err");
      return;
    }
  }catch(e){
    showToast("تعذر الاتصال بخادم تسجيل الدخول؛ لم يتم تجاوز الحماية","err");
    return;
  }

  if(authorized){
    loginFails=0;
    document.getElementById('passIn').value='';
    closeModal('logM');
    await loadCloud(false); await loadInbox(false);
    document.getElementById('dBuy').value=st.b;
    document.getElementById('dSell').value=st.s;
    document.getElementById('dTick').value=st.tk;
    document.getElementById('stBankak').value=st.banks?.bankak||"ok";
    document.getElementById('stFawry').value=st.banks?.fawry||"ok";
    document.getElementById('stOkash').value=st.banks?.okash||"ok";
    renderInbox();
    document.getElementById('dashM').classList.remove('hidden');
    showToast("🔓 مرحباً بك في لوحة تحكم زاجل");
  }else{
    loginFails++;
    if(loginFails>=5){
      lockUntil=Date.now()+120000;
      showToast("⛔ تم إيقاف الدخول لمدة دقيقتين لتجاوز المحاولات","err");
    }else{
      showToast("❌ كلمة المرور غير صحيحة","err");
    }
  }
}

async function saveR(){
  const newB=parseFloat(document.getElementById('dBuy').value);
  const newS=parseFloat(document.getElementById('dSell').value);
  if(!newB||!newS||newB<=0||newS<=0)return showToast("⚠️ يرجى إدخال أسعار صحيحة","warn");

  const btn=document.getElementById('btnSaveR');
  btn.disabled=true; btn.textContent="جاري الحفظ للجميع...";
  if(newB!==st.b)st.prevB=st.b;
  st.b=newB; st.s=newS;
  st.tk=document.getElementById('dTick').value.trim().slice(0,300)||st.tk;
  st.banks={
    bankak:document.getElementById('stBankak').value,
    fawry:document.getElementById('stFawry').value,
    okash:document.getElementById('stOkash').value
  };
  st.upd=document.getElementById('dateTxt').textContent+" • "+document.getElementById('timeTxt').textContent;
  renderAll();
  const ok=await syncCloud();
  btn.disabled=false; btn.textContent="حفظ وتحديث وإرسال إشعار للجميع";
  if(ok){showToast("✅ تم تحديث الأسعار والحالات للجميع!");closeModal('dashM');}
  else{showToast("⚠️ تعذر الاتصال بالسحابة حالياً، جرب مرة أخرى","err");}
}

async function addArt(){
  const t=document.getElementById('pTit').value.trim().slice(0,200);
  const b=document.getElementById('pBod').value.trim().slice(0,2000);
  const rawUrl=document.getElementById('pImg').value.trim();
  if(!t||!b)return showToast("⚠️ يرجى كتابة عنوان السؤال والإجابة","warn");
  if(rawUrl && !isSafeImageUrl(rawUrl)){
    return showToast("⚠️ رابط الصورة يجب أن يبدأ بـ https:// فقط","err");
  }
  const i=uploadedImgData||rawUrl;
  const btn=document.getElementById('btnAddArt');
  btn.disabled=true; btn.textContent="جاري النشر للجميع...";
  st.arts=st.arts||[]; st.arts.unshift({t,b,i});
  uploadedImgData=""; // تفريغ الذاكرة فوراً
  document.getElementById('pFile').value='';
  document.getElementById('imgLbl').textContent="اختر صورة توضيحية من جهازك (اختياري)";
  document.getElementById('pTit').value=''; document.getElementById('pBod').value=''; document.getElementById('pImg').value='';
  renderAll(); renderInbox();
  const ok=await syncCloud();
  btn.disabled=false; btn.textContent="نشر السؤال والإجابة للجميع";
  if(ok){showToast("✅ تم نشر السؤال والإجابة لجميع المستخدمين!");closeModal('dashM');}
  else{showToast("⚠️ تعذر النشر السحابي، حاول مجدداً","err");}
}


// Centralized UI event delegation: no inline JavaScript handlers in HTML.
document.addEventListener('click', event => {
  const control = event.target.closest('[data-action]');
  if (!control) return;
  switch (control.dataset.action) {
    case 'secretTap': secretTap(); break;
    case 'enableNotif': enableNotif(); break;
    case 'triggerInstall': triggerInstall(); break;
    case 'onboardingInstall':
      dismissOnboarding(false);
      triggerInstall();
      break;
    case 'onboardingNotif':
      dismissOnboarding(false);
      enableNotif();
      break;
    case 'dismissOnboarding': dismissOnboarding(true); break;
    case 'toggleTheme': toggleTheme(); break;
    case 'refreshCloud': loadCloud(true); break;
    case 'submitQuestion': submitQuestion(); break;
    case 'swapC': swapC(); break;
    case 'shareSite': shareSite(); break;
    case 'switchTab': switchTab(control.dataset.tab, control); break;
    case 'closeModal': closeModal(control.dataset.modal); break;
    case 'login': login(); break;
    case 'saveR': saveR(); break;
    case 'addArt': addArt(); break;
    case 'loadInbox': loadInbox(false); break;
  }
});
document.addEventListener('input', event => {
  const control = event.target.closest('[data-action="formatCalcAmount"]');
  if (control) { formatCalcAmount(control); calc(); }
});
document.addEventListener('change', event => {
  const control = event.target.closest('[data-action]');
  if (!control) return;
  if (control.dataset.action === 'calc') calc();
  if (control.dataset.action === 'encodeImg') encodeImg(control);
});


let hadController = Boolean(navigator.serviceWorker && navigator.serviceWorker.controller);
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (hadController) showToast('يتوفر تحديث جديد لزاجل؛ أعد فتح الصفحة لتطبيقه.');
    hadController = true;
  });
}

// تسجيل عامل الخدمة لدعم التثبيت والعمل مع اتصال متقطع.
if('serviceWorker' in navigator){
  window.addEventListener('load',()=>navigator.serviceWorker.register('/sw.js').catch(()=>{}),{once:true});
}
window.addEventListener('beforeinstallprompt',e=>{
  e.preventDefault();
  deferredPrompt=e;
});
window.addEventListener('appinstalled',()=>{deferredPrompt=null;});

// إرشاد أول زيارة: نافذة اختيارية للتثبيت وإشعارات الأسعار.
function isInstalledPWA(){
  return window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true;
}
function dismissOnboarding(remember=true){
  const modal=document.getElementById('welcomeSetupM');
  if(modal)modal.classList.add('hidden');
  if(remember)localStorage.setItem('zj_onboarding_dismissed_v1','1');
}
async function updateOnboardingOptions(){
  const installBtn=document.getElementById('welcomeInstallBtn');
  const notifBtn=document.getElementById('welcomeNotifBtn');
  if(installBtn && isInstalledPWA())installBtn.classList.add('hidden');
  if(notifBtn && 'Notification' in window && Notification.permission==='granted' && 'serviceWorker' in navigator){
    try{
      const reg=await navigator.serviceWorker.ready;
      if(await reg.pushManager.getSubscription()){
        notifBtn.classList.add('hidden');
      }
    }catch(e){}
  }
}
function maybeShowOnboarding(){
  if(localStorage.getItem('zj_onboarding_dismissed_v1')==='1')return;
  if(isInstalledPWA() && 'Notification' in window && Notification.permission==='granted')return;
  const modal=document.getElementById('welcomeSetupM');
  if(!modal)return;
  updateOnboardingOptions();
  window.setTimeout(()=>{
    if(!document.hidden && localStorage.getItem('zj_onboarding_dismissed_v1')!=='1')modal.classList.remove('hidden');
  },900);
}
window.addEventListener('load',maybeShowOnboarding,{once:true});

// زر التثبيت: يعرض نافذة التثبيت الأصلية حين يدعمها المتصفح.
async function triggerInstall(){
  if(isInstalledPWA()){
    showToast('زاجل مثبت بالفعل على شاشة جهازك');
    return;
  }
  if(deferredPrompt){
    deferredPrompt.prompt();
    const choice=await deferredPrompt.userChoice.catch(()=>null);
    if(choice?.outcome==='accepted'){
      showToast('تم بدء تثبيت زاجل');
      localStorage.setItem('zj_onboarding_dismissed_v1','1');
    }
    deferredPrompt=null;
  }else{
    document.getElementById('pwaM').classList.remove('hidden');
  }
}

// نظام جدولة التحديث الذكي مع Exponential Backoff وإيقاف التحديث في الخلفية
function schedulePoll(){
  clearTimeout(pollTimer);
  pollTimer=setTimeout(async ()=>{
    if(document.visibilityState==='visible'){
      await loadCloud(false);
      if(!document.getElementById('dashM').classList.contains('hidden'))await loadInbox(false);
    }
    schedulePoll();
  }, pollDelay);
}
document.addEventListener('visibilitychange',()=>{
  if(document.visibilityState==='visible'){loadCloud(false);schedulePoll();}
});

renderAll(); loadCloud(false); loadInbox(true); loadExternalBankStatus(); setInterval(loadExternalBankStatus,180000); schedulePoll();
