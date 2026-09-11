# MIRA - Mine Intelligence and Rescue Assistance

**Project report | SIH25039**  
AI-Powered Underground Mine Monitoring and Rescue-Support Rover
Live dashboard: https://vaish13uh.github.io/MIRA/

## 1. Project Overview and Problem Statement

Underground mine incidents can leave rescue teams with limited information about access routes, environmental conditions and possible worker locations. MIRA is a student prototype designed to collect this information using a remotely controlled rover, onboard sensors, camera video and a surface dashboard.

The proposed system combines underground sensing, relay-assisted communication and laptop-based visual analysis. Its purpose is to support initial inspection and operator assessment. Hardware integration and end-to-end validation remain in progress.

## 2. MIRA's Mission and Design Philosophy

MIRA's mission is to provide the surface operator with observations from an underground passage before personnel enter it. The design uses affordable, replaceable components and divides processing between the rover and a laptop.

The ESP32 handles sensor acquisition and local control. The laptop handles video analysis and alert processing. Multiple observations are presented together so that the operator can assess the evidence behind an alert. Human verification remains part of the operating procedure.

## 3. Complete Hardware Architecture

The underground rover contains the sensing, control and actuation hardware. RCWL-0516, PIR, MQ-7, HC-SR04 and MPU6050 readings feed the ESP32 controller. The ESP32-CAM provides a separate video stream. The controller drives the motors through L298N drivers and controls the camera servo, buzzer and status LEDs.

The intended system connections are:

```text
Sensors -> ESP32 controller -> L298N drivers -> 4WD motors
                 |---------> Camera servo, buzzer and LEDs
                 |
                 <-> Relay node <-> Surface laptop <-> Dashboard

ESP32-CAM -> Video over the wireless link -> Surface laptop
Dashboard -> Control commands -> Relay node -> ESP32 controller
```

The relay sits between the rover and the surface station. Telemetry, video and return commands are separate communication flows; their combined performance requires testing.

## 4. Software and Dashboard Architecture

| Layer | Software | Responsibility |
|---|---|---|
| Rover | Arduino/C++ on ESP32 | Sensor reading, threshold checks, motor and servo control, local alerts and telemetry |
| Surface processing | Python, OpenCV and YOLOv8 | Video processing, person detection and rule-based sensor fusion |
| Operator interface | HTML, CSS and JavaScript | Camera display, sensor and rover status, incident review, mission records and controls |

The intended video pipeline is ESP32-CAM stream -> OpenCV frames -> YOLO inference -> detection results -> dashboard overlay. Mine-specific classes such as rubble or structural cracks require suitable training data and validation.

The dashboard includes live camera, AI incidents, monitoring, tunnel markers and mission history. Map markers represent operator annotations until a positioning system is integrated. Physical control and live telemetry must be distinguished from the current simulated interface.

## 5. Relay-Node Communication Strategy

A single ESP32/ESP8266 relay is proposed between the rover and surface laptop to forward telemetry and control traffic. Video transport must also be verified with the selected relay implementation.

Relay testing will compare the direct connection with the relayed connection, measuring coverage, delay, packet loss and video continuity. No underground range is claimed before measurement. Multiple relay nodes and mesh networking are future work.

## 6. Sense-and-Confirm Detection Protocol

The proposed detection sequence is:

1. RCWL-0516 registers motion.
2. The rover stops and the operator or control logic adjusts its orientation.
3. PIR activity is checked for supporting evidence.
4. Camera frames are analysed on the laptop for a possible person.
5. Sensor observations and visual results are presented as an alert for operator review.

PIR activity does not establish human identity, and radar motion does not establish survivor presence. The protocol is intended to correlate evidence; any reduction in false alerts must be demonstrated through testing. An absent sensor response must not be treated as proof that no person is present.

## 7. Monitoring and Rescue Operating Modes

**Monitoring mode:** The rover collects environmental and movement-related observations during operator-controlled inspection. The dashboard displays gas-sensor readings, obstacle distance, tilt, camera video and connection status.

**Rescue mode:** The operator uses the rover to inspect an uncertain area, investigate motion events and review possible person detections. Relevant observations are recorded for follow-up.

Alert thresholds are prototype settings. Gas concentration values require calibration before they can be reported as measurements.

## 8. AI Advisory and Human-in-the-Loop Principle

The surface software combines visual detections with sensor readings to generate advisory alerts. The operator reviews the available evidence, confirms or dismisses incidents and issues movement commands.

