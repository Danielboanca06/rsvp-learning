import Link from "next/link";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { ZapIcon } from "@/components/ui/icons";

export function UpgradePrompt({ message }: { message: string }) {
  return (
    <Card className="flex flex-col items-center gap-3 py-10 text-center">
      <span className="flex h-12 w-12 items-center justify-center rounded-full bg-accent-soft text-accent">
        <ZapIcon />
      </span>
      <p className="font-medium">{message}</p>
      <Link href="/billing" className="mt-2 w-auto">
        <Button className="w-auto px-8">View plans</Button>
      </Link>
    </Card>
  );
}
