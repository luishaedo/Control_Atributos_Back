export function authAdmin() {
  const ADMIN_TOKEN = process.env.ADMIN_TOKEN || ''
  return (req, res, next) => {
    if (!ADMIN_TOKEN) return res.status(500).json({ error: 'ADMIN_TOKEN no configurado en .env' })
    const auth = req.headers.authorization || ''
    const token = auth.startsWith('Bearer ') ? auth.slice(7) : ''
    if (token !== ADMIN_TOKEN) return res.status(401).json({ error: 'No autorizado' })
    next()
  }
}
