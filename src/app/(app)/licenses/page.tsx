import type { Metadata } from "next";
import { PageTour } from "@/components/page-tours";
import LicensesClient from "@/components/licenses-client";

export const metadata: Metadata = { title: "التراخيص | نظام الحوكمة والامتثال" };

export default function LicensesPage() {
  return (
    <>
      <LicensesClient />
      <PageTour page="licenses" />
    </>
  );
}
