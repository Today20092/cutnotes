import assert from "node:assert/strict";
import test from "node:test";
import { pictureRect, picturePoint, simplify } from "../../src/lib/drawing";

test("picture coordinates exclude letterboxing and clamp captured pointers", () => {
  const rect = pictureRect(400, 400, 16 / 9);
  assert.deepEqual(rect, { left: 0, top: 87.5, width: 400, height: 225 });
  assert.deepEqual(picturePoint(100, 200, rect), [0.25, 0.5]);
  assert.deepEqual(picturePoint(-10, 500, rect), [0, 1]);
  assert.deepEqual(pictureRect(800, 400, 1), { left: 200, top: 0, width: 400, height: 400 });
});

test("pen simplification retains endpoints and corners while removing straight samples", () => {
  assert.deepEqual(
    simplify([
      [0, 0],
      [0.1, 0.1],
      [0.2, 0.2],
      [0.5, 0.5],
      [1, 0.5],
    ]),
    [
      [0, 0],
      [0.5, 0.5],
      [1, 0.5],
    ],
  );
  assert.deepEqual(simplify([[0.2, 0.3]]), [[0.2, 0.3]]);
});
