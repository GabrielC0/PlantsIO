"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import {
  Droplet,
  Clock,
  History,
  Settings,
  Wifi,
  WifiOff,
  CalendarIcon,
  X,
  PlayCircle,
  StopCircle,
  Save,
  Plus,
  Trash2,
  ServerCrash,
  ChevronDown,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { ChartContainer } from "@/components/ui/chart";
import {
  Bar,
  BarChart,
  Line,
  LineChart,
  XAxis,
  YAxis,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip as RechartsTooltip,
} from "recharts";
import { toast } from "sonner";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { Progress } from "@/components/ui/progress";
import { ThemeToggle } from "@/components/theme-toggle";
import { api } from "@/lib/api";
import type {
  Schedule,
  Session,
  WeeklyStat,
  MonthlyStat,
  LastWatering,
  NextWatering,
} from "@/lib/api";

const DAILY_MAX_LITERS = 50;

// ── Constants ────────────────────────────────────────────────────

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
/** Polling interval in ms — faster when pump is running */
const POLL_IDLE = 5_000;
const POLL_ACTIVE = 2_000;

type DayOfWeek = "Lun" | "Mar" | "Mer" | "Jeu" | "Ven" | "Sam" | "Dim";

// ── Helpers ──────────────────────────────────────────────────────

function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  if (m === 0) return `${s}s`;
  if (s === 0) return `${m} min`;
  return `${m}m ${s}s`;
}

function nextWateringLabel(nw: NextWatering): string {
  const d = new Date(nw.scheduledAt);
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const target = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const diff = Math.round((target.getTime() - today.getTime()) / 86_400_000);
  const time = d.toLocaleTimeString("fr-FR", {
    hour: "2-digit",
    minute: "2-digit",
  });
  if (diff === 0) return `Aujourd'hui ${time}`;
  if (diff === 1) return `Demain ${time}`;
  return time;
}

// ── Component ────────────────────────────────────────────────────

