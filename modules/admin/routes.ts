import { Router } from 'express';
import {
  assignManager,
  createCollege,
  deleteCollege,
  listColleges,
  listManagers,
  overviewAnalytics,
  updateCollege
} from '../../controllers/adminController/index.js';
import { authenticate } from '../../middlewares/authenticate.js';
import { authorize } from '../../middlewares/authorize.js';
import { validateRequest } from '../../middlewares/validate-request.js';
import { assignManagerSchema, collegeSchema, idParamSchema, updateCollegeSchema } from '../../models/admin.js';
import { RoleCode } from '../../models/domain.js';

const router = Router();

router.use(authenticate, authorize(RoleCode.SUPER_ADMIN));

router.get('/colleges', listColleges);
router.post('/colleges', validateRequest({ body: collegeSchema }), createCollege);
router.put('/colleges/:id', validateRequest({ params: idParamSchema, body: updateCollegeSchema }), updateCollege);
router.delete('/colleges/:id', validateRequest({ params: idParamSchema }), deleteCollege);
router.get('/colleges/:id/managers', validateRequest({ params: idParamSchema }), listManagers);
router.post('/managers', validateRequest({ body: assignManagerSchema }), assignManager);
router.get('/analytics/overview', overviewAnalytics);

export default router;
