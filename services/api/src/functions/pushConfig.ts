import { app, type HttpRequest, type HttpResponseInit } from "@azure/functions";
import { getWebPushConfiguration } from "../push/webPush.js";
import { json } from "../http/responses.js";

export async function pushConfig(
  _request: HttpRequest,
): Promise<HttpResponseInit> {
  const configuration = getWebPushConfiguration();

  return json(200, {
    ok: true,
    enabled: configuration.enabled,
    publicKey: configuration.publicKey,
  });
}

app.http("pushConfig", {
  methods: ["GET"],
  authLevel: "anonymous",
  route: "push/config",
  handler: pushConfig,
});
