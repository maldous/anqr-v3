import assert from "node:assert/strict";
import test from "node:test";
import * as capability from "../../../src/capabilities/trust/remoteassetsafety.ts";

const policy: capability.RemoteAssetSafetyPolicy = capability.createPolicy();

function expectRefusal(
  result: capability.RemoteAssetSafetyFetchResult,
  context: string
): capability.RemoteAssetSafetyRefusal {
  assert.equal(result.kind, "refusal", `${context}: expected a refusal result`);
  return result.refusal;
}

function expectSuccess(
  result: capability.RemoteAssetSafetyFetchResult,
  context: string
): { readonly content: string; readonly bytes: number } {
  assert.equal(result.kind, "success", `${context}: expected a success result`);
  return { content: result.content, bytes: result.bytes };
}

test("remoteassetsafetyauditmodel", () => {
  const refusedUrl = "https://169.254.169.254/latest/meta-data/";
  const fetchResult = capability.auditFetch(
    refusedUrl,
    policy,
    () => ({ content: "", size: 0 }),
    [],
    1700
  );

  const refusal = expectRefusal(fetchResult.result, "refused metadata fetch");
  const boundary: capability.RemoteAssetSafetyBoundary = refusal.boundary;
  assert.equal(boundary, "network", "the network boundary must be the one that rejected");
  assert.ok(
    (capability.REMOTE_ASSET_SAFETY_BOUNDARIES as readonly string[]).includes(boundary),
    "boundary must be one of the declared refusal boundaries"
  );

  const entry = fetchResult.audit[0];
  assert.ok(entry, "an audit entry must be recorded for the refusal");

  assert.equal(
    entry!.boundary,
    refusal.boundary,
    "audit entry boundary must match the recorded refusal boundary"
  );
  assert.equal(
    entry!.timestamp,
    1700,
    "audit entry must carry the refusal timestamp"
  );
  assert.deepEqual(
    entry!.redirectChain,
    [],
    "audit entry's redirect chain must not contain the supplied URL"
  );
  assert.equal(
    entry!.urlExcluded,
    true,
    "audit entry must positively assert that the supplied URL is excluded"
  );

  const entryKeys = Object.keys(entry!);
  for (const key of entryKeys) {
    assert.notEqual(
      key,
      "url",
      `audit entry must not record the URL supplied to the fetch (saw key '${key}')`
    );
    assert.notEqual(
      key,
      "address",
      `audit entry must not record the URL supplied to the fetch (saw key '${key}')`
    );
    assert.notEqual(
      key,
      "resolvedAddress",
      `audit entry must not record the URL supplied to the fetch (saw key '${key}')`
    );
  }

  const entrySerialized = JSON.stringify(entry);
  assert.equal(
    entrySerialized.includes("169.254.169.254"),
    false,
    "audit entry must not record the URL supplied to the fetch"
  );
  assert.equal(
    entrySerialized.includes("latest/meta-data"),
    false,
    "audit entry must not record the URL supplied to the fetch"
  );

  const explicitlyRecorded = capability.recordRefusal(
    [],
    refusal,
    [],
    1700
  );
  const recorded = explicitlyRecorded[0];
  assert.ok(recorded, "recordRefusal must append an entry");
  assert.equal(recorded!.urlExcluded, true, "recorded entry must assert urlExcluded");
  const recordedSerialized = JSON.stringify(recorded);
  assert.equal(
    recordedSerialized.includes("169.254.169.254"),
    false,
    "recorded entry must not record the URL supplied to the fetch"
  );
});

