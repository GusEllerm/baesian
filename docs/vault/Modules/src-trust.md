---
type: module
status: active
authority: describes
summary: "src/trust.ts, src/sshsig.ts and src/passkey.ts (M9a): the keys a hosted repo trusts, pinned in CI with the repo's project (B-mar8x) or copied in the record (D142, D159); the service's OpenSSH signatures (D160); passkey proofs on hard-card answers and loosened preferences (D139, D163); and the relay's draw proof (D158). All checked offline with Node's crypto, no new dependency."
created: 2026-11-03
updated: 2026-11-05
reviewed: 2026-11-03
tags: [baesian, module, hosted]
---

# The hosted service's proof (M9a)

The design is [[Formats for v1]] section 7 (P16) and [[Hosted Service]] section 4 (P15), as D138, D139, D142, D158–D160 and D163 decided them. The formats are in [[File Formats#The hosted service's proof (M9a)]]. These modules check; the store decides what counts with them ([[src-store#The hosted service's proof (M9a)]]), and `baesian verify` reports it ([[src-verify#In a hosted repo (M9a)]]). Everything is offline, with Node's own crypto: Ed25519 for the service, and ES256, EdDSA or RS256 for passkeys. Checking an assertion needs no CBOR; registration does, and that's the service's (M9c).

## src/sshsig.ts: OpenSSH signatures (D160)

OpenSSH's signature format (PROTOCOL.sshsig), read and written around Node's Ed25519, so `ssh-keygen -Y verify -n baesian` checks the service's signatures by hand ([[src-verify#Checking an answer by hand]]), and a file signed with `ssh-keygen -Y sign` counts.

- **`parseSignature()`** reads one, armored as `ssh-keygen` writes it or as bare base64 (a draw proof): the signer's key, the namespace, the hash (SHA-512 or SHA-256) and the 64-byte Ed25519 signature. Only Ed25519 keys sign Baesian's files. An SSHSIG version above 1 throws `NewerFormat` (D157), naming the file; anything else unreadable throws `BadSignature`.
- **`signatureMatches()`** checks it against the message's bytes in a namespace: what's signed is the namespace and the message's hash, never the message itself. Which keys to trust is the caller's question.
- **`signMessage()`** signs, as `ssh-keygen -Y sign` does, for the relay (M9b) and the tests' stand-in for it (`test/service.ts`). **`opensshPublicKey()`** and **`publicKeyBlob()`** turn keys into and out of OpenSSH's `ssh-ed25519 AAAA…` form.
- **`NAMESPACE`** is `baesian`, for every signed file; **`DRAW_NAMESPACE`**, `baesian-draw`, keeps the relay's draw proofs apart, so a draw can never pass for a file's signature.

## src/passkey.ts: passkey proofs (D139, D163, B-a6xpc)

**`proofProblem()`** says why a WebAuthn assertion doesn't prove a file, or nothing if it does: it must be `webauthn.get`, from the service's origin and not in another site's frame, with the challenge the file's SHA-256 digest (`challengeOf()`), or, in the batch form (one tap over several answers, B-a6xpc), with the challenge the digest of the proof's list (`batchChallenge()`, over `batchMessage()`: a line `baesian-batch`, then each file's SHA-256 in lowercase hex, one per line), which must hold the file's own digest; its authenticator data must carry the relying party's hash and the user-present and user-verified flags; and its signature, over the authenticator data and the client data's hash, must check under the passkey's public key, by its COSE algorithm. The batch message's first line keeps the two forms apart: no verdict or preference file reads so, so a batch's assertion proves no file in the single form, and a file's digest is no batch's challenge. A list changed after the tap changes the challenge, and a proof copied beside an answer its list doesn't hold, or an answer of another account's, doesn't count (`Store.judge` finds the key by the answer's own account). The sign counter isn't checked: synced passkeys keep it at zero, and offline there's nothing to compare it with. It runs in workerd too, where the relay checks each proof it writes with it (M9c, [[service]]): an ES256 signature is checked as DER, Node's default, since workerd takes no key object inside an options object. The relay's tests check that it agrees with SimpleWebAuthn on the same assertions (B-jp22m).

## src/trust.ts: the keys, and the checks made with them (D142, D159)

- **`pinnedTrust()`** reads CI's pin: `BAESIAN_TRUST` (`TRUST_ENV`), the trust files' JSON one per line and the line naming the repo's project, or the file `BAESIAN_TRUST_FILE` (`TRUST_FILE_ENV`) names, or both. **`parseTrust()`** reads the lines, each key through its kind's schema (`readTrustFile()`), and the project's through `PinnedProject` (B-mar8x), into `TrustRoot.project`; a pin names one project, so two different ones throw. **`pinComplete()`** says the pin must hold a service key and a project, and `baesian verify` applies it to a pin it's given too. Set but empty (which is how GitHub Actions passes a variable that isn't set), unreadable, or with no service key or no project, the pin throws `BadTrust`, which stops the command, saying to run `baesian ci` for the lines (`RUN_CI`): a misconfigured pin fails, never switches the checks off. **`projectLine()`** is the project's line, as `baesian ci` prints it ([[src-sync#src/ci.ts: setting up CI (B-pt52b)]]).
- **`checkSigned()`** says whether a file is the service's word: its signature parses, is in the `baesian` namespace, by a trusted service key, matches the bytes, and the key was valid at the file's own time (`valid_after`, `valid_before`) and not revoked by then. It returns the key, whose `origin` and `rp_id` a passkey proof must name.
- **`pinProblems()`** lists the record's service keys and passkey keys that CI doesn't pin, or pins differently, compared field by field: each fails the commit (D142, D159), since the commit gate on a machine trusts the record's copy. A passkey's says whose it is and what to do: yours, or that of someone you added to the project (P20, B-9e7cn), add its line, which `baesian ci` prints; nobody's you know, remove it and find out how.
- **`drawMessage()`** is what the relay signs for a card revision's draw: `<id> r<revision> <SHA-256 of the revision's bytes>`. **`drawOfProof()`** checks a relay's `draw_proof` under a trusted key in `DRAW_NAMESPACE`, and reads the draw from the signature's SHA-256, as `drawOf()` reads the CLI's (D158).

## Tests

`test/hosted.test.ts`, against real temporary repos, with `test/service.ts` standing in for the service: a test Ed25519 key that signs what a person writes, and test passkeys (P-256, Ed25519 and RSA) that make assertions as a browser would, one file at a time or several by one tap (`TestPasskey.proveBatch`): a batch counts, and a list changed after the tap, one that doesn't hold the answer, another passkey's key or another account's answer doesn't, while an answer proved alone still does. Each file is written into the live layer as a pull from the relay would write it, so the store, the commit gate and `baesian verify` are tested end to end without a service. The stand-in's pin names its project, as CI's must (B-mar8x); `test/linking.test.ts` covers the project and the linking commit under the pin. Where `ssh-keygen` is on PATH, it checks the service's signatures and makes one that counts; otherwise those two tests are skipped.
