// Turns raw audit before/after payloads into readable rows. Unknown keys and values are shown as-is rather than hidden.

const FIELD: Record<string, string> = {
  status: "الحالة", reason: "السبب", note: "ملاحظة", notes: "ملاحظات", name: "الاسم", legal_name: "الاسم القانوني", type: "النوع", authority: "الجهة", role: "الدور",
  branch_id: "القسم", check_id: "نتيجة التفتيش", owner: "المسؤول", due_at: "تاريخ الاستحقاق", expiry_date: "تاريخ الانتهاء", previous_expiry: "الانتهاء السابق", previous_license_id: "الترخيص السابق",
  verified_status: "حالة التحقق", verification_status: "حالة التحقق", in_progress: "التجديد جارٍ", next_action: "الإجراء التالي", evidence_required: "الدليل مطلوب", weekly_required: "فحص أسبوعي",
  employee_id: "الموظف", employee_code: "الرمز الوظيفي", ends_at: "نهاية العقد", previous_ends_at: "النهاية السابقة", previous_contract_id: "العقد السابق", process_status: "حالة الإجراء",
  actual_effective_at: "تاريخ السريان الفعلي", employment_status: "حالة العمل", outcome: "النتيجة", platform: "المنصة", key: "الإعداد", values: "القيم", email_domain: "نطاق البريد",
  active: "نشط", result: "النتيجة", user_id: "المستخدم", message: "الرسالة", title: "العنوان",
};
const ACTION: Record<string, string> = {
  inspection_submitted: "إرسال نتيجة تفتيش", review_approved: "اعتماد نتيجة", review_returned: "إرجاع نتيجة للتصحيح", review_escalated: "تصعيد نتيجة",
  compliance_item_created: "إنشاء التزام", corrective_action_created: "إنشاء إجراء تصحيحي", corrective_action_assigned: "إسناد إجراء تصحيحي", corrective_action_verification_requested: "طلب التحقق من إجراء",
  corrective_action_resolved: "إغلاق إجراء تصحيحي", corrective_action_returned: "إعادة إجراء للتنفيذ", license_created: "إضافة ترخيص", license_verified: "تحقق من ترخيص", license_renewal_progress: "تحديث متابعة التجديد",
  license_renewed: "تسجيل ترخيص مجدَّد", employee_created: "إضافة موظف", contract_created: "إضافة عقد", contract_verified: "تحقق من عقد", contract_renewed: "تسجيل عقد مجدَّد",
  employee_event_recorded: "تسجيل استقالة / إنهاء", employee_event_updated: "تحديث إجراء استقالة / إنهاء", employee_event_completed: "تأكيد انتهاء الخدمة",
  company_created: "إضافة شركة", company_updated: "تعديل شركة", company_activated: "تفعيل شركة", company_deactivated: "تعطيل شركة", branch_created: "إضافة قسم", branch_updated: "تعديل قسم", branch_activated: "تفعيل قسم", branch_deactivated: "تعطيل قسم",
  platform_verification_recorded: "تسجيل تحقق من منصة حكومية", platform_follow_up_closed: "إغلاق متابعة منصة", notification_thresholds_changed: "تعديل حدود التنبيه", notification_job_failed: "فشل مهمة الإشعارات",
  user_created: "دعوة مستخدم", profile_updated: "تعديل الملف الشخصي", user_activated: "تفعيل مستخدم", user_deactivated: "تعطيل مستخدم", role_assigned: "منح دور", role_removed: "إزالة دور", branch_access_granted: "منح وصول لقسم", branch_access_revoked: "سحب وصول قسم",
};
const ENTITY: Record<string, string> = {
  compliance_check: "نتيجة تفتيش", compliance_item: "التزام", corrective_action: "إجراء تصحيحي", license: "ترخيص", employee: "موظف", contract: "عقد", employee_event: "استقالة / إنهاء",
  company: "شركة", branch: "قسم", platform_verification: "تحقق منصة", user: "مستخدم", notification_setting: "إعداد إشعارات", scheduler_run: "تشغيل مجدول",
};
const VALUE: Record<string, string> = {
  compliant: "ممتثل", action_required: "يتطلب إجراء", not_verified: "لم يتم التحقق", not_applicable: "غير منطبق", approved: "معتمد", returned: "معاد للتصحيح", escalated: "مصعّد", pending_review: "بانتظار المراجعة",
  open: "مفتوح", in_progress: "قيد التنفيذ", pending_verification: "بانتظار التحقق", resolved: "تم الحل", overdue: "متأخر",
  verified_valid: "تم التحقق: سارية", verified_invalid: "تم التحقق: غير صالحة", verified: "تم التحقق", discrepancy: "توجد فروقات",
  none: "لا يوجد", renewed: "تم التجديد", active: "نشط", on_leave: "في إجازة", resigned: "استقال", terminated: "أُنهيت خدمته", inactive: "غير نشط", expired: "منتهي",
  submitted: "مقدَّمة", under_review: "قيد المراجعة", notice_period: "فترة الإشعار", completed: "مكتملة", withdrawn: "سُحبت", rejected: "مرفوضة", resignation: "استقالة", termination: "إنهاء خدمة",
  no_issue: "لا توجد مشكلة", issue_found: "توجد مشكلة", unable_to_verify: "تعذر التحقق",
  system_administrator: "مسؤول النظام", general_manager: "المدير العام", company_manager: "مدير شركة", compliance_officer: "مسؤول امتثال", read_only: "اطلاع فقط",
  low: "منخفضة", medium: "متوسطة", high: "مرتفعة", critical: "حرجة",
  qiwa: "قوى", gosi: "التأمينات الاجتماعية", mudad: "مدد", nitaqat: "نطاقات", balady: "بلدي", sfda: "الغذاء والدواء", civil_defense: "الدفاع المدني",
  license_thresholds_days: "حدود تنبيه التراخيص (أيام)", contract_thresholds_days: "حدود تنبيه العقود (أيام)", action_due_days: "تنبيه الإجراءات التصحيحية (أيام)",
};

