import DashboardClient from "@/components/dashboard-client";
import MainPageTour from "@/components/main-page-tour";
import OverviewClient from "@/components/overview-client";

export default function Home() {
  return (
    <>
      <OverviewClient />
      <DashboardClient />
      <MainPageTour />
    </>
  );
}
