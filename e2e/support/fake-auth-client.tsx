import type { ReactNode } from "react";

// Stands in for Clerk's browser SDK under Seam 2. Tests put a signed token in
// localStorage, and the real bearer middleware reads it through window.Clerk.
const token = () => localStorage.getItem("seam2-session-token");

export function AuthProvider({ children }: { children: ReactNode }) {
  window.Clerk = { session: { getToken: async () => token() } };
  return <>{children}</>;
}

export function useAuthStatus() {
  return { isLoaded: true, isSignedIn: token() !== null };
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
