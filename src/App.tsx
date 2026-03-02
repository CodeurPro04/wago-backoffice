import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import {
  AlertTriangle,
  Ban,
  Car,
  CheckCircle2,
  Clock3,
  Eye,
  FileCheck2,
  FileX2,
  Megaphone,
  RefreshCw,
  Search,
  ShieldCheck,
  Star,
  X,
  Users
  ,Wallet
} from 'lucide-react';
import {
  API_BASE,
  getAnnouncements,
  getBookings,
  getCustomers,
  getDashboardStats,
  getDriverDetails,
  getDrivers,
  reviewDriver,
  setDriverBan,
  sendDriverAnnouncement,
} from './api';
import type {
  AnnouncementItem,
  BookingItem,
  CustomerItem,
  DashboardStats,
  DriverDetails,
  DriverItem,
} from './api';
import { subscribeBackofficeRealtime } from './realtime';

type TabKey = 'dashboard' | 'drivers' | 'customers' | 'bookings' | 'announcements';

const TABS: Array<{ key: TabKey; label: string }> = [
  { key: 'dashboard', label: 'Vue Globale' },
  { key: 'drivers', label: 'Laveurs & Documents' },
  { key: 'customers', label: 'Clients' },
  { key: 'bookings', label: 'Commandes' },
  { key: 'announcements', label: 'Annonces' },
];

const BOOKING_STATUSES = [
  'all',
  'pending',
  'accepted',
  'en_route',
  'arrived',
  'washing',
  'completed',
  'cancelled',
] as const;

const DRIVER_STATUSES = ['all', 'submitted', 'pending', 'approved', 'rejected'] as const;

const money = (value: number) => `${value.toLocaleString('fr-FR')} FCFA`;
const dateLabel = (value?: string | null) => {
  if (!value) return '—';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
};

function StatCard({ title, value, accent, icon }: { title: string; value: string; accent: string; icon: ReactNode }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="mb-3 flex items-center justify-between">
        <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{title}</p>
        <div className="rounded-xl bg-slate-100 p-2 text-slate-700">{icon}</div>
      </div>
      <p className={`text-2xl font-black ${accent}`}>{value}</p>
    </div>
  );
}

