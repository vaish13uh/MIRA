/* DOM rendering uses textContent for all stored and external text. */
(() => {
  const { state } = Scout;
  const q = (selector) => document.querySelector(selector);
  const titles = {
    home: "Command overview",
    live: "Live mission",
    map: "Tunnel map",
    history: "Mission history",
    rover: "Rover status",
    incidents: "AI incidents",
  };
  let screen = "home",
    toastTimer = null;
  function element(tag, text, className) {
    const node = document.createElement(tag);
    if (text != null) node.textContent = String(text);
    if (className) node.className = className;
    return node;
  }
  function set(selector, text) {
    const node = q(selector);
    if (node) node.textContent = text;
  }
  function toast(message) {
    clearTimeout(toastTimer);
    set("#toast", message);
    q("#toast").classList.add("show");
    toastTimer = setTimeout(() => q("#toast").classList.remove("show"), 4000);
  }
  function go(next) {
    if (!titles[next]) next = "home";
    if (next !== screen) window.Rover?.stop();
    screen = next;
    document
      .querySelectorAll(".screen")
      .forEach((node) => node.classList.toggle("active", node.id === next));
    document.querySelectorAll("[data-screen]").forEach((node) => {
      node.classList.toggle("active", node.dataset.screen === next);
      if (node.dataset.screen === next)
        node.setAttribute("aria-current", "page");
      else node.removeAttribute("aria-current");
    });
    set("#page-title", titles[next]);
    window.scrollTo({ top: 0, behavior: "auto" });
  }
  function render() {
    document.body.classList.toggle("dark", state.dark);
    q("#theme-switch").checked = state.dark;
    set("#storage-error", Scout.storageError);
    q("#storage-error").hidden = !Scout.storageError;
    set("#mission-name", state.active ? "Rover mission" : "No active mission");
    set(
      "#mission-description",
      state.active
        ? "Camera, movement and incident review in one workspace."
        : "Connect the rover to start receiving data.",
    );
    set(
      "#mission-action",
      state.active ? "Open live workspace →" : "Connect rover →",
    );
    set("#start-test", state.active ? "Rover connected" : "Connect rover");
    q("#start-test").disabled = !!state.active;
    q("#end-session").hidden = !state.active;
    set("#side-status", state.active ? " Rover linked" : " Rover not linked");
    set(
      "#side-detail",
      state.active ? "Receiving telemetry" : "Connection required",
    );
    set(
      "#connection-status",
      state.active ? "ROVER CONNECTED" : "Not connected",
    );
    const pending = state.incidents.filter(
      (item) => item.status === "needs inspection",
    );
    set("#alert-count", String(pending.length));
    set("#alert-detail", "AI observations awaiting operator review");
    q('[data-screen="incidents"]').hidden = state.incidents.length === 0;
    const timeline = q("#timeline-items");
    timeline.replaceChildren();
    for (const event of state.events) {
      const row = element("div", null, "event");
      row.append(
        element("strong", `${event.time ?? ""} · ${event.text ?? ""}`),
      );
      timeline.append(row);
    }
    if (!state.events.length)
      timeline.append(
        element("p", "No camera observations or operator decisions recorded."),
      );
    const map = q("#map-markers");
    map.replaceChildren();
    state.markers.forEach((marker, index) => {
      if (!["rubble", "blocked", "environment"].includes(marker.type)) return;
      const button = element("button", null, `marker ${marker.type}`);
      // No positioning hardware: use an explicitly unlocated marker tray, not fabricated coordinates.
      button.style.left = `${10 + (index % 8) * 11}%`;
      button.style.top = `${20 + Math.floor(index / 8) * 42}px`;
      button.title = `${marker.type} — unlocated operator marker`;
      button.append(
        element(
          "span",
          marker.type === "rubble"
            ? "!"
            : marker.type === "blocked"
              ? "×"
              : "~",
        ),
      );
      button.onclick = () => toast(button.title);
      map.append(button);
    });
    map.style.minHeight = `${Math.max(140, Math.ceil(state.markers.length / 8) * 42 + 30)}px`;
    set(
      "#map-note",
      state.markers.length
        ? "Unlocated operator markers · no surveyed tunnel coordinates"
        : "No tunnel map data · markers appear here when added",
    );
    for (const selector of ["#recent-missions", "#history-list"]) {
      const list = q(selector);
      list.replaceChildren();
      for (const mission of selector === "#recent-missions"
        ? state.missions.slice(0, 3)
        : state.missions) {
        const row = element(
          "article",
          null,
          selector === "#recent-missions" ? "mission-card" : "",
        );
        const info = element("div");
        info.append(
          element("h3", mission.name || "Rover mission"),
          element("p", mission.status || "Saved"),
        );
        row.append(
          info,
          element(
            "p",
            mission.date || new Date(mission.started).toLocaleString(),
          ),
          element(
            "p",
            Number.isFinite(mission.ended - mission.started)
              ? `${Math.max(0, Math.round((mission.ended - mission.started) / 60000))} min`
              : mission.duration || "—",
          ),
        );
        row.append(
          element(
            "p",
            `${state.incidents.filter((item) => item.missionId === mission.id && item.status === "confirmed").length} confirmed`,
          ),
        );
        const report = element("button", "Open report →", "report");
        report.onclick = () => exportRecords(mission.id);
        row.append(report);
        list.append(row);
      }
      if (!list.childElementCount)
        list.append(
          element(
            "article",
            "No saved missions. End a mission to save its report.",
            "mission-card",
          ),
        );
    }
    const list = q("#incident-list");
    list.replaceChildren();
    for (const incident of state.incidents) {
      const row = element("article");
      const info = element("div");
      info.append(
        element("h3", incident.type),
        element(
          "p",
          `${incident.source ?? "Unknown source"} · ${incident.time ?? ""}`,
        ),
      );
      row.append(
        info,
        element("p", `${incident.confidence ?? "—"}% confidence`),
        element("p", "Visual observation only"),
        element("strong", incident.status),
      );
      if (incident.status === "needs inspection") {
        const actions = element("div", null, "decision-row");
        for (const decision of ["confirmed", "dismissed"]) {
          const button = element(
            "button",
            decision === "confirmed" ? "Confirm hazard" : "Dismiss",
          );
          button.onclick = () => {
            if (Scout.decide(incident.id, decision))
              toast(`Incident ${decision}; timeline updated.`);
          };
          actions.append(button);
        }
        row.append(actions);
      }
      list.append(row);
    }
    if (!state.incidents.length)
      list.append(
        element(
          "article",
          "No AI incidents yet. Connect the rover camera to begin.",
        ),
      );
    window.Rover?.render();
  }
  function startTest() {
    window.Rover?.open();
  }
  function stop(status = "Completed") {
    window.Rover?.disconnect(status);
    go("home");
  }
  function exportRecords(missionId) {
    const data = missionId
      ? Object.fromEntries(
          ["missions", "events", "markers", "incidents"].map((name) => [
            name,
            state[name].filter((item) =>
              name === "missions"
                ? item.id === missionId
                : item.missionId === missionId,
            ),
          ]),
        )
      : state;
    const url = URL.createObjectURL(
      new Blob([JSON.stringify(data, null, 2)], { type: "application/json" }),
    );
    const link = element("a");
    link.href = url;
    link.download = "minescout-records.json";
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  document.addEventListener("click", (event) => {
    const nav = event.target.closest("[data-screen]");
    if (nav) go(nav.dataset.screen);
    const mark = event.target.closest("[data-marker]");
    if (mark) Scout.mark(mark.dataset.marker);
    if (event.target.closest("#mission-action")) {
      if (!state.active) startTest();
      else go("live");
    }
    if (event.target.closest(".open-camera")) {
      go("live");
      window.Camera?.connect(document.querySelector("#camera-url").value.trim());
    }
  });
  q("#start-test").onclick = startTest;
  q("#end-session").onclick = () => stop();
  q(".stop").onclick = () => window.Rover?.stop();
  function theme() {
    state.dark = !state.dark;
    Scout.commit();
  }
  q("#theme-toggle").onclick = theme;
  q("#theme-switch").onchange = theme;
  q("#export-records").onclick = () => exportRecords();
  for (const selector of ["#zoom-in", "#zoom-out", "#recenter"]) {
    q(selector).disabled = true;
    q(selector).title = "Requires surveyed positioning data";
  }
  window.addEventListener("scout-state", render);
  window.addEventListener("pagehide", () => {
    clearTimeout(toastTimer);
    window.Rover?.disconnect("Interrupted");
  });
  window.addEventListener("pageshow", render);
  window.ScoutUI = {
    go,
    toast,
    element,
    get screen() {
      return screen;
    },
  };
  render();
})();
