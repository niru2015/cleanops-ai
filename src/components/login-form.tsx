"use client";

import { useActionState, useState } from "react";
import { signInAction } from "@/app/login/actions";

const accounts = [
  { group: "Directors", label: "Darrel — Director", email: "darrel.director@cleanops.example.com" },
  { group: "Directors", label: "Shayana — Director", email: "shayana.director@cleanops.example.com" },
  { group: "Area Managers", label: "Darrel — Area Manager", email: "darrel.area@cleanops.example.com" },
  { group: "Area Managers", label: "Shayana — Area Manager", email: "shayana.area@cleanops.example.com" },
  { group: "Supervisors", label: "Hardeep — Supervisor", email: "hardeep.supervisor@cleanops.example.com" },
  { group: "Supervisors", label: "Danny — Supervisor", email: "danny.supervisor@cleanops.example.com" },
  { group: "Supervisors", label: "RJ — Supervisor", email: "rj.supervisor@cleanops.example.com" },
  { group: "Supervisors", label: "Ambani — Supervisor", email: "ambani.supervisor@cleanops.example.com" },
  { group: "Cleaners", label: "Paul — Cleaner", email: "paul.cleaner@cleanops.example.com" },
  { group: "Cleaners", label: "Sheila — Cleaner", email: "sheila.cleaner@cleanops.example.com" },
  { group: "Cleaners", label: "Nikhil — Cleaner", email: "nikhil.cleaner@cleanops.example.com" },
  { group: "Cleaners", label: "Javid — Cleaner", email: "javid.cleaner@cleanops.example.com" },
  { group: "Cleaners", label: "Pradosh — Cleaner", email: "pradosh.cleaner@cleanops.example.com" },
  { group: "Cleaners", label: "Mandeep — Cleaner", email: "mandeep.cleaner@cleanops.example.com" },
  { group: "Cleaners", label: "Manuel — Cleaner", email: "manuel.cleaner@cleanops.example.com" },
  { group: "Cleaners", label: "Susanna — Cleaner", email: "susanna.cleaner@cleanops.example.com" },
  { group: "Cleaners", label: "Ricky — Cleaner", email: "ricky.cleaner@cleanops.example.com" },
] as const;

const groups = ["Directors", "Area Managers", "Supervisors", "Cleaners"] as const;

export function LoginForm() {
  const [state, action, pending] = useActionState(signInAction, null);
  const [email, setEmail] = useState(accounts[0].email);

  return (
    <form action={action} className="loginForm">
      <label className="loginField" htmlFor="demo-account">
        <span>Demo persona</span>
        <select id="demo-account" value={email} onChange={(event) => setEmail(event.target.value)}>
          {groups.map((group) => (
            <optgroup key={group} label={group}>
              {accounts.filter((account) => account.group === group).map((account) => (
                <option key={account.email} value={account.email}>{account.label}</option>
              ))}
            </optgroup>
          ))}
        </select>
      </label>

      <label className="loginField" htmlFor="email">
        <span>Email</span>
        <input autoComplete="username" id="email" name="email" onChange={(event) => setEmail(event.target.value)} required type="email" value={email} />
      </label>
      <label className="loginField" htmlFor="password">
        <span>Demo password</span>
        <input autoComplete="current-password" id="password" minLength={12} name="password" required type="password" />
      </label>
      {state ? <p className="loginError" role="alert">{state.message}</p> : null}
      <button className="loginSubmit" disabled={pending} type="submit">{pending ? "Signing in…" : "Open demo workspace"}</button>
      <p className="loginBoundary">Synthetic records only. Casino names are reference/demo data and do not imply a service relationship.</p>
    </form>
  );
}
