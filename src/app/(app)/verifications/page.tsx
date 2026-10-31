import type { Metadata } from "next";
import { PageTour } from "@/components/page-tours";
import VerificationsClient from "@/components/verifications-client";

export const metadata: Metadata = { title: "المنصات الحكومية | نظام الحوكمة والامتثال" };

export default function VerificationsPage() {
  return (
    <>
      <VerificationsClient />
      <PageTour page="verifications" />
    </>
  );
}