export default function IrrigationDashboard() {
  // ── UI state ────────────────────────────────────────────────────
  const [isLoading, setIsLoading] = useState(true);
  const [activeSection, setActiveSection] = useState("dashboard");
  const [serverOnline, setServerOnline] = useState(true);

  // ── System state (from API + WS) ────────────────────────────────
  const [pumpStatus, setPumpStatus] = useState(false);
  const [pumpLoading, setPumpLoading] = useState(false);
  const [autoMode, setAutoMode] = useState(false);
  const [espConnected, setEspConnected] = useState(false);
  const [lastWatering, setLastWatering] = useState<LastWatering | null>(null);
  const [nextWatering, setNextWatering] = useState<NextWatering | null>(null);
  const [todayConsumption, setTodayConsumption] = useState(0);

  // ── Schedules ────────────────────────────────────────────────────
  const [schedules, setSchedules] = useState<Schedule[]>([]);
  const [saveLoading, setSaveLoading] = useState(false);
  const [expandedSchedules, setExpandedSchedules] = useState<Set<string>>(
    new Set(),
  );

  // ── Charts ────────────────────────────────────────────────────────
  const [weeklyData, setWeeklyData] = useState<WeeklyStat[]>([]);
  const [monthlyData, setMonthlyData] = useState<MonthlyStat[]>([]);

  // ── History ───────────────────────────────────────────────────────
  const [history, setHistory] = useState<Session[]>([]);
  const [recentActivity, setRecentActivity] = useState<Session[]>([]);

  // ── Data fetching ─────────────────────────────────────────────────

  const loadStats = useCallback(async () => {
    try {
      const [weekly, monthly, recent] = await Promise.all([
        api.getWeeklyStats(),
        api.getMonthlyStats(),
        api.getRecentActivity(5),
      ]);
      setWeeklyData(weekly);
      setMonthlyData(monthly);
      setRecentActivity(recent);
    } catch {
      /* fail silently, keep stale data */
    }
  }, []);

  const loadHistory = useCallback(async () => {
    try {
      const { items } = await api.getHistory(20);
      setHistory(items);
    } catch {
      /* fail silently */
    }
  }, []);

  const loadInitialData = useCallback(async () => {
    try {
      const [state, scheduleList, weekly, monthly, recent, histPage] =
        await Promise.all([
          api.getSystemState(),
          api.getSchedules(),
          api.getWeeklyStats(),
          api.getMonthlyStats(),
          api.getRecentActivity(5),
          api.getHistory(20),
        ]);

      setPumpStatus(state.pumpOn);
      setAutoMode(state.autoMode);
      setEspConnected(state.espConnected);
      setLastWatering(state.lastWatering);
      setNextWatering(state.nextWatering);
      setTodayConsumption(state.todayConsumptionLiters);
      setSchedules(scheduleList);
      setWeeklyData(weekly);
      setMonthlyData(monthly);
      setRecentActivity(recent);
      setHistory(histPage.items);
      setServerOnline(true);
    } catch {
      setServerOnline(false);
    }
  }, []);

  // Initial load: min 1.5s loading screen + fetch
  useEffect(() => {
    const minDelay = new Promise<void>((r) => setTimeout(r, 1500));
    Promise.all([loadInitialData(), minDelay]).finally(() =>
      setIsLoading(false),
    );
  }, [loadInitialData]);

  // ── HTTP polling ──────────────────────────────────────────────────

  const prevPumpRef = useRef<boolean>(false);

  useEffect(() => {
    let timeoutId: ReturnType<typeof setTimeout>;

    const poll = async () => {
      try {
        const state = await api.getSystemState();
        const wasOn = prevPumpRef.current;
        const isOn = state.pumpOn;

        setPumpStatus(isOn);
        setAutoMode(state.autoMode);
        setEspConnected(state.espConnected);
        setLastWatering(state.lastWatering);
        setNextWatering(state.nextWatering);
        setTodayConsumption(state.todayConsumptionLiters);
        setServerOnline(true);
        if (wasOn && !isOn) setPumpLoading(false);

        // Pump just stopped → refresh stats + history
        if (wasOn && !isOn) {
          loadStats();
          loadHistory();
        }

        prevPumpRef.current = isOn;
      } catch {
        setServerOnline(false);
      }

      const interval = prevPumpRef.current ? POLL_ACTIVE : POLL_IDLE;
      timeoutId = setTimeout(poll, interval);
    };

    timeoutId = setTimeout(poll, POLL_IDLE);
    return () => clearTimeout(timeoutId);
  }, [loadStats, loadHistory]);

  // ── Action handlers ───────────────────────────────────────────────

  const handlePumpToggle = async () => {
    const wasOn = pumpStatus;
    setPumpLoading(true);
    try {
      if (wasOn) {
        await api.pumpOff();
        setPumpStatus(false);
        toast.success("Pompe arrêtée");
      } else {
        await api.pumpOn();
        setPumpStatus(true);
        toast.success("Pompe démarrée");
      }
    } catch (err) {
      console.error("Pump toggle failed:", err);
      toast.error("Impossible de contrôler la pompe", {
        description: err instanceof Error ? err.message : "Erreur inconnue",
      });
    } finally {
      setPumpLoading(false);
    }
  };

  const handleAutoModeToggle = async () => {
    const newValue = !autoMode;
    setAutoMode(newValue); // optimistic
    try {
      await api.setMode(newValue);
      toast.success(
        newValue ? "Mode automatique activé" : "Mode manuel activé",
      );
    } catch (err) {
      console.error("Mode toggle failed:", err);
      setAutoMode(!newValue); // revert
      toast.error("Impossible de changer le mode", {
        description: err instanceof Error ? err.message : "Erreur inconnue",
      });
    }
  };

  const handleToggleExpand = (id: string) => {
    setExpandedSchedules((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleAddSchedule = () => {
    const id = `tmp_${Date.now()}`;
    const num = schedules.length + 1;
    const newSchedule: Schedule = {
      id,
      name: `Programme ${num}`,
      times: ["08:00"],
      duration: 300,
      activeDays: [],
      enabled: true,
    };
    setSchedules([...schedules, newSchedule]);
    setExpandedSchedules((prev) => new Set([...prev, id]));
    toast.success("Programme ajouté", {
      description: `Programme ${num} créé — pensez à enregistrer`,
    });
  };

  const handleDeleteSchedule = async (id: string) => {
    const target = schedules.find((s) => s.id === id);

    // Optimistic remove
    setSchedules((prev) => prev.filter((s) => s.id !== id));
    setExpandedSchedules((prev) => {
      const next = new Set(prev);
      next.delete(id);
      return next;
    });

    // If server-side schedule, delete from DB immediately
    if (UUID_RE.test(id)) {
      try {
        await api.deleteSchedule(id);
        toast("Programme supprimé", {
          description: target?.name ?? "Programme sans nom",
          icon: "🗑️",
        });
      } catch (err) {
        // Rollback
        if (target) setSchedules((prev) => [...prev, target]);
        toast.error("Impossible de supprimer le programme", {
          description: err instanceof Error ? err.message : "Erreur inconnue",
        });
      }
    } else {
      // Local-only (not yet saved), just confirm removal
      toast("Programme supprimé", {
        description: target?.name ?? "Programme sans nom",
        icon: "🗑️",
      });
    }
  };

  const handleToggleDay = (scheduleId: string, day: DayOfWeek) => {
    setSchedules(
      schedules.map((s) => {
        if (s.id !== scheduleId) return s;
        const activeDays = s.activeDays.includes(day)
          ? s.activeDays.filter((d) => d !== day)
          : [...s.activeDays, day];
        return { ...s, activeDays };
      }),
    );
  };

  const handleUpdateTime = (
    scheduleId: string,
    timeIndex: number,
    time: string,
  ) => {
    setSchedules(
      schedules.map((s) => {
        if (s.id !== scheduleId) return s;
        const times = [...s.times];
        times[timeIndex] = time;
        return { ...s, times };
      }),
    );
  };

  const handleUpdateDuration = (scheduleId: string, value: string) => {
    const parsed = parseInt(value, 10);
    const duration = Number.isFinite(parsed) ? parsed : 300;
    setSchedules(
      schedules.map((s) => (s.id === scheduleId ? { ...s, duration } : s)),
    );
  };

  const handleToggleSchedule = (scheduleId: string) => {
    setSchedules(
      schedules.map((s) =>
        s.id === scheduleId ? { ...s, enabled: !s.enabled } : s,
      ),
    );
  };

  const handleAddTimeSlot = (scheduleId: string) => {
    setSchedules(
      schedules.map((s) =>
        s.id === scheduleId ? { ...s, times: [...s.times, "12:00"] } : s,
      ),
    );
  };

  const handleRemoveTimeSlot = (scheduleId: string, timeIndex: number) => {
    setSchedules(
      schedules.map((s) => {
        if (s.id !== scheduleId || s.times.length <= 1) return s;
        return { ...s, times: s.times.filter((_, i) => i !== timeIndex) };
      }),
    );
  };

  const handleSaveSchedules = async () => {
    setSaveLoading(true);
    try {
      // Bulk save (new ones without UUID id, existing ones with id)
      const payload = schedules.map(({ id, ...rest }) => ({
        ...(UUID_RE.test(id) ? { id } : {}),
        ...rest,
        duration: Math.max(10, Number(rest.duration) || 300),
      }));
      await api.saveSchedules(payload);

      // 3. Re-fetch to get server-assigned UUIDs
      const updated = await api.getSchedules();
      setSchedules(updated);

      // 4. Refresh next watering
      const state = await api.getSystemState();
      setNextWatering(state.nextWatering);

      const count = payload.length;
      toast.success("Programmes enregistrés", {
        description: `${count} programme${count > 1 ? "s" : ""} sauvegardé${count > 1 ? "s" : ""}`,
      });
      setActiveSection("dashboard");
    } catch (err) {
      console.error("Save schedules failed:", err);
      toast.error("Échec de l'enregistrement", {
        description: err instanceof Error ? err.message : "Erreur inconnue",
      });
    } finally {
      setSaveLoading(false);
    }
  };

  // ── Chart data (mapped from API format) ───────────────────────────

  const weeklyWaterUsage = weeklyData.map((d) => ({
    day: d.day,
    duration: d.durationSeconds,
    liters: d.volumeLiters,
  }));

  const monthlyStats = monthlyData.map((d) => ({
    month: d.month,
    liters: d.volumeLiters,
  }));

  // ── Loading screen ────────────────────────────────────────────────

  if (isLoading) {
    return (
      <div className="loading-screen">
        <div className="loading-screen__icon-container">
          <div className="loading-screen__icon-ping" />
          <div className="loading-screen__icon-ping-2" />
          <div className="loading-screen__icon-bubble">
            <Droplet />
          </div>
        </div>
        <h1 className="loading-screen__title">Arrosage Auto</h1>
        <p className="loading-screen__subtitle">
          Système d&apos;irrigation intelligent
        </p>
        <div className="loading-screen__progress-bar">
          <div className="loading-screen__progress-fill loading-screen__progress-fill--shimmer" />
        </div>
        <p className="loading-screen__status">Connexion au serveur…</p>
      </div>
    );
  }

  // ── Section: Dashboard ────────────────────────────────────────────

  const renderDashboard = () => (
    <>
      <div className="dashboard__header">
        <h1 className="dashboard__title">Tableau de bord</h1>
        <div className="dashboard__badge-wrapper">
          {!espConnected && (
            <Badge variant="destructive">
              <WifiOff className="dashboard__badge-icon" />
              Déconnecté
            </Badge>
          )}
        </div>
      </div>

      {/* Server offline banner */}
      {!serverOnline && (
        <Card className="dashboard__offline-banner">
          <CardContent className="dashboard__stat-content">
            <div className="dashboard__stat-inner">
              <ServerCrash />
              <span>Serveur injoignable — données hors ligne</span>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Stats cards */}
      <div className="dashboard__stats">
        <Card
          className={`dashboard__stat-card ${pumpStatus ? "dashboard__stat-card--pump-on" : "dashboard__stat-card--pump-off"}`}
        >
          <CardContent className="dashboard__stat-content">
            <div className="dashboard__stat-inner">
              <div>
                <p className="dashboard__stat-label">État de la pompe</p>
                <p className="dashboard__stat-value">
                  {pumpStatus ? "EN MARCHE" : "ARRÊTÉE"}
                </p>
              </div>
              <div
                className={`dashboard__stat-icon ${pumpStatus ? "dashboard__stat-icon--pump-on" : "dashboard__stat-icon--pump-off"}`}
              >
                <Droplet />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card
          className={`dashboard__stat-card ${autoMode ? "dashboard__stat-card--auto" : "dashboard__stat-card--manual"}`}
        >
          <CardContent className="dashboard__stat-content">
            <div className="dashboard__stat-inner">
              <div>
                <p className="dashboard__stat-label">Mode</p>
                <p className="dashboard__stat-value">
                  {autoMode ? "Automatique" : "Manuel"}
                </p>
              </div>
              <div
                className={`dashboard__stat-icon ${autoMode ? "dashboard__stat-icon--mode-auto" : "dashboard__stat-icon--mode-manual"}`}
              >
                <Settings />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="dashboard__stat-card dashboard__stat-card--schedule">
          <CardContent className="dashboard__stat-content">
            <div className="dashboard__stat-inner">
              <div>
                <p className="dashboard__stat-label">Prochain arrosage</p>
                <p className="dashboard__stat-value">
                  {nextWatering ? nextWateringLabel(nextWatering) : "—"}
                </p>
              </div>
              <div className="dashboard__stat-icon dashboard__stat-icon--schedule">
                <Clock />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="dashboard__stat-card dashboard__stat-card--history">
          <CardContent className="dashboard__stat-content">
            <div className="dashboard__stat-inner">
              <div>
                <p className="dashboard__stat-label">Dernier arrosage</p>
                {lastWatering ? (
                  <>
                    <p className="dashboard__stat-value--lg">
                      {lastWatering.relativeLabel}
                    </p>
                    <p className="dashboard__stat-value-sub">
                      {formatDuration(lastWatering.durationSeconds)}
                    </p>
                  </>
                ) : (
                  <p className="dashboard__stat-value">—</p>
                )}
              </div>
              <div className="dashboard__stat-icon dashboard__stat-icon--history">
                <History />
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Today's consumption bar */}
      {todayConsumption > 0 && (
        <Card className="dashboard__consumption">
          <CardContent className="dashboard__consumption-content">
            <div className="dashboard__consumption-header">
              <span className="dashboard__consumption-label">
                Consommation du jour
              </span>
              <span className="dashboard__consumption-value">
                {todayConsumption.toFixed(1)} L
              </span>
            </div>
            <Progress
              value={Math.min((todayConsumption / DAILY_MAX_LITERS) * 100, 100)}
              className={
                todayConsumption / DAILY_MAX_LITERS >= 0.85
                  ? "progress--danger"
                  : ""
              }
            />
            <p className="dashboard__consumption-hint">
              {((todayConsumption / DAILY_MAX_LITERS) * 100).toFixed(0)}% du max
              journalier ({DAILY_MAX_LITERS} L)
            </p>
          </CardContent>
        </Card>
      )}

      {/* Manual pump control */}
      <Card className="dashboard__pump-section">
        <CardHeader>
          <CardTitle className="dashboard__card-title">
            Contrôle manuel
          </CardTitle>
          <CardDescription>
            Démarrer ou arrêter la pompe manuellement
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="dashboard__pump-area">
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  onClick={handlePumpToggle}
                  disabled={pumpLoading || !espConnected}
                  className={`dashboard__pump-btn ${pumpLoading ? "dashboard__pump-btn--loading" : pumpStatus ? "dashboard__pump-btn--on" : "dashboard__pump-btn--off"}`}
                >
                  {pumpLoading ? (
                    <Droplet />
                  ) : pumpStatus ? (
                    <StopCircle />
                  ) : (
                    <PlayCircle />
                  )}
                </button>
              </TooltipTrigger>
              <TooltipContent side="bottom">
                {!espConnected
                  ? "ESP32 non connecté"
                  : pumpStatus
                    ? "Arrêter l'arrosage"
                    : "Démarrer l'arrosage"}
              </TooltipContent>
            </Tooltip>
            <p className="dashboard__pump-hint">
              {!espConnected
                ? "ESP32 non connecté"
                : pumpLoading
                  ? "En cours…"
                  : pumpStatus
                    ? "Cliquez pour arrêter l'arrosage"
                    : "Cliquez pour démarrer l'arrosage"}
            </p>
          </div>
        </CardContent>
      </Card>

      {/* Charts */}
      <div className="dashboard__charts">
        <Card className="dashboard__chart-card">
          <CardHeader>
            <CardTitle className="dashboard__card-title">
              Durée d&apos;arrosage quotidienne
            </CardTitle>
            <CardDescription>
              Minutes par jour (7 derniers jours)
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ChartContainer className="dashboard__chart-container">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={weeklyWaterUsage}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="day" tick={{ fontSize: 12 }} />
                  <YAxis
                    tickFormatter={(v) => `${Math.round(v / 60)}m`}
                    allowDecimals={false}
                    width={36}
                  />
                  <RechartsTooltip
                    formatter={(value: number) => [
                      `${Math.round(value / 60)} min`,
                      "Durée",
                    ]}
                  />
                  <Line
                    type="monotone"
                    dataKey="duration"
                    stroke="hsl(217, 91%, 60%)"
                    strokeWidth={2}
                    dot={{ r: 4 }}
                    connectNulls
                  />
                </LineChart>
              </ResponsiveContainer>
            </ChartContainer>
          </CardContent>
        </Card>

        <Card className="dashboard__chart-card">
          <CardHeader>
            <CardTitle className="dashboard__card-title">
              Consommation mensuelle
            </CardTitle>
            <CardDescription>Évolution sur 6 mois (litres)</CardDescription>
          </CardHeader>
          <CardContent>
            <ChartContainer className="dashboard__chart-container">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={monthlyStats}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="month" tick={{ fontSize: 12 }} />
                  <YAxis
                    tickFormatter={(v) => `${v}L`}
                    allowDecimals={false}
                    width={40}
                  />
                  <RechartsTooltip
                    formatter={(value: number) => [
                      `${value.toFixed(1)} L`,
                      "Volume",
                    ]}
                  />
                  <Bar
                    dataKey="liters"
                    fill="hsl(142, 72%, 45%)"
                    radius={[8, 8, 0, 0]}
                  />
                </BarChart>
              </ResponsiveContainer>
            </ChartContainer>
          </CardContent>
        </Card>
      </div>

      {/* Recent activity */}
      <Card className="dashboard__activity-card">
        <CardHeader>
          <CardTitle className="dashboard__card-title">
            Activité récente
          </CardTitle>
          <CardDescription>
            {todayConsumption > 0
              ? `${todayConsumption} L consommés aujourd'hui`
              : "Les 5 derniers arrosages"}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="dashboard__table-wrapper">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="dashboard__table-cell">Date</TableHead>
                  <TableHead className="dashboard__table-cell">Heure</TableHead>
                  <TableHead className="dashboard__table-cell">Durée</TableHead>
                  <TableHead className="dashboard__table-cell">Mode</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {recentActivity.length === 0 ? (
                  <TableRow>
                    <TableCell className="dashboard__table-cell" colSpan={4}>
                      Aucun arrosage enregistré
                    </TableCell>
                  </TableRow>
                ) : (
                  recentActivity.map((s) => (
                    <TableRow key={s.id}>
                      <TableCell className="dashboard__table-cell">
                        {s.date.slice(5).replace("-", "/")}
                      </TableCell>
                      <TableCell className="dashboard__table-cell">
                        {s.startTime}
                      </TableCell>
                      <TableCell className="dashboard__table-cell">
                        {formatDuration(s.durationSeconds)}
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant={s.mode === "auto" ? "default" : "secondary"}
                          className="dashboard__badge--small"
                        >
                          {s.mode === "auto" ? "Auto" : "Manuel"}
                        </Badge>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </>
  );

  // ── Section: Scheduling ───────────────────────────────────────────

  const renderScheduling = () => {
    const daysOfWeek: DayOfWeek[] = [
      "Lun",
      "Mar",
      "Mer",
      "Jeu",
      "Ven",
      "Sam",
      "Dim",
    ];

    return (
      <>
        <div className="scheduling__header">
          <h1 className="scheduling__title">Programmation</h1>
          <p className="scheduling__subtitle">
            Configurez les programmes d&apos;arrosage automatique par jour
          </p>
        </div>

        {/* Auto mode toggle */}
        <Card className="scheduling__auto-mode-card">
          <CardContent>
            <div className="scheduling__auto-mode-inner">
              <div>
                <p className="scheduling__auto-mode-label">Mode automatique</p>
                <p className="scheduling__auto-mode-desc">
                  {autoMode
                    ? "L'arrosage suivra les programmes définis"
                    : "Mode manuel uniquement"}
                </p>
              </div>
              <Switch
                checked={autoMode}
                onCheckedChange={handleAutoModeToggle}
              />
            </div>
          </CardContent>
        </Card>

        {/* Schedule list */}
        <Card className="scheduling__schedules-card">
          <CardHeader>
            <div className="scheduling__schedules-header">
              <div>
                <CardTitle className="dashboard__card-title">
                  Programmes d&apos;arrosage
                </CardTitle>
                <CardDescription>
                  Créez et gérez vos programmes hebdomadaires
                </CardDescription>
              </div>
              <Button
                onClick={handleAddSchedule}
                disabled={!autoMode}
                size="sm"
                className="scheduling__add-btn"
              >
                <Plus />
                Ajouter un programme
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            {schedules.length === 0 ? (
              <div className="scheduling__empty-state">
                <CalendarIcon className="scheduling__empty-icon" />
                <p className="scheduling__empty-text">Aucun programme défini</p>
                <p className="scheduling__empty-hint">
                  Cliquez sur &quot;Ajouter un programme&quot; pour commencer
                </p>
              </div>
            ) : (
              <div className="scheduling__schedule-list">
                {schedules.map((schedule, index) => {
                  const isExpanded = expandedSchedules.has(schedule.id);
                  return (
                    <div
                      key={schedule.id}
                      className="scheduling__schedule-item"
                    >
                      {/* Header — always visible */}
                      <div className="scheduling__schedule-item-header">
                        <Switch
                          checked={schedule.enabled}
                          onCheckedChange={() =>
                            handleToggleSchedule(schedule.id)
                          }
                          disabled={!autoMode}
                        />
                        <button
                          type="button"
                          className="scheduling__schedule-toggle"
                          onClick={() => handleToggleExpand(schedule.id)}
                        >
                          <div>
                            <p className="scheduling__schedule-name">
                              {schedule.name || `Programme ${index + 1}`}
                            </p>
                            <p className="scheduling__schedule-meta">
                              {schedule.activeDays.length === 0
                                ? "Aucun jour sélectionné"
                                : `${schedule.activeDays.length} jour(s) • ${schedule.times.length} horaire(s)`}
                            </p>
                          </div>
                          <ChevronDown
                            className={`scheduling__schedule-chevron${isExpanded ? " scheduling__schedule-chevron--open" : ""}`}
                          />
                        </button>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => handleDeleteSchedule(schedule.id)}
                          disabled={!autoMode}
                          className="scheduling__delete-btn"
                        >
                          <Trash2 />
                        </Button>
                      </div>

                      {/* Collapsible body */}
                      <div
                        className={`scheduling__schedule-body${isExpanded ? " scheduling__schedule-body--open" : ""}`}
                      >
                        <div>
                          {/* Day selector */}
                          <div>
                            <Label className="scheduling__label">
                              Jours de la semaine
                            </Label>
                            <div className="scheduling__days">
                              {daysOfWeek.map((day) => {
                                const isActive =
                                  schedule.activeDays.includes(day);
                                return (
                                  <Button
                                    key={day}
                                    variant={isActive ? "default" : "outline"}
                                    size="sm"
                                    onClick={() =>
                                      handleToggleDay(schedule.id, day)
                                    }
                                    disabled={!autoMode || !schedule.enabled}
                                    className={`scheduling__day-btn${isActive ? " scheduling__day-btn--active" : ""}`}
                                  >
                                    {day}
                                  </Button>
                                );
                              })}
                            </div>
                          </div>

                          {/* Time slots */}
                          <div>
                            <div className="scheduling__time-slots-header">
                              <Label className="scheduling__label">
                                Horaires d&apos;arrosage
                              </Label>
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => handleAddTimeSlot(schedule.id)}
                                disabled={!autoMode || !schedule.enabled}
                                className="scheduling__add-time-btn"
                              >
                                <Plus />
                                Ajouter un horaire
                              </Button>
                            </div>
                            <div className="scheduling__time-slots">
                              {schedule.times.map((time, timeIndex) => (
                                <div
                                  key={timeIndex}
                                  className="scheduling__time-slot"
                                >
                                  <Clock className="scheduling__time-icon" />
                                  <Input
                                    type="time"
                                    value={time}
                                    onChange={(e) =>
                                      handleUpdateTime(
                                        schedule.id,
                                        timeIndex,
                                        e.target.value,
                                      )
                                    }
                                    disabled={!autoMode || !schedule.enabled}
                                    className="scheduling__time-input"
                                  />
                                  {schedule.times.length > 1 && (
                                    <Button
                                      variant="ghost"
                                      size="icon"
                                      onClick={() =>
                                        handleRemoveTimeSlot(
                                          schedule.id,
                                          timeIndex,
                                        )
                                      }
                                      disabled={!autoMode || !schedule.enabled}
                                      className="scheduling__remove-time-btn"
                                    >
                                      <X />
                                    </Button>
                                  )}
                                </div>
                              ))}
                            </div>
                          </div>

                          {/* Duration */}
                          <div>
                            <Label
                              htmlFor={`duration-${schedule.id}`}
                              className="scheduling__label"
                            >
                              Durée d&apos;arrosage (secondes)
                            </Label>
                            <Input
                              id={`duration-${schedule.id}`}
                              type="number"
                              value={schedule.duration}
                              onChange={(e) =>
                                handleUpdateDuration(
                                  schedule.id,
                                  e.target.value,
                                )
                              }
                              min="10"
                              max="3600"
                              disabled={!autoMode || !schedule.enabled}
                              className="scheduling__duration-input"
                            />
                          </div>

                          {/* Summary */}
                          {schedule.activeDays.length > 0 && (
                            <div className="scheduling__summary">
                              <p>
                                <span className="scheduling__summary-label">
                                  Résumé :
                                </span>{" "}
                                Arrosage de {formatDuration(schedule.duration)}{" "}
                                à {schedule.times.join(", ")} les{" "}
                                {schedule.activeDays.join(", ")} (
                                {schedule.activeDays.length *
                                  schedule.times.length}{" "}
                                arrosage
                                {schedule.activeDays.length *
                                  schedule.times.length >
                                1
                                  ? "s"
                                  : ""}{" "}
                                par semaine)
                              </p>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>

        <div className="scheduling__footer">
          <Button
            onClick={handleSaveSchedules}
            disabled={!autoMode || saveLoading}
            className="scheduling__save-btn"
          >
            <Save />
            {saveLoading ? "Enregistrement…" : "Enregistrer les programmes"}
          </Button>
        </div>
      </>
    );
  };

  // ── Section: History ──────────────────────────────────────────────

  const renderHistory = () => (
    <>
      <div className="history__header">
        <h1 className="history__title">Historique</h1>
        <p className="history__subtitle">Tous les arrosages effectués</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="dashboard__card-title">
            Historique complet des arrosages
          </CardTitle>
          <CardDescription>
            {history.length > 0
              ? `${history.length} arrosage${history.length > 1 ? "s" : ""} enregistré${history.length > 1 ? "s" : ""}`
              : "Vue d'ensemble de tous les arrosages effectués"}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="history__table-wrapper">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="history__table-cell">Date</TableHead>
                  <TableHead className="history__table-cell">
                    Heure début
                  </TableHead>
                  <TableHead className="history__table-cell">Durée</TableHead>
                  <TableHead className="history__table-cell">
                    Volume (L)
                  </TableHead>
                  <TableHead className="history__table-cell">Mode</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {history.length === 0 ? (
                  <TableRow>
                    <TableCell className="history__table-cell" colSpan={5}>
                      Aucun arrosage enregistré
                    </TableCell>
                  </TableRow>
                ) : (
                  history.map((s) => (
                    <TableRow key={s.id}>
                      <TableCell className="history__table-cell">
                        {s.date.slice(5).replace("-", "/")}
                      </TableCell>
                      <TableCell className="history__table-cell">
                        {s.startTime}
                      </TableCell>
                      <TableCell className="history__table-cell">
                        {formatDuration(s.durationSeconds)}
                      </TableCell>
                      <TableCell className="history__table-cell">
                        {s.volumeLiters.toFixed(1)} L
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant={s.mode === "auto" ? "default" : "secondary"}
                          className="history__badge"
                        >
                          {s.mode === "auto" ? "Auto" : "Manuel"}
                        </Badge>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </>
  );

  // ── Nav items ─────────────────────────────────────────────────────

  const navItems = [
    { id: "dashboard", label: "Tableau de bord", icon: Droplet },
    { id: "scheduling", label: "Programmation", icon: Clock },
    { id: "history", label: "Historique", icon: History },
  ];

  const SidebarNav = () => (
    <>
      <div className="sidebar__header">
        <div className="sidebar__brand">
          <div className="sidebar__brand-inner">
            <Droplet className="sidebar__brand-icon" />
            <h2 className="sidebar__brand-name">Arrosage Auto</h2>
          </div>
        </div>
      </div>
      <nav className="sidebar__nav">
        {navItems.map((item) => {
          const Icon = item.icon;
          return (
            <button
              key={item.id}
              onClick={() => setActiveSection(item.id)}
              className={`sidebar__nav-item${activeSection === item.id ? " sidebar__nav-item--active" : ""}`}
            >
              <Icon className="sidebar__nav-icon" />
              {item.label}
            </button>
          );
        })}
      </nav>
      <div className="sidebar__footer">
        <span>v1.0</span>
        <Tooltip>
          <TooltipTrigger asChild>
            <ThemeToggle />
          </TooltipTrigger>
          <TooltipContent side="right">Changer le thème</TooltipContent>
        </Tooltip>
      </div>
    </>
  );

  // ── Main render ───────────────────────────────────────────────────

  return (
    <div className="layout">
      {/* Desktop sidebar */}
      <aside className="layout__sidebar">
        <SidebarNav />
      </aside>

      {/* Main content */}
      <main className="layout__main">
        {/* Mobile topbar */}
        <div className="layout__mobile-topbar">
          <div className="layout__mobile-brand">
            <Droplet />
            <span>PlantsIO</span>
          </div>
        </div>

        <div className="layout__content">
          {activeSection === "dashboard" && renderDashboard()}
          {activeSection === "scheduling" && renderScheduling()}
          {activeSection === "history" && renderHistory()}
        </div>
      </main>

      {/* Mobile bottom nav */}
      <nav className="layout__bottom-nav">
        {navItems.map((item) => {
          const Icon = item.icon;
          return (
            <button
              key={item.id}
              onClick={() => setActiveSection(item.id)}
              className={`layout__bottom-nav-item${activeSection === item.id ? " layout__bottom-nav-item--active" : ""}`}
            >
              <Icon />
              <span>{item.label}</span>
            </button>
          );
        })}
      </nav>
    </div>
  );
}
