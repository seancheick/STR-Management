/**
 * React 19 resets uncontrolled form fields after every form action, including
 * when the action *returns* an error, so a validation error wiped what the user
 * typed. Wrap the action with keepValuesOnError and give each field
 * `defaultValue={state.submitted?.<name> ?? <original default>}`: the reset
 * then restores the submitted text instead of blanking it. On success nothing
 * is echoed, so create forms still clear.
 */
export type WithSubmitted<S> = S & { submitted?: Record<string, string> };

function isErrorState(state: unknown): boolean {
  if (!state || typeof state !== "object") return false;
  const s = state as { status?: unknown; error?: unknown };
  return s.status === "error" || (typeof s.error === "string" && s.error.length > 0);
}

export function keepValuesOnError<S extends object>(
  action: (prev: S, formData: FormData) => Promise<S>,
) {
  return async (prev: WithSubmitted<S>, formData: FormData): Promise<WithSubmitted<S>> => {
    const next: WithSubmitted<S> = await action(prev, formData);
    if (!isErrorState(next)) return next;
    const submitted: Record<string, string> = {};
    formData.forEach((value, key) => {
      // Never echo secrets or files; skip React's internal action fields.
      if (typeof value !== "string" || key.startsWith("$") || /password/i.test(key)) return;
      submitted[key] = value;
    });
    return { ...next, submitted };
  };
}