test("remoteassetsafetycontracts", () => {
  const declared: capability.RemoteAssetSafetyPolicy = capability.createPolicy(2048, 1500, 2);

  assert.equal(declared.httpsOnly, true, "policy must be HTTPS only");
  assert.ok(
    declared.blockedNetworks.includes("10.0.0.0/8"),
    "private network 10.0.0.0/8 must be blocked"
  );
  assert.ok(
    declared.blockedNetworks.includes("172.16.0.0/12"),
    "private network 172.16.0.0/12 must be blocked"
  );
  assert.ok(
    declared.blockedNetworks.includes("192.168.0.0/16"),
    "private network 192.168.0.0/16 must be blocked"
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
  assert.ok(
    declared.blockedNetworks.includes("fc00::/7"),
    "unique-local IPv6 fc00::/7 must be blocked"
  );
  assert.ok(
    declared.blockedNetworks.includes("::1/128"),
    "loopback IPv6 ::1/128 must be blocked"
  );
  assert.equal(declared.maxBytes, 2048, "policy must declare an explicit max bytes");
  assert.equal(declared.timeoutMs, 1500, "policy must declare an explicit timeout");
  assert.equal(declared.maxRedirects, 2, "policy must declare an explicit max redirects");
  assert.equal(
    declared.enforcement,
    "server-side",
    "policy must declare server-side enforcement"
  );

  let hopsObserved: number = 0;
  const hopUrls: string[] = [];
  const fetchResult = capability.auditFetch(
    "https://public.example.com/start",
    declared,
    (currentUrl) => {
      hopsObserved++;
      hopUrls.push(currentUrl);
      if (hopsObserved <= 2) {
        const next = hopsObserved === 1
          ? "https://public.example.com/hop1"
          : "https://public.example.com/hop2";
        return { content: "", size: 0, redirects: [next] };
      }
      return { content: "ok", size: 2 };
    },
    [],
    0
  );

  const success = expectSuccess(fetchResult.result, "redirect chain fetch");
  assert.equal(success.content, "ok");
  assert.equal(
    hopsObserved,
    3,
    "every redirect hop must be revalidated by the policy (entry + 2 redirects)"
  );
  assert.deepEqual(
    hopUrls,
    [
      "https://public.example.com/start",
      "https://public.example.com/hop1",
      "https://public.example.com/hop2",
    ],
    "every redirect hop must be visited and revalidated"
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
  assert.equal(
    resource.remoteassetsafety.httpsOnly,
    true,
    "published policy must declare HTTPS only"
  );
  assert.equal(
    resource.remoteassetsafety.maxBytes,
    2048,
    "published policy must declare an explicit max bytes"
  );
  assert.equal(
    resource.remoteassetsafety.timeoutMs,
    1500,
    "published policy must declare an explicit timeout"
  );
});

test("remoteassetsafetyerrormodel", () => {
  const oversized = capability.auditFetch(
    "https://public.example.com/big",
    capability.createPolicy(10),
    () => ({ content: "this content is far too long", size: 1024 })
  );

  const oversizedRefusal = expectRefusal(oversized.result, "oversized fetch");
  assert.equal(oversizedRefusal.boundary, "size", "boundary named must be 'size'");
  assert.equal(
    typeof oversizedRefusal.reason,
    "string",
    "refusal must name the boundary that rejected the fetch"
  );
  assert.equal(
    oversizedRefusal.reason.includes("this content is far too long"),
    false,
    "refusal must not include the fetched content"
  );

  const protocolRefusalResult = capability.auditFetch(
    "http://public.example.com/insecure",
    policy,
    () => ({ content: "should not see this", size: 4 })
  );
  const protoRefusal = expectRefusal(protocolRefusalResult.result, "non-HTTPS fetch");
  assert.equal(protoRefusal.boundary, "protocol");
  assert.equal(
    protoRefusal.reason.includes("public.example.com"),
    false,
    "refusal reason must not echo the resolved address"
  );

  const privateRefusalResult = capability.auditFetch(
    "https://169.254.169.254/latest/meta-data/",
    policy,
    () => ({ content: "secret", size: 6 })
  );
  const privRefusal = expectRefusal(privateRefusalResult.result, "metadata fetch");
  assert.equal(privRefusal.boundary, "network");
  assert.equal(
    privRefusal.reason.includes("169.254.169.254"),
    false,
    "refusal reason must not echo the resolved address"
  );

  const timeoutRefusalResult = capability.auditFetch(
    "https://public.example.com/slow",
    capability.createPolicy(1048576, 100),
    () => ({ content: "should not see this either", size: 4, elapsedMs: 5000 })
  );
  const timeoutRefusal = expectRefusal(timeoutRefusalResult.result, "timed-out fetch");
  assert.equal(timeoutRefusal.boundary, "timeout");
  assert.equal(
    timeoutRefusal.reason.includes("should not see this either"),
    false,
    "refusal reason must not include the fetched content"
  );

  const payload =
    JSON.stringify(oversized.result) +
    JSON.stringify(protocolRefusalResult.result) +
    JSON.stringify(privateRefusalResult.result) +
    JSON.stringify(timeoutRefusalResult.result);
  assert.equal(
    payload.includes("this content is far too long"),
    false,
    "refusal payload must not contain fetched content"
  );
  assert.equal(
    payload.includes("should not see this"),
    false,
    "refusal payload must not contain fetched content"
  );
  assert.equal(
    payload.includes("should not see this either"),
    false,
    "refusal payload must not contain fetched content"
  );
  assert.equal(
    payload.includes("secret"),
    false,
    "refusal payload must not contain fetched content"
  );
});

test("remoteassetsafetypermissions", () => {
  const attempted = "https://169.254.169.254/latest/meta-data/";

  const fetchedUrls: string[] = [];
  const fetchResult = capability.serverSideFetch(
    attempted,
    policy,
    (currentUrl) => {
      fetchedUrls.push(currentUrl);
      return { content: "metadata-secret", size: 16 };
    },
    0
  );

  const refusal = expectRefusal(fetchResult.result, "server-side metadata fetch");
  assert.equal(
    refusal.boundary,
    "network",
    "server-side enforcement must be the boundary that rejects the fetch"
  );
  assert.equal(
    fetchedUrls.length,
    0,
    "a client-side check must never be the enforcement point: server-side enforcement rejected before any handler could run"
  );

  const fetchedOnRedirect: string[] = [];
  const redirectResult = capability.serverSideFetch(
    "https://public.example.com/entry",
    policy,
    (currentUrl) => {
      if (currentUrl === "https://public.example.com/entry") {
        return { content: "", size: 0, redirects: ["https://10.0.0.5/inside"] };
      }
      fetchedOnRedirect.push(currentUrl);
      return { content: "should not be delivered", size: 24 };
    },
    0
  );
  const redirectRefusal = expectRefusal(redirectResult.result, "redirected private fetch");
  assert.equal(redirectRefusal.boundary, "network");
  assert.equal(
    fetchedOnRedirect.length,
    0,
    "a client-side check must never be the enforcement point: the redirect to a private network was rejected server-side before any subsequent hop ran"
  );

  const clientEnforcement: capability.RemoteAssetSafetyPolicy = {
    ...policy,
    enforcement: "client-side" as capability.RemoteAssetSafetyPolicy["enforcement"],
  };

  const nonServerResult = capability.serverSideFetch(
    "https://public.example.com/anything",
    clientEnforcement as capability.RemoteAssetSafetyPolicy,
    () => ({ content: "ok", size: 2 }),
    0
  );
  const nonServerRefusal = expectRefusal(
    nonServerResult.result,
    "client-side enforcement must be rejected"
  );
  assert.equal(
    nonServerRefusal.boundary,
    "protocol",
    "a non-server-side enforcement policy must be refused"
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
    const r = capability.auditFetch(
      planted,
      policy,
      () => ({ content: "should never be delivered", size: 24 }),
      [],
      0
    );
    const ref = expectRefusal(r.result, `planted URL ${planted}`);
    assert.equal(
      ref.boundary,
      "network",
      `refusal boundary must be 'network' for ${planted}`
    );
  }

  const viaRedirect = capability.auditFetch(
    "https://public.example.com/entry",
    policy,
    (currentUrl) => {
      if (currentUrl === "https://public.example.com/entry") {
        return { content: "", size: 0, redirects: ["https://10.0.0.7/inside"] };
      }
      return { content: "should not see", size: 12 };
    },
    [],
    0
  );
  const redirectRefusal = expectRefusal(viaRedirect.result, "redirected private address");
  assert.equal(redirectRefusal.boundary, "network");

  const viaMetadataRedirect = capability.auditFetch(
    "https://public.example.com/entry",
    policy,
    (currentUrl) => {
      if (currentUrl === "https://public.example.com/entry") {
        return {
          content: "",
          size: 0,
          redirects: ["https://public.example.com/h2"],
        };
      }
      if (currentUrl === "https://public.example.com/h2") {
        return {
          content: "",
          size: 0,
          redirects: ["https://169.254.169.254/latest/meta-data/"],
        };
      }
      return { content: "should not see", size: 12 };
    },
    [],
    0
  );
  const metadataRedirectRefusal = expectRefusal(
    viaMetadataRedirect.result,
    "redirected metadata address"
  );
  assert.equal(
    metadataRedirectRefusal.boundary,
    "network",
    "metadata address reached only through a redirect must be refused"
  );

  const oversized = capability.auditFetch(
    "https://public.example.com/big",
    capability.createPolicy(8),
    () => ({ content: "way too many bytes here", size: 4096 }),
    [],
    0
  );
  const oversizedRefusal = expectRefusal(oversized.result, "oversized response");
  assert.equal(oversizedRefusal.boundary, "size");

  const slow = capability.auditFetch(
    "https://public.example.com/slow",
    policy,
    () => {
      throw new Error("deadline exceeded");
    },
    [],
    0
  );
  const slowRefusal = expectRefusal(slow.result, "timed-out response");
  assert.equal(slowRefusal.boundary, "timeout");

  const slowByElapsed = capability.auditFetch(
    "https://public.example.com/slow-elapsed",
    capability.createPolicy(1048576, 50),
    () => ({ content: "x", size: 1, elapsedMs: 5000 }),
    [],
    0
  );
  const slowByElapsedRefusal = expectRefusal(
    slowByElapsed.result,
    "slow-by-elapsed response"
  );
  assert.equal(slowByElapsedRefusal.boundary, "timeout");
});