A model confidence score describes a detection result; it does not establish survival or safe entry conditions. MIRA is a prototype and has not been validated as certified mine-safety equipment.

## 9. Full Component List and Power Architecture

| Component | Quantity | Function |
|---|---:|---|
| ESP32 DevKit V1 | 1 | Rover controller |
| ESP32-CAM | 1 | Camera stream |
| RCWL-0516 | 1 | Motion sensing |
| PIR sensor | 1 | Supporting motion observation |
| MQ-7 | 1 | CO sensing, subject to calibration |
| MQ-2 / MQ-4 | Optional | Additional gas sensing |
| HC-SR04 | 1 | Obstacle distance |
| MPU6050 | 1 | Tilt and acceleration |
| L298N drivers | 2 | Motor control |
| 4WD chassis and DC motors | 1 set | Mobility |
| SG90 servo | 1 | One-axis camera movement |
| ESP32/ESP8266 | 1 | Relay node |
| 7.4 V Li-ion battery pack | 1 | Rover power |
| Dedicated 5 V regulator | 1 | Electronics supply |
| Buzzer and status LEDs | 1 set | Local indications |
| Wiring, connectors and switch | As required | Electrical assembly |

```text
7.4 V battery -> L298N drivers -> DC motors
             -> Dedicated 5 V regulator -> ESP32, ESP32-CAM,
                                          compatible sensors and servo
3.3 V supply -> IMU, as required by the selected module
```

Rover electronics share a common ground. Supply capacity, signal voltage levels and gas-sensor conditioning must be checked against the selected modules. A separately placed relay requires its own power arrangement.

## 10. Data Protocol and Wiring Details

The documented telemetry format is:

```text
DATA,human,radar,pir,co,ch4,distance,tilt,source
```

The intended update interval is approximately 500 ms. The fields represent a detection flag, radar state, PIR state, gas readings, obstacle distance, tilt and event source. Units and unavailable-sensor handling must be defined during integration. The detection flag represents a software event, not a verified person.

JSON carries processed results to the dashboard. Browser-to-backend integration must provide an explicit transport; Web Serial alone does not carry remote video or Python inference results.

The documented ESP32 pin assignment is provisional:

| Connection | GPIO |
|---|---|
| RCWL-0516 output | 34 |
| PIR output | 35 |
| MQ-7 analog input | 36 |
| HC-SR04 trigger / echo | 5 / 18 |
| MPU6050 SDA / SCL | 21 / 22 |
| Servo signal | 13 |
| Buzzer | 4 |
| Red LED | 2 |
| Left motor control | 26, 27, 14 |
| Right motor control | 25, 33, 32 |

Verify assignments against the firmware before assembly. Condition signals that exceed ESP32 input limits, including the HC-SR04 echo output. Final wiring should identify driver input and enable connections explicitly.

## 11. Current Build Status

The following status reflects the project information supplied and is not an independent hardware verification.

| Subsystem | Reported status |
|---|---|
| Chassis and wheels | Assembled |
| Initial power wiring | Completed; final regulated supply arrangement requires verification |
| Web dashboard | Built with simulated telemetry |
| Arduino firmware | Written; hardware validation pending |
| Radar and PIR | Integration in progress |
| Gas, ultrasonic, IMU and camera modules | Integration pending |
| Relay and complete control loop | End-to-end validation pending |

## 12. Testing and Demonstration Plan

Testing will proceed from individual modules to the integrated system in a controlled demonstration environment.

| Test | Evidence to record |
|---|---|
| Power and startup | Supply stability, controller resets and startup behaviour |
| Sensor checks | Raw readings, repeatability and response to controlled stimuli |
| Motion correlation | Radar, PIR and visual results for positive and negative cases |
| Motor and servo control | Command response, turning and stop behaviour |
| Link interruption | Rover response to lost commands and stale telemetry |
| Relay comparison | Delay, packet loss, coverage and video continuity |
| Dashboard integration | Agreement between received readings, displayed values and alerts |
| Full demonstration | Timestamped events, operator actions and observed failures |

Gas calibration requires an appropriate controlled procedure. Simulated gas values can be used to test the alert workflow separately. Detection performance and communication range will be reported from recorded tests.

## 13. Future Roadmap

The immediate work is to complete sensor, camera and relay integration, connect the dashboard to live data and validate the return control path.

Later work may include thermal imaging, multiple relays, mine-specific vision training and positioning. These additions depend on prototype test results. Any operational mine deployment would require further engineering, environmental testing and applicable certification.

