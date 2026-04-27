import { useEffect, useMemo, useRef, useState } from "react";
import { backend } from "@/api/backendClient";
import { MapPin, Fingerprint, Wifi, WifiOff, Clock } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  createGeofenceInOutWatcher,
  createLocalStorageStore,
} from "../lib/geofenceTimeIn";

function pad2(n) {
  return String(n).padStart(2, "0");
}

function localDayKey(date) {
  const d = date instanceof Date ? date : new Date(date);
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

function resolveGeofenceTarget() {
  const envLat = Number(import.meta.env.VITE_GEOFENCE_LAT);
  const envLon = Number(import.meta.env.VITE_GEOFENCE_LON);
  if (Number.isFinite(envLat) && Number.isFinite(envLon)) {
    return { lat: envLat, lon: envLon, source: "env" };
  }
  return null;
}

export default function MobileTimeIn() {
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState(null);
  const [geoStatus, setGeoStatus] = useState("idle");
  const [coords, setCoords] = useState(null);
  const [distanceMeters, setDistanceMeters] = useState(null);
  const [accuracyMeters, setAccuracyMeters] = useState(null);
  const [withinGeofence, setWithinGeofence] = useState(null);
  const [offlineQueue, setOfflineQueue] = useState([]);
  const watcherRef = useRef(null);

  const geofenceTarget = useMemo(() => resolveGeofenceTarget(), []);

  const getLocation = () =>
    new Promise((res, rej) => {
      if (!navigator.geolocation) {
        setGeoStatus("error");
        rej(new Error("Geolocation not supported"));
        return;
      }

      setGeoStatus("loading");

      let watchId = null;
      let timeoutId = null;
      let best = null;

      const finish = (coords, error) => {
        if (watchId != null) navigator.geolocation.clearWatch(watchId);
        if (timeoutId != null) window.clearTimeout(timeoutId);
        watchId = null;
        timeoutId = null;

        if (coords) {
          setCoords({ lat: coords.latitude, lon: coords.longitude });
          setGeoStatus("ok");
          res(coords);
        } else {
          setGeoStatus("error");
          rej(error || new Error("Unable to fetch location"));
        }
      };

      timeoutId = window.setTimeout(() => {
        if (best) finish(best);
        else finish(null, new Error("Location timeout"));
      }, 15000);

      watchId = navigator.geolocation.watchPosition(
        (p) => {
          const coords = p?.coords;
          const accuracy = coords?.accuracy;
          if (!coords || typeof coords.latitude !== "number" || typeof coords.longitude !== "number") {
            return;
          }

          if (!best) {
            best = coords;
          } else {
            const bestAcc = typeof best.accuracy === "number" ? best.accuracy : Number.POSITIVE_INFINITY;
            const candAcc = typeof accuracy === "number" ? accuracy : Number.POSITIVE_INFINITY;
            if (candAcc < bestAcc) best = coords;
          }

          // Resolve early on a good fix.
          if (typeof accuracy === "number" && accuracy <= 30) {
            finish(coords);
          }
        },
        (err) => {
          if (best) finish(best);
          else finish(null, err);
        },
        { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 },
      );
    });

  const logTime = async (type, options = {}) => {
    setLoading(true);
    try {
      const now = new Date();
      const deviceTimestamp = options.timestampISO || now.toISOString();

      let lat = null;
      let lon = null;

      if (options.coords?.lat != null && options.coords?.lon != null) {
        lat = options.coords.lat;
        lon = options.coords.lon;
        setCoords({ lat, lon });
        setGeoStatus("ok");
      } else {
        try {
          const c = await getLocation();
          lat = c.latitude;
          lon = c.longitude;
        } catch {}
      }

      const record = {
        employee_id: "current",
        type,
        device_timestamp: deviceTimestamp,
        calculated_server_time: now.toISOString(),
        latitude: lat,
        longitude: lon,
        is_within_geofence: options.isWithinGeofence === true,
        biometric_verified: false,
        is_offline_sync: false,
      };
      if (navigator.onLine) {
        await backend.entities.AttendanceLog.create(record);
        setStatus({ type, time: new Date(deviceTimestamp).toLocaleTimeString(), synced: true });

        // Mark same-day triggers for the geofence watcher logic.
        const dayKey = localDayKey(new Date(deviceTimestamp));
        if (type === "TIME_IN") {
          window?.localStorage?.setItem(
            "attendance_auto_timein:last_timein_day",
            dayKey,
          );
        }
        if (type === "TIME_OUT") {
          window?.localStorage?.setItem(
            "attendance_auto_timein:last_timeout_day",
            dayKey,
          );
        }
      } else {
        const queue = [...offlineQueue, record];
        setOfflineQueue(queue);
        localStorage.setItem("offline_timein_queue", JSON.stringify(queue));
        setStatus({ type, time: new Date(deviceTimestamp).toLocaleTimeString(), synced: false });

        // Same-day flag also applies offline to keep behavior consistent.
        const dayKey = localDayKey(new Date(deviceTimestamp));
        if (type === "TIME_IN") {
          window?.localStorage?.setItem(
            "attendance_auto_timein:last_timein_day",
            dayKey,
          );
        }
        if (type === "TIME_OUT") {
          window?.localStorage?.setItem(
            "attendance_auto_timein:last_timeout_day",
            dayKey,
          );
        }
      }
    } finally { setLoading(false); }
  };

  useEffect(() => {
    if (!geofenceTarget) return;

    const threshold = Number(import.meta.env.VITE_GEOFENCE_RADIUS_METERS ?? 50);
    const thresholdMeters = Number.isFinite(threshold) && threshold > 0 ? threshold : 50;

    const watcher = createGeofenceInOutWatcher({
      target: { lat: geofenceTarget.lat, lon: geofenceTarget.lon },
      thresholdMeters,
      maxAccuracyMeters: 50,
      store: createLocalStorageStore("attendance_auto_timein"),
      requireTimeInBeforeTimeOut: true,
      onUpdate: (u) => {
        if (u?.reason === "geolocation_error") {
          setGeoStatus("error");
          return;
        }
        if (u?.reason === "low_accuracy") {
          setGeoStatus("loading");
          setAccuracyMeters(u?.accuracyMeters ?? null);
          return;
        }
        if (u?.coords) {
          setCoords(u.coords);
          setGeoStatus("ok");
        }
        if (typeof u?.distanceMeters === "number") {
          setDistanceMeters(u.distanceMeters);
          setWithinGeofence(u.withinThreshold);
        }
        if (typeof u?.accuracyMeters === "number") {
          setAccuracyMeters(u.accuracyMeters);
        }
      },
      onTimeIn: async (payload) => {
        await logTime("TIME_IN", {
          coords: payload.coords,
          timestampISO: payload.triggeredAt,
          isWithinGeofence: true,
          isAuto: true,
        });
      },
      onTimeOut: async (payload) => {
        await logTime("TIME_OUT", {
          coords: payload.coords,
          timestampISO: payload.triggeredAt,
          isWithinGeofence: false,
          isAuto: true,
        });
      },
    });

    watcherRef.current = watcher;
    try {
      watcher.start();
    } catch {
      setGeoStatus("error");
    }
    return () => watcher.stop();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [geofenceTarget?.lat, geofenceTarget?.lon]);

  const syncOffline = async () => {
    setLoading(true);
    const queue = JSON.parse(localStorage.getItem("offline_timein_queue") || "[]");
    for (const r of queue) { await backend.entities.AttendanceLog.create({ ...r, is_offline_sync: true }); }
    localStorage.removeItem("offline_timein_queue");
    setOfflineQueue([]);
    setStatus({ type: "sync", time: new Date().toLocaleTimeString(), synced: true });
    setLoading(false);
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 to-blue-900 flex items-center justify-center p-4">
      <div className="bg-white rounded-3xl shadow-2xl w-full max-w-sm p-8 space-y-6">
        <div className="text-center">
          <div className="w-16 h-16 bg-blue-600 rounded-2xl flex items-center justify-center mx-auto mb-3">
            <Clock className="w-8 h-8 text-white"/>
          </div>
          <h1 className="text-2xl font-bold text-slate-900">Time In/Out</h1>
          <p className="text-slate-500 text-sm mt-1">{new Date().toLocaleDateString("en-PH",{weekday:"long",month:"long",day:"numeric"})}</p>
        </div>

        <div className="flex items-center justify-between text-sm px-2">
          <div className={`flex items-center gap-1.5 ${geoStatus==="ok"?"text-green-600":geoStatus==="error"?"text-red-500":"text-slate-400"}`}>
            <MapPin className="w-4 h-4"/>{geoStatus==="ok"?"Location OK":geoStatus==="error"?"GPS Error":"Location Pending"}
          </div>
          <div className={`flex items-center gap-1.5 ${navigator.onLine?"text-green-600":"text-red-500"}`}>
            {navigator.onLine ? <Wifi className="w-4 h-4"/> : <WifiOff className="w-4 h-4"/>}
            {navigator.onLine ? "Online" : "Offline"}
          </div>
        </div>

        {geofenceTarget && geoStatus === "ok" && typeof distanceMeters === "number" && (
          <div className="text-xs text-slate-600 px-2">
            Distance from set location: {Math.round(distanceMeters)}m · Radius {Math.round(thresholdMeters)}m
            {typeof accuracyMeters === "number" ? ` · Accuracy ±${Math.round(accuracyMeters)}m` : ""}
            {withinGeofence === true ? " · Inside" : withinGeofence === false ? " · Outside" : ""}
          </div>
        )}

        {status && (
          <div className={`rounded-xl p-4 text-center ${status.synced?"bg-green-50 border border-green-200":"bg-yellow-50 border border-yellow-200"}`}>
            <p className="font-semibold text-sm">{status.type==="sync"?"Sync complete":status.type==="TIME_IN"?"Time In Recorded":"Time Out Recorded"}</p>
            <p className="text-xs text-slate-500">{status.time} · {status.synced?"Synced":"Saved offline"}</p>
          </div>
        )}

        <div className="space-y-3">
          <Button className="w-full h-14 text-base bg-green-600 hover:bg-green-700 gap-2" onClick={() => logTime("TIME_IN")} disabled={loading}>
            <Fingerprint className="w-5 h-5"/> Time In
          </Button>
          <Button className="w-full h-14 text-base bg-red-600 hover:bg-red-700 gap-2" onClick={() => logTime("TIME_OUT")} disabled={loading}>
            <Fingerprint className="w-5 h-5"/> Time Out
          </Button>
          {offlineQueue.length > 0 && (
            <Button variant="outline" className="w-full gap-2" onClick={syncOffline} disabled={loading || !navigator.onLine}>
              <Wifi className="w-4 h-4"/> Sync {offlineQueue.length} Pending Records
            </Button>
          )}
        </div>

        <div className="bg-slate-50 rounded-xl p-4 space-y-2 text-xs text-slate-500">
          <p className="font-semibold text-slate-700 text-sm">Features</p>
          <div className="flex items-center gap-2"><MapPin className="w-3 h-3 text-blue-500 shrink-0"/> Geotagging & Geofencing</div>
          <div className="flex items-center gap-2"><Fingerprint className="w-3 h-3 text-purple-500 shrink-0"/> Biometric / Touch ID (device-native)</div>
          <div className="flex items-center gap-2"><WifiOff className="w-3 h-3 text-orange-500 shrink-0"/> Offline Time-In with auto-sync</div>
          <div className="flex items-center gap-2"><Clock className="w-3 h-3 text-green-500 shrink-0"/> Server-based time sync on upload</div>
        </div>
      </div>
    </div>
  );
}