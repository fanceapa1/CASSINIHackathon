import { type FormEvent, useState } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { useAuth } from '../auth/AuthContext';
import { demoCredentials } from '../auth/demoAccounts';

export default function LoginPage() {
  const { login, isAuthenticated } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');

  if (isAuthenticated) {
    return <Navigate to="/dashboard" replace />;
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError('');
    const result = login(email, password);
    if (result.ok) {
      navigate('/dashboard');
    } else {
      setError(result.message);
    }
  }

  function fillCredential(emailValue: string, passwordValue: string) {
    setEmail(emailValue);
    setPassword(passwordValue);
    setError('');
  }

  return (
    <main className="relative flex min-h-screen items-center justify-center overflow-hidden bg-[#030816] px-6 py-20">
      {/* Background & Gradients (preluate de la HeroSection) */}
      <div className="absolute inset-0 -z-20 transform-gpu bg-[radial-gradient(circle_at_20%_5%,rgba(78,212,255,0.15),transparent_40%),linear-gradient(180deg,rgba(5,10,23,0.98)_0%,rgba(3,7,17,0.92)_100%)] will-change-transform" />
      <div className="absolute inset-x-0 top-0 -z-10 h-px transform-gpu bg-gradient-to-r from-transparent via-cyan-100/30 to-transparent will-change-transform" />

      <div className="mx-auto grid w-full max-w-5xl gap-12 lg:grid-cols-[1.1fr_0.9fr] lg:items-center">
        
        {/* Intro Section */}
        <motion.div
          initial={{ opacity: 0, x: -48 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.75, ease: "easeOut" }}
          className="space-y-6"
        >
          <p className="font-body text-sm font-semibold uppercase tracking-[0.2em] text-cyan-100/75">
            Incident Intelligence Platform
          </p>
          <h1 id="login-title" className="font-heading text-4xl font-bold uppercase leading-[1.05] text-white sm:text-5xl">
            Synoptis Command
          </h1>
          <p className="max-w-md font-body text-base leading-relaxed text-slate-300 sm:text-lg">
            Demo account access for agencies coordinating forecasts, emergency warnings,
            evacuation planning, and resource allocation.
          </p>
          <div className="flex flex-wrap gap-3 pt-2 font-body text-xs font-semibold uppercase tracking-wider text-cyan-200/60" aria-label="Demo system capabilities">
            <span className="rounded-full border border-cyan-200/10 bg-cyan-500/5 px-4 py-2">Forecasts</span>
            <span className="rounded-full border border-cyan-200/10 bg-cyan-500/5 px-4 py-2">Warnings</span>
            <span className="rounded-full border border-cyan-200/10 bg-cyan-500/5 px-4 py-2">Evacuation plans</span>
            <span className="rounded-full border border-cyan-200/10 bg-cyan-500/5 px-4 py-2">Resources</span>
          </div>
        </motion.div>

        {/* Formular de Login (Glassmorphism similar cu ContactSection) */}
        <motion.form
          onSubmit={handleSubmit}
          initial={{ opacity: 0, x: 48 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.85, delay: 0.1, ease: "easeOut" }}
          className="rounded-[24px] border border-cyan-100/20 bg-[#071328]/80 p-6 shadow-[0_28px_60px_-38px_rgba(0,0,0,0.92)] backdrop-blur-xl sm:p-8"
        >
          <div className="mb-8 space-y-2">
            <p className="font-body text-xs font-bold uppercase tracking-[0.1em] text-cyan-300">Secure demo login</p>
            <h2 className="font-heading text-2xl font-bold uppercase tracking-[0.04em] text-slate-100">Sign in</h2>
          </div>

          <div className="space-y-5">
            <label className="block font-body text-sm font-semibold text-slate-200">
              Email
              <input
                autoComplete="username"
                inputMode="email"
                onChange={(event) => setEmail(event.target.value)}
                placeholder="admin@forecast.demo"
                type="email"
                value={email}
                className="mt-2 w-full rounded-xl border border-cyan-100/20 bg-[#030c1c] px-4 py-3 font-body text-sm text-slate-100 outline-none transition placeholder:text-slate-500 focus:border-cyan-200/60"
              />
            </label>

            <label className="block font-body text-sm font-semibold text-slate-200">
              Password
              <input
                autoComplete="current-password"
                onChange={(event) => setPassword(event.target.value)}
                placeholder="Enter demo password"
                type="password"
                value={password}
                className="mt-2 w-full rounded-xl border border-cyan-100/20 bg-[#030c1c] px-4 py-3 font-body text-sm text-slate-100 outline-none transition placeholder:text-slate-500 focus:border-cyan-200/60"
              />
            </label>

            {error && (
              <motion.p 
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
                className="font-body text-sm font-semibold text-red-400" 
                role="alert"
              >
                {error}
              </motion.p>
            )}

            <button
              className="w-full rounded-full bg-cyan-300 px-6 py-3.5 font-body text-sm font-bold uppercase tracking-[0.08em] text-slate-950 transition hover:bg-cyan-200 mt-2"
              type="submit"
            >
              Sign in
            </button>
          </div>

          {/* Sectiune Conturi Demo */}
          <div className="mt-10 border-t border-cyan-100/10 pt-8" aria-label="Demo credentials">
            <p className="mb-4 font-body text-xs font-bold uppercase tracking-[0.1em] text-slate-400">Available demo accounts</p>
            <div className="grid gap-3">
              {demoCredentials.map((credential) => (
                <button
                  key={credential.email}
                  onClick={() => fillCredential(credential.email, credential.password)}
                  type="button"
                  className="group flex flex-col items-start rounded-xl border border-cyan-100/10 bg-white/5 p-4 text-left transition hover:border-cyan-100/30 hover:bg-white/10"
                >
                  <span className="block w-full">
                    <strong className="block font-body text-sm font-semibold text-cyan-100 transition group-hover:text-cyan-300">
                      {credential.label}
                    </strong>
                    <small className="mt-1 block font-body text-xs text-slate-400">
                      {credential.description}
                    </small>
                  </span>
                  <code className="mt-3 rounded bg-[#030816] px-2 py-1 font-mono text-[11px] text-cyan-200/70">
                    {credential.email} / {credential.password}
                  </code>
                </button>
              ))}
            </div>
          </div>
        </motion.form>
      </div>
    </main>
  );
}