"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { DashboardView } from "@/components/dashboard/DashboardView";
import { DocumentCard, type DocumentStat } from "@/components/dashboard/DocumentCard";
import { Skeleton } from "@/components/ui/Skeleton";

type SpaceDetail = {
  space: { id: string; name: string; isDefault: boolean };
  documents: DocumentStat[];
};

export default function SpaceDetailPage() {
  const params = useParams<{ id: string }>();
  const [detail, setDetail] = useState<SpaceDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setDetail(null);
    setNotFound(false);

    fetch(`/api/spaces/${params.id}`)
      .then(async (res) => {
        if (!res.ok) {
          if (!cancelled) setNotFound(true);
          return null;
        }
        return res.json();
      })
      .then((json) => {
        if (!cancelled && json) setDetail(json);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [params.id]);

  if (notFound) {
    return <p className="text-sm text-danger">This space could not be found.</p>;
  }

  if (loading || !detail) {
    return (
      <div className="flex flex-col gap-4">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-40 w-full" />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-8">
      <DashboardView
        analyticsUrl={`/api/spaces/${params.id}/analytics`}
        quizFetchUrl={`/api/spaces/${params.id}/quizzes/daily`}
        quizRegenerateUrl={`/api/spaces/${params.id}/quizzes/daily/regenerate`}
        showDailyRecall={false}
        title={detail.space.name}
        subtitle="Space dashboard"
        newDocumentHref={`/documents/new?spaceId=${params.id}`}
      />

      <div>
        <h2 className="mb-4 font-display text-xl italic tracking-tight">All documents in this space</h2>
        {detail.documents.length === 0 ? (
          <p className="text-sm text-muted">No documents in this space yet.</p>
        ) : (
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            {detail.documents.map((document) => (
              <DocumentCard key={document.id} document={document} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