# MIRA - Mine Intelligence and Rescue Assistance

**Project report | SIH25039**  
AI-Powered Underground Mine Monitoring and Rescue-Support Rover

## 1. Project Overview and Problem Statement

Underground mine incidents can leave rescue teams with limited information about access routes, environmental conditions and possible worker locations. MIRA is a student prototype designed to collect this information using a remotely controlled rover, onboard sensors, camera video and a surface dashboard.

The proposed system combines underground sensing, relay-assisted communication and laptop-based visual analysis. Its purpose is to support initial inspection and operator assessment. Hardware integration and end-to-end validation remain in progress.

## 2. MIRA's Mission and Design Philosophy

MIRA's mission is to provide the surface operator with observations from an underground passage before personnel enter it. The design uses affordable, replaceable components and divides processing between the rover and a laptop.

The ESP32 handles sensor acquisition and local control. The laptop handles video analysis and alert processing. Multiple observations are presented together so that the operator can assess the evidence behind an alert. Human verification remains part of the operating procedure.

## 3. Complete Hardware Architecture

The underground rover contains the sensing, control and actuation hardware. RCWL-0516, PIR, MQ-7, HC-SR04 and MPU6050 readings feed the ESP32 controller. The ESP32-CAM provides a separate video stream. The controller drives the motors through L298N drivers and controls the camera servo, buzzer and status LEDs.

The intended system connections are:

```text
Sensors -> ESP32 controller -> L298N drivers -> 4WD motors
                 |---------> Camera servo, buzzer and LEDs
                 |
                 <-> Relay node <-> Surface laptop <-> Dashboard

ESP32-CAM -> Video over the wireless link -> Surface laptop
Dashboard -> Control commands -> Relay node -> ESP32 controller
```

The relay sits between the rover and the surface station. Telemetry, video and return commands are separate communication flows; their combined performance requires testing.

## 4. Software and Dashboard Architecture

| Layer | Software | Responsibility |
|---|---|---|
| Rover | Arduino/C++ on ESP32 | Sensor reading, threshold checks, motor and servo control, local alerts and telemetry |
| Surface processing | Python, OpenCV and YOLOv8 | Video processing, person detection and rule-based sensor fusion |
| Operator interface | HTML, CSS and JavaScript | Camera display, sensor and rover status, incident review, mission records and controls |

The intended video pipeline is ESP32-CAM stream -> OpenCV frames -> YOLO inference -> detection results -> dashboard overlay. Mine-specific classes such as rubble or structural cracks require suitable training data and validation.

The dashboard includes live camera, AI incidents, monitoring, tunnel markers and mission history. Map markers represent operator annotations until a positioning system is integrated. Physical control and live telemetry must be distinguished from the current simulated interface.

## 5. Relay-Node Communication Strategy

A single ESP32/ESP8266 relay is proposed between the rover and surface laptop to forward telemetry and control traffic. Video transport must also be verified with the selected relay implementation.

Relay testing will compare the direct connection with the relayed connection, measuring coverage, delay, packet loss and video continuity. No underground range is claimed before measurement. Multiple relay nodes and mesh networking are future work.

## 6. Sense-and-Confirm Detection Protocol

The proposed detection sequence is:

1. RCWL-0516 registers motion.
2. The rover stops and the operator or control logic adjusts its orientation.
3. PIR activity is checked for supporting evidence.
4. Camera frames are analysed on the laptop for a possible person.
5. Sensor observations and visual results are presented as an alert for operator review.

PIR activity does not establish human identity, and radar motion does not establish survivor presence. The protocol is intended to correlate evidence; any reduction in false alerts must be demonstrated through testing. An absent sensor response must not be treated as proof that no person is present.

## 7. Monitoring and Rescue Operating Modes

**Monitoring mode:** The rover collects environmental and movement-related observations during operator-controlled inspection. The dashboard displays gas-sensor readings, obstacle distance, tilt, camera video and connection status.

**Rescue mode:** The operator uses the rover to inspect an uncertain area, investigate motion events and review possible person detections. Relevant observations are recorded for follow-up.

Alert thresholds are prototype settings. Gas concentration values require calibration before they can be reported as measurements.

## 8. AI Advisory and Human-in-the-Loop Principle

The surface software combines visual detections with sensor readings to generate advisory alerts. The operator reviews the available evidence, confirms or dismisses incidents and issues movement commands.

