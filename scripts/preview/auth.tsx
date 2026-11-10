import { useEffect, useState, type ReactNode } from "react";

// Stands in for Clerk's browser SDK under Seam 2. Tests put a signed token in
// localStorage, and the real bearer middleware reads it through window.Clerk.
const token = () => localStorage.getItem("seam2-session-token");

export function AuthProvider({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(false);
  useEffect(() => {
    void fetch("/__preview/session")
      .then((response) => response.text())
      .then((value) => {
        localStorage.setItem("seam2-session-token", value);
        setReady(true);
      });
  }, []);
  if (!ready) return <p>Starting local preview…</p>;
  window.Clerk = { session: { getToken: async () => token() } };
  return <>{children}</>;
}

export function useAuthStatus() {
  return { isLoaded: true, isSignedIn: token() !== null };
}

export function useAccountEmail() {
  const payload = token()?.split(".")[1];
  if (!payload) return undefined;
  return (JSON.parse(atob(payload.replaceAll("-", "+").replaceAll("_", "/"))) as { email?: string })
    .email;
}

export function useSignOut() {
  return () => {
    localStorage.removeItem("seam2-session-token");
    location.reload();
  };
}

export function SignInForm() {
  return <p>Fake sign-in form</p>;
}
