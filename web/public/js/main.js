// Thru — entry point. Boots the UI once the DOM is ready.
import { init } from './ui.js';

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
