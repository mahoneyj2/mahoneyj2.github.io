// RobCo terminal: boot sequence, power button, page switching and the typing effect.
// All content lives in index.html; without JS every section is simply shown.
// The curved screen itself is drawn by crt.js when WebGL is available.

(function () {
	'use strict';

	var screen = document.getElementById('screen');
	var monitor = document.getElementById('monitor');
	var crt = document.querySelector('.crt');
	var boot = document.getElementById('boot');
	var term = document.getElementById('term');
	var menu = document.getElementById('menu');
	var content = document.getElementById('content');
	var power = document.getElementById('power');
	var powerMsg = document.getElementById('power-msg');
	var scrollbar = document.getElementById('scrollbar');
	var scrollThumb = document.getElementById('scroll-thumb');
	var links = Array.prototype.slice.call(menu.querySelectorAll('a'));
	var pages = Array.prototype.slice.call(document.querySelectorAll('.page'));

	var reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
	var state = 'off'; // on | booting | off
	var finishTyping = null;
	var skipBoot = null;
	var powerTimer = null;
	var startupTimer = null;
	var scrollFrame = null;
	var returningVisitor = false;
	try { returningVisitor = localStorage.getItem('robco-visited') === '1'; } catch (e) {}

	var view = window.CRT ? window.CRT.create(screen, crt) : null;
	var sound = window.TerminalSound || { play: function () {}, stop: function () {} };

	// Page navigation

	function currentPage() {
		var id = location.hash.slice(1);
		return pages.some(function (page) { return page.id === id; }) ? id : 'about';
	}

	function show(id, instant) {
		links.forEach(function (a) {
			var active = a.getAttribute('href') === '#' + id;
			a.classList.toggle('active', active);
			if (active) a.setAttribute('aria-current', 'page');
			else a.removeAttribute('aria-current');
		});
		pages.forEach(function (p) {
			p.classList.toggle('active', p.id === id);
		});
		content.scrollTop = 0;
		if (!instant) typeOut(document.getElementById(id));
		queueScrollbar();
	}

	function openTerminal(instant) {
		state = 'on';
		screen.classList.remove('booting');
		boot.hidden = true;
		term.hidden = false;
		show(currentPage(), instant);
	}

	window.addEventListener('hashchange', function () {
		if (state === 'on') show(currentPage());
	});
	links.forEach(function (link) {
		link.addEventListener('click', function () {
			if (state === 'on' && link.getAttribute('href') !== '#' + currentPage()) sound.play('select');
		});
	});

	// Up/down arrows move through the menu like the original terminal
	menu.addEventListener('keydown', function (e) {
		var step = { ArrowDown: 1, ArrowRight: 1, ArrowUp: -1, ArrowLeft: -1 }[e.key];
		if (!step) return;
		e.preventDefault();
		var i = links.indexOf(document.activeElement);
		var next = links[(i + step + links.length) % links.length];
		next.focus();
		next.click();
	});

	// Scrolling

	var scrollRange = 0, thumbHeight = 0, railHeight = 0;
	var drag = null;

	function updateScrollbar() {
		scrollFrame = null;
		scrollRange = Math.max(0, content.scrollHeight - content.clientHeight);
		scrollbar.hidden = state !== 'on' || term.hidden || scrollRange <= 1;
		if (scrollbar.hidden) return;
		var area = content.getBoundingClientRect();
		var origin = screen.getBoundingClientRect();
		railHeight = Math.max(0, area.height - 2);
		thumbHeight = Math.min(railHeight, Math.max(28, railHeight * content.clientHeight / content.scrollHeight));
		scrollbar.style.left = (area.right - origin.left - 14) + 'px';
		scrollbar.style.top = (area.top - origin.top) + 'px';
		scrollbar.style.height = area.height + 'px';
		scrollThumb.style.height = thumbHeight + 'px';
		scrollThumb.style.transform = 'translateY(' + ((railHeight - thumbHeight) * content.scrollTop / scrollRange) + 'px)';
		scrollbar.setAttribute('aria-valuemax', Math.round(scrollRange));
		scrollbar.setAttribute('aria-valuenow', Math.round(content.scrollTop));
	}

	function queueScrollbar() {
		if (scrollFrame === null) scrollFrame = requestAnimationFrame(updateScrollbar);
	}

	content.addEventListener('scroll', queueScrollbar);
	window.addEventListener('resize', queueScrollbar);
	if (window.ResizeObserver) new ResizeObserver(queueScrollbar).observe(content);
	if (document.fonts) document.fonts.ready.then(queueScrollbar);

	function scrollToPointer(e, offset) {
		var travel = railHeight - thumbHeight;
		if (travel > 0) content.scrollTop = Math.max(0, Math.min(1,
			(e.clientY - scrollbar.getBoundingClientRect().top - 1 - offset) / travel)) * scrollRange;
		queueScrollbar();
	}

	scrollbar.addEventListener('pointerdown', function (e) {
		if (e.button !== 0) return;
		e.preventDefault();
		scrollbar.focus();
		var thumb = scrollThumb.getBoundingClientRect();
		drag = { id: e.pointerId, offset: e.target === scrollThumb ? e.clientY - thumb.top : thumbHeight / 2 };
		scrollbar.setPointerCapture(e.pointerId);
		scrollToPointer(e, drag.offset);
	});
	scrollbar.addEventListener('pointermove', function (e) {
		if (drag && drag.id === e.pointerId) scrollToPointer(e, drag.offset);
	});
	scrollbar.addEventListener('lostpointercapture', function () { drag = null; });
	scrollbar.addEventListener('pointerup', function (e) {
		if (scrollbar.hasPointerCapture(e.pointerId)) scrollbar.releasePointerCapture(e.pointerId);
		drag = null;
	});
	scrollbar.addEventListener('keydown', function (e) {
		var step = { ArrowDown: 40, ArrowUp: -40, PageDown: content.clientHeight * 0.9, PageUp: -content.clientHeight * 0.9 }[e.key];
		if (step) content.scrollTop += step;
		else if (e.key === 'Home') content.scrollTop = 0;
		else if (e.key === 'End') content.scrollTop = scrollRange;
		else return;
		e.preventDefault();
		queueScrollbar();
	});
	scrollbar.addEventListener('wheel', function (e) {
		var unit = e.deltaMode === 1 ? 24 : e.deltaMode === 2 ? content.clientHeight : 1;
		content.scrollTop += e.deltaY * unit;
		e.preventDefault();
		queueScrollbar();
	}, { passive: false });

	// Typing effect

	function typeOut(el) {
		if (finishTyping) finishTyping();
		if (reducedMotion || document.hidden) return;
		if (view) {
			finishTyping = view.type(el, function () { finishTyping = null; });
		} else {
			typeOutInPage(el);
		}
	}

	// Without WebGL the page itself is typed: each text node is emptied and filled back
	// in, with the untyped rest kept as an invisible "ghost" span so the layout is final
	// from the first frame and nothing shifts as text arrives
	function typeOutInPage(el) {
		var nodes = [];
		var walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
		var node;
		while ((node = walker.nextNode())) {
			if (node.nodeValue.trim()) nodes.push({ node: node, text: node.nodeValue });
		}
		nodes.forEach(function (n) {
			n.ghost = document.createElement('span');
			n.ghost.className = 'ghost';
			n.ghost.textContent = n.text;
			n.node.parentNode.insertBefore(n.ghost, n.node.nextSibling);
			n.node.nodeValue = '';
		});

		// Paced by the clock rather than per frame, so a slow frame doesn't stall the text
		var total = nodes.reduce(function (sum, n) { return sum + n.text.length; }, 0);
		var duration = Math.min(1100, 300 + total * 2); // whole page in about a second
		var start = performance.now();
		var typed = 0, i = 0, c = 0, frame;

		function tick(now) {
			var target = Math.ceil(total * Math.min(1, ((now || performance.now()) - start) / duration));
			var budget = target - typed;
			typed = target;
			while (budget > 0 && i < nodes.length) {
				var n = nodes[i];
				var take = Math.min(budget, n.text.length - c);
				c += take;
				budget -= take;
				n.node.nodeValue = n.text.slice(0, c);
				n.ghost.textContent = n.text.slice(c);
				if (c >= n.text.length) { n.ghost.remove(); i++; c = 0; }
			}
			if (i < nodes.length) frame = requestAnimationFrame(tick);
			else finishTyping = null;
		}

		finishTyping = function () {
			cancelAnimationFrame(frame);
			nodes.forEach(function (n) {
				n.node.nodeValue = n.text;
				n.ghost.remove();
			});
			finishTyping = null;
		};

		tick();
	}

	// Clicking the content skips the rest of the typing, as does switching tabs
	// (browsers pause animation in hidden tabs, which would leave it half typed)
	content.addEventListener('click', function () {
		if (finishTyping) finishTyping();
	});
	document.addEventListener('visibilitychange', function () {
		if (document.hidden && finishTyping) finishTyping();
	});

	// Boot sequence

	var bootSteps = ['LOADING KERNEL', 'PROBING SYSTEM', 'LOADING DRIVERS', 'LOADING CORE', 'BOOTING'];
	var logo = [
		'    ____        __    __________     __  ______  _____',
		'   / __ \\____  / /_  / ____/ __ \\   / / / / __ \\/ ___/',
		'  / /_/ / __ \\/ __ \\/ /   / / / /  / / / / / / /\\__ \\ ',
		' / _, _/ /_/ / /_/ / /___/ /_/ /  / /_/ / /_/ /___/ / ',
		'/_/ |_|\\____/_.___/\\____/\\____/   \\____/\\____//____/  '
	].join('\n');

	function runBoot() {
		state = 'booting';
		screen.classList.add('booting');
		term.hidden = true;
		boot.hidden = false;
		boot.innerHTML = '';

		var timers = [], finished = false;
		function later(fn, ms) { timers.push(setTimeout(fn, ms)); }

		function finish() {
			if (finished) return;
			finished = true;
			timers.forEach(clearTimeout);
			skipBoot = null;
			try { localStorage.setItem('robco-visited', '1'); } catch (e) {}
			sound.play('ready');
			openTerminal();
		}
		skipBoot = finish;

		var caption = document.createElement('p');
		caption.className = 'boot-caption';
		caption.innerHTML = '<span>ROBCO BOOT ROM</span><span>SELF-TEST</span>';
		boot.appendChild(caption);

		// A fictional terminal POST, rather than a reading of the visitor's hardware.
		// Every update uses the boot timer list so skipping also stops the diagnostics.
		var memory = document.createElement('div');
		memory.className = 'line memory-line';
		memory.innerHTML = '<span>CHECKING MEMORY</span><span class="memory-count"></span>';
		boot.appendChild(memory);
		var memoryCount = memory.querySelector('.memory-count');
		memoryCount.textContent = '000 / 640 KB';
		function setMemory(step) {
			memoryCount.textContent = step === 10 ? '640 KB [ OK ]' : ('000' + step * 64).slice(-3) + ' / 640 KB';
			if (step === 10) memoryCount.className = 'memory-count ok';
		}
		if (reducedMotion) setMemory(10);
		else {
			for (var n = 1; n <= 10; n++) {
				(function (step) { later(function () { setMemory(step); }, step * 70); })(n);
			}
		}

		function check(label, at, duration) {
			// Reserve future rows so the diagnostics don't move the loading panel.
			var line = document.createElement('div');
			line.className = 'line';
			line.style.visibility = 'hidden';
			line.innerHTML = '<span>' + label + '</span><span class="tick">[ .. ]</span>';
			boot.appendChild(line);
			later(function () {
				line.style.visibility = 'visible';
				later(function () {
					var tick = line.querySelector('.tick');
					tick.className = 'tick ok';
					tick.textContent = '[ OK ]';
					sound.play('check');
				}, duration);
			}, at);
		}
		['DISPLAY ADAPTER', 'KEYBOARD CONTROLLER', 'ARCHIVE DRIVE'].forEach(function (label, i) {
			check(label, reducedMotion ? 0 : 700 + i * 180, 120);
		});
		var diagnosticsEnd = reducedMotion ? 0 : 1400;
		bootSteps.forEach(function (label, i) {
			check(label, diagnosticsEnd + i * 260, 220);
		});

		// The loading bar spans the same width as the step list above it
		var barStart = diagnosticsEnd + bootSteps.length * 260 + 200;
		var bar = document.createElement('p');
		bar.className = 'bar';
		bar.setAttribute('role', 'progressbar');
		bar.setAttribute('aria-label', 'Loading operating system');
		bar.setAttribute('aria-valuemin', '0');
		bar.setAttribute('aria-valuemax', '100');
		function renderBar(progress) {
			// Measure the loaded font instead of assuming its advance is half its size.
			// Stretch the text to the container edge, including after a resize mid-boot.
			bar.style.letterSpacing = '0px';
			bar.textContent = '[=]';
			var range = document.createRange();
			range.selectNodeContents(bar);
			var charWidth = range.getBoundingClientRect().width / 3;
			var cells = Math.max(1, Math.floor(boot.clientWidth / (charWidth || 8)) - 2);
			var filled = Math.floor(cells * progress);
			bar.textContent = '[' + '='.repeat(filled) + (filled < cells ? '>' : '') + ' '.repeat(Math.max(0, cells - filled - 1)) + ']';
			bar.style.letterSpacing = Math.max(0, (boot.clientWidth - (cells + 2) * charWidth) / (cells + 2)) + 'px';
			bar.setAttribute('aria-valuenow', Math.round(progress * 100));
		}
		bar.style.visibility = 'hidden';
		boot.appendChild(bar);
		renderBar(0);
		later(function () { bar.style.visibility = 'visible'; }, barStart);
		for (var n = 1; n <= 30; n++) {
			(function (step) { later(function () { renderBar(step / 30); }, barStart + step * 30); })(n);
		}

		// Splash: logo, then the logon details a line at a time
		var splashAt = barStart + 900 + 300;
		var logon = logonLines(), logonNodes = [], readyLine;
		later(function () {
			boot.innerHTML = '<div class="splash"><pre class="logo"></pre><p class="boot-system">UNIFIED OPERATING SYSTEM</p></div>';
			boot.querySelector('.logo').textContent = logo;
			logon.forEach(function (text) {
				var line = document.createElement('p');
				line.textContent = text || ' ';
				line.style.visibility = 'hidden';
				boot.querySelector('.splash').appendChild(line);
				logonNodes.push(line);
			});
			readyLine = document.createElement('p');
			readyLine.className = 'boot-ready';
			readyLine.textContent = 'TERMINAL READY';
			readyLine.style.visibility = 'hidden';
			boot.querySelector('.splash').appendChild(readyLine);
		}, splashAt);
		logon.forEach(function (_, i) {
			later(function () {
				logonNodes[i].style.visibility = 'visible';
				if (i === logon.length - 1) readyLine.style.visibility = 'visible';
			}, splashAt + 500 + i * 450);
		});
		// Hold the completed welcome message for four seconds, rather than replacing
		// it almost as soon as the final line has appeared.
		later(finish, splashAt + 500 + (logon.length - 1) * 450 + 4000);
	}

	// Where the visitor is "logging on" from, worked out from their own browser's time
	// zone and clock: nothing is looked up or sent anywhere
	function logonLines() {
		var lines = [];
		try {
			var zone = Intl.DateTimeFormat().resolvedOptions().timeZone || '';
			var parts = zone.split('/');
			if (parts.length > 1) {
				var place = parts[parts.length - 1].replace(/_/g, ' ').toUpperCase();
				lines.push('LOGON FROM ' + place);
				lines.push('TERMINAL TIME ZONE: ' + zone.replace(/_/g, ' ').toUpperCase());
			}
		} catch (e) {}
		var ua = (navigator.userAgentData && navigator.userAgentData.platform) || navigator.platform || '';
		var system = /iphone|ipad/i.test(ua) ? 'IOS' : /android/i.test(navigator.userAgent) ? 'ANDROID'
			: /win/i.test(ua) ? 'WINDOWS' : /mac/i.test(ua) ? 'MACOS' : /linux/i.test(ua) ? 'LINUX' : 'UNKNOWN';
		var now = new Date();
		var time = ('0' + now.getHours()).slice(-2) + ':' + ('0' + now.getMinutes()).slice(-2);
		lines.push('LOCAL TIME ' + time + ' // TERMINAL: ' + system);
		lines.push('');
		lines.push('WELCOME, USER');
		return lines;
	}

	// Any key or tap skips the boot sequence
	function onSkip(e) {
		if (e.type === 'keydown' && (e.ctrlKey || e.altKey || e.metaKey || e.repeat ||
			/^(Tab|Shift|Control|Alt|Meta)$/.test(e.key))) return;
		if (skipBoot && e.target !== power && e.target.id !== 'sound-toggle') skipBoot();
	}
	document.addEventListener('keydown', onSkip);
	screen.addEventListener('click', onSkip);

	// Power button
	// The monitor's "on" class lights the phosphor, the case glow and the button

	var msgTimer;
	function flash(text) {
		powerMsg.textContent = text;
		clearTimeout(msgTimer);
		msgTimer = setTimeout(function () { powerMsg.textContent = ''; }, 1500);
	}

	// Return visits wake straight into the file; the power button still cold-boots.
	function powerOn(wake) {
		sound.play('power-on');
		clearTimeout(startupTimer);
		clearTimeout(powerTimer);
		clearTimeout(msgTimer);
		powerMsg.textContent = '';
		state = 'booting';
		term.hidden = true;
		boot.hidden = true;
		scrollbar.hidden = true;
		screen.classList.remove('off', 'powering-off');
		screen.classList.add('warming', 'booting');
		monitor.classList.add('on');
		power.setAttribute('aria-pressed', 'true');
		powerTimer = setTimeout(function () {
			screen.classList.remove('warming');
			if (wake) {
				openTerminal(true);
			} else {
				runBoot();
			}
		}, reducedMotion ? 0 : 700);
	}

	function powerOff() {
		sound.stop();
		sound.play('power-off');
		clearTimeout(powerTimer);
		state = 'off';
		if (finishTyping) finishTyping();
		power.setAttribute('aria-pressed', 'false');
		scrollbar.hidden = true;
		flash('SHUTTING DOWN');
		screen.classList.add('powering-off');
		powerTimer = setTimeout(function () {
			screen.classList.remove('powering-off');
			screen.classList.add('off');
			monitor.classList.remove('on');
		}, reducedMotion ? 0 : 450);
	}

	power.addEventListener('click', function () {
		if (state === 'booting') flash('DO NOT POWER OFF IN BOOT');
		else if (state === 'on') powerOff();
		else powerOn();
	});

	// First visits cold-boot; remembered visitors wake after a short pause.
	startupTimer = setTimeout(function () { powerOn(returningVisitor); },
		reducedMotion ? 0 : returningVisitor ? 100 : 400);
})();
