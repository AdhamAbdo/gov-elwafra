"use client";

import { GuidedTour, type TourStep } from "@/components/guided-tour";

// Every step describes something that exists on this page today. Selectors point at `data-tour` attributes added to those elements.
// Pose choice: the avatar points toward the highlighted element, so each step lists a pose for pointing left, right and up.
const STEPS: TourStep[] = [
  { id: "welcome", title: "أهلاً بك في نظام الحوكمة والامتثال", body: "أنا مرشدك في هذه الجولة القصيرة. سأعرّفك على لوحة الإدارة العامة وأهم أقسامها وأزرارها خطوة بخطوة. يمكنك إغلاق الجولة في أي وقت وإعادتها متى شئت.", poses: { none: "welcome" } },
  { id: "page-title", target: '[data-tour="page-title"]', title: "لوحة الإدارة العامة", body: "هذه صفحتك الرئيسية. تعرض نتائج الفحص الأسبوعي والتراخيص والعقود والإجراءات التصحيحية ضمن صلاحياتك، وكل رقم فيها مأخوذ من السجلات الفعلية في النظام.", poses: { up: "pointUp", right: "pointRight", left: "pointLeft", none: "welcome" } },
  { id: "sidebar", target: '[data-tour="sidebar"]', title: "القائمة الرئيسية", body: "تنقّل من هنا بين أقسام النظام، مثل التراخيص والشركات والأقسام والموظفين والعقود والمنصات الحكومية. تظهر الأقسام التي تناسب صلاحياتك فقط.", poses: { right: "pointRightProfile", left: "presentLeft", up: "pointUpBack", none: "presentRight" } },
  { id: "bell", target: '[data-tour="bell"]', title: "الإشعارات", body: "تصلك هنا تنبيهات المواعيد والمهام والمراجعات داخل النظام، ويُظهر الرقم الأحمر عدد الإشعارات غير المقروءة.", poses: { left: "pointLeftFront", right: "pointRightBack", up: "pointUpBack", none: "presentRight" } },
  { id: "user-menu", target: '[data-tour="user-menu"]', title: "حسابك", body: "يعرض اسمك ودورك في النظام. من هذه القائمة تفتح الإشعارات وتسجّل خروجك عند الانتهاء.", poses: { left: "pointLeftWide", right: "pointRight", up: "pointUp", none: "presentRight" } },
  { id: "filters", target: '[data-tour="filters"]', title: "المرشحات", body: "اختر الدورة الأسبوعية والفترة الزمنية، ثم صفِّ حسب الشركة أو القسم أو الفئة أو الجهة أو حالة الامتثال أو مسؤول المهمة. تتأثر بها معظم المؤشرات والرسوم أدناه.", poses: { up: "pointUpBack", right: "pointRightBack", left: "pointLeftBack", none: "presentRight" } },
  { id: "kpis", target: '[data-tour="kpis"]', title: "المؤشرات الرئيسية", body: "تلخّص نسبة إنجاز الفحص ونسبة الامتثال المعتمد، وعدد الالتزامات التي تتطلب إجراءً أو لم يُتحقق منها أو تنتظر المراجعة، إضافة إلى المهام المتأخرة والتراخيص والعقود والاستقالات والإجراءات التصحيحية المفتوحة. أي التزام لم يُتحقق منه لا يُحتسب ممتثلاً أبداً.", poses: { up: "pointUp", right: "tabletPresentRight", left: "tabletPointLeft", none: "presentRight" } },
  { id: "company-chart", target: '[data-tour="company-chart"]', title: "مقارنة الشركات", body: "رسم بياني يبيّن لكل شركة عدد المهام حسب حالتها: ممتثل ومعتمد، أو بانتظار المراجعة، أو يتطلب إجراءً، أو غير متحقق منه. ويمكنك فتح «عرض الجدول» لقراءة الأرقام نفسها.", poses: { up: "pointUp", right: "presentRightProfile", left: "presentLeft", none: "presentRight" } },
  { id: "trend-chart", target: '[data-tour="trend-chart"]', title: "الاتجاه الأسبوعي", body: "يتتبّع نسبة الإنجاز ونسبة الامتثال المعتمد عبر الدورات السابقة من السجلات الفعلية. الأسبوع الذي لا توجد فيه مهام يظهر فراغاً ولا يُحتسب صفراً.", poses: { up: "pointUpBack", right: "pointRight", left: "pointLeftFront", none: "presentRight" } },
  { id: "branch-table", target: '[data-tour="branch-table"]', title: "مقارنة الأقسام", body: "جدول يقارن الأقسام في الدورة المختارة: عدد المهام، والممتثل منها، وما يتطلب إجراءً، وغير المتحقق منه، مع نسبة الامتثال المعتمد لكل قسم.", poses: { up: "pointUp", right: "pointRightProfile", left: "pointLeftWide", none: "presentRight" } },
  { id: "add-obligation", target: '[data-tour="add-obligation"]', title: "إضافة التزام", body: "من هذا الزر تضيف التزاماً جديداً إلى سجل الامتثال بتحديد الشركة والقسم واسم الالتزام وفئته. وتُنفَّذ الإضافة وفق صلاحياتك.", poses: { left: "pointLeft", right: "pointRight", up: "pointUp", none: "presentRight" } },
  { id: "tasks-table", target: '[data-tour="tasks-table"]', title: "مهام التفتيش الحالية", body: "قائمة العمل الأسبوعية: لكل التزام نتيجته وحالة مراجعته ومستوى مخاطره. من أيقونات الإجراءات تسجّل نتيجة الفحص أو تراجعها أو تنشئ إجراءً تصحيحياً أو ترفق ملفات الإثبات، بحسب صلاحياتك.", poses: { up: "pointUpBack", right: "tabletPresentRight", left: "tabletPointLeft", none: "presentRight" } },
  { id: "actions-table", target: '[data-tour="actions-table"]', title: "الإجراءات التصحيحية", body: "تابع هنا الإجراءات التصحيحية: المسؤول والأولوية وتاريخ الاستحقاق والحالة. يطلب المسؤول التحقق بعد الإنجاز، ويتحقق شخص آخر مخوَّل قبل إغلاق الإجراء.", poses: { up: "pointUp", right: "pointRightProfile", left: "pointLeftWide", none: "presentRight" } },
  { id: "finish", title: "انتهت الجولة", body: "بهذا تعرّفت على أهم ما في الصفحة الرئيسية. يمكنك إعادة الجولة في أي وقت من زر «جولة تعريفية». بالتوفيق!", poses: { none: "thumbsUp" } },
];

/** Main page only. Not mounted anywhere else yet. */
export default function MainPageTour() {
  return <GuidedTour steps={STEPS} />;
}
