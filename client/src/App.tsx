import { useEffect, useMemo, useState } from 'react';
import { BrowserRouter, Link, Navigate, NavLink, Route, Routes, useNavigate, useParams } from 'react-router-dom';
import { api, getApiErrorMessage } from './services/api';
import { MapContainer, TileLayer, CircleMarker, Marker, Popup, useMapEvents } from 'react-leaflet';
import { Bell, Gauge, MapPinned, Menu, Sparkles } from 'lucide-react';
import { Bar, BarChart, CartesianGrid, Line, LineChart, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import 'leaflet/dist/leaflet.css';

const roleStyles = {
  citizen: 'bg-emerald-500/15 text-emerald-200 border border-emerald-500/30',
  officer: 'bg-cyan-500/15 text-cyan-200 border border-cyan-500/30',
  admin: 'bg-violet-500/15 text-violet-200 border border-violet-500/30'
};

function getRoleStyle(role: string) {
  return roleStyles[role as keyof typeof roleStyles] || roleStyles.citizen;
}

function getInitialUser() {
  try {
    const raw = localStorage.getItem('civicpulse-user');
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function getInitialToken() {
  return localStorage.getItem('civicpulse-token') || '';
}

function App() {
  const [token, setToken] = useState(getInitialToken());
  const [user, setUser] = useState(getInitialUser());
  const [loadingUser, setLoadingUser] = useState(false);

  useEffect(() => {
    if (!token) {
      setUser(null);
      localStorage.removeItem('civicpulse-user');
      return;
    }

    const stored = localStorage.getItem('civicpulse-user');
    if (stored) {
      setUser(JSON.parse(stored));
    }

    api.defaults.headers.common.Authorization = `Bearer ${token}`;
    setLoadingUser(true);
    api
      .get('/auth/me')
      .then((response) => {
        setUser(response.data.user);
        localStorage.setItem('civicpulse-user', JSON.stringify(response.data.user));
      })
      .catch(() => {
        setToken('');
        setUser(null);
        localStorage.removeItem('civicpulse-user');
        localStorage.removeItem('civicpulse-token');
      })
      .finally(() => setLoadingUser(false));
  }, [token]);

  const handleLogin = (nextToken: string, nextUser: Record<string, unknown>) => {
    setToken(nextToken);
    setUser(nextUser as any);
    localStorage.setItem('civicpulse-token', nextToken);
    localStorage.setItem('civicpulse-user', JSON.stringify(nextUser));
  };

  if (loadingUser && token) {
    return <div className="flex min-h-screen items-center justify-center bg-slate-950 text-white">Loading CivicPulse AI…</div>;
  }

  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<LandingPage user={user} />} />
        <Route path="/login" element={<LoginPage onLogin={handleLogin} user={user} />} />
        <Route path="/register" element={<RegisterPage onLogin={handleLogin} />} />
        <Route path="/forgot-password" element={<ForgotPasswordPage />} />
        <Route path="/citizen/dashboard" element={<ProtectedRoute allowedRoles={['citizen']} user={user} token={token}><CitizenDashboard user={user} /></ProtectedRoute>} />
        <Route path="/citizen/report" element={<ProtectedRoute allowedRoles={['citizen']} user={user} token={token}><CitizenReportPage user={user} /></ProtectedRoute>} />
        <Route path="/citizen/complaints" element={<ProtectedRoute allowedRoles={['citizen']} user={user} token={token}><CitizenComplaintsPage user={user} /></ProtectedRoute>} />
        <Route path="/citizen/alerts" element={<ProtectedRoute allowedRoles={['citizen']} user={user} token={token}><CitizenAlertsPage user={user} /></ProtectedRoute>} />
        <Route path="/citizen/profile" element={<ProtectedRoute allowedRoles={['citizen']} user={user} token={token}><CitizenProfilePage user={user} /></ProtectedRoute>} />
        <Route path="/citizen/complaints/:id" element={<ProtectedRoute allowedRoles={['citizen']} user={user} token={token}><ComplaintDetailPage user={user} /></ProtectedRoute>} />

        <Route path="/officer/dashboard" element={<ProtectedRoute allowedRoles={['officer']} user={user} token={token}><OfficerDashboard user={user} /></ProtectedRoute>} />
        <Route path="/officer/complaints" element={<ProtectedRoute allowedRoles={['officer']} user={user} token={token}><OfficerComplaintsPage user={user} /></ProtectedRoute>} />
        <Route path="/officer/complaints/:id" element={<ProtectedRoute allowedRoles={['officer']} user={user} token={token}><ComplaintDetailPage user={user} /></ProtectedRoute>} />
        <Route path="/officer/clusters" element={<ProtectedRoute allowedRoles={['officer']} user={user} token={token}><OfficerClustersPage user={user} /></ProtectedRoute>} />
        <Route path="/officer/alerts" element={<ProtectedRoute allowedRoles={['officer']} user={user} token={token}><OfficerAlertsPage user={user} /></ProtectedRoute>} />

        <Route path="/admin/dashboard" element={<ProtectedRoute allowedRoles={['admin']} user={user} token={token}><AdminDashboard user={user} /></ProtectedRoute>} />
        <Route path="/admin/complaints" element={<ProtectedRoute allowedRoles={['admin']} user={user} token={token}><AdminComplaintsPage user={user} /></ProtectedRoute>} />
        <Route path="/admin/users" element={<ProtectedRoute allowedRoles={['admin']} user={user} token={token}><AdminUsersPage user={user} /></ProtectedRoute>} />
        <Route path="/admin/officers" element={<ProtectedRoute allowedRoles={['admin']} user={user} token={token}><AdminOfficersPage user={user} /></ProtectedRoute>} />
        <Route path="/admin/departments" element={<ProtectedRoute allowedRoles={['admin']} user={user} token={token}><AdminDepartmentsPage user={user} /></ProtectedRoute>} />
        <Route path="/admin/clusters" element={<ProtectedRoute allowedRoles={['admin']} user={user} token={token}><AdminClustersPage user={user} /></ProtectedRoute>} />
        <Route path="/admin/hotspots" element={<ProtectedRoute allowedRoles={['admin']} user={user} token={token}><AdminHotspotsPage user={user} /></ProtectedRoute>} />
        <Route path="/admin/predictions" element={<ProtectedRoute allowedRoles={['admin']} user={user} token={token}><AdminPredictionsPage user={user} /></ProtectedRoute>} />
        <Route path="/admin/analytics" element={<ProtectedRoute allowedRoles={['admin']} user={user} token={token}><AdminAnalyticsPage user={user} /></ProtectedRoute>} />
        <Route path="/admin/alerts" element={<ProtectedRoute allowedRoles={['admin']} user={user} token={token}><AdminAlertsPage user={user} /></ProtectedRoute>} />
        <Route path="/admin/settings" element={<ProtectedRoute allowedRoles={['admin']} user={user} token={token}><AdminSettingsPage user={user} /></ProtectedRoute>} />

        <Route path="*" element={<NotFoundPage />} />
      </Routes>
    </BrowserRouter>
  );
}

function ProtectedRoute({ user, token, allowedRoles, children }: any) {
  if (!token || !user) {
    return <Navigate to="/login" replace />;
  }

  if (!allowedRoles.includes(user.role)) {
    return <Navigate to="/" replace />;
  }

  return children;
}

function LandingPage({ user }: { user: any }) {
  useEffect(() => {
    const elements = document.querySelectorAll('.reveal-on-scroll');
    if (!elements.length) return;

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.classList.add('is-visible');
          }
        });
      },
      { threshold: 0.12 }
    );

    elements.forEach((element) => observer.observe(element));
    return () => observer.disconnect();
  }, []);

  const features = [
    'AI classification and duplicate detection',
    'Predictive hotspot scoring and policy alerts',
    'Officer workflow, progress tracking, and evidence management',
    'Role-based dashboards for citizens, officers and administrators'
  ];

  return (
    <div className="min-h-screen bg-slate-950 text-slate-50">
      <div className="motion-bg" aria-hidden="true">
        <span className="orb orb-1" />
        <span className="orb orb-2" />
        <span className="orb orb-3" />
      </div>
      <header className="mx-auto max-w-7xl px-6 pb-12 pt-6">
        <nav className="flex items-center justify-between rounded-full border border-slate-700/80 bg-slate-900/75 px-5 py-3 backdrop-blur-lg">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-full bg-gradient-to-br from-emerald-400 to-cyan-500 text-sm font-bold text-slate-950">C</div>
            <div>
              <div className="text-lg font-bold">CivicPulse AI</div>
            </div>
          </div>
          <div className="hidden items-center gap-8 md:flex text-sm text-slate-300">
            <a href="#problem" className="hover:text-white">Problem</a>
            <a href="#solution" className="hover:text-white">Solution</a>
            <a href="#how-it-works" className="hover:text-white">How it works</a>
            <a href="#impact" className="hover:text-white">Impact</a>
          </div>
          <div className="flex items-center gap-3">
            <Link to="/login" className="rounded-full border border-slate-600 px-4 py-2 text-sm hover:border-slate-400">Login</Link>
            <Link to="/register" className="rounded-full bg-emerald-500 px-4 py-2 text-sm font-semibold text-slate-950 hover:bg-emerald-400">Register</Link>
            <Link to="/admin/dashboard" className="rounded-full border border-violet-400 px-4 py-2 text-sm text-violet-200">Admin Login</Link>
          </div>
        </nav>
      </header>

      <main className="mx-auto max-w-7xl space-y-20 px-6 pb-20">
        <section className="hero-shell reveal-on-scroll grid gap-10 rounded-[2rem] border border-slate-800 bg-slate-900/80 p-8 shadow-2xl md:grid-cols-[1.1fr_0.9fr] md:p-12">
          <div className="space-y-6">
            <div className="inline-flex items-center gap-2 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-3 py-1 text-xs font-medium text-emerald-300 hero-pill">
              <Sparkles size={14} /> Predictive governance, not reactive response
            </div>
            <h1 className="max-w-xl text-4xl font-black tracking-tight text-white md:text-6xl hero-title">From Citizen Complaints to Predictive Governance</h1>
            <p className="max-w-xl text-lg text-slate-300 hero-copy">CivicPulse AI transforms public issue reporting into a proactive city intelligence system by clustering complaints, predicting hotspots, and recommending actions before a civic crisis grows.</p>
            <div className="flex flex-wrap gap-4">
              <Link to={user ? `/${user.role}/dashboard` : '/register'} className="rounded-full bg-gradient-to-r from-emerald-400 to-cyan-400 px-6 py-3 font-semibold text-slate-950 hover:scale-[1.02] transition-transform">Report a Problem</Link>
              <Link to="/login" className="rounded-full border border-slate-600 px-6 py-3 font-semibold text-white hover:border-cyan-400 hover:text-cyan-200 transition-colors">Login</Link>
            </div>
            <div className="grid gap-3 pt-4 sm:grid-cols-3">
              {['Submit a civic issue', 'Review AI-assisted triage', 'Track verified resolution'].map((step) => (
                <div key={step} className="rounded-2xl border border-slate-700 bg-slate-950/50 p-4 text-sm text-slate-200 stat-card reveal-on-scroll">{step}</div>
              ))}
            </div>
          </div>

          <div className="grid gap-4">
            <div className="card-surface rounded-3xl p-5 hero-panel reveal-on-scroll">
              <div className="mb-4 flex items-center justify-between">
                <div>
                  <p className="text-xs uppercase tracking-[0.2em] text-cyan-200">Civic intelligence</p>
                  <h3 className="mt-1 text-2xl font-bold text-white">From signal to action</h3>
                </div>
                <span className="rounded-full bg-emerald-500/15 px-3 py-1 text-xs font-semibold text-emerald-200">AI-assisted</span>
              </div>
              <div className="space-y-3 text-sm text-slate-300">
                <div className="flex items-center justify-between"><span>Text classification</span><strong className="text-white">Local NLP</strong></div>
                <div className="flex items-center justify-between"><span>Similarity check</span><strong className="text-emerald-300">Database-backed</strong></div>
                <div className="flex items-center justify-between"><span>Risk output</span><strong className="text-cyan-300">AI-estimated</strong></div>
                <div className="mt-3 rounded-xl bg-slate-800/80 p-3 text-xs text-slate-200">Predictions are estimates based on records stored in the configured database; they are not guaranteed outcomes.</div>
              </div>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="card-surface rounded-3xl p-5 reveal-on-scroll">
                <div className="flex items-center gap-3 text-cyan-300"><MapPinned size={18} /> Hotspot density</div>
                <div className="mt-5 text-2xl font-bold text-white">Location-aware</div>
                <p className="mt-2 text-sm text-slate-300">Uses submitted coordinates</p>
              </div>
              <div className="card-surface rounded-3xl p-5 reveal-on-scroll">
                <div className="flex items-center gap-3 text-emerald-300"><Gauge size={18} /> Prediction confidence</div>
                <div className="mt-5 text-2xl font-bold text-white">Local AI</div>
                <p className="mt-2 text-sm text-slate-300">Rule fallback when training data is sparse</p>
              </div>
            </div>
          </div>
        </section>

        <section id="problem" className="grid gap-6 md:grid-cols-2">
          <div className="card-surface rounded-3xl p-8 reveal-on-scroll">
            <h2 className="mb-4 text-2xl font-bold text-white">The problem</h2>
            <p className="text-slate-300">As cities grow, complaints pile up across fragmented systems. Public agencies typically react after an issue becomes severe, expensive, or visible in the news—making it difficult to prioritize infrastructure before a crisis hits.</p>
          </div>
          <div id="solution" className="card-surface rounded-3xl p-8 reveal-on-scroll">
            <h2 className="mb-4 text-2xl font-bold text-white">The solution</h2>
            <p className="text-slate-300">CivicPulse AI merges citizen reports, AI similarity analysis, predictive risk models, and geographic intelligence into one operational command center for departments and city leaders.</p>
          </div>
        </section>

        <section id="how-it-works" className="card-surface rounded-3xl p-8 reveal-on-scroll">
          <div className="mb-8 text-center">
            <p className="text-sm uppercase tracking-[0.2em] text-cyan-200">How it works</p>
            <h2 className="mt-3 text-3xl font-bold text-white">From complaint to predictive action</h2>
          </div>
          <div className="grid gap-4 md:grid-cols-5">
            {['Report', 'Classify', 'Cluster', 'Predict', 'Act'].map((step, index) => (
              <div key={step} className="process-step reveal-on-scroll rounded-2xl border border-slate-700 bg-slate-950/50 p-5 text-center">
                <div className="mx-auto mb-3 flex h-10 w-10 items-center justify-center rounded-full bg-gradient-to-br from-cyan-400 to-emerald-400 font-bold text-slate-950">{index + 1}</div>
                <p className="font-semibold text-white">{step}</p>
              </div>
            ))}
          </div>
        </section>

        <section className="grid gap-6 md:grid-cols-2 xl:grid-cols-4">
          {features.map((feature) => (
            <div key={feature} className="card-surface reveal-on-scroll rounded-3xl p-6 text-slate-200">{feature}</div>
          ))}
        </section>

        <section id="impact" className="grid gap-6 lg:grid-cols-[1.1fr_0.9fr]">
          <div className="card-surface rounded-3xl p-8 reveal-on-scroll">
            <p className="text-sm uppercase tracking-[0.2em] text-emerald-200">Impact</p>
            <h2 className="mt-3 text-3xl font-bold text-white">Data-driven governance that prevents the next civic crisis.</h2>
            <ul className="mt-6 space-y-4 text-slate-300">
              <li>• Reduced hidden backlog by identifying duplicate and nearby reports earlier.</li>
              <li>• Better prioritization for drainage, water, safety, and transport issues.</li>
              <li>• Smarter public communication with real-time alerting and department coordination.</li>
            </ul>
          </div>
          <div className="card-surface rounded-3xl p-8 reveal-on-scroll">
            <h2 className="mb-5 text-2xl font-bold text-white">Why CivicPulse AI?</h2>
            <div className="space-y-4 text-sm text-slate-300">
              <div className="rounded-xl border border-slate-700 bg-slate-900 p-4"><span className="font-semibold text-white">Traditional governance:</span> Reactive → Manual → Complaint-based</div>
              <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-4"><span className="font-semibold text-emerald-200">CivicPulse AI:</span> AI-powered → Data-driven → Predictive → Proactive</div>
            </div>
            <p className="mt-6 text-lg font-semibold text-cyan-200">Don’t wait for the next civic crisis. Predict it. Prioritize it. Prevent it.</p>
          </div>
        </section>
      </main>
    </div>
  );
}

