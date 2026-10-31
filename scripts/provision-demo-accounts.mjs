import { readFile } from "node:fs/promises";
import { createClient } from "@supabase/supabase-js";

const projectEnv = Object.fromEntries(
  (await readFile(".env.local", "utf8"))
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith("#") && line.includes("="))
    .map((line) => {
      const separator = line.indexOf("=");
      return [line.slice(0, separator), line.slice(separator + 1)];
    }),
);

const url = projectEnv.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = projectEnv.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !serviceRoleKey) {
  throw new Error(".env.local must define NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.");
}

if (!process.argv.includes("--confirm-demo-provisioning")) {
  throw new Error("Refusing to provision accounts without --confirm-demo-provisioning.");
}

const companyByTenant = {
  alwafra: { company: "[DEMO] الوفرة للمخبوزات", branch: "[DEMO] فرع الرياض" },
  sawafi: { company: "[DEMO] صوافي للمنتجات الورقية", branch: "[DEMO] فرع جدة" },
  siwan: { company: "[DEMO] صيوان للشوكولاتة", branch: "[DEMO] فرع الدمام" },
};

function parseAccounts(text) {
  return text
    .split(/\r?\n/)
    .filter((line) => line.startsWith("|") && line.includes("@") && !line.includes("Email"))
    .map((line) => line.split("|").slice(1, -1).map((cell) => cell.trim()))
    .map(([displayName, role, , email, password]) => ({ displayName, role, email, password }));
}

const accounts = parseAccounts(await readFile("docs/demo-accounts.txt", "utf8"));
if (accounts.length !== 10) {
  throw new Error(`Expected 10 demo accounts in docs/demo-accounts.txt; found ${accounts.length}.`);
}

const supabase = createClient(url, serviceRoleKey, { auth: { autoRefreshToken: false, persistSession: false } });
const { data: companyRows, error: companyError } = await supabase
  .from("companies")
  .select("id,name_ar")
  .in("name_ar", Object.values(companyByTenant).map((target) => target.company));
if (companyError) throw companyError;

const { data: branchRows, error: branchError } = await supabase
  .from("branches")
  .select("id,company_id,name_ar");
if (branchError) throw branchError;

const companyIdByName = new Map(companyRows.map((company) => [company.name_ar, company.id]));
const branchIdByCompanyAndName = new Map(branchRows.map((branch) => [`${branch.company_id}:${branch.name_ar}`, branch.id]));

const { data: listedUsers, error: listUsersError } = await supabase.auth.admin.listUsers({ page: 1, perPage: 1000 });
if (listUsersError) throw listUsersError;
const userIdByEmail = new Map(listedUsers.users.map((user) => [user.email?.toLowerCase(), user.id]));

let createdUsers = 0;
let reusedUsers = 0;
for (const account of accounts) {
  let userId = userIdByEmail.get(account.email.toLowerCase());
  if (!userId) {
    const { data, error } = await supabase.auth.admin.createUser({
      email: account.email,
      password: account.password,
      email_confirm: true,
    });
    if (error) throw new Error(`Could not create ${account.email}: ${error.message}`);
    userId = data.user.id;
    createdUsers += 1;
  } else {
    reusedUsers += 1;
  }

  const { error: profileError } = await supabase
    .from("user_profiles")
    .upsert({ id: userId, display_name: account.displayName, active: true }, { onConflict: "id" });
  if (profileError) throw new Error(`Could not provision the profile for ${account.email}: ${profileError.message}`);

  const tenant = account.email === "admin@governance.local" ? null : account.email.split("@")[1].split(".")[0];
  const targets = tenant ? [companyByTenant[tenant]] : Object.values(companyByTenant);
  if (!targets.every(Boolean)) throw new Error(`No company mapping exists for ${account.email}.`);

  for (const target of targets) {
    const companyId = companyIdByName.get(target.company);
    if (!companyId) throw new Error(`Demo company is missing: ${target.company}`);
    const { error: roleError } = await supabase.from("user_company_roles").upsert(
      { user_id: userId, company_id: companyId, role: account.role },
      { onConflict: "user_id,company_id,role", ignoreDuplicates: true },
    );
    if (roleError) throw new Error(`Could not assign ${account.email}: ${roleError.message}`);

    if (account.role === "compliance_officer") {
      const branchId = branchIdByCompanyAndName.get(`${companyId}:${target.branch}`);
      if (!branchId) throw new Error(`Demo branch is missing: ${target.branch}`);
      const { error: accessError } = await supabase.from("user_branch_access").upsert(
        { user_id: userId, branch_id: branchId },
        { onConflict: "user_id,branch_id", ignoreDuplicates: true },
      );
      if (accessError) throw new Error(`Could not assign branch access to ${account.email}: ${accessError.message}`);
    }
  }
}

console.log(JSON.stringify({ provisioned: accounts.length, createdUsers, reusedUsers }));
