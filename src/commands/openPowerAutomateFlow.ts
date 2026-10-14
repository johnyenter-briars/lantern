import { Client } from "../core/clients";
import { UserError } from "../core/errors";
import { dataverseFor } from "../ui/auth";
import { openEnvironmentUrl } from "../ui/environmentBrowser";

/** Resolve the current Dataverse environment ID and open its cloud flow editor. */
export async function openPowerAutomateFlow(client: Client, flowId: string): Promise<void> {
  const result = await dataverseFor(client).getJson<{ Detail: { EnvironmentId?: string } }>(
    "RetrieveCurrentOrganization(AccessType=@p)?@p=Microsoft.Dynamics.CRM.EndpointAccessType'Default'"
  );
  const environmentId = result.Detail?.EnvironmentId;
  if (!environmentId) throw new UserError(`Dataverse did not return an environment ID for ${client.name}.`);
  const url = `https://make.powerautomate.com/environments/${encodeURIComponent(environmentId)}/flows/${encodeURIComponent(flowId)}?v3=true`;
  await openEnvironmentUrl(client, url);
}
