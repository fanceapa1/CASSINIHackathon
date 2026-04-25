import { useEffect, useRef, useState } from "react";

// Flood risk data by country (ISO_A2 code: risk level)
const FLOOD_RISK_DATA = {
  RO: "critical", HU: "high", RS: "high", BG: "high", HR: "medium",
  BA: "medium", SI: "low", AT: "low", SK: "medium", CZ: "low",
  PL: "medium", DE: "low", FR: "low", IT: "medium", ES: "low",
  PT: "low", GR: "medium", TR: "high", UA: "high", MD: "critical",
  BY: "medium", RU: "low", KZ: "low", GB: "low", IE: "low",
  NL: "low", BE: "low", CH: "low", SE: "low", NO: "low",
  DK: "low", US: "medium", CA: "medium", MX: "high", BR: "high",
  AR: "medium", CN: "high", IN: "critical", JP: "high", AU: "medium",
  ZA: "medium", NG: "critical", EG: "high", KE: "high", TH: "critical",
  ID: "critical", PH: "critical", VN: "high", MY: "high", PK: "critical",
  BD: "critical", MM: "critical", NZ: "low", ZM: "high", MW: "high",
  MZ: "high", AO: "medium", CD: "high", CG: "high", GA: "medium",
  CM: "high", GH: "high", CI: "medium", SN: "medium", ET: "high",
  SD: "critical", SS: "critical", UG: "high", TZ: "high", RW: "high",
  BJ: "medium", NE: "high", ML: "high", MR: "medium", SO: "critical",
  JO: "low", SY: "medium", IQ: "high", IR: "high", AF: "medium",
  TJ: "high", KG: "medium", UZ: "medium", TM: "low", KP: "medium",
  KR: "medium", TW: "high", LA: "critical", KH: "critical", SG: "medium",
  BN: "critical", TL: "critical", PG: "high", SB: "critical", FJ: "critical",
  WS: "critical", TO: "critical", VU: "critical", KI: "critical", MH: "critical",
  NP: "critical", BT: "critical", LK: "high", MV: "critical", CL: "medium",
  PE: "high", CO: "high", VE: "high", EC: "high", BO: "high",
  PY: "high", UY: "high", CR: "high", PA: "high", NI: "high",
  SV: "high", HN: "high", GT: "high", BZ: "high", JM: "high",
  CU: "high", DO: "high", HT: "critical", PR: "high",
};

const FLOOD_RISK_COLORS = {
  critical: { color: "#ff1744", label: "Critic" },
  high: { color: "#ff6d00", label: "Înalt" },
  medium: { color: "#ffc400", label: "Mediu" },
  low: { color: "#00d4ff", label: "Scăzut" },
};

// Global cache variable so we only fetch the map boundaries once per page load
let cachedGeoJson = null;

