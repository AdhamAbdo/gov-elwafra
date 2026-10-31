import type { Metadata } from "next";
import { PageTour } from "@/components/page-tours";
import NotificationsClient from "@/components/notifications-client";

export const metadata: Metadata = { title: "الإشعارات | نظام الحوكمة والامتثال" };

export default function NotificationsPage() {
  return (
    <>
      <NotificationsClient />
      <PageTour page="notifications" />
    </>
  );
}
