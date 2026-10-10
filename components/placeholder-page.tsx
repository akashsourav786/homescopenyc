import Link from "next/link";
import { Hammer } from "lucide-react";
import { Container } from "@/components/container";
import { Card } from "@/components/ui/card";

/**
 * Shared placeholder page used by all routes scheduled for later stages.
 * Clearly labeled — never fake functionality.
 */
export function PlaceholderPage({
  title,
  stage,
  description,
}: {
  title: string;
  stage: string;
  description: string;
}) {
  return (
    <Container className="max-w-xl">
      <div className="py-10 sm:py-14">
        <Card className="p-8 text-center sm:p-10">
          <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-pastel-lavender text-pastel-lavender-ink">
            <Hammer className="h-6 w-6" aria-hidden />
          </span>
          <h1 className="mt-5 text-2xl font-extrabold tracking-tight">
            {title}
          </h1>
          <p className="mx-auto mt-3 max-w-md text-[15px] leading-relaxed text-muted">
            {description}
          </p>
          <div className="mt-6 flex flex-col items-center gap-4">
            <span className="inline-flex items-center rounded-full bg-accent-soft px-4 py-1.5 text-[13px] font-semibold text-foreground">
              Coming in {stage}
            </span>
            <Link
              href="/"
              className="rounded-lg px-2 py-2 text-sm font-semibold text-accent underline-offset-4 hover:underline"
            >
              Back to home
            </Link>
          </div>
        </Card>
      </div>
    </Container>
  );
}
