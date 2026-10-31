import type { Metadata } from "next";
import { PageTour } from "@/components/page-tours";
import EmployeesClient from "@/components/employees-client";

export const metadata: Metadata = { title: "الموظفون والعقود | نظام الحوكمة والامتثال" };

export default function EmployeesPage() {
  return (
    <>
      <EmployeesClient />
      <PageTour page="employees" />
    </>
  );
}