function App() {
  const [tab, setTab] = useState<TabKey>('dashboard');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [drivers, setDrivers] = useState<DriverItem[]>([]);
  const [customers, setCustomers] = useState<CustomerItem[]>([]);
  const [bookings, setBookings] = useState<BookingItem[]>([]);
  const [announcements, setAnnouncements] = useState<AnnouncementItem[]>([]);

  const [driverFilter, setDriverFilter] = useState<(typeof DRIVER_STATUSES)[number]>('all');
  const [driverQuery, setDriverQuery] = useState('');
  const [customerQuery, setCustomerQuery] = useState('');
  const [bookingFilter, setBookingFilter] = useState<(typeof BOOKING_STATUSES)[number]>('all');

  const [processingDriverId, setProcessingDriverId] = useState<number | null>(null);
  const [selectedDriverId, setSelectedDriverId] = useState<number | null>(null);
  const [driverDetails, setDriverDetails] = useState<DriverDetails | null>(null);
  const [loadingDriverDetails, setLoadingDriverDetails] = useState(false);
  const [banReason, setBanReason] = useState('');
  const [processingBan, setProcessingBan] = useState(false);
  const [sendingAnnouncement, setSendingAnnouncement] = useState(false);
  const [announcementTitle, setAnnouncementTitle] = useState('');
  const [announcementBody, setAnnouncementBody] = useState('');
  const [announcementAudience, setAnnouncementAudience] = useState<'all' | 'approved' | 'pending' | 'rejected'>('all');
  const [announcementRoute, setAnnouncementRoute] = useState('/notifications');
  const [error, setError] = useState<string>('');
  const realtimeRefreshTimerRef = useRef<number | null>(null);

  const loadAll = useCallback(async (silent = false) => {
    if (silent) setRefreshing(true);
    else setLoading(true);

    setError('');
    try {
      const [dash, drv, cust, bk, an] = await Promise.all([
        getDashboardStats(),
        getDrivers({ status: driverFilter, q: driverQuery || undefined }),
        getCustomers({ q: customerQuery || undefined }),
        getBookings({ status: bookingFilter }),
        getAnnouncements({ channel: 'driver_system', limit: 100 }),
      ]);
      setStats(dash.stats);
      setDrivers(drv.drivers);
      setCustomers(cust.customers);
      setBookings(bk.bookings);
      setAnnouncements(an.announcements || []);
    } catch (e: any) {
      setError(e?.message || 'Impossible de charger le backoffice.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [bookingFilter, customerQuery, driverFilter, driverQuery]);

  useEffect(() => {
    loadAll(false).catch(() => undefined);
  }, [loadAll]);

  useEffect(() => {
    const timer = setTimeout(() => {
      loadAll(true).catch(() => undefined);
    }, 250);
    return () => clearTimeout(timer);
  }, [loadAll]);

  useEffect(() => {
    const interval = setInterval(() => {
      loadAll(true).catch(() => undefined);
    }, 60000);
    return () => clearInterval(interval);
  }, [loadAll]);

  const refreshFromRealtime = useCallback(async () => {
    await loadAll(true);
    if (selectedDriverId) {
      const details = await getDriverDetails(selectedDriverId);
      setDriverDetails(details);
    }
  }, [loadAll, selectedDriverId]);

  useEffect(() => {
    const unsubscribe = subscribeBackofficeRealtime(() => {
      if (realtimeRefreshTimerRef.current) {
        return;
      }
      realtimeRefreshTimerRef.current = window.setTimeout(() => {
        realtimeRefreshTimerRef.current = null;
        refreshFromRealtime().catch(() => undefined);
      }, 300);
    });

    return () => {
      if (realtimeRefreshTimerRef.current) {
        window.clearTimeout(realtimeRefreshTimerRef.current);
        realtimeRefreshTimerRef.current = null;
      }
      unsubscribe?.();
    };
  }, [refreshFromRealtime]);

  const submittedDrivers = useMemo(() => drivers.filter((d) => d.documents_status === 'submitted'), [drivers]);
  const announcementHistory = useMemo(
    () => announcements.slice().sort((a, b) => new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime()),
    [announcements]
  );
  const ziwagoRevenue = useMemo(
    () => (stats ? Math.max(0, stats.gross_revenue - stats.net_driver_payout) : 0),
    [stats]
  );

  const onReviewDriver = async (driverId: number, decision: 'approve' | 'reject') => {
    setProcessingDriverId(driverId);
    try {
      await reviewDriver(driverId, decision);
      await loadAll(true);
      if (selectedDriverId === driverId) {
        const details = await getDriverDetails(driverId);
        setDriverDetails(details);
      }
    } catch (e: any) {
      setError(e?.message || 'Impossible de traiter la validation.');
    } finally {
      setProcessingDriverId(null);
    }
  };

  const onOpenDriverDetails = async (driverId: number) => {
    setSelectedDriverId(driverId);
    setLoadingDriverDetails(true);
    setError('');
    try {
      const details = await getDriverDetails(driverId);
      setDriverDetails(details);
      setBanReason(details.driver.banned_reason || '');
    } catch (e: any) {
      setDriverDetails(null);
      setError(e?.message || 'Impossible de charger le profil complet du laveur.');
    } finally {
      setLoadingDriverDetails(false);
    }
  };

  const onToggleDriverBan = async () => {
    if (!driverDetails) return;
    const currentlyBanned = driverDetails.driver.is_banned;
    const nextBanned = !currentlyBanned;
    const reason = banReason.trim();

    if (nextBanned && !reason) {
      setError('Une raison est obligatoire pour bannir ce compte.');
      return;
    }

    setProcessingBan(true);
    setError('');
    try {
      await setDriverBan(driverDetails.driver.id, {
        banned: nextBanned,
        reason: nextBanned ? reason : undefined,
      });
      const [details, list] = await Promise.all([
        getDriverDetails(driverDetails.driver.id),
        getDrivers({ status: driverFilter, q: driverQuery || undefined }),
      ]);
      setDriverDetails(details);
      setDrivers(list.drivers);
      if (!nextBanned) {
        setBanReason('');
      }
    } catch (e: any) {
      setError(e?.message || 'Impossible de mettre a jour le statut de bannissement.');
    } finally {
      setProcessingBan(false);
    }
  };

  const onSendAnnouncement = async () => {
    if (!announcementTitle.trim() || !announcementBody.trim()) {
      setError('Le titre et le message sont obligatoires pour envoyer une annonce.');
      return;
    }
    setSendingAnnouncement(true);
    setError('');
    try {
      const response = await sendDriverAnnouncement({
        title: announcementTitle.trim(),
        body: announcementBody.trim(),
        audience: announcementAudience,
        route: announcementRoute.trim() || '/notifications',
      });
      window.alert(`Annonce envoyee a ${response.sent} laveur(s).`);
      setAnnouncementTitle('');
      setAnnouncementBody('');
      await loadAll(true);
    } catch (e: any) {
      setError(e?.message || 'Impossible d envoyer l annonce.');
    } finally {
      setSendingAnnouncement(false);
    }
  };

  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_0%_0%,#f3f8ff_0,#eef4fb_35%,#edf2f7_65%,#e9eef4_100%)] text-slate-900">
      <div className="mx-auto max-w-7xl px-4 py-6 md:px-8">
        <header className="mb-6 rounded-2xl border border-slate-200 bg-white/90 p-5 shadow-sm backdrop-blur">
          <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.2em] text-sky-600">ZIWAGO ADMIN</p>
              <h1 className="text-3xl font-black tracking-tight text-slate-900">Backoffice Opérationnel</h1>
              <p className="mt-1 text-sm text-slate-600">Suivi en temps réel des clients, laveurs, commandes et validation documentaire.</p>
            </div>
            <div className="flex items-center gap-3">
              <code className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-600">API: {API_BASE}</code>
              <button
                className="inline-flex items-center gap-2 rounded-xl bg-sky-600 px-4 py-2 text-sm font-bold text-white transition hover:bg-sky-700"
                onClick={() => loadAll(true)}
                disabled={refreshing || loading}
              >
                <RefreshCw className={`h-4 w-4 ${refreshing ? 'animate-spin' : ''}`} />
                Actualiser
              </button>
            </div>
          </div>
          <div className="mt-4 flex flex-wrap gap-2">
            {TABS.map((item) => (
              <button
                key={item.key}
                onClick={() => setTab(item.key)}
                className={`rounded-full px-4 py-2 text-sm font-bold transition ${
                  tab === item.key ? 'bg-slate-900 text-white' : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                }`}
              >
                {item.label}
              </button>
            ))}
          </div>
        </header>

        {error ? (
          <div className="mb-4 rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm font-semibold text-rose-700">{error}</div>
        ) : null}

        {loading ? (
          <div className="rounded-2xl border border-slate-200 bg-white p-12 text-center text-sm font-semibold text-slate-500">Chargement du backoffice...</div>
        ) : null}

        {!loading && tab === 'dashboard' && stats ? (
          <div className="space-y-4">
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
              <StatCard title="Utilisateurs" value={String(stats.total_users)} accent="text-slate-900" icon={<Users className="h-4 w-4" />} />
              <StatCard title="Laveurs" value={String(stats.total_drivers)} accent="text-indigo-700" icon={<Car className="h-4 w-4" />} />
              <StatCard title="Validation en attente" value={String(stats.pending_driver_reviews)} accent="text-amber-700" icon={<Clock3 className="h-4 w-4" />} />
              <StatCard title="Commandes actives" value={String(stats.active_bookings)} accent="text-sky-700" icon={<RefreshCw className="h-4 w-4" />} />
              <StatCard title="Commandes terminées" value={String(stats.completed_bookings)} accent="text-emerald-700" icon={<CheckCircle2 className="h-4 w-4" />} />
            </div>
            <div className="grid gap-4 md:grid-cols-3">
              <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Revenus bruts finalisés</p>
                <p className="mt-2 text-3xl font-black text-slate-900">{money(stats.gross_revenue)}</p>
              </div>
              <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Paiement net laveurs</p>
                <p className="mt-2 text-3xl font-black text-emerald-700">{money(stats.net_driver_payout)}</p>
              </div>
              <div className="rounded-2xl border border-amber-200 bg-amber-50 p-5 shadow-sm">
                <div className="mb-2 inline-flex items-center gap-2 rounded-lg bg-white px-2 py-1 text-amber-700">
                  <Wallet className="h-4 w-4" />
                  <span className="text-xs font-extrabold uppercase tracking-wide">Commission</span>
                </div>
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Revenu ZIWAGO</p>
                <p className="mt-2 text-3xl font-black text-amber-700">{money(ziwagoRevenue)}</p>
              </div>
            </div>
          </div>
        ) : null}

        {!loading && tab === 'drivers' ? (
          <div className="space-y-4">
            <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
              <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                <div className="relative w-full md:max-w-md">
                  <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
                  <input
                    value={driverQuery}
                    onChange={(e) => setDriverQuery(e.target.value)}
                    placeholder="Rechercher un laveur (nom / phone / email)"
                    className="w-full rounded-xl border border-slate-200 bg-white py-2 pl-9 pr-3 text-sm outline-none focus:border-sky-500"
                  />
                </div>
                <select
                  value={driverFilter}
                  onChange={(e) => setDriverFilter(e.target.value as (typeof DRIVER_STATUSES)[number])}
                  className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold outline-none"
                >
                  {DRIVER_STATUSES.map((status) => (
                    <option key={status} value={status}>{status}</option>
                  ))}
                </select>
              </div>
            </div>

            {submittedDrivers.length > 0 ? (
              <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
                <p className="font-bold">{submittedDrivers.length} laveur(s) à valider</p>
                <p>Examine les documents puis valide ou rejette le compte.</p>
              </div>
            ) : null}

            <div className="grid gap-4 lg:grid-cols-2">
              {drivers.map((driver) => (
                <div key={driver.id} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                  {/** Quand profil + documents sont deja approuves, les actions de review ne sont plus affichees. */}
                  {(() => {
                    const isFullyApproved = driver.profile_status === 'approved' && driver.documents_status === 'approved';
                    return (
                      <>
                  <div className="mb-3 flex items-start justify-between gap-3">
                    <div>
                      <p className="text-lg font-black text-slate-900">{driver.name || `Driver #${driver.id}`}</p>
                      <p className="text-sm text-slate-600">{driver.phone || 'N/A'} · {driver.email || 'N/A'}</p>
                    </div>
                    <div className="flex flex-col items-end gap-1">
                      <span className="rounded-full bg-slate-100 px-2 py-1 text-[11px] font-bold text-slate-700">Profil: {driver.profile_status}</span>
                      <span className="rounded-full bg-indigo-100 px-2 py-1 text-[11px] font-bold text-indigo-700">Docs: {driver.documents_status}</span>
                      {driver.is_banned ? (
                        <span className="rounded-full bg-rose-100 px-2 py-1 text-[11px] font-bold text-rose-700">Banni</span>
                      ) : null}
                    </div>
                  </div>

                  <div className="mb-3 grid grid-cols-3 gap-2 text-xs">
                    <div className="rounded-lg bg-slate-50 p-2"><p className="text-slate-500">Jobs</p><p className="font-extrabold">{driver.stats.total_jobs}</p></div>
                    <div className="rounded-lg bg-slate-50 p-2"><p className="text-slate-500">Terminés</p><p className="font-extrabold">{driver.stats.completed_jobs}</p></div>
                    <div className="rounded-lg bg-slate-50 p-2"><p className="text-slate-500">Annulés</p><p className="font-extrabold">{driver.stats.cancelled_jobs}</p></div>
                  </div>

                  <div className="space-y-2 rounded-xl border border-slate-200 bg-slate-50 p-3">
                    <p className="text-xs font-bold uppercase tracking-wide text-slate-600">Documents</p>
                    {Object.entries(driver.documents || {}).length === 0 ? (
                      <p className="text-sm text-slate-500">Aucun document.</p>
                    ) : (
                      <div className="grid gap-2">
                        {Object.entries(driver.documents).map(([docType, docUrl]) => (
                          <a
                            key={docType}
                            href={docUrl || '#'}
                            target="_blank"
                            rel="noreferrer"
                            className={`inline-flex items-center justify-between rounded-lg border px-3 py-2 text-sm ${
                              docUrl ? 'border-slate-300 bg-white text-slate-700 hover:border-sky-500' : 'border-slate-200 bg-slate-100 text-slate-400'
                            }`}
                          >
                            <span>{docType}</span>
                            <span className="text-xs">{docUrl ? 'Ouvrir' : 'Manquant'}</span>
                          </a>
                        ))}
                      </div>
                    )}
                  </div>

                  <div className={`mt-3 grid gap-2 ${isFullyApproved ? 'grid-cols-1' : 'grid-cols-3'}`}>
                    {!isFullyApproved ? (
                      <>
                        <button
                          disabled={processingDriverId === driver.id}
                          onClick={() => onReviewDriver(driver.id, 'approve')}
                          className="inline-flex items-center justify-center gap-2 rounded-xl bg-emerald-600 px-3 py-2 text-sm font-bold text-white hover:bg-emerald-700 disabled:opacity-60"
                        >
                          <FileCheck2 className="h-4 w-4" />
                          Valider
                        </button>
                        <button
                          disabled={processingDriverId === driver.id}
                          onClick={() => onReviewDriver(driver.id, 'reject')}
                          className="inline-flex items-center justify-center gap-2 rounded-xl bg-rose-600 px-3 py-2 text-sm font-bold text-white hover:bg-rose-700 disabled:opacity-60"
                        >
                          <FileX2 className="h-4 w-4" />
                          Rejeter
                        </button>
                      </>
                    ) : null}
                    <button
                      disabled={loadingDriverDetails && selectedDriverId === driver.id}
                      onClick={() => onOpenDriverDetails(driver.id)}
                      className="inline-flex items-center justify-center gap-2 rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm font-bold text-slate-700 hover:border-sky-500 disabled:opacity-60"
                    >
                      <Eye className="h-4 w-4" />
                      Profil
                    </button>
                  </div>
                      </>
                    );
                  })()}
                </div>
              ))}
            </div>

            {selectedDriverId ? (
              <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/45 p-4">
                <div className="max-h-[92vh] w-full max-w-5xl overflow-y-auto rounded-2xl border border-slate-200 bg-white p-5 shadow-2xl">
                  <div className="mb-3 flex items-center justify-between">
                    <p className="text-sm font-extrabold uppercase tracking-wide text-slate-700">Profil laveur</p>
                    <button
                      onClick={() => {
                        setSelectedDriverId(null);
                        setDriverDetails(null);
                        setBanReason('');
                      }}
                      className="inline-flex items-center gap-1 rounded-lg border border-slate-300 bg-white px-2 py-1 text-xs font-bold text-slate-700 hover:border-slate-400"
                    >
                      <X className="h-3 w-3" />
                      Fermer
                    </button>
                  </div>
                {loadingDriverDetails ? (
                  <p className="text-sm font-semibold text-slate-500">Chargement du profil laveur...</p>
                ) : null}

                {!loadingDriverDetails && driverDetails ? (
                  <div className="space-y-4">
                    <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                      <div>
                        <p className="text-xl font-black text-slate-900">
                          {driverDetails.driver.name || `Laveur #${driverDetails.driver.id}`}
                        </p>
                        <p className="text-sm text-slate-600">
                          {driverDetails.driver.phone || 'N/A'} · {driverDetails.driver.email || 'N/A'}
                        </p>
                        <p className="mt-1 text-xs font-semibold uppercase tracking-wide text-slate-500">
                          Inscrit le {dateLabel(driverDetails.driver.created_at)}
                        </p>
                      </div>
                      <div className="grid grid-cols-2 gap-2 text-xs">
                        <span className="rounded-full bg-slate-100 px-2 py-1 font-bold text-slate-700">
                          Profil: {driverDetails.driver.profile_status}
                        </span>
                        <span className="rounded-full bg-indigo-100 px-2 py-1 font-bold text-indigo-700">
                          Docs: {driverDetails.driver.documents_status}
                        </span>
                        <span className="rounded-full bg-amber-100 px-2 py-1 font-bold text-amber-700">
                          {driverDetails.driver.is_available ? 'Disponible' : 'Indisponible'}
                        </span>
                        <span className={`rounded-full px-2 py-1 font-bold ${driverDetails.driver.is_banned ? 'bg-rose-100 text-rose-700' : 'bg-emerald-100 text-emerald-700'}`}>
                          {driverDetails.driver.is_banned ? 'Compte banni' : 'Compte actif'}
                        </span>
                      </div>
                    </div>

                    <div className="grid gap-3 md:grid-cols-4">
                      <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                        <p className="text-xs uppercase tracking-wide text-slate-500">Note moyenne</p>
                        <p className="mt-1 inline-flex items-center gap-1 text-lg font-black text-amber-600">
                          <Star className="h-4 w-4 fill-amber-500 text-amber-500" />
                          {driverDetails.metrics.rating_average.toFixed(1)}
                        </p>
                        <p className="text-xs text-slate-500">{driverDetails.metrics.ratings_count} avis</p>
                      </div>
                      <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                        <p className="text-xs uppercase tracking-wide text-slate-500">Total missions</p>
                        <p className="mt-1 text-lg font-black text-slate-900">{driverDetails.metrics.total_jobs}</p>
                      </div>
                      <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                        <p className="text-xs uppercase tracking-wide text-slate-500">Missions terminées</p>
                        <p className="mt-1 text-lg font-black text-emerald-700">{driverDetails.metrics.completed_jobs}</p>
                      </div>
                      <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                        <p className="text-xs uppercase tracking-wide text-slate-500">Missions annulées</p>
                        <p className="mt-1 text-lg font-black text-rose-700">{driverDetails.metrics.cancelled_jobs}</p>
                      </div>
                    </div>

                    <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                      <div className="mb-2 inline-flex items-center gap-2 rounded-lg bg-white px-2 py-1 text-slate-700">
                        {driverDetails.driver.is_banned ? <Ban className="h-4 w-4 text-rose-700" /> : <ShieldCheck className="h-4 w-4 text-emerald-700" />}
                        <span className="text-xs font-extrabold uppercase tracking-wide">Controle du compte</span>
                      </div>
                      <textarea
                        rows={2}
                        value={banReason}
                        onChange={(e) => setBanReason(e.target.value)}
                        placeholder="Raison admin (obligatoire pour bannir)"
                        className="mb-3 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-sky-500"
                      />
                      <button
                        onClick={onToggleDriverBan}
                        disabled={processingBan}
                        className={`inline-flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-bold text-white disabled:opacity-60 ${
                          driverDetails.driver.is_banned ? 'bg-emerald-600 hover:bg-emerald-700' : 'bg-rose-600 hover:bg-rose-700'
                        }`}
                      >
                        {driverDetails.driver.is_banned ? <ShieldCheck className="h-4 w-4" /> : <Ban className="h-4 w-4" />}
                        {processingBan ? 'Traitement...' : driverDetails.driver.is_banned ? 'Debannir le laveur' : 'Bannir le laveur'}
                      </button>
                    </div>

                    <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                      <p className="mb-2 text-xs font-extrabold uppercase tracking-wide text-slate-600">Avis clients</p>
                      {driverDetails.reviews.length === 0 ? (
                        <p className="text-sm text-slate-500">Aucun avis client pour le moment.</p>
                      ) : (
                        <div className="space-y-2">
                          {driverDetails.reviews.map((review) => (
                            <div key={`${review.booking_id}-${review.created_at || ''}`} className="rounded-lg border border-slate-200 bg-white p-3">
                              <div className="mb-1 flex flex-wrap items-center justify-between gap-2">
                                <p className="text-sm font-bold text-slate-800">{review.customer_name}</p>
                                <p className="inline-flex items-center gap-1 text-xs font-bold text-amber-700">
                                  <Star className="h-3 w-3 fill-amber-500 text-amber-500" />
                                  {review.rating}/5
                                </p>
                              </div>
                              <p className="text-sm text-slate-700">{review.review || 'Aucun commentaire.'}</p>
                              <p className="mt-1 text-xs text-slate-500">Mission #{review.booking_id} · {dateLabel(review.created_at)}</p>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>

                    <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                      <p className="mb-2 text-xs font-extrabold uppercase tracking-wide text-slate-600">Commandes du laveur</p>
                      {driverDetails.bookings.length === 0 ? (
                        <p className="text-sm text-slate-500">Aucune commande trouvée.</p>
                      ) : (
                        <div className="space-y-3">
                          {driverDetails.bookings.map((booking) => (
                            <div key={booking.id} className="rounded-lg border border-slate-200 bg-white p-3">
                              <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                                <div className="flex items-center gap-2">
                                  <span className="rounded-md bg-slate-900 px-2 py-1 text-xs font-black text-white">#{booking.id}</span>
                                  <span className="rounded-md bg-slate-100 px-2 py-1 text-xs font-bold text-slate-700">{booking.status}</span>
                                </div>
                                <p className="text-sm font-black text-slate-900">{money(booking.price)}</p>
                              </div>
                              <div className="grid gap-1 text-sm text-slate-700 md:grid-cols-2">
                                <p><span className="font-semibold">Service:</span> {booking.service} - {booking.vehicle}</p>
                                <p><span className="font-semibold">Créneau:</span> {dateLabel(booking.scheduled_at)}</p>
                                <p><span className="font-semibold">Client:</span> {booking.customer?.name || 'N/A'} ({booking.customer?.phone || 'N/A'})</p>
                                <p className="md:col-span-2"><span className="font-semibold">Adresse:</span> {booking.address}</p>
                                {booking.cancelled_reason ? (
                                  <p className="md:col-span-2 rounded-lg border border-rose-200 bg-rose-50 px-2 py-1 text-xs text-rose-700">
                                    Annulation: {booking.cancelled_reason}
                                  </p>
                                ) : null}
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                ) : null}
                {!loadingDriverDetails && !driverDetails ? (
                  <p className="text-sm text-rose-600">Impossible de charger le profil de ce laveur. Verifie la reponse API puis reessaie.</p>
                ) : null}
                </div>
              </div>
            ) : null}
          </div>
        ) : null}

        {!loading && tab === 'customers' ? (
          <div className="space-y-4">
            <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
              <div className="relative w-full md:max-w-md">
                <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
                <input
                  value={customerQuery}
                  onChange={(e) => setCustomerQuery(e.target.value)}
                  placeholder="Rechercher un client"
                  className="w-full rounded-xl border border-slate-200 bg-white py-2 pl-9 pr-3 text-sm outline-none focus:border-sky-500"
                />
              </div>
            </div>

            <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
              <table className="min-w-full text-left text-sm">
                <thead className="bg-slate-50 text-xs uppercase text-slate-500">
                  <tr>
                    <th className="px-4 py-3">Client</th>
                    <th className="px-4 py-3">Contact</th>
                    <th className="px-4 py-3">Portefeuille</th>
                    <th className="px-4 py-3">Commandes</th>
                    <th className="px-4 py-3">Date</th>
                  </tr>
                </thead>
                <tbody>
                  {customers.map((customer) => (
                    <tr key={customer.id} className="border-t border-slate-100">
                      <td className="px-4 py-3 font-bold text-slate-800">{customer.name || `Client #${customer.id}`}</td>
                      <td className="px-4 py-3 text-slate-600">{customer.phone || 'N/A'}<br />{customer.email || ''}</td>
                      <td className="px-4 py-3 font-bold text-sky-700">{money(customer.wallet_balance)}</td>
                      <td className="px-4 py-3 text-slate-700">
                        Total: {customer.stats.total_orders}<br />
                        En cours: {customer.stats.pending_orders}
                      </td>
                      <td className="px-4 py-3 text-slate-500">{dateLabel(customer.created_at)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        ) : null}

        {!loading && tab === 'bookings' ? (
          <div className="space-y-4">
            <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
              <div className="flex items-center gap-3">
                <select
                  value={bookingFilter}
                  onChange={(e) => setBookingFilter(e.target.value as (typeof BOOKING_STATUSES)[number])}
                  className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold outline-none"
                >
                  {BOOKING_STATUSES.map((status) => (
                    <option key={status} value={status}>{status}</option>
                  ))}
                </select>
                <p className="text-sm text-slate-500">{bookings.length} commande(s) chargée(s)</p>
              </div>
            </div>

            <div className="grid gap-3">
              {bookings.map((booking) => (
                <div key={booking.id} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                  <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <span className="rounded-lg bg-slate-900 px-2 py-1 text-xs font-black text-white">#{booking.id}</span>
                      <span className="rounded-lg bg-slate-100 px-2 py-1 text-xs font-bold text-slate-700">{booking.status}</span>
                    </div>
                    <p className="text-sm font-black text-slate-900">{money(booking.price)}</p>
                  </div>

                  <div className="grid gap-1 text-sm text-slate-700 md:grid-cols-2">
                    <p><span className="font-semibold">Service:</span> {booking.service} - {booking.vehicle}</p>
                    <p><span className="font-semibold">Créneau:</span> {dateLabel(booking.scheduled_at)}</p>
                    <p><span className="font-semibold">Client:</span> {booking.customer?.name || 'N/A'} ({booking.customer?.phone || 'N/A'})</p>
                    <p><span className="font-semibold">Laveur:</span> {booking.driver?.name || 'Non assigné'}</p>
                    <p className="md:col-span-2"><span className="font-semibold">Adresse:</span> {booking.address}</p>
                    {booking.status === 'cancelled' ? (
                      <p className="md:col-span-2 inline-flex items-center gap-2 rounded-lg border border-rose-200 bg-rose-50 px-2 py-1 text-rose-700">
                        <AlertTriangle className="h-4 w-4" />
                        Annulation: {booking.cancelled_reason || 'raison non renseignée'}
                      </p>
                    ) : null}
                    {booking.status === 'completed' ? (
                      <div className="md:col-span-2 mt-2 grid gap-3 lg:grid-cols-2">
                        <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                          <p className="mb-2 text-xs font-bold uppercase tracking-wide text-slate-600">Photos avant lavage</p>
                          {Array.isArray(booking.before_photos) && booking.before_photos.length > 0 ? (
                            <div className="grid grid-cols-3 gap-2">
                              {booking.before_photos.map((url, idx) => (
                                <a key={`before-${booking.id}-${idx}`} href={url} target="_blank" rel="noreferrer">
                                  <img
                                    src={url}
                                    alt={`Avant lavage ${idx + 1}`}
                                    className="h-20 w-full rounded-lg border border-slate-200 object-cover"
                                  />
                                </a>
                              ))}
                            </div>
                          ) : (
                            <p className="text-xs text-slate-500">Aucune photo avant lavage.</p>
                          )}
                        </div>
                        <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                          <p className="mb-2 text-xs font-bold uppercase tracking-wide text-slate-600">Photos apres lavage</p>
                          {Array.isArray(booking.after_photos) && booking.after_photos.length > 0 ? (
                            <div className="grid grid-cols-3 gap-2">
                              {booking.after_photos.map((url, idx) => (
                                <a key={`after-${booking.id}-${idx}`} href={url} target="_blank" rel="noreferrer">
                                  <img
                                    src={url}
                                    alt={`Apres lavage ${idx + 1}`}
                                    className="h-20 w-full rounded-lg border border-slate-200 object-cover"
                                  />
                                </a>
                              ))}
                            </div>
                          ) : (
                            <p className="text-xs text-slate-500">Aucune photo apres lavage.</p>
                          )}
                        </div>
                      </div>
                    ) : null}
                  </div>
                </div>
              ))}
            </div>
          </div>
        ) : null}

        {!loading && tab === 'announcements' ? (
          <div className="space-y-4">
            <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <div className="mb-4 inline-flex items-center gap-2 rounded-xl bg-sky-50 px-3 py-2 text-sky-700">
                <Megaphone className="h-4 w-4" />
                <span className="text-xs font-extrabold uppercase tracking-wide">Annonces Systeme Laveurs</span>
              </div>
              <div className="grid gap-3">
                <input
                  value={announcementTitle}
                  onChange={(e) => setAnnouncementTitle(e.target.value)}
                  placeholder="Titre de l annonce"
                  className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none focus:border-sky-500"
                />
                <textarea
                  value={announcementBody}
                  onChange={(e) => setAnnouncementBody(e.target.value)}
                  placeholder="Message a envoyer aux laveurs"
                  rows={5}
                  className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none focus:border-sky-500"
                />
                <div className="grid gap-3 md:grid-cols-2">
                  <select
                    value={announcementAudience}
                    onChange={(e) => setAnnouncementAudience(e.target.value as 'all' | 'approved' | 'pending' | 'rejected')}
                    className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold outline-none"
                  >
                    <option value="all">Tous les laveurs</option>
                    <option value="approved">Laveurs valides</option>
                    <option value="pending">Laveurs en attente</option>
                    <option value="rejected">Laveurs rejetes</option>
                  </select>
                  <input
                    value={announcementRoute}
                    onChange={(e) => setAnnouncementRoute(e.target.value)}
                    placeholder="Route deep-link (ex: /notifications)"
                    className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none focus:border-sky-500"
                  />
                </div>
              </div>
              <div className="mt-4">
                <button
                  onClick={onSendAnnouncement}
                  disabled={sendingAnnouncement}
                  className="inline-flex items-center gap-2 rounded-xl bg-sky-600 px-4 py-2 text-sm font-bold text-white transition hover:bg-sky-700 disabled:opacity-60"
                >
                  <Megaphone className="h-4 w-4" />
                  {sendingAnnouncement ? 'Envoi en cours...' : 'Envoyer l annonce'}
                </button>
              </div>
            </div>

            <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <p className="mb-3 text-sm font-extrabold uppercase tracking-wide text-slate-600">Historique des annonces envoyees</p>
              {announcementHistory.length === 0 ? (
                <p className="text-sm text-slate-500">Aucune annonce envoyee pour le moment.</p>
              ) : (
                <div className="space-y-3">
                  {announcementHistory.map((item) => (
                    <div key={item.id} className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                      <div className="mb-1 flex flex-wrap items-center justify-between gap-2">
                        <p className="text-sm font-black text-slate-900">{item.title}</p>
                        <span className="rounded-full bg-slate-200 px-2 py-1 text-[11px] font-bold text-slate-700">
                          {dateLabel(item.created_at)}
                        </span>
                      </div>
                      <p className="text-sm text-slate-700">{item.body}</p>
                      <div className="mt-2 flex flex-wrap gap-2 text-xs">
                        <span className="rounded-full bg-indigo-100 px-2 py-1 font-bold text-indigo-700">
                          Audience: {item.audience}
                        </span>
                        <span className="rounded-full bg-emerald-100 px-2 py-1 font-bold text-emerald-700">
                          Envoyes: {item.sent_count}
                        </span>
                        <span className="rounded-full bg-sky-100 px-2 py-1 font-bold text-sky-700">
                          Route: {item.route || '/notifications'}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}

export default App;




