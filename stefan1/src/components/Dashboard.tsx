import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  AlertTriangle,
  Camera,
  ChevronDown,
  Crown,
  Globe2,
  History,
  LocateFixed,
  Lock,
  PanelRightClose,
  PanelRightOpen,
  Send,
  ShieldAlert,
  Sparkles,
  Users,
  Waves,
  X,
} from "lucide-react";
import {
  floodZones,
  historicalSimulations,
  informRiskDataSource,
} from "../data/floodMockData";
import { DraggableWindow } from "./DraggableWindow";
import { RiskMap } from "./RiskMap";
import type { ChangeEvent } from "react";
import type {
  FloodZoneWithRisk,
  GeneratedSimulationResult,
  LngLat,
  MapAnchorPoint,
  RectBounds,
  ReportedIncident,
} from "../types/flood";

type WindowKey = "past" | "create";
type SimulationRunState = "idle" | "running" | "complete";

const isPremium = false;
const SIDEBAR_WIDTH = 344;

const loadingMessages = [
  "Extracting satellite data...",
  "Generating simulation...",
  "Creating evacuation plan...",
];

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

function formatNumber(value: number): string {
  return new Intl.NumberFormat("en-US").format(value);
}

function formatIncidentDate(value: string): string {
  return new Date(value).toLocaleString("ro-RO", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function getRiskChipClasses(riskLevel: number): string {
  if (riskLevel < 35) {
    return "bg-emerald-500/25 text-emerald-200";
  }
  if (riskLevel < 70) {
    return "bg-amber-500/25 text-amber-200";
  }
  return "bg-rose-500/30 text-rose-100";
}

function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === "string") {
        resolve(reader.result);
        return;
      }
      reject(new Error("Unable to parse image"));
    };
    reader.onerror = () => reject(reader.error ?? new Error("File read failed"));
    reader.readAsDataURL(file);
  });
}

