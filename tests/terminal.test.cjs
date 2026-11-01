const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

// Exercise the real controller with a deterministic clock. The regression depends
// on overlapping timers, so it shouldn't depend on how quickly a browser clicks.
function terminal({ returning = false, hash = '', overflow = false, reducedMotion = false,
  storage = {}, storageBlocked = false } = {}) {
  let now = 0, serial = 0;
  const typedPages = [];
  if (returning) storage['robco-visited'] = '1';
  const timers = new Map();
  function setTimer(fn, delay) {
    const id = ++serial;
    timers.set(id, { at: now + delay, fn });
    return id;
  }
  function element(id) {
    const classes = new Set();
    const el = {
      id, classes, style: {}, attrs: {}, listeners: {}, children: [], nodes: {}, hidden: false,
      textContent: '', clientWidth: 320, clientHeight: 300, scrollHeight: 300, scrollTop: 0,
      classList: {
        add(...names) { names.forEach(name => classes.add(name)); },
        remove(...names) { names.forEach(name => classes.delete(name)); },
        toggle(name, active) { if (active) classes.add(name); else classes.delete(name); }
      },
      addEventListener(type, listener) { (this.listeners[type] ||= []).push(listener); },
      dispatch(type, event = {}) {
        for (const listener of this.listeners[type] || []) listener({ type, target: this, preventDefault() {}, ...event });
      },
      setAttribute(name, value) { this.attrs[name] = String(value); },
      removeAttribute(name) { delete this.attrs[name]; },
      getBoundingClientRect() { return { left: 0, top: 0, right: 320, width: 320, height: 300 }; },
      querySelectorAll() { return []; },
      querySelector(selector) { return this.nodes[selector] ||= element('child'); },
      appendChild(child) { this.children.push(child); },
      focus() {}
    };
    Object.defineProperty(el, 'innerHTML', { set() { this.children = []; this.nodes = {}; } });
    return el;
  }
  const ids = Object.fromEntries([
    'screen', 'monitor', 'boot', 'term', 'menu', 'content', 'power', 'power-msg',
    'scrollbar', 'scroll-thumb', 'about', 'experience', 'projects', 'education', 'contact'
  ].map(id => [id, element(id)]));
  ids.screen.classes.add('off');
  if (overflow) ids.content.scrollHeight = 1000;
  const pages = ['about', 'experience', 'projects', 'education', 'contact'].map(id => ids[id]);
  const docListeners = {};
  const doc = {
    hidden: false,
    getElementById(id) { return ids[id] || null; },
    querySelector() { return element('crt'); },
    querySelectorAll(selector) { return selector === '.page' ? pages : []; },
    addEventListener(type, fn) { (docListeners[type] ||= []).push(fn); },
    dispatch(type, event) { for (const fn of docListeners[type] || []) fn({ type, ...event }); },
    createElement() { return element('created'); },
    createRange() {
      let node;
      return {
        selectNodeContents(el) { node = el; },
        getBoundingClientRect() { return { width: node.textContent.length * 8 }; }
      };
    }
  };
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, '..', 'terminal.js'), 'utf8'), {
    document: doc, location: { hash },
    window: {
      matchMedia() { return { matches: reducedMotion }; }, addEventListener() {},
      CRT: { create() { return { type(el) { typedPages.push(el.id); return () => {}; } }; } }
    },
    localStorage: {
      getItem(key) { if (storageBlocked) throw new Error('Storage blocked'); return storage[key] || null; },
      setItem(key, value) { if (storageBlocked) throw new Error('Storage blocked'); storage[key] = value; }
    },
    performance: { now() { return now; } }, navigator: { platform: 'Windows' },
    Intl: { DateTimeFormat() { return { resolvedOptions() { return { timeZone: 'Europe/London' }; } }; } },
    Date, setTimeout: setTimer, clearTimeout(id) { timers.delete(id); },
    requestAnimationFrame(fn) { return setTimer(() => fn(now), 16); },
    cancelAnimationFrame(id) { timers.delete(id); }
  });
  return {
    ids, document: doc, storage, typedPages,
    advance(until) {
      while (true) {
        const next = [...timers].filter(([, timer]) => timer.at <= until).sort((a, b) => a[1].at - b[1].at)[0];
        if (!next) break;
        timers.delete(next[0]);
        now = next[1].at;
        next[1].fn();
      }
      now = until;
    }
  };
}

