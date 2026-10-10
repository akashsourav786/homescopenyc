import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { Card, CardContent, CardDescription, CardTitle } from "./ui/card";
import { cn } from "@/lib/utils";
import type { ToolDef } from "@/lib/nav";

/**
 * Homepage tool navigation card: pastel icon tile, title, description,
 * and a link affordance. Entire card is a link.
 */
export function ToolCard({ tool }: { tool: ToolDef }) {
  const Icon = tool.icon;
  return (
    <Link
      href={tool.href}
      className="group block h-full rounded-2xl focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
    >
      <Card className="flex h-full flex-col p-6 transition-all group-hover:-translate-y-0.5 group-hover:shadow-md">
        <span
          className={cn(
            "flex h-12 w-12 items-center justify-center rounded-2xl",
            tool.tile,
          )}
        >
          <Icon className="h-6 w-6" aria-hidden />
        </span>
        <CardTitle className="mt-4">{tool.title}</CardTitle>
        <CardDescription className="mt-2 flex-1 leading-relaxed">
          {tool.description}
        </CardDescription>
        <CardContent className="mt-4 flex items-center gap-1.5 p-0 text-sm font-semibold text-accent">
          Open tool
          <ArrowRight
            className="h-4 w-4 transition-transform group-hover:translate-x-0.5"
            aria-hidden
          />
        </CardContent>
      </Card>
    </Link>
  );
}
