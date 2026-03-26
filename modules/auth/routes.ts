import { Router } from 'express';
import { login, me, refresh, registerCustomer } from '../../controllers/authController/index.js';
import { authRateLimit } from '../../middlewares/rate-limit.js';
import { authenticate } from '../../middlewares/authenticate.js';
import { validateRequest } from '../../middlewares/validate-request.js';
import { loginSchema, refreshTokenSchema, registerSchema } from '../../models/auth.js';

const router = Router();

router.post('/register', authRateLimit, validateRequest({ body: registerSchema }), registerCustomer);
router.post('/login', authRateLimit, validateRequest({ body: loginSchema }), login);
router.post('/refresh', authRateLimit, validateRequest({ body: refreshTokenSchema }), refresh);
router.get('/me', authenticate, me);

export default router;
