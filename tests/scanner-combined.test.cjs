'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const source = fs.readFileSync(path.join(__dirname, '..', 'apps-script/Code.gs'), 'utf8');
const headers = ['Gateway student name', 'Student ID', 'Student ticket #', 'Grade',
  'Bringing guest?', 'Guest name', 'Guest form submitted?', 'Guest ID uploaded?',
  'School email received?', 'Guest ticket #'];
const blank = () => Array(10).fill('');
const student = (overrides = {}) => {
  const row = ['Fictional Student', 'SID-001', '001', 12, 'No', '', '', '', '', ''];
  for (const [column, value] of Object.entries(overrides)) row[Number(column)] = value;
  return row;
};
const intake = (...rows) => [
  ['Fictional intake title', ...Array(9).fill('')], blank(), blank(), blank(), headers.slice(), ...rows,
];
function freeze(value) {
  if (value && typeof value === 'object') {
    for (const key of Reflect.ownKeys(value)) freeze(value[key]);
    Object.freeze(value);
  }
  return value;
}
function backend() {
  const applicationEffects = [], serializations = [];
  const refusedService = name => new Proxy({}, {
    get(_, key) { applicationEffects.push(name + '.' + String(key)); throw Error('APPLICATION_SERVICE_REFUSED'); },
  });
  const context = vm.createContext({
    Session: refusedService('Session'), PropertiesService: refusedService('PropertiesService'),
    SpreadsheetApp: refusedService('SpreadsheetApp'), LockService: refusedService('LockService'),
    Utilities: refusedService('Utilities'),
    fetch() { throw Error('NETWORK_REFUSED'); }, XMLHttpRequest() { throw Error('NETWORK_REFUSED'); },
    WebSocket() { throw Error('NETWORK_REFUSED'); },
    navigator: { mediaDevices: { getUserMedia() { throw Error('CAMERA_REFUSED'); } } },
    ContentService: { MimeType: { JSON: 'json' }, createTextOutput(value) {
      serializations.push(value);
      return { value, setMimeType() { return this; } };
    } },
  }, { codeGeneration: { strings: false, wasm: false } });
  const run = code => vm.runInContext(code, context, { timeout: 1500 });
  run(source);
  return {
    applicationEffects, serializations,
    project(values) {
      assert.equal(run('typeof projectCombinedIntake_'), 'function', 'Read-only projection is not implemented');
      context.values = values;
      return JSON.parse(JSON.stringify(run('projectCombinedIntake_(values)')));
    },
    request(method, payload, params = {}) {
      context.event = method === 'GET' ? { parameter: payload } : {
        parameter: params, postData: { contents: JSON.stringify(payload) },
      };
      return JSON.parse(run(method === 'GET' ? 'doGet(event).value' : 'doPost(event).value'));
    },
    requestEvent(method, event) {
      context.event = event;
      return JSON.parse(run(method === 'GET' ? 'doGet(event).value' : 'doPost(event).value'));
    },
    run,
  };
}
function refusesProjection(values) {
  const b = backend(), before = structuredClone(values);
  // A missing helper must fail the test rather than satisfy the rejection assertion.
  assert.equal(typeof b.project, 'function');
  assert.throws(() => b.project(values), /^Error: Combined intake:/);
  assert.deepEqual(values, before, 'failure must not mutate the intake');
  assert.deepEqual(b.applicationEffects, []);
  assert.equal(b.serializations.length, 0, 'pure projection must not use HTTP services');
}

