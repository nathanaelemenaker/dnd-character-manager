export async function register() {
  // Only run server-side Node.js startup — skip edge runtime
  if (process.env.NEXT_RUNTIME !== 'nodejs') return;

  const { prisma } = await import('@/lib/prisma');

  // On startup, any session still marked processing/pending had its background
  // job killed by the restart. Reset them so the UI's re-trigger button works.
  const reset = await prisma.sessionLog.updateMany({
    where: { transcriptStatus: { in: ['processing', 'pending'] } },
    data: {
      transcriptStatus: 'error',
      transcriptError: 'Interrupted: server restarted mid-transcription. Use the re-trigger button to retry.',
    },
  });
  if (reset.count > 0) {
    console.log(`[startup] Reset ${reset.count} stuck transcription(s) to error.`);
  }

  // Periodic guard: if whisper hangs without the server dying, catch it after 12 h.
  const STUCK_HOURS = 12;
  setInterval(async () => {
    const cutoff = new Date(Date.now() - STUCK_HOURS * 60 * 60 * 1000);
    const timedOut = await prisma.sessionLog.updateMany({
      where: {
        transcriptStatus: { in: ['processing', 'pending'] },
        updatedAt: { lt: cutoff },
      },
      data: {
        transcriptStatus: 'error',
        transcriptError: `Transcription timed out after ${STUCK_HOURS}h. Use the re-trigger button to retry.`,
      },
    });
    if (timedOut.count > 0) {
      console.log(`[watchdog] Timed out ${timedOut.count} stuck transcription(s).`);
    }
  }, 30 * 60 * 1000).unref();
}
