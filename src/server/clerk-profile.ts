import { clerkClient } from "@clerk/tanstack-react-start/server";

/** The service boundary replaced by local tests; profile data never comes from browser input. */
export async function readClerkProfile(userId: string) {
  const user = await clerkClient().users.getUser(userId);
  return {
    displayName: user.fullName?.trim() || user.username || null,
    avatarUrl: user.hasImage ? user.imageUrl : null,
  };
}
