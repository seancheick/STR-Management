"use client";

import { useActionState, useTransition } from "react";
import { useFormStatus } from "react-dom";
import { Bot, Copy, Loader2 } from "lucide-react";

import {
  createAgentTokenAction,
  revokeAgentTokenAction,
  type AgentTokenActionState,
} from "@/app/(admin)/dashboard/settings/actions";
import type { AgentTokenRecord } from "@/lib/agent/tokens";
import { showToast } from "@/components/ui/toast";

const INITIAL: AgentTokenActionState = { status: "idle", message: null };

function CreateSubmit() {
  const { pending } = useFormStatus();
  return (
    <button
      className="inline-flex h-12 items-center justify-center rounded-full bg-primary px-5 text-sm font-semibold text-primary-foreground transition hover:opacity-95 disabled:opacity-60"
      disabled={pending}
      type="submit"
    >
      {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Create token"}
    </button>
  );
}

function CopyField({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex gap-2">
      <input
        readOnly
        aria-label={label}
        value={value}
        className="h-12 min-w-0 flex-1 rounded-xl border border-input bg-background px-4 font-mono text-xs"
      />
      <button
        type="button"
        aria-label={`Copy ${label}`}
        onClick={() => navigator.clipboard.writeText(value).then(() => showToast("Copied."))}
        className="inline-flex h-12 w-12 shrink-0 items-center justify-center rounded-full border border-border hover:bg-muted"
      >
        <Copy className="h-4 w-4" aria-hidden="true" />
      </button>
    </div>
  );
}

const formatDate = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" }) : "Never");

export function AgentTokensCard({ tokens, mcpUrl, openApiUrl }: { tokens: AgentTokenRecord[]; mcpUrl: string; openApiUrl: string }) {
  const [state, action] = useActionState(createAgentTokenAction, INITIAL);
  const [revoking, startRevoke] = useTransition();

  function revoke(token: AgentTokenRecord) {
    if (!confirm(`Revoke "${token.label}"? Agents using it stop working immediately.`)) return;
    startRevoke(async () => {
      const result = await revokeAgentTokenAction(token.id);
      showToast(result.error ?? "Token revoked.", result.error ? "error" : "success");
    });
  }

  return (
    <section className="rounded-2xl border border-border/70 bg-card p-6">
      <div className="mb-2 flex items-center gap-2">
        <Bot className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
        <h2 className="text-base font-semibold">AI agents</h2>
      </div>
      <p className="mb-4 text-sm text-muted-foreground">
        Let Claude, Codex or other AI agents read your calendar, schedule cleaners and record payments.
        A token acts as you. Read tokens can only look; write tokens can make changes.
      </p>

      <div className="space-y-3">
        <div>
          <p className="mb-1.5 text-xs font-medium text-muted-foreground">MCP server URL (Claude, Codex, Cursor)</p>
          <CopyField label="MCP server URL" value={mcpUrl} />
        </div>
        <div>
          <p className="mb-1.5 text-xs font-medium text-muted-foreground">OpenAPI spec (REST agents such as Muse)</p>
          <CopyField label="OpenAPI spec URL" value={openApiUrl} />
        </div>
      </div>

      <form action={action} className="mt-5 flex flex-wrap items-end gap-3">
        <label className="flex min-w-40 flex-1 flex-col gap-1.5 text-xs font-medium text-muted-foreground">
          Agent name
          <input
            name="label"
            required
            maxLength={60}
            placeholder="Claude"
            className="h-12 rounded-xl border border-input bg-background px-4 text-sm text-foreground"
          />
        </label>
        <label className="flex flex-col gap-1.5 text-xs font-medium text-muted-foreground">
          Access
          <select name="scope" defaultValue="read" className="h-12 rounded-xl border border-input bg-background px-4 text-sm text-foreground">
            <option value="read">Read only</option>
            <option value="write">Read and write</option>
          </select>
        </label>
        <CreateSubmit />
      </form>

      {state.status === "error" ? <p className="mt-3 text-sm text-destructive">{state.message}</p> : null}
      {state.token ? (
        <div className="mt-4 rounded-xl border border-secondary bg-muted/60 p-4">
          <p className="mb-2 text-sm font-medium">{state.message}</p>
          <CopyField label="New agent token" value={state.token} />
          <p className="mt-2 text-xs text-muted-foreground">
            Send it as <span className="font-mono">Authorization: Bearer &lt;token&gt;</span>.
          </p>
        </div>
      ) : null}

      {tokens.length ? (
        <ul className="mt-5 divide-y divide-border/60 border-t border-border/60">
          {tokens.map((token) => (
            <li key={token.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
              <div className="min-w-0">
                <p className="flex items-center gap-2 text-sm font-medium">
                  {token.label}
                  <span className={`rounded-full border px-3 py-1 text-xs font-medium ${token.scope === "write" ? "border-amber-300 bg-amber-50 text-amber-800" : "border-emerald-300 bg-emerald-50 text-emerald-800"}`}>
                    {token.scope === "write" ? "Read and write" : "Read only"}
                  </span>
                </p>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  <span className="font-mono">{token.token_prefix}…</span> · Created {formatDate(token.created_at)} · Last used {formatDate(token.last_used_at)}
                </p>
              </div>
              <button
                type="button"
                disabled={revoking}
                onClick={() => revoke(token)}
                className="rounded-full border border-border px-4 py-2 text-sm font-medium text-destructive hover:bg-muted disabled:opacity-60"
              >
                Revoke
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  );
}
