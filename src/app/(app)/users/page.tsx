import type { Metadata } from "next";
import { PageTour } from "@/components/page-tours";
import UsersClient from "@/components/users-client";

export const metadata: Metadata = { title: "المستخدمون والصلاحيات | نظام الحوكمة والامتثال" };

export default function UsersPage() {
  return (
    <>
      <UsersClient />
      <PageTour page="users" />
    </>
  );
}
