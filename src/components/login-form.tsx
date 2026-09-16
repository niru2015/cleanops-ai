"use client";

import { useActionState, useState } from "react";
import { signInAction } from "@/app/login/actions";

const roles = [
  { label: "Supervisor", email: "demo-supervisor@cleanops.example.com", description: "Operations, review, incidents and release" },
  { label: "Cleaner", email: "demo-cleaner@cleanops.example.com", description: "Assigned mobile task and evidence capture" },
  { label: "Client", email: "demo-client@cleanops.example.com", description: "Released redacted service report" },
];

export function LoginForm() {
  const [state, action, pending] = useActionState(signInAction, null);
  const [email, setEmail] = useState(roles[0].email);

  return (
    <form action={action} className="loginForm">
      <fieldset className="rolePicker">
        <legend>Choose a demo role</legend>
        {roles.map((role) => (
          <label className={email === role.email ? "roleOption roleOptionSelected" : "roleOption"} key={role.email}>
            <input checked={email === role.email} name="demo-role" onChange={() => setEmail(role.email)} type="radio" value={role.email} />
            <span><strong>{role.label}</strong><small>{role.description}</small></span>
          </label>
        ))}
      </fieldset>

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
      <p className="loginBoundary">Synthetic records only. WhatsApp and live AI remain disconnected.</p>
    </form>
  );
}
