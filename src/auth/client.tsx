import { ClerkProvider, SignIn, useAuth, useClerk } from "@clerk/tanstack-react-start";
import type { ReactNode } from "react";

export function AuthProvider({ children }: { children: ReactNode }) {
  return <ClerkProvider>{children}</ClerkProvider>;
}

export function useAuthStatus() {
  const { isLoaded, isSignedIn } = useAuth();
  return { isLoaded, isSignedIn: Boolean(isSignedIn) };
}

export function useSignOut() {
  const clerk = useClerk();
  return () => clerk.signOut();
}

export function SignInForm() {
  return <SignIn routing="hash" />;
}
