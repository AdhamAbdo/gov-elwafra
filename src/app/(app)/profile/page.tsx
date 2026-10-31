import type { Metadata } from "next";
import ProfileClient from "@/components/profile-client";

export const metadata: Metadata = { title: "الملف الشخصي | نظام الحوكمة والامتثال" };

export default function ProfilePage() {
  return <ProfileClient />;
}
