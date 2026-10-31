import type { Metadata } from "next";
import { PageTour } from "@/components/page-tours";
import CompaniesClient from "@/components/companies-client";

export const metadata: Metadata = { title: "الشركات والأقسام | نظام الحوكمة والامتثال" };

export default function CompaniesPage() {
  return (
    <>
      <CompaniesClient />
      <PageTour page="companies" />
    </>
  );
}
