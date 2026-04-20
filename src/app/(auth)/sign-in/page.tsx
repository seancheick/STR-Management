import { AlertTriangle } from "lucide-react";

import { SignInForm } from "@/components/auth/sign-in-form";

type SignInPageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

export default async function SignInPage({ searchParams }: SignInPageProps) {
  const params = (await searchParams) ?? {};
  const redirectTo =
    typeof params.redirectTo === "string" ? params.redirectTo : undefined;
  const authError =
    typeof params.authError === "string" ? params.authError : undefined;

  return (
    <main className="mx-auto flex min-h-screen max-w-md items-center px-6 py-12">
      <div className="w-full rounded-[1.75rem] border border-border bg-card p-8 shadow-lg">
        <div className="mb-8 space-y-2">
          <p className="text-sm font-medium uppercase tracking-[0.3em] text-muted-foreground">
            Airbnb Ops Portal
          </p>
          <h1 className="text-3xl font-semibold tracking-tight">Sign in</h1>
          <p className="text-sm leading-6 text-muted-foreground">
            Use your team credentials to access the admin dashboard or cleaner jobs.
          </p>
        </div>
        {authError && (
          <div className="mb-5 flex items-start gap-2 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm leading-6 text-amber-900">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" aria-hidden="true" />
            <span>{authError}</span>
          </div>
        )}
        <SignInForm redirectTo={redirectTo} />
      </div>
    </main>
  );
}

