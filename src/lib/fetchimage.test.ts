import { test } from "node:test";
import assert from "node:assert/strict";
import { FetchImageError, assertPublicUrl, isPrivateAddress } from "./fetchimage.ts";

/**
 * Asserts the refusal, and asserts it says the right thing to the READER.
 *
 * `assert.rejects` matches `error.message`, which here is the diagnostic detail - `localhost
 * resolves to ::1`. That detail is deliberately kept out of the HTTP response, because echoing
 * it back would turn every refusal into a readable answer about the network behind the server.
 * So the test checks `userMessage`, which is what actually reaches the browser.
 */
async function refuses(url: string, userMessage: RegExp): Promise<void> {
  await assert.rejects(
    () => assertPublicUrl(url),
    (e: unknown) => {
      assert.ok(e instanceof FetchImageError, `${url}: expected a FetchImageError, got ${e}`);
      assert.match(e.userMessage, userMessage, `${url}: wrong message for the reader`);
      return true;
    },
  );
}

test("the cloud metadata service is not reachable", () => {
  // The one that matters most on this host: it hands out service-account tokens to anything on
  // the box that asks for them.
  assert.equal(isPrivateAddress("169.254.169.254"), true);
  assert.equal(isPrivateAddress("169.254.0.1"), true);
});

test("loopback, private and reserved space is refused", () => {
  for (const a of [
    "127.0.0.1", "127.1.2.3", "0.0.0.0", "10.0.0.1", "10.255.255.255",
    "172.16.0.1", "172.31.255.255", "192.168.1.1", "100.64.0.1", "100.127.0.1",
    "192.0.0.1", "192.0.2.5", "198.18.0.1", "198.51.100.7", "203.0.113.9",
    "224.0.0.1", "239.1.1.1", "240.0.0.1", "255.255.255.255",
  ]) {
    assert.equal(isPrivateAddress(a), true, `${a} must be refused`);
  }
});

test("ordinary public addresses are allowed", () => {
  for (const a of [
    "8.8.8.8", "1.1.1.1", "93.184.216.34", "172.15.0.1", "172.32.0.1",
    "192.167.1.1", "192.169.1.1", "100.63.0.1", "100.128.0.1", "223.255.255.255",
  ]) {
    assert.equal(isPrivateAddress(a), false, `${a} should be allowed`);
  }
});

test("loopback in an IPv6 costume is still loopback", () => {
  // The classic bypass: the address is IPv4 wrapped in IPv6 notation, so a v4-only check
  // waves it through.
  assert.equal(isPrivateAddress("::ffff:127.0.0.1"), true);
  assert.equal(isPrivateAddress("::FFFF:169.254.169.254"), true);
  assert.equal(isPrivateAddress("::ffff:8.8.8.8"), false);
});

test("IPv6 private space is refused", () => {
  for (const a of ["::", "::1", "fc00::1", "fd12:3456::1", "fe80::1", "ff02::1"]) {
    assert.equal(isPrivateAddress(a), true, `${a} must be refused`);
  }
  assert.equal(isPrivateAddress("2606:4700:4700::1111"), false, "public IPv6 is fine");
});

test("anything unparseable is refused rather than assumed public", () => {
  for (const a of ["", "not-an-address", "999.1.1.1", "1.2.3"]) {
    assert.equal(isPrivateAddress(a), true, `${a} must be refused`);
  }
});

test("only http and https are opened", async () => {
  for (const u of [
    "file:///etc/passwd",
    "ftp://example.com/x.png",
    "gopher://example.com/",
    "data:image/png;base64,AAAA",
  ]) {
    await refuses(u, /http|không hợp lệ/i);
  }
});

test("a literal private host is refused without needing DNS", async () => {
  for (const u of [
    "http://127.0.0.1:3000/",
    "http://169.254.169.254/computeMetadata/v1/",
    "http://[::1]:3000/",
    "http://10.0.0.5/x.png",
  ]) {
    await refuses(u, /không truy cập được/);
  }
});

test("rubbish that is not a URL at all is refused", async () => {
  for (const u of ["", "   ", "just some text", "javascript:alert(1)"]) {
    await refuses(u, /./);
  }
});

test("a hostname that resolves to loopback is refused", async () => {
  // localhost is the honest version of the DNS-rebinding trick: a name anyone can use that
  // points inside. The check must resolve, not just read the string.
  await refuses("http://localhost:3000/x.png", /không truy cập được/);
});
