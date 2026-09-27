export const sendAdminError = (res, status, message) => {
  const safeMessage = message || 'Error'
  return res.status(status).json({ error: safeMessage, requestId: res.req?.id })
}
