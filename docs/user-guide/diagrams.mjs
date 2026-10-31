// SVG diagrams for the user guide, drawn in the application's palette. Flows run right-to-left (the document is Arabic).
// NOTE: the <svg> is direction="rtl", so text-anchor "start" is the RIGHT edge and "end" the LEFT edge.
const F = "Tajawal, sans-serif";
const T = {
  dark: { fill: "url(#dk)", stroke: "#0c4b45", text: "#ffffff", sub: "#b7d6d2" },
  teal: { fill: "#e6f1ef", stroke: "#9cc9c3", text: "#0c4b45", sub: "#3f6f69" },
  green: { fill: "#e7f6ec", stroke: "#7cc79a", text: "#166534", sub: "#3f7a58" },
  blue: { fill: "#e0efff", stroke: "#8fb8f2", text: "#1d4ed8", sub: "#4a72b8" },
  amber: { fill: "#fef3c7", stroke: "#f2c867", text: "#92400e", sub: "#a8651f" },
  red: { fill: "#fee2e2", stroke: "#f0a3a3", text: "#b91c1c", sub: "#b05a5a" },
  gray: { fill: "#eef2f6", stroke: "#c3cdd8", text: "#475569", sub: "#6b7a89" },
};
const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;");
const defs = `<defs>
<linearGradient id="dk" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#103b38"/><stop offset=".6" stop-color="#0c4b45"/><stop offset="1" stop-color="#0f766e"/></linearGradient>
<marker id="ar" viewBox="0 0 10 10" refX="8.5" refY="5" markerWidth="7" markerHeight="7" orient="auto"><path d="M0 0L10 5L0 10z" fill="#0f766e"/></marker>
<marker id="arg" viewBox="0 0 10 10" refX="8.5" refY="5" markerWidth="7" markerHeight="7" orient="auto"><path d="M0 0L10 5L0 10z" fill="#8a97a6"/></marker>
</defs>`;

export const svg = (w, h, inner) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" font-family="${F}" direction="rtl" role="img">${defs}${inner}</svg>`;

/** Rounded box with one bold line and optional smaller lines, centred. */
const box = (x, y, w, h, lines, tone = "teal", { dashed = false, size = 13.5 } = {}) => {
  const t = T[tone]; const arr = Array.isArray(lines) ? lines : [lines];
  const n = arr.length; const step = 17; const y0 = y + h / 2 - ((n - 1) * step) / 2 + 4.5;
  const text = arr.map((l, i) => `<text x="${x + w / 2}" y="${y0 + i * step}" text-anchor="middle" font-size="${i === 0 ? size : 10.5}" font-weight="${i === 0 ? 700 : 400}" fill="${i === 0 ? t.text : t.sub}">${esc(l)}</text>`).join("");
  return `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="14" fill="${t.fill}" stroke="${t.stroke}" stroke-width="1.6"${dashed ? ' stroke-dasharray="6 4"' : ""}/>${text}`;
};
const badge = (cx, cy, n) => `<circle cx="${cx}" cy="${cy}" r="11" fill="#0c4b45"/><text x="${cx}" y="${cy + 4.5}" text-anchor="middle" font-size="12" font-weight="700" fill="#5eead4">${n}</text>`;
/** Arrow along a path (M/L/H/V commands as a string). */
const edge = (d, { dashed = false, gray = false } = {}) => `<path d="${d}" fill="none" stroke="${gray ? "#8a97a6" : "#0f766e"}" stroke-width="2" stroke-linejoin="round"${dashed ? ' stroke-dasharray="6 4"' : ""} marker-end="url(#${gray ? "arg" : "ar"})"/>`;
const line = (d) => `<path d="${d}" fill="none" stroke="#0f766e" stroke-width="2" stroke-linejoin="round"/>`;
const label = (x, y, s, { size = 11, color = "#0c4b45", weight = 500 } = {}) => `<text x="${x}" y="${y}" text-anchor="middle" font-size="${size}" font-weight="${weight}" fill="${color}" stroke="#f8fafc" stroke-width="5" paint-order="stroke" stroke-linejoin="round">${esc(s)}</text>`;

