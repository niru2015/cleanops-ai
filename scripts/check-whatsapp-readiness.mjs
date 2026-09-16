const required = [
  "WHATSAPP_ACCESS_TOKEN", "WHATSAPP_APP_ID", "WHATSAPP_APP_SECRET",
  "WHATSAPP_WABA_ID", "WHATSAPP_PHONE_NUMBER_ID", "WHATSAPP_GRAPH_VERSION",
];
const missing = required.filter((name) => !process.env[name]);
if (missing.length) {
  console.error(`Missing server-only WhatsApp settings: ${missing.join(", ")}`);
  process.exit(1);
}

const token = process.env.WHATSAPP_ACCESS_TOKEN;
const version = process.env.WHATSAPP_GRAPH_VERSION;
const graph = `https://graph.facebook.com/${version}`;
const requiredScopes = ["whatsapp_business_management", "whatsapp_business_messaging"];
const requiredTemplates = (process.env.WHATSAPP_REQUIRED_TEMPLATE_NAMES ?? "")
  .split(",").map((value) => value.trim()).filter(Boolean);

async function graphJson(url, authorization = `Bearer ${token}`) {
  const response = await fetch(url, { headers: { authorization }, cache: "no-store" });
  const body = await response.json().catch(() => null);
  if (!response.ok) throw new Error(`Graph readiness request failed with HTTP ${response.status}.`);
  return body;
}

try {
  const phone = await graphJson(`${graph}/${encodeURIComponent(process.env.WHATSAPP_PHONE_NUMBER_ID)}?fields=id,display_phone_number,verified_name`);
  if (phone?.id !== process.env.WHATSAPP_PHONE_NUMBER_ID) throw new Error("Configured phone number is not accessible with the pinned API version.");

  const subscriptions = await graphJson(`${graph}/${encodeURIComponent(process.env.WHATSAPP_WABA_ID)}/subscribed_apps`);
  if (!Array.isArray(subscriptions?.data) || subscriptions.data.length === 0) throw new Error("No subscribed app is visible for the configured business account.");

  const appAccessToken = `${process.env.WHATSAPP_APP_ID}|${process.env.WHATSAPP_APP_SECRET}`;
  const debug = await graphJson(
    `${graph}/debug_token?input_token=${encodeURIComponent(token)}`,
    `Bearer ${appAccessToken}`,
  );
  const scopes = new Set(Array.isArray(debug?.data?.scopes) ? debug.data.scopes : []);
  const missingScopes = requiredScopes.filter((scope) => !scopes.has(scope));
  if (missingScopes.length) throw new Error(`Token is missing permissions: ${missingScopes.join(", ")}.`);

  const templates = await graphJson(`${graph}/${encodeURIComponent(process.env.WHATSAPP_WABA_ID)}/message_templates?limit=100`);
  const approved = new Set(
    (Array.isArray(templates?.data) ? templates.data : [])
      .filter((template) => template?.status === "APPROVED")
      .map((template) => template.name),
  );
  const missingTemplates = requiredTemplates.filter((name) => !approved.has(name));
  if (missingTemplates.length) throw new Error(`Required templates are not approved: ${missingTemplates.join(", ")}.`);

  console.log(JSON.stringify({
    ready: true,
    graphVersion: version,
    phoneNumberId: phone.id,
    subscribedAppCount: subscriptions.data.length,
    requiredPermissions: requiredScopes,
    approvedRequiredTemplates: requiredTemplates,
  }, null, 2));
} catch (error) {
  console.error(error instanceof Error ? error.message : "WhatsApp readiness check failed.");
  process.exit(1);
}
