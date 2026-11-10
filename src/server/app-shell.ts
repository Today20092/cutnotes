import { createServerFn } from "@tanstack/react-start";
import { readAsMember } from "@/server/access";

export const getAppShell = createServerFn({ method: "POST" }).handler(async () => {
  const { member } = await readAsMember("viewer", () => []);
  return { member: { displayName: member.displayName, role: member.role } };
});
