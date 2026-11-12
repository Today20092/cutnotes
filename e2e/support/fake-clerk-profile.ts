/** Local browser tests and previews never call Clerk's live profile API. */
export async function readClerkProfile(_userId: string) {
  return null;
}
