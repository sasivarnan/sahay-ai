type VoiceSession = { stop: () => Promise<void> }

export async function releaseVoiceSession<T extends VoiceSession>(
  reference: { current: T | null },
  session: T
): Promise<boolean> {
  if (reference.current !== session) return false
  reference.current = null
  await session.stop()
  return true
}
