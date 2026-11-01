// Quiet, locally hosted CC0 interface sounds. See audio/README.md for credits.
(function () {
	'use strict';
	var toggle = document.getElementById('sound-toggle');
	if (!toggle) return;

	var enabled = true, unlocked = false;
	try { enabled = localStorage.getItem('robco-sound') !== 'off'; } catch (e) {}

	var levels = { 'power-on': 0.15, 'power-off': 0.12, select: 0.13, check: 0.045, ready: 0.12 };
	var clips = {};
	Object.keys(levels).forEach(function (name) {
		var clip = document.getElementById('sound-' + name);
		if (!clip) return;
		clip.volume = levels[name];
		clips[name] = clip;
	});

	function stop() {
		Object.keys(clips).forEach(function (name) {
			clips[name].pause();
			try { clips[name].currentTime = 0; } catch (e) {}
		});
	}

	function play(name) {
		var clip = clips[name];
		if (!enabled || !unlocked || document.hidden || !clip) return;
		try {
			clip.currentTime = 0;
			var playing = clip.play();
			// Browser autoplay rules and unavailable audio must never interrupt the UI.
			if (playing && playing.catch) playing.catch(function () {});
		} catch (e) {}
	}

	function updateToggle() {
		toggle.textContent = enabled ? 'SOUND ON' : 'SOUND OFF';
		toggle.setAttribute('aria-pressed', String(enabled));
		toggle.title = enabled ? 'Mute sound effects' : 'Enable sound effects';
	}

	// A real click or key press is required before any sound can start.
	document.addEventListener('pointerdown', function () { unlocked = true; }, true);
	document.addEventListener('keydown', function () { unlocked = true; }, true);
	document.addEventListener('visibilitychange', function () { if (document.hidden) stop(); });
	toggle.addEventListener('click', function () {
		enabled = !enabled;
		updateToggle();
		try { localStorage.setItem('robco-sound', enabled ? 'on' : 'off'); } catch (e) {}
		if (enabled) play('select');
		else stop();
	});

	updateToggle();
	toggle.hidden = false;
	window.TerminalSound = { play: play, stop: stop };
})();