test('starts dark and warms the backlight before boot text', () => {
  const { ids, advance } = terminal();
  assert.ok(ids.screen.classes.has('off'));
  advance(400);
  assert.ok(ids.screen.classes.has('warming'));
  assert.ok(ids.screen.classes.has('booting'));
  assert.ok(ids.term.hidden);
  advance(1100);
  assert.ok(!ids.screen.classes.has('warming'));
  assert.ok(!ids.boot.hidden);
});

test('using the sound switch with the keyboard does not skip boot', () => {
  const { ids, advance, document } = terminal();
  advance(1200);
  document.dispatch('keydown', { key: 'Enter', target: { id: 'sound-toggle' } });
  assert.ok(ids.term.hidden);
  assert.ok(!ids.boot.hidden);
  document.dispatch('keydown', { key: 'Enter', target: ids.screen });
  assert.ok(!ids.term.hidden);
});

test('modifier keys and Tab do not skip the first-visit boot', () => {
  const { ids, advance, document } = terminal();
  advance(1200);
  for (const key of ['Tab', 'Shift', 'Control', 'Alt', 'Meta']) {
    document.dispatch('keydown', { key, target: ids.screen });
    assert.ok(ids.term.hidden, `${key} must leave boot running`);
  }
  document.dispatch('keydown', { key: 'a', target: ids.screen });
  assert.ok(!ids.term.hidden);
});

test('rapid off/on cannot be shut down by the old timer', () => {
  const { ids, advance } = terminal({ returning: true });
  advance(1200);
  ids.screen.dispatch('click'); // finish the initial boot before cycling power
  ids.power.dispatch('click');
  advance(1300);
  ids.power.dispatch('click');
  advance(2000);
  ids.screen.dispatch('click'); // skip the reboot
  advance(5000);
  assert.ok(!ids.screen.classes.has('off'));
  assert.ok(!ids.screen.classes.has('powering-off'));
  assert.ok(ids.monitor.classes.has('on'));
  assert.equal(ids.power.attrs['aria-pressed'], 'true');
  assert.ok(!ids.term.hidden);
});

test('pressing power before auto-start does not start a second boot', () => {
  const { ids, advance } = terminal();
  advance(100);
  ids.power.dispatch('click');
  advance(900);
  assert.equal(ids.boot.children.length, 11); // ROM, memory, three devices, five checks and bar
  ids.screen.dispatch('click');
  advance(1200);
  assert.ok(!ids.term.hidden);
  assert.ok(ids.boot.hidden);
});

test('hashes for non-page elements fall back to About', () => {
  const { ids, advance } = terminal({ returning: true, hash: '#monitor' });
  advance(1200);
  ids.screen.dispatch('click');
  assert.ok(ids.about.classes.has('active'));
});

test('loading bar reaches the step-list width and completes at 100%', () => {
  const { ids, advance } = terminal();
  advance(4900);
  const bar = ids.boot.children.find(child => child.className === 'bar');
  assert.equal(bar.textContent.length * 8, ids.boot.clientWidth);
  assert.equal(bar.attrs['aria-valuenow'], '100');
  assert.match(bar.textContent, /^\[=+\]$/);
});

test('welcome stays visible for four seconds after its last line', () => {
  const { ids, advance } = terminal();
  advance(7500);
  assert.ok(ids.term.hidden);
  advance(11499);
  assert.ok(!ids.boot.hidden);
  advance(11500);
  assert.ok(ids.boot.hidden);
  assert.ok(!ids.term.hidden);
});

test('overflow scrollbar supports End/Home and hides on power-off', () => {
  const { ids, advance } = terminal({ returning: true, overflow: true });
  advance(1200);
  ids.screen.dispatch('click');
  advance(1220);
  assert.ok(!ids.scrollbar.hidden);
  assert.equal(ids.scrollbar.attrs['aria-valuemax'], '700');
  ids.scrollbar.dispatch('keydown', { key: 'End' });
  advance(1240);
  assert.equal(ids.content.scrollTop, 700);
  assert.equal(ids.scrollbar.attrs['aria-valuenow'], '700');
  ids.scrollbar.dispatch('keydown', { key: 'Home' });
  assert.equal(ids.content.scrollTop, 0);
  ids.power.dispatch('click');
  assert.ok(ids.scrollbar.hidden);
});

