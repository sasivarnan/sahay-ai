import { describe, expect, it, vi } from "vitest"
import { releaseVoiceSession } from "../src/lib/voice-session"

describe("voice session cleanup", () => {
  it("releases the microphone when the agent ends the call without recursive cleanup", async () => {
    const track = { stop: vi.fn() }
    const session = {
      stop: vi.fn(async () => {
        track.stop()
        expect(await releaseVoiceSession(reference, session)).toBe(false)
      }),
    }
    const reference = { current: session as typeof session | null }
    expect(await releaseVoiceSession(reference, session)).toBe(true)
    expect(track.stop).toHaveBeenCalledTimes(1)
    expect(session.stop).toHaveBeenCalledTimes(1)
    expect(reference.current).toBeNull()
    expect(await releaseVoiceSession(reference, session)).toBe(false)
  })

  it("does not stop a newer call when an older call ends late", async () => {
    const old = { stop: vi.fn(async () => {}) }
    const current = { stop: vi.fn(async () => {}) }
    const reference = { current }
    expect(await releaseVoiceSession(reference, old)).toBe(false)
    expect(reference.current).toBe(current)
    expect(current.stop).not.toHaveBeenCalled()
  })

  it("clears the session reference even when SDK cleanup fails", async () => {
    const session = {
      stop: vi.fn(async () => {
        throw new Error("Audio cleanup failed")
      }),
    }
    const reference = { current: session as typeof session | null }
    await expect(releaseVoiceSession(reference, session)).rejects.toThrow(
      "Audio cleanup failed"
    )
    expect(reference.current).toBeNull()
  })
})
