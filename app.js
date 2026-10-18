const PANTRY_ID="77d25e08-f670-4cbc-9e8d-e85150943ed0";
const API_URL=`https://getpantry.cloud/apiv1/pantry/${PANTRY_ID}/basket/zajil_live`;
const INBOX_URL=`https://getpantry.cloud/apiv1/pantry/${PANTRY_ID}/basket/zajil_inbox`;
const PASS="ZAJIL@201919"; let taps=0,tmr,deferredPrompt=null,uploadedImgData="",inboxQs=[],totalViews=1;

const CURR=[
  {c:"USD",n:"دولار أمريكي",f:"us",rb:1,rs:1,ch:"+50"},
  {c:"SAR",n:"ريال سعودي",f:"sa",rb:2220/8325,rs:2387/8950,ch:"+20"},
  {c:"EGP",n:"جنيه مصري",f:"eg",rb:159.3/8325,rs:171.3/8950,ch:"+2"},
  {c:"AED",n:"درهم إماراتي",f:"ae",rb:2267/8325,rs:2437/8950,ch:"+25"},
  {c:"QAR",n:"ريال قطري",f:"qa",rb:2287/8325,rs:2459/8950,ch:"+22"},
  {c:"EUR",n:"يورو أوروبي",f:"eu",rb:9079/8325,rs:9760/8950,ch:"+80"},
  {c:"CNY",n:"يوان صيني",f:"cn",rb:1169/8325,rs:1257/8950,ch:"+15"},
  {c:"MYR",n:"رينغيت ماليزي",f:"my",rb:1936/8325,rs:2081/8950,ch:"+18"},
  {c:"KWD",n:"دينار كويتي",f:"kw",rb:27295/8325,rs:29344/8950,ch:"+120"},
  {c:"OMR",n:"ريال عُماني",f:"om",rb:21623/8325,rs:23247/8950,ch:"+95"},
  {c:"BHD",n:"دينار بحريني",f:"bh",rb:22082/8325,rs:23740/8950,ch:"+90"},
  {c:"ETB",n:"بير إثيوبي",f:"et",rb:51.33/8325,rs:55.18/8950,ch:"+1"}
];
const DEF_ART={t:"كيف أحول من تطبيق بنكك إلى فوري أو أوكاش؟",b:"1. استخرج رقم الـ BBAN الخاص بحساب المستفيد عبر أداة زاجل.\n2. افتح تطبيق بنكك واختر التحويل لبنك آخر.\n3. أدخل رقم الـ BBAN والمبلغ وأكمل العملية بسهولة.",i:""};
let st=JSON.parse(localStorage.getItem('zj_state_v11'))||{
  ts:0,b:8325,s:8950,upd:"تحديث اليوم",tk:"منصة زاجل للنشر | الرسالة الحقيقية",
  banks:{bankak:"ok",fawry:"ok",okash:"warn"},arts:[DEF_ART]
};
const fmt=n=>n>=500?Math.round(n).toLocaleString('en-US'):Number(n.toFixed(2)).toLocaleString('en-US');

function checkChangesAndNotify(newD){
  if(!("Notification" in window)||Notification.permission!=="granted")return;
  const oldB=Number(st.b), oldS=Number(st.s), newB=Number(newD.b), newS=Number(newD.s);
  const oldBk=JSON.stringify(st.banks||{}), newBk=JSON.stringify(newD.banks||{});
  if((oldB&&newB&&(oldB!==newB||oldS!==newS)) || (oldBk!==newBk)){
    try{
      new Notification("منصة زاجل للنشر 🕊️",{
        body:`تحديث جديد: الدولار شراء ${fmt(newB)} | بيع ${fmt(newS)} ج.س`,
        tag:"zajil-rate-update"
      });
    }catch(e){}
  }
}

