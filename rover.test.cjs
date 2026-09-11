const assert = require("node:assert/strict");
const { parse, previewAt } = require("./rover.js");
const csv = parse("DATA,0,1,0,null,null,42.5,2.1,RADAR_MOTION");
assert.equal(csv.distance_cm, 42.5);
assert.equal(csv.co_ppm, null);
assert.equal(csv.via_relay, false);
assert.equal(parse("DATA,0,2,0,0,0,42,2,UNKNOWN"), null);
assert.equal(parse("DATA,0,1,0,0,0,-5,2,UNKNOWN"), null);
assert.equal(parse('{"type":"telemetry","distance_cm":"45"}'), null);
assert.equal(parse("boot log"), null);
assert.equal(parse('{"type":"telemetry","co_ppm":45}').co_ppm, 45);
assert.equal(parse('{"type":"telemetry","via_relay":true}').via_relay, false);
assert.equal(
  parse('{"type":"telemetry","via_relay":true,"relay_id":"relay-a"}').via_relay,
  true,
);
assert.equal(
  parse(
    '{"type":"hello","protocol":"mira-v1","motors_ready":true,"watchdog_ms":600}',
  ).ready,
  true,
);
assert.equal(
  parse(
    '{"type":"hello","protocol":"mira-v1","motors_ready":true,"watchdog_ms":6000}',
  ).ready,
  false,
);
assert.equal(previewAt(10).co_ppm, 0);
assert.notEqual(previewAt(10).distance_cm, previewAt(20).distance_cm);
console.log(
  "PASS: CSV/JSON telemetry, units/ranges, missing values, handshake constraints, relay evidence, changing previews.",
);
