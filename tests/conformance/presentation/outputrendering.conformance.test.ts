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

  const opts: capability.RenderOptions = {
    format: "webp",
    geometry: explicit,
    fit: "cover",
    crop,
    features: ["transparency"],
  };

  const squareResult = capability.render({
    format: "png",
    geometry: { size: 32 },
  });
  assert.equal(squareResult.success, true);
  if (squareResult.success) {
    assert.equal(squareResult.format, "png");
  }

  const explicitResult = capability.render(opts);
  assert.equal(explicitResult.success, true);
  if (explicitResult.success) {
    assert.equal(explicitResult.format, "webp");
  }

  const validated = capability.validateArtefact(squareResult);
  assert.equal(validated.success, true);
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
    assert.match(result.error.message, /svg/);
    assert.match(result.error.message, /animation/);
  }
}

test("outputrenderingvalidation", () => {
  const geometries: capability.Geometry[] = [
    { size: 48 },
    { width: 100, height: 75 },
  ];

  const formats: capability.OutputFormat[] = ["png", "webp", "gif", "svg"];

  for (const format of formats) {
    for (const geometry of geometries) {
      const result = capability.render({
        format,
        geometry,
        features: format === "svg" ? undefined : ["animation", "transparency"],
      });

      assert.equal(result.success, true, `render should succeed for ${format}`);
      if (result.success) {
        const revalidated = capability.validateArtefact(result);
        assert.equal(revalidated.success, true, `artefact must parse as ${format}`);

        const content = result.artefact.toString("utf8");
        assert.ok(
          content.startsWith(format),
          `artefact content must start with declared format ${format}`,
        );
        assert.ok(
          content.includes(JSON.stringify(geometry)),
          `artefact must encode the requested geometry for ${format}`,
        );
      }
    }
  }

  const pngResult = capability.render({
    format: "png",
    geometry: { width: 10, height: 20 },
  });
  assert.equal(pngResult.success, true);
  if (pngResult.success) {
    const corrupted = {
      success: true as const,
      artefact: Buffer.from("webp|payload", "utf8"),
      format: "png" as capability.OutputFormat,
    };
    const check = capability.validateArtefact(corrupted);
    assert.equal(check.success, false);
    if (!check.success) {
      assert.equal(check.error.role, capability.ALERT_ROLE);
      assert.equal(check.error.format, "png");
    }
  }
});