async function enableNotif(){
  if(!("Notification" in window))return alert("متصفحك لا يدعم الإشعارات المباشرة.");
  const p=await Notification.requestPermission();
  syncNotifIcon();
  if(p==="granted"){
    new Notification("منصة زاجل للنشر 🕊️",{body:"تم تفعيل إشعارات الأسعار وحالة التطبيقات المصرفية بنجاح!"});
  }else{
    alert("يرجى السماح بالإشعارات من إعدادات المتصفح لتصلك تحديثات الأسعار.");
  }
}
function syncNotifIcon(){
  const ic=document.getElementById('notifIcon');
  if("Notification" in window && Notification.permission==="granted"){
    ic.className="fa-solid fa-bell text-sm text-emerald-600";
  }
}
syncNotifIcon();

async function loadCloud(){
  try{
    const r=await fetch(API_URL+"?t="+Date.now(),{method:"GET",cache:"no-store"});
    if(r.ok){
      const d=await r.json();
      if(d&&typeof d.b!=="undefined"){
        if(st.ts>0)checkChangesAndNotify(d);
        st={
          ts:Number(d.ts)||Date.now(),
          b:Number(d.b)||8325, s:Number(d.s)||8950,
          upd:d.upd||"تحديث اليوم", tk:d.tk||"منصة زاجل للنشر | الرسالة الحقيقية",
          banks:d.banks||{bankak:"ok",fawry:"ok",okash:"warn"},
          arts:Array.isArray(d.arts)&&d.arts.length?d.arts:[DEF_ART]
        };
        localStorage.setItem('zj_state_v11',JSON.stringify(st));
        renderAll();
      }
    }
  }catch(e){}
}

async function syncCloud(){
  st.ts=Date.now();
  localStorage.setItem('zj_state_v11',JSON.stringify(st));
  try{
    const res=await fetch(API_URL,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(st)});
    return res.ok;
  }catch(e){return false;}
}

async function loadInbox(countVisit){
  try{
    const r=await fetch(INBOX_URL+"?t="+Date.now(),{method:"GET",cache:"no-store"});
    if(r.ok){
      const d=await r.json();
      inboxQs=Array.isArray(d.questions)?d.questions:[];
      totalViews=(Number(d.views)||1)+(countVisit?1:0);
      if(countVisit && !sessionStorage.getItem('zj_visited')){
        sessionStorage.setItem('zj_visited','1');
        await saveInbox();
      }
    }else if(countVisit){
      await saveInbox();
    }
  }catch(e){}
  renderInbox();
}

async function saveInbox(){
  try{
    await fetch(INBOX_URL,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({questions:inboxQs,views:totalViews})});
    return true;
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
  document.getElementById('themeIcon').className=isDark?'fa-solid fa-sun text-amber-400 text-sm':'fa-solid fa-moon text-sm';
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
  document.querySelectorAll('.nav-btn').forEach(b=>{b.classList.remove('text-[#F42C90]','font-bold');b.classList.add('text-gray-300');});
  el.classList.remove('text-gray-300'); el.classList.add('text-[#F42C90]','font-bold');
  window.scrollTo({top:0,behavior:'smooth'});
}

function renderBanks(){
  const map={
    ok:{t:"يعمل",c:"bg-emerald-50 text-emerald-700 border-emerald-200",d:"bg-emerald-500"},
    warn:{t:"متذبذب",c:"bg-amber-50 text-amber-700 border-amber-200",d:"bg-amber-500"},
    err:{t:"لا يعمل",c:"bg-rose-50 text-rose-700 border-rose-200",d:"bg-rose-500"}
  };
  const items=[{k:"bankak",n:"بنكك"},{k:"fawry",n:"فوري"},{k:"okash",n:"أوكاش"}];
  document.getElementById('bankStatusGrid').innerHTML=items.map(x=>{
    const m=map[st.banks?.[x.k]||"ok"];
    return `<div class="border rounded-xl p-2 ${m.c} flex items-center justify-center gap-1.5 text-xs font-bold"><span class="w-2 h-2 rounded-full ${m.d}"></span><span>${x.n}: ${m.t}</span></div>`;
  }).join('');
}