function LoginPage({ onLogin, user }: { onLogin: (token: string, user: Record<string, unknown>) => void; user: any }) {
  const navigate = useNavigate();
  const [form, setForm] = useState({ email: '', password: '' });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (user) {
      const path = `/${user.role}/dashboard`;
      navigate(path, { replace: true });
    }
  }, [user, navigate]);

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setLoading(true);
    setError('');
    try {
      const credentials = new URLSearchParams({
        username: form.email,
        password: form.password,
      });
      const response = await api.post('/auth/login', credentials, {
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      });
      const { token, user: nextUser } = response.data;
      onLogin(token, nextUser);
      navigate(`/${nextUser.role}/dashboard`);
    } catch (err: any) {
      setError(getApiErrorMessage(err));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-950 px-4">
      <div className="card-surface w-full max-w-md rounded-3xl p-8">
        <div className="mb-6 text-center">
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-gradient-to-br from-emerald-400 to-cyan-500 text-lg font-bold text-slate-950">C</div>
          <h1 className="text-3xl font-bold text-white">Welcome back</h1>
          <p className="mt-2 text-slate-400">Secure access to CivicPulse AI</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="mb-1 block text-sm text-slate-300">Email</label>
            <input type="email" autoComplete="email" required className="w-full rounded-xl border border-slate-700 bg-slate-900/80 p-3 text-white outline-none ring-0 focus:border-cyan-500" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
          </div>
          <div>
            <label className="mb-1 block text-sm text-slate-300">Password</label>
            <input type="password" autoComplete="current-password" required className="w-full rounded-xl border border-slate-700 bg-slate-900/80 p-3 text-white outline-none ring-0 focus:border-cyan-500" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} />
          </div>
          {error && <div className="rounded-xl border border-red-500/50 bg-red-500/10 p-3 text-sm text-red-200">{error}</div>}
          <button type="submit" disabled={loading} className="w-full rounded-xl bg-gradient-to-r from-emerald-400 to-cyan-500 px-4 py-3 font-semibold text-slate-950 disabled:opacity-60">{loading ? 'Signing in…' : 'Login'}</button>
        </form>

        <div className="mt-5 flex items-center justify-between text-sm text-slate-400">
          <Link to="/forgot-password">Forgot password?</Link>
          <Link to="/register">Create account</Link>
        </div>

        <div className="mt-6 rounded-xl border border-cyan-500/20 bg-cyan-500/5 p-3 text-xs text-cyan-100">Create a citizen account to get started. Administrator and officer accounts must be provisioned by an administrator.</div>
      </div>
    </div>
  );
}