test('projection preserves leading-zero independent tickets and full names without authority', () => {
  const b = backend();
  const values = intake(student({ 0: 'Fictional \u00c9loise O\u2019Neil-Smith', 4: 'Yes',
    5: 'Fictional Jean Paul', 6: true, 7: 0, 8: 'Yes', 9: '001Z' }));
  const result = b.project(freeze(values));
  assert.deepEqual(result, { readOnly: true, admissionEnabled: false, subjects: [
    { personType: 'Student', ticketId: '001', sourceStudentId: 'SID-001',
      fullName: 'Fictional \u00c9loise O\u2019Neil-Smith', sourceRow: 6 },
    { personType: 'Guest', ticketId: '001Z', sourceStudentId: 'SID-001',
      fullName: 'Fictional Jean Paul', sourceRow: 6 },
  ] });
  assert.deepEqual(b.applicationEffects, []);
  assert.equal(b.serializations.length, 0);
});
test('full-name spacing is preserved and no guest is derived from a ticket suffix', () => {
  const result = backend().project(intake(student({ 0: '  Fictional One Name  ', 2: '001B',
    6: 'Yes', 7: 'Yes', 8: 'Yes' })));
  assert.deepEqual(result.subjects, [{ personType: 'Student', ticketId: '001B', sourceStudentId: 'SID-001',
    fullName: '  Fictional One Name  ', sourceRow: 6 }]);
  assert.equal(result.admissionEnabled, false);
});
test('case-sensitive parent IDs and tickets remain distinct', () => {
  const result = backend().project(intake(student(), student({ 1: 'sid-001', 2: '001b' })));
  assert.deepEqual(result.subjects.map(p => p.ticketId), ['001', '001b']);
  assert.deepEqual(result.subjects.map(p => p.sourceStudentId), ['SID-001', 'sid-001']);
});
test('guest ticket is not required to be student ticket plus B', () => {
  const result = backend().project(intake(student({ 4: 'Yes', 5: 'Fictional Guest', 9: 'GUEST-X' })));
  assert.equal(result.subjects[1].ticketId, 'GUEST-X');
  assert.equal(result.subjects[1].sourceRow, 6);
});
test('empty trailing rows are ignored without changing source row numbers', () => {
  const result = backend().project(intake(student(), student({ 1: 'SID-002', 2: '002' }), blank(), blank()));
  assert.deepEqual(result.subjects.map(p => p.sourceRow), [6, 7]);
});
test('header-only intake yields an explicitly non-admitting empty projection', () => {
  assert.deepEqual(backend().project(intake()), { readOnly: true, admissionEnabled: false, subjects: [] });
});
test('empty guest declaration without a guest is accepted', () => {
  assert.equal(backend().project(intake(student({ 4: '' }))).subjects.length, 1);
});
test('empty extra columns are allowed but never projected', () => {
  const values = intake(student());
  values[4].push(''); values[5].push(null);
  assert.equal(backend().project(values).subjects.length, 1);
});
test('frozen raw values and formula metadata remain byte/type-identical', () => {
  const values = intake(student({ 4: 'Yes', 5: 'Fictional Guest', 6: true, 7: 0,
    8: '=FICTIONAL_FORMULA_SENTINEL()', 9: '001B' }));
  values.formulaMetadata = { J6: '=C6&"B"', expectedComputedValue: '001B' };
  values[5].formulaMetadata = { type: 'raw-formula-sentinel' };
  const before = structuredClone(values);
  freeze(values);
  const result = backend().project(values);
  assert.deepEqual(values, before);
  assert.equal(values[5][6], true); assert.equal(values[5][7], 0);
  assert.equal(result.subjects[1].ticketId, '001B');
  assert.equal(values.formulaMetadata.J6, '=C6&"B"');
});

