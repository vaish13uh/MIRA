# MineScout

Serve this folder on localhost (for example `python -m http.server 8080`), then open http://localhost:8080. Camera access requires localhost or HTTPS.

Start the existing AI service with `python -m uvicorn ai_service.main:app --host 127.0.0.1 --port 8000`. The browser sends sampled frames to that service on the same device. Remote camera streams must allow CORS; HTTPS pages also require HTTPS stream URLs. Real hardware and a mine-trained detection model are not included.

Open **Connect rover**, select USB Serial or Wi-Fi WebSocket, and enter the ESP32-CAM stream address. The camera starts automatically after valid rover telemetry arrives. Read [ROVER_PROTOCOL.md](ROVER_PROTOCOL.md) for the messages your Arduino sketch must implement. ESP32 DevKit V1 alone does not establish the command protocol; the existing motor firmware must be adapted before motion can work.

Enable movement, then hold the direction buttons or arrow keys. Release, Space or Escape requests Stop. Controls remain in the camera workspace, including its expanded 50/50 camera-and-detection view. Sensor values appear after the first acknowledged movement command; missing readings remain blank unless the explicitly marked missing-sensor preview option is enabled. Real values always take priority. Gas is never forced to zero over a received reading. Relay routing appears only if the receiver reports it.

Map markers remain unlocated operator notes, not surveyed positions. No physical rover, relay or sensor was available for hardware verification. The firmware must independently stop motors when commands time out; a browser cannot guarantee delivery after a network disconnect.

Missions, events, markers, incidents and theme are saved under `minescout_data` in localStorage. Storage is specific to the browser profile and origin (including port). End session saves a completed mission; navigating/reloading the page records an interrupted session. Live camera permission and resources are never restored from storage. Private browsing or clearing site data may remove records. Export records in Mission History for a JSON backup; storage errors are shown in the app.

Run `node state.test.cjs` and `node rover.test.cjs` for state and telemetry checks. Run `node --check app.js`, `node --check camera.js`, `node --check rover.js`, and `node --check state.js` for syntax checks. The app requires no frontend build step or new runtime dependencies.