function RegisterPage({ onLogin }: { onLogin: (token: string, user: Record<string, unknown>) => void }) {
  const [form, setForm] = useState({ name: '', email: '', password: '' });
  const [message, setMessage] = useState('');
  const [registrationStatus, setRegistrationStatus] = useState<'checking' | 'ready' | 'database_not_configured' | 'database_disconnected' | 'authentication_not_configured' | 'unavailable'>('checking');
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    let active = true;
    api.get('/health')
      .then((response) => {
        if (!active) return;
        const { database, authentication } = response.data;
        if (database === 'not_configured') setRegistrationStatus('database_not_configured');
        else if (database !== 'connected') setRegistrationStatus('database_disconnected');
        else if (authentication !== 'configured') setRegistrationStatus('authentication_not_configured');
        else setRegistrationStatus('ready');
      })
      .catch(() => {
        if (active) setRegistrationStatus('unavailable');
      });
    return () => {
      active = false;
    };
  }, []);

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setLoading(true);
    setMessage('');
    try {
      const response = await api.post('/auth/register', {
        name: form.name.trim(),
        email: form.email.trim(),
        password: form.password,
      });
      const { token, user } = response.data;
      onLogin(token, user);
      navigate('/citizen/dashboard');
    } catch (error: any) {
      setMessage(getApiErrorMessage(error));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-950 px-4">
      <div className="card-surface w-full max-w-lg rounded-3xl p-8">
        <h1 className="mb-6 text-3xl font-bold text-white">Create account</h1>
        {registrationStatus !== 'ready' && (
          <div className="mb-5 rounded-xl border border-amber-500/40 bg-amber-500/10 p-3 text-sm text-amber-100" role="status">
            {registrationStatus === 'checking' && 'Checking account creation requirements…'}
            {registrationStatus === 'database_not_configured' && 'Account creation is unavailable because the database is not configured. Set DATABASE_URL in backend/.env, then restart the API.'}
            {registrationStatus === 'database_disconnected' && 'The database is currently unreachable. Check the backend database connection and try again.'}
            {registrationStatus === 'authentication_not_configured' && 'Account creation is unavailable because authentication is not configured. Set JWT_SECRET in backend/.env, then restart the API.'}
            {registrationStatus === 'unavailable' && 'Could not check account creation requirements. Make sure the API is running, then try again.'}
          </div>
        )}
        <form onSubmit={handleSubmit} className="space-y-4">
          <label className="block text-sm text-slate-300">
            Full name
            <input autoComplete="name" required minLength={2} maxLength={160} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Full name" className="mt-1 w-full rounded-xl border border-slate-700 bg-slate-900 p-3 text-white" />
          </label>
          <label className="block text-sm text-slate-300">
            Email address
            <input type="email" autoComplete="email" required maxLength={320} value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} placeholder="Email address" className="mt-1 w-full rounded-xl border border-slate-700 bg-slate-900 p-3 text-white" />
          </label>
          <label className="block text-sm text-slate-300">
            Password (at least 10 characters)
            <input type="password" autoComplete="new-password" required minLength={10} maxLength={128} value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} placeholder="Create a password" className="mt-1 w-full rounded-xl border border-slate-700 bg-slate-900 p-3 text-white" />
          </label>
          <button type="submit" disabled={loading || registrationStatus !== 'ready'} className="w-full rounded-xl bg-gradient-to-r from-emerald-400 to-cyan-500 px-4 py-3 font-semibold text-slate-950 disabled:cursor-not-allowed disabled:opacity-50">{loading ? 'Creating account…' : registrationStatus === 'ready' ? 'Create account' : 'Setup required'}</button>
        </form>
        {message && <div className="mt-4 rounded-xl border border-red-500/40 bg-red-500/10 p-3 text-sm text-red-200" role="alert">{message}</div>}
        <div className="mt-4 text-sm text-slate-400"><Link to="/login">Already have an account? Sign in</Link></div>
      </div>
    </div>
  );
}

function ForgotPasswordPage() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-950 px-4">
      <div className="card-surface w-full max-w-md rounded-3xl p-8">
        <h1 className="text-3xl font-bold text-white">Forgot password</h1>
        <p className="mt-3 text-slate-300">A password reset link has been simulated for this demo. Use the default demo credentials or contact the admin.</p>
        <Link to="/login" className="mt-6 inline-block rounded-xl bg-cyan-500 px-5 py-3 font-semibold text-slate-950">Back to login</Link>
      </div>
    </div>
  );
}

function NotFoundPage() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-950 px-4 text-center text-white">
      <div>
        <div className="text-6xl font-black text-cyan-300">404</div>
        <h1 className="mt-4 text-3xl font-bold">Page not found</h1>
        <Link to="/" className="mt-6 inline-block rounded-full bg-emerald-500 px-5 py-3 font-semibold text-slate-950">Return Home</Link>
      </div>
    </div>
  );
}