function renderAll(){
  document.getElementById('heroBuy').textContent=fmt(st.b);
  document.getElementById('heroSell').textContent=fmt(st.s);
  document.getElementById('heroUpd').textContent=st.upd;
  document.getElementById('ratesUpdSub').textContent="آخر تحديث: "+st.upd;
  document.getElementById('tickerTxt').textContent=st.tk;
  renderBanks();
  document.getElementById('currList').innerHTML=CURR.map(x=>`
    <div class="grid grid-cols-12 items-center py-2.5 px-2 t-num text-xs">
      <div class="col-span-5 flex items-center gap-2">
        <img src="https://flagcdn.com/w40/${x.f}.png" class="w-7 h-7 rounded-full object-cover border">
        <div><div class="font-bold">${x.n}</div><div class="text-[10px] opacity-60 font-bold">${x.c}</div></div>
      </div>
      <div class="col-span-3 text-center font-bold">${fmt(st.b*x.rb)}</div>
      <div class="col-span-2 text-center font-bold text-[#D81B7A]">${fmt(st.s*x.rs)}</div>
      <div class="col-span-2 text-left font-bold text-emerald-600" dir="ltr">↑ ${x.ch}</div>
    </div>`).join('');

  if(!st.arts||!st.arts.length)st.arts=[DEF_ART];
  
  const artContainer = document.getElementById('artList');
  artContainer.innerHTML = '';
  st.arts.forEach((a, idx) => {
    const card = document.createElement('div');
    card.className = "glass-card rounded-2xl p-4 shadow-sm space-y-2.5";
    
    if(a.i){
      const img = document.createElement('img');
      img.src = a.i;
      img.className = "w-full max-h-56 object-cover rounded-xl";
      card.appendChild(img);
    }
    
    const topRow = document.createElement('div');
    topRow.className = "flex items-start justify-between gap-2";
    
    const titleGroup = document.createElement('div');
    titleGroup.className = "flex items-start gap-2";
    
    const badge = document.createElement('span');
    badge.className = "bg-pink-100 text-[#D81B7A] text-xs font-bold px-2 py-0.5 rounded-lg shrink-0 mt-0.5";
    badge.textContent = "سؤال";
    
    const h4 = document.createElement('h4');
    h4.className = "text-[16px] font-bold text-[#2D062B] s-txt leading-snug";
    h4.textContent = a.t;
    
    titleGroup.appendChild(badge);
    titleGroup.appendChild(h4);
    
    const shareBtn = document.createElement('button');
    shareBtn.className = "glass-sub text-[#D81B7A] px-2.5 py-1 rounded-xl text-xs font-bold flex items-center gap-1 shrink-0";
    shareBtn.innerHTML = '<i class="fa-solid fa-share-nodes"></i><span>مشاركة</span>';
    shareBtn.onclick = () => sharePost(idx);
    
    topRow.appendChild(titleGroup);
    topRow.appendChild(shareBtn);
    card.appendChild(topRow);
    
    const bodyBox = document.createElement('div');
    bodyBox.className = "glass-sub p-3.5 rounded-xl text-[14.5px] leading-relaxed whitespace-pre-line";
    bodyBox.textContent = a.b;
    card.appendChild(bodyBox);
    
    artContainer.appendChild(card);
  });

  initCalc();
}

