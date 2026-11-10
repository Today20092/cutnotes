import { ClerkProvider, SignIn, useAuth, useClerk, useUser } from "@clerk/tanstack-react-start";
import type { ReactNode } from "react";

// These tokens already change with the device's light or dark setting.
const clerkTheme = {
  colorPrimary: "var(--primary)",
  colorPrimaryForeground: "var(--primary-foreground)",
  colorBackground: "var(--background)",
  colorForeground: "var(--foreground)",
  colorMutedForeground: "var(--muted-foreground)",
  colorInput: "var(--background)",
  colorInputForeground: "var(--foreground)",
  borderRadius: "var(--radius)",
};

export function AuthProvider({ children }: { children: ReactNode }) {
  return <ClerkProvider appearance={{ variables: clerkTheme }}>{children}</ClerkProvider>;
}

export function useAuthStatus() {
  const { isLoaded, isSignedIn } = useAuth();
  return { isLoaded, isSignedIn: Boolean(isSignedIn) };
}

export function useAccountEmail() {
  return useUser().user?.primaryEmailAddress?.emailAddress;
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
