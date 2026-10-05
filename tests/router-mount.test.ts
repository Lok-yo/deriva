import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { runInNewContext } from 'node:vm';

const require = createRequire(import.meta.url);
const { patchNavigationContainer } = require('../scripts/patch-expo-router.cjs') as { patchNavigationContainer: (source: string) => string };
const installed = readFileSync(require.resolve('expo-router/build/fork/NavigationContainer'), 'utf8');
const marker = '    // Deriva: deliver initial linking state only after the first commit.';
const anchor = '    const { getInitialState } = (0, useLinking_1.useLinking)(refContainer, {';
const unpatched = installed.slice(0, installed.indexOf(marker)) + installed.slice(installed.indexOf(anchor)).replace('    }, handleUnhandledLink);', '    }, setLastUnhandledLink);');

// Execute the actual SDK component with controlled hook lifecycles. In particular,
// resolve the initial URL promise in the render-to-commit gap that Android exposes.
function render(source: string, initial: string | Promise<string>) {
  const updates: unknown[] = [];
  const effects: (() => void | (() => void))[] = [];
  const refs: { current: unknown }[] = [];
  let notify!: (path: string) => void;
  const react = {
    useRef: (current: unknown) => { const ref = { current }; refs.push(ref); return ref; },
    useState: () => [undefined, (value: unknown) => updates.push(value)],
    useCallback: (callback: unknown) => callback,
    useMemo: (factory: () => unknown) => factory(),
    useEffect: (effect: () => void | (() => void)) => effects.push(effect),
    useImperativeHandle: () => {},
    forwardRef: (component: unknown) => component,
  };
  const modules: Record<string, unknown> = {
    react,
    'react/jsx-runtime': { jsx: () => null },
    'react-native': { I18nManager: { getConstants: () => ({ isRTL: false }) } },
    './useBackButton': { useBackButton: () => {} },
    './useDocumentTitle': { useDocumentTitle: () => {} },
    './useLinking': { useLinking: (_ref: unknown, _config: unknown, callback: typeof notify) => {
      notify = callback;
      if (typeof initial === 'string') callback(initial);
      else void initial.then(callback);
      return { getInitialState: () => null };
    } },
    './useThenable': { useThenable: () => [false, undefined] },
    '../imperative-api': { useImperativeApiEmitter: () => {} },
    '../react-navigation/native': { DefaultTheme: {}, validatePathConfig: () => {} },
    '../utils/useLatestCallback': (callback: unknown) => callback,
  };
  const exports: { NavigationContainer?: (props: unknown, ref: unknown) => unknown } = {};
  runInNewContext(source, { exports, require: (id: string) => {
    if (!(id in modules)) throw new Error(`Unexpected dependency ${id}`);
    return modules[id];
  }, WeakMap });
  exports.NavigationContainer!({ linking: {}, fallback: null }, null);
  return { updates, notify, refs, commit: () => effects.map(effect => effect()).filter((cleanup): cleanup is () => void => typeof cleanup === 'function') };
}

test('reproduces the upstream asynchronous pre-commit write and prevents it after patching', async () => {
  const before = render(unpatched, Promise.resolve('/publish'));
  await Promise.resolve();
  assert.deepEqual(before.updates, ['/publish']);
  const after = render(patchNavigationContainer(unpatched), Promise.resolve('/publish'));
  await Promise.resolve();
  assert.deepEqual(after.updates, []);
  after.commit();
  assert.deepEqual(after.updates, ['/publish']);
});

test('initial synchronous paths wait for commit, while subsequent links are delivered immediately', () => {
  const component = render(installed, '/publish');
  assert.deepEqual(component.updates, []);
  component.commit();
  assert.deepEqual(component.updates, ['/publish']);
  component.notify('/place/example');
  assert.deepEqual(component.updates, ['/publish', '/place/example']);
});

test('late URL resolution after unmount cannot update navigation state', async () => {
  let resolve!: (path: string) => void;
  const initial = new Promise<string>(done => { resolve = done; });
  const component = render(installed, initial);
  component.commit().forEach(cleanup => cleanup());
  resolve('/publish');
  await Promise.resolve();
  assert.deepEqual(component.updates, []);
});

test('does not restore an initial path already handled by the mounted navigator', () => {
  const component = render(installed, '/publish');
  component.refs[0].current = { getCurrentRoute: () => ({ path: '/publish' }) };
  component.commit();
  assert.deepEqual(component.updates, [undefined]);
});

test('patch is idempotent and rejects upstream structural changes', () => {
  assert.equal(patchNavigationContainer(installed), installed);
  assert.equal(patchNavigationContainer(unpatched), installed);
  assert.throws(() => patchNavigationContainer('unknown new implementation'), /source changed/);
});
