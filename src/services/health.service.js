export function createReadinessProbe(prisma, timeoutMs) {
  let inFlight = null
  return async () => {
    // Share the query even after HTTP timeout: never accumulate a probe queue.
    if (!inFlight) {
      inFlight = Promise.resolve()
        .then(() => prisma.$queryRaw`SELECT 1`)
        .then(() => true, () => false)
        .finally(() => { inFlight = null })
    }
    let timer
    try {
      return await Promise.race([
        inFlight,
        new Promise(resolve => { timer = setTimeout(() => resolve(false), timeoutMs) }),
      ])
    } finally {
      clearTimeout(timer)
    }
  }
}
