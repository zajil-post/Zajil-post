(() => {
  "use strict";
  const endpoint = "/api/zajil";
  const appNames = { bankak: "بنكك", fawry: "فوري", okash: "أوكاش" };
  const statusNames = { working: "يعمل", unstable: "متذبذب / بطيء", down: "متوقف" };
  let publicReports = [];
  let adminReports = [];
  let lastSubmit = 0;
  const toast = (message, type = "ok") => {
    if (typeof showToast === "function") showToast(message, type);
  };
  const reportTime = value => {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? "وقت غير معروف" :
      date.toLocaleString("ar-EG", { timeZone: "Africa/Khartoum", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
  };
  async function loadPublicReports() {
    const box = document.getElementById("bankCommunityReports");
    if (!box) return;
    try {
      const response = await fetch(endpoint + "?action=bank_reports&t=" + Date.now(), { cache: "no-store", signal: AbortSignal.timeout(8000) });
      if (!response.ok) throw new Error("load");
      const data = await response.json();
      publicReports = Array.isArray(data.reports) ? data.reports : [];
      renderPublicReports();
    } catch {
      box.textContent = "تعذر تحميل البلاغات المعتمدة حالياً.";
    }
  }
  function renderPublicReports() {
    const box = document.getElementById("bankCommunityReports");
    if (!box) return;
    box.textContent = "";
    if (!publicReports.length) {
      box.textContent = "لا توجد بلاغات معتمدة حديثاً.";
      return;
    }
    publicReports.slice(0, 5).forEach(report => {
      const row = document.createElement("div");
      row.className = "rounded-xl bg-purple-50/70 border border-purple-100 p-2";
      const title = document.createElement("div");
      title.className = "font-bold text-[11px] text-[#4A1246]";
      title.textContent = (appNames[report.app] || "تطبيق مصرفي") + " — " + (statusNames[report.reportedStatus] || "بلاغ");
      const meta = document.createElement("div");
      meta.className = "text-[10px] text-gray-500 mt-0.5";
      meta.textContent = "بلاغ متابع • " + reportTime(report.reviewedAt || report.submittedAt) + " • ليس فحصاً مصرفياً مباشراً";
      row.append(title, meta);
      if (report.note) {
        const note = document.createElement("p");
        note.className = "text-[11px] mt-1 break-words";
        note.textContent = String(report.note);
        row.appendChild(note);
      }
      box.appendChild(row);
    });
  }
  async function submitReport() {
    const button = document.querySelector('[data-action="submitBankReport"]');
    if (!button) return;
    if (Date.now() - lastSubmit < 45000) return toast("يرجى الانتظار قليلاً قبل إرسال بلاغ آخر", "warn");
    const app = document.getElementById("bankReportApp")?.value || "";
    const reportedStatus = document.getElementById("bankReportStatus")?.value || "";
    const note = (document.getElementById("bankReportNote")?.value || "").trim().slice(0, 300);
    button.disabled = true;
    button.textContent = "جاري إرسال البلاغ...";
    try {
      const response = await fetch(endpoint + "?action=bank_report", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ app, reportedStatus, note })
      });
      if (response.status === 429) throw new Error("rate");
      if (!response.ok) throw new Error("send");
      lastSubmit = Date.now();
      document.getElementById("bankReportNote").value = "";
      toast("وصل البلاغ؛ سيظهر بعد مراجعة إدارة زاجل.");
    } catch (error) {
      toast(error.message === "rate" ? "تم تجاوز حد البلاغات مؤقتاً؛ حاول لاحقاً." : "تعذر إرسال البلاغ حالياً؛ حاول مرة أخرى.", "err");
    } finally {
      button.disabled = false;
      button.textContent = "إرسال البلاغ للمراجعة";
    }
  }
  async function loadAdminReports() {
    const box = document.getElementById("bankReportsAdminList");
    if (!box || !adminToken) return;
    box.textContent = "جاري تحميل البلاغات...";
    try {
      const response = await fetch(endpoint + "?action=bank_reports_admin&t=" + Date.now(), {
        cache: "no-store",
        headers: { Authorization: "Bearer " + adminToken }
      });
      if (response.status === 401 || response.status === 403) {
        adminToken = "";
        throw new Error("auth");
      }
      if (!response.ok) throw new Error("load");
      const data = await response.json();
      adminReports = Array.isArray(data.reports) ? data.reports : [];
      renderAdminReports();
    } catch (error) {
      box.textContent = error.message === "auth" ? "انتهت جلسة الإدارة؛ سجّل الدخول مجدداً." : "تعذر تحميل البلاغات.";
    }
  }
  function renderAdminReports() {
    const box = document.getElementById("bankReportsAdminList");
    if (!box) return;
    box.textContent = "";
    if (!adminReports.length) {
      box.textContent = "لا توجد بلاغات حالياً.";
      return;
    }
    const fragment = document.createDocumentFragment();
    adminReports.forEach(report => {
      const row = document.createElement("div");
      row.className = "bg-white border rounded-xl p-2.5 space-y-1.5";
      const title = document.createElement("div");
      title.className = "font-bold";
      title.textContent = (appNames[report.app] || "تطبيق مصرفي") + " — " + (statusNames[report.reportedStatus] || "بلاغ");
      const meta = document.createElement("div");
      meta.className = "text-[10px] text-gray-500";
      meta.textContent = reportTime(report.submittedAt) + " • " + ({ pending: "بانتظار المراجعة", approved: "معتمد", rejected: "مرفوض" }[report.reviewStatus] || "غير معروف");
      row.append(title, meta);
      if (report.note) {
        const note = document.createElement("p");
        note.className = "break-words text-gray-700";
        note.textContent = String(report.note);
        row.appendChild(note);
      }
      if (report.reviewStatus === "pending") {
        const actions = document.createElement("div");
        actions.className = "flex gap-2 pt-1";
        [["approved", "اعتماد ونشر", "bg-emerald-600"], ["rejected", "رفض", "bg-rose-600"]].forEach(([decision, label, color]) => {
          const button = document.createElement("button");
          button.className = color + " text-white rounded-lg px-3 py-1.5 font-bold";
          button.textContent = label;
          button.dataset.bankReview = "1";
          button.dataset.reportId = report.id;
          button.dataset.decision = decision;
          actions.appendChild(button);
        });
        row.appendChild(actions);
      }
      fragment.appendChild(row);
    });
    box.appendChild(fragment);
  }
  async function reviewReport(id, decision) {
    if (!adminToken) return toast("سجّل الدخول إلى الإدارة أولاً", "warn");
    try {
      const response = await fetch(endpoint + "?action=bank_reports_admin", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: "Bearer " + adminToken },
        body: JSON.stringify({ id, decision })
      });
      if (response.status === 401 || response.status === 403) {
        adminToken = "";
        throw new Error("auth");
      }
      if (!response.ok) throw new Error("review");
      toast(decision === "approved" ? "تم اعتماد البلاغ ونشره." : "تم رفض البلاغ.");
      await loadAdminReports();
      await loadPublicReports();
    } catch (error) {
      toast(error.message === "auth" ? "انتهت جلسة الإدارة؛ سجّل الدخول مجدداً." : "تعذر حفظ قرار المراجعة.", "err");
    }
  }
  document.addEventListener("click", event => {
    const control = event.target.closest("[data-action], [data-bank-review]");
    if (!control) return;
    if (control.dataset.action === "submitBankReport") submitReport();
    if (control.dataset.action === "loadBankReportsAdmin") loadAdminReports();
    if (control.dataset.bankReview === "1") reviewReport(control.dataset.reportId, control.dataset.decision);
  });
  const dashboard = document.getElementById("dashM");
  if (dashboard && "MutationObserver" in window) {
    new MutationObserver(() => {
      if (!dashboard.classList.contains("hidden") && adminToken) loadAdminReports();
    }).observe(dashboard, { attributes: true, attributeFilter: ["class"] });
  }
  loadPublicReports();
  setInterval(loadPublicReports, 180000);
})();