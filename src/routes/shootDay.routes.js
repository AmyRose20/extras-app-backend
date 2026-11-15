const express = require('express');
const { requireAuth, requireRole, requireProduction } = require('../middleware/auth');
const { createShootDay, getShootDays, getShootDay, updateShootDay, createShootDaysBulk } = require('../controllers/shootDayController');
const { getAttendance, updateAttendance, setFinishTimeForAll } = require('../controllers/attendanceController');
const { exportPayroll } = require('../controllers/payrollController');

const router = express.Router();

router.post('/', requireAuth, requireRole('ADMIN'), requireProduction, createShootDay);
router.post('/bulk', requireAuth, requireRole('ADMIN'), requireProduction, createShootDaysBulk);
router.get('/', requireAuth, requireRole('ADMIN'), requireProduction, getShootDays);
router.get('/:id', requireAuth, requireRole('ADMIN'), requireProduction, getShootDay);
router.patch('/:id', requireAuth, requireRole('ADMIN'), requireProduction, updateShootDay);

// Attendance (Phase 3 Part 9): no-shows + finish times, once the shoot day has started
router.get('/:id/attendance', requireAuth, requireRole('ADMIN'), requireProduction, getAttendance);
router.patch('/:id/attendance/:inviteId', requireAuth, requireRole('ADMIN'), requireProduction, updateAttendance);
router.patch('/:id/finish-time', requireAuth, requireRole('ADMIN'), requireProduction, setFinishTimeForAll);
// Payroll export (Phase 3 Part 9): Excel file of who worked, with bank details
router.get('/:id/payroll', requireAuth, requireRole('ADMIN'), requireProduction, exportPayroll);

module.exports = router;