import type { Metadata } from "next";
import { PageTour } from "@/components/page-tours";
import ImportClient from "@/components/import-client";

export const metadata: Metadata = { title: "استيراد البيانات | نظام الحوكمة والامتثال" };

export default function ImportPage() {
  return (
    <>
      <ImportClient />
      <PageTour page="import" />
    </>
  );
}
