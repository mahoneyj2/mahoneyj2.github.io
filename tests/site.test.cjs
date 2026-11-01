const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const css = fs.readFileSync(path.join(root, 'style.css'), 'utf8');

test('navigation points to real sections and HTML IDs are unique', () => {
  const ids = [...html.matchAll(/\bid="([^"]+)"/g)].map(match => match[1]);
  assert.equal(new Set(ids).size, ids.length, 'duplicate HTML ID');
  const sections = new Set([...html.matchAll(/<section\b[^>]*\bid="([^"]+)"/g)].map(match => match[1]));
  const menu = html.match(/<nav\b[^>]*\bid="menu"[^>]*>([\s\S]*?)<\/nav>/);
  assert.ok(menu, 'section menu exists');
  const links = [...menu[1].matchAll(/href="#([^"]+)"/g)];
  assert.equal(links.length, sections.size, 'every section is in the menu');
  for (const [, id] of links) assert.ok(sections.has(id), `missing section: ${id}`);
});

test('all local HTML and CSS assets exist with the right filename case for GitHub Pages', () => {
  const urls = [
    ...[...html.matchAll(/\b(?:src|href)="([^"]+)"/g)].map(match => match[1]),
    ...[...css.matchAll(/url\(["']?([^\s"')]+)["']?\)/g)].map(match => match[1])
  ];
  for (const url of urls) {
    if (/^(?:[a-z]+:|#|\/\/)/i.test(url)) continue;
    const relative = decodeURIComponent(url.split(/[?#]/)[0]);
    let directory = root;
    for (const part of relative.split('/')) {
      assert.ok(fs.readdirSync(directory).includes(part), `missing or wrongly cased asset: ${url}`);
      directory = path.join(directory, part);
    }
    assert.ok(fs.statSync(directory).isFile(), `asset is not a file: ${url}`);
  }
});
