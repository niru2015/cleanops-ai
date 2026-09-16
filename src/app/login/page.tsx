import { BrandMark } from "@/components/icons";
import { LoginForm } from "@/components/login-form";

export const dynamic = "force-dynamic";

export default function LoginPage() {
  return (
    <main className="loginPage">
      <section className="loginCard" aria-labelledby="login-title">
        <div className="loginBrand"><BrandMark className="brandMark" /><span>CleanOps</span></div>
        <p className="eyebrow">Hosted business demonstration</p>
        <h1 id="login-title">Explore a synthetic casino night shift</h1>
        <p className="loginLead">Use the temporary credentials supplied by the presenter. Each role is limited to its assigned site and workflow.</p>
        <LoginForm />
      </section>
      <aside className="loginStory" aria-label="Demo outline">
        <span className="prototypePill">Prototype · synthetic data</span>
        <h2>One shift, three perspectives</h2>
        <ol>
          <li><span>01</span><div><strong>Supervisor</strong><p>Close a staffing gap, review evidence and release the service report.</p></div></li>
          <li><span>02</span><div><strong>Cleaner</strong><p>Select the assigned zone and submit before/after evidence.</p></div></li>
          <li><span>03</span><div><strong>Client</strong><p>See only the released, redacted performance record.</p></div></li>
        </ol>
      </aside>
    </main>
  );
}
