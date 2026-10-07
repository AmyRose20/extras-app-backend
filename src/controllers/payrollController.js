const ExcelJS = require('exceljs');
const prisma = require('../config/db');
const { decrypt } = require('../utils/crypto');

// Payroll export: one Excel sheet per shoot day, listing everyone who WORKED it
// (accepted and not marked as a no-show), with what's needed to pay them.

const TIME_ZONE = 'Europe/Dublin'; // show times as they were on set, whatever the server's time zone
const HOUR = 60 * 60 * 1000;
const RED = 'FFDC2626';

// Every coordinator must be linked to a production. Returns the
// productionId, or sends a 403 and returns null if they aren't linked.
function requireProduction(req, res) {
  if (!req.user.productionId) {
    res.status(403).json({ error: 'Your account is not linked to a production' });
    return null;
  }
  return req.user.productionId;
}

// ----- Date/time formatting (Irish time) -----
function formatDate(date) {
  // "18/09/2026"
  return new Intl.DateTimeFormat('en-IE', {
    timeZone: TIME_ZONE, day: '2-digit', month: '2-digit', year: 'numeric',
  }).format(date);
}
function formatLongDate(date) {
  // "Friday 18 September 2026"
  return new Intl.DateTimeFormat('en-IE', {
    timeZone: TIME_ZONE, weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
  }).format(date).replace(',', '');
}
function formatTime(date) {
  // "07:00"
  return new Intl.DateTimeFormat('en-IE', {
    timeZone: TIME_ZONE, hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  }).format(date);
}
function fileDate(date) {
  // "2026-09-18" (for the file name)
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: TIME_ZONE, year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(date);
}

// "IE29AIBK93115212345678" → "IE29 AIBK 9311 5212 3456 78" (easier to read and check)
function groupIban(iban) {
  return iban.replace(/(.{4})/g, '$1 ').trim();
}

// "Bloodaxe season 2" → "bloodaxe-season-2"
function slug(text) {
  return text.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
}

// Builds the workbook from plain data (kept separate from the database code so it's easy to follow)
//   info:    { productionName, callTime, exportedAt, exportedBy, noShowCount }
//   workers: [{ name, phone, email, accountHolderName, iban, bic, finishedAt }]  (sorted A–Z)
function buildPayrollWorkbook(info, workers) {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'Extras App';

  const HEADER_ROW = 6;
  const sheet = workbook.addWorksheet('Payroll', {
    views: [{ state: 'frozen', ySplit: HEADER_ROW }], // header row stays visible when scrolling
  });

  // Column widths (no headers here — the header row is row 6, under the summary)
  sheet.columns = [
    { width: 5 },  // #
    { width: 24 }, // Name
    { width: 15 }, // Phone
    { width: 28 }, // Email
    { width: 26 }, // Account holder name
    { width: 30 }, // IBAN
    { width: 13 }, // BIC
    { width: 12 }, // Date
    { width: 10 }, // Call time
    { width: 12 }, // Finish time
    { width: 8 },  // Hours
  ];

  // ----- Summary at the top -----
  const missingBank = workers.filter((w) => !w.iban).length;
  const summaryParts = [`${workers.length} extra${workers.length === 1 ? '' : 's'} to pay`];
  if (info.noShowCount > 0) {
    summaryParts.push(`${info.noShowCount} no-show${info.noShowCount === 1 ? '' : 's'} not included`);
  }
  if (missingBank > 0) {
    summaryParts.push(`${missingBank} missing bank details`);
  }

  sheet.getCell('A1').value = `Payroll – ${info.productionName}`;
  sheet.getCell('A1').font = { bold: true, size: 14 };

  const summaryRows = [
    ['Shoot day:', `${formatLongDate(info.callTime)}, call time ${formatTime(info.callTime)}`],
    ['Exported:', `${formatDate(info.exportedAt)} ${formatTime(info.exportedAt)} by ${info.exportedBy}`],
    ['Summary:', summaryParts.join(' · ')],
  ];
  summaryRows.forEach(([label, value], i) => {
    const row = sheet.getRow(2 + i);
    row.getCell(1).value = label;
    row.getCell(1).font = { bold: true };
    row.getCell(3).value = value; // starts in column C so the labels have room
  });
  // Merge A:B for the labels so they aren't squashed into the narrow "#" column
  [2, 3, 4].forEach((r) => sheet.mergeCells(r, 1, r, 2));

  // ----- Header row -----
  const header = sheet.getRow(HEADER_ROW);
  header.values = [
    '#', 'Name', 'Phone', 'Email', 'Account holder name', 'IBAN', 'BIC',
    'Date', 'Call time', 'Finish time', 'Hours',
  ];
  header.eachCell((cell) => {
    cell.font = { bold: true };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE5E7EB' } };
    cell.border = { bottom: { style: 'thin', color: { argb: 'FF9CA3AF' } } };
  });

  // ----- One row per extra who worked -----
  const markMissing = (cell, text) => {
    cell.value = text;
    cell.font = { bold: true, color: { argb: RED } };
  };

  workers.forEach((w, index) => {
    const row = sheet.addRow([
      index + 1,
      w.name,
      w.phone || '', // stored as text, so the leading 0 is kept
      w.email || '',
      w.accountHolderName,
      w.iban ? groupIban(w.iban) : null,
      w.bic,
      formatDate(info.callTime),
      formatTime(info.callTime),
      w.finishedAt ? formatTime(w.finishedAt) : null,
      w.finishedAt ? Math.round(((w.finishedAt - info.callTime) / HOUR) * 100) / 100 : null,
    ]);

    if (!w.iban) {
      markMissing(row.getCell(5), 'Not provided');
      markMissing(row.getCell(6), 'Not provided');
      markMissing(row.getCell(7), 'Not provided');
    }
    if (!w.finishedAt) {
      markMissing(row.getCell(10), 'Not recorded');
    }
    row.getCell(11).numFmt = '0.00';
  });

  return workbook;
}