export default function GlobeComponent({ className = "" }) {
  const containerRef = useRef(null);
  const globeRef = useRef(null);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState(null);
  const [showLegend, setShowLegend] = useState(false);

  useEffect(() => {
    let destroyed = false;
    let resizeObserver = null;

    const initGlobe = async () => {
      try {
        if (destroyed || !containerRef.current) return;

        const { default: Globe } = await import("globe.gl");

        if (destroyed || !containerRef.current) return;

        // Fetch geojson - now using our global cache
        if (!cachedGeoJson) {
          const response = await fetch(
            "https://raw.githubusercontent.com/vasturiano/globe.gl/master/example/datasets/ne_110m_admin_0_countries.geojson"
          );
          if (!response.ok) throw new Error("Failed to load countries data");
          cachedGeoJson = await response.json();
        }

        const countries = cachedGeoJson;
        if (destroyed) return;

        // Clear previous content
        containerRef.current.innerHTML = "";

        // Create globe instance
        const globe = new Globe()(containerRef.current);
        globeRef.current = globe;

        // Set dimensions
        const { clientWidth: width, clientHeight: height } = containerRef.current;
        globe.width(width).height(height);

        // Configure appearance
        globe
          .backgroundColor("rgba(0, 0, 0, 0)")
          .atmosphereColor("#00d4ff")
          .atmosphereAltitude(0.12)
          .showAtmosphere(true)
          .showGraticules(false);

        // GLOBE MATERIAL REPAIR - Fără transparență, culoare solidă
        const globeMaterial = globe.globeMaterial();
        globeMaterial.color.set("#0f172a"); // Un bleumarin închis și solid
        globeMaterial.transparent = false; // Scoatem transparența complet

        // Add country polygons with flood risk coloring
        globe
          .polygonsData(countries.features)
          .polygonAltitude((d) => {
            const iso = d.properties?.ISO_A2;
            const risk = FLOOD_RISK_DATA[iso];
            if (risk === "critical") return 0.014;
            if (risk === "high") return 0.012;
            if (risk === "medium") return 0.010;
            return 0.008;
          })
          .polygonCapColor((d) => {
            const iso = d.properties?.ISO_A2;
            const risk = FLOOD_RISK_DATA[iso] || "low";
            const riskColor = FLOOD_RISK_COLORS[risk];

            const opacity =
              risk === "critical" ? 0.8 :
                risk === "high" ? 0.6 :
                  risk === "medium" ? 0.4 : 0.2;

            const hex = riskColor.color;
            const r = parseInt(hex.slice(1, 3), 16);
            const g = parseInt(hex.slice(3, 5), 16);
            const b = parseInt(hex.slice(5, 7), 16);

            return `rgba(${r}, ${g}, ${b}, ${opacity})`;
          })
          .polygonSideColor(() => "rgba(0, 212, 255, 0.02)")
          .polygonStrokeColor((d) => {
            const iso = d.properties?.ISO_A2;
            const risk = FLOOD_RISK_DATA[iso] || "low";
            const riskColor = FLOOD_RISK_COLORS[risk];
            return riskColor.color + "18";
          })
          .polygonLabel(({ properties: p }) => {
            const iso = p?.ISO_A2;
            const risk = FLOOD_RISK_DATA[iso] || "low";
            const riskColor = FLOOD_RISK_COLORS[risk];
            return `
              <div style="background: rgba(4,7,15,0.95); border: 2px solid ${riskColor.color}; border-radius: 6px; padding: 8px 12px; font-family: monospace; font-size: 12px; color: #e2e8f0; white-space: nowrap;">
                <b style="color:${riskColor.color};">${p.NAME}</b><br/>
                <span style="font-size: 11px; opacity: 0.8;">Risc inundații: <b>${riskColor.label}</b></span>
              </div>
            `;
          });

        // HOVER FIX: Afișăm legenda DOAR când mouse-ul este efectiv pe o țară
        globe.onPolygonHover((polygon) => {
          if (polygon) {
            setShowLegend(true);
          } else {
            setShowLegend(false);
          }
        });

        // Set initial camera position
        globe.pointOfView({ lat: 20, lng: 0, altitude: 1.8 }, 0);

        // Configure controls
        const controls = globe.controls();
        controls.autoRotate = true;
        controls.autoRotateSpeed = 0.4;
        controls.enableZoom = false;
        controls.enablePan = false;

        // Handle resize
        const handleResize = () => {
          if (containerRef.current && globeRef.current) {
            const { clientWidth: w, clientHeight: h } = containerRef.current;
            globeRef.current.width(w).height(h);
          }
        };

        window.addEventListener("resize", handleResize);
        resizeObserver = new ResizeObserver(handleResize);
        resizeObserver.observe(containerRef.current);

        setReady(true);

        return () => {
          window.removeEventListener("resize", handleResize);
          resizeObserver?.disconnect();
        };
      } catch (err) {
        console.error("Globe error:", err);
        if (!destroyed) {
          setError(err.message);
        }
      }
    };

    const cleanup = initGlobe();

    return () => {
      destroyed = true;
      cleanup?.then((fn) => fn?.());
      if (resizeObserver) resizeObserver.disconnect();

      // Cleanup WebGL context memory leak
      if (globeRef.current && globeRef.current._destructor) {
        globeRef.current._destructor();
      }
      globeRef.current = null;
    };
  }, []);

  return (
    <div className={`relative w-full h-full ${className}`}>
      <div
        ref={containerRef}
        style={{
          width: "100%",
          height: "100%",
          position: "relative",
          opacity: ready ? 1 : 0,
          transition: "opacity 0.5s ease-out",
        }}
      />

      {/* Loading state */}
      {!ready && !error && (
        <div
          style={{
            position: "absolute",
            inset: 0,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            backgroundColor: "rgba(0, 0, 0, 0.3)",
          }}
        >
          <div
            style={{
              width: 48,
              height: 48,
              border: "2px solid rgba(0, 212, 255, 0.2)",
              borderTopColor: "rgba(0, 212, 255, 0.8)",
              borderRadius: "50%",
              animation: "spin 1s linear infinite",
            }}
          />
          <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
        </div>
      )}

      {/* Error state */}
      {error && (
        <div
          style={{
            position: "absolute",
            inset: 0,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            backgroundColor: "rgba(0, 0, 0, 0.8)",
            borderRadius: "12px",
          }}
        >
          <div
            style={{
              textAlign: "center",
              color: "#94a3b8",
              fontFamily: "monospace",
              fontSize: "12px",
            }}
          >
            <div style={{ color: "#ff6b6b", marginBottom: "8px", fontSize: "14px" }}>Eroare</div>
            <div style={{ opacity: 0.7 }}>{error}</div>
          </div>
        </div>
      )}

      {/* Legend */}
      {ready && showLegend && (
        <div
          style={{
            position: "absolute",
            bottom: "16px",
            right: "16px",
            zIndex: 10,
            background: "rgba(4, 7, 15, 0.95)",
            backdropFilter: "blur(12px)",
            border: "1px solid rgba(0, 212, 255, 0.3)",
            borderRadius: "12px",
            padding: "14px 16px",
            fontFamily: "monospace",
            fontSize: "11px",
            color: "#cbd5e1",
            pointerEvents: "none",
            animation: "fadeIn 0.3s ease-out",
          }}
        >
          <style>{`
            @keyframes fadeIn {
              from { opacity: 0; transform: translateY(8px); }
              to { opacity: 1; transform: translateY(0); }
            }
          `}</style>

          <div style={{ color: "#00d4ff", fontWeight: 700, marginBottom: "10px", fontSize: "13px" }}>
            RISC INUNDAȚII
          </div>

          {Object.entries(FLOOD_RISK_COLORS).reverse().map(([risk, data]) => (
            <div
              key={risk}
              style={{
                display: "flex",
                alignItems: "center",
                gap: "10px",
                marginBottom: "8px",
                paddingBottom: "8px",
                borderBottom: risk !== "low" ? "1px solid rgba(0, 212, 255, 0.1)" : "none",
              }}
            >
              <span
                style={{
                  width: 12,
                  height: 12,
                  borderRadius: "2px",
                  background: data.color,
                  boxShadow: `0 0 8px ${data.color}`,
                  flexShrink: 0,
                }}
              />
              <span style={{ fontWeight: 500 }}>{data.label}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}