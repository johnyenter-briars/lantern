export type DataverseSearchCommand =
  | { component: "solution"; query: string }
  | { component: "powerAutomateFlow"; query: string; scope: "global" }
  | { component: "powerAutomateFlow"; query: string; scope: "solution"; solutionUniqueName: string };

export type SearchCommandParseResult =
  | { command: DataverseSearchCommand }
  | { error: string };

/** Parse flow searches and `s MySolution` solution navigation. */
export function parseSearchCommand(input: string): SearchCommandParseResult {
  const text = input.trim();
  const solutionFlow = text.match(/^s\s+(\S+)\s+pa(?:\s+(.+))?$/i);
  if (solutionFlow) {
    const query = solutionFlow[2]?.trim();
    if (!query) return { error: "Add a flow name after pa." };
    return { command: { scope: "solution", solutionUniqueName: solutionFlow[1], component: "powerAutomateFlow", query } };
  }
  const global = text.match(/^(?:g\s+)?pa(?:\s+(.+))?$/i);
  if (global) {
    const query = global[1]?.trim();
    if (!query) return { error: "Add a flow name after pa." };
    return { command: { scope: "global", component: "powerAutomateFlow", query } };
  }
  const solution = text.match(/^s\s+(.+)$/i);
  if (solution) return { command: { component: "solution", query: solution[1].trim() } };
  if (/^s$/i.test(text)) return { error: "Add a solution name after s." };
  return { error: "Use pa <flow name>, s <solution name>, or s <solution unique name> pa <flow name>." };
}