const badHeaders = [
  ['wrong row', v => { v[3] = v[4]; v[4] = blank(); }],
  ['missing header', v => { v[4][2] = ''; }],
  ['duplicate header', v => { v[4][2] = v[4][1]; }],
  ['reordered headers', v => { [v[4][0], v[4][1]] = [v[4][1], v[4][0]]; }],
  ['padded header', v => { v[4][0] += ' '; }],
  ['unknown extra header', v => { v[4].push('Status'); }],
  ['populated extra cell', v => { v[4].push(''); v[5].push(0); }],
  ['short header row', v => { v[4].pop(); }],
  ['short data row', v => { v[5].pop(); }],
];
for (const [name, mutate] of badHeaders) {
  test('projection refuses ' + name, () => { const v = intake(student()); mutate(v); refusesProjection(v); });
}
for (const [name, value] of [['null input', null], ['object input', {}], ['string input', 'intake'],
  ['no header', []], ['object row', [...intake(), {}]], ['null row', [...intake(), null]],
  ['object cell', intake(student({ 3: {} }))], ['array cell', intake(student({ 3: [] }))],
  ['non-finite cell', intake(student({ 3: Infinity }))]]) {
  test('projection refuses malformed ' + name, () => refusesProjection(value));
}
test('sparse data rows are refused instead of becoming blank cells', () => {
  const values = intake(student()); delete values[5][3]; refusesProjection(values);
});
test('sparse outer array is refused', () => {
  const values = intake(student()); delete values[1]; refusesProjection(values);
});
test('undefined raw cells are refused', () => refusesProjection(intake(student({ 3: undefined }))));
test('interior blank row prevents any partial projection', () => {
  refusesProjection(intake(student(), blank(), student({ 1: 'SID-002', 2: '002' })));
});
test('invalid later subject prevents a partial earlier projection', () => {
  refusesProjection(intake(student(), student({ 1: 'SID-002', 2: '' })));
});
for (const [column, label] of [[1, 'student ID'], [2, 'student ticket'], [9, 'guest ticket']]) {
  for (const [name, value] of [['numeric', 1], ['boolean', true], ['object', {}], ['array', []],
    ['blank', ''], ['null', null], ['padded', ' 001'], ['trailing whitespace', '001\t'],
    ['control', '00\u00011'], ['C1 control', '00\u00851'], ['Unicode padding', '\u00a0001']]) {
    test(`${label} refuses ${name} raw identity`, () => {
      const overrides = column === 9 ? { 4: 'Yes', 5: 'Fictional Guest', 9: value } : { [column]: value };
      refusesProjection(intake(student(overrides)));
    });
  }
}
for (const [name, mutate] of [
  ['missing student name', v => { v[5][0] = ''; }],
  ['nonstring student name', v => { v[5][0] = 42; }],
  ['Yes without guest name', v => { v[5][4] = 'Yes'; v[5][9] = '001B'; }],
  ['Yes without guest ticket', v => { v[5][4] = 'Yes'; v[5][5] = 'Fictional Guest'; }],
  ['nonstring guest name', v => { v[5][4] = 'Yes'; v[5][5] = 42; v[5][9] = '001B'; }],
  ['No with guest name', v => { v[5][5] = 'Fictional Guest'; }],
  ['No with guest ticket', v => { v[5][9] = '001B'; }],
  ['empty declaration with guest', v => { v[5][4] = ''; v[5][5] = 'Fictional Guest'; }],
  ['unknown guest declaration', v => { v[5][4] = 'Maybe'; }],
  ['lowercase guest declaration', v => { v[5][4] = 'yes'; }],
  ['boolean guest declaration', v => { v[5][4] = true; }],
  ['duplicate student source ID', v => { v.push(student({ 2: '002' })); }],
  ['duplicate student ticket', v => { v.push(student({ 1: 'SID-002' })); }],
  ['duplicate student and own guest ticket', v => { v[5][4] = 'Yes'; v[5][5] = 'Fictional Guest'; v[5][9] = '001'; }],
  ['cross-role duplicate ticket', v => { v.push(student({ 1: 'SID-002', 2: '002', 4: 'Yes', 5: 'Fictional Guest', 9: '001' })); }],
  ['duplicate guest tickets', v => { v[5][4] = 'Yes'; v[5][5] = 'Fictional Guest'; v[5][9] = 'G-X'; v.push(student({ 1: 'SID-002', 2: '002', 4: 'Yes', 5: 'Fictional Other Guest', 9: 'G-X' })); }],
]) {
  test('whole projection rejects ' + name, () => { const v = intake(student()); mutate(v); refusesProjection(v); });
}

