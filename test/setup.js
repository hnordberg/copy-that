/**
 * Test helper — loads mathml-to-omml.js into a jsdom window and returns the
 * CopyThatMath API object.
 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { JSDOM } = require('jsdom');

function loadCopyThatMath() {
  const dom = new JSDOM('<!DOCTYPE html><html><body></body></html>', {
    url: 'http://localhost',
  });
  const code = fs.readFileSync(
    path.join(__dirname, '..', 'src', 'mathml-to-omml.js'), 'utf-8');
  const context = vm.createContext(dom.window);
  vm.runInContext(code, context);
  return {
    api: dom.window.CopyThatMath,
    window: dom.window,
    document: dom.window.document,
  };
}

module.exports = { loadCopyThatMath };
