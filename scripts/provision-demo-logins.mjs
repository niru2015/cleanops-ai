import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const secret = process.env.SUPABASE_SECRET_KEY;
const password = process.env.CLEANOPS_DEMO_PASSWORD;

if (!url || !secret) {
  throw new Error("Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SECRET_KEY.");
}
if (!password || password.length < 12) {
  throw new Error("Set CLEANOPS_DEMO_PASSWORD to at least 12 characters.");
}

const supabase = createClient(url, secret, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const accounts = [
  ["d1000000-0000-4000-8000-000000000001", "darrel.director@cleanops.example.com", "Darrel", "Director"],
  ["d1000000-0000-4000-8000-000000000002", "shayana.director@cleanops.example.com", "Shayana", "Director"],
  ["d1000000-0000-4000-8000-000000000003", "darrel.area@cleanops.example.com", "Darrel", "Area Manager"],
  ["d1000000-0000-4000-8000-000000000004", "shayana.area@cleanops.example.com", "Shayana", "Area Manager"],
  ["d1000000-0000-4000-8000-000000000005", "hardeep.supervisor@cleanops.example.com", "Hardeep", "Supervisor"],
  ["d1000000-0000-4000-8000-000000000006", "danny.supervisor@cleanops.example.com", "Danny", "Supervisor"],
  ["d1000000-0000-4000-8000-000000000007", "rj.supervisor@cleanops.example.com", "RJ", "Supervisor"],
  ["d1000000-0000-4000-8000-000000000008", "ambani.supervisor@cleanops.example.com", "Ambani", "Supervisor"],
  ["d1000000-0000-4000-8000-000000000009", "paul.cleaner@cleanops.example.com", "Paul", "Cleaner"],
  ["d1000000-0000-4000-8000-000000000010", "sheila.cleaner@cleanops.example.com", "Sheila", "Cleaner"],
  ["d1000000-0000-4000-8000-000000000011", "nikhil.cleaner@cleanops.example.com", "Nikhil", "Cleaner"],
  ["d1000000-0000-4000-8000-000000000012", "javid.cleaner@cleanops.example.com", "Javid", "Cleaner"],
  ["d1000000-0000-4000-8000-000000000013", "pradosh.cleaner@cleanops.example.com", "Pradosh", "Cleaner"],
  ["d1000000-0000-4000-8000-000000000014", "mandeep.cleaner@cleanops.example.com", "Mandeep", "Cleaner"],
  ["d1000000-0000-4000-8000-000000000015", "manuel.cleaner@cleanops.example.com", "Manuel", "Cleaner"],
  ["d1000000-0000-4000-8000-000000000016", "susanna.cleaner@cleanops.example.com", "Susanna", "Cleaner"],
  ["d1000000-0000-4000-8000-000000000017", "ricky.cleaner@cleanops.example.com", "Ricky", "Cleaner"],
];

const listAllUsers = async () => {
  const users = [];
  for (let page = 1; page <= 20; page += 1) {
    const { data, error } = await supabase.auth.admin.listUsers({ page, perPage: 100 });
    if (error) throw error;
    users.push(...data.users);
    if (data.users.length < 100) break;
  }
  return users;
};

for (const [placeholderId, email, displayName, persona] of accounts) {
  let users = await listAllUsers();
  let existing = users.find((user) => user.email?.toLowerCase() === email);

  if (existing && existing.id !== placeholderId) {
    const { error } = await supabase.auth.admin.updateUserById(existing.id, {
      password,
      email_confirm: true,
      user_metadata: { cleanops_demo: true, display_name: displayName, persona },
    });
    if (error) throw error;
    console.log(`rotated ${email}`);
    continue;
  }

  const bootstrapEmail = `${email.split("@")[0]}.bootstrap@cleanops.example.com`;
  let bootstrap = users.find((user) => user.email?.toLowerCase() === bootstrapEmail);

  if (!bootstrap) {
    const created = await supabase.auth.admin.createUser({
      email: bootstrapEmail,
      password,
      email_confirm: true,
      user_metadata: { cleanops_demo: true, display_name: displayName, persona },
    });
    if (created.error || !created.data.user) throw created.error ?? new Error(`Could not create ${email}`);
    bootstrap = created.data.user;
  }

  const newId = bootstrap.id;

  const membershipUpdate = await supabase
    .from("memberships")
    .update({ user_id: newId })
    .eq("user_id", placeholderId);
  if (membershipUpdate.error) throw membershipUpdate.error;

  const workerUpdate = await supabase
    .from("workers")
    .update({ auth_user_id: newId })
    .eq("auth_user_id", placeholderId);
  if (workerUpdate.error) throw workerUpdate.error;

  if (existing?.id === placeholderId) {
    const deletion = await supabase.auth.admin.deleteUser(placeholderId);
    if (deletion.error) throw deletion.error;
  }

  const finalUpdate = await supabase.auth.admin.updateUserById(newId, {
    email,
    password,
    email_confirm: true,
    user_metadata: { cleanops_demo: true, display_name: displayName, persona },
  });
  if (finalUpdate.error) throw finalUpdate.error;

  console.log(`provisioned ${email}`);
}

console.log("CleanOps demo logins provisioned/rotated.");