function sharePost(idx){
  const a=st.arts[idx]; if(!a)return;
  const txt=`📌 *${a.t}*\n\n${a.b}\n\n🕊️ *منصة زاجل للنشر | الرسالة الحقيقية*\n${location.href}`;
  if(navigator.share){navigator.share({title:a.t,text:txt,url:location.href}).catch(()=>{});}
  else{navigator.clipboard.writeText(txt);alert("✅ تم نسخ المنشور مع رابط المنصة لمشاركته!");}
}
function shareSite(){
  const txt=`🕊️ *منصة زاجل للنشر | الرسالة الحقيقية*\nتابع أسعار العملات لحظة بلحظة، وحالة التطبيقات المصرفية (بنكك، فوري، أوكاش)، وحاسبة العملات والشروحات عبر الرابط:\n${location.href}`;
  if(navigator.share){navigator.share({title:"منصة زاجل للنشر",text:txt,url:location.href}).catch(()=>{});}
  else{navigator.clipboard.writeText(txt);alert("✅ تم نسخ رابط المنصة لمشاركته مع أصدقائك!");}
}

function getAllCalcList(){return [{c:"SDG",n:"جنيه سوداني",f:"sd",b:1,s:1},...CURR.map(x=>({c:x.c,n:x.n,f:x.f,b:st.b*x.rb,s:st.s*x.rs}))];}
function initCalc(){
  const all=getAllCalcList();
  const h=all.map(x=>`<option value="${x.c}">${x.n} (${x.c})</option>`).join('');
  const fs=document.getElementById('fSel'),ts=document.getElementById('tSel');
  const kvF=fs.value||"SDG", kvT=ts.value||"EGP";
  fs.innerHTML=h; ts.innerHTML=h; fs.value=kvF; ts.value=kvT; calc();
}
function calc(){
  const all=getAllCalcList();
  const fObj=all.find(x=>x.c===document.getElementById('fSel').value)||all[0];
  const tObj=all.find(x=>x.c===document.getElementById('tSel').value)||all[1];
  const amt=parseFloat(document.getElementById('cAmt').value)||0;
  document.getElementById('fFlg').src=`https://flagcdn.com/w40/${fObj.f}.png`;
  document.getElementById('tFlg').src=`https://flagcdn.com/w40/${tObj.f}.png`;
  const sdgBuy=amt*fObj.b, sdgSell=amt*fObj.s;
  document.getElementById('cResBuy').textContent=fmt(sdgBuy/tObj.b)+' '+tObj.c;
  document.getElementById('cResSell').textContent=fmt(sdgSell/tObj.s)+' '+tObj.c;
  document.getElementById('calcAllList').innerHTML=all.filter(x=>x.c!==fObj.c).map(x=>`
    <div class="grid grid-cols-12 items-center py-2 px-2">
      <div class="col-span-6 flex items-center gap-2"><img src="https://flagcdn.com/w40/${x.f}.png" class="w-5 h-5 rounded-full"><b>${x.n}</b></div>
      <div class="col-span-3 text-center font-bold">${fmt(sdgBuy/x.b)}</div>
      <div class="col-span-3 text-left font-bold text-[#D81B7A]">${fmt(sdgSell/x.s)}</div>
    </div>`).join('');
}
function swapC(){const f=document.getElementById('fSel'),t=document.getElementById('tSel'),x=f.value;f.value=t.value;t.value=x;calc();}

function encodeImg(input){
  const file=input.files[0]; if(!file)return;
  const reader=new FileReader();
  reader.onload=e=>{
    const img=new Image();
    img.onload=()=>{
      const canvas=document.createElement('canvas');
      const maxW=320, scale=maxW/img.width<1?maxW/img.width:1;
      canvas.width=img.width*scale; canvas.height=img.height*scale;
      canvas.getContext('2d').drawImage(img,0,0,canvas.width,canvas.height);
      uploadedImgData=canvas.toDataURL('image/jpeg',0.45);
      document.getElementById('imgLbl').textContent="✅ تم تجهيز الصورة بنجاح";
    };
    img.src=e.target.result;
  };
  reader.readAsDataURL(file);
}

