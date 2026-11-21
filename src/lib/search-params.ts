import * as v from "valibot";

/** A search param whose wrong or missing value is dropped, never an error page. */
export const param = <Schema extends v.GenericSchema>(schema: Schema) =>
  v.fallback(v.optional(schema), undefined);

export const idParam = param(v.pipe(v.string(), v.minLength(1), v.maxLength(64)));
export const textParam = param(v.pipe(v.string(), v.maxLength(80)));
export const positiveInt = param(v.pipe(v.number(), v.integer(), v.minValue(1)));
/** A moment in the Video, in seconds from the start. */
export const secondsParam = param(v.pipe(v.number(), v.minValue(0), v.maxValue(43_200)));
export const sheetParam = <Names extends readonly [string, ...string[]]>(names: Names) =>
  param(v.picklist(names));
