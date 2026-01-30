export const sendAdminError = (res, status, message) => {
  const safeMessage = message || 'Error'
  return res.status(status).send(safeMessage)
}
