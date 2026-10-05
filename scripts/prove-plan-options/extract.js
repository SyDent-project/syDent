// Pull named top-level declarations out of patient-profile.html's inline scripts with a real parser.
const fs = require('fs'), acorn = require(require('path').resolve(__dirname, '../..') + '/node_modules/acorn');
function scan(file){ const html = fs.readFileSync(file, 'utf8');
let m, out = {}; const re = /<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/g;
while ((m = re.exec(html))) {
  const code = m[1]; let ast;
  try { ast = acorn.parse(code, { ecmaVersion: 'latest', sourceType: 'script', allowAwaitOutsideFunction: true }); } catch (e) { continue; }
  for (const n of ast.body) {
    if (n.type === 'FunctionDeclaration') out[n.id.name] = code.slice(n.start, n.end);
    if (n.type === 'VariableDeclaration') for (const d of n.declarations) if (d.id && d.id.name) out[d.id.name] = code.slice(n.start, n.end);
  }
}
return out; }
const out0 = scan(require('path').resolve(__dirname, '../..') + '/patient-profile.html');
module.exports = out0; module.exports.scan = scan;
if (require.main === module) { const want = process.argv.slice(2); for (const w of want) console.log(w, out0[w] ? out0[w].length : 'MISSING'); }
