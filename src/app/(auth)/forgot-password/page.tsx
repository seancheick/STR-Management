import { ForgotPasswordForm } from "@/components/auth/forgot-password-form";

export default function ForgotPasswordPage() {
  return (
    <main className="mx-auto flex min-h-screen max-w-md items-center px-6 py-12">
      <div className="w-full rounded-[1.75rem] border border-border bg-card p-8 shadow-lg">
        <div className="mb-8 space-y-2">
          <p className="text-sm font-medium uppercase tracking-[0.3em] text-muted-foreground">
            TurnFlow
          </p>
          <h1 className="text-3xl font-semibold tracking-tight">Forgot password</h1>
          <p className="text-sm leading-6 text-muted-foreground">
            Enter the email for your account. We&apos;ll send a one-time link to reset your password.
          </p>
        </div>
        <ForgotPasswordForm />
      </div>
    </main>
  );
}
