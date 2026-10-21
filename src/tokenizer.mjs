/* 优先使用包内分词器，再复用本机已有安装；不可用时不回退到字符估算。 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

export function createTokenizerScript(candidates = [
  process.env.RUNSTRIP_TOKENIZER_PATH,
  fileURLToPath(new URL('./vendor/tiktoken/', import.meta.url)),
  '/opt/homebrew/lib/node_modules/@musistudio/claude-code-router/node_modules/tiktoken',
  '/usr/local/lib/node_modules/@musistudio/claude-code-router/node_modules/tiktoken',
].filter(Boolean)) {
  for (const directory of candidates) {
    try {
      const pkg = JSON.parse(readFileSync(join(directory, 'package.json'), 'utf8'));
      if (pkg.name !== 'tiktoken' || pkg.version !== '1.0.22') continue;
      const glue = readFileSync(join(directory, 'lite/tiktoken_bg.cjs'), 'utf8');
      const bytes = readFileSync(join(directory, 'lite/tiktoken_bg.wasm')).toString('base64');
      const encoding = JSON.parse(readFileSync(join(directory, 'encoders/o200k_base.json'), 'utf8'));
      return {
        available: true, version: pkg.version, encoding: 'o200k_base',
        script: `(()=>{
          if(globalThis.__RunstripTokenizer?.version==='1.0.22/o200k_base') return;
          try {
            const module={exports:{}};
            ${glue}
            const bytes=Uint8Array.from(atob(${JSON.stringify(bytes)}),c=>c.charCodeAt(0));
            const instance=new WebAssembly.Instance(new WebAssembly.Module(bytes),{'./tiktoken_bg.js':module.exports});
            module.exports.__wbg_set_wasm(instance.exports);
            const data=${JSON.stringify(encoding)};
            const encoder=new module.exports.Tiktoken(data.bpe_ranks,data.special_tokens,data.pat_str);
            globalThis.__RunstripTokenizer={version:'1.0.22/o200k_base',count:text=>encoder.encode(text,[],[]).length};
          } catch { globalThis.__RunstripTokenizer=null; }
        })();`,
      };
    } catch { /* 未安装或文件不完整，尝试下一处已有安装。 */ }
  }
  return { available: false, version: null, encoding: null, script: 'globalThis.__RunstripTokenizer=null;' };
}
