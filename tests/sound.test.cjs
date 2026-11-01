const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function sound({ stored = null, storageBlocked = false, playbackBlocked = false } = {}) {
  const listeners = {}, attrs = {}, storage = {};
  const button = { hidden: true, setAttribute(name, value) { attrs[name] = value; },
    addEventListener(type, fn) { listeners['button:' + type] = fn; } };
  const clips = Object.fromEntries(['power-on', 'power-off', 'select', 'check', 'ready'].map(name => [name, {
    plays: 0, pauses: 0, currentTime: 1,
    play() { this.plays++; return playbackBlocked ? Promise.reject(new Error('Autoplay blocked')) : Promise.resolve(); },
    pause() { this.pauses++; }
  }]));
  const document = {
    hidden: false,
    getElementById(id) { return id === 'sound-toggle' ? button : clips[id.replace('sound-', '')]; },
    addEventListener(type, fn) { listeners[type] = fn; }
  };
  const window = {};
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, '..', 'sound.js'), 'utf8'), {
    document, window,
    localStorage: {
      getItem() { if (storageBlocked) throw new Error('Storage blocked'); return stored; },
      setItem(key, value) { if (storageBlocked) throw new Error('Storage blocked'); storage[key] = value; }
    }
  });
  return { clips, document, attrs, button, storage, api: window.TerminalSound,
    dispatch(type) { listeners[type](); } };
}

test('sound waits for interaction and stays silent in a hidden tab', () => {
  const s = sound();
  s.api.play('power-on');
  assert.equal(s.clips['power-on'].plays, 0);
  s.dispatch('pointerdown');
  s.api.play('power-on');
  assert.equal(s.clips['power-on'].plays, 1);
  assert.ok(s.clips['power-on'].volume < 0.2);
  s.document.hidden = true;
  s.dispatch('visibilitychange');
  assert.equal(s.clips['power-on'].pauses, 1);
  s.api.play('ready');
  assert.equal(s.clips.ready.plays, 0);
});

test('muting stops all clips and remembers the preference', () => {
  const s = sound();
  s.dispatch('keydown');
  s.api.play('select');
  s.dispatch('button:click');
  assert.equal(s.attrs['aria-pressed'], 'false');
  assert.equal(s.storage['robco-sound'], 'off');
  assert.ok(Object.values(s.clips).every(clip => clip.pauses === 1 && clip.currentTime === 0));
  s.api.play('ready');
  assert.equal(s.clips.ready.plays, 0);
  const returning = sound({ stored: s.storage['robco-sound'] });
  returning.dispatch('pointerdown');
  returning.api.play('select');
  assert.equal(returning.clips.select.plays, 0);
  returning.dispatch('button:click');
  assert.equal(returning.attrs['aria-pressed'], 'true');
  assert.equal(returning.storage['robco-sound'], 'on');
  assert.equal(returning.clips.select.plays, 1);
});

test('blocked storage and rejected audio leave the controls usable', async () => {
  const s = sound({ storageBlocked: true, playbackBlocked: true });
  assert.equal(s.button.hidden, false);
  s.dispatch('pointerdown');
  assert.doesNotThrow(() => s.api.play('ready'));
  await Promise.resolve(); // The rejected media promise must be handled.
  assert.doesNotThrow(() => s.dispatch('button:click'));
  assert.equal(s.attrs['aria-pressed'], 'false');
});
