import type { Metadata } from "next";
import { Tajawal } from "next/font/google";
import type { ReactNode } from "react";
import "./globals.css";

const tajawal = Tajawal({ subsets: ["arabic", "latin"], weight: ["400", "500", "700"], display: "swap", variable: "--font-tajawal" });

export const metadata: Metadata = {
  title: "نظام الحوكمة والامتثال",
  description: "Governance & Compliance Management System",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="ar" dir="rtl" className={`${tajawal.variable} h-full`}>
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
