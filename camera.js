/* Rover camera only; the browser sends real sampled frames to the existing YOLO service. */
(() => {
  const q = (selector) => document.querySelector(selector);
  const { element } = ScoutUI;
  const feed = q(".camera-feed");
  let media = null,
    overlay = null,
    timer = null,
    request = null,
    readiness = null,
    boxes = [],
    frameSize = null,
    generation = 0;
  function clearResult(message) {
    q(".ai-card h2").textContent = "Awaiting analysis";
    q(".ai-card h2 + p").textContent = message;
    q(".ai-card .confidence strong").textContent = "—";
    q(".ai-card .confidence + .bar i").style.width = "0%";
    q("#detection-list").replaceChildren(
      element("p", "No current detections."),
    );
    q("#frame-time").textContent = "No current analysed frame";
    boxes = [];
    drawBoxes();
  }
  function disconnect(message = "Camera disconnected.") {
    expand(false);
    generation++;
    clearInterval(timer);
    clearInterval(readiness);
    timer = null;
    readiness = null;
    request?.abort();
    request = null;
    if (media) {
      media.onerror = null;
      media.removeAttribute("src");
      media.remove();
    }
    media = null;
    overlay = null;
    frameSize = null;
    boxes = [];
    feed.replaceChildren(element("p", message, "feed-message"));
    q("#camera-detail").textContent = message;
    q("#video-state").textContent = "NO STREAM";
    clearResult("No current visual result.");
    window.Rover?.endCameraFeed();
  }
  function connect(address) {
    disconnect("Connecting rover camera…");
    const token = generation;
    try {
      const url = new URL(address);
      if (
        !["http:", "https:"].includes(url.protocol) ||
        url.username ||
        url.password
      )
        throw Error(
          "Set a valid ESP32-CAM stream address in Rover Connection.",
        );
      media = element("img");
      media.alt = "Live rover camera";
      media.crossOrigin = "anonymous";
      overlay = element("canvas");
      overlay.setAttribute("aria-hidden", "true");
      feed.replaceChildren(media, overlay);
      media.onerror = () => {
        if (token === generation)
          disconnect(
            "Camera unavailable. Check its stream address, Wi-Fi and CORS access.",
          );
      };
      media.src = url.href;
      const started = performance.now();
      // MJPEG may never finish loading: dimensions, rather than an image load event, signal the first frame.
      readiness = setInterval(() => {
        if (token !== generation) return;
        if (media.naturalWidth && media.naturalHeight) {
          clearInterval(readiness);
          readiness = null;
          q("#video-state").textContent = "STREAM RECEIVED";
          q("#camera-detail").textContent =
            "Camera connected";
          window.Rover?.startCameraFeed();
          timer = setInterval(analyse, 1300);
          void analyse();
        } else if (performance.now() - started > 12000)
          disconnect(
            "Camera connection timed out. Check the stream address and try reconnecting.",
          );
      }, 200);
    } catch (error) {
      disconnect(error.message);
    }
  }
  function drawBoxes() {
    if (!overlay) return;
    overlay.width = feed.clientWidth;
    overlay.height = feed.clientHeight;
    const ctx = overlay.getContext("2d");
    ctx.clearRect(0, 0, overlay.width, overlay.height);
    if (!frameSize) return;
    const scale = Math.min(
      overlay.width / frameSize.width,
      overlay.height / frameSize.height,
    );
    const left = (overlay.width - frameSize.width * scale) / 2,
      top = (overlay.height - frameSize.height * scale) / 2;
    ctx.font = "13px system-ui";
    ctx.lineWidth = 2;
    for (const item of boxes) {
      const b = item.bbox;
      if (
        !b ||
        !["x1", "y1", "x2", "y2"].every((key) => Number.isFinite(b[key])) ||
        b.x2 <= b.x1 ||
        b.y2 <= b.y1
      )
        continue;
      const x = left + Math.max(0, b.x1) * scale,
        y = top + Math.max(0, b.y1) * scale;
      ctx.strokeStyle = "#dab8fa";
      ctx.strokeRect(
        x,
        y,
        (Math.min(frameSize.width, b.x2) - Math.max(0, b.x1)) * scale,
        (Math.min(frameSize.height, b.y2) - Math.max(0, b.y1)) * scale,
      );
      const label = `${item.label} ${Math.round(item.confidence * 100)}%`;
      const width = Math.min(
        ctx.measureText(label).width + 12,
        overlay.width - x,
      );
      ctx.fillStyle = "#302437";
      ctx.fillRect(x, Math.max(0, y - 22), width, 22);
      ctx.fillStyle = "#fff";
      ctx.fillText(label, x + 6, Math.max(15, y - 6), Math.max(1, width - 12));
    }
  }
  async function analyse() {
    if (!media || request || !Rover.connected) return;
    const image = media,
      token = generation,
      controller = new AbortController();
    request = controller;
    const timeout = setTimeout(() => controller.abort(), 15000);
    try {
      const canvas = element("canvas"),
        scale = Math.min(1, 960 / image.naturalWidth);
      canvas.width = Math.round(image.naturalWidth * scale);
      canvas.height = Math.round(image.naturalHeight * scale);
      if (!canvas.width || !canvas.height)
        throw Error("The camera has no usable frame.");
      canvas
        .getContext("2d")
        .drawImage(image, 0, 0, canvas.width, canvas.height);
      const blob = await new Promise((resolve) =>
        canvas.toBlob(resolve, "image/jpeg", 0.82),
      );
      if (token !== generation || controller.signal.aborted) return;
      if (!blob) throw Error("Could not capture the camera frame.");
      const body = new FormData();
      body.append("file", blob, "frame.jpg");
      const response = await fetch(`${Rover.aiUrl}/api/analyze-frame`, {
        method: "POST",
        body,
        signal: controller.signal,
      });
      if (!response.ok)
        throw Error(
          `YOLO service error (${response.status}). Check the Python service.`,
        );
      const result = await response.json();
      if (
        !Array.isArray(result.detections) ||
        result.detections.length > 1000 ||
        result.detections.some(
          (item) =>
            !item ||
            typeof item.label !== "string" ||
            !Number.isFinite(item.confidence) ||
            item.confidence < 0 ||
            item.confidence > 1,
        )
      )
        throw Error("YOLO returned an invalid detection result.");
      if (token !== generation) return;
      boxes = result.detections;
      frameSize = { width: canvas.width, height: canvas.height };
      drawBoxes();
      const sorted = [...boxes].sort((a, b) => b.confidence - a.confidence),
        first = sorted[0];
      q(".ai-card h2").textContent = first
        ? "Review observations"
        : "No objects detected";
      q(".ai-card h2 + p").textContent = first
        ? `${boxes.length} object${boxes.length === 1 ? "" : "s"} in the latest analysed frame.`
        : "No objects detected in this frame. This is not a safety clearance.";
      q(".ai-card .confidence strong").textContent = first
        ? `${Math.round(first.confidence * 100)}%`
        : "—";
      q(".ai-card .confidence + .bar i").style.width =
        `${first ? first.confidence * 100 : 0}%`;
      const list = q("#detection-list");
      list.replaceChildren();
      for (const item of sorted) {
        const row = element("div", null, "detection-row");
        row.append(
          element("span", item.label),
          element("strong", `${Math.round(item.confidence * 100)}%`),
        );
        list.append(row);
        Scout.observe(item, "ESP32-CAM / YOLOv8");
      }
      if (!first)
        list.append(element("p", "No objects in the latest analysed frame."));
      q("#frame-time").textContent =
        `Analysed ${new Date().toLocaleTimeString()}`;
      q("#camera-detail").textContent =
        "ESP32-CAM connected · YOLO analysis active";
    } catch (error) {
      if (token !== generation) return;
      const message =
        error.name === "SecurityError"
          ? "Camera frame access is blocked. Enable CORS on the camera stream."
          : error.name === "AbortError"
            ? "YOLO request timed out. Retrying with the next frame."
            : error instanceof TypeError
              ? "Cannot reach YOLO. Start the Python AI service or check its address."
              : error.message;
      clearResult(message);
      q("#camera-detail").textContent = message;
    } finally {
      clearTimeout(timeout);
      if (request === controller) request = null;
    }
  }
  function decisions() {
    const list = q("#live-decisions");
    list.replaceChildren();
    const pending = Scout.state.incidents.filter(
      (item) => item.status === "needs inspection",
    );
    for (const incident of pending.slice(0, 3)) {
      const row = element("article");
      row.append(element("p", `${incident.type} · ${incident.time}`));
      const actions = element("div", null, "decision-row");
      for (const decision of ["confirmed", "dismissed"]) {
        const button = element(
          "button",
          decision === "confirmed" ? "Confirm hazard" : "Dismiss",
        );
        button.onclick = () => Scout.decide(incident.id, decision);
        actions.append(button);
      }
      row.append(actions);
      list.append(row);
    }
  }
  function expand(value) {
    q(".live-layout").classList.toggle("camera-expanded", value);
    document.body.classList.toggle("workspace-expanded", value);
    q("#expand-camera").textContent = value
      ? "Collapse workspace"
      : "Expand workspace";
    q("#expand-camera").setAttribute("aria-pressed", String(value));
  }
  q("#expand-camera").onclick = () =>
    expand(!document.body.classList.contains("workspace-expanded"));
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") expand(false);
  });
  document.addEventListener("click", (event) => {
    if (event.target.closest("[data-screen]")) expand(false);
  });
  new ResizeObserver(drawBoxes).observe(feed);
  window.addEventListener("scout-state", decisions);
  window.addEventListener("pagehide", () => disconnect());
  window.Camera = { connect, disconnect };
  decisions();
  disconnect("Enter a camera stream address to connect the camera.");
})();
