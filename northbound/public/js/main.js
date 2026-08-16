// NORTHBOUND — entry point.
// Boots the UI once the DOM is ready and puts a readable panel on screen if
// anything in the module graph fails, rather than white-screening.
import { init } from './ui/ui.js';

function fail(err) {
  console.error('[northbound] boot failed', err);
  const app = document.getElementById('app');
  if (!app) return;
  const box = document.createElement('div');
  box.style.cssText =
    'position:absolute;inset:0;display:flex;align-items:center;justify-content:center;' +
    'z-index:99;padding:8vw;color:#f4ecdd;font:14px ui-monospace,monospace;text-align:center';
  box.innerHTML =
    '<div><p style="color:#d1785c;letter-spacing:.2em">THE TRAIL IS WASHED OUT</p>' +
    '<p style="color:#a99e8c">Northbound could not start.</p>' +
    '<pre style="color:#6f6656;white-space:pre-wrap;max-width:70ch;text-align:left">' +
    String(err && err.stack || err).replace(/[<>&]/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;' }[c])) +
    '</pre></div>';
  app.appendChild(box);
}

async function boot() {
  try { await init(); } catch (err) { fail(err); }
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
else boot();
