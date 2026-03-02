"use client"

import { useState, useEffect } from "react"
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
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { ChartContainer, ChartTooltip, ChartTooltipContent } from "@/components/ui/chart"
import { Bar, BarChart, Line, LineChart, XAxis, YAxis, CartesianGrid, ResponsiveContainer } from "recharts"

type DayOfWeek = "Lun" | "Mar" | "Mer" | "Jeu" | "Ven" | "Sam" | "Dim"

interface Schedule {
  id: string
  times: string[]
  duration: number
  activeDays: DayOfWeek[]
  enabled: boolean
}

export default function IrrigationDashboard() {
  const [isLoading, setIsLoading] = useState(true)
  const [activeSection, setActiveSection] = useState("dashboard")
  const [pumpStatus, setPumpStatus] = useState(false)
  const [autoMode, setAutoMode] = useState(false)
  const [espConnected, setEspConnected] = useState(true)

  const [schedules, setSchedules] = useState<Schedule[]>([
    {
      id: "1",
      times: ["07:00"],
      duration: 300,
      activeDays: ["Lun", "Mer", "Ven"],
      enabled: true,
    },
  ])

  const handlePumpToggle = () => setPumpStatus(!pumpStatus)
  const handleAutoModeToggle = () => setAutoMode(!autoMode)

  const handleAddSchedule = () => {
    const newSchedule: Schedule = {
      id: Date.now().toString(),
      times: ["08:00"],
      duration: 300,
      activeDays: [],
      enabled: true,
    }
    setSchedules([...schedules, newSchedule])
  }

  const handleDeleteSchedule = (id: string) => {
    setSchedules(schedules.filter((s) => s.id !== id))
  }

  const handleToggleDay = (scheduleId: string, day: DayOfWeek) => {
    setSchedules(
      schedules.map((schedule) => {
        if (schedule.id === scheduleId) {
          const activeDays = schedule.activeDays.includes(day)
            ? schedule.activeDays.filter((d) => d !== day)
            : [...schedule.activeDays, day]
          return { ...schedule, activeDays }
        }
        return schedule
      }),
    )
  }

  const handleUpdateTime = (scheduleId: string, timeIndex: number, time: string) => {
    setSchedules(
      schedules.map((schedule) => {
        if (schedule.id === scheduleId) {
          const newTimes = [...schedule.times]
          newTimes[timeIndex] = time
          return { ...schedule, times: newTimes }
        }
        return schedule
      }),
    )
  }

  const handleUpdateDuration = (scheduleId: string, duration: number) => {
    setSchedules(schedules.map((schedule) => (schedule.id === scheduleId ? { ...schedule, duration } : schedule)))
  }

  const handleToggleSchedule = (scheduleId: string) => {
    setSchedules(
      schedules.map((schedule) =>
        schedule.id === scheduleId ? { ...schedule, enabled: !schedule.enabled } : schedule,
      ),
    )
  }

  const handleSaveSchedules = () => {
    console.log("Schedules saved:", schedules)
  }

  const handleAddTimeSlot = (scheduleId: string) => {
    setSchedules(
      schedules.map((schedule) => {
        if (schedule.id === scheduleId) {
          return { ...schedule, times: [...schedule.times, "12:00"] }
        }
        return schedule
      }),
    )
  }

  const handleRemoveTimeSlot = (scheduleId: string, timeIndex: number) => {
    setSchedules(
      schedules.map((schedule) => {
        if (schedule.id === scheduleId && schedule.times.length > 1) {
          const newTimes = schedule.times.filter((_, index) => index !== timeIndex)
          return { ...schedule, times: newTimes }
        }
        return schedule
      }),
    )
  }

  // ─────────────────────────────────────────────
  // Section: Dashboard
  // ─────────────────────────────────────────────
  const renderDashboard = () => {
    const weeklyWaterUsage = [
      { day: "Lun", liters: 45, duration: 15 },
      { day: "Mar", liters: 42, duration: 14 },
      { day: "Mer", liters: 48, duration: 16 },
      { day: "Jeu", liters: 45, duration: 15 },
      { day: "Ven", liters: 50, duration: 17 },
      { day: "Sam", liters: 40, duration: 13 },
      { day: "Dim", liters: 38, duration: 13 },
    ]

    const monthlyStats = [
      { month: "Jan", liters: 1200 },
      { month: "Fév", liters: 1100 },
      { month: "Mar", liters: 1350 },
      { month: "Avr", liters: 1400 },
      { month: "Mai", liters: 1600 },
      { month: "Juin", liters: 1800 },
    ]

    return (
      <>
        {/* Section header */}
        <div className="dashboard__header">
          <h1 className="dashboard__title">Tableau de bord</h1>
          <div className="dashboard__badge-wrapper">
            {espConnected ? (
              <Badge className="dashboard__badge--connected">
                <Wifi className="dashboard__badge-icon" />
                ESP32 Connecté
              </Badge>
            ) : (
              <Badge variant="destructive">
                <WifiOff className="dashboard__badge-icon" />
                ESP32 Déconnecté
              </Badge>
            )}
          </div>
        </div>

        {/* Stats cards */}
        <div className="dashboard__stats">
          <Card className="dashboard__stat-card">
            <CardContent className="dashboard__stat-content">
              <div className="dashboard__stat-inner">
                <div>
                  <p className="dashboard__stat-label">État de la pompe</p>
                  <p className="dashboard__stat-value">{pumpStatus ? "ON" : "OFF"}</p>
                </div>
                <div className={`dashboard__stat-icon ${pumpStatus ? "dashboard__stat-icon--pump-on" : "dashboard__stat-icon--pump-off"}`}>
                  <Droplet />
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="dashboard__stat-card">
            <CardContent className="dashboard__stat-content">
              <div className="dashboard__stat-inner">
                <div>
                  <p className="dashboard__stat-label">Mode</p>
                  <p className="dashboard__stat-value">{autoMode ? "Auto" : "Manuel"}</p>
                </div>
                <div className={`dashboard__stat-icon ${autoMode ? "dashboard__stat-icon--mode-auto" : "dashboard__stat-icon--mode-manual"}`}>
                  <Settings />
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="dashboard__stat-card">
            <CardContent className="dashboard__stat-content">
              <div className="dashboard__stat-inner">
                <div>
                  <p className="dashboard__stat-label">Prochain arrosage</p>
                  <p className="dashboard__stat-value">
                    {autoMode && schedules.length > 0 ? schedules[0].times[0] : "--:--"}
                  </p>
                </div>
                <div className="dashboard__stat-icon dashboard__stat-icon--schedule">
                  <Clock />
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="dashboard__stat-card">
            <CardContent className="dashboard__stat-content">
              <div className="dashboard__stat-inner">
                <div>
                  <p className="dashboard__stat-label">Dernier arrosage</p>
                  <p className="dashboard__stat-value--lg">Hier 07:00</p>
                  <p className="dashboard__stat-value-sub">5 minutes</p>
                </div>
                <div className="dashboard__stat-icon dashboard__stat-icon--history">
                  <History />
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Manual pump control */}
        <Card className="dashboard__pump-section">
          <CardHeader>
            <CardTitle className="dashboard__card-title">Contrôle manuel</CardTitle>
            <CardDescription>Démarrer ou arrêter la pompe manuellement</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="dashboard__pump-area">
              <button
                onClick={handlePumpToggle}
                className={`dashboard__pump-btn ${pumpStatus ? "dashboard__pump-btn--on" : "dashboard__pump-btn--off"}`}
              >
                {pumpStatus ? <StopCircle /> : <PlayCircle />}
              </button>
              <p className="dashboard__pump-hint">
                {pumpStatus ? "Cliquez pour arrêter l'arrosage" : "Cliquez pour démarrer l'arrosage"}
              </p>
            </div>
          </CardContent>
        </Card>

        {/* Charts */}
        <div className="dashboard__charts">
          <Card className="dashboard__chart-card">
            <CardHeader>
              <CardTitle className="dashboard__card-title">Durée d&apos;arrosage quotidienne</CardTitle>
              <CardDescription>Secondes d&apos;arrosage par jour</CardDescription>
            </CardHeader>
            <CardContent>
              <ChartContainer
                config={{ duration: { label: "Secondes", color: "hsl(var(--chart-1))" } }}
                className="dashboard__chart-container"
              >
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={weeklyWaterUsage}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="day" />
                    <YAxis />
                    <ChartTooltip content={<ChartTooltipContent />} />
                    <Line
                      type="monotone"
                      dataKey="duration"
                      stroke="var(--color-duration)"
                      strokeWidth={2}
                      dot={{ r: 4 }}
                    />
                  </LineChart>
                </ResponsiveContainer>
              </ChartContainer>
            </CardContent>
          </Card>

          <Card className="dashboard__chart-card">
            <CardHeader>
              <CardTitle className="dashboard__card-title">Consommation mensuelle</CardTitle>
              <CardDescription>Évolution de la consommation d&apos;eau sur 6 mois</CardDescription>
            </CardHeader>
            <CardContent>
              <ChartContainer
                config={{ liters: { label: "Litres", color: "hsl(var(--chart-1))" } }}
                className="dashboard__chart-container"
              >
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={monthlyStats}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="month" />
                    <YAxis />
                    <ChartTooltip content={<ChartTooltipContent />} />
                    <Bar dataKey="liters" fill="var(--color-liters)" radius={[8, 8, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </ChartContainer>
            </CardContent>
          </Card>
        </div>

        {/* Recent activity */}
        <Card className="dashboard__activity-card">
          <CardHeader>
            <CardTitle className="dashboard__card-title">Activité récente</CardTitle>
            <CardDescription>Les 5 derniers arrosages</CardDescription>
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
                  {schedules.map((schedule) => (
                    <TableRow key={schedule.id}>
                      <TableCell className="dashboard__table-cell">{schedule.id}</TableCell>
                      <TableCell className="dashboard__table-cell">{schedule.times.join(", ")}</TableCell>
                      <TableCell className="dashboard__table-cell">{schedule.duration} secondes</TableCell>
                      <TableCell>
                        <Badge variant={schedule.enabled ? "default" : "secondary"} className="dashboard__badge--small">
                          {schedule.enabled ? "Actif" : "Inactif"}
                        </Badge>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      </>
    )
  }

  // ─────────────────────────────────────────────
  // Section: Scheduling
  // ─────────────────────────────────────────────
  const renderScheduling = () => {
    const daysOfWeek: DayOfWeek[] = ["Lun", "Mar", "Mer", "Jeu", "Ven", "Sam", "Dim"]

    return (
      <>
        <div className="scheduling__header">
          <h1 className="scheduling__title">Programmation</h1>
          <p className="scheduling__subtitle">Configurez les programmes d&apos;arrosage automatique par jour</p>
        </div>

        {/* Auto mode toggle */}
        <Card className="scheduling__auto-mode-card">
          <CardHeader>
            <CardTitle className="dashboard__card-title">Mode automatique</CardTitle>
            <CardDescription>Activer ou désactiver l&apos;arrosage automatique</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="scheduling__auto-mode-inner">
              <div>
                <p className="scheduling__auto-mode-label">Mode automatique</p>
                <p className="scheduling__auto-mode-desc">
                  {autoMode ? "L'arrosage suivra les programmes définis" : "Mode manuel uniquement"}
                </p>
              </div>
              <Switch checked={autoMode} onCheckedChange={handleAutoModeToggle} />
            </div>
          </CardContent>
        </Card>

        {/* Schedule list */}
        <Card className="scheduling__schedules-card">
          <CardHeader>
            <div className="scheduling__schedules-header">
              <div>
                <CardTitle className="dashboard__card-title">Programmes d&apos;arrosage</CardTitle>
                <CardDescription>Créez et gérez vos programmes hebdomadaires</CardDescription>
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
                <p className="scheduling__empty-hint">Cliquez sur &quot;Ajouter un programme&quot; pour commencer</p>
              </div>
            ) : (
              <div className="scheduling__schedule-list">
                {schedules.map((schedule, index) => (
                  <div key={schedule.id} className="scheduling__schedule-item">
                    {/* Schedule item header */}
                    <div className="scheduling__schedule-item-header">
                      <div className="scheduling__schedule-item-left">
                        <Switch
                          checked={schedule.enabled}
                          onCheckedChange={() => handleToggleSchedule(schedule.id)}
                          disabled={!autoMode}
                        />
                        <div>
                          <p className="scheduling__schedule-name">Programme {index + 1}</p>
                          <p className="scheduling__schedule-meta">
                            {schedule.activeDays.length === 0
                              ? "Aucun jour sélectionné"
                              : `${schedule.activeDays.length} jour(s) • ${schedule.times.length} horaire(s)`}
                          </p>
                        </div>
                      </div>
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

                    {/* Day selector */}
                    <div>
                      <Label className="scheduling__label">Jours de la semaine</Label>
                      <div className="scheduling__days">
                        {daysOfWeek.map((day) => {
                          const isActive = schedule.activeDays.includes(day)
                          return (
                            <Button
                              key={day}
                              variant={isActive ? "default" : "outline"}
                              size="sm"
                              onClick={() => handleToggleDay(schedule.id, day)}
                              disabled={!autoMode || !schedule.enabled}
                              className={`scheduling__day-btn${isActive ? " scheduling__day-btn--active" : ""}`}
                            >
                              {day}
                            </Button>
                          )
                        })}
                      </div>
                    </div>

                    {/* Time slots */}
                    <div>
                      <div className="scheduling__time-slots-header">
                        <Label className="scheduling__label">Horaires d&apos;arrosage</Label>
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
                          <div key={timeIndex} className="scheduling__time-slot">
                            <Clock className="scheduling__time-icon" />
                            <Input
                              type="time"
                              value={time}
                              onChange={(e) => handleUpdateTime(schedule.id, timeIndex, e.target.value)}
                              disabled={!autoMode || !schedule.enabled}
                              className="scheduling__time-input"
                            />
                            {schedule.times.length > 1 && (
                              <Button
                                variant="ghost"
                                size="icon"
                                onClick={() => handleRemoveTimeSlot(schedule.id, timeIndex)}
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
                      <Label htmlFor={`duration-${schedule.id}`} className="scheduling__label">
                        Durée d&apos;arrosage (secondes)
                      </Label>
                      <Input
                        id={`duration-${schedule.id}`}
                        type="number"
                        value={schedule.duration}
                        onChange={(e) => handleUpdateDuration(schedule.id, Number(e.target.value))}
                        min="10"
                        disabled={!autoMode || !schedule.enabled}
                        className="scheduling__duration-input"
                      />
                    </div>

                    {/* Summary */}
                    {schedule.activeDays.length > 0 && (
                      <div className="scheduling__summary">
                        <p>
                          <span className="scheduling__summary-label">Résumé:</span>{" "}
                          Arrosage de {schedule.duration} secondes à{" "}
                          {schedule.times.join(", ")} les {schedule.activeDays.join(", ")} (
                          {schedule.activeDays.length * schedule.times.length} arrosage
                          {schedule.activeDays.length * schedule.times.length > 1 ? "s" : ""} par semaine)
                        </p>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <div className="scheduling__footer">
          <Button onClick={handleSaveSchedules} disabled={!autoMode} className="scheduling__save-btn">
            <Save />
            Enregistrer les programmes
          </Button>
        </div>
      </>
    )
  }

  // ─────────────────────────────────────────────
  // Section: History
  // ─────────────────────────────────────────────
  const renderHistory = () => (
    <>
      <div className="history__header">
        <h1 className="history__title">Historique</h1>
        <p className="history__subtitle">Tous les arrosages effectués</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="dashboard__card-title">Historique complet des arrosages</CardTitle>
          <CardDescription>Vue d&apos;ensemble de tous les arrosages effectués</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="history__table-wrapper">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="history__table-cell">Date</TableHead>
                  <TableHead className="history__table-cell">Heure début</TableHead>
                  <TableHead className="history__table-cell">Durée</TableHead>
                  <TableHead className="history__table-cell">Volume (L)</TableHead>
                  <TableHead className="history__table-cell">Mode</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {[...Array(10)].map((_, i) => (
                  <TableRow key={i}>
                    <TableCell className="history__table-cell">{String(15 - i).padStart(2, "0")}/01</TableCell>
                    <TableCell className="history__table-cell">07:00</TableCell>
                    <TableCell className="history__table-cell">5 min</TableCell>
                    <TableCell className="history__table-cell">45 L</TableCell>
                    <TableCell>
                      <Badge variant={i % 3 === 0 ? "secondary" : "default"} className="history__badge">
                        {i % 3 === 0 ? "Manuel" : "Auto"}
                      </Badge>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </>
  )

  useEffect(() => {
    const timer = setTimeout(() => setIsLoading(false), 2000)
    return () => clearTimeout(timer)
  }, [])

  // ─────────────────────────────────────────────
  // Loading state
  // ─────────────────────────────────────────────
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
        <p className="loading-screen__subtitle">Système d&apos;irrigation intelligent</p>

        <div className="loading-screen__progress-bar">
          <div className="loading-screen__progress-fill loading-screen__progress-fill--shimmer" />
        </div>

        <p className="loading-screen__status">Chargement en cours...</p>
      </div>
    )
  }

  // ─────────────────────────────────────────────
  // Sidebar nav items (shared between desktop & mobile)
  // ─────────────────────────────────────────────
  const navItems = [
    { id: "dashboard",   label: "Tableau de bord", icon: Droplet  },
    { id: "scheduling",  label: "Programmation",    icon: Clock    },
    { id: "history",     label: "Historique",       icon: History  },
  ]

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
          const Icon = item.icon
          return (
            <button
              key={item.id}
              onClick={() => setActiveSection(item.id)}
              className={`sidebar__nav-item${activeSection === item.id ? " sidebar__nav-item--active" : ""}`}
            >
              <Icon className="sidebar__nav-icon" />
              {item.label}
            </button>
          )
        })}
      </nav>
    </>
  )

  // ─────────────────────────────────────────────
  // Main render
  // ─────────────────────────────────────────────
  return (
    <div className="layout">
      {/* Desktop sidebar */}
      <aside className="layout__sidebar">
        <SidebarNav />
      </aside>

      {/* Main content */}
      <main className="layout__main">
        {/* Mobile top bar */}
        <div className="layout__mobile-topbar">
          <div className="layout__mobile-brand">
            <Droplet />
            <span>Arrosage Auto</span>
          </div>
          {espConnected ? (
            <Badge className="dashboard__badge--connected">
              <Wifi className="dashboard__badge-icon" />
              Connecté
            </Badge>
          ) : (
            <Badge variant="destructive">
              <WifiOff className="dashboard__badge-icon" />
              Déconnecté
            </Badge>
          )}
        </div>

        <div className="layout__content">
          {activeSection === "dashboard"  && renderDashboard()}
          {activeSection === "scheduling" && renderScheduling()}
          {activeSection === "history"    && renderHistory()}
        </div>
      </main>

      {/* Mobile bottom navigation */}
      <nav className="layout__bottom-nav">
        {navItems.map((item) => {
          const Icon = item.icon
          return (
            <button
              key={item.id}
              onClick={() => setActiveSection(item.id)}
              className={`layout__bottom-nav-item${activeSection === item.id ? " layout__bottom-nav-item--active" : ""}`}
            >
              <Icon />
              <span>{item.label}</span>
            </button>
          )
        })}
      </nav>
    </div>
  )
}