async function submitQuestion(){
  const sender=document.getElementById('qSender').value.trim()||"متابع زاجل";
  const text=document.getElementById('qText').value.trim();
  if(!text)return alert("يرجى كتابة سؤالك أولاً");
  const btn=document.getElementById('btnSendQ'); btn.textContent="جاري إرسال سؤالك...";
  await loadInbox(false);
  inboxQs.unshift({id:Date.now(),sender,text,time:document.getElementById('timeTxt').textContent});
  const ok=await saveInbox();
  btn.innerHTML='<i class="fa-solid fa-paper-plane"></i><span>إرسال السؤال لإدارة زاجل</span>';
  document.getElementById('qText').value='';
  if(ok)alert("✅ وصل سؤالك لإدارة زاجل بنجاح! سنجيب عليه في قسم الأسئلة الشائعة.");
  else alert("⚠️ تعذر الإرسال حالياً، يرجى المحاولة مرة أخرى.");
}

function renderInbox(){
  document.getElementById('qCount').textContent=inboxQs.length;
  document.getElementById('vCount').textContent=totalViews.toLocaleString('en-US');
  document.getElementById('inboxList').innerHTML=inboxQs.length?inboxQs.map(q=>`
    <div class="bg-white p-2.5 rounded-xl border border-purple-100 flex justify-between items-start gap-2">
      <div><b class="text-[#6B0F5B]">${q.sender} <span class="text-[10px] text-gray-400 font-normal">${q.time||''}</span>:</b> <p class="text-gray-700 mt-0.5">${q.text}</p></div>
      <div class="flex gap-1 shrink-0">
        <button onclick="replyQ('${q.text.replace(/'/g,"")}')" class="bg-purple-100 text-[#6B0F5B] px-2 py-1 rounded-lg font-bold">رد</button>
        <button onclick="delQ(${q.id})" class="bg-rose-50 text-rose-600 px-2 py-1 rounded-lg">✕</button>
      </div>
    </div>`).join(''):'<p class="text-gray-400 text-center py-2">لا توجد أسئلة واردة حتى الآن</p>';
  document.getElementById('adminArtList').innerHTML=(st.arts||[]).map((a,i)=>`
    <div class="bg-white p-2 rounded-lg border flex justify-between items-center"><span class="truncate font-bold">${a.t}</span><button onclick="delArt(${i})" class="text-rose-600 font-bold px-2">حذف</button></div>`).join('');
}

function replyQ(txt){document.getElementById('pTit').value=txt;document.getElementById('pBod').focus();}
async function delQ(id){inboxQs=inboxQs.filter(q=>q.id!==id);renderInbox();await saveInbox();}
async function delArt(idx){st.arts.splice(idx,1);renderInbox();renderAll();await syncCloud();}

