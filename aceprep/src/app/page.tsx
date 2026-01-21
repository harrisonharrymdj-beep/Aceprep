// app/page.tsx
import Link from "next/link";
import { Check, Code2, Sparkles, Zap, Shield, BookOpen, ArrowRight, Star } from "lucide-react";
import type { ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";

export default function Page() {
  return (
    <main className="min-h-screen bg-background text-foreground">
      <SiteHeader />

      {/* Hero */}
      <section className="mx-auto max-w-6xl px-4 pt-16 pb-10 sm:pt-20">
        <div className="grid gap-10 lg:grid-cols-2 lg:items-center">
          <div className="space-y-6">
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="secondary" className="rounded-full px-3 py-1">
                <Sparkles className="mr-1 h-3.5 w-3.5" />
                AcePrep — coding interview prep that actually sticks
              </Badge>
              <Badge variant="outline" className="rounded-full px-3 py-1">
                <Shield className="mr-1 h-3.5 w-3.5" />
                Built for focus
              </Badge>
            </div>

            <h1 className="text-4xl font-semibold tracking-tight sm:text-5xl">
              Practice smart. Get hired faster.
            </h1>

            <p className="text-lg text-muted-foreground">
              AcePrep turns messy LeetCode grinding into a clear plan: personalized drills, spaced repetition,
              and feedback that tells you exactly what to fix—so your next interview feels familiar.
            </p>

            <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
              <Button asChild size="lg" className="rounded-2xl">
                <Link href="/app">
                  Start prepping <ArrowRight className="ml-2 h-4 w-4" />
                </Link>
              </Button>
              <Button asChild variant="outline" size="lg" className="rounded-2xl">
                <Link href="#pricing">View pricing</Link>
              </Button>
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <div className="flex items-center">
                  {Array.from({ length: 5 }).map((_, i) => (
                    <Star key={i} className="h-4 w-4" />
                  ))}
                </div>
                <span>Built for serious students</span>
              </div>
            </div>

            <div className="flex flex-wrap gap-3 pt-2 text-sm text-muted-foreground">
              <div className="flex items-center gap-2">
                <Zap className="h-4 w-4" />
                Daily plan in 60 seconds
              </div>
              <div className="flex items-center gap-2">
                <Code2 className="h-4 w-4" />
                DSA + system design
              </div>
              <div className="flex items-center gap-2">
                <BookOpen className="h-4 w-4" />
                Study mode + mock mode
              </div>
            </div>
          </div>

          <HeroPreview />
        </div>
      </section>

      {/* Logos / Social proof strip */}
      <section className="mx-auto max-w-6xl px-4 pb-8">
        <Card className="rounded-3xl">
          <CardContent className="flex flex-col gap-4 p-6 sm:flex-row sm:items-center sm:justify-between">
            <div className="space-y-1">
              <p className="text-sm font-medium">What you get</p>
              <p className="text-sm text-muted-foreground">
                Structured prep, measurable progress, and fewer “I blanked” moments.
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Badge variant="secondary" className="rounded-full px-3 py-1">
                Daily plan
              </Badge>
              <Badge variant="secondary" className="rounded-full px-3 py-1">
                Weakness tracking
              </Badge>
              <Badge variant="secondary" className="rounded-full px-3 py-1">
                Spaced repetition
              </Badge>
              <Badge variant="secondary" className="rounded-full px-3 py-1">
                Mock interviews
              </Badge>
            </div>
          </CardContent>
        </Card>
      </section>

      {/* Features */}
      <section id="features" className="mx-auto max-w-6xl px-4 py-12">
        <div className="mb-8 space-y-2">
          <h2 className="text-3xl font-semibold tracking-tight">Everything you need to prep with confidence</h2>
          <p className="text-muted-foreground">
            Simple on the surface. Deep where it matters: patterns, recall, and execution.
          </p>
        </div>

        <div className="grid gap-5 md:grid-cols-2 lg:grid-cols-3">
          <FeatureCard
            icon={<Zap className="h-5 w-5" />}
            title="Daily plan that adapts"
            desc="Answer a quick check-in; AcePrep generates the most impactful next set."
          />
          <FeatureCard
            icon={<Sparkles className="h-5 w-5" />}
            title="Spaced repetition, automated"
            desc="Bring back old problems at the right time so you retain patterns."
          />
          <FeatureCard
            icon={<Code2 className="h-5 w-5" />}
            title="Solution feedback"
            desc="Get pinpoint guidance on complexity, edge cases, and cleaner approaches."
          />
          <FeatureCard
            icon={<BookOpen className="h-5 w-5" />}
            title="Study mode + mock mode"
            desc="Learn with hints, then switch to timed mocks with debriefs."
          />
          <FeatureCard
            icon={<Shield className="h-5 w-5" />}
            title="Progress you can trust"
            desc="Track mastery by topic, not just “problems solved.”"
          />
          <FeatureCard
            icon={<ArrowRight className="h-5 w-5" />}
            title="Interview-ready roadmap"
            desc="Weeks 1–2 fundamentals, weeks 3–4 patterns, weeks 5–6 mocks—adjusted to you."
          />
        </div>
      </section>

      {/* Pricing */}
      <section id="pricing" className="mx-auto max-w-6xl px-4 py-12">
        <div className="mb-8 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div className="space-y-2">
            <h2 className="text-3xl font-semibold tracking-tight">Pricing</h2>
            <p className="text-muted-foreground">Pick the plan that matches your timeline.</p>
          </div>
          <div className="text-sm text-muted-foreground">
            Cancel anytime. Upgrade/downgrade anytime.
          </div>
        </div>

        <div className="grid gap-5 lg:grid-cols-3">
          <PricingCard
            name="Starter"
            price="$19"
            cadence="/mo"
            blurb="For consistent practice and steady improvement."
            cta={{ label: "Start Starter", href: "/checkout?plan=starter" }}
            features={[
              "Personalized daily plan",
              "Topic mastery tracking",
              "Spaced repetition reviews",
              "Core DSA library",
            ]}
          />

          <PricingCard
            highlight
            name="Pro"
            price="$39"
            cadence="/mo"
            blurb="Best for interview season: drills + mocks + deeper feedback."
            cta={{ label: "Start Pro", href: "/checkout?plan=pro" }}
            features={[
              "Everything in Starter",
              "Timed mock interviews",
              "Deeper solution feedback",
              "Company-style problem sets",
              "System design prompts",
            ]}
            badge="Most popular"
          />

          <PricingCard
            name="Team"
            price="$99"
            cadence="/mo"
            blurb="For clubs, cohorts, and friend groups prepping together."
            cta={{ label: "Start Team", href: "/checkout?plan=team" }}
            features={[
              "Up to 5 seats",
              "Shared progress dashboard",
              "Weekly challenge packs",
              "Admin controls",
            ]}
          />
        </div>
      </section>

      {/* Testimonials */}
      <section className="mx-auto max-w-6xl px-4 py-12">
        <div className="mb-8 space-y-2">
          <h2 className="text-3xl font-semibold tracking-tight">Results-focused</h2>
          <p className="text-muted-foreground">Less grinding. More signal.</p>
        </div>

        <div className="grid gap-5 md:grid-cols-3">
          <Testimonial
            quote="The daily plan removed decision fatigue. I stopped jumping around and finally got consistent."
            name="Student"
            meta="CS junior"
          />
          <Testimonial
            quote="The reviews hit at the perfect time. Stuff I used to forget stayed locked in."
            name="New Grad"
            meta="Interviewing"
          />
          <Testimonial
            quote="Mock mode + debriefs made the real thing feel normal. Huge confidence boost."
            name="Career Switcher"
            meta="Bootcamp grad"
          />
        </div>
      </section>

      {/* FAQ */}
      <section id="faq" className="mx-auto max-w-6xl px-4 py-12">
        <div className="mb-8 space-y-2">
          <h2 className="text-3xl font-semibold tracking-tight">FAQ</h2>
          <p className="text-muted-foreground">Quick answers to common questions.</p>
        </div>

        <Card className="rounded-3xl">
          <CardContent className="p-2 sm:p-4">
            <Accordion type="single" collapsible className="w-full">
              <AccordionItem value="item-1">
                <AccordionTrigger className="px-3">How is this different from LeetCode?</AccordionTrigger>
                <AccordionContent className="px-3 text-muted-foreground">
                  AcePrep focuses on planning, recall, and execution. You get an adaptive plan, spaced repetition,
                  and feedback loops—so you improve faster than random problem-hopping.
                </AccordionContent>
              </AccordionItem>

              <AccordionItem value="item-2">
                <AccordionTrigger className="px-3">Do I need to be advanced?</AccordionTrigger>
                <AccordionContent className="px-3 text-muted-foreground">
                  Nope. The plan adapts to your level. Beginners build foundations; advanced users sharpen patterns and mocks.
                </AccordionContent>
              </AccordionItem>

              <AccordionItem value="item-3">
                <AccordionTrigger className="px-3">Can I cancel anytime?</AccordionTrigger>
                <AccordionContent className="px-3 text-muted-foreground">
                  Yes—cancel whenever. You’ll keep access until the end of your billing period.
                </AccordionContent>
              </AccordionItem>

              <AccordionItem value="item-4">
                <AccordionTrigger className="px-3">What languages are supported?</AccordionTrigger>
                <AccordionContent className="px-3 text-muted-foreground">
                  Start with your main interview language (Python/Java/C++/JavaScript). The platform is designed to expand,
                  but your plan and mocks should match the language you’ll interview in.
                </AccordionContent>
              </AccordionItem>
            </Accordion>
          </CardContent>
        </Card>
      </section>

      {/* CTA */}
      <section className="mx-auto max-w-6xl px-4 pb-16 pt-6">
        <Card className="rounded-3xl">
          <CardContent className="flex flex-col gap-6 p-8 sm:flex-row sm:items-center sm:justify-between">
            <div className="space-y-2">
              <h3 className="text-2xl font-semibold tracking-tight">Ready to start?</h3>
              <p className="text-muted-foreground">
                Get your plan, do today’s set, and keep building momentum.
              </p>
            </div>
            <div className="flex flex-col gap-3 sm:flex-row">
              <Button asChild size="lg" className="rounded-2xl">
                <Link href="/app">
                  Start now <ArrowRight className="ml-2 h-4 w-4" />
                </Link>
              </Button>
              <Button asChild variant="outline" size="lg" className="rounded-2xl">
                <Link href="#pricing">See plans</Link>
              </Button>
            </div>
          </CardContent>
        </Card>

        <Footer />
      </section>
    </main>
  );
}

function SiteHeader() {
  return (
    <header className="sticky top-0 z-40 border-b bg-background/70 backdrop-blur">
      <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3">
        <Link href="/" className="flex items-center gap-2">
          <div className="grid h-9 w-9 place-items-center rounded-2xl border">
            <Code2 className="h-5 w-5" />
          </div>
          <span className="text-sm font-semibold tracking-tight">AcePrep</span>
        </Link>

        <nav className="hidden items-center gap-6 sm:flex">
          <Link href="#features" className="text-sm text-muted-foreground hover:text-foreground">
            Features
          </Link>
          <Link href="#pricing" className="text-sm text-muted-foreground hover:text-foreground">
            Pricing
          </Link>
          <Link href="#faq" className="text-sm text-muted-foreground hover:text-foreground">
            FAQ
          </Link>
        </nav>

        <div className="flex items-center gap-2">
          <Button asChild variant="ghost" className="rounded-2xl">
            <Link href="/login">Log in</Link>
          </Button>
          <Button asChild className="rounded-2xl">
            <Link href="/app">Get started</Link>
          </Button>
        </div>
      </div>
    </header>
  );
}

function HeroPreview() {
  return (
    <Card className="rounded-3xl">
      <CardHeader>
        <CardTitle className="text-base">Your prep dashboard</CardTitle>
        <CardDescription>Today’s plan, progress, and next-best actions.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-2">
          <MiniStat label="Today" value="3 tasks" hint="~45–60 min" />
          <MiniStat label="Streak" value="7 days" hint="Consistency wins" />
        </div>

        <div className="rounded-3xl border p-4">
          <div className="flex items-center justify-between">
            <p className="text-sm font-medium">Today’s set</p>
            <Badge variant="secondary" className="rounded-full">
              Adaptive
            </Badge>
          </div>
          <div className="mt-3 space-y-3">
            <TaskRow title="2-pointer pattern drill" meta="Arrays • Medium • 12–15 min" />
            <TaskRow title="Binary search variants" meta="Search • Mixed • 15–20 min" />
            <TaskRow title="Timed mock (mini)" meta="Mock • 1 question • 15 min" />
          </div>
          <Separator className="my-4" />
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-sm text-muted-foreground">Next review: “Top K Elements” in 2 days</p>
            <Button asChild size="sm" className="rounded-2xl">
              <Link href="/app">
                Start now <ArrowRight className="ml-2 h-4 w-4" />
              </Link>
            </Button>

          </div>
        </div>

        <div className="grid gap-3 sm:grid-cols-3">
          <Chip label="Weakness" value="Graphs" />
          <Chip label="Strong" value="Sliding Window" />
          <Chip label="Focus" value="DP basics" />
        </div>
      </CardContent>
    </Card>
  );
}

function MiniStat({ label, value, hint }: { label: string; value: string; hint: string }) {
  return (
    <div className="rounded-3xl border p-4">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="mt-1 text-xl font-semibold">{value}</p>
      <p className="mt-1 text-xs text-muted-foreground">{hint}</p>
    </div>
  );
}

function TaskRow({ title, meta }: { title: string; meta: string }) {
  return (
    <div className="flex items-start gap-3">
      <div className="mt-0.5 grid h-6 w-6 place-items-center rounded-2xl border">
        <Check className="h-4 w-4" />
      </div>
      <div className="min-w-0">
        <p className="text-sm font-medium">{title}</p>
        <p className="text-xs text-muted-foreground">{meta}</p>
      </div>
    </div>
  );
}

function Chip({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-3xl border p-4">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="mt-1 text-sm font-medium">{value}</p>
    </div>
  );
}

function FeatureCard({ icon, title, desc }: { icon: ReactNode; title: string; desc: string }) {
  return (
    <Card className="rounded-3xl">
      <CardHeader className="space-y-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-2xl border">{icon}</div>
        <CardTitle className="text-base">{title}</CardTitle>
        <CardDescription>{desc}</CardDescription>
      </CardHeader>
    </Card>
  );
}

function PricingCard({
  name,
  price,
  cadence,
  blurb,
  features,
  cta,
  highlight,
  badge,
}: {
  name: string;
  price: string;
  cadence: string;
  blurb: string;
  features: string[];
  cta: { label: string; href: string };
  highlight?: boolean;
  badge?: string;
}) {
  return (
    <Card className={`rounded-3xl ${highlight ? "border-foreground/30 shadow-sm" : ""}`}>
      <CardHeader className="space-y-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base">{name}</CardTitle>
          {badge ? <Badge className="rounded-full">{badge}</Badge> : null}
        </div>
        <div className="flex items-baseline gap-2">
          <span className="text-4xl font-semibold tracking-tight">{price}</span>
          <span className="text-sm text-muted-foreground">{cadence}</span>
        </div>
        <CardDescription>{blurb}</CardDescription>
      </CardHeader>

      <CardContent className="space-y-5">
        <Button asChild className="w-full rounded-2xl" variant={highlight ? "default" : "outline"}>
          <Link href={cta.href}>{cta.label}</Link>
        </Button>

        <ul className="space-y-2">
          {features.map((f) => (
            <li key={f} className="flex items-start gap-2 text-sm">
              <Check className="mt-0.5 h-4 w-4" />
              <span className="text-muted-foreground">{f}</span>
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}

function Testimonial({ quote, name, meta }: { quote: string; name: string; meta: string }) {
  return (
    <Card className="rounded-3xl">
      <CardContent className="space-y-3 p-6">
        <p className="text-sm leading-relaxed">“{quote}”</p>
        <Separator />
        <div className="flex items-center justify-between">
          <p className="text-sm font-medium">{name}</p>
          <p className="text-xs text-muted-foreground">{meta}</p>
        </div>
      </CardContent>
    </Card>
  );
}

function Footer() {
  return (
    <footer className="mx-auto mt-10 max-w-6xl px-1">
      <div className="flex flex-col gap-6 rounded-3xl border p-6 sm:flex-row sm:items-center sm:justify-between">
        <div className="space-y-1">
          <p className="text-sm font-semibold">AcePrep</p>
          <p className="text-xs text-muted-foreground">
            Build the habits. Master the patterns. Walk into interviews calm.
          </p>
        </div>

        <div className="flex flex-wrap gap-3 text-sm">
          <Link href="/terms" className="text-muted-foreground hover:text-foreground">
            Terms
          </Link>
          <Link href="/privacy" className="text-muted-foreground hover:text-foreground">
            Privacy
          </Link>
          <Link href="/support" className="text-muted-foreground hover:text-foreground">
            Support
          </Link>
        </div>
      </div>

      <p className="py-6 text-center text-xs text-muted-foreground">
        © {new Date().getFullYear()} AcePrep. All rights reserved.
      </p>
    </footer>
  );
}
