const express = require('express');
const { requireAuth, requireRole } = require('../middleware/auth');
const { createShootDay, getShootDays, getShootDay, updateShootDay, createShootDaysBulk } = require('../controllers/shootDayController');
const { getAttendance, updateAttendance, setFinishTimeForAll } = require('../controllers/attendanceController');
const { exportPayroll } = require('../controllers/payrollController');

const router = express.Router();

router.post('/', requireAuth, requireRole('ADMIN'), createShootDay);
router.post('/bulk', requireAuth, requireRole('ADMIN'), createShootDaysBulk);
router.get('/', requireAuth, requireRole('ADMIN'), getShootDays);
router.get('/:id', requireAuth, requireRole('ADMIN'), getShootDay);
router.patch('/:id', requireAuth, requireRole('ADMIN'), updateShootDay);

// Attendance (Phase 3 Part 9): no-shows + finish times, once the shoot day has started
router.get('/:id/attendance', requireAuth, requireRole('ADMIN'), getAttendance);
router.patch('/:id/attendance/:inviteId', requireAuth, requireRole('ADMIN'), updateAttendance);
router.patch('/:id/finish-time', requireAuth, requireRole('ADMIN'), setFinishTimeForAll);
// Payroll export (Phase 3 Part 9): Excel file of who worked, with bank details
router.get('/:id/payroll', requireAuth, requireRole('ADMIN'), exportPayroll);

module.exports = router;