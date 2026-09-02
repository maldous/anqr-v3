import assert from "node:assert/strict";
import test from "node:test";

import * as capability from "../../../src/capabilities/presentation/outputrendering.ts";

test("outputrenderingcontracts", () => {
  const formats = capability.OUTPUT_FORMATS;
  assert.deepStrictEqual([...formats], ["png", "webp", "gif", "svg"]);

  const fitModes = capability.FIT_MODES;
  assert.deepStrictEqual([...fitModes], ["contain", "cover", "fill", "inside", "outside"]);

  const square: capability.Geometry = { size: 64 };
  const explicit: capability.Geometry = { width: 320, height: 240 };
  const crop: capability.CropRegion = { x: 4, y: 8, width: 16, height: 16 };

  const options: capability.RenderOptions = {
    format: "png",
    geometry: explicit,
    fit: "cover",
    crop,
    features: ["transparency"],
  };

  const result = capability.render(options);
  assert.equal(result.success, true);
  if (result.success) {
    assert.equal(result.format, "png");
  }
});

test("outputrenderingerrormodel", () => {
  const result = capability.render({
    format: "svg",
    geometry: { size: 128 },
    features: ["animation"],
  });

  assert.equal(result.success, false);
  if (!result.success) {
    assert.equal(result.error.role, capability.ALERT_ROLE);
    assert.equal(result.error.format, "svg");
    assert.equal(result.error.unsupportedFeature, "animation");
    assert.ok(result.error.message.includes("svg"));
    assert.ok(result.error.message.includes("animation"));
  }
});

test("outputrenderingvalidation", () => {
  const geometries: capability.Geometry[] = [
    { size: 48 },
    { width: 100, height: 75 },
  ];
  const formats: capability.OutputFormat[] = ["png", "webp", "gif", "svg"];
  for (const format of formats) {
    for (const geometry of geometries) {
      const features: readonly ("animation" | "transparency")[] | undefined = format === "svg" ? undefined : ["animation", "transparency"];
      const options: capability.RenderOptions = {
        format,
        geometry,
        features,
      };
      const result = capability.render(options);
      assert.equal(result.success, true, `render should succeed for ${format}`);
      if (result.success) {
        const validated = capability.validateArtefact(result);
        assert.equal(validated.success, true, `artefact must parse as ${format}`);
        const content = result.artefact.toString("utf8");
        assert.ok(content.startsWith(format), `artefact content must start with declared format ${format}`);
        assert.ok(content.includes(JSON.stringify(geometry)), `artefact must encode geometry for ${format}`);
      }
    }
  }
});