for (const method of ['GET', 'POST']) {
  for (const action of ['list', 'admit', 'assignQrIds', 'setTestMode']) {
    for (const location of ['top', 'object config', 'JSON config']) {
      test(`${method} ${action} with ${location} combined adapter is disabled before services`, () => {
        const b = backend();
        const payload = { action, qrValue: '001', testMode: false };
        if (location === 'top') payload.adapter = 'combined-intake-v1';
        else payload.config = location === 'object config' ? { adapter: 'combined-intake-v1' }
          : '{"adapter":"combined-intake-v1"}';
        const result = b.request(method, payload);
        assert.match(result.error, /combined.*disabled/i);
        assert.deepEqual(b.applicationEffects, [], 'refusal must precede buildConfig and application services');
        assert.equal(b.serializations.length, 1);
        assert.equal(result.row, undefined); assert.equal(result.rows, undefined);
      });
    }
  }
}
for (const [name, payload, params] of [
  ['unknown adapter', { adapter: 'future-v1' }],
  ['blank adapter', { adapter: '' }],
  ['null adapter', { adapter: null }],
  ['boolean adapter', { adapter: false }],
  ['numeric adapter', { adapter: 3 }],
  ['object adapter', { adapter: {} }],
  ['array adapter', { adapter: [] }],
  ['padded adapter', { adapter: ' combined-intake-v1' }],
  ['nested unknown adapter', { config: { adapter: 'future-v1' } }],
  ['nested malformed adapter', { config: { adapter: null } }],
  ['JSON malformed adapter', { config: '{"adapter":false}' }],
  ['malformed JSON config', { config: '{"adapter":' }],
  ['conflicting top and nested', { adapter: 'combined-intake-v1', config: { adapter: 'future-v1' } }],
  ['parameter declaration shadowed by POST body', { adapter: undefined }, { adapter: 'combined-intake-v1' }],
  ['parameter config shadowed by POST body', { config: {} }, { config: '{"adapter":"combined-intake-v1"}' }],
]) {
  test('explicit ' + name + ' is refused without services', () => {
    const b = backend();
    const result = b.request('POST', { action: 'admit', qrValue: '001', ...payload }, params);
    assert.ok(result.error); assert.doesNotMatch(result.error, /APPLICATION_SERVICE_REFUSED/);
    assert.deepEqual(b.applicationEffects, []); assert.equal(result.row, undefined);
  });
}
test('runtime network and camera are refused before source invocation', () => {
  const b = backend();
  assert.throws(() => b.run('fetch("https://fictional.invalid")'), /NETWORK_REFUSED/);
  assert.throws(() => b.run('navigator.mediaDevices.getUserMedia({})'), /CAMERA_REFUSED/);
});
test('literal prototype-like tickets and IDs have no dictionary aliases', () => {
  const result = backend().project(intake(student({ 1: 'constructor', 2: '__proto__' }),
    student({ 1: '__proto__', 2: 'toString' })));
  assert.deepEqual(result.subjects.map(p => [p.sourceStudentId, p.ticketId]),
    [['constructor', '__proto__'], ['__proto__', 'toString']]);
});
test('null empty guest cells and trailing rows stay empty without coercion', () => {
  const result = backend().project(intake(student({ 4: null, 5: null, 9: null }), Array(10).fill(null)));
  assert.equal(result.subjects.length, 1);
});
for (const [name, payload] of [
  ['unknown', { adapter: 'future-v1' }],
  ['malformed', { adapter: false }],
  ['conflicting', { adapter: 'combined-intake-v1', config: '{"adapter":"future-v1"}' }],
]) {
  test('GET ' + name + ' adapter is refused before application services', () => {
    const b = backend();
    assert.ok(b.request('GET', { action: 'list', ...payload }).error);
    assert.deepEqual(b.applicationEffects, []);
  });
}
test('multiple query declarations cannot hide combined mode', () => {
  const b = backend();
  const result = b.requestEvent('GET', { parameter: { action: 'admit' },
    parameters: { adapter: ['combined-intake-v1', 'future-v1'] } });
  assert.match(result.error, /adapter|disabled/i);
  assert.deepEqual(b.applicationEffects, []);
});
test('multiple query configs cannot hide combined mode', () => {
  const b = backend();
  const result = b.requestEvent('GET', { parameter: { action: 'list' },
    parameters: { config: ['{}', '{"adapter":"combined-intake-v1"}'] } });
  assert.match(result.error, /combined.*disabled/i);
  assert.deepEqual(b.applicationEffects, []);
});
test('no-adapter whitespace-only POST preserves the existing generic route', () => {
  const b = backend();
  const result = b.requestEvent('POST', { parameter: { action: 'list' }, postData: { contents: ' \n\t' } });
  assert.match(result.error, /APPLICATION_SERVICE_REFUSED/);
  assert.deepEqual(b.applicationEffects, ['Session.getScriptTimeZone']);
});
test('an explicitly empty query adapter array is malformed rather than generic', () => {
  const b = backend();
  const result = b.requestEvent('GET', { parameter: { action: 'list' }, parameters: { adapter: [] } });
  assert.match(result.error, /adapter|disabled/i);
  assert.deepEqual(b.applicationEffects, []);
});
test('production combined refusal never invokes the pure projection', () => {
  const b = backend();
  b.run('projectCombinedIntake_ = function () { throw Error("PROJECTION_MUST_NOT_RUN"); };');
  const result = b.request('POST', { action: 'list', config: { adapter: 'combined-intake-v1' } });
  assert.match(result.error, /combined.*disabled/i);
  assert.deepEqual(b.applicationEffects, []);
});
for (const location of ['row', 'cell']) {
  test('raw ' + location + ' accessors are refused without evaluating their code', () => {
    const b = backend(), values = intake(student());
    let getterCalls = 0;
    Object.defineProperty(location === 'row' ? values : values[5], location === 'row' ? '5' : '1', {
      configurable: true, get() { getterCalls++; return location === 'row' ? student() : 'SID-001'; },
    });
    assert.throws(() => b.project(values), /^Error: Combined intake:/);
    assert.equal(getterCalls, 0, 'raw cell validation must not execute accessors');
    assert.deepEqual(b.applicationEffects, []);
  });
}
