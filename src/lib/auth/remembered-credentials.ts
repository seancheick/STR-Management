export const REMEMBERED_EMAIL_KEY = "airbnb-ops:remembered-email";

type RememberedEmailStorage = Pick<Storage, "getItem" | "removeItem" | "setItem">;

function normalizeEmail(email: string) {
  return email.trim().toLowerCase();
}

export function getRememberedEmail(storage: RememberedEmailStorage) {
  const value = storage.getItem(REMEMBERED_EMAIL_KEY);
  return value && value.length > 0 ? value : null;
}

export function saveRememberedEmail(
  email: string,
  remember: boolean,
  storage: RememberedEmailStorage,
) {
  if (!remember) {
    storage.removeItem(REMEMBERED_EMAIL_KEY);
    return;
  }

  storage.setItem(REMEMBERED_EMAIL_KEY, normalizeEmail(email));
}

type PasswordCredentialConstructor = new (data: {
  id: string;
  name: string;
  password: string;
}) => unknown;

type CredentialNavigator = Navigator & {
  credentials?: {
    store?: (credential: unknown) => Promise<unknown>;
  };
};

type CredentialWindow = Window & {
  PasswordCredential?: PasswordCredentialConstructor;
};

export async function requestBrowserPasswordSave({
  email,
  password,
  enabled,
}: {
  email: string;
  password: string;
  enabled: boolean;
}) {
  if (!enabled || typeof window === "undefined") return;

  const credentials = (navigator as CredentialNavigator).credentials;
  const PasswordCredential = (window as CredentialWindow).PasswordCredential;

  if (!credentials?.store || !PasswordCredential) return;

  try {
    await credentials.store(
      new PasswordCredential({
        id: normalizeEmail(email),
        name: normalizeEmail(email),
        password,
      }),
    );
  } catch {
    // Browsers may reject credential storage based on user or browser policy.
  }
}
