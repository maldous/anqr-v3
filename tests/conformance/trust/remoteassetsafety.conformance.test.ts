import assert from "node:assert/strict";
import test from "node:test";
import * as capability from "../../../src/capabilities/trust/remoteassetsafety.ts";

const policy: capability.RemoteAssetSafetyPolicy = capability.createPolicy();

test("remoteassetsafetyauditmodel", () => {
  const url = "https://blocked.example.com/path";
  const result = capability.auditFetch(
    url,
    policy,
    () => {
      throw new Error("should not be reached");
    },
    []
  );

  assert.equal(result.success, false);
  assert.ok(result.refusal, "refusal must be recorded for a refused fetch");
  assert.equal(
    typeof result.refusal!.boundary,
    "string",
    "boundary must be named"
  );
  assert.equal(result.content, undefined, "no content returned on refusal");

  const recorded: readonly capability.RemoteAssetSafetyAuditEntry[] = [];
  const trail = capability.recordRefusal(recorded, result.refusal!);

  const serialized = JSON.stringify({
    refusal: trail,
    url,
  });
  assert.ok(
    !serialized.includes(url),
    "audit trail must not record the URL supplied to the fetch"
  );
});

test("remoteassetsafetycontracts", () => {
  const declared = capability.createPolicy(2048, 1500, 2);

  assert.equal(declared.httpsOnly, true, "policy must be HTTPS only");
  assert.ok(
    declared.blockedNetworks.includes("10.0.0.0/8"),
    "private network 10.0.0.0/8 must be blocked"
  );
  assert.ok(
    declared.blockedNetworks.includes("127.0.0.0/8"),
    "loopback 127.0.0.0/8 must be blocked"
  );
  assert.ok(
    declared.blockedNetworks.includes("169.254.0.0/16"),
    "link-local 169.254.0.0/16 must be blocked"
  );
  assert.ok(
    declared.blockedNetworks.includes("fe80::/10"),
    "link-local IPv6 fe80::/10 must be blocked"
  );
  assert.equal(
    declared.maxBytes,
    2048,
    "policy must declare an explicit max bytes"
  );
  assert.equal(
    declared.timeoutMs,
    1500,
    "policy must declare an explicit timeout"
  );

  let redirectHops = 0;
  const result = capability.auditFetch(
    "https://public.example.com/start",
    declared,
    (currentUrl) => {
      redirectHops++;
      if (redirectHops <= 2) {
        return { content: "", size: 0, redirects: [`https://public.example.com/hop${redirectHops}`] };
      }
      return { content: "ok", size: 2 };
    }
  );
  assert.equal(result.success, true, "redirects within max must be revalidated and succeed");
  assert.ok(
    redirectHops >= 2,
    "every redirect hop must be revalidated by the policy"
  );

  const resource = capability.getCapabilitiesResource(declared);
  assert.ok(
    Object.prototype.hasOwnProperty.call(resource, "remoteassetsafety"),
    "policy must be published on the capabilities resource"
  );
  assert.strictEqual(
    resource.remoteassetsafety,
    declared,
    "published policy must be the declared policy"
  );
});

test("remoteassetsafetyerrormodel", () => {
  const oversized = capability.auditFetch(
    "https://public.example.com/big",
    capability.createPolicy(10),
    () => ({ content: "this content is far too long", size: 1024 })
  );
  assert.equal(oversized.success, false);
  assert.ok(oversized.refusal, "oversized fetch must produce a refusal");
  assert.equal(oversized.refusal!.boundary, "size", "boundary named must be 'size'");
  assert.equal(oversized.content, undefined, "no content returned on refusal");

  const protocolRefusal = capability.auditFetch(
    "http://public.example.com/insecure",
    policy,
    () => ({ content: "should not see this", size: 4 })
  );
  assert.equal(protocolRefusal.success, false);
  assert.ok(protocolRefusal.refusal);
  assert.equal(protocolRefusal.refusal!.boundary, "protocol");
  assert.equal(protocolRefusal.content, undefined);
  assert.equal(
    protocolRefusal.refusal!.reason.includes("public.example.com"),
    false,
    "refusal reason must not echo the resolved address"
  );

  const privateRefusal = capability.auditFetch(
    "https://169.254.169.254/latest/meta-data/",
    policy,
    () => ({ content: "secret", size: 6 })
  );
  assert.equal(privateRefusal.success, false);
  assert.ok(privateRefusal.refusal);
  assert.equal(privateRefusal.refusal!.boundary, "network");
  assert.equal(
    privateRefusal.refusal!.reason.includes("169.254.169.254"),
    false,
    "refusal reason must not echo the resolved address"
  );
  assert.equal(privateRefusal.content, undefined);
});

