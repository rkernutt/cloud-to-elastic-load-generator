import { type EcsDocument, rand, randInt, azureCloud, makeAzureSetup } from "./helpers.js";

export function generateOpenAiLog(ts: string, er: number): EcsDocument {
  const { region, subscription, resourceGroup, isErr } = makeAzureSetup(er);
  const deployment = rand(["gpt-4o", "gpt-4.1-mini", "embed-ada"]);
  const tokens = isErr ? randInt(0, 500) : randInt(200, 8000);
  return {
    "@timestamp": ts,
    cloud: azureCloud(region, subscription, "Microsoft.CognitiveServices/accounts"),
    azure: {
      openai: {
        resource_group: resourceGroup,
        deployment,
        model: deployment,
        prompt_tokens: randInt(50, tokens),
        completion_tokens: isErr ? 0 : randInt(20, tokens),
        finish_reason: isErr ? "content_filter" : "stop",
      },
    },
    event: { outcome: isErr ? "failure" : "success", duration: randInt(2e6, isErr ? 6e10 : 4e9) },
    message: isErr
      ? `OpenAI ${deployment}: request blocked / error`
      : `OpenAI ${deployment}: completion OK (${tokens} tokens)`,
  };
}
