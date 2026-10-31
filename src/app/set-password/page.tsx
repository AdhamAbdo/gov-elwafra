import type { Metadata } from "next";
import SetPasswordClient from "@/components/set-password-client";

export const metadata: Metadata = { title: "تعيين كلمة المرور | نظام الحوكمة والامتثال" };

export default function SetPasswordPage() {
  return <SetPasswordClient />;
}
