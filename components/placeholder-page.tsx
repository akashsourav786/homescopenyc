import Link from "next/link";
import { Hammer } from "lucide-react";
import { Container } from "@/components/container";
import { Card, CardContent, CardDescription, CardTitle } from "@/components/ui/card";

/**
 * Shared placeholder page used by all Stage 1 routes that are
 * scheduled for later stages. Clearly labeled — never fake functionality.
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
    <Container className="py-10 sm:py-14">
      <Card className="mx-auto max-w-xl p-8 text-center sm:p-10">
        <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-pastel-lavender">
          <Hammer className="h-7 w-7 text-foreground" aria-hidden />
        </span>
        <CardTitle className="mt-5 text-2xl">{title}</CardTitle>
        <CardDescription className="mx-auto mt-3 max-w-md text-[15px] leading-relaxed">
          {description}
        </CardDescription>
        <CardContent className="mt-6 flex flex-col items-center gap-3 p-0">
          <span className="inline-flex items-center rounded-full bg-accent-soft px-4 py-1.5 text-[13px] font-semibold text-foreground">
            Coming in {stage}
          </span>
          <Link
            href="/"
            className="text-sm font-semibold text-accent underline-offset-4 hover:underline"
          >
            Back to home
          </Link>
        </CardContent>
      </Card>
    </Container>
  );
}