export const diagrams = {
  // Weekly inspection cycle: from the scheduler to the review decision and its consequences.
  cycle: () => svg(760, 470, [
    box(590, 14, 150, 62, ["المجدول", "الأحد 00:05 بتوقيت الرياض"], "dark"),
    box(400, 14, 150, 62, ["مهام الأسبوع", "مهمة لكل التزام نشط"], "blue"),
    box(210, 14, 150, 62, ["تسجيل النتيجة", "مسؤول الامتثال أو أعلى"], "green"),
    box(20, 14, 150, 62, ["المراجعة", "مدير آخر غير المُرسِل"], "amber"),
    edge("M590 45 H552"), edge("M400 45 H362"), edge("M210 45 H172"),
    box(20, 150, 150, 62, ["اعتماد", "تصبح النتيجة نهائية"], "green"),
    box(210, 150, 150, 62, ["إعادة للتصحيح", "سبب الإعادة مطلوب"], "amber"),
    box(400, 150, 150, 62, ["تصعيد", "للمتابعة الإدارية"], "red"),
    line("M95 76 V113 H475"), edge("M95 113 V148"), edge("M320 113 V148"), edge("M475 113 V148"),
    edge("M250 150 V78", { dashed: true }), label(250, 118, "يصحّح ويُعيد الإرسال", { size: 10, color: "#92400e" }),
    box(20, 272, 150, 62, ["ممتثل", "تُحتسب في نسبة الامتثال"], "green"),
    box(210, 272, 150, 62, ["يتطلب إجراء", "يستلزم إجراءً تصحيحياً"], "red"),
    box(400, 272, 150, 62, ["غير منطبق", "تُستبعد من المقام"], "gray"),
    line("M95 212 V243 H475"), edge("M95 243 V270"), edge("M285 243 V270"), edge("M475 243 V270"),
    label(600, 238, "حسب نتيجة الفحص المعتمدة", { size: 10.5, color: "#475569" }),
    box(210, 392, 150, 58, ["الإجراء التصحيحي", "انظر الفصل السادس"], "dark"),
    edge("M285 334 V390"),
  ].join("")),

  // Corrective action lifecycle (assigning an owner does not change the status; returning from verification sets "in progress").
  action: () => svg(760, 330, [
    box(590, 30, 150, 64, ["مفتوح", "جديد، وله مالك بعد الإسناد"], "blue"),
    box(305, 30, 150, 64, ["بانتظار التحقق", "المالك أنهى العمل"], "amber"),
    box(20, 30, 150, 64, ["تم الحل", "أُغلق بتحقق مستقل"], "green"),
    edge("M590 62 H457"), label(523, 52, "المالك يطلب التحقق", { size: 10.5 }),
    edge("M305 62 H172"), label(238, 52, "مدير آخر يغلقه", { size: 10.5 }),
    box(305, 200, 150, 64, ["قيد التنفيذ", "أعاده المدير للعمل"], "blue"),
    edge("M355 94 V198", { dashed: true }), label(355, 150, "يعيده المدير", { size: 10.5, color: "#92400e" }), label(355, 164, "مع ذكر السبب", { size: 10.5, color: "#92400e" }),
    edge("M405 200 V96", { dashed: true }), label(432, 150, "المالك يطلب", { size: 10.5 }), label(432, 164, "التحقق من جديد", { size: 10.5 }),
    box(590, 200, 150, 64, ["متأخر", "فات الاستحقاق قبل الإغلاق"], "red"),
    edge("M665 94 V198", { dashed: true }), label(665, 146, "يُوسَم تلقائياً يومياً", { size: 10.5, color: "#b91c1c" }),
    `<text x="665" y="284" text-anchor="middle" font-size="10.5" fill="#475569">ويمكن لمالكه طلب التحقق منه</text>`,
    `<text x="380" y="312" text-anchor="middle" font-size="10.5" fill="#475569">الإسناد يحدّد المالك والموعد فقط ولا يغيّر الحالة، ولا يُطلب التحقق إلا من المالك المُسنَد إليه</text>`,
  ].join("")),

  // How the compliance rate is built (illustrative numbers).
  pct: () => {
    const parts = [["ممتثل ومعتمد", 52, "#15a36b", "#fff"], ["بانتظار المراجعة", 16, "#f5a524", "#3b2a05"], ["يتطلب إجراء", 12, "#dc4a4a", "#fff"], ["غير متحقق", 14, "#9aa8b5", "#fff"], ["غير منطبق", 6, "#d6dde5", "#475569"]];
    let x = 740; const bars = []; const legend = [];
    parts.forEach(([name, v, fill, tx], i) => {
      const w = (v / 100) * 720; x -= w;
      bars.push(`<rect x="${x}" y="40" width="${w}" height="46" ${i === 0 ? 'rx="10"' : ""} fill="${fill}" stroke="#f8fafc" stroke-width="2"/><text x="${x + w / 2}" y="69" text-anchor="middle" font-size="15" font-weight="700" fill="${tx}">${v}</text>`);
      legend.push(`<circle cx="${735 - i * 146}" cy="118" r="6" fill="${fill}"/><text x="${725 - i * 146}" y="122" text-anchor="start" font-size="11.5" fill="#334155">${name}</text>`);
    });
    return svg(760, 270, [
      `<text x="740" y="26" text-anchor="start" font-size="12" font-weight="700" fill="#0c4b45">مثال: 100 مهمة في دورة واحدة</text>`,
      bars.join(""), legend.join(""),
      box(385, 150, 355, 98, ["نسبة الامتثال المعتمد", "= ممتثل ومعتمد ÷ (إجمالي المهام − غير المنطبق المعتمد)", "52 ÷ (100 − 6) = 55.3%"], "green"),
      box(20, 150, 345, 98, ["نسبة إنجاز الفحص", "= مهام لها نتيجة مرسلة ÷ إجمالي المهام", "بلا نتيجة = غير متحقق، ولا يُحتسب ممتثلاً أبداً"], "blue"),
    ].join(""));
  },

  // License expiry timeline with the notification thresholds.
  license: () => {
    const segs = [[550, 190, "#e7f6ec", "#166534", "سارية"], [430, 120, "#e0efff", "#1d4ed8", "90 ← 61 يوماً"], [310, 120, "#fdeeb5", "#92400e", "60 ← 31 يوماً"], [190, 120, "#f6c453", "#5a3a05", "30 ← 8 أيام"], [100, 90, "#f2a3a3", "#7f1d1d", "7 ← 0 أيام"], [20, 80, "#b91c1c", "#ffffff", "منتهية"]];
    const marks = [[550, "90 يوماً"], [430, "60 يوماً"], [310, "30 يوماً"], [190, "7 أيام"], [100, "تاريخ الانتهاء"]];
    return svg(760, 250, [
      segs.map(([x, w, f, t, s]) => `<rect x="${x}" y="90" width="${w}" height="46" fill="${f}" stroke="#f8fafc" stroke-width="2"/><text x="${x + w / 2}" y="118" text-anchor="middle" font-size="12" font-weight="700" fill="${t}">${s}</text>`).join(""),
      marks.map(([x, s]) => `<line x1="${x}" y1="78" x2="${x}" y2="90" stroke="#0c4b45" stroke-width="2"/><circle cx="${x}" cy="72" r="5" fill="#0c4b45"/><text x="${x}" y="54" text-anchor="middle" font-size="11.5" font-weight="700" fill="#0c4b45">${s}</text>`).join(""),
      [550, 430, 310, 190].map((x) => `<circle cx="${x}" cy="168" r="13" fill="#0c4b45"/><path d="M${x - 5} 171 h10 M${x - 4} 171 c0 -7 1 -9 4 -9 s4 2 4 9" stroke="#5eead4" stroke-width="1.6" fill="none" stroke-linecap="round"/><circle cx="${x}" cy="174.5" r="1.4" fill="#5eead4"/>`).join(""),
      `<text x="740" y="172" text-anchor="start" font-size="11.5" fill="#334155">إشعار عند كل عتبة</text>`,
      edge("M740 224 H22"), `<text x="380" y="214" text-anchor="middle" font-size="11.5" fill="#475569">الزمن: اقتراب تاريخ الانتهاء</text>`,
    ].join(""));
  },

  // Renewal states for licenses.
  renewal: () => svg(760, 210, [
    box(590, 20, 150, 66, ["بلا تجديد", "الحالة الابتدائية"], "gray"),
    box(305, 20, 150, 66, ["التجديد جارٍ", "«متابعة التجديد»"], "blue"),
    box(20, 20, 150, 66, ["تم التجديد", "ترخيص جديد مرتبط"], "green"),
    edge("M590 53 H457"), label(523, 44, "يبدأ التجديد", { size: 10.5 }),
    edge("M305 53 H172"), label(238, 44, "تسجيل الترخيص المجدَّد", { size: 10.5 }),
    box(20, 124, 400, 56, ["الترخيص القديم يبقى سجلاً تاريخياً", "لا يُصدر إنذارات انتهاء بعد التجديد"], "teal", { dashed: true }),
    edge("M95 86 V122", { gray: true }),
  ].join("")),

  // Contract expiry timeline.
  contract: () => {
    const segs = [[560, 180, "#e7f6ec", "#166534", "ساري"], [440, 120, "#e0efff", "#1d4ed8", "30 ← 15 يوماً"], [330, 110, "#fdeeb5", "#92400e", "14 ← 8 أيام"], [220, 110, "#f6c453", "#5a3a05", "7 أيام ← 24 ساعة"], [110, 110, "#f2a3a3", "#7f1d1d", "حرج: أقل من 24 ساعة"], [20, 90, "#b91c1c", "#ffffff", "منتهٍ"]];
    const marks = [[560, "30 يوماً"], [440, "14 يوماً"], [330, "7 أيام"], [220, "24 ساعة"], [110, "تاريخ الانتهاء"]];
    return svg(760, 190, [
      segs.map(([x, w, f, t, s]) => `<rect x="${x}" y="70" width="${w}" height="46" fill="${f}" stroke="#f8fafc" stroke-width="2"/><text x="${x + w / 2}" y="98" text-anchor="middle" font-size="11.5" font-weight="700" fill="${t}">${s}</text>`).join(""),
      marks.map(([x, s]) => `<line x1="${x}" y1="58" x2="${x}" y2="70" stroke="#0c4b45" stroke-width="2"/><circle cx="${x}" cy="52" r="5" fill="#0c4b45"/><text x="${x}" y="34" text-anchor="middle" font-size="11.5" font-weight="700" fill="#0c4b45">${s}</text>`).join(""),
      `<text x="740" y="152" text-anchor="start" font-size="11.5" fill="#334155">عقد بلا تاريخ انتهاء: «بدون تاريخ انتهاء» ولا يُنذر. عقد جُدِّد: سجل تاريخي لا يُنذر.</text>`,
      `<text x="740" y="172" text-anchor="start" font-size="11.5" fill="#334155">العتبات الافتراضية 30 و14 و7 أيام، ويغيّرها مسؤول النظام من صفحة الإشعارات.</text>`,
    ].join(""));
  },

  // Resignation / termination process.
  event: () => svg(760, 320, [
    box(600, 30, 140, 60, ["مقدَّمة", "سُجّل الطلب"], "blue"),
    box(410, 30, 140, 60, ["قيد المراجعة", "تتم المتابعة"], "blue"),
    box(220, 30, 140, 60, ["فترة الإشعار", "قبل السريان"], "blue"),
    box(30, 30, 140, 60, ["مكتملة", "تاريخ السريان الفعلي"], "green"),
    edge("M600 60 H552"), edge("M410 60 H362"), edge("M220 60 H172"),
    box(30, 140, 190, 62, ["تتغير حالة الموظف", "عند تأكيد المدير لتاريخ السريان"], "teal", { dashed: true }),
    edge("M100 90 V138", { gray: true }),
    line("M670 90 V168"), line("M480 90 V168"), line("M290 90 V168"), line("M290 168 H670"),
    edge("M545 168 V222", { dashed: true }), edge("M355 168 V222", { dashed: true }),
    box(480, 224, 130, 56, ["سُحبت", "تراجع صاحب الطلب"], "gray"),
    box(290, 224, 130, 56, ["مرفوضة", "لم يُقبل الطلب"], "red"),
    label(580, 160, "أو", { size: 11, color: "#475569" }),
  ].join("")),

  // Government platform verification.
  platform: () => svg(760, 350, [
    box(590, 14, 150, 62, ["١. تحقق يدوي", "على المنصة الرسمية"], "dark"),
    box(400, 14, 150, 62, ["٢. سجّل التحقق", "المنصة والشركة والدليل"], "blue"),
    box(210, 14, 150, 62, ["٣. حدّد النتيجة", "كما ظهرت في المنصة"], "teal"),
    edge("M590 45 H552"), edge("M400 45 H362"),
    box(400, 150, 150, 62, ["لا توجد مشكلة", "يكفي تسجيله"], "green"),
    box(210, 150, 150, 62, ["توجد مشكلة", "ملاحظات + إجراء + موعد"], "red"),
    box(20, 150, 150, 62, ["تعذر التحقق", "اذكر السبب"], "gray"),
    line("M285 76 V113 H475"), edge("M475 113 V148"), edge("M285 113 V148"), edge("M95 113 H285"), edge("M95 113 V148"),
    box(210, 240, 150, 52, ["إغلاق المتابعة", "عند إتمام الإجراء"], "amber"),
    edge("M285 212 V238", { dashed: true }),
    box(20, 304, 720, 38, ["السجل لا يُعدَّل أبداً: يُصحَّح الخطأ بتسجيل تحقق جديد"], "teal"),
  ].join("")),

  // Data import steps.
  import: () => svg(760, 210, [
    [["اختر النوع والشركة", "تراخيص أو موظفون", "blue"], ["ارفع ملف CSV", "حتى 1000 صف و2 ميغابايت", "blue"], ["اربط الأعمدة", "تلقائي ويمكن تعديله", "blue"], ["راجع المعاينة", "جاهز / مكرر / غير صالح", "amber"], ["أكّد الاستيراد", "يُحفظ الجاهز فقط", "green"]]
      .map(([a, b, tone], i) => { const x = 615 - i * 150; return box(x, 40, 130, 74, [a, b], tone, { size: 12.5 }) + badge(x + 118, 40, i + 1) + (i < 4 ? edge(`M${x} 77 H${x - 18}`) : ""); }).join(""),
    box(20, 148, 720, 42, ["قبل التأكيد لا يُحفظ أي شيء. ويُسجَّل كل استيراد في «سجل عمليات الاستيراد» بما أُضيف وما تُخطّي وسبب كل تخطٍّ."], "teal", { size: 12 }),
  ].join("")),

  // Company structure.
  structure: () => svg(760, 330, [
    box(280, 14, 200, 60, ["الشركة", "وحدة التنظيم والصلاحيات"], "dark"),
    line("M380 74 V108 H667"), line("M380 108 H92"),
    [["الأقسام", "تتبع الشركة", "blue"], ["المستخدمون", "أدوار على الشركة", "amber"], ["الالتزامات", "وفحوص أسبوعية", "green"], ["التراخيص والعقود", "والموظفون", "teal"], ["المنصات الحكومية", "سجلات تحقق يدوية", "gray"]]
      .map(([a, b, tone], i) => { const x = 600 - i * 145; return edge(`M${x + 67} 108 V138`) + box(x, 140, 135, 64, [a, b], tone, { size: 12.5 }); }).join(""),
    [["يمكن ربط عنصر بقسم", "أو بالشركة كلها"], ["ويمكن حصر وصول المستخدم", "بأقسام محددة"], ["يبدأ كل التزام", "بمهمة أسبوعية"], ["تُنذر عند اقتراب", "تواريخ الانتهاء"], ["خمس منصات وأكثر", "قوى والتأمينات ومدد…"]]
      .map(([a, b], i) => { const x = 600 - i * 145; return `<text x="${x + 67}" y="232" text-anchor="middle" font-size="10.5" fill="#475569">${a}</text><text x="${x + 67}" y="248" text-anchor="middle" font-size="10.5" fill="#475569">${b}</text>`; }).join(""),
    box(20, 272, 720, 44, ["الحذف غير مُتاح في النظام: تُعطَّل الشركات والأقسام بسبب موثّق، وتبقى سجلاتها للتدقيق."], "teal", { size: 12 }),
  ].join("")),

  // Notifications.
  notify: () => svg(760, 330, [
    `<rect x="500" y="14" width="240" height="304" rx="14" fill="#e6f1ef" stroke="#9cc9c3" stroke-width="1.6"/><text x="620" y="42" text-anchor="middle" font-size="13.5" font-weight="700" fill="#0c4b45">الأحداث التي تُولِّد إشعارات</text>` +
      ["اقتراب انتهاء ترخيص", "اقتراب انتهاء عقد", "موعد حرج", "فحص أسبوعي مستحق", "فحص متأخر", "استقالة أو إنهاء خدمة جديد", "مراجعة معادة", "نتيجة مصعّدة", "إجراء تصحيحي قريب الاستحقاق", "إجراء تصحيحي متأخر"]
        .map((s, i) => `<circle cx="722" cy="${68 + i * 24}" r="3.5" fill="#0f766e"/><text x="712" y="${72 + i * 24}" text-anchor="start" font-size="11.5" fill="#0c4b45">${s}</text>`).join(""),
    edge("M500 166 H462"),
    box(270, 126, 190, 80, ["إشعار مجدول", "بمفتاح فريد يمنع التكرار"], "dark"),
    line("M270 166 H235"), line("M235 80 V252"), edge("M235 80 H202"), edge("M235 252 H202"),
    box(20, 40, 180, 80, ["الجرس وصفحة الإشعارات", "داخل النظام دائماً"], "green"),
    box(20, 212, 180, 80, ["بريد إلكتروني (اختياري)", "عنوان ورابط فقط"], "amber"),
  ].join("")),

  // First sign-in.
  signin: () => svg(760, 150, [
    [["١. الدعوة", "مسؤول النظام يدعو بالبريد", "amber"], ["٢. فتح الرابط", "رابط الدعوة أو الاستعادة", "blue"], ["٣. كلمة المرور", "10 أحرف: حروف وأرقام", "blue"], ["٤. الدخول", "لوحة بحسب دورك", "green"]]
      .map(([a, b, tone], i) => { const x = 605 - i * 195; return box(x, 36, 135, 74, [a, b], tone, { size: 13 }) + (i < 3 ? edge(`M${x} 73 H${x - 58}`) : ""); }).join(""),
  ].join("")),
};
