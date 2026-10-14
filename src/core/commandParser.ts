export interface DataverseSearchCommand {
  scope: "global";
  component: "powerAutomateFlow";
  query: string;
}

export type SearchCommandParseResult =
  | { command: DataverseSearchCommand }
  | { error: string };

/** Parse Lantern's compact search syntax, for example `/g /pa invoice`. */
export function parseSearchCommand(input: string): SearchCommandParseResult {
  const match = input.trim().match(/^\/g\s+\/pa(?:\s+(.+))?$/i);
  if (!match) return { error: "Use /g /pa <flow name> to search Power Automate flows across clients." };
  const query = match[1]?.trim();
  if (!query) return { error: "Add a flow name after /g /pa." };
  return { command: { scope: "global", component: "powerAutomateFlow", query } };
}
