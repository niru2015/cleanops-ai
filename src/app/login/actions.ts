"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { createSupabaseServerClient } from "@/lib/supabase/server";

const loginSchema = z.object({
  email: z.email().trim().toLowerCase(),
  password: z.string().min(12).max(200),
});

const membershipSchema = z.object({
  role: z.enum([
    "cleaner",
    "site_supervisor",
    "area_manager",
    "operations_manager",
    "organization_administrator",
    "client_viewer",
  ]),
});

export type LoginState = { ok: false; message: string } | null;

export async function signInAction(_state: LoginState, formData: FormData): Promise<LoginState> {
  const parsed = loginSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
  });
  if (!parsed.success) return { ok: false, message: "Enter a valid demo email and password." };

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.auth.signInWithPassword(parsed.data);
  if (error || !data.user) return { ok: false, message: "The demo credentials were not recognized." };

  const membershipResult = await supabase
    .from("memberships")
    .select("role")
    .eq("user_id", data.user.id)
    .eq("state", "active")
    .maybeSingle();
  const membership = membershipSchema.safeParse(membershipResult.data);
  if (membershipResult.error || !membership.success) {
    await supabase.auth.signOut();
    return { ok: false, message: "This account does not have active CleanOps access." };
  }

  if (membership.data.role === "cleaner") redirect("/mobile");
  if (membership.data.role === "client_viewer") redirect("/reports/client");
  redirect("/operations");
}

export async function signOutAction() {
  const supabase = await createSupabaseServerClient();
  await supabase.auth.signOut();
  redirect("/login");
}
