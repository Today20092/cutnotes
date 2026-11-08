import { refuse } from "@/server/access";

/** Lives apart from the server functions so importing it keeps Access out of the browser bundle. */
export const bodyOf = (body: string) => {
  if (typeof body !== "string" || !body.trim() || body.length > 5000) refuse(400, "invalid-request");
  return body;
};
