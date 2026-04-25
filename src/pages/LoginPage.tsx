import type { FormEvent } from 'react';
import { useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import { demoCredentials } from '../auth/demoAccounts';

type LoginLocationState = {
  from?: {
    pathname?: string;
  };
};

function LoginPage() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');

  const state = location.state as LoginLocationState | null;
  const destination = state?.from?.pathname ?? '/dashboard';

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError('');

    const result = login(email, password);

    if (!result.ok) {
      setError(result.message);
      return;
    }

    navigate(destination, { replace: true });
  }

  function applyCredential(emailValue: string, passwordValue: string) {
    setEmail(emailValue);
    setPassword(passwordValue);
    setError('');
  }

  return (
    <main className="relative z-10 flex min-h-screen items-center px-6 py-24 lg:px-8">
      <div aria-hidden className="pointer-events-none absolute inset-0 grid-haze opacity-70" />

      <div className="relative mx-auto grid w-full max-w-6xl gap-8 lg:grid-cols-[1.15fr_0.85fr]">
        <section className="overflow-hidden rounded-[28px] border border-cyan-100/20 bg-[linear-gradient(135deg,rgba(5,15,31,0.95),rgba(8,25,48,0.82))] p-8 shadow-[0_35px_80px_-42px_rgba(0,0,0,0.95)] backdrop-blur xl:p-10">
          <div className="flex h-full flex-col justify-between gap-10">
            <div className="space-y-6">
              <Link
                to="/"
                className="inline-flex items-center gap-2 font-heading text-sm font-semibold uppercase tracking-[0.2em] text-cyan-100/80 transition hover:text-cyan-100"
              >
                <span className="text-cyan-300">01</span>
                Castopini Platform
              </Link>

              <div className="space-y-4">
                <p className="font-body text-sm font-semibold uppercase tracking-[0.18em] text-cyan-100/70">
                  Secure command access
                </p>
                <h1 className="font-heading text-4xl font-bold uppercase leading-[1.02] text-white sm:text-5xl lg:text-6xl">
                  Sign in to the operations workspace
                </h1>
                <p className="max-w-2xl font-body text-base leading-relaxed text-slate-300 sm:text-lg">
                  Use the existing demo accounts to access the live control surface for forecast
                  monitoring, coordinated warnings, evacuation planning, and resource response.
                </p>
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-3">
              {[
                ['Forecast desk', 'Regional and global weather intelligence'],
                ['Warning center', 'Role-based emergency messaging access'],
                ['Response planning', 'Evacuation and resource coordination views'],
              ].map(([title, body]) => (
                <article
                  key={title}
                  className="rounded-2xl border border-cyan-100/15 bg-white/5 p-4 backdrop-blur"
                >
                  <p className="font-heading text-sm font-bold uppercase tracking-[0.08em] text-white">
                    {title}
                  </p>
                  <p className="mt-3 font-body text-sm leading-relaxed text-slate-300">{body}</p>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section className="rounded-[28px] border border-cyan-100/20 bg-[linear-gradient(180deg,rgba(6,18,35,0.96),rgba(5,15,30,0.84))] p-6 shadow-[0_30px_72px_-44px_rgba(0,0,0,0.98)] backdrop-blur sm:p-8">
          <div className="space-y-6">
            <div className="space-y-2">
              <p className="font-body text-sm font-semibold uppercase tracking-[0.18em] text-cyan-100/70">
                Demo login
              </p>
              <h2 className="font-heading text-3xl font-bold uppercase text-white">Welcome back</h2>
              <p className="font-body text-sm leading-relaxed text-slate-400 sm:text-base">
                The authentication logic is unchanged from the original root app. This screen only
                brings it into the new visual system.
              </p>
            </div>

            <form className="space-y-5" onSubmit={handleSubmit}>
              <label className="block font-body text-sm font-semibold text-slate-200">
                Email
                <input
                  autoComplete="username"
                  className="mt-2 w-full rounded-2xl border border-cyan-100/15 bg-[#040d1f]/90 px-4 py-3 text-sm text-slate-100 outline-none transition placeholder:text-slate-500 focus:border-cyan-200/55"
                  inputMode="email"
                  onChange={(event) => setEmail(event.target.value)}
                  placeholder="admin@forecast.demo"
                  type="email"
                  value={email}
                />
              </label>

              <label className="block font-body text-sm font-semibold text-slate-200">
                Password
                <input
                  autoComplete="current-password"
                  className="mt-2 w-full rounded-2xl border border-cyan-100/15 bg-[#040d1f]/90 px-4 py-3 text-sm text-slate-100 outline-none transition placeholder:text-slate-500 focus:border-cyan-200/55"
                  onChange={(event) => setPassword(event.target.value)}
                  placeholder="Enter demo password"
                  type="password"
                  value={password}
                />
              </label>

              {error ? (
                <p
                  className="rounded-2xl border border-red-400/20 bg-red-500/10 px-4 py-3 font-body text-sm text-red-200"
                  role="alert"
                >
                  {error}
                </p>
              ) : null}

              <button
                className="w-full rounded-full bg-cyan-300 px-6 py-3 font-body text-sm font-bold uppercase tracking-[0.08em] text-slate-950 transition hover:bg-cyan-200 sm:text-base"
                type="submit"
              >
                Sign in
              </button>
            </form>

            <div className="space-y-3 border-t border-cyan-100/10 pt-6">
              <p className="font-body text-sm font-semibold uppercase tracking-[0.18em] text-cyan-100/70">
                Demo credentials
              </p>

              <div className="grid gap-3">
                {demoCredentials.map((credential) => (
                  <button
                    key={credential.email}
                    className="rounded-2xl border border-cyan-100/15 bg-white/5 p-4 text-left transition hover:border-cyan-100/35 hover:bg-white/10"
                    onClick={() => applyCredential(credential.email, credential.password)}
                    type="button"
                  >
                    <span className="block font-heading text-sm font-bold uppercase tracking-[0.08em] text-white">
                      {credential.label}
                    </span>
                    <span className="mt-2 block font-body text-sm text-slate-300">
                      {credential.description}
                    </span>
                    <code className="mt-3 block break-all font-body text-xs text-cyan-200">
                      {credential.email} / {credential.password}
                    </code>
                  </button>
                ))}
              </div>
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}

export default LoginPage;