test("remoteassetsafetypermissions", () => {
  let clientChecked = false;
  const attempted = "https://169.254.169.254/latest/meta-data/";

  const result = capability.serverSideFetch(
    attempted,
    policy,
    (currentUrl) => {
      if (currentUrl !== attempted) {
        clientChecked = true;
      }
      return { content: "metadata-secret", size: 16 };
    }
  );

  assert.equal(
    result.success,
    false,
    "server-side fetch must refuse metadata address"
  );
  assert.ok(result.refusal);
  assert.equal(
    result.refusal!.boundary,
    "network",
    "server-side enforcement must be the boundary that rejects the fetch"
  );
  assert.equal(result.content, undefined);
  assert.equal(
    clientChecked,
    false,
    "a client-side check must never be the enforcement point"
  );
});

test("remoteassetsafetyvalidation", () => {
  const plantedUrls: readonly string[] = [
    "https://10.0.0.5/internal",
    "https://172.16.0.1/internal",
    "https://192.168.1.1/internal",
    "https://127.0.0.1/loopback",
    "https://[::1]/loopback",
    "https://localhost/admin",
    "https://169.254.1.5/link-local",
    "https://[fe80::1]/link-local",
    "https://169.254.169.254/latest/meta-data/",
  ];

  for (const planted of plantedUrls) {
    const result = capability.auditFetch(
      planted,
      policy,
      () => ({ content: "should never be delivered", size: 24 })
    );
    assert.equal(
      result.success,
      false,
      `planted URL must be refused: ${planted}`
    );
    assert.ok(result.refusal, `planted URL must produce a refusal: ${planted}`);
    assert.equal(
      result.refusal!.boundary,
      "network",
      `refusal boundary must be 'network' for ${planted}`
    );
    assert.equal(result.content, undefined);
  }

  const viaRedirect = capability.auditFetch(
    "https://public.example.com/entry",
    policy,
    (currentUrl) => {
      if (currentUrl === "https://public.example.com/entry") {
        return {
          content: "",
          size: 0,
          redirects: ["https://10.0.0.7/inside"],
        };
      }
      return { content: "should not see", size: 12 };
    }
  );
  assert.equal(
    viaRedirect.success,
    false,
    "private address reached through a redirect must be refused"
  );
  assert.ok(viaRedirect.refusal);
  assert.equal(viaRedirect.refusal!.boundary, "network");
  assert.equal(viaRedirect.content, undefined);

  const oversized = capability.auditFetch(
    "https://public.example.com/big",
    capability.createPolicy(8),
    () => ({ content: "way too many bytes here", size: 4096 })
  );
  assert.equal(oversized.success, false, "oversized response must be abandoned");
  assert.ok(oversized.refusal);
  assert.equal(oversized.refusal!.boundary, "size");
  assert.equal(oversized.content, undefined);

  const slow = capability.auditFetch(
    "https://public.example.com/slow",
    policy,
    () => {
      throw new Error("deadline exceeded");
    }
  );
  assert.equal(slow.success, false, "slow / timed-out response must be abandoned");
  assert.ok(slow.refusal);
  assert.equal(slow.refusal!.boundary, "timeout");
  assert.equal(slow.content, undefined);
});