import { auth } from "@clerk/nextjs/server";
import { DashboardView } from "@/components/dashboard/DashboardView";
import { LandingPage } from "@/components/marketing/LandingPage";

export default async function HomePage() {
  const { userId } = await auth();

  if (!userId) {
    return <LandingPage />;
  }

  return (
    <DashboardView
      analyticsUrl="/api/analytics"
      quizFetchUrl="/api/quizzes/daily"
      quizRegenerateUrl="/api/quizzes/daily/regenerate"
      showDailyRecall
      showSpaces
      showCourses
      title="Dashboard"
      subtitle="Track mastery across every document you've studied."
      newDocumentHref="/documents/new"
    />
  );
}
