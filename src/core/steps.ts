/**
 * Step ids. A frame names the point of the algorithm it stands at ("shift",
 * "relax"), not a line of one listing; each language's code panel maps the
 * name to a line of its own code. Only the JS listing exists so far.
 */

export type StepId = string;

/** One listing's map from step id to its 1-based line. Several ids may share a line. */
export type StepLines = Readonly<Record<StepId, number>>;

/** A line map's ids by name, so `STEP.shift === 'shift'` and a misspelt step does not compile. */
export function stepIds<T extends StepLines>(lines: T): { readonly [K in keyof T & string]: K } {
  const ids: Record<string, string> = {};
  for (const id of Object.keys(lines)) ids[id] = id;
  return ids as { readonly [K in keyof T & string]: K };
}