export const actionLabel = (action: string): string | null => ACTION[action] ?? null;
export const entityOptions: [string, string][] = Object.entries(ENTITY);
export const entityLabel = (type: string): string => ENTITY[type] ?? type;
export const fieldLabel = (key: string): string => FIELD[key] ?? key.replace(/_/g, " ");

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ISO = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/;
const DATE = /^\d{4}-\d{2}-\d{2}$/;

/** A single value as readable text. Dates are shown in Asia/Riyadh; ids are shortened (the full id stays in the row's entity column). */
export function formatValue(value: unknown, names?: ReadonlyMap<string, string>): string {
  if (value === null || value === undefined || value === "") return "—";
  if (typeof value === "boolean") return value ? "نعم" : "لا";
  if (typeof value === "number") return String(value);
  if (typeof value === "string") {
    if (UUID.test(value)) return names?.get(value) ?? `…${value.slice(-8)}`;
    if (ISO.test(value) && !Number.isNaN(Date.parse(value))) return new Date(value).toLocaleString("en-GB", { timeZone: "Asia/Riyadh" });
    if (DATE.test(value)) return new Date(`${value}T00:00:00Z`).toLocaleDateString("en-GB", { timeZone: "UTC" });
    return VALUE[value] ?? value;
  }
  if (Array.isArray(value)) return value.length ? value.map((v) => formatValue(v, names)).join("، ") : "—";
  if (typeof value === "object") return Object.entries(value as Record<string, unknown>).map(([k, v]) => `${fieldLabel(k)}: ${formatValue(v, names)}`).join("؛ ");
  return String(value);
}

export type DetailRow = { field: string; before: string | null; after: string | null };
const asRecord = (v: unknown): Record<string, unknown> => (v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : v === null || v === undefined ? {} : { value: v });

/** Rows for the details view: one per field present in either payload. `before`/`after` are null when that side did not contain the field. */
export function auditDetailRows(before: unknown, after: unknown, names?: ReadonlyMap<string, string>): DetailRow[] {
  const b = asRecord(before), a = asRecord(after);
  const keys = [...new Set([...Object.keys(b), ...Object.keys(a)])];
  return keys.map((k) => ({ field: fieldLabel(k), before: k in b ? formatValue(b[k], names) : null, after: k in a ? formatValue(a[k], names) : null }));
}
