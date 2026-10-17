// Fixture enhancement: a decorative bar outside the content, removed on cleanup.
import type { Enhance } from '../../../../src/lib/theme-runtime';

const enhance: Enhance = ({ signal }) => {
  const bar = document.createElement('div');
  bar.setAttribute('aria-hidden', 'true');
  bar.setAttribute('data-theme-decor', '');
  document.body.append(bar);
  signal.addEventListener('abort', () => bar.remove());
};

export default enhance;
