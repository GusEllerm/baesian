import { Buffer } from "node:buffer";
import { verifyAuthenticationResponse, verifyRegistrationResponse } from "@simplewebauthn/server";
import { describe, expect, it } from "vitest";
import { proofProblem } from "../../src/passkey.js";
import { ORIGIN, RP_ID } from "../../test/service.js";
import { WebPasskey, randomChallenge } from "./passkeys.js";

// B-jp22m's premise, checked first: SimpleWebAuthn's server package runs in workerd, Cloudflare's runtime. A
// registration (attestation "none", an attestation object built in the test) and an authentication (an assertion as M9a's
// TestPasskey makes it), each verified inside the Worker's runtime, for each algorithm a passkey proof is checked with.

describe("SimpleWebAuthn in workerd (B-jp22m's premise)", () => {
  for (const alg of [-7, -8, -257] as const) {
    it(`verifies a registration and an authentication, COSE algorithm ${alg}`, async () => {
      const passkey = new WebPasskey("acct-gus", "gus", alg);
      const challenge = randomChallenge();
      const reg = await verifyRegistrationResponse({ response: passkey.register(challenge), expectedChallenge: challenge, expectedOrigin: ORIGIN, expectedRPID: RP_ID, requireUserVerification: true, supportedAlgorithmIDs: [-8, -7, -257] });
      expect(reg.verified).toBe(true);
      const info = reg.registrationInfo!;
      expect(info.fmt).toBe("none");
      expect(info.credential.id).toBe(passkey.id);

      const signIn = randomChallenge();
      const auth = await verifyAuthenticationResponse({
        response: passkey.sign(signIn),
        expectedChallenge: signIn,
        expectedOrigin: ORIGIN,
        expectedRPID: RP_ID,
        credential: { id: info.credential.id, publicKey: info.credential.publicKey, counter: info.credential.counter },
        requireUserVerification: true,
      });
      expect(auth.verified).toBe(true);
      expect(auth.authenticationInfo.userVerified).toBe(true);

      // And M9a's offline check agrees on the same assertion: a proof the library accepted, checked by verify's own code.
      const bytes = Buffer.from("a verdict's bytes\n");
      const proof = passkey.prove("v.json", bytes);
      const lib = await verifyAuthenticationResponse({
        response: { id: passkey.id, rawId: passkey.id, type: "public-key", clientExtensionResults: {}, response: { clientDataJSON: proof.client_data, authenticatorData: proof.authenticator_data, signature: proof.signature } },
        expectedChallenge: Buffer.from(await crypto.subtle.digest("SHA-256", bytes)).toString("base64url"),
        expectedOrigin: ORIGIN,
        expectedRPID: RP_ID,
        credential: { id: info.credential.id, publicKey: info.credential.publicKey, counter: 0 },
        requireUserVerification: true,
      });
      expect(lib.verified).toBe(true);
      expect(proofProblem(proof, bytes, passkey.keyFile(), { origin: ORIGIN, rp_id: RP_ID })).toBeUndefined();
    });
  }

  it("refuses a registration for another origin or challenge, or without user verification", async () => {
    const passkey = new WebPasskey();
    const challenge = randomChallenge();
    const opts = { expectedChallenge: challenge, expectedOrigin: ORIGIN, expectedRPID: RP_ID, requireUserVerification: true };
    await expect(verifyRegistrationResponse({ ...opts, response: passkey.register(challenge, { origin: "https://evil.test" }) })).rejects.toThrow(/origin/i);
    await expect(verifyRegistrationResponse({ ...opts, response: passkey.register(randomChallenge()) })).rejects.toThrow(/challenge/i);
    await expect(verifyRegistrationResponse({ ...opts, response: passkey.register(challenge, { flags: 0x41 }) })).rejects.toThrow(/verif/i);
  });
});
