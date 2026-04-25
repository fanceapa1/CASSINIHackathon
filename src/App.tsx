import { FormEvent, useState } from 'react';
import { useAuth } from './auth/AuthContext';
import { demoCredentials } from './auth/demoAccounts';

const BUCHAREST_REGION = 'Bucharest, Romania';

function App() {
  const { user } = useAuth();

  return user ? <Dashboard /> : <LoginPage />;
}

function LoginPage() {
  const { login } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError('');

    const result = login(email, password);

    if (!result.ok) {
      setError(result.message);
    }
  }

  function useCredential(emailValue: string, passwordValue: string) {
    setEmail(emailValue);
    setPassword(passwordValue);
    setError('');
  }

  return (
    <main className="login-page">
      <section className="login-shell" aria-labelledby="login-title">
        <div className="login-intro">
          <p className="eyebrow">Satellite weather warning access</p>
          <h1 id="login-title">CASSINI Forecast Command</h1>
          <p>
            Demo account access for agencies coordinating forecasts, emergency warnings,
            evacuation planning, and resource allocation.
          </p>
          <div className="signal-strip" aria-label="Demo system capabilities">
            <span>Forecasts</span>
            <span>Warnings</span>
            <span>Evacuation plans</span>
            <span>Resources</span>
          </div>
        </div>

        <form className="login-panel" onSubmit={handleSubmit}>
          <div>
            <p className="section-kicker">Secure demo login</p>
            <h2>Sign in</h2>
          </div>

          <label>
            Email
            <input
              autoComplete="username"
              inputMode="email"
              onChange={(event) => setEmail(event.target.value)}
              placeholder="admin@forecast.demo"
              type="email"
              value={email}
            />
          </label>

          <label>
            Password
            <input
              autoComplete="current-password"
              onChange={(event) => setPassword(event.target.value)}
              placeholder="Enter demo password"
              type="password"
              value={password}
            />
          </label>

          {error ? <p className="form-error" role="alert">{error}</p> : null}

          <button className="primary-button" type="submit">
            Sign in
          </button>

          <div className="credentials-list" aria-label="Demo credentials">
            <p className="section-kicker">Available demo accounts</p>
            {demoCredentials.map((credential) => (
              <button
                className="credential-card"
                key={credential.email}
                onClick={() => useCredential(credential.email, credential.password)}
                type="button"
              >
                <span>
                  <strong>{credential.label}</strong>
                  <small>{credential.description}</small>
                </span>
                <code>
                  {credential.email} / {credential.password}
                </code>
              </button>
            ))}
          </div>
        </form>
      </section>
    </main>
  );
}

function Dashboard() {
  const { canAccessRegion, isAdmin, logout, user } = useAuth();

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

  return (
    <main className="dashboard">
      <header className="topbar">
        <div>
          <p className="eyebrow">Operational dashboard</p>
          <h1>{accessLabel}</h1>
        </div>
        <div className="account-chip">
          <span>{user.name}</span>
          <small>{user.organization}</small>
          <button className="secondary-button" onClick={logout} type="button">
            Logout
          </button>
        </div>
      </header>

      <section className="overview-grid" aria-label="Access summary">
        <article className="status-card primary-status">
          <p className="section-kicker">Access level</p>
          <h2>{isAdmin ? 'Worldwide operations' : 'Regional operations'}</h2>
          <p>
            {isAdmin
              ? 'This account can inspect all forecast, warning, evacuation, and resource layers.'
              : `This account is limited to ${user.region} for forecast and response coordination.`}
          </p>
        </article>

        {systemCards.map(([title, body]) => (
          <article className="status-card" key={title}>
            <p className="section-kicker">{title}</p>
            <h2>Available</h2>
            <p>{body}</p>
          </article>
        ))}
      </section>

      <section className="workspace-grid">
        <div className="workspace-panel">
          <div className="panel-heading">
            <p className="section-kicker">Forecast workspace</p>
            <h2>{isAdmin ? 'Global weather intelligence' : 'Bucharest weather intelligence'}</h2>
          </div>

          <div className="forecast-list">
            <AccessRow
              label="Worldwide observation grid"
              status={isAdmin ? 'Available' : 'Restricted'}
              tone={isAdmin ? 'open' : 'locked'}
            />
            <AccessRow
              label="Bucharest meteorological cell"
              status={hasBucharestAccess ? 'Available' : 'Restricted'}
              tone={hasBucharestAccess ? 'open' : 'locked'}
            />
            <AccessRow
              label="Evacuation corridor planning"
              status={isAdmin ? 'Global' : 'Regional'}
              tone="open"
            />
            <AccessRow
              label="Cross-border resource allocation"
              status={isAdmin ? 'Available' : 'Restricted'}
              tone={isAdmin ? 'open' : 'locked'}
            />
          </div>
        </div>

        <aside className="workspace-panel response-panel">
          <p className="section-kicker">Current demo scope</p>
          <h2>{isAdmin ? 'All agencies and regions' : BUCHAREST_REGION}</h2>
          <p>
            {isAdmin
              ? 'Admin users can review worldwide satellite feeds, publish warnings, and coordinate international resource plans.'
              : 'Regional users can prepare local warnings and response plans, while worldwide datasets remain locked.'}
          </p>
          <div className="response-note">
            <strong>Placeholder integration</strong>
            <span>
              Satellite weather ingestion, forecast models, and evacuation workflows can be
              connected behind this account boundary later.
            </span>
          </div>
        </aside>
      </section>
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
    <div className="access-row">
      <span>{label}</span>
      <strong className={`access-pill ${tone}`}>{status}</strong>
    </div>
  );
}

export default App;