A model confidence score describes a detection result; it does not establish survival or safe entry conditions. MIRA is a prototype and has not been validated as certified mine-safety equipment.

## 9. Full Component List and Power Architecture

| Component | Quantity | Function |
|---|---:|---|
| ESP32 DevKit V1 | 1 | Rover controller |
| ESP32-CAM | 1 | Camera stream |
| RCWL-0516 | 1 | Motion sensing |
| PIR sensor | 1 | Supporting motion observation |
| MQ-7 | 1 | CO sensing, subject to calibration |
| MQ-2 / MQ-4 | Optional | Additional gas sensing |
| HC-SR04 | 1 | Obstacle distance |
| MPU6050 | 1 | Tilt and acceleration |
| L298N drivers | 2 | Motor control |
| 4WD chassis and DC motors | 1 set | Mobility |
| SG90 servo | 1 | One-axis camera movement |
| ESP32/ESP8266 | 1 | Relay node |
| 7.4 V Li-ion battery pack | 1 | Rover power |
| Dedicated 5 V regulator | 1 | Electronics supply |
| Buzzer and status LEDs | 1 set | Local indications |
| Wiring, connectors and switch | As required | Electrical assembly |

```text
7.4 V battery -> L298N drivers -> DC motors
             -> Dedicated 5 V regulator -> ESP32, ESP32-CAM,
                                          compatible sensors and servo
3.3 V supply -> IMU, as required by the selected module
```

Rover electronics share a common ground. Supply capacity, signal voltage levels and gas-sensor conditioning must be checked against the selected modules. A separately placed relay requires its own power arrangement.

## 10. Data Protocol and Wiring Details

The documented telemetry format is:

```text
DATA,human,radar,pir,co,ch4,distance,tilt,source
```

The intended update interval is approximately 500 ms. The fields represent a detection flag, radar state, PIR state, gas readings, obstacle distance, tilt and event source. Units and unavailable-sensor handling must be defined during integration. The detection flag represents a software event, not a verified person.

JSON carries processed results to the dashboard. Browser-to-backend integration must provide an explicit transport; Web Serial alone does not carry remote video or Python inference results.

The documented ESP32 pin assignment is provisional:

| Connection | GPIO |
|---|---|
| RCWL-0516 output | 34 |
| PIR output | 35 |
| MQ-7 analog input | 36 |
| HC-SR04 trigger / echo | 5 / 18 |
| MPU6050 SDA / SCL | 21 / 22 |
| Servo signal | 13 |
| Buzzer | 4 |
| Red LED | 2 |
| Left motor control | 26, 27, 14 |
| Right motor control | 25, 33, 32 |

Verify assignments against the firmware before assembly. Condition signals that exceed ESP32 input limits, including the HC-SR04 echo output. Final wiring should identify driver input and enable connections explicitly.

## 11. Current Build Status

The following status reflects the project information supplied and is not an independent hardware verification.

| Subsystem | Reported status |
|---|---|
| Chassis and wheels | Assembled |
| Initial power wiring | Completed; final regulated supply arrangement requires verification |
| Web dashboard | Built with simulated telemetry |
| Arduino firmware | Written; hardware validation pending |
| Radar and PIR | Integration in progress |
| Gas, ultrasonic, IMU and camera modules | Integration pending |
| Relay and complete control loop | End-to-end validation pending |

## 12. Testing and Demonstration Plan

Testing will proceed from individual modules to the integrated system in a controlled demonstration environment.

| Test | Evidence to record |
|---|---|
| Power and startup | Supply stability, controller resets and startup behaviour |
| Sensor checks | Raw readings, repeatability and response to controlled stimuli |
| Motion correlation | Radar, PIR and visual results for positive and negative cases |
| Motor and servo control | Command response, turning and stop behaviour |
| Link interruption | Rover response to lost commands and stale telemetry |
| Relay comparison | Delay, packet loss, coverage and video continuity |
| Dashboard integration | Agreement between received readings, displayed values and alerts |
| Full demonstration | Timestamped events, operator actions and observed failures |

Gas calibration requires an appropriate controlled procedure. Simulated gas values can be used to test the alert workflow separately. Detection performance and communication range will be reported from recorded tests.

## 13. Future Roadmap

The immediate work is to complete sensor, camera and relay integration, connect the dashboard to live data and validate the return control path.

Later work may include thermal imaging, multiple relays, mine-specific vision training and positioning. These additions depend on prototype test results. Any operational mine deployment would require further engineering, environmental testing and applicable certification.