// GET /shoot-days/:id/payroll — an ADMIN downloads the payroll sheet for a shoot day
// on THEIR production that has already started. Every export is logged (it contains bank details).
async function exportPayroll(req, res) {
  try {
    const productionId = requireProduction(req, res);
    if (!productionId) return;

    const shootDay = await prisma.shootDay.findFirst({
      where: { id: req.params.id, productionId },
      include: { production: { select: { name: true } } },
    });
    if (!shootDay) {
      return res.status(404).json({ error: 'Shoot day not found' });
    }
    if (new Date(shootDay.date) > new Date()) {
      return res.status(400).json({ error: 'Payroll can only be exported once the shoot day has started' });
    }

    // Everyone who accepted (worked) + how many no-shows were left out
    const [accepted, noShowCount, coordinator] = await Promise.all([
      prisma.callInvite.findMany({
        where: { status: 'ACCEPTED', callRequest: { shootDayId: shootDay.id } },
        include: { extraProfile: { include: { user: { select: { name: true, email: true, phone: true } } } } },
      }),
      prisma.callInvite.count({
        where: { status: 'NO_SHOW', callRequest: { shootDayId: shootDay.id } },
      }),
      prisma.user.findUnique({ where: { id: req.user.userId }, select: { name: true } }),
    ]);

    // One row per extra (in case someone accepted two call requests on the same day)
    const seen = new Set();
    const workers = [];
    for (const invite of accepted) {
      if (seen.has(invite.extraProfileId)) continue;
      seen.add(invite.extraProfileId);

      const p = invite.extraProfile;
      const hasBank = !!p.ibanEncrypted;
      workers.push({
        name: p.user.name,
        phone: p.phoneNumber || p.user.phone,
        email: p.contactEmail || p.user.email,
        accountHolderName: hasBank ? p.accountHolderName || p.user.name : null,
        iban: hasBank ? decrypt(p.ibanEncrypted) : null,
        bic: hasBank ? decrypt(p.bicEncrypted) : null,
        finishedAt: invite.finishedAt || shootDay.estimatedWrapAt || null,
      });
    }
    workers.sort((a, b) => a.name.localeCompare(b.name));

    const workbook = buildPayrollWorkbook(
      {
        productionName: shootDay.production.name,
        callTime: new Date(shootDay.date),
        exportedAt: new Date(),
        exportedBy: coordinator?.name ?? 'Coordinator',
        noShowCount,
      },
      workers
    );

    console.log(`Payroll exported: shoot day ${shootDay.id} by coordinator ${req.user.userId} at ${new Date().toISOString()}`);

    const fileName = `payroll_${slug(shootDay.production.name)}_${fileDate(new Date(shootDay.date))}.xlsx`;
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
    await workbook.xlsx.write(res);
    return res.end();
  } catch (err) {
    console.error(err);
    if (!res.headersSent) {
      return res.status(500).json({ error: 'Something went wrong exporting payroll' });
    }
    return res.end();
  }
}

module.exports = { exportPayroll, buildPayrollWorkbook };