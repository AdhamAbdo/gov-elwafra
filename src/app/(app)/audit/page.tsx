import type { Metadata } from "next";
import { PageTour } from "@/components/page-tours";
import AuditClient from "@/components/audit-client";

export const metadata: Metadata = { title: "سجل التدقيق | نظام الحوكمة والامتثال" };

export default function AuditPage() {
  return (
    <>
      <AuditClient />
      <PageTour page="audit" />
    </>
  );
}
