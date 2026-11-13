const { test } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { mkdtempSync, rmSync } = require('node:fs');
const { tmpdir } = require('node:os');
const ts = require('typescript');
const out = mkdtempSync(path.join(tmpdir(), 'hisaab-calendar-'));
const program = ts.createProgram(['src/lib/calendar/samayamiiti.ts', 'src/lib/calendar/fiscal-year.ts'], { outDir: out, module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2017, strict: true, skipLibCheck: true });
const diagnostics = ts.getPreEmitDiagnostics(program);
assert.equal(diagnostics.length, 0, ts.formatDiagnosticsWithColorAndContext(diagnostics, { getCanonicalFileName: p => p, getCurrentDirectory: () => process.cwd(), getNewLine: () => '\n' }));
program.emit();
const c = require(path.join(out, 'samayamiiti.js'));
const f = require(path.join(out, 'fiscal-year.js'));
const { CALENDAR_DATA } = require(path.join(out, 'calendar-data.js'));
process.on('exit', () => rmSync(out, { recursive: true, force: true }));
test('independently known anchors and requested examples', () => {
  for (const [ad, bs] of [['1943-04-14','2000-01-01'],['2024-04-13','2081-01-01'],['2024-07-16','2081-04-01'],['2024-10-16','2081-06-30'],['2024-08-15','2081-04-31']]) {
    assert.equal(c.adToBs(ad).formatted, bs);
    assert.equal(c.bsToAd(...bs.split('-').map(Number)).toISOString().slice(0,10), ad);
  }
  assert.equal(c.formatDualDate('2024-08-15'), '2024-08-15 AD (2081-04-31 BS)');
  assert.equal(c.formatNepaliDate(2081,4,31), '2081 Shrawan 31');
  assert.equal(c.formatNepaliDate(2081,4,31,'np'), '२०८१ साउन ३१');
});
test('all 96 years: every BS day round-trips and advances one AD day', () => {
  let last = null, count = 0;
  for (let y=2000;y<=2095;y++) {
    assert.equal(CALENDAR_DATA[y].length,12);
    for(let m=1;m<=12;m++) {
      const days = c.getDaysInBsMonth(y,m); assert.ok(days>=29 && days<=32);
      for(let d=1;d<=days;d++) {
        const ad=c.bsToAd(y,m,d); const bs=c.adToBs(ad);
        assert.deepEqual([bs.year,bs.month,bs.day],[y,m,d]);
        if(last!==null) assert.equal(ad.getTime()-last,86400000);
        last=ad.getTime(); count++;
      }
    }
  }
  console.info(`Verified ${count} consecutive days`);
});
test('fiscal boundaries, inclusive range, VAT rollover', () => {
  assert.equal(f.getNepaliFiscalYear('2081-04-01'),'2081/82');
  assert.equal(f.getNepaliFiscalYear('2081-03-31'),'2080/81');
  assert.equal(f.getNepaliFiscalYear('2081-01-15'),'2080/81');
  const range=f.getFiscalYearDateRange('2081/82');
  assert.equal(range.startBS,'2081-04-01'); assert.equal(range.endBS,'2082-03-32');
  assert.equal(range.startAD.toISOString().slice(0,10),'2024-07-16');
  assert.equal(range.endAD.toISOString().slice(0,10),'2025-07-16');
  assert.equal(f.getVatFilingDeadline(2081,12).deadlineBS,'2082-01-25');
  assert.equal(f.getVatFilingDeadline(2081,6).deadlineBS,'2081-07-25');
  assert.equal(c.adToBs(f.getVatFilingDeadline(2081,6).deadlineAD).formatted,'2081-07-25');
});
test('NST midnight and strict invalid-date boundaries', () => {
  assert.equal(c.adToBs('2024-07-15T18:14:59Z').formatted,'2081-03-31');
  assert.equal(c.adToBs('2024-07-15T18:15:00Z').formatted,'2081-04-01');
  for (const input of ['2024-02-30','2023-02-29','garbage','2024-07-16T00:00:00','1943-04-13','2099-01-01',new Date(NaN)]) assert.throws(()=>c.adToBs(input),RangeError);
  for(const args of [[1999,1,1],[2096,1,1],[2081,0,1],[2081,13,1],[2081,4,0],[2081,4,33],[2081,1.5,1],[2081,1,NaN]]) assert.throws(()=>c.bsToAd(...args),RangeError);
  for(const fy of ['2081/83','2081','2095/96','1999/00']) assert.throws(()=>f.getFiscalYearDateRange(fy),RangeError);
  assert.throws(()=>f.getVatFilingDeadline(2095,12),RangeError);
  assert.throws(()=>f.getNepaliFiscalYear('2081-02-33'),RangeError);
});
