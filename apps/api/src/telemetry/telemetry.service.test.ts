import assert from "node:assert/strict";
import test from "node:test";
import { TelemetryService } from "./telemetry.service";

test("telemetry: ingest accepts batch and tracks counters", () => {
  const service = new TelemetryService();
  const result = service.ingestRum({
    events: [
      { type: "performance", route: "/teacher/profile", payload: { value: 123 } },
      { type: "api_failure", route: "/api/teacher/context", payload: { status: 401 } },
    ],
  });

  assert.equal(result.ok, true);
  assert.equal(result.accepted, 2);
  assert.equal(result.dropped, 0);

  const snapshot = service.snapshot();
  assert.equal(snapshot.totalAccepted, 2);
  assert.equal(snapshot.perType.performance, 1);
  assert.equal(snapshot.perType.api_failure, 1);
});

test("telemetry: ingest enforces max batch size", () => {
  const service = new TelemetryService();
  const events = Array.from({ length: 240 }, (_, index) => ({
    type: "performance" as const,
    route: `/route/${index}`,
    payload: { index },
  }));

  const result = service.ingestRum({ events });
  assert.equal(result.accepted, 200);
  assert.equal(result.dropped, 40);
});
