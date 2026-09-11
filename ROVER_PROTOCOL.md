# MIRA rover connection

The dashboard connects over USB Serial or a Wi-Fi WebSocket. Both use the same newline-delimited messages below. ESP32 DevKit V1 identifies the board, not its firmware protocol: your Arduino sketch must implement these messages before physical controls can work. This folder does not include a flashed or hardware-verified motor controller.

## Connect

1. Serve this folder at `http://localhost:8080` and start the existing Python YOLO service.
2. Open **Connect rover**. For USB, use desktop Chrome or Edge and close Arduino Serial Monitor. Select the baud rate used by the sketch (default 115200).
3. For Wi-Fi, select WebSocket and enter the firmware's actual WebSocket address. The camera HTTP address and rover WebSocket address are different services; entering an ordinary HTTP server address does not create a WebSocket service.
4. Enter the ESP32-CAM MJPEG stream address, normally `http://CAMERA_IP:81/stream`. The stream must include a CORS header allowing the local dashboard origin.
5. The app sends `HELLO`. Valid telemetry establishes the rover connection and automatically starts the camera. The handshake below additionally enables motor controls.
6. Enable movement. Hold a direction button or arrow key; release to send Stop. Space, Escape, changing screens, lost focus and disconnection also request Stop. The expanded workspace keeps the camera, detections and controls together.

## Firmware handshake and telemetry

Respond to `HELLO` with this only when motor outputs and a firmware watchdog are actually configured:

```json
{
  "type": "hello",
  "protocol": "mira-v1",
  "motors_ready": true,
  "watchdog_ms": 600
}
```

Use `motors_ready:false` until wiring and motor code are ready. The app leaves movement locked without a valid handshake and a reported watchdog between 300 and 1000 ms.

Send a full telemetry packet every 500 ms. Units are explicit. Missing or uncalibrated readings must be `null`, not a fabricated zero:

```json
{
  "type": "telemetry",
  "distance_cm": 42.5,
  "tilt_deg": 2.1,
  "co_ppm": null,
  "ch4_ppm": null,
  "radar": 0,
  "pir": 0,
  "human": 0,
  "battery_pct": null,
  "rssi": -62,
  "via_relay": false,
  "relay_id": ""
}
```

The original MIRA document's CSV is also accepted:

```text
DATA,human,radar,pir,co,ch4,distance,tilt,source
DATA,0,1,0,null,null,42.5,2.1,RADAR_MOTION
```

Do not send the header as data. `human`, `radar`, and `pir` are 0/1/null. Distance is cm, tilt degrees, gas ppm. A zero ultrasonic echo timeout means no reading: send `null`, unless the driver really measured zero distance. Do not convert an MQ sensor's raw ADC value into ppm without the appropriate sensor calibration. The app displays an actual reported gas value of 0 as `0 ppm`; it never overwrites a received gas reading to force zero.

## Movement commands

The browser sends an increasing command ID and one direction:

```text
CMD,1,F
CMD,2,S
```

`F` forward, `B` backward, `L` left, `R` right, `S` stop. Respond after accepting the command:

```json
{ "type": "ack", "id": 1, "command": "F", "accepted": true }
```

For rejected commands, send `accepted:false`. Ignore duplicate/out-of-order IDs within the current connection. A new `HELLO` must stop motors and reset the command sequence; it must not enable motion by itself. The dashboard allows one outstanding movement command and sends repeats approximately every 200 ms while held. Missing acknowledgement for 800 ms requests Stop and disarms the UI. Sensor cards become visible after the first acknowledged non-stop command; acknowledgement proves command acceptance, not encoder-confirmed physical movement.

The ESP32 must independently stop motors if no fresh command arrives for its watchdog interval, on a disconnected control client, or when a physical stop input is active. Prioritize Stop over movement and avoid blocking sensor reads that prevent the watchdog from running. Never depend on a browser unload message being delivered. This protocol is intended for one operator on a trusted local link; do not expose a motor controller to the public internet.

## Relay node

Only a receiver that is actually forwarding a fresh rover packet should set `via_relay:true` and its own `relay_id`, such as `RELAY-01`. Forward commands and the corresponding rover acknowledgements in both directions. A direct receiver must not assert relay routing. Relay connectivity is distinct from rover freshness: stop forwarding old buffered telemetry as if it were fresh when the rover link drops. This dashboard does not implement an ESP8266 repeater or mesh firmware.

## Missing-sensor preview

An optional setting generates changing previews for _missing_ sensors after connection and the first acknowledged motion command. Each generated field is marked, and an overall preview badge stays visible. Real readings always take precedence; connection state, relay routing, commands and YOLO detections are never generated. Preview gas is zero only in this explicitly marked preview. Preview values are not stored as hardware records and never drive obstacle status.

## Prompt for your friend's Arduino environment

> Adapt my existing ESP32 DevKit V1 rover sketch to `ROVER_PROTOCOL.md`. Preserve my actual GPIO wiring, L298N motor functions and sensor drivers. Implement the HELLO handshake, CMD,id,F/B/L/R/S commands, matching JSON acknowledgements, 500 ms telemetry and an independent 600 ms motor watchdog. Send null for missing or uncalibrated sensors. Report relay routing only if packets really pass through the relay. Provide the sketch and the exact USB baud rate or WebSocket URL. Do not invent GPIO assignments; ask me for missing wiring. Bench-test Stop, release, disconnect and watchdog behavior with the wheels lifted before driving.

API references: [Chrome Web Serial guide](https://developer.chrome.com/docs/capabilities/serial), [WebSocket client API](https://developer.mozilla.org/en-US/docs/Web/API/WebSockets_API/Writing_WebSocket_client_applications).