test('return visits briefly warm the backlight then open the linked page without typing', () => {
  const { ids, advance, typedPages } = terminal({ returning: true, hash: '#education' });
  advance(100);
  assert.ok(ids.screen.classes.has('warming'));
  assert.ok(ids.boot.hidden);
  assert.ok(ids.term.hidden);
  advance(799);
  assert.ok(ids.term.hidden);
  advance(800);
  assert.ok(!ids.screen.classes.has('warming'));
  assert.ok(!ids.screen.classes.has('booting'));
  assert.ok(ids.education.classes.has('active'));
  assert.ok(ids.boot.hidden);
  assert.ok(!ids.term.hidden);
  assert.equal(ids.boot.children.length, 0);
  assert.deepEqual(typedPages, []);
  advance(12000);
  assert.ok(!ids.term.hidden); // No delayed BIOS timers can replace the file.
});

test('completing the first boot remembers the visit for a later page load', () => {
  const first = terminal();
  first.advance(1100);
  assert.equal(first.storage['robco-visited'], undefined);
  first.advance(11500);
  assert.equal(first.storage['robco-visited'], '1');
  const next = terminal({ storage: first.storage });
  next.advance(800);
  assert.ok(!next.ids.term.hidden);
  assert.ok(next.ids.about.classes.has('active'));
  assert.equal(next.ids.boot.children.length, 0);
});

test('blocked storage falls back to the full boot and still opens the site', () => {
  const { ids, advance } = terminal({ storageBlocked: true });
  advance(1100);
  assert.ok(!ids.boot.hidden);
  advance(11500);
  assert.ok(!ids.term.hidden);
  assert.ok(ids.about.classes.has('active'));
});

test('return visits with reduced motion open immediately', () => {
  const { ids, advance, typedPages } = terminal({ returning: true, reducedMotion: true });
  advance(0);
  assert.ok(!ids.term.hidden);
  assert.ok(!ids.screen.classes.has('warming'));
  assert.equal(ids.boot.children.length, 0);
  assert.deepEqual(typedPages, []);
});

test('reduced motion removes warm-up delay but still runs the boot sequence', () => {
  const { ids, advance } = terminal({ reducedMotion: true });
  advance(0);
  assert.ok(!ids.boot.hidden);
  assert.ok(ids.term.hidden);
  assert.ok(!ids.screen.classes.has('warming'));
  advance(9000);
  assert.ok(ids.boot.hidden);
  assert.ok(!ids.term.hidden);
});

test('memory counts up and devices finish before kernel loading starts', () => {
  const { ids, advance } = terminal();
  advance(1100);
  const memory = ids.boot.children.find(child => child.className === 'line memory-line');
  const counter = memory.querySelector('.memory-count');
  const checks = ids.boot.children.filter(child => child.className === 'line');
  assert.equal(counter.textContent, '000 / 640 KB');
  assert.equal(checks[0].style.visibility, 'hidden');
  advance(1450);
  assert.equal(counter.textContent, '320 / 640 KB');
  advance(2400);
  assert.equal(counter.textContent, '640 KB [ OK ]');
  for (const device of checks.slice(0, 3)) {
    assert.equal(device.style.visibility, 'visible');
    assert.equal(device.querySelector('.tick').textContent, '[ OK ]');
  }
  assert.equal(checks[3].style.visibility, 'hidden');
  advance(2500);
  assert.equal(checks[3].style.visibility, 'visible');
});

test('skipping during the memory check cancels its remaining updates', () => {
  const { ids, advance } = terminal();
  advance(1240);
  const counter = ids.boot.children.find(child => child.className === 'line memory-line').querySelector('.memory-count');
  const atSkip = counter.textContent;
  ids.screen.dispatch('click');
  advance(12000);
  assert.equal(counter.textContent, atSkip);
  assert.ok(ids.boot.hidden);
  assert.ok(!ids.term.hidden);
});
