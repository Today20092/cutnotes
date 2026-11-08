import { createServerFn } from "@tanstack/react-start";
import { requireMember } from "@/server/access";

export const getAppShell = createServerFn({ method: "POST" }).handler(
  async () => {
    const member = await requireMember("viewer");
    return { member: { displayName: member.displayName, role: member.role } };
  },
);
