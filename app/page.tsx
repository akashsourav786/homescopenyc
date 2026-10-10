import { Container } from "@/components/container";
import { Card } from "@/components/ui/card";
import { ToolRow } from "@/components/tool-row";
import { TOOLS } from "@/lib/nav";

/**
 * Homepage — mirrors the approved reference home screen:
 * bold headline, short subtext, stacked tool rows, and a
 * "Built by" card with an AR monogram (never a fake photo).
 *
 * Still Stage 1 scope: every tool links to its labeled placeholder route.
 */
export default function HomePage() {
  return (
    <Container className="max-w-2xl">
      {/* ---------- Hero ---------- */}
      <section className="pt-8 sm:pt-12">
        <h1 className="text-[32px] font-extrabold leading-[1.15] tracking-tight sm:text-4xl">
          Smarter tools
          <br />
          for your next move.
        </h1>
        <p className="mt-3 max-w-md text-[15px] leading-relaxed text-muted">
          Free, easy-to-use tools to help New Yorkers buy, sell, and research
          with confidence.
        </p>
      </section>

      {/* ---------- Tool rows ---------- */}
      <section aria-label="Tools" className="mt-6">
        <ul className="grid gap-3 sm:grid-cols-2">
          {TOOLS.map((tool) => (
            <li key={tool.title}>
              <ToolRow tool={tool} />
            </li>
          ))}
        </ul>
      </section>

      {/* ---------- Built by ---------- */}
      <section aria-label="About the creator" className="mt-6 pb-12 sm:pb-16">
        <Card className="flex items-center gap-4 p-5">
          <span
            aria-hidden
            className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-pastel-lavender text-lg font-bold text-pastel-lavender-ink"
          >
            AR
          </span>
          <div className="min-w-0">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-muted">
              Built by
            </p>
            <p className="mt-0.5 text-[15px] font-bold tracking-tight">
              Akash Rahman
            </p>
            <p className="mt-0.5 text-[13px] leading-snug text-muted">
              NY Licensed Real Estate Salesperson · EXIT Realty DKC
            </p>
          </div>
        </Card>
      </section>
    </Container>
  );
}
