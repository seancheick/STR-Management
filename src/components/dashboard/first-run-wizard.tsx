import type { Route } from "next";
import Link from "next/link";
import { Building2, CalendarDays, CheckCircle2, Users } from "lucide-react";

type Step = {
  done: boolean;
  icon: typeof Building2;
  title: string;
  body: string;
  cta: string;
  href: Route;
};

type FirstRunWizardProps = {
  firstName: string;
  steps: {
    hasProperty: boolean;
    hasCalendarSource: boolean;
    hasCleaner: boolean;
  };
};

export function FirstRunWizard({ firstName, steps }: FirstRunWizardProps) {
  const list: Step[] = [
    {
      done: steps.hasProperty,
      icon: Building2,
      title: "Add your first property",
      body: "The home, condo, or unit guests are staying in. You can add more later.",
      cta: "Add a property",
      href: "/dashboard/properties/new" as Route,
    },
    {
      done: steps.hasCalendarSource,
      icon: CalendarDays,
      title: "Connect your Airbnb calendar",
      body: "Paste the iCal URL from Airbnb → Calendar → Export. We'll create cleaning jobs automatically from every checkout.",
      cta: steps.hasProperty ? "Connect iCal" : "Waiting on a property",
      href: "/dashboard/calendar" as Route,
    },
    {
      done: steps.hasCleaner,
      icon: Users,
      title: "Invite your first cleaner",
      body: "They'll get a magic-link email and land straight on their jobs screen.",
      cta: "Invite a cleaner",
      href: "/dashboard/team" as Route,
    },
  ];

  const completed = list.filter((s) => s.done).length;

  return (
    <main className="mx-auto flex min-h-[80vh] max-w-3xl flex-col justify-center gap-10 px-6 py-16">
      <header className="space-y-3">
        <p className="text-xs font-medium uppercase tracking-[0.3em] text-muted-foreground">
          Welcome, {firstName}
        </p>
        <h1 className="text-4xl font-semibold leading-tight tracking-tight sm:text-5xl">
          Let&apos;s get your operation set up.
        </h1>
        <p className="max-w-xl text-base leading-7 text-muted-foreground">
          Three quick steps. You can run the whole turnover flow from this portal —
          bookings synced from Airbnb, cleaners dispatched automatically, proof
          captured before a unit is marked ready.
        </p>
      </header>

      <ol className="flex flex-col gap-5">
        {list.map((step, i) => {
          const Icon = step.icon;
          return (
            <li
              className={`flex items-start gap-4 rounded-[1.75rem] border px-6 py-5 transition ${
                step.done
                  ? "border-green-200 bg-green-50"
                  : i === completed
                    ? "border-primary/30 bg-card shadow-sm"
                    : "border-border/60 bg-card/60"
              }`}
              key={step.title}
            >
              <div
                className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full ${
                  step.done
                    ? "bg-green-100 text-green-700"
                    : "bg-primary/10 text-primary"
                }`}
              >
                {step.done ? (
                  <CheckCircle2 className="h-5 w-5" aria-hidden="true" />
                ) : (
                  <Icon className="h-5 w-5" aria-hidden="true" />
                )}
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                  Step {i + 1}
                </p>
                <h2 className="mt-0.5 text-lg font-semibold leading-snug">
                  {step.title}
                </h2>
                <p className="mt-1 text-sm leading-6 text-muted-foreground">
                  {step.body}
                </p>
              </div>
              {!step.done && (
                <Link
                  aria-disabled={i !== completed}
                  className={`inline-flex h-10 shrink-0 items-center gap-2 self-center rounded-full px-5 text-sm font-semibold transition ${
                    i === completed
                      ? "bg-primary text-[#f7f5ef] hover:opacity-90"
                      : "pointer-events-none border border-border/60 bg-muted text-muted-foreground"
                  }`}
                  href={step.href}
                >
                  {step.cta}
                </Link>
              )}
            </li>
          );
        })}
      </ol>

      {completed >= 1 && completed < list.length && (
        <p className="text-center text-xs text-muted-foreground">
          {list.length - completed} step
          {list.length - completed === 1 ? "" : "s"} left — your dashboard unlocks
          when you&apos;re done.
        </p>
      )}
    </main>
  );
}
