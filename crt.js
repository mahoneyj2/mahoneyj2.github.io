// CRT renderer: draws the terminal's text onto a canvas and bends it with a WebGL
// shader, so the curved screen, phosphor glow and typing all run on the GPU.
//
// The HTML stays the source of truth: it does the layout and keeps links, clicks,
// and screen readers working, but is made invisible. Each render reads
// where every character sits (one Range per character, cached until something
// changes), draws them onto a 2D canvas, uploads that as a texture and runs one
// shader pass. Typing just reveals more of the cached characters each frame, so
// nothing in the page changes or re-lays out while text comes in. Nothing is drawn
// while idle.
//
// Usage: var view = CRT.create(screenElement, contentElement) -> null without WebGL.
//        var finish = view.type(element, onDone)  types an element's text in.

window.CRT = (function () {
	'use strict';

	var CURVE = 0.014; // shift at the corners as a fraction of the screen size

	var VERTEX = [
		'attribute vec2 a;',
		'varying vec2 v;',
		'void main() {',
		'	v = vec2(a.x * 0.5 + 0.5, 0.5 - a.y * 0.5);',
		'	gl_Position = vec4(a, 0.0, 1.0);',
		'}'
	].join('\n');

	// Barrel distortion: each pixel samples from further out the nearer it is to a
	// corner. Linear filtering on the texture keeps the bent text smooth. Two rings of
	// taps around each sample add the soft phosphor glow.
	var FRAGMENT = [
		'precision mediump float;',
		'uniform sampler2D t;',
		'uniform vec2 k;',
		'uniform vec2 px;',
		'varying vec2 v;',
		'void main() {',
		'	vec2 p = v * 2.0 - 1.0;',
		'	p *= 1.0 + k * dot(p, p);',
		'	vec2 q = p * 0.5 + 0.5;',
		'	if (q.x < 0.0 || q.y < 0.0 || q.x > 1.0 || q.y > 1.0) { gl_FragColor = vec4(0.0); return; }',
		'	vec4 c = texture2D(t, q);',
		'	vec4 near = texture2D(t, q + vec2(px.x, 0.0)) + texture2D(t, q - vec2(px.x, 0.0))',
		'		+ texture2D(t, q + vec2(0.0, px.y)) + texture2D(t, q - vec2(0.0, px.y));',
		'	vec2 d = px * 3.0;',
		'	vec4 far = texture2D(t, q + vec2(d.x, 0.0)) + texture2D(t, q - vec2(d.x, 0.0))',
		'		+ texture2D(t, q + vec2(0.0, d.y)) + texture2D(t, q - vec2(0.0, d.y))',
		'		+ texture2D(t, q + d) + texture2D(t, q - d)',
		'		+ texture2D(t, q + vec2(d.x, -d.y)) + texture2D(t, q + vec2(-d.x, d.y));',
		// Glow only lights up empty glass, so dark text on a highlight stays readable
		'	vec4 glow = (near * 0.12 + far * 0.055) * (1.0 - c.a);',
		'	vec4 light = min(c + glow, 1.0);',
		// Use physical framebuffer rows to avoid resampling a CSS scanline pattern.
		'	float raster = mod(floor(gl_FragCoord.y), 3.0) < 1.0 ? 0.22 : 0.0;',
		'	gl_FragColor = vec4(light.rgb * (1.0 - raster), light.a + raster * (1.0 - light.a));',
		'}'
	].join('\n');

	function create(screen, content) {
		var canvas = document.createElement('canvas');
		canvas.className = 'crt-canvas';
		canvas.setAttribute('aria-hidden', 'true');
		var gl = canvas.getContext('webgl', { premultipliedAlpha: true, antialias: false });
		if (!gl) return null;

		var program = link(gl, VERTEX, FRAGMENT);
		if (!program) return null;

		var buffer = gl.createBuffer();
		gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
		gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
		var attr = gl.getAttribLocation(program, 'a');
		gl.enableVertexAttribArray(attr);
		gl.vertexAttribPointer(attr, 2, gl.FLOAT, false, 0, 0);
		gl.useProgram(program);
		var uK = gl.getUniformLocation(program, 'k');
		var uPx = gl.getUniformLocation(program, 'px');

		var texture = gl.createTexture();
		gl.bindTexture(gl.TEXTURE_2D, texture);
		gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
		gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
		gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
		gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
		gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, true);

		var source = document.createElement('canvas');
		var ctx = source.getContext('2d');

		screen.appendChild(canvas);
		screen.classList.add('webgl');

		var chars = [];      // { ch, x, y, font, color, ascent, underline, clip, rank }
		var boxes = [];      // highlighted backgrounds: { x, y, w, h, color }
		var width = 0, height = 0, dpr = 1;
		var needsMeasure = true, frame = 0;
		var typing = null;   // { root, start, duration, total, done }

		// Layout

		function measure() {
			needsMeasure = false;
			var origin = content.getBoundingClientRect();
			var range = document.createRange();
			var fonts = {};
			chars = [];
			boxes = [];

			var walker = document.createTreeWalker(content, NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT);
			var node;
			while ((node = walker.nextNode())) {
				if (node.nodeType === 1) {
					var es = getComputedStyle(node);
					var bg = es.backgroundColor;
					if (bg && bg !== 'transparent' && !/rgba\(.*,\s*0\)$/.test(bg)) {
						var r = node.getBoundingClientRect();
						if (r.width && r.height) {
							var scroll = node.closest('.content');
							var bounds = scroll ? scroll.getBoundingClientRect() : r;
							var left = Math.max(r.left, bounds.left), top = Math.max(r.top, bounds.top);
							var right = Math.min(r.right, bounds.right), bottom = Math.min(r.bottom, bounds.bottom);
							if (right > left && bottom > top) boxes.push({ x: left - origin.left, y: top - origin.top, w: right - left, h: bottom - top, color: bg });
						}
					}
					continue;
				}
				var text = node.nodeValue;
				if (!text.trim()) continue;
				var parent = node.parentElement;
				var s = getComputedStyle(parent);
				if (s.visibility === 'hidden') continue;
				var font = s.fontWeight + ' ' + s.fontSize + ' ' + s.fontFamily;
				if (!(font in fonts)) {
					ctx.font = font;
					var m = ctx.measureText('M');
					fonts[font] = m.fontBoundingBoxAscent || parseFloat(s.fontSize) * 0.8;
				}
				var upper = s.textTransform === 'uppercase';
				var underline = s.textDecorationLine.indexOf('underline') !== -1;
				var scroller = parent.closest('.content');
				var clip = null;
				if (scroller) {
					var c = scroller.getBoundingClientRect();
					clip = { top: c.top - origin.top, bottom: c.bottom - origin.top };
				}
				for (var i = 0; i < text.length; i++) {
					var ch = text[i];
					// Spaces only matter when they carry an underline
					if ((ch === ' ' && !underline) || ch === '\n' || ch === '\t') continue;
					range.setStart(node, i);
					range.setEnd(node, i + 1);
					var rect = range.getBoundingClientRect();
					if (!rect.width) continue;
					chars.push({
						ch: upper ? ch.toUpperCase() : ch,
						x: rect.left - origin.left,
						y: rect.top - origin.top,
						w: rect.width,
						h: rect.height,
						font: font,
						ascent: fonts[font],
						color: s.color,
						underline: underline,
						clip: clip,
						node: node
					});
				}
			}

			// Characters inside the element being typed are numbered in reading order
			if (typing) {
				var rank = 0;
				chars.forEach(function (c) {
					c.rank = typing.root.contains(c.node) ? rank++ : -1;
				});
				typing.total = rank;
			}
		}

		function resize() {
			var r = content.getBoundingClientRect();
			dpr = Math.min(window.devicePixelRatio || 1, 2);
			var w = Math.round(r.width * dpr), h = Math.round(r.height * dpr);
			if (w === width && h === height) return;
			width = w;
			height = h;
			canvas.width = source.width = w;
			canvas.height = source.height = h;
			gl.viewport(0, 0, w, h);
			var max = CURVE * (r.width + r.height) / 2;
			gl.uniform2f(uK, max / r.width, max / r.height);
			gl.uniform2f(uPx, 1.5 * dpr / w, 1.5 * dpr / h);
		}

		// Drawing

		function draw(now) {
			frame = 0;
			resize();
			if (needsMeasure) measure();

			var shown = Infinity;
			if (typing) {
				var t = Math.min(1, (now - typing.start) / typing.duration);
				shown = Math.ceil(typing.total * t);
				if (t >= 1) {
					var done = typing.done;
					typing = null;
					shown = Infinity;
					if (done) done();
				}
			}

			ctx.setTransform(1, 0, 0, 1, 0, 0);
			ctx.clearRect(0, 0, width, height);
			ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

			boxes.forEach(function (b) {
				ctx.fillStyle = b.color;
				ctx.fillRect(b.x, b.y, b.w, b.h);
			});

			var font = null, color = null;
			for (var i = 0; i < chars.length; i++) {
				var c = chars[i];
				if (c.rank >= shown) continue;
				var alpha = 1;
				if (c.clip) {
					// Hidden outside the scrolling area, fading out over its last 32px
					if (c.y + c.h <= c.clip.top || c.y >= c.clip.bottom) continue;
					alpha = Math.max(0, Math.min(1, (c.clip.bottom - c.y - c.h) / 32 + 0.15));
				}
				if (c.font !== font) { ctx.font = font = c.font; }
				if (c.color !== color) { ctx.fillStyle = color = c.color; }
				var clipped = c.clip && (c.y < c.clip.top || c.y + c.h > c.clip.bottom);
				if (clipped) {
					ctx.save();
					ctx.beginPath();
					ctx.rect(0, c.clip.top, width / dpr, c.clip.bottom - c.clip.top);
					ctx.clip();
				}
				ctx.globalAlpha = alpha;
				var x = Math.round(c.x * dpr) / dpr;
				var y = Math.round((c.y + c.ascent) * dpr) / dpr;
				ctx.fillText(c.ch, x, y);
				if (c.underline) ctx.fillRect(x, y + 2, c.w, 1);
				if (clipped) ctx.restore();
			}
			ctx.globalAlpha = 1;

			gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, source);
			gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);

			if (typing) schedule();
		}

		function schedule() {
			if (!frame) frame = requestAnimationFrame(draw);
		}

		function invalidate() {
			needsMeasure = true;
			schedule();
		}

		// Anything that can move or restyle text triggers a re-measure on the next frame
		var observer = new MutationObserver(invalidate);
		observer.observe(content, {
			subtree: true, childList: true, characterData: true, attributes: true
		});
		// Power and warm-up classes also change inherited visibility and header layout.
		observer.observe(screen, { attributes: true, attributeFilter: ['class'] });
		content.addEventListener('scroll', invalidate, true);
		['pointerover', 'pointerout', 'focusin', 'focusout'].forEach(function (type) {
			content.addEventListener(type, invalidate);
		});
		if (window.ResizeObserver) new ResizeObserver(invalidate).observe(content);
		window.addEventListener('resize', invalidate);
		if (document.fonts) document.fonts.ready.then(invalidate);
		invalidate();

		return {
			// Types the element's text in over about a second; returns a function that
			// finishes it immediately
			type: function (root, done) {
				var length = root.textContent.replace(/\s+/g, '').length;
				typing = {
					root: root,
					start: performance.now(),
					duration: Math.min(1100, 300 + length * 2),
					total: 0,
					done: done
				};
				invalidate();
				return function finish() {
					if (!typing || typing.root !== root) return;
					typing = null;
					schedule();
					if (done) done();
				};
			}
		};
	}

	function link(gl, vs, fs) {
		var program = gl.createProgram();
		[[gl.VERTEX_SHADER, vs], [gl.FRAGMENT_SHADER, fs]].forEach(function (s) {
			var shader = gl.createShader(s[0]);
			gl.shaderSource(shader, s[1]);
			gl.compileShader(shader);
			gl.attachShader(program, shader);
		});
		gl.linkProgram(program);
		return gl.getProgramParameter(program, gl.LINK_STATUS) ? program : null;
	}

	return { create: create };
})();
