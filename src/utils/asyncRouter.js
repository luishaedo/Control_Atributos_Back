import { Router } from 'express'

// Express 4 does not forward rejected handler promises to the error middleware.
export function asyncHandler(handler) {
  return (req, res, next) => {
    Promise.resolve().then(() => handler(req, res, next)).catch(next)
  }
}

export function createAsyncRouter() {
  const router = Router()
  for (const method of ['get', 'head', 'post', 'put', 'patch', 'delete', 'options']) {
    const register = router[method].bind(router)
    router[method] = (path, ...handlers) =>
      register(path, ...handlers.flat(Infinity).map(asyncHandler))
  }
  return router
}
