/* Shared persisted records; live camera resources never enter storage. */
(() => {
  const key = "minescout_data";
  const state = {
    missions: [],
    events: [],
    markers: [],
    incidents: [],
    active: null,
    dark: true,
  };
  const id = () => crypto.randomUUID();
  let storageError = "";
  let interrupted = false;
  try {
    const saved = JSON.parse(localStorage.getItem(key) || "null");
    if (saved) {
      for (const name of ["missions", "events", "markers", "incidents"]) {
        if (
          !Array.isArray(saved[name]) ||
          saved[name].some(
            (item) => !item || typeof item !== "object" || Array.isArray(item),
          )
        )
          throw Error("Invalid records");
      }
      for (const name of ["missions", "events", "markers", "incidents"])
        state[name] = saved[name];
      state.dark = saved.dark === true;
      if (
        saved.active &&
        typeof saved.active.id === "string" &&
        Number.isFinite(saved.active.started)
      ) {
        state.missions.unshift({
          ...saved.active,
          ended: Date.now(),
          status: "Interrupted",
        });
        interrupted = true;
      }
    }
  } catch {
    storageError =
      "Saved records could not be loaded. Existing storage is preserved until you make a change.";
  }
  function commit() {
    try {
      localStorage.setItem(key, JSON.stringify(state));
      storageError = "";
    } catch {
      storageError =
        "Changes are in memory only: browser storage is unavailable or full. Export records before closing.";
    }
    window.dispatchEvent(new Event("scout-state"));
  }
  function event(text, extra = {}) {
    state.events.unshift({
      id: id(),
      time: new Date().toLocaleString(),
      text,
      missionId: state.active?.id,
      ...extra,
    });
  }
  function start() {
    if (state.active) return;
    state.active = {
      id: id(),
      name: "Rover mission",
      started: Date.now(),
    };
    event("Rover telemetry received — mission started");
    commit();
  }
  function end(status = "Completed") {
    if (!state.active) return;
    event(`Rover mission ${status.toLowerCase()}`);
    state.missions.unshift({ ...state.active, ended: Date.now(), status });
    state.active = null;
    commit();
  }
  function mark(type) {
    if (
      !state.active ||
      !["rubble", "blocked", "environment", "clear"].includes(type)
    )
      return;
    if (type !== "clear")
      state.markers.push({
        id: id(),
        type,
        left: 50,
        top: 50,
        missionId: state.active.id,
      });
    event(
      `Operator marked ${type} — ${type === "clear" ? "operator note only" : "unlocated marker; no positioning data"}`,
    );
    commit();
  }
  function observe(detection, source) {
    if (
      !state.active ||
      !detection ||
      typeof detection.label !== "string" ||
      !Number.isFinite(detection.confidence)
    )
      return;
    if (
      state.incidents.some(
        (item) =>
          item.missionId === state.active.id &&
          item.source === source &&
          item.type === detection.label &&
          item.status === "needs inspection",
      )
    )
      return;
    state.incidents.unshift({
      id: id(),
      missionId: state.active.id,
      time: new Date().toLocaleString(),
      type: detection.label,
      confidence: Math.round(
        Math.max(0, Math.min(1, detection.confidence)) * 100,
      ),
      status: "needs inspection",
      source,
    });
    commit();
  }
  function decide(incidentId, decision) {
    const incident = state.incidents.find((item) => item.id === incidentId);
    if (
      !incident ||
      incident.status !== "needs inspection" ||
      !["confirmed", "dismissed"].includes(decision)
    )
      return false;
    incident.status = decision;
    if (decision === "confirmed")
      state.markers.push({
        id: id(),
        incidentId,
        missionId: incident.missionId,
        type: "blocked",
        left: 50,
        top: 50,
      });
    event(
      `Operator ${decision} AI observation: ${incident.type}${decision === "confirmed" ? " — unlocated marker added" : ""}`,
      { incidentId, missionId: incident.missionId },
    );
    commit();
    return true;
  }
  window.Scout = {
    state,
    commit,
    start,
    end,
    mark,
    observe,
    decide,
    get storageError() {
      return storageError;
    },
  };
  if (interrupted) commit();
})();
