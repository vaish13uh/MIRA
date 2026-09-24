/* MIRA transport: newline-delimited packets over Serial or WebSocket. */
(() => {
  const ranges = {
    distance_cm: [0, 10000],
    tilt_deg: [-180, 180],
    co_ppm: [0, 100000],
    ch4_ppm: [0, 1000000],
    battery_pct: [0, 100],
    rssi: [-150, 0],
    radar: [0, 1],
    pir: [0, 1],
    human: [0, 1],
  };
  function parse(line, ble = false) {
    let packet;
    if (line.startsWith("DATA,")) {
      const parts = line.trim().split(",");
      if (parts.length !== 9) return null;
      packet = { type: "telemetry" };
      [
        "human",
        "radar",
        "pir",
        "co_ppm",
        "ch4_ppm",
        "distance_cm",
        "tilt_deg",
      ].forEach((key, i) => {
        packet[key] =
          parts[i + 1].trim() === "" || parts[i + 1] === "null"
            ? null
            : Number(parts[i + 1]);
      });
    } else {
      try {
        packet = JSON.parse(line);
      } catch {
        return null;
      }
    }
    if (!packet || typeof packet !== "object" || Array.isArray(packet))
      return null;
    if (ble && !packet.type && ["dist", "pitch", "roll"].some(key => key in packet)) {
      packet = { ...packet, type: "telemetry", distance_cm: packet.dist, tilt_deg: packet.pitch };
    }
    if (packet.type === "telemetry") {
      const clean = { type: "telemetry" };
      for (const [key, [low, high]] of Object.entries(ranges)) {
        const value = packet[key];
        if (value == null) {
          clean[key] = null;
          continue;
        }
        if (
          !Number.isFinite(value) ||
          value < low ||
          value > high ||
          (["pir", "radar", "human"].includes(key) && ![0, 1].includes(value))
        )
          return null;
        clean[key] = value;
      }
      clean.relay_id =
        typeof packet.relay_id === "string" ? packet.relay_id.slice(0, 60) : "";
      clean.via_relay = packet.via_relay === true && !!clean.relay_id;
      return clean;
    }
    if (packet.type === "hello" && packet.protocol === "mira-v1") {
      return {
        type: "hello",
        ready:
          packet.motors_ready === true &&
          Number.isInteger(packet.watchdog_ms) &&
          packet.watchdog_ms >= 300 &&
          packet.watchdog_ms <= 1000,
      };
    }
    if (
      packet.type === "ack" &&
      Number.isSafeInteger(packet.id) &&
      ["F", "B", "L", "R", "S"].includes(packet.command)
    )
      return packet;
    return null;
  }
  function previewAt(seconds) {
    return {
      distance_cm: Math.round(70 + 22 * Math.sin(seconds / 3)),
      tilt_deg: Math.round((1.8 + 1.2 * Math.sin(seconds / 2)) * 10) / 10,
      co_ppm: 0,
      radar: Math.floor(seconds / 4) % 2,
      pir: Math.floor(seconds / 7) % 2,
      battery_pct: Math.max(5, 92 - Math.floor(seconds / 30)),
    };
  }
  if (typeof module !== "undefined") module.exports = { parse, previewAt };
  if (typeof document === "undefined") return;
  const q = (selector) => document.querySelector(selector);
  const set = (selector, text) => {
    q(selector).textContent = text;
  };
  let link = null,
    generation = 0,
    timer = null,
    sequence = 0,
    desired = "S",
    pending = null,
    heldKey = null;
  let config = {
    transport: "serial",
    baud: 115200,
    socket: "",
    camera: "",
    ai: "http://127.0.0.1:8000",
    threshold: 25,
  };
  try {
    const saved = JSON.parse(localStorage.getItem("mira_connection") || "{}");
    for (const key of Object.keys(config))
      if (saved[key] != null) config[key] = saved[key];
  } catch {
    /* Settings are optional. */
  }
  q("#transport").value = ["ble", "serial", "websocket"].includes(config.transport)
    ? config.transport
    : "serial";
  q("#baud").value = [9600, 115200].includes(Number(config.baud))
    ? String(config.baud)
    : "115200";
  q("#socket-url").value = String(config.socket);
  q("#camera-url").value = String(config.camera);
  q("#ai-url").value = String(config.ai);
  q("#obstacle-threshold").value = Number.isFinite(Number(config.threshold))
    ? config.threshold
    : 25;
  function chooseTransport() {
    const serial = q("#transport").value === "serial";
    q("#socket-field").hidden = q("#transport").value !== "websocket";
    q("#camera-url").required = false;
    q("#socket-url").required = q("#transport").value === "websocket";
    q("#baud-field").hidden = !serial;
  }
  q("#transport").onchange = chooseTransport;
  chooseTransport();
  function validUrl(value, protocols, requireSecure = true) {
    const url = new URL(value);
    if (!protocols.includes(url.protocol) || url.username || url.password)
      throw Error("Enter a valid address without embedded credentials.");
    if (
      requireSecure && location.protocol === "https:" &&
      ["http:", "ws:"].includes(url.protocol)
    )
      throw Error(
        "This HTTPS page requires secure device addresses. For a local rover, open the app on localhost.",
      );
    return url.href;
  }
  function open() {
    ScoutUI.go("rover");
    q("#camera-url").focus();
  }
  function startCameraFeed() {
    if (link) return;
    const resource = {
      cameraFeed: true,
      live: true,
      ready: false,
      moved: true,
      data: previewAt(0),
      last: performance.now(),
      started: performance.now(),
    };
    link = resource;
    Scout.start();
    timer = setInterval(() => {
      if (resource !== link) return;
      resource.data = previewAt((performance.now() - resource.started) / 1000);
      resource.last = performance.now();
      render();
    }, 500);
    render();
    set("#rover-message", "Live camera connected.");
  }
  function endCameraFeed() {
    if (!link?.cameraFeed) return;
    clearInterval(timer);
    timer = null;
    link = null;
    Scout.end("Completed");
    render();
  }
  async function send(text, resource = link) {
    if (!resource || resource !== link) return;
    if (resource.ble) {
      if (!resource.tx) throw Error("Bluetooth command channel is unavailable.");
      const bytes = new TextEncoder().encode(text + "\n");
      const write = async () => {
        if (!resource.device.gatt.connected) return;
        if (text !== "S" && resource !== link) return;
        if (/^[FBLR]$/.test(text) && desired !== text) return;
        let timeout;
        try {
          await Promise.race([
            resource.tx.properties.writeWithoutResponse
              ? resource.tx.writeValueWithoutResponse(bytes)
              : resource.tx.writeValueWithResponse(bytes),
            new Promise((_, reject) => { timeout = setTimeout(() => reject(Error("Bluetooth write timed out.")), 1000); }),
          ]);
        } finally { clearTimeout(timeout); }
      };
      resource.writes = (resource.writes || Promise.resolve()).catch(() => {}).then(write);
      await resource.writes;
    } else if (resource.socket) {
      if (
        resource.socket.readyState !== WebSocket.OPEN ||
        resource.socket.bufferedAmount > 1024
      )
        throw Error("Rover link is not ready to send commands.");
      resource.socket.send(text + "\n");
    } else {
      if (!resource.writer) throw Error("Serial output is unavailable.");
      let timeout;
      try {
        await Promise.race([
          resource.writer.write(new TextEncoder().encode(text + "\n")),
          new Promise((_, reject) => {
            timeout = setTimeout(
              () => reject(Error("Serial output timed out.")),
              1000,
            );
          }),
        ]);
      } finally {
        clearTimeout(timeout);
      }
    }
  }
  function command(direction) {
    if (!link?.live) return;
    if (direction !== "S" && !link.ready)
      return;
    const resource = link;
    const id = ++sequence;
    pending = resource.ble ? null : { id, command: direction, sent: performance.now() };
    set(
      "#drive-status",
      direction === "S"
        ? "Stop sent…"
        : `${{ F: "Forward", B: "Backward", L: "Left", R: "Right" }[direction]} sent…`,
    );
    send(resource.ble ? direction : `CMD,${id},${direction}`, resource).then(() => {
      if (resource.ble && resource === link && direction !== "S" && desired === direction) {
        resource.moved = true;
        render();
      }
    }).catch((error) => {
      if (resource === link) disconnect("Interrupted", error.message);
    });
  }
  function stop(disarm = false) {
    const wasMoving =
      desired !== "S" || (pending?.command !== "S" && !!pending);
    desired = "S";
    heldKey = null;
    document
      .querySelectorAll("[data-drive]")
      .forEach((button) => button.classList.remove("held"));
    if (link?.live && (wasMoving || disarm)) command("S");
    render();
  }
  function drive(direction) {
    if (
      !link?.live ||
      !link.ready ||
      ScoutUI.screen !== "live" ||
      document.hidden
    )
      return;
    if (desired === direction) return;
    desired = direction;
    document
      .querySelectorAll("[data-drive]")
      .forEach((button) =>
        button.classList.toggle("held", button.dataset.drive === direction),
      );
    command(direction);
  }
  function receive(line, resource) {
    if (resource !== link) return;
    const packet = parse(line.trim(), resource.ble);
    if (!packet) return;
    if (packet.type === "hello") {
      resource.ready = packet.ready;
      if (!packet.ready) stop(true);
      render();
      return;
    }
    if (packet.type === "ack") {
      if (
        !pending ||
        packet.id !== pending.id ||
        packet.command !== pending.command
      )
        return;
      const motion = pending.command !== "S";
      pending = null;
      if (packet.accepted !== true) {
        stop(true);
        set("#drive-status", "Command rejected");
        return;
      }
      if (motion && desired !== "S") resource.moved = true;
      set(
        "#drive-status",
        `${{ F: "Forward", B: "Backward", L: "Left", R: "Right", S: "Stopped" }[packet.command]} · acknowledged`,
      );
      render();
      return;
    }
    resource.data = packet;
    resource.last = performance.now();
    if (!resource.live) {
      resource.live = true;
      resource.started = performance.now();
      Scout.start();
      ScoutUI.go("live");
      window.Camera?.connect(config.camera);
      set(
        "#rover-message",
        "Rover telemetry connected. Camera is optional and connects separately.",
      );
    }
    render();
  }
  async function readSerial(resource) {
    const reader = resource.port.readable.getReader();
    resource.reader = reader;
    const decoder = new TextDecoder();
    let buffer = "";
    try {
      while (resource === link) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        if (buffer.length > 16384)
          throw Error(
            "Rover data exceeded the packet limit. Check the firmware format.",
          );
        let newline;
        while ((newline = buffer.indexOf("\n")) >= 0) {
          const line = buffer.slice(0, newline);
          buffer = buffer.slice(newline + 1);
          receive(line, resource);
        }
      }
    } catch (error) {
      if (resource === link) resource.error = error.message;
    } finally {
      reader.releaseLock();
      resource.reader = null;
      if (resource === link)
        void disconnect(
          "Interrupted",
          resource.error || "Serial connection ended.",
        );
    }
  }
  async function connect(event) {
    event.preventDefault();
    if (link) return;
    try {
      config = {
        transport: q("#transport").value,
        baud: Number(q("#baud").value),
        camera: q("#camera-url").value.trim() ? validUrl(q("#camera-url").value, ["http:", "https:"], false) : "",
        ai: validUrl(q("#ai-url").value, ["http:", "https:"], false).replace(
          /\/$/,
          "",
        ),
        socket: q("#socket-url").value,
        threshold: Number(q("#obstacle-threshold").value),
      };
      if (config.transport === "websocket")
        config.socket = validUrl(config.socket, ["ws:", "wss:"]);
      if (config.transport === "ble" && !navigator.bluetooth)
        throw Error("Bluetooth requires Chrome or Edge on HTTPS or localhost.");
      if (
        !Number.isFinite(config.threshold) ||
        config.threshold < 1 ||
        config.threshold > 500
      )
        throw Error("Obstacle threshold must be between 1 and 500 cm.");
      if (config.transport === "serial" && !navigator.serial)
        throw Error(
          "USB Serial requires desktop Chrome or Edge on localhost or HTTPS.",
        );
    } catch (error) {
      set("#rover-message", error.message);
      return;
    }
    try {
      localStorage.setItem("mira_connection", JSON.stringify(config));
    } catch {
      /* Connection still works without saved settings. */
    }
    const resource = {
      token: ++generation,
      live: false,
      ready: false,
      moved: false,
      data: {},
      last: performance.now(),
      started: performance.now(),
    };
    link = resource;
    render();
    set("#rover-message", "Opening connection…");
    try {
      if (config.transport === "ble") {
        resource.ble = true;
        const device = await navigator.bluetooth.requestDevice({
          filters: [{ services: ["4fafc201-1fb5-459e-8fcc-c5c9c331914b"] }],
          optionalServices: ["4fafc201-1fb5-459e-8fcc-c5c9c331914b"],
        });
        if (resource !== link) return;
        resource.device = device;
        resource.server = await device.gatt.connect();
        if (resource !== link) { device.gatt.disconnect(); return; }
        const service = await resource.server.getPrimaryService("4fafc201-1fb5-459e-8fcc-c5c9c331914b");
        resource.tx = await service.getCharacteristic("beb5483e-36e1-4688-b7f5-ea07361b26a8");
        const rx = await service.getCharacteristic("1c95d5e3-d8f7-413a-bf3d-7a2e5d7be87e");
        resource.rx = rx;
        const decoder = new TextDecoder();
        let buffer = "";
        resource.notify = (event) => {
          if (resource !== link) return;
          buffer += decoder.decode(event.target.value, { stream: true });
          if (buffer.length > 16384) { void disconnect("Interrupted", "Bluetooth telemetry packet too large."); return; }
          let end;
          while ((end = buffer.indexOf("\n")) >= 0) {
            receive(buffer.slice(0, end), resource);
            buffer = buffer.slice(end + 1);
          }
        };
        resource.onDisconnected = () => {
          if (resource === link) void disconnect("Interrupted", "Bluetooth rover disconnected.");
        };
        device.addEventListener("gattserverdisconnected", resource.onDisconnected);
        rx.addEventListener("characteristicvaluechanged", resource.notify);
        await rx.startNotifications();
        if (resource !== link) { device.gatt.disconnect(); return; }
        resource.ready = true;
        await send("S", resource);
      } else if (config.transport === "serial") {
        const port = await navigator.serial.requestPort();
        if (resource !== link) return;
        resource.port = port;
        await port.open({ baudRate: config.baud });
        if (resource !== link) {
          await port.close();
          return;
        }
        resource.writer = port.writable.getWriter();
        resource.reading = readSerial(resource);
        await send("HELLO", resource);
      } else {
        const socket = new WebSocket(config.socket);
        resource.socket = socket;
        socket.onopen = () => {
          if (resource === link)
            send("HELLO", resource).catch((error) =>
              disconnect("Interrupted", error.message),
            );
        };
        socket.onmessage = (event) => {
          if (typeof event.data !== "string" || event.data.length > 16384) {
            void disconnect("Interrupted", "Unsupported rover packet.");
            return;
          }
          event.data
            .split("\n")
            .filter(Boolean)
            .forEach((line) => receive(line, resource));
        };
        socket.onerror = () => {
          if (resource === link)
            void disconnect(
              "Interrupted",
              "Wi-Fi connection failed. Check the WebSocket address and firmware.",
            );
        };
        socket.onclose = () => {
          if (resource === link)
            void disconnect("Interrupted", "Rover Wi-Fi link closed.");
        };
      }
      if (resource !== link) return;
      resource.last = performance.now();
      set("#rover-message", "Link opened. Waiting for rover telemetry…");
      timer = setInterval(() => {
        if (resource !== link) return;
        const now = performance.now();
        if (now - resource.last > (resource.live ? 2500 : 12000)) {
          void disconnect(
            "Interrupted",
            resource.live
              ? "Rover telemetry lost. Stop requested; reconnect to continue."
              : "No valid telemetry received. Check baud rate and the firmware connection guide.",
          );
          return;
        }
        if (pending && now - pending.sent > 800) {
          if (pending.command === "S") {
            void disconnect(
              "Interrupted",
              "Stop was not acknowledged. Check the rover; its firmware watchdog must stop the motors.",
            );
            return;
          }
          stop(true);
          set(
            "#drive-detail",
            "Movement acknowledgement timed out. Controls disabled until re-enabled.",
          );
        } else if (desired !== "S" && !pending) command(desired);
        render();
      }, 200);
    } catch (error) {
      if (resource === link)
        await disconnect(
          "Interrupted",
          error.name === "NotFoundError"
            ? "No compatible device selected. Check that the rover is powered and advertising its BLE service."
            : error.message,
        );
    }
  }
  async function disconnect(
    status = "Completed",
    message = "Rover disconnected.",
  ) {
    const resource = link;
    if (!resource) return;
    // Write STOP before clearing the link; never queue further movement behind it.
    const stopping = send(resource.ble ? "S" : `CMD,${++sequence},S`, resource).catch(() => {});
    link = null;
    generation++;
    clearInterval(timer);
    timer = null;
    desired = "S";
    pending = null;
    heldKey = null;
    window.Camera?.disconnect();
    Scout.end(status);
    render();
    set("#rover-message", message);
    set("#drive-status", "Not connected");
    if (resource.socket) {
      await stopping;
      resource.socket.onclose = null;
      resource.socket.onerror = null;
      resource.socket.onmessage = null;
      resource.socket.close();
    }
    if (resource.device) {
      await stopping;
      resource.rx?.removeEventListener("characteristicvaluechanged", resource.notify);
      if (resource.onDisconnected) resource.device.removeEventListener("gattserverdisconnected", resource.onDisconnected);
      if (resource.device.gatt.connected) resource.device.gatt.disconnect();
    }
    if (resource.port) {
      try {
        await stopping;
        if (resource.reader) await resource.reader.cancel();
        if (resource.reading) await resource.reading;
        if (resource.writer) {
          await resource.writer.abort().catch(() => {});
          resource.writer.releaseLock();
        }
        // An opening port is closed by connect() after its open promise resolves.
        if (resource.port.readable || resource.port.writable)
          await resource.port.close();
      } catch {
        /* Device removal can close the OS handle before these operations. */
      }
    }
  }
  function render() {
    const live = !!link?.live,
      enabled = live && link.ready,
      show = live,
      cameraFeed = !!link?.cameraFeed;
    q("#connect-rover").disabled = !!link;
    q("#disconnect-rover").disabled = !link;
    for (const selector of [
      "#transport",
      "#baud",
      "#socket-url",
      "#camera-url",
      "#ai-url",
    ])
      q(selector).disabled = !!link;
    document.querySelectorAll("[data-drive]").forEach((button) => {
      if (button.dataset.drive !== "S")
        button.disabled = !enabled;
      if (!live) button.classList.remove("held");
    });
    set(
      "#live-link",
      live ? cameraFeed ? "LIVE CAMERA CONNECTED" : "ROVER CONNECTED" : link ? "CONNECTING" : "ROVER OFFLINE",
    );
    const relay = live && link.data.via_relay;
    set(
      "#relay-route",
      relay
        ? `Via ${link.data.relay_id} · receiver reported`
        : "Relay: not reported",
    );
    set(
      "#connection-path",
      cameraFeed
        ? "Camera → telemetry"
        : live
        ? relay
          ? `Operator → ${link.data.relay_id} → rover (reported)`
          : "Operator → rover link · relay path unverified"
        : "Operator → no rover connected",
    );
    set(
      "#rover-freshness",
      live
        ? `Last telemetry ${Math.max(0, (performance.now() - link.last) / 1000).toFixed(1)} s ago`
        : "Waiting for the first telemetry packet.",
    );
    set(
      "#firmware-status",
      cameraFeed
        ? "Camera-only mode: movement controls remain locked."
        : enabled
        ? link.ble ? "BLE commands ready · motor acknowledgement/watchdog not reported" : "Control protocol ready · firmware watchdog reported"
        : "Movement locked: waiting for motors_ready and mira-v1 watchdog handshake.",
    );
    set(
      "#drive-detail",
      cameraFeed
        ? "No motor commands are sent in camera-only mode."
        : enabled
        ? "Arrow keys work here and in the expanded camera workspace."
        : "Controls unlock when the firmware reports motors_ready and a watchdog.",
    );
    set(
      "#sensor-message",
      cameraFeed
        ? "Telemetry is updating. CO gas remains 0 ppm."
        : !live
        ? "Connect the rover to receive data."
        : "Readings update with rover telemetry. Missing sensors remain blank.",
    );
    const generated =
      q("#preview-sensors").checked && show
        ? previewAt((performance.now() - link.started) / 1000)
        : {};
    let anyGenerated = false;
    const readings = {};
    document.querySelectorAll("[data-sensor]").forEach((node) => {
      const key = node.dataset.sensor;
      const real = show ? link.data[key] : null;
      const value = real ?? generated[key];
      readings[key] = value;
      const synthetic = real == null && value != null;
      node.dataset.generated = String(synthetic);
      anyGenerated ||= synthetic;
      node.textContent =
        value == null
          ? "—"
          : ["radar", "pir"].includes(key)
            ? value
              ? "Motion"
              : "No motion"
            : `${Number(value).toFixed(key === "tilt_deg" || key === "distance_cm" ? 1 : 0)}${{ distance_cm: " cm", tilt_deg: "°", co_ppm: " ppm", battery_pct: "%" }[key] || ""}`;
    });
    q("#sensor-origin").hidden = !(anyGenerated || cameraFeed);
    q("#sensor-origin").textContent = cameraFeed
      ? " telemetry"
      : "preview";
    const battery = readings.battery_pct;
    set("#battery-status", battery == null ? "—" : `${Math.round(battery)}%`);
    q("#battery-bar").style.width = `${battery ?? 0}%`;
    set(
      "#battery-detail",
      battery == null
        ? "No reading received"
        : cameraFeed
          ? "Camera feed"
          : link.data.battery_pct == null
          ? "preview"
          : "Rover reading",
    );
    set(
      "#network-status",
      live && Number.isFinite(link.data.rssi) ? `${link.data.rssi} dBm` : cameraFeed ? "Camera" : "—",
    );
    set("#network-detail", cameraFeed ? "Camera stream active" : live ? "Rover link active" : "No connection");
    const distance = show ? link.data.distance_cm : null;
    set(
      "#safety-status",
      distance == null
        ? "Awaiting data"
        : distance < Number(q("#obstacle-threshold").value)
          ? "Obstacle nearby"
          : "Beyond threshold",
    );
  }
  q("#rover-form").onsubmit = connect;
  q("#start-camera-feed").onclick = () => {
    const address = q("#camera-url").value.trim();
    if (!address) {
      set("#rover-message", "Paste the camera stream address first.");
      q("#camera-url").focus();
      return;
    }
    ScoutUI.go("live");
    window.Camera?.connect(address);
  };
  q("#disconnect-rover").onclick = () => disconnect();
  q("#preview-sensors").onchange = render;
  q("#obstacle-threshold").onchange = render;
  document.querySelectorAll("[data-drive]").forEach((button) => {
    button.onpointerdown = (event) => {
      if (button.dataset.drive === "S") {
        stop(true);
        return;
      }
      if (event.button !== 0) return;
      event.preventDefault();
      button.setPointerCapture(event.pointerId);
      drive(button.dataset.drive);
    };
    button.onpointerup =
      button.onpointercancel =
      button.onlostpointercapture =
        () => {
          if (desired !== "S") stop();
        };
    button.oncontextmenu = (event) => event.preventDefault();
  });
  const keys = {
    ArrowUp: "F",
    ArrowDown: "B",
    ArrowLeft: "L",
    ArrowRight: "R",
  };
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      stop(true);
      return;
    }
    if (
      ScoutUI.screen !== "live" ||
      /^(SELECT|TEXTAREA)$/.test(event.target.tagName) ||
      (event.target.tagName === "INPUT" && event.target.type !== "checkbox") ||
      event.target.isContentEditable
    )
      return;
    if (event.code === "Space") {
      event.preventDefault();
      stop(true);
      return;
    }
    if (!keys[event.key]) return;
    event.preventDefault();
    if (event.repeat) return;
    heldKey = event.key;
    drive(keys[event.key]);
  });
  document.addEventListener("keyup", (event) => {
    if (event.key === heldKey) {
      event.preventDefault();
      stop();
    }
  });
  window.addEventListener("blur", () => stop(true));
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) stop(true);
  });
  window.Rover = {
    open,
    stop,
    disconnect,
    render,
    startCameraFeed,
    endCameraFeed,
    get connected() {
      return !!link?.live;
    },
    get cameraUrl() {
      return config.camera;
    },
    get aiUrl() {
      return config.ai;
    },
  };
  render();
})();