function DashboardShell({ user, onLogout, children, navItems }: { user: any; onLogout: () => void; children: React.ReactNode; navItems: { label: string; href: string }[] }) {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const logout = async () => {
    try {
      if (localStorage.getItem('civicpulse-token')) await api.post('/auth/logout');
    } catch (error) {
      console.error('Logout API request failed', error);
    } finally {
      localStorage.removeItem('civicpulse-token');
      localStorage.removeItem('civicpulse-user');
      onLogout();
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      <header className="border-b border-slate-800 bg-slate-950/90 sticky top-0 z-30 backdrop-blur-xl">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-4">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-full bg-gradient-to-br from-emerald-400 to-cyan-500 font-bold text-slate-950">C</div>
            <div>
              <div className="text-sm uppercase tracking-[0.2em] text-cyan-200">CivicPulse AI</div>
            </div>
          </div>

          <div className="hidden items-center gap-6 md:flex">
            {navItems.map((item) => (
              <NavLink key={item.href} to={item.href} className={({ isActive }) => `text-sm ${isActive ? 'text-white' : 'text-slate-300 hover:text-white'}`}>
                {item.label}
              </NavLink>
            ))}
          </div>

          <div className="flex items-center gap-3">
            <ApiStatus />
            <div className={`rounded-full px-3 py-1 text-xs font-semibold ${getRoleStyle(user.role)}`}>{user.role}</div>
            <button onClick={logout} className="rounded-xl border border-slate-600 px-3 py-2 text-sm hover:border-slate-400">Logout</button>
            <button className="rounded-xl border border-slate-600 p-2 md:hidden" onClick={() => setMobileMenuOpen((current) => !current)}><Menu size={16} /></button>
          </div>
        </div>
        {mobileMenuOpen && (
          <div className="border-t border-slate-800 px-4 py-3 md:hidden">
            <div className="flex flex-col gap-3">
              {navItems.map((item) => (
                <NavLink key={item.href} to={item.href} onClick={() => setMobileMenuOpen(false)} className="text-slate-300">{item.label}</NavLink>
              ))}
            </div>
          </div>
        )}
      </header>

      <main className="mx-auto max-w-7xl px-4 py-6">{children}</main>
    </div>
  );
}

function ApiStatus() {
  const [status, setStatus] = useState('checking');
  useEffect(() => {
    let active = true;
    const check = async () => {
      try {
        const response = await api.get('/health');
        if (active) setStatus(response.data.database);
      } catch {
        if (active) setStatus('unavailable');
      }
    };
    void check();
    const interval = window.setInterval(check, 30000);
    return () => {
      active = false;
      window.clearInterval(interval);
    };
  }, []);
  const label = status === 'connected' ? 'DB connected' : status === 'not_configured' ? 'DB setup required' : status === 'disconnected' ? 'DB disconnected' : status === 'unavailable' ? 'API unavailable' : 'Checking API';
  const tone = status === 'connected' ? 'text-emerald-200 border-emerald-500/30' : 'text-amber-200 border-amber-500/30';
  return <span title="Live backend/database health" className={`hidden rounded-full border px-2 py-1 text-[10px] sm:inline ${tone}`}>{label}</span>;
}

function StatCard({ title, value, subtitle, tone = 'cyan' }: { title: string; value: string; subtitle: string; tone?: string }) {
  const palette: Record<string, string> = {
    cyan: 'from-cyan-500/20 to-sky-500/10 text-cyan-200 border-cyan-500/30',
    emerald: 'from-emerald-500/20 to-green-500/10 text-emerald-200 border-emerald-500/30',
    violet: 'from-violet-500/20 to-purple-500/10 text-violet-200 border-violet-500/30',
    amber: 'from-amber-500/20 to-orange-500/10 text-amber-200 border-amber-500/30',
    rose: 'from-rose-500/20 to-red-500/10 text-rose-200 border-rose-500/30'
  };

  return (
    <div className={`rounded-2xl border bg-gradient-to-br p-5 ${palette[tone] || palette.cyan}`}>
      <p className="text-xs uppercase tracking-[0.2em] text-slate-300">{title}</p>
      <div className="mt-4 text-3xl font-black text-white">{value}</div>
      <p className="mt-2 text-sm text-slate-300">{subtitle}</p>
    </div>
  );
}

function DashboardMap({ complaints }: { complaints: any[] }) {
  const hotspots = complaints.filter((complaint) => Number.isFinite(Number(complaint.latitude)) && Number.isFinite(Number(complaint.longitude))).slice(0, 100).map((complaint) => ({
    id: complaint.id,
    latitude: Number(complaint.latitude),
    longitude: Number(complaint.longitude),
    title: complaint.title,
    severity: complaint.severity === 'CRITICAL' ? 100 : complaint.severity === 'HIGH' ? 75 : 45
  }));

  return (
    <div className="card-surface rounded-3xl p-4">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-lg font-bold text-white">Complaint map</h3>
        <span className="text-xs uppercase tracking-[0.2em] text-slate-400">Live overview</span>
      </div>
      <MapContainer center={[28.6139, 77.209]} zoom={11} scrollWheelZoom>
        <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" attribution="&copy; OpenStreetMap contributors" />
        {hotspots.map((hotspot) => (
          <CircleMarker key={hotspot.id} center={[hotspot.latitude, hotspot.longitude]} radius={10 + hotspot.severity / 9} pathOptions={{ color: hotspot.severity > 70 ? '#f87171' : '#22d3ee', fillColor: '#38bdf8', fillOpacity: 0.7 }}>
            <Popup>{hotspot.title}</Popup>
          </CircleMarker>
        ))}
      </MapContainer>
    </div>
  );
}

function MapClickMarker({ position, onSelect }: { position: [number, number]; onSelect: (position: [number, number]) => void }) {
  useMapEvents({
    click(event) {
      onSelect([event.latlng.lat, event.latlng.lng]);
    },
  });
  return <Marker position={position}><Popup>Selected complaint location</Popup></Marker>;
}

function LocationPicker({ latitude, longitude, onSelect }: { latitude: string; longitude: string; onSelect: (lat: number, lon: number) => void }) {
  const position: [number, number] = latitude && longitude ? [Number(latitude), Number(longitude)] : [28.6139, 77.209];
  return (
    <div className="card-surface rounded-3xl p-4">
      <div className="mb-3 text-sm text-slate-300">Click the map to set the complaint location.</div>
      <MapContainer center={position} zoom={12} scrollWheelZoom style={{ height: 320, width: '100%' }}>
        <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" attribution="&copy; OpenStreetMap contributors" />
        <MapClickMarker position={position} onSelect={([lat, lon]) => onSelect(lat, lon)} />
      </MapContainer>
      <p className="mt-3 text-xs text-slate-400">Selected coordinates: {latitude || '—'}, {longitude || '—'}</p>
    </div>
  );
}

function CitizenDashboard({ user }: { user: any }) {
  const [data, setData] = useState({ overview: { totalComplaints: 0, pendingComplaints: 0, resolvedComplaints: 0, inProgressComplaints: 0, criticalCases: 0, averageResolutionDays: 0 }, complaints: [], notifications: [], alerts: [] });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    const fetchAll = async () => {
      try {
        const [complaintsRes, notificationsRes, overviewRes, alertsRes] = await Promise.all([
          api.get('/complaints'),
          api.get('/notifications'),
          api.get('/analytics/overview'),
          api.get('/alerts')
        ]);
        setData({
          overview: overviewRes.data.overview,
          complaints: complaintsRes.data.complaints,
          notifications: notificationsRes.data.notifications,
          alerts: alertsRes.data.alerts
        });
      } catch (error) {
        setError(getApiErrorMessage(error));
      } finally {
        setLoading(false);
      }
    };
    fetchAll();
  }, []);

  const chartData = useMemo<any[]>(() => [
    { name: 'Pending', value: Number(data.overview.pendingComplaints || 0) },
    { name: 'In Progress', value: Number(data.overview.inProgressComplaints || 0) },
    { name: 'Resolved', value: Number(data.overview.resolvedComplaints || 0) },
    { name: 'Critical', value: Number(data.overview.criticalCases || 0) }
  ], [data.overview]);

  return (
    <DashboardShell user={user} onLogout={() => window.location.href = '/'} navItems={[
      { label: 'Dashboard', href: '/citizen/dashboard' },
      { label: 'Report', href: '/citizen/report' },
      { label: 'Complaints', href: '/citizen/complaints' },
      { label: 'Alerts', href: '/citizen/alerts' },
      { label: 'Profile', href: '/citizen/profile' }
    ]}>
      <div className="space-y-6">
        {error && <div role="alert" className="rounded-xl border border-rose-500/40 bg-rose-500/10 p-4 text-sm text-rose-200">{error}</div>}
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm uppercase tracking-[0.2em] text-cyan-200">Citizen overview</p>
            <h1 className="mt-2 text-3xl font-black text-white">Good morning, {user.name.split(' ')[0]}</h1>
          </div>
          <Link to="/citizen/report" className="rounded-full bg-gradient-to-r from-emerald-400 to-cyan-500 px-5 py-3 font-semibold text-slate-950">Report New Complaint</Link>
        </div>

        {loading ? <div className="rounded-2xl border border-slate-700 bg-slate-900 p-6 text-slate-300">Loading citizen dashboard…</div> : (
          <>
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
              <StatCard title="Total complaints" value={String(data.overview.totalComplaints)} subtitle="All registered complaints" tone="cyan" />
              <StatCard title="Pending" value={String(data.overview.pendingComplaints)} subtitle="Awaiting attention" tone="amber" />
              <StatCard title="Resolved" value={String(data.overview.resolvedComplaints)} subtitle="Closed and verified" tone="emerald" />
              <StatCard title="Avg. resolution" value={`${data.overview.averageResolutionDays || 0}d`} subtitle="Average days to close" tone="violet" />
            </div>

            <div className="grid gap-6 lg:grid-cols-[1.1fr_0.9fr]">
              <div className="card-surface rounded-3xl p-5">
                <h3 className="mb-4 text-lg font-bold text-white">Complaint status chart</h3>
                <ResponsiveContainer width="100%" height={260}>
                  <BarChart data={chartData}>
                    <CartesianGrid stroke="#334155" />
                    <XAxis dataKey="name" stroke="#94a3b8" />
                    <YAxis stroke="#94a3b8" />
                    <Tooltip />
                    <Bar dataKey="value" fill="#38bdf8" radius={[5, 5, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
              <div className="card-surface rounded-3xl p-5">
                <h3 className="mb-4 text-lg font-bold text-white">Nearby alerts</h3>
                <div className="space-y-3">
                  {(data.alerts || []).slice(0, 4).map((alert: any) => (
                    <div key={alert.id} className="rounded-2xl border border-amber-500/30 bg-amber-500/10 p-3">
                      <div className="flex items-center justify-between">
                        <p className="font-semibold text-white">{alert.title}</p>
                        <span className="text-xs uppercase text-amber-200">{alert.severity}</span>
                      </div>
                      <p className="mt-2 text-sm text-slate-300">{alert.description}</p>
                    </div>
                  ))}
                  {!data.alerts.length && <p className="text-sm text-slate-400">No active public alerts.</p>}
                </div>
              </div>
            </div>

            <DashboardMap complaints={data.complaints} />

            <div className="grid gap-6 lg:grid-cols-[1.2fr_0.8fr]">
              <div className="card-surface rounded-3xl p-5">
                <h3 className="mb-4 text-lg font-bold text-white">Recent complaints</h3>
                <div className="space-y-3">
                  {(data.complaints || []).slice(0, 5).map((complaint: any) => (
                    <div key={complaint.id} className="flex items-center justify-between rounded-2xl border border-slate-700 bg-slate-900/60 p-3">
                      <div>
                        <div className="font-medium text-white">{complaint.title}</div>
                        <div className="text-sm text-slate-400">{complaint.category} • {complaint.status}</div>
                      </div>
                      <Link to={`/citizen/complaints/${complaint.id}`} className="text-cyan-300">Open</Link>
                    </div>
                  ))}
                  {!data.complaints.length && <p className="text-sm text-slate-400">No complaints have been submitted yet.</p>}
                </div>
              </div>
              <div className="card-surface rounded-3xl p-5">
                <h3 className="mb-4 text-lg font-bold text-white">Notifications</h3>
                <div className="space-y-3">
                  {(data.notifications || []).slice(0, 4).map((notification: any) => (
                    <div key={notification.id} className="rounded-2xl border border-slate-700 bg-slate-900/60 p-3">
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-medium text-white">{notification.title}</span>
                        <Bell size={14} className="text-cyan-300" />
                      </div>
                      <p className="mt-2 text-sm text-slate-300">{notification.message}</p>
                    </div>
                  ))}
                  {!data.notifications.length && <p className="text-sm text-slate-400">No notifications yet.</p>}
                </div>
              </div>
            </div>
          </>
        )}
      </div>
    </DashboardShell>
  );
}

function CitizenReportPage({ user }: { user: any }) {
  const [form, setForm] = useState({ title: '', description: '', category: 'Other', location: '', latitude: '', longitude: '', address: '', contactPreference: 'email' });
  const [attachments, setAttachments] = useState<File[]>([]);
  const [message, setMessage] = useState('');
  const [analysis, setAnalysis] = useState<any>(null);
  const navigate = useNavigate();

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const payload = {
      ...form,
      latitude: form.latitude ? Number(form.latitude) : undefined,
      longitude: form.longitude ? Number(form.longitude) : undefined,
      ward: form.location || undefined,
    };
    let createdComplaintNumber = '';
    try {
      const response = await api.post('/complaints', payload);
      createdComplaintNumber = response.data.complaint.complaint_number;
      for (const file of attachments) {
        const fileData = new FormData();
        fileData.append('file', file);
        await api.post(`/complaints/${response.data.complaint.id}/attachments`, fileData);
      }
      setAnalysis(response.data.analysis);
      setMessage(`Complaint ${response.data.complaint.complaint_number} submitted successfully.`);
      setTimeout(() => navigate('/citizen/complaints'), 1500);
    } catch (error: any) {
      const detail = getApiErrorMessage(error);
      setMessage(createdComplaintNumber
        ? `Complaint ${createdComplaintNumber} was saved, but an attachment could not be uploaded: ${detail}`
        : detail);
    }
  };

  return (
    <DashboardShell user={user} onLogout={() => window.location.href = '/'} navItems={[
      { label: 'Dashboard', href: '/citizen/dashboard' },
      { label: 'Report', href: '/citizen/report' },
      { label: 'Complaints', href: '/citizen/complaints' },
      { label: 'Alerts', href: '/citizen/alerts' },
      { label: 'Profile', href: '/citizen/profile' }
    ]}>
      <div className="grid gap-6 xl:grid-cols-[1.1fr_0.9fr]">
        <form onSubmit={handleSubmit} className="card-surface rounded-3xl p-6">
          <h1 className="mb-6 text-3xl font-bold text-white">Report a civic issue</h1>
          <div className="grid gap-4 md:grid-cols-2">
            <div className="md:col-span-2"><label className="mb-2 block text-sm text-slate-300">Complaint title</label><input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} className="w-full rounded-xl border border-slate-700 bg-slate-900 p-3 text-white" /></div>
            <div className="md:col-span-2"><label className="mb-2 block text-sm text-slate-300">Description</label><textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} className="h-32 w-full rounded-xl border border-slate-700 bg-slate-900 p-3 text-white" /></div>
            <div><label className="mb-2 block text-sm text-slate-300">Category</label><select value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} className="w-full rounded-xl border border-slate-700 bg-slate-900 p-3 text-white"><option>Water</option><option>Electricity</option><option>Roads</option><option>Garbage</option><option>Drainage</option><option>Street Lights</option><option>Public Transport</option><option>Sanitation</option><option>Pollution</option><option>Public Safety</option><option>Government Services</option><option>Other</option></select></div>
            <div><label className="mb-2 block text-sm text-slate-300">Ward / area</label><input value={form.location} onChange={(e) => setForm({ ...form, location: e.target.value })} className="w-full rounded-xl border border-slate-700 bg-slate-900 p-3 text-white" /></div>
            <div><label className="mb-2 block text-sm text-slate-300">Latitude</label><input value={form.latitude} onChange={(e) => setForm({ ...form, latitude: e.target.value })} className="w-full rounded-xl border border-slate-700 bg-slate-900 p-3 text-white" /></div>
            <div><label className="mb-2 block text-sm text-slate-300">Longitude</label><input value={form.longitude} onChange={(e) => setForm({ ...form, longitude: e.target.value })} className="w-full rounded-xl border border-slate-700 bg-slate-900 p-3 text-white" /></div>
            <div className="md:col-span-2"><label className="mb-2 block text-sm text-slate-300">Address</label><input value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} className="w-full rounded-xl border border-slate-700 bg-slate-900 p-3 text-white" /></div>
            <div className="md:col-span-2"><label className="mb-2 block text-sm text-slate-300">Attachments (JPEG, PNG or PDF; max 5 MB each)</label><input type="file" accept="image/jpeg,image/png,application/pdf" multiple onChange={(e) => setAttachments(Array.from(e.target.files || []).slice(0, 3))} className="w-full rounded-xl border border-slate-700 bg-slate-900 p-3 text-white" /></div>
            <div className="md:col-span-2"><label className="mb-2 block text-sm text-slate-300">Contact preference</label><select value={form.contactPreference} onChange={(e) => setForm({ ...form, contactPreference: e.target.value })} className="w-full rounded-xl border border-slate-700 bg-slate-900 p-3 text-white"><option value="email">Email</option><option value="sms">SMS</option><option value="phone">Phone</option></select></div>
          </div>
          <button type="submit" className="mt-6 w-full rounded-xl bg-gradient-to-r from-emerald-400 to-cyan-500 px-4 py-3 font-semibold text-slate-950">Submit grievance</button>
          {message && <div className="mt-4 rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-3 text-sm text-emerald-200">{message}</div>}
        </form>

        <div className="space-y-6">
          <div className="card-surface rounded-3xl p-5">
            <h3 className="text-lg font-bold text-white">AI classification</h3>
            {analysis ? (
              <div className="mt-4 space-y-3 text-sm text-slate-300">
                <div className="flex justify-between"><span>Category</span><strong className="text-white">{analysis.category}</strong></div>
                <div className="flex justify-between"><span>Severity</span><strong className="text-white">{analysis.severity}</strong></div>
                <div className="flex justify-between"><span>Priority</span><strong className="text-white">{analysis.priority}</strong></div>
                <div className="flex justify-between"><span>Department</span><strong className="text-white">{analysis.department}</strong></div>
                <div className="flex justify-between"><span>AI confidence</span><strong className="text-white">{Math.round(analysis.confidence * 100)}%</strong></div>
                <div className="flex justify-between"><span>AI severity estimate</span><strong className="text-white">{analysis.severity}</strong></div>
              </div>
            ) : (
              <p className="mt-3 text-slate-400">AI-generated analysis will appear after you submit the grievance.</p>
            )}
          </div>
          <LocationPicker
            latitude={form.latitude}
            longitude={form.longitude}
            onSelect={(latitude, longitude) => setForm((current) => ({ ...current, latitude: String(latitude), longitude: String(longitude) }))}
          />
        </div>
      </div>
    </DashboardShell>
  );
}

