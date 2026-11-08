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

/** With `returnTo`, a brand-new person can sign up here and lands back on that URL either way. */
export function SignInForm({ returnTo }: { returnTo?: string }) {
  return (
    <SignIn
      routing="hash"
      withSignUp={returnTo !== undefined}
      forceRedirectUrl={returnTo}
      signUpForceRedirectUrl={returnTo}
    />
  );
}
