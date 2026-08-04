// Tiny fake extension. `neverCalled` is deliberately never invoked so the
// coverage report has something real to mark as uncovered.
function add(a, b) { return a + b; }
function neverCalled(x) { return x * 999; }
function activate() { return { add }; }
function deactivate() {}
module.exports = { activate, deactivate, add, neverCalled };
