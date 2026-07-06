import Link from "next/link";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { ProgressBar } from "@/components/ui/ProgressBar";
import { Skeleton } from "@/components/ui/Skeleton";
import { cn } from "@/lib/cn";
import { ArrowRightIcon, CheckIcon, FileTextIcon } from "@/components/ui/icons";

export type DocumentStat = {
  id: string;
  title: string;
  createdAt: string;
  totalChunks: number;
  masteredChunks: number;
  masteryPct: number;
  attemptCount: number;
  averageScore: number | null;
};

export function DocumentCard({ document }: { document: DocumentStat }) {
  const mastered = document.totalChunks > 0 && document.masteryPct === 100;

  return (
    <Card
      className={cn(
        "flex h-full flex-col gap-4 transition-shadow duration-200 hover:shadow-lg",
        mastered && "border-success/30"
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <span
            className={cn(
              "mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg",
              mastered ? "bg-success-soft text-success" : "bg-accent-soft text-accent"
            )}
          >
            <FileTextIcon />
          </span>
          <div>
            <p className="font-medium leading-tight">{document.title}</p>
            <p className="mt-1 text-xs text-muted">
              {document.totalChunks} modules · {document.attemptCount} attempts
              {document.averageScore !== null ? ` · avg score ${document.averageScore}` : ""}
            </p>
          </div>
        </div>
        {mastered && (
          <span className="flex shrink-0 items-center gap-1 whitespace-nowrap rounded-full bg-success-soft px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-success">
            <CheckIcon className="h-3 w-3" />
            Mastered
          </span>
        )}
      </div>
      <div>
        <div className="mb-1.5 flex items-center justify-between text-xs text-muted">
          <span>Mastery</span>
          <span>{document.masteryPct}%</span>
        </div>
        <ProgressBar value={document.masteryPct} className={cn(mastered && "bg-success")} />
      </div>
      <Link href={`/documents/${document.id}`} className="mt-auto w-auto">
        <Button variant="secondary" icon={<ArrowRightIcon />} className="w-auto px-6">
          {mastered ? "Review" : "Continue"}
        </Button>
      </Link>
    </Card>
  );
}

export function DocumentCardSkeleton() {
  return (
    <Card className="flex flex-col gap-4">
      <div className="flex items-center gap-3">
        <Skeleton className="h-8 w-8 rounded-lg" />
        <div className="flex-1">
          <Skeleton className="h-4 w-2/3" />
          <Skeleton className="mt-2 h-3 w-1/3" />
        </div>
      </div>
      <Skeleton className="h-2 w-full rounded-full" />
      <Skeleton className="h-12 w-full rounded-xl" />
    </Card>
  );
}
