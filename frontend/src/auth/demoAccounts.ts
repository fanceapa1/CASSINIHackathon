export type UserRole = 'admin' | 'paid_client' | 'regional_user';
export type AccessScope = 'global' | 'regional';
export type AccountPlan = 'enterprise' | 'free' | 'paid';

export type DemoUser = {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  plan: AccountPlan;
  organization: string;
  accessScope: AccessScope;
  region?: string;
};

type DemoAccount = DemoUser & {
  password: string;
};

export type LoginResult =
  | { ok: true; user: DemoUser }
  | { ok: false; message: string };

const demoAccounts: DemoAccount[] = [
  {
    id: 'admin-global',
    name: 'Global Admin',
    email: 'admin@forecast.demo',
    password: 'admin123',
    role: 'admin',
    plan: 'enterprise',
    organization: 'CASSINI Forecast Operations',
    accessScope: 'global',
  },
  {
    id: 'paid-client-eu',
    name: 'EU Flood Ops Client',
    email: 'paid@forecast.demo',
    password: 'paid123',
    role: 'paid_client',
    plan: 'paid',
    organization: 'European Flood Operations',
    accessScope: 'global',
  },
  {
    id: 'wmo-bucharest-test',
    name: 'Bucharest Test User',
    email: 'bucharest@wmo.demo',
    password: 'test123',
    role: 'regional_user',
    plan: 'free',
    organization: 'WMO',
    accessScope: 'regional',
    region: 'Bucharest, Romania',
  },
];

const toPublicUser = ({ password: _password, ...user }: DemoAccount): DemoUser => user;

export const demoCredentials = demoAccounts.map((account) => ({
  email: account.email,
  password: account.password,
  label:
    account.role === 'admin'
      ? 'Admin account'
      : account.role === 'paid_client'
        ? 'Paid client account'
        : 'Bucharest regional account',
  description:
    account.role === 'admin'
      ? 'Full worldwide data and coordination access'
      : account.role === 'paid_client'
        ? 'Paid plan with simulation creation unlocked'
        : `${account.organization} free account limited to ${account.region}`,
}));

export function authenticateDemoUser(email: string, password: string): LoginResult {
  const normalizedEmail = email.trim().toLowerCase();

  if (!normalizedEmail || !password) {
    return { ok: false, message: 'Enter both an email address and password.' };
  }

  const account = demoAccounts.find((candidate) => candidate.email === normalizedEmail);

  if (!account) {
    return { ok: false, message: 'No demo account matches that email address.' };
  }

  if (account.password !== password) {
    return { ok: false, message: 'The password does not match this demo account.' };
  }

  return { ok: true, user: toPublicUser(account) };
}

export function getDemoUserById(id: string): DemoUser | null {
  const account = demoAccounts.find((candidate) => candidate.id === id);
  return account ? toPublicUser(account) : null;
}
