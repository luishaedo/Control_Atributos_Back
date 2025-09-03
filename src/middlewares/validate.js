// Si usás Zod: npm i zod
export const validate = (schema) => (req, res, next) => {
  try {
    if (!schema) return next()
    const data = { body: req.body, params: req.params, query: req.query }
    schema.parse?.(data)
    return next()
  } catch (err) {
    const issues = err?.issues || [{ message: err?.message || 'Validación fallida' }]
    return res.status(400).json({ error: 'VALIDATION_ERROR', issues })
  }
}