export default function Dashboard() {
  const mapAreaRef = useRef<HTMLDivElement | null>(null);
  const toastTimeoutRef = useRef<number | null>(null);

  const [selectedZoneId, setSelectedZoneId] = useState<string | null>(null);
  const [activeScenarioId, setActiveScenarioId] = useState<string>("live");
  const [generatedSimulation, setGeneratedSimulation] =
    useState<GeneratedSimulationResult | null>(null);
  const [focusAnchor, setFocusAnchor] = useState<MapAnchorPoint | null>(null);
  const [mapAreaSize, setMapAreaSize] = useState({ width: 1200, height: 800 });
  const [plansExpanded, setPlansExpanded] = useState(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [contextMenuVisible, setContextMenuVisible] = useState(true);
  const [openWindows, setOpenWindows] = useState<Record<WindowKey, boolean>>({
    past: false,
    create: false,
  });
  const [windowStack, setWindowStack] = useState<WindowKey[]>([]);
  const [simulationState, setSimulationState] = useState<SimulationRunState>("idle");
  const [loadingStepIndex, setLoadingStepIndex] = useState(0);

  const [incidentDescription, setIncidentDescription] = useState("");
  const [incidentImages, setIncidentImages] = useState<string[]>([]);
  const [incidentLocation, setIncidentLocation] = useState<LngLat | null>(null);
  const [locatingUser, setLocatingUser] = useState(false);
  const [reportedIncidents, setReportedIncidents] = useState<ReportedIncident[]>([]);

  const buildGeneratedSimulation = useCallback(
    (focusZoneId: string | null): GeneratedSimulationResult => {
      const createdAt = new Date().toISOString();
      const riskByZone = floodZones.reduce<Record<string, number>>((acc, zone, index) => {
        const baseline = zone.baselineRiskLevel;
        const zoneBoost = zone.id === focusZoneId ? 17 : 8;
        const structuralVariance = ((index + 1) * 3) % 11;
        acc[zone.id] = Math.min(100, baseline + zoneBoost + structuralVariance);
        return acc;
      }, {});

      const estimatedDisplacement = Math.round(
        floodZones.reduce((sum, zone) => {
          const risk = riskByZone[zone.id] ?? zone.baselineRiskLevel;
          return sum + zone.stats.populationAtRisk * (risk / 100) * 0.2;
        }, 0),
      );

      return {
        id: "generated",
        label: "Generated Scenario",
        createdAt,
        riskByZone,
        estimatedDisplacement,
        responseTimeMinutes: 47,
      };
    },
    [],
  );

  const zonesWithRisk = useMemo<FloodZoneWithRisk[]>(() => {
    const selectedHistorical = historicalSimulations.find(
      (simulation) => simulation.id === activeScenarioId,
    );
    const generatedRiskByZone =
      activeScenarioId === "generated" ? generatedSimulation?.riskByZone : undefined;

    return floodZones.map((zone) => {
      const historicalRisk = selectedHistorical?.riskByZone[zone.id];
      const generatedRisk = generatedRiskByZone?.[zone.id];
      const riskLevel = generatedRisk ?? historicalRisk ?? zone.baselineRiskLevel;

      return {
        ...zone,
        riskLevel: clamp(riskLevel, 0, 100),
      };
    });
  }, [activeScenarioId, generatedSimulation]);

  const selectedZone = useMemo(
    () => zonesWithRisk.find((zone) => zone.id === selectedZoneId) ?? null,
    [zonesWithRisk, selectedZoneId],
  );

  const activeScenarioLabel = useMemo(() => {
    if (activeScenarioId === "live") {
      return "Live Risk Feed";
    }
    if (activeScenarioId === "generated") {
      return generatedSimulation?.label ?? "Generated Scenario";
    }
    return (
      historicalSimulations.find((simulation) => simulation.id === activeScenarioId)?.label ??
      "Historical Scenario"
    );
  }, [activeScenarioId, generatedSimulation]);

  const contextMenuRect = useMemo<RectBounds | null>(() => {
    if (!selectedZone || !focusAnchor || !contextMenuVisible) {
      return null;
    }
    const menuWidth = 248;
    const menuHeight = 144;
    return {
      width: menuWidth,
      height: menuHeight,
      x: clamp(focusAnchor.x + 24, 12, Math.max(12, mapAreaSize.width - menuWidth - 12)),
      y: clamp(focusAnchor.y + 24, 12, Math.max(12, mapAreaSize.height - menuHeight - 12)),
    };
  }, [selectedZone, focusAnchor, contextMenuVisible, mapAreaSize.width, mapAreaSize.height]);

  const avoidRects = useMemo<RectBounds[]>(
    () => (contextMenuRect ? [contextMenuRect] : []),
    [contextMenuRect],
  );

  const windowBounds = useMemo(
    () => ({
      width: mapAreaSize.width,
      height: mapAreaSize.height,
    }),
    [mapAreaSize.width, mapAreaSize.height],
  );

  const initialWindowPositions = useMemo(() => {
    const rightAlignedX = clamp(
      mapAreaSize.width - 470,
      18,
      Math.max(18, mapAreaSize.width - 448),
    );
    return {
      past: { x: 24, y: 92 },
      create: { x: rightAlignedX, y: 108 },
    };
  }, [mapAreaSize.width]);

  const bringToFront = useCallback((windowKey: WindowKey) => {
    setWindowStack((current) => [...current.filter((key) => key !== windowKey), windowKey]);
  }, []);

  const closeWindow = useCallback((windowKey: WindowKey) => {
    setOpenWindows((current) => ({ ...current, [windowKey]: false }));
    setWindowStack((current) => current.filter((key) => key !== windowKey));
  }, []);

  const closeAllWindows = useCallback(() => {
    setOpenWindows({ past: false, create: false });
    setWindowStack([]);
  }, []);

  const openWindow = useCallback(
    (windowKey: WindowKey) => {
      setOpenWindows((current) => ({ ...current, [windowKey]: true }));
      bringToFront(windowKey);
    },
    [bringToFront],
  );

  const getWindowZIndex = useCallback(
    (windowKey: WindowKey) => {
      const index = windowStack.indexOf(windowKey);
      return index === -1 ? 60 : 70 + index;
    },
    [windowStack],
  );

  const showToast = useCallback((message: string) => {
    setToastMessage(message);
    if (toastTimeoutRef.current) {
      window.clearTimeout(toastTimeoutRef.current);
    }
    toastTimeoutRef.current = window.setTimeout(() => {
      setToastMessage(null);
    }, 2400);
  }, []);

  const handleZoneSelection = useCallback(
    (zoneId: string | null) => {
      setSelectedZoneId(zoneId);
      if (zoneId) {
        setContextMenuVisible(true);
        return;
      }
      setFocusAnchor(null);
      setContextMenuVisible(false);
      closeAllWindows();
    },
    [closeAllWindows],
  );

  useEffect(() => {
    return () => {
      if (toastTimeoutRef.current) {
        window.clearTimeout(toastTimeoutRef.current);
      }
    };
  }, []);

  useEffect(() => {
    if (!mapAreaRef.current) {
      return;
    }
    const observer = new ResizeObserver((entries) => {
      const rect = entries[0]?.contentRect;
      if (!rect) {
        return;
      }
      setMapAreaSize({ width: rect.width, height: rect.height });
    });
    observer.observe(mapAreaRef.current);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (simulationState !== "running") {
      return;
    }

    const textTicker = window.setInterval(() => {
      setLoadingStepIndex((current) => (current + 1) % loadingMessages.length);
    }, 2000);

    const completionTimer = window.setTimeout(() => {
      const result = buildGeneratedSimulation(selectedZoneId);
      setGeneratedSimulation(result);
      setActiveScenarioId("generated");
      setSimulationState("complete");
    }, 6000);

    return () => {
      window.clearInterval(textTicker);
      window.clearTimeout(completionTimer);
    };
  }, [simulationState, buildGeneratedSimulation, selectedZoneId]);

  const handleCreateSimulationClick = useCallback(() => {
    if (!selectedZoneId) {
      showToast("Selectează mai întâi o zonă.");
      return;
    }

    if (!isPremium) {
      showToast("Upgrade required");
      return;
    }

    openWindow("create");
    setActiveScenarioId("live");
    setGeneratedSimulation(null);
    setSimulationState("running");
    setLoadingStepIndex(0);
  }, [openWindow, selectedZoneId, showToast]);

  const rerunSimulation = useCallback(() => {
    if (!selectedZoneId) {
      showToast("Selectează mai întâi o zonă.");
      return;
    }
    setActiveScenarioId("live");
    setGeneratedSimulation(null);
    setSimulationState("running");
    setLoadingStepIndex(0);
  }, [selectedZoneId, showToast]);

  const onImageUpload = useCallback(
    async (event: ChangeEvent<HTMLInputElement>) => {
      const incomingFiles = Array.from(event.target.files ?? []).slice(0, 4);
      if (incomingFiles.length === 0) {
        return;
      }
      try {
        const previews = await Promise.all(incomingFiles.map(fileToDataUrl));
        setIncidentImages((current) => [...current, ...previews].slice(0, 4));
      } catch {
        showToast("Nu am putut încărca imaginile.");
      }
      event.currentTarget.value = "";
    },
    [showToast],
  );

  const requestLocation = useCallback(() => {
    if (!navigator.geolocation) {
      showToast("Browserul nu suportă geolocație.");
      return;
    }

    setLocatingUser(true);
    navigator.geolocation.getCurrentPosition(
      (position) => {
        setIncidentLocation([position.coords.longitude, position.coords.latitude]);
        setLocatingUser(false);
        showToast("Locația curentă a fost detectată.");
      },
      () => {
        setLocatingUser(false);
        showToast("Accesul la locație a fost refuzat.");
      },
      { enableHighAccuracy: true, timeout: 12_000 },
    );
  }, [showToast]);

  const submitIncidentReport = useCallback(() => {
    if (!incidentLocation) {
      showToast("Adaugă locația curentă înainte de trimitere.");
      return;
    }

    const incident: ReportedIncident = {
      id: `incident-${Date.now()}`,
      createdAt: new Date().toISOString(),
      description: incidentDescription.trim() || "Incendiu localizat / inundare urbană",
      location: incidentLocation,
      imagePreviews: incidentImages,
      zoneId: selectedZoneId,
    };

    setReportedIncidents((current) => [incident, ...current].slice(0, 24));
    setIncidentDescription("");
    setIncidentImages([]);
    setIncidentLocation(null);
    showToast("Incident raportat cu succes.");
  }, [incidentLocation, incidentDescription, incidentImages, selectedZoneId, showToast]);

  return (
    <div className="relative h-screen w-screen overflow-hidden bg-slate-950 text-slate-100">
      <aside className="absolute inset-y-0 left-0 z-40 w-[344px] overflow-y-auto border-r border-slate-700/80 bg-slate-900/95 px-5 py-6 shadow-2xl backdrop-blur-sm">
        <div className="mb-6">
          <p className="text-xs uppercase tracking-[0.22em] text-cyan-300/85">
            Flood Risk Dashboard
          </p>
          <h1 className="mt-2 text-xl font-semibold text-slate-100">
            EU Assessment & Simulation
          </h1>
          <div className="mt-3 inline-flex items-center gap-2 rounded-full bg-slate-800/90 px-3 py-1 text-xs text-slate-200">
            <ShieldAlert className="h-3.5 w-3.5 text-cyan-300" />
            {activeScenarioLabel}
          </div>
          <p className="mt-2 text-[11px] text-slate-400">
            Baseline risk source: {informRiskDataSource.dataset}
          </p>
        </div>

        {selectedZone ? (
          <section className="space-y-4">
            <div className="rounded-xl border border-slate-700/80 bg-slate-800/70 p-4">
              <p className="text-sm text-slate-300">Zonă selectată</p>
              <p className="mt-1 text-base font-medium text-slate-100">{selectedZone.name}</p>
              <span
                className={`mt-3 inline-flex rounded-md px-2 py-1 text-xs font-medium ${getRiskChipClasses(
                  selectedZone.riskLevel,
                )}`}
              >
                Risk Score {selectedZone.riskLevel}
              </span>
              <button
                type="button"
                onClick={() => handleZoneSelection(null)}
                className="mt-3 inline-flex items-center gap-2 rounded-md border border-slate-600/80 bg-slate-900/75 px-2.5 py-1.5 text-xs text-slate-200 transition hover:bg-slate-800"
              >
                <Globe2 className="h-3.5 w-3.5" />
                Revino la harta globală
              </button>
            </div>

            <div className="space-y-3">
              <div className="rounded-xl border border-slate-700/80 bg-slate-800/70 p-3">
                <div className="flex items-center gap-2 text-xs text-slate-300">
                  <Users className="h-3.5 w-3.5 text-cyan-300" />
                  Population at risk
                </div>
                <p className="mt-2 text-lg font-semibold text-slate-100">
                  {formatNumber(selectedZone.stats.populationAtRisk)}
                </p>
              </div>
              <div className="rounded-xl border border-slate-700/80 bg-slate-800/70 p-3">
                <div className="flex items-center gap-2 text-xs text-slate-300">
                  <AlertTriangle className="h-3.5 w-3.5 text-cyan-300" />
                  Average elevation
                </div>
                <p className="mt-2 text-lg font-semibold text-slate-100">
                  {selectedZone.stats.averageElevationM.toFixed(1)} m
                </p>
              </div>
              <div className="rounded-xl border border-slate-700/80 bg-slate-800/70 p-3">
                <div className="flex items-center gap-2 text-xs text-slate-300">
                  <Waves className="h-3.5 w-3.5 text-cyan-300" />
                  Water volume (est.)
                </div>
                <p className="mt-2 text-lg font-semibold text-slate-100">
                  {formatNumber(selectedZone.stats.waterVolumeM3)} m3
                </p>
              </div>
            </div>

            <div className="rounded-xl border border-slate-700/80 bg-slate-800/70 p-3">
              <button
                type="button"
                onClick={() => setPlansExpanded((current) => !current)}
                className="flex w-full items-center justify-between rounded-md bg-cyan-500/20 px-3 py-2 text-left text-sm font-medium text-cyan-100 transition hover:bg-cyan-500/30"
              >
                <span>First Aid Plans</span>
                <ChevronDown
                  className={`h-4 w-4 transition ${plansExpanded ? "rotate-180" : ""}`}
                />
              </button>

              <AnimatePresence initial={false}>
                {plansExpanded ? (
                  <motion.ul
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: "auto" }}
                    exit={{ opacity: 0, height: 0 }}
                    className="mt-3 space-y-2 overflow-hidden text-sm text-slate-200"
                  >
                    {selectedZone.emergencyPlans.map((plan) => (
                      <li
                        key={plan}
                        className="rounded-md border border-slate-700/80 bg-slate-900/70 px-3 py-2"
                      >
                        {plan}
                      </li>
                    ))}
                  </motion.ul>
                ) : null}
              </AnimatePresence>
            </div>
          </section>
        ) : (
          <div className="rounded-xl border border-slate-700/80 bg-slate-800/70 p-4 text-sm text-slate-300">
            Selectează o țară din UE ca să vezi statistici detaliate și opțiuni de simulare.
          </div>
        )}

        <section className="mt-5 rounded-xl border border-slate-700/80 bg-slate-800/70 p-4">
          <h2 className="text-sm font-semibold text-slate-100">Raportează incident</h2>
          <p className="mt-1 text-xs text-slate-300">
            Oricine poate încărca poze și trimite locația curentă.
          </p>

          <textarea
            value={incidentDescription}
            onChange={(event) => setIncidentDescription(event.target.value)}
            placeholder="Descrie incidentul (ex: creștere rapidă nivel apă)."
            className="mt-3 h-20 w-full resize-none rounded-lg border border-slate-600/80 bg-slate-900/80 px-3 py-2 text-xs text-slate-100 outline-none placeholder:text-slate-400"
          />

          <label className="mt-3 flex cursor-pointer items-center justify-center gap-2 rounded-lg border border-slate-600/80 bg-slate-900/75 px-3 py-2 text-xs text-slate-100 transition hover:bg-slate-800">
            <Camera className="h-3.5 w-3.5" />
            Încarcă poze
            <input type="file" accept="image/*" multiple className="hidden" onChange={onImageUpload} />
          </label>

          {incidentImages.length > 0 ? (
            <div className="mt-3 grid grid-cols-2 gap-2">
              {incidentImages.map((preview, index) => (
                <div key={`${preview.slice(0, 24)}-${index}`} className="relative overflow-hidden rounded-md border border-slate-600/70">
                  <img src={preview} alt="Incident upload" className="h-16 w-full object-cover" />
                  <button
                    type="button"
                    onClick={() =>
                      setIncidentImages((current) => current.filter((_, imageIndex) => imageIndex !== index))
                    }
                    className="absolute right-1 top-1 rounded bg-slate-950/80 p-0.5 text-slate-100"
                    aria-label="Șterge imagine"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </div>
              ))}
            </div>
          ) : null}

          <button
            type="button"
            onClick={requestLocation}
            disabled={locatingUser}
            className="mt-3 inline-flex w-full items-center justify-center gap-2 rounded-lg bg-cyan-500/25 px-3 py-2 text-xs font-medium text-cyan-100 transition hover:bg-cyan-500/40 disabled:opacity-70"
          >
            <LocateFixed className="h-3.5 w-3.5" />
            {locatingUser ? "Se detectează locația..." : "Folosește locația curentă"}
          </button>

          <p className="mt-2 text-[11px] text-slate-300">
            {incidentLocation
              ? `Locație: ${incidentLocation[1].toFixed(4)}, ${incidentLocation[0].toFixed(4)}`
              : "Locația nu este setată."}
          </p>

          <button
            type="button"
            onClick={submitIncidentReport}
            className="mt-3 inline-flex w-full items-center justify-center gap-2 rounded-lg bg-emerald-500/30 px-3 py-2 text-xs font-medium text-emerald-100 transition hover:bg-emerald-500/45"
          >
            <Send className="h-3.5 w-3.5" />
            Trimite raportul
          </button>
        </section>

        {reportedIncidents.length > 0 ? (
          <section className="mt-4 rounded-xl border border-slate-700/80 bg-slate-800/70 p-4">
            <h2 className="text-sm font-semibold text-slate-100">Incidente recente</h2>
            <div className="mt-2 space-y-2">
              {reportedIncidents.slice(0, 4).map((incident) => (
                <div key={incident.id} className="rounded-md border border-slate-700/80 bg-slate-900/70 px-3 py-2">
                  <p className="text-xs text-slate-100">{incident.description}</p>
                  <p className="mt-1 text-[11px] text-slate-400">
                    {formatIncidentDate(incident.createdAt)}
                  </p>
                </div>
              ))}
            </div>
          </section>
        ) : null}
      </aside>

      <div
        ref={mapAreaRef}
        className="absolute inset-y-0 right-0"
        style={{ left: `${SIDEBAR_WIDTH}px` }}
      >
        <RiskMap
          zones={zonesWithRisk}
          selectedZoneId={selectedZoneId}
          incidents={reportedIncidents}
          onSelectZone={handleZoneSelection}
          onFocusAnchorChange={setFocusAnchor}
        />

        <AnimatePresence>
          {contextMenuRect && selectedZone ? (
            <motion.div
              className="absolute z-50 w-[248px] rounded-xl border border-slate-700/85 bg-slate-900/90 p-3 shadow-2xl backdrop-blur-sm"
              style={{ left: contextMenuRect.x, top: contextMenuRect.y }}
              initial={{ opacity: 0, y: 10, scale: 0.97 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 8, scale: 0.97 }}
            >
              <div className="mb-2 flex items-center justify-between">
                <p className="text-xs uppercase tracking-[0.16em] text-slate-300">
                  Acțiuni contextuale
                </p>
                <button
                  type="button"
                  onClick={() => setContextMenuVisible(false)}
                  className="rounded-md p-1 text-slate-300 transition hover:bg-slate-700 hover:text-slate-100"
                  aria-label="Ascunde acțiuni"
                >
                  <PanelRightClose className="h-3.5 w-3.5" />
                </button>
              </div>
              <div className="space-y-2">
                <button
                  type="button"
                  onClick={() => openWindow("past")}
                  className="flex w-full items-center justify-between rounded-lg bg-cyan-500/20 px-3 py-2 text-sm font-medium text-cyan-100 transition hover:bg-cyan-500/35"
                >
                  <span className="inline-flex items-center gap-2">
                    <History className="h-4 w-4" />
                    Simulări trecute
                  </span>
                  <span className="text-xs text-cyan-200/85">Free</span>
                </button>

                <button
                  type="button"
                  onClick={handleCreateSimulationClick}
                  className="flex w-full items-center justify-between rounded-lg bg-violet-500/20 px-3 py-2 text-sm font-medium text-violet-100 transition hover:bg-violet-500/35"
                >
                  <span className="inline-flex items-center gap-2">
                    <Sparkles className="h-4 w-4" />
                    Creează simulare
                  </span>
                  <span className="inline-flex items-center gap-1 text-xs text-violet-200">
                    <Lock className="h-3 w-3" />
                    Premium
                  </span>
                </button>
              </div>
            </motion.div>
          ) : null}
        </AnimatePresence>

        {selectedZone && !contextMenuVisible ? (
          <button
            type="button"
            onClick={() => setContextMenuVisible(true)}
            className="absolute right-4 top-20 z-50 inline-flex items-center gap-2 rounded-lg border border-slate-600/85 bg-slate-900/90 px-3 py-2 text-xs text-slate-100 shadow-xl backdrop-blur-sm transition hover:bg-slate-800"
          >
            <PanelRightOpen className="h-3.5 w-3.5" />
            Arată acțiuni
          </button>
        ) : null}

        <AnimatePresence>
          {openWindows.past ? (
            <DraggableWindow
              id="past-simulations-window"
              title="Simulări trecute"
              width={432}
              height={344}
              bounds={windowBounds}
              initialPosition={initialWindowPositions.past}
              avoidRects={avoidRects}
              zIndex={getWindowZIndex("past")}
              onFocus={() => bringToFront("past")}
              onClose={() => closeWindow("past")}
            >
              <div className="space-y-2">
                <button
                  type="button"
                  className={`w-full rounded-lg border px-3 py-2 text-left text-sm transition ${
                    activeScenarioId === "live"
                      ? "border-cyan-400/80 bg-cyan-500/15 text-cyan-100"
                      : "border-slate-700/80 bg-slate-800/70 text-slate-200 hover:bg-slate-700/80"
                  }`}
                  onClick={() => setActiveScenarioId("live")}
                >
                  Flux Live
                </button>
                {historicalSimulations.map((simulation) => (
                  <button
                    type="button"
                    key={simulation.id}
                    className={`w-full rounded-lg border px-3 py-2 text-left text-sm transition ${
                      activeScenarioId === simulation.id
                        ? "border-cyan-400/80 bg-cyan-500/15 text-cyan-100"
                        : "border-slate-700/80 bg-slate-800/70 text-slate-200 hover:bg-slate-700/80"
                    }`}
                    onClick={() => setActiveScenarioId(simulation.id)}
                  >
                    <p className="font-medium">{simulation.label}</p>
                    <p className="mt-1 text-xs text-slate-300">{simulation.notes}</p>
                  </button>
                ))}
              </div>
            </DraggableWindow>
          ) : null}
        </AnimatePresence>

        <AnimatePresence>
          {openWindows.create ? (
            <DraggableWindow
              id="create-simulation-window"
              title="Create Simulation"
              width={444}
              height={340}
              bounds={windowBounds}
              initialPosition={initialWindowPositions.create}
              avoidRects={avoidRects}
              zIndex={getWindowZIndex("create")}
              onFocus={() => bringToFront("create")}
              onClose={() => closeWindow("create")}
            >
              {simulationState === "running" ? (
                <div className="flex h-full flex-col items-center justify-center gap-4 text-center">
                  <div className="h-12 w-12 animate-spin rounded-full border-4 border-cyan-300/80 border-t-transparent" />
                  <p className="text-sm text-slate-200">{loadingMessages[loadingStepIndex]}</p>
                </div>
              ) : null}

              {simulationState === "idle" ? (
                <div className="space-y-4">
                  <p className="text-sm text-slate-300">
                    Simulation engine este gata. Pornește o nouă rulare pentru{" "}
                    {selectedZone?.name ?? "zona selectată"}.
                  </p>
                  <button
                    type="button"
                    onClick={rerunSimulation}
                    className="inline-flex items-center gap-2 rounded-lg bg-cyan-500/30 px-3 py-2 text-sm font-medium text-cyan-100 transition hover:bg-cyan-500/45"
                  >
                    <Sparkles className="h-4 w-4" />
                    Start Simulation
                  </button>
                </div>
              ) : null}

              {simulationState === "complete" && generatedSimulation ? (
                <div className="space-y-4">
                  <div className="rounded-lg border border-emerald-500/40 bg-emerald-500/15 p-3 text-sm text-emerald-100">
                    Simulation Complete
                  </div>
                  <div className="rounded-lg border border-slate-700/80 bg-slate-800/70 p-3 text-sm text-slate-200">
                    <p>
                      Estimated displacement:{" "}
                      <span className="font-semibold text-slate-100">
                        {formatNumber(generatedSimulation.estimatedDisplacement)} people
                      </span>
                    </p>
                    <p className="mt-2">
                      Predicted response time:{" "}
                      <span className="font-semibold text-slate-100">
                        {generatedSimulation.responseTimeMinutes} minutes
                      </span>
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={rerunSimulation}
                    className="inline-flex items-center gap-2 rounded-lg bg-cyan-500/30 px-3 py-2 text-sm font-medium text-cyan-100 transition hover:bg-cyan-500/45"
                  >
                    <Sparkles className="h-4 w-4" />
                    Run Again
                  </button>
                </div>
              ) : null}
            </DraggableWindow>
          ) : null}
        </AnimatePresence>

        <AnimatePresence>
          {toastMessage ? (
            <motion.div
              className="absolute left-1/2 top-4 z-[120] -translate-x-1/2 rounded-lg border border-amber-400/50 bg-amber-500/20 px-4 py-2 text-sm font-medium text-amber-100 shadow-lg backdrop-blur-sm"
              initial={{ opacity: 0, y: -8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -6 }}
            >
              <span className="inline-flex items-center gap-2">
                <Crown className="h-4 w-4" />
                {toastMessage}
              </span>
            </motion.div>
          ) : null}
        </AnimatePresence>
      </div>
    </div>
  );
}
