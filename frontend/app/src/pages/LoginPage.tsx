import { type FormEvent, useState } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
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
                onClick={() => fillCredential(credential.email, credential.password)}
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