function CitizenComplaintsPage({ user }: { user: any }) {
  const [complaints, setComplaints] = useState<any[]>([]);
  useEffect(() => { api.get('/complaints').then((r) => setComplaints(r.data.complaints)).catch(console.error); }, []);

  return (
    <DashboardShell user={user} onLogout={() => window.location.href = '/'} navItems={[
      { label: 'Dashboard', href: '/citizen/dashboard' },
      { label: 'Report', href: '/citizen/report' },
      { label: 'Complaints', href: '/citizen/complaints' },
      { label: 'Alerts', href: '/citizen/alerts' },
      { label: 'Profile', href: '/citizen/profile' }
    ]}>
      <div className="card-surface rounded-3xl p-6">
        <div className="mb-6 flex items-center justify-between">
          <h1 className="text-3xl font-bold text-white">My complaints</h1>
          <Link to="/citizen/report" className="rounded-full bg-emerald-500 px-4 py-2 font-semibold text-slate-950">New report</Link>
        </div>
        <div className="space-y-4">
          {(complaints || []).map((complaint) => (
            <div key={complaint.id} className="rounded-2xl border border-slate-700 bg-slate-900/70 p-4">
              <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                <div>
                  <div className="text-lg font-semibold text-white">{complaint.title}</div>
                  <div className="text-sm text-slate-400">{complaint.category} • {complaint.status} • {new Date(complaint.created_at).toLocaleDateString()}</div>
                </div>
                <div className="flex items-center gap-3">
                  <span className="rounded-full border border-cyan-500/20 bg-cyan-500/10 px-2 py-1 text-xs text-cyan-200">{complaint.priority}</span>
                  <Link to={`/citizen/complaints/${complaint.id}`} className="rounded-lg bg-slate-800 px-3 py-2 text-sm hover:bg-slate-700">View</Link>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </DashboardShell>
  );
}

function CitizenAlertsPage({ user }: { user: any }) {
  const [alerts, setAlerts] = useState<any[]>([]);
  useEffect(() => {
    api.get('/alerts').then((response) => setAlerts(response.data.alerts)).catch(console.error);
  }, []);

  return (
    <DashboardShell user={user} onLogout={() => window.location.href = '/'} navItems={[
      { label: 'Dashboard', href: '/citizen/dashboard' },
      { label: 'Report', href: '/citizen/report' },
      { label: 'Complaints', href: '/citizen/complaints' },
      { label: 'Alerts', href: '/citizen/alerts' },
      { label: 'Profile', href: '/citizen/profile' }
    ]}>
      <div className="card-surface rounded-3xl p-6">
        <h1 className="mb-6 text-3xl font-bold text-white">Public alerts</h1>
        <div className="space-y-4">
          {alerts.map((alert) => (
            <div key={alert.id} className="rounded-2xl border border-amber-500/30 bg-amber-500/10 p-4">
              <div className="flex items-center justify-between">
                <h3 className="text-xl font-semibold text-white">{alert.title}</h3>
                <span className="rounded-full border border-amber-500/30 bg-amber-500/10 px-2 py-1 text-xs uppercase text-amber-200">{alert.severity}</span>
              </div>
              <p className="mt-2 text-slate-200">{alert.description}</p>
              <div className="mt-3 text-sm text-slate-300">Area: {alert.area || 'Area not specified'}</div>
            </div>
          ))}
        </div>
      </div>
    </DashboardShell>
  );
}

function CitizenProfilePage({ user }: { user: any }) {
  return (
    <DashboardShell user={user} onLogout={() => window.location.href = '/'} navItems={[
      { label: 'Dashboard', href: '/citizen/dashboard' },
      { label: 'Report', href: '/citizen/report' },
      { label: 'Complaints', href: '/citizen/complaints' },
      { label: 'Alerts', href: '/citizen/alerts' },
      { label: 'Profile', href: '/citizen/profile' }
    ]}>
      <div className="card-surface rounded-3xl p-6">
        <h1 className="text-3xl font-bold text-white">Profile</h1>
        <div className="mt-6 grid gap-6 md:grid-cols-2">
          <div className="rounded-2xl border border-slate-700 bg-slate-900 p-4"><p className="text-sm text-slate-400">Name</p><p className="mt-2 text-xl text-white">{user.name}</p></div>
          <div className="rounded-2xl border border-slate-700 bg-slate-900 p-4"><p className="text-sm text-slate-400">Email</p><p className="mt-2 text-xl text-white">{user.email}</p></div>
          <div className="rounded-2xl border border-slate-700 bg-slate-900 p-4"><p className="text-sm text-slate-400">Role</p><p className="mt-2 text-xl text-white">{user.role}</p></div>
          <div className="rounded-2xl border border-slate-700 bg-slate-900 p-4"><p className="text-sm text-slate-400">Status</p><p className="mt-2 text-xl text-white">{user.is_active ? 'Active' : 'Inactive'}</p></div>
        </div>
      </div>
    </DashboardShell>
  );
}

function OfficerDashboard({ user }: { user: any }) {
  const [complaints, setComplaints] = useState<any[]>([]);
  const [alerts, setAlerts] = useState<any[]>([]);
  const [predictions, setPredictions] = useState<any[]>([]);
  useEffect(() => {
    Promise.all([api.get('/complaints'), api.get('/alerts'), api.get('/predictions')]).then(([complaintsRes, alertsRes, predictionsRes]) => {
      setComplaints(complaintsRes.data.complaints);
      setAlerts(alertsRes.data.alerts);
      setPredictions(predictionsRes.data.predictions);
    }).catch(console.error);
  }, []);

  return (
    <DashboardShell user={user} onLogout={() => window.location.href = '/'} navItems={[
      { label: 'Dashboard', href: '/officer/dashboard' },
      { label: 'Complaints', href: '/officer/complaints' },
      { label: 'Clusters', href: '/officer/clusters' },
      { label: 'Alerts', href: '/officer/alerts' }
    ]}>
      <div className="space-y-6">
        <div className="grid gap-4 md:grid-cols-4">
          <StatCard title="Assigned / available" value={String(complaints.length)} subtitle="Officer work queue" tone="cyan" />
          <StatCard title="Critical" value={String(complaints.filter((c) => c.severity === 'CRITICAL').length)} subtitle="Priority cases" tone="rose" />
          <StatCard title="In progress" value={String(complaints.filter((c) => c.status_code === 'IN_PROGRESS').length)} subtitle="Ongoing work" tone="amber" />
          <StatCard title="AI-estimated risk areas" value={String(predictions.length)} subtitle="Based on recorded complaints" tone="emerald" />
        </div>

        <div className="grid gap-6 lg:grid-cols-[1.2fr_0.8fr]">
          <div className="card-surface rounded-3xl p-5">
            <h3 className="text-lg font-bold text-white">Priority queue</h3>
            <div className="mt-4 space-y-3">
              {complaints.slice(0, 5).map((complaint) => (
                <div key={complaint.id} className="flex items-center justify-between rounded-2xl border border-slate-700 p-3">
                  <div>
                    <div className="font-medium text-white">{complaint.title}</div>
                    <div className="text-sm text-slate-400">{complaint.category} • {complaint.status}</div>
                  </div>
                  <Link to={`/officer/complaints/${complaint.id}`} className="rounded-lg bg-slate-800 px-3 py-2 text-sm">Review</Link>
                </div>
              ))}
            </div>
          </div>

          <div className="card-surface rounded-3xl p-5">
            <h3 className="text-lg font-bold text-white">Predictive alerts</h3>
            <div className="mt-4 space-y-3">
              {(alerts || []).slice(0, 3).map((alert) => (
                <div key={alert.id} className="rounded-2xl border border-amber-500/30 bg-amber-500/10 p-3">
                  <div className="font-medium text-white">{alert.title}</div>
                  <div className="mt-2 text-sm text-slate-300">{alert.description}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </DashboardShell>
  );
}

function OfficerComplaintsPage({ user }: { user: any }) {
  const [complaints, setComplaints] = useState<any[]>([]);
  const [error, setError] = useState('');
  const fetchComplaints = () => api.get('/complaints').then((r) => setComplaints(r.data.complaints)).catch((e) => setError(getApiErrorMessage(e)));
  useEffect(() => { fetchComplaints(); }, []);

  const handleStatusUpdate = async (id: string, status: string) => {
    try {
      await api.put(`/complaints/${id}/status`, { status: status.toUpperCase().replaceAll(' ', '_'), comment: `Updated by ${user.name}` });
      setError('');
      fetchComplaints();
    } catch (e) {
      setError(getApiErrorMessage(e));
    }
  };

  return (
    <DashboardShell user={user} onLogout={() => window.location.href = '/'} navItems={[
      { label: 'Dashboard', href: '/officer/dashboard' },
      { label: 'Complaints', href: '/officer/complaints' },
      { label: 'Clusters', href: '/officer/clusters' },
      { label: 'Alerts', href: '/officer/alerts' }
    ]}>
      <div className="card-surface rounded-3xl p-6">
        <h1 className="mb-6 text-3xl font-bold text-white">Assigned complaints</h1>
        {error && <p role="alert" className="mb-4 text-rose-200">{error}</p>}
        {!error && complaints.length === 0 && <p className="mb-4 text-slate-400">No complaints have been submitted yet.</p>}
        <div className="space-y-4">
          {complaints.map((complaint) => (
            <div key={complaint.id} className="rounded-2xl border border-slate-700 bg-slate-900/70 p-4">
              <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                <div>
                  <div className="text-lg font-semibold text-white">{complaint.title}</div>
                  <div className="text-sm text-slate-400">{complaint.location} • {complaint.priority} • {complaint.status}</div>
                </div>
                <div className="flex flex-wrap gap-2">
                  <button onClick={() => handleStatusUpdate(complaint.id, 'In Progress')} className="rounded-lg bg-cyan-500 px-3 py-2 text-sm font-semibold text-slate-950">In Progress</button>
                  <button onClick={() => handleStatusUpdate(complaint.id, 'Resolved')} className="rounded-lg bg-emerald-500 px-3 py-2 text-sm font-semibold text-slate-950">Resolve</button>
                  <Link to={`/officer/complaints/${complaint.id}`} className="rounded-lg border border-slate-600 px-3 py-2 text-sm">Details</Link>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </DashboardShell>
  );
}

function OfficerClustersPage({ user }: { user: any }) {
  const [clusters, setClusters] = useState<any[]>([]);
  useEffect(() => { api.get('/clusters').then((r) => setClusters(r.data.clusters)).catch(console.error); }, []);

  return (
    <DashboardShell user={user} onLogout={() => window.location.href = '/'} navItems={[
      { label: 'Dashboard', href: '/officer/dashboard' },
      { label: 'Complaints', href: '/officer/complaints' },
      { label: 'Clusters', href: '/officer/clusters' },
      { label: 'Alerts', href: '/officer/alerts' }
    ]}>
      <div className="card-surface rounded-3xl p-6">
        <h1 className="mb-6 text-3xl font-bold text-white">Active clusters</h1>
        <div className="grid gap-4 md:grid-cols-2">
          {clusters.map((cluster) => (
            <div key={cluster.clusterId} className="rounded-2xl border border-slate-700 bg-slate-900/70 p-4">
              <div className="text-lg font-semibold text-white">{cluster.issue || cluster.category_id || 'Complaint cluster'} • {cluster.area}</div>
              <div className="mt-2 text-sm text-slate-300">Complaints: {cluster.complaint_count ?? cluster.complaintCount} • Area: {cluster.area}</div>
              {cluster.trend && <div className="mt-2 text-sm text-cyan-300">Trend: {cluster.trend}</div>}
            </div>
          ))}
        </div>
      </div>
    </DashboardShell>
  );
}

function OfficerAlertsPage({ user }: { user: any }) {
  const [alerts, setAlerts] = useState<any[]>([]);
  useEffect(() => { api.get('/alerts').then((r) => setAlerts(r.data.alerts)).catch(console.error); }, []);

  return (
    <DashboardShell user={user} onLogout={() => window.location.href = '/'} navItems={[
      { label: 'Dashboard', href: '/officer/dashboard' },
      { label: 'Complaints', href: '/officer/complaints' },
      { label: 'Clusters', href: '/officer/clusters' },
      { label: 'Alerts', href: '/officer/alerts' }
    ]}>
      <div className="card-surface rounded-3xl p-6">
        <h1 className="mb-6 text-3xl font-bold text-white">Officer alerts</h1>
        <div className="space-y-4">
          {alerts.map((alert) => (
            <div key={alert.id} className="rounded-2xl border border-amber-500/30 bg-amber-500/10 p-4">
              <div className="font-semibold text-white">{alert.title}</div>
              <p className="mt-2 text-slate-200">{alert.description}</p>
            </div>
          ))}
        </div>
      </div>
    </DashboardShell>
  );
}

function AdminDashboard({ user }: { user: any }) {
  const [data, setData] = useState<any>({ overview: {}, categories: [], clusters: [], hotspots: [], riskAlert: null, users: [], alerts: [], trend: [], complaints: [] });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    let active = true;
    const loadDashboard = async () => {
      try {
        const [overviewRes, userRes, alertsRes, predictionsRes, complaintsRes] = await Promise.all([
          api.get('/analytics/overview'),
          api.get('/admin/users'),
          api.get('/admin/alerts'),
          api.get('/admin/predictions'),
          api.get('/complaints'),
        ]);
        if (!active) return;
        setData({
          overview: overviewRes.data.overview,
          categories: overviewRes.data.categories,
          clusters: overviewRes.data.clusters,
          hotspots: overviewRes.data.hotspots,
          riskAlert: overviewRes.data.riskAlert,
          users: userRes.data.users,
          alerts: alertsRes.data.alerts,
          predictions: predictionsRes.data.predictions,
          trend: overviewRes.data.trend,
          complaints: complaintsRes.data.complaints,
        });
        setError('');
      } catch (requestError) {
        if (active) setError(getApiErrorMessage(requestError));
      } finally {
        if (active) setLoading(false);
      }
    };
    void loadDashboard();
    const refresh = window.setInterval(loadDashboard, 30000);
    return () => {
      active = false;
      window.clearInterval(refresh);
    };
  }, []);

  return (
    <DashboardShell user={user} onLogout={() => window.location.href = '/'} navItems={[
      { label: 'Dashboard', href: '/admin/dashboard' },
      { label: 'Complaints', href: '/admin/complaints' },
      { label: 'Users', href: '/admin/users' },
      { label: 'Departments', href: '/admin/departments' },
      { label: 'Clusters', href: '/admin/clusters' },
      { label: 'Hotspots', href: '/admin/hotspots' },
      { label: 'Predictions', href: '/admin/predictions' },
      { label: 'Analytics', href: '/admin/analytics' },
      { label: 'Alerts', href: '/admin/alerts' },
      { label: 'Settings', href: '/admin/settings' }
    ]}>
      <div className="space-y-6">
        {error && <div role="alert" className="rounded-xl border border-rose-500/40 bg-rose-500/10 p-4 text-sm text-rose-200">{error}</div>}
        {loading && <p className="text-sm text-slate-400">Loading live data from the API…</p>}
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
          <StatCard title="Total complaints" value={String(data.overview.totalComplaints || 0)} subtitle="System-wide" tone="cyan" />
          <StatCard title="Pending" value={String(data.overview.pendingComplaints || 0)} subtitle="Pending review" tone="amber" />
          <StatCard title="Critical" value={String(data.overview.criticalCases || 0)} subtitle="Urgent action" tone="rose" />
          <StatCard title="Hotspots" value={String(data.hotspots?.length || 0)} subtitle="AI-detected" tone="violet" />
          <StatCard title="Avg. resolution" value={`${data.overview.averageResolutionDays || 0}d`} subtitle="Days to close" tone="emerald" />
        </div>

        <div className="grid gap-6 xl:grid-cols-[1.3fr_0.7fr]">
          <div className="card-surface rounded-3xl p-5">
            <h3 className="text-lg font-bold text-white">Complaint trend</h3>
            {data.trend.length ? <ResponsiveContainer width="100%" height={260}>
              <LineChart data={data.trend}>
                <XAxis dataKey="name" stroke="#94a3b8" />
                <YAxis stroke="#94a3b8" />
                <Line type="monotone" dataKey="value" stroke="#34d399" strokeWidth={3} dot={{ r: 3 }} />
                <Tooltip />
              </LineChart>
            </ResponsiveContainer> : <p className="mt-4 text-sm text-slate-400">No complaints have been submitted yet.</p>}
          </div>
          <div className="card-surface rounded-3xl p-5">
            <h3 className="text-lg font-bold text-white">Category mix</h3>
            {data.categories.length ? <ResponsiveContainer width="100%" height={260}>
              <PieChart>
                <Pie data={data.categories} dataKey="value" nameKey="name" outerRadius={70} innerRadius={40} fill="#38bdf8" label />
                <Tooltip />
              </PieChart>
            </ResponsiveContainer> : <p className="mt-4 text-sm text-slate-400">No category data is available yet.</p>}
          </div>
        </div>

        <div className="grid gap-6 lg:grid-cols-[1.1fr_0.9fr]">
          <div className="card-surface rounded-3xl p-5">
            <h3 className="text-lg font-bold text-white">Predictive alert</h3>
            <div className="mt-4 rounded-2xl border border-violet-500/30 bg-violet-500/10 p-4">
              {data.riskAlert ? <>
                <div className="text-lg font-semibold text-white">{data.riskAlert.area}</div>
                <div className="mt-2 text-sm text-slate-200">AI-estimated risk: {data.riskAlert.issue}</div>
                <div className="mt-2 text-sm text-cyan-300">Risk score: {data.riskAlert.riskScore}/100 • {data.riskAlert.riskLevel}</div>
              </> : <p className="text-sm text-slate-300">No complaint data is available for risk estimation.</p>}
            </div>
            <DashboardMap complaints={data.complaints} />
          </div>
          <div className="card-surface rounded-3xl p-5">
            <h3 className="text-lg font-bold text-white">System activity</h3>
            <div className="mt-4 space-y-3 text-sm text-slate-300">
              {data.users?.slice(0, 4).map((userData: any) => (
                <div key={userData.id} className="flex items-center justify-between rounded-2xl border border-slate-700 bg-slate-900/60 p-3">
                  <span>{userData.name}</span>
                  <span className={getRoleStyle(userData.role)}>{userData.role}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </DashboardShell>
  );
}

function AdminComplaintsPage({ user }: { user: any }) {
  const [complaints, setComplaints] = useState<any[]>([]);
  const [error, setError] = useState('');
  
  const fetchComplaints = () => {
    api.get('/complaints')
      .then((r) => setComplaints(r.data.complaints))
      .catch((e) => setError(getApiErrorMessage(e)));
  };

  useEffect(() => { fetchComplaints(); }, []);

  const handleStatusUpdate = async (id: string, status: string) => {
    try {
      await api.put(`/complaints/${id}/status`, { status, comment: `Updated by Admin (${user.name})` });
      setError('');
      fetchComplaints();
    } catch (e) {
      setError(getApiErrorMessage(e));
    }
  };

  return (
    <DashboardShell user={user} onLogout={() => window.location.href = '/'} navItems={[
      { label: 'Dashboard', href: '/admin/dashboard' },
      { label: 'Complaints', href: '/admin/complaints' },
      { label: 'Users', href: '/admin/users' },
      { label: 'Departments', href: '/admin/departments' },
      { label: 'Clusters', href: '/admin/clusters' },
      { label: 'Hotspots', href: '/admin/hotspots' },
      { label: 'Predictions', href: '/admin/predictions' },
      { label: 'Analytics', href: '/admin/analytics' },
      { label: 'Alerts', href: '/admin/alerts' },
      { label: 'Settings', href: '/admin/settings' }
    ]}>
      <div className="card-surface rounded-3xl p-6">
        <h1 className="mb-6 text-3xl font-bold text-white">All complaints</h1>
        {error && <p role="alert" className="mb-4 text-rose-200">{error}</p>}
        {!error && complaints.length === 0 && <p className="mb-4 text-slate-400">No complaints have been submitted yet.</p>}
        <div className="table-scroll">
          <table className="min-w-full text-left text-sm text-slate-300">
            <thead className="text-slate-400"><tr><th className="p-3">ID</th><th className="p-3">Title</th><th className="p-3">Category</th><th className="p-3">Priority</th><th className="p-3">Status</th><th className="p-3">Actions</th></tr></thead>
            <tbody>
              {complaints.map((complaint) => (
                <tr key={complaint.id} className="border-t border-slate-700">
                  <td className="p-3 text-white">{complaint.complaint_id}</td>
                  <td className="p-3">{complaint.title}</td>
                  <td className="p-3">{complaint.category}</td>
                  <td className="p-3 text-cyan-300">{complaint.priority}</td>
                  <td className="p-3">{complaint.status}</td>
                  <td className="p-3 flex gap-2">
                    <button onClick={() => handleStatusUpdate(complaint.id, 'Approved')} className="rounded-lg bg-emerald-500 px-3 py-1 text-xs font-semibold text-slate-950">Approve</button>
                    <button onClick={() => handleStatusUpdate(complaint.id, 'Resolved')} className="rounded-lg bg-cyan-500 px-3 py-1 text-xs font-semibold text-slate-950">Resolve</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </DashboardShell>
  );
}

function AdminUsersPage({ user }: { user: any }) {
  const [users, setUsers] = useState<any[]>([]);
  const [error, setError] = useState('');
  useEffect(() => { api.get('/admin/users').then((r) => setUsers(r.data.users)).catch((e) => setError(getApiErrorMessage(e))); }, []);
  return (
    <DashboardShell user={user} onLogout={() => window.location.href = '/'} navItems={[
      { label: 'Dashboard', href: '/admin/dashboard' },
      { label: 'Complaints', href: '/admin/complaints' },
      { label: 'Users', href: '/admin/users' },
      { label: 'Departments', href: '/admin/departments' },
      { label: 'Clusters', href: '/admin/clusters' },
      { label: 'Hotspots', href: '/admin/hotspots' },
      { label: 'Predictions', href: '/admin/predictions' },
      { label: 'Analytics', href: '/admin/analytics' },
      { label: 'Alerts', href: '/admin/alerts' },
      { label: 'Settings', href: '/admin/settings' }
    ]}>
      <div className="card-surface rounded-3xl p-6">
        <h1 className="mb-6 text-3xl font-bold text-white">User management</h1>
        {error && <p role="alert" className="mb-4 text-rose-200">{error}</p>}
        {!error && users.length === 0 && <p className="mb-4 text-slate-400">No registered users yet.</p>}
        <div className="space-y-3">
          {users.map((person) => (
            <div key={person.id} className="flex items-center justify-between rounded-2xl border border-slate-700 bg-slate-900/70 p-4">
              <div>
                <div className="font-medium text-white">{person.name}</div>
                <div className="text-sm text-slate-400">{person.email}</div>
              </div>
              <span className={getRoleStyle(person.role)}>{person.role}</span>
            </div>
          ))}
        </div>
      </div>
    </DashboardShell>
  );
}

function AdminOfficersPage({ user }: { user: any }) {
  const [officers, setOfficers] = useState<any[]>([]);
  useEffect(() => { api.get('/admin/officers').then((response) => setOfficers(response.data.officers)).catch(console.error); }, []);
  return <DashboardShell user={user} onLogout={() => window.location.href = '/'} navItems={adminNavItems}><div className="card-surface rounded-3xl p-6"><h1 className="mb-5 text-3xl font-bold text-white">Officer roster</h1>{officers.length ? officers.map((officer) => <div key={officer.id} className="mb-3 rounded-xl border border-slate-700 p-4 text-white">{officer.name} <span className="ml-2 text-sm text-slate-400">{officer.email}</span></div>) : <p className="text-slate-400">No officer accounts have been provisioned yet.</p>}</div></DashboardShell>;
}
function AdminDepartmentsPage({ user }: { user: any }) {
  const [departments, setDepartments] = useState<any[]>([]);
  useEffect(() => { api.get('/admin/departments').then((response) => setDepartments(response.data.departments)).catch(console.error); }, []);
  return <DashboardShell user={user} onLogout={() => window.location.href = '/'} navItems={adminNavItems}><div className="card-surface rounded-3xl p-6"><h1 className="mb-5 text-3xl font-bold text-white">Departments</h1>{departments.length ? departments.map((department) => <div key={department.id} className="mb-3 rounded-xl border border-slate-700 p-4 text-white">{department.name}</div>) : <p className="text-slate-400">No departments have been configured.</p>}</div></DashboardShell>;
}
const adminNavItems = [
  { label: 'Dashboard', href: '/admin/dashboard' },
  { label: 'Complaints', href: '/admin/complaints' },
  { label: 'Users', href: '/admin/users' },
  { label: 'Officers', href: '/admin/officers' },
  { label: 'Departments', href: '/admin/departments' },
  { label: 'Clusters', href: '/admin/clusters' },
  { label: 'Hotspots', href: '/admin/hotspots' },
  { label: 'Predictions', href: '/admin/predictions' },
  { label: 'Analytics', href: '/admin/analytics' },
  { label: 'Alerts', href: '/admin/alerts' },
];
function AdminClustersPage({ user }: { user: any }) {
  const [clusters, setClusters] = useState<any[]>([]);
  useEffect(() => { api.get('/admin/clusters').then((response) => setClusters(response.data.clusters)).catch(console.error); }, []);
  return <DashboardShell user={user} onLogout={() => window.location.href = '/'} navItems={adminNavItems}><div className="card-surface rounded-3xl p-6"><h1 className="mb-5 text-3xl font-bold text-white">Complaint clusters</h1>{clusters.length ? clusters.map((cluster, index) => <div key={`${cluster.area}-${cluster.category_id}-${index}`} className="mb-3 rounded-xl border border-slate-700 p-4 text-white">{cluster.area} · {cluster.complaint_count} related complaints</div>) : <p className="text-slate-400">No related complaint clusters yet.</p>}</div></DashboardShell>;
}
function AdminHotspotsPage({ user }: { user: any }) {
  const [hotspots, setHotspots] = useState<any[]>([]);
  useEffect(() => { api.get('/admin/hotspots').then((response) => setHotspots(response.data.hotspots)).catch(console.error); }, []);
  return <DashboardShell user={user} onLogout={() => window.location.href = '/'} navItems={adminNavItems}><div className="card-surface rounded-3xl p-6"><h1 className="mb-5 text-3xl font-bold text-white">AI-estimated hotspots</h1>{hotspots.length ? hotspots.map((hotspot: any) => <div key={hotspot.area} className="mb-3 rounded-xl border border-slate-700 p-4 text-white">{hotspot.area}: {hotspot.risk_score}/100 · {hotspot.risk_level} · {hotspot.complaint_count} complaints</div>) : <p className="text-slate-400">No hotspots can be estimated from current complaint data.</p>}</div></DashboardShell>;
}
function AdminPredictionsPage({ user }: { user: any }) {
  const [items, setItems] = useState<any[]>([]);
  useEffect(() => { api.get('/admin/predictions').then((response) => setItems(response.data.predictions)).catch(console.error); }, []);
  return <DashboardShell user={user} onLogout={() => window.location.href = '/'} navItems={adminNavItems}><div className="card-surface rounded-3xl p-6"><h1 className="mb-2 text-3xl font-bold text-white">Predictive analytics</h1><p className="mb-5 text-sm text-slate-400">AI-estimated risk from database records; not a guaranteed forecast.</p>{items.length ? items.map((item) => <div key={item.area} className="mb-3 rounded-xl border border-slate-700 p-4 text-white">{item.area}: {item.predicted_issue}, {item.risk_score}/100 ({item.risk_level}) · {item.recommended_action}</div>) : <p className="text-slate-400">No predictions can be calculated until complaint data is available.</p>}</div></DashboardShell>;
}
function AdminAnalyticsPage({ user }: { user: any }) {
  const [analytics, setAnalytics] = useState<any>(null);
  const [error, setError] = useState('');
  useEffect(() => { api.get('/admin/analytics').then((response) => setAnalytics(response.data)).catch((requestError) => setError(getApiErrorMessage(requestError))); }, []);
  return <DashboardShell user={user} onLogout={() => window.location.href = '/'} navItems={adminNavItems}><div className="space-y-5"><h1 className="text-3xl font-bold text-white">Live analytics</h1>{error && <p role="alert" className="text-rose-200">{error}</p>}{analytics && <><div className="grid gap-4 md:grid-cols-3"><StatCard title="Complaints" value={String(analytics.overview.totalComplaints)} subtitle="Database records" /><StatCard title="Resolution rate" value={`${analytics.overview.resolutionRate}%`} subtitle="Resolved / total" tone="emerald" /><StatCard title="Avg. resolution" value={`${analytics.overview.averageResolutionDays}d`} subtitle="Resolved records only" tone="violet" /></div><div className="grid gap-5 lg:grid-cols-2">{[['Category distribution', analytics.category_distribution], ['Department workload', analytics.department_performance], ['Severity distribution', analytics.severity_distribution]].map(([title, rows]: any) => <div key={title} className="card-surface rounded-2xl p-5"><h2 className="mb-4 text-lg font-semibold text-white">{title}</h2>{rows.length ? <ResponsiveContainer width="100%" height={230}><BarChart data={rows}><CartesianGrid stroke="#334155" /><XAxis dataKey="name" stroke="#94a3b8" /><YAxis stroke="#94a3b8" /><Tooltip /><Bar dataKey="value" fill="#38bdf8" /></BarChart></ResponsiveContainer> : <p className="text-sm text-slate-400">No records yet.</p>}</div>)}</div></>}</div></DashboardShell>;
}
function AdminAlertsPage({ user }: { user: any }) {
  const [alerts, setAlerts] = useState<any[]>([]);
  const [error, setError] = useState('');
  const [form, setForm] = useState({ title: '', description: '', severity: 'MODERATE', area: '' });
  const refresh = () => api.get('/admin/alerts').then((r) => setAlerts(r.data.alerts)).catch((e) => setError(getApiErrorMessage(e)));
  useEffect(() => { refresh(); }, []);
  const submitAlert = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    try {
      await api.post('/admin/alerts', form);
      setForm({ title: '', description: '', severity: 'MODERATE', area: '' });
      setError('');
      refresh();
    } catch (e) {
      setError(getApiErrorMessage(e));
    }
  };
  return <DashboardShell user={user} onLogout={() => window.location.href = '/'} navItems={adminNavItems}><div className="card-surface rounded-3xl p-6"><h1 className="mb-6 text-3xl font-bold text-white">Public alert management</h1>{error && <p role="alert" className="mb-4 text-rose-200">{error}</p>}<form onSubmit={submitAlert} className="mb-8 grid gap-3 md:grid-cols-2"><input required minLength={3} placeholder="Alert title" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} className="rounded-xl border border-slate-700 bg-slate-950 p-3 text-white" /><input placeholder="Area" value={form.area} onChange={(e) => setForm({ ...form, area: e.target.value })} className="rounded-xl border border-slate-700 bg-slate-950 p-3 text-white" /><textarea required minLength={5} placeholder="Alert description" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} className="rounded-xl border border-slate-700 bg-slate-950 p-3 text-white md:col-span-2" /><div className="flex gap-3"><select value={form.severity} onChange={(e) => setForm({ ...form, severity: e.target.value })} className="rounded-xl border border-slate-700 bg-slate-950 p-3 text-white"><option>LOW</option><option>MODERATE</option><option>HIGH</option><option>CRITICAL</option></select><button className="rounded-xl bg-cyan-500 px-5 py-3 font-semibold text-slate-950">Publish alert</button></div></form><h2 className="mb-3 text-lg font-semibold text-white">Published alerts</h2>{alerts.length ? alerts.map((alert) => <div key={alert.id} className="mb-3 rounded-2xl border border-slate-700 bg-slate-900/70 p-4 text-white">{alert.title} · {alert.severity} · {alert.area || 'Area unspecified'}<p className="mt-2 text-sm text-slate-300">{alert.description}</p></div>) : <p className="text-slate-400">No alerts have been published yet.</p>}</div></DashboardShell>;
}
function AdminSettingsPage({ user }: { user: any }) { return <DashboardShell user={user} onLogout={() => window.location.href = '/'} navItems={[]}><div className="card-surface rounded-3xl p-6"><h1 className="text-3xl font-bold text-white">System settings</h1></div></DashboardShell>; }

function ComplaintDetailPage({ user }: { user: any }) {
  const { id } = useParams();
  const [complaint, setComplaint] = useState<any>(null);
  const [timeline, setTimeline] = useState<any[]>([]);
  const [feedback, setFeedback] = useState({ rating: 5, comment: '' });
  const [message, setMessage] = useState('');

  useEffect(() => {
    if (!id) return;
    Promise.all([api.get(`/complaints/${id}`), api.get(`/complaints/${id}/timeline`)])
      .then(([complaintResponse, timelineResponse]) => {
        setComplaint(complaintResponse.data.complaint);
        setTimeline(timelineResponse.data.timeline);
      })
      .catch((error) => setMessage(getApiErrorMessage(error)));
  }, [id]);

  if (!complaint) {
    return <div className="flex min-h-screen items-center justify-center bg-slate-950 text-white">Loading complaint…</div>;
  }

  return (
    <DashboardShell user={user} onLogout={() => window.location.href = '/'} navItems={[
      { label: 'Dashboard', href: `/${user.role}/dashboard` },
      { label: 'Complaints', href: `/${user.role}/complaints` },
      { label: 'Alerts', href: `/${user.role}/alerts` }
    ]}>
      <div className="card-surface rounded-3xl p-6">
        <div className="flex items-center justify-between">
          <h1 className="text-3xl font-bold text-white">{complaint.title}</h1>
          <span className="rounded-full border border-cyan-500/30 bg-cyan-500/10 px-3 py-1 text-xs uppercase text-cyan-200">{complaint.priority}</span>
        </div>
        <div className="mt-6 grid gap-6 md:grid-cols-2">
          <div className="space-y-4 rounded-2xl border border-slate-700 bg-slate-900 p-4 text-slate-300">
            <div><span className="text-slate-400">Complaint ID</span><div className="text-white">{complaint.complaint_id}</div></div>
            <div><span className="text-slate-400">Category</span><div className="text-white">{complaint.category}</div></div>
            <div><span className="text-slate-400">Status</span><div className="text-white">{complaint.status}</div></div>
            <div><span className="text-slate-400">Department</span><div className="text-white">{complaint.department}</div></div>
          </div>
          <div className="space-y-4 rounded-2xl border border-slate-700 bg-slate-900 p-4 text-slate-300">
            <div><span className="text-slate-400">Area</span><div className="text-white">{complaint.location}</div></div>
            <div><span className="text-slate-400">Address</span><div className="text-white">{complaint.address}</div></div>
            <div><span className="text-slate-400">AI-estimated duplicate risk</span><div className="text-white">{Math.round((complaint.duplicate_probability || 0) * 100)}%</div></div>
            <div><span className="text-slate-400">Submitted</span><div className="text-white">{new Date(complaint.created_at).toLocaleString()}</div></div>
          </div>
        </div>
        <div className="mt-8 rounded-2xl border border-slate-700 bg-slate-900 p-4 text-slate-300">
          <h3 className="mb-2 text-lg font-semibold text-white">Description</h3>
          {complaint.description}
        </div>
        {message && <div role="status" className="mt-4 rounded-xl border border-cyan-500/30 bg-cyan-500/10 p-3 text-sm text-cyan-100">{message}</div>}
        <div className="mt-6 rounded-2xl border border-slate-700 bg-slate-900 p-4">
          <h3 className="mb-3 text-lg font-semibold text-white">Status timeline</h3>
          {timeline.length ? timeline.map((entry, index) => (
            <div key={`${entry.created_at}-${index}`} className="border-l border-cyan-500/50 py-2 pl-4">
              <div className="font-medium text-white">{entry.status.replaceAll('_', ' ')}</div>
              <div className="text-sm text-slate-400">{entry.comment || 'Status updated'} · {new Date(entry.created_at).toLocaleString()}</div>
            </div>
          )) : <p className="text-sm text-slate-400">No status history is available yet.</p>}
        </div>
        {user.role === 'citizen' && complaint.status_code === 'RESOLVED' && (
          <form className="mt-6 rounded-2xl border border-slate-700 bg-slate-900 p-4" onSubmit={async (event) => {
            event.preventDefault();
            try {
              await api.post(`/complaints/${id}/feedback`, feedback);
              setMessage('Thank you. Your feedback has been saved.');
            } catch (error) {
              setMessage(getApiErrorMessage(error));
            }
          }}>
            <h3 className="mb-3 text-lg font-semibold text-white">Rate the resolution</h3>
            <select value={feedback.rating} onChange={(event) => setFeedback({ ...feedback, rating: Number(event.target.value) })} className="rounded-lg border border-slate-700 bg-slate-950 p-2 text-white">
              {[5, 4, 3, 2, 1].map((rating) => <option key={rating} value={rating}>{rating} / 5</option>)}
            </select>
            <textarea value={feedback.comment} onChange={(event) => setFeedback({ ...feedback, comment: event.target.value })} placeholder="Optional comment" className="mt-3 block w-full rounded-lg border border-slate-700 bg-slate-950 p-3 text-white" />
            <button className="mt-3 rounded-lg bg-emerald-500 px-4 py-2 font-semibold text-slate-950">Submit feedback</button>
          </form>
        )}
      </div>
    </DashboardShell>
  );
}

export default App;
