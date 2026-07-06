"use client";

import { DashboardView } from "@/components/dashboard/DashboardView";

export default function DashboardPage() {
  return (
    <DashboardView
      analyticsUrl="/api/analytics"
      quizFetchUrl="/api/quizzes/daily"
      quizRegenerateUrl="/api/quizzes/daily/regenerate"
      showDailyRecall
      title="Dashboard"
      subtitle="Track mastery across every document you've studied."
      newDocumentHref="/documents/new"
    />
  );
}
