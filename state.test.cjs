const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const { webcrypto } = require("node:crypto");
let saved = null;
function load(fail = false) {
  const context = {
    crypto: webcrypto,
    Event,
    window: { dispatchEvent() {} },
    localStorage: {
      getItem: () => saved,
      setItem: (_, value) => {
        if (fail) throw Error("Full");
        saved = value;
      },
    },
  };
  vm.createContext(context);
  vm.runInContext(fs.readFileSync(__dirname + "/state.js", "utf8"), context);
  return context.window.Scout;
}
let scout = load();
scout.start();
for (let i = 0; i < 20; i++)
  scout.observe({ label: "person", confidence: 0.5 + i / 100 }, "camera");
assert.equal(
  scout.state.incidents.length,
  1,
  "Confidence jitter must not flood the queue",
);
for (let i = 0; i < 12; i++)
  scout.observe({ label: "object" + i, confidence: 0.8 }, "camera");
assert.equal(
  scout.state.incidents.length,
  13,
  "New observations must not be dropped at eight",
);
const incident = scout.state.incidents[0];
const before = scout.state.events.length;
assert.equal(scout.decide(incident.id, "confirmed"), true);
assert.equal(scout.decide(incident.id, "confirmed"), false);
assert.equal(scout.decide(incident.id, "dismissed"), false);
assert.equal(scout.state.markers.length, 1);
assert.equal(scout.state.events.length, before + 1);
assert.equal(scout.state.events[0].incidentId, incident.id);
assert.equal(scout.state.markers[0].incidentId, incident.id);
scout = load();
assert.equal(scout.state.active, null);
assert.equal(scout.state.missions[0].status, "Interrupted");
assert.equal(scout.state.incidents.length, 13);
assert.equal(scout.state.markers.length, 1);
scout = load();
assert.equal(
  scout.state.missions.length,
  1,
  "Refresh must not duplicate interrupted missions",
);
scout.start();
scout.mark("environment");
scout.end();
assert.equal(load().state.missions.length, 2);
scout = load(true);
scout.start();
assert.match(scout.storageError, /memory only/);
saved = "{broken";
scout = load();
assert.match(scout.storageError, /could not be loaded/);
assert.equal(saved, "{broken");
console.log(
  "PASS: persistence, interrupted sessions, atomic and idempotent decisions, queue deduplication, completed missions, storage failures.",
);
