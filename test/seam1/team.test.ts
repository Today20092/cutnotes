import { expect, it } from "vitest";
import { fetchPath } from "./support/worker";

it("serves the configured Team name and logo without sign-in", async () => {
  const response = await fetchPath("/api/team");

  expect(response.status).toBe(200);
  expect(await response.json()).toEqual({
    name: "Haithem Studio",
    logoUrl: "https://cutnotes.test/logo.png",
  });
});
