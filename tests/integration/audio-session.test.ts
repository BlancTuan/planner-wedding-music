import { randomUUID } from "node:crypto";
import { execFile } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { POST as importAudio } from "@/app/api/audio/sessions/[sessionId]/import/route";
import { GET as streamAudio } from "@/app/api/audio/sessions/[sessionId]/stream/route";
import { deleteAccount, openSession, type SessionUser } from "@/server/auth";
import { keptDurationMs } from "@/server/audio/edits";
import {
  createAudioSession,
  deleteAudioSession,
  exportSessionAudio,
  importSessionFixture,
  importSessionUpload,
  readAudioSession,
  readSessionExport,
  readSessionWaveform,
  saveSessionEdits,
  sweepExpiredSessions,
} from "@/server/audio/sessions";
import { one, query } from "@/server/db";
import { safePath, writeStorage } from "@/server/storage";

const execFileAsync = promisify(execFile);

async function mediaDuration(bytes: Buffer): Promise<number> {
  const dir = await mkdtemp(path.join(tmpdir(), "wmp-session-"));
  const file = path.join(dir, "clip.mp3");
  try {
    await writeFile(file, bytes);
    const { stdout } = await execFileAsync("ffprobe", [
      "-v",
      "error",
      "-show_entries",
      "format=duration",
      "-of",
      "csv=p=0",
      file,
    ]);
    return Math.round(Number(stdout.trim()) * 1000);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

describe("temporary audio sessions", () => {
  let user: SessionUser;
  let token: string;
  let other: SessionUser;

  beforeAll(async () => {
    const session = await openSession({ subject: `audio-session-${randomUUID()}`, displayName: "Phiên tạm" });
    user = session.user;
    token = session.token;
    const second = await openSession({ subject: `audio-session-other-${randomUUID()}`, displayName: "Người khác" });
    other = second.user;
  }, 30000);

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  afterAll(async () => {
    await deleteAccount(user, true, user.version);
    await deleteAccount(other, true, other.version);
  });

  it("keeps YouTube metadata and does not create an audio file", async () => {
    vi.stubGlobal("fetch", (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("oembed")) {
        return Promise.resolve(
          new Response(
            JSON.stringify({
              title: "Me at the zoo",
              author_name: "jawed",
              thumbnail_url: "https://i.ytimg.com/vi/jNQXAC9IVRw/hqdefault.jpg",
            }),
            { status: 200, headers: { "content-type": "application/json" } },
          ),
        );
      }
      return Promise.resolve(new Response("", { status: 404 }));
    });
    const session = await createAudioSession(user.id, "https://music.youtube.com/watch?v=jNQXAC9IVRw");
    expect(session.state).toBe("CREATED");
    expect(session.errorCode).toBeNull();
    expect(session.title).toBe("Me at the zoo");
    expect(session.channelName).toBe("jawed");
    expect(session.thumbnailUrl).toContain("https://i.ytimg.com/");
    expect(JSON.stringify(session)).not.toContain("temporary-audio");
    expect(JSON.stringify(session)).not.toContain("audioKey");
    expect(existsSync(safePath(`temporary-audio/${session.id}/original.mp3`))).toBe(false);
    const blocked = await importAudio(
      new Request(`http://127.0.0.1/api/audio/sessions/${session.id}/import`, {
        method: "POST",
        headers: { cookie: `wmp_session=${token}`, "content-type": "application/json" },
        body: JSON.stringify({ source: "https://www.youtube.com/watch?v=jNQXAC9IVRw" }),
      }),
      { params: Promise.resolve({ sessionId: session.id }) },
    );
    expect(blocked.status).toBe(422);
    expect(existsSync(safePath(`temporary-audio/${session.id}/original.mp3`))).toBe(false);
    await deleteAudioSession(user.id, session.id);
  });

  it("rejects a URL that is not YouTube before creating a session", async () => {
    await expect(createAudioSession(user.id, "https://example.com/watch?v=jNQXAC9IVRw")).rejects.toMatchObject({
      status: 422,
      code: "MALFORMED_URL",
    });
  });

  it("cleans up a failed upload and leaves no original audio", async () => {
    const session = await createAudioSession(user.id, null);
    const failed = await importSessionUpload(user.id, session.id, Buffer.from("not-audio"));
    expect(failed.state).toBe("FAILED");
    expect(failed.errorCode).toBe("INVALID_AUDIO");
    expect(existsSync(safePath(`temporary-audio/${session.id}/original.mp3`))).toBe(false);
    expect(existsSync(safePath(`temporary-audio/${session.id}/inbound.bin`))).toBe(false);
    await deleteAudioSession(user.id, session.id);
  });

  it("imports an authorized fixture, edits it, exports both lengths, then expires only that session", async () => {
    const session = await createAudioSession(user.id, null);
    const ready = await importSessionFixture(user.id, session.id, "fixture:tone");
    expect(ready.state).toBe("READY");
    expect(ready.durationMs).toBeGreaterThan(1500);
    expect(ready.durationMs).toBeLessThan(2600);
    expect(ready.edits.segments).toHaveLength(1);
    const wave = await readSessionWaveform(user.id, session.id);
    expect(wave.durationMs).toBe(ready.durationMs);
    expect(wave.peaks.length).toBeGreaterThan(10);
    expect(Math.max(...wave.peaks)).toBeGreaterThan(0);
    const anonymous = await streamAudio(
      new Request(`http://127.0.0.1/api/audio/sessions/${session.id}/stream`),
      { params: Promise.resolve({ sessionId: session.id }) },
    );
    expect(anonymous.status).toBe(401);
    await expect(readAudioSession(other.id, session.id)).rejects.toMatchObject({ status: 404 });
    const ranged = await streamAudio(
      new Request(`http://127.0.0.1/api/audio/sessions/${session.id}/stream`, {
        headers: { cookie: `wmp_session=${token}`, range: "bytes=0-15" },
      }),
      { params: Promise.resolve({ sessionId: session.id }) },
    );
    expect(ranged.status).toBe(206);
    expect(ranged.headers.get("content-type")).toBe("audio/mpeg");
    expect(ranged.headers.get("content-range")).toBe(`bytes 0-15/${ranged.headers.get("content-range")?.split("/")[1]}`);
    expect((await ranged.arrayBuffer()).byteLength).toBe(16);
    const end = Math.floor((ready.durationMs ?? 0) / 10) * 10;
    const split = {
      segments: [
        { startMs: 0, endMs: 1000 },
        { startMs: 1000, endMs: end },
      ],
      fadeInMs: 0,
      fadeOutMs: 0,
      gainDb: 0,
    };
    const saved = await saveSessionEdits(user.id, session.id, split);
    const reloaded = await readAudioSession(user.id, session.id);
    expect(reloaded.edits).toEqual(saved.edits);
    expect(keptDurationMs(reloaded.edits)).toBe(end);
    const both = await exportSessionAudio(user.id, session.id);
    expect(both.state).toBe("COMPLETED");
    const bothBytes = await readSessionExport(user.id, session.id, both.id);
    const bothDuration = await mediaDuration(bothBytes);
    expect(Math.abs(bothDuration - (both.durationMs ?? 0))).toBeLessThan(50);
    expect(bothDuration).toBeGreaterThan(1500);
    const trimmed = await saveSessionEdits(user.id, session.id, {
      segments: [{ startMs: 0, endMs: 1000 }],
      fadeInMs: 100,
      fadeOutMs: 100,
      gainDb: 0,
    });
    expect(trimmed.edits.fadeInMs).toBe(100);
    const short = await exportSessionAudio(user.id, session.id);
    const shortBytes = await readSessionExport(user.id, session.id, short.id);
    const shortDuration = await mediaDuration(shortBytes);
    expect(shortDuration).toBeGreaterThan(700);
    expect(shortDuration).toBeLessThan(1400);
    expect(bothDuration).toBeGreaterThan(shortDuration + 400);
    const kept = await createAudioSession(user.id, null);
    const keptReady = await importSessionFixture(user.id, kept.id, "fixture:tone");
    expect(keptReady.state).toBe("READY");
    await query("UPDATE audio_edit_sessions SET expires_at = now() - interval '1 second' WHERE id = $1", [session.id]);
    await sweepExpiredSessions();
    expect(existsSync(safePath(`temporary-audio/${session.id}`))).toBe(false);
    expect(existsSync(safePath(`temporary-audio/${kept.id}/original.mp3`))).toBe(true);
    await expect(readAudioSession(user.id, session.id)).rejects.toMatchObject({ status: 410 });
    const expiredStream = await streamAudio(
      new Request(`http://127.0.0.1/api/audio/sessions/${session.id}/stream`, {
        headers: { cookie: `wmp_session=${token}` },
      }),
      { params: Promise.resolve({ sessionId: session.id }) },
    );
    expect(expiredStream.status).toBe(410);
    const orphan = randomUUID();
    await writeStorage(`temporary-audio/${orphan}/original.mp3`, Buffer.from("orphan"));
    await sweepExpiredSessions();
    expect(existsSync(safePath(`temporary-audio/${orphan}`))).toBe(false);
    expect(existsSync(safePath(`temporary-audio/${kept.id}/original.mp3`))).toBe(true);
    await query(
      "UPDATE audio_edit_sessions SET last_activity_at = now() - interval '1 minute', expires_at = now() + interval '5 minutes' WHERE id = $1",
      [kept.id],
    );
    const shortened = await one<{ expiresAt: Date }>(
      `SELECT expires_at AS "expiresAt" FROM audio_edit_sessions WHERE id = $1`,
      [kept.id],
    );
    await readAudioSession(user.id, kept.id);
    const after = await one<{ expiresAt: Date }>(
      `SELECT expires_at AS "expiresAt" FROM audio_edit_sessions WHERE id = $1`,
      [kept.id],
    );
    expect(new Date(after!.expiresAt).getTime()).toBeGreaterThan(new Date(shortened!.expiresAt).getTime() + 60_000);
    await deleteAudioSession(user.id, kept.id);
    expect(existsSync(safePath(`temporary-audio/${kept.id}`))).toBe(false);
  }, 120000);

  it("refuses the fixture source when test mode is off", async () => {
    vi.stubEnv("AUTH_TEST_MODE", "false");
    const session = await createAudioSession(user.id, null);
    const blocked = await importSessionFixture(user.id, session.id, "fixture:tone");
    expect(blocked.state).toBe("FAILED");
    expect(blocked.errorCode).toBe("FIXTURE_DISABLED");
    expect(existsSync(safePath(`temporary-audio/${session.id}/original.mp3`))).toBe(false);
    await deleteAudioSession(user.id, session.id);
  });
});
