import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';

const BUCHAREST_REGION = 'Bucharest, Romania';

function DashboardPage() {
  const { canAccessRegion, isAdmin, logout, user } = useAuth();
  const navigate = useNavigate();

  if (!user) {
    return null;
  }

  const hasBucharestAccess = canAccessRegion(BUCHAREST_REGION);
  const accessLabel = isAdmin ? 'Global access' : `${user.region} access`;

  const systemCards = isAdmin
    ? [
        ['Satellite feed', 'Worldwide weather ingestion placeholder'],
        ['Warning desk', 'Broadcast coordination available for all regions'],
        ['Resource view', 'Global evacuation and supply planning enabled'],
      ]
    : [
        ['Satellite feed', 'Regional weather ingestion placeholder'],
        ['Warning desk', 'Bucharest emergency messaging workspace'],
        ['Resource view', 'Local evacuation and shelter planning enabled'],
      ];

  const accessRows = [
    {
      label: 'Worldwide observation grid',
      status: isAdmin ? 'Available' : 'Restricted',
      tone: isAdmin ? 'open' : 'locked',
    },
    {
      label: 'Bucharest meteorological cell',
      status: hasBucharestAccess ? 'Available' : 'Restricted',
      tone: hasBucharestAccess ? 'open' : 'locked',
    },
    {
      label: 'Evacuation corridor planning',
      status: isAdmin ? 'Global' : 'Regional',
      tone: 'open',
    },
    {
      label: 'Cross-border resource allocation',
      status: isAdmin ? 'Available' : 'Restricted',
      tone: isAdmin ? 'open' : 'locked',
    },
  ] as const;

  const handleLogout = () => {
    logout();
    navigate('/login', { replace: true });
  };

  return (
    <main className="relative z-10 min-h-screen px-6 pb-10 pt-24 lg:px-8">
      <div aria-hidden className="pointer-events-none absolute inset-0 dashboard-grid opacity-50" />

      <div className="relative mx-auto flex w-full max-w-6xl flex-col gap-8">
        <header className="flex flex-col gap-6 rounded-[28px] border border-cyan-100/20 bg-[linear-gradient(135deg,rgba(5,16,31,0.96),rgba(8,27,50,0.82))] p-6 shadow-[0_36px_80px_-48px_rgba(0,0,0,1)] backdrop-blur sm:p-8 lg:flex-row lg:items-end lg:justify-between">
          <div className="space-y-3">
            <div className="flex flex-wrap items-center gap-3 text-xs font-semibold uppercase tracking-[0.18em] text-cyan-100/75">
              <Link to="/" className="transition hover:text-cyan-100">
                Castopini
              </Link>
              <span className="text-cyan-300/60">/</span>
              <span>Operations dashboard</span>
            </div>

            <div>
              <p className="font-body text-sm font-semibold uppercase tracking-[0.16em] text-cyan-100/70">
                Authenticated workspace
              </p>
              <h1 className="mt-2 font-heading text-4xl font-bold uppercase leading-tight text-white sm:text-5xl">
                {accessLabel}
              </h1>
            </div>

            <p className="max-w-3xl font-body text-base leading-relaxed text-slate-300">
              This dashboard keeps the original role-based access logic from the root app, now
              restyled to match the live landing experience.
            </p>
          </div>

          <div className="flex flex-col gap-4 rounded-3xl border border-cyan-100/15 bg-white/5 p-4 sm:min-w-[280px]">
            <div>
              <span className="block font-heading text-sm font-bold uppercase tracking-[0.08em] text-white">
                {user.name}
              </span>
              <span className="mt-1 block font-body text-sm text-slate-300">{user.organization}</span>
            </div>

            <div className="flex flex-wrap gap-3">
              <Link
                to="/"
                className="rounded-full border border-cyan-100/25 bg-white/5 px-5 py-2 text-center font-body text-sm font-semibold text-slate-100 transition hover:border-cyan-100/40 hover:bg-white/10"
              >
                Back to site
              </Link>
              <button
                className="rounded-full bg-cyan-300 px-5 py-2 font-body text-sm font-bold uppercase tracking-[0.08em] text-slate-950 transition hover:bg-cyan-200"
                onClick={handleLogout}
                type="button"
              >
                Logout
              </button>
            </div>
          </div>
        </header>

        <section className="grid gap-4 lg:grid-cols-4" aria-label="Access summary">
          <article className="rounded-[24px] border border-cyan-200/25 bg-[linear-gradient(160deg,rgba(10,33,61,0.95),rgba(11,67,93,0.86))] p-6 shadow-[0_28px_64px_-42px_rgba(0,0,0,0.95)] lg:col-span-2">
            <p className="font-body text-sm font-semibold uppercase tracking-[0.16em] text-cyan-100/70">
              Access level
            </p>
            <h2 className="mt-3 font-heading text-3xl font-bold uppercase text-white">
              {isAdmin ? 'Worldwide operations' : 'Regional operations'}
            </h2>
            <p className="mt-4 font-body text-sm leading-relaxed text-slate-200 sm:text-base">
              {isAdmin
                ? 'This account can inspect all forecast, warning, evacuation, and resource layers.'
                : `This account is limited to ${user.region} for forecast and response coordination.`}
            </p>
          </article>

          {systemCards.map(([title, body]) => (
            <article
              key={title}
              className="rounded-[24px] border border-cyan-100/15 bg-[linear-gradient(180deg,rgba(5,15,29,0.92),rgba(5,15,29,0.72))] p-6 backdrop-blur"
            >
              <p className="font-body text-sm font-semibold uppercase tracking-[0.16em] text-cyan-100/70">
                {title}
              </p>
              <h2 className="mt-3 font-heading text-2xl font-bold uppercase text-white">Available</h2>
              <p className="mt-4 font-body text-sm leading-relaxed text-slate-300 sm:text-base">
                {body}
              </p>
            </article>
          ))}
        </section>

        <section className="grid gap-4 xl:grid-cols-[1.4fr_0.9fr]">
          <div className="rounded-[28px] border border-cyan-100/15 bg-[linear-gradient(180deg,rgba(6,18,35,0.95),rgba(6,18,35,0.78))] p-6 backdrop-blur sm:p-8">
            <div className="border-b border-cyan-100/10 pb-5">
              <p className="font-body text-sm font-semibold uppercase tracking-[0.16em] text-cyan-100/70">
                Forecast workspace
              </p>
              <h2 className="mt-2 font-heading text-3xl font-bold uppercase text-white">
                {isAdmin ? 'Global weather intelligence' : 'Bucharest weather intelligence'}
              </h2>
            </div>

            <div className="mt-6 grid gap-3">
              {accessRows.map((row) => (
                <AccessRow
                  key={row.label}
                  label={row.label}
                  status={row.status}
                  tone={row.tone}
                />
              ))}
            </div>
          </div>

          <aside className="rounded-[28px] border border-cyan-100/15 bg-[linear-gradient(180deg,rgba(7,18,33,0.94),rgba(7,18,33,0.78))] p-6 backdrop-blur sm:p-8">
            <p className="font-body text-sm font-semibold uppercase tracking-[0.16em] text-cyan-100/70">
              Current demo scope
            </p>
            <h2 className="mt-2 font-heading text-3xl font-bold uppercase text-white">
              {isAdmin ? 'All agencies and regions' : BUCHAREST_REGION}
            </h2>
            <p className="mt-4 font-body text-sm leading-relaxed text-slate-300 sm:text-base">
              {isAdmin
                ? 'Admin users can review worldwide satellite feeds, publish warnings, and coordinate international resource plans.'
                : 'Regional users can prepare local warnings and response plans, while worldwide datasets remain locked.'}
            </p>

            <div className="mt-6 rounded-3xl border border-emerald-300/15 bg-emerald-300/10 p-5">
              <strong className="font-heading text-sm font-bold uppercase tracking-[0.08em] text-emerald-100">
                Placeholder integration
              </strong>
              <p className="mt-3 font-body text-sm leading-relaxed text-emerald-50/85">
                Satellite weather ingestion, forecast models, and evacuation workflows can be
                connected behind this account boundary later.
              </p>
            </div>
          </aside>
        </section>
      </div>
    </main>
  );
}

type AccessRowProps = {
  label: string;
  status: string;
  tone: 'open' | 'locked';
};

function AccessRow({ label, status, tone }: AccessRowProps) {
  return (
    <div className="flex flex-col gap-3 rounded-3xl border border-cyan-100/10 bg-white/5 p-4 sm:flex-row sm:items-center sm:justify-between">
      <span className="font-body text-sm text-slate-200 sm:text-base">{label}</span>
      <strong
        className={`inline-flex w-fit items-center rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-[0.08em] ${
          tone === 'open'
            ? 'bg-emerald-300/15 text-emerald-100'
            : 'bg-amber-300/15 text-amber-100'
        }`}
      >
        {status}
      </strong>
    </div>
  );
}

export default DashboardPage;