function closeModal(id){document.getElementById(id).classList.add('hidden');}
function secretTap(){taps++;clearTimeout(tmr);tmr=setTimeout(()=>taps=0,2000);if(taps>=5){taps=0;document.getElementById('logM').classList.remove('hidden');}}
async function login(){
  if(document.getElementById('passIn').value.trim()===PASS){
    document.getElementById('passIn').value='';closeModal('logM');
    await loadCloud(); await loadInbox(false);
    document.getElementById('dBuy').value=st.b;document.getElementById('dSell').value=st.s;document.getElementById('dTick').value=st.tk;
    document.getElementById('stBankak').value=st.banks?.bankak||"ok";
    document.getElementById('stFawry').value=st.banks?.fawry||"ok";
    document.getElementById('stOkash').value=st.banks?.okash||"ok";
    renderInbox();
    document.getElementById('dashM').classList.remove('hidden');
  }else alert('كلمة المرور غير صحيحة');
}
async function saveR(){
  const btn=document.getElementById('btnSaveR'); btn.textContent="جاري الحفظ للجميع...";
  st.b=parseFloat(document.getElementById('dBuy').value)||st.b;
  st.s=parseFloat(document.getElementById('dSell').value)||st.s;
  st.tk=document.getElementById('dTick').value.trim()||st.tk;
  st.banks={bankak:document.getElementById('stBankak').value,fawry:document.getElementById('stFawry').value,okash:document.getElementById('stOkash').value};
  st.upd=document.getElementById('dateTxt').textContent+" • "+document.getElementById('timeTxt').textContent;
  renderAll();
  const ok=await syncCloud();
  btn.textContent="حفظ وتحديث وإرسال إشعار للجميع";
  if(ok){alert("✅ تم تحديث الأسعار والحالات لجميع المستخدمين بنجاح!");closeModal('dashM');}
  else{alert("⚠️ تعذر الاتصال بالسحابة حالياً، جرب الضغط مرة أخرى.");}
}
async function addArt(){
  const t=document.getElementById('pTit').value.trim(),b=document.getElementById('pBod').value.trim(),i=uploadedImgData||document.getElementById('pImg').value.trim();
  if(!t||!b)return;
  const btn=document.getElementById('btnAddArt'); btn.textContent="جاري النشر للجميع...";
  st.arts=st.arts||[]; st.arts.unshift({t,b,i});
  uploadedImgData=""; document.getElementById('imgLbl').textContent="اختر صورة توضيحية من جهازك (اختياري)";
  document.getElementById('pTit').value=''; document.getElementById('pBod').value=''; document.getElementById('pImg').value='';
  renderAll(); renderInbox();
  const ok=await syncCloud();
  btn.textContent="نشر السؤال والإجابة للجميع";
  if(ok){alert("✅ تم نشر السؤال والإجابة لجميع المستخدمين!");closeModal('dashM');}
}

function setupNativePWA(){
  const svgStr='<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 100 100"><rect width="100" height="100" rx="22" fill="#380734"/><path fill="#FFF" d="M18 14C28 31 46 31 58 41C64 46 64 53 57 59C61 50 56 41 43 37C30 34 22 28 18 14Z"/><path fill="#FFF" d="M23 34C34 42 49 39 57 47C51 45 40 48 31 46C26 44 24 39 23 34Z"/><path fill="#FFF" d="M28 77C30 61 38 51 59 47C59 56 53 62 43 65C34 67 30 71 28 77Z"/><path fill="#FFF" d="M58 30C63 22 72 22 78 27C81 27 83 28 85 30C79 29 74 31 71 38C69 43 69 48 68 53C68 44 65 35 58 30ZM65 29C68 28 71 29 75 28C72 26 68 26 65 29Z"/></svg>';
  const img=new Image();
  img.onload=()=>{
    const c=document.createElement('canvas'); c.width=512; c.height=512;
    c.getContext('2d').drawImage(img,0,0,512,512);
    const pngUrl=c.toDataURL('image/png');
    document.getElementById('appleIcon').href=pngUrl;
    const manifest={id:"/",name:"منصة زاجل للنشر",short_name:"زاجل",start_url:location.origin+"/",scope:location.origin+"/",display:"standalone",orientation:"portrait",background_color:"#380734",theme_color:"#380734",icons:[{src:pngUrl,sizes:"192x192",type:"image/png",purpose:"any"},{src:pngUrl,sizes:"512x512",type:"image/png",purpose:"any maskable"}]};
    document.getElementById('pwaManifest').href='data:application/manifest+json;charset=utf-8,'+encodeURIComponent(JSON.stringify(manifest));
  };
  img.src='data:image/svg+xml;utf8,'+encodeURIComponent(svgStr);
  if('serviceWorker' in navigator){navigator.serviceWorker.register('/sw.js').catch(()=>{});}
}
setupNativePWA();
window.addEventListener('beforeinstallprompt',e=>{e.preventDefault();deferredPrompt=e;});
function triggerInstall(){if(deferredPrompt){deferredPrompt.prompt();}else{document.getElementById('pwaM').classList.remove('hidden');}}

renderAll(); loadCloud(); loadInbox(true);
setInterval(()=>{loadCloud();if(!document.getElementById('dashM').classList.contains('hidden'))loadInbox(false);},12000);
