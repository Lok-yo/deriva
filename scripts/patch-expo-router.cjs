const fs = require('node:fs');
const path = require('node:path');

// SDK 57 upstream race: https://github.com/expo/expo/issues/49378
// Initial linking runs during render and can resolve before the first commit.
const original = '    }, setLastUnhandledLink);';
const replacement = '    }, handleUnhandledLink);';
const anchor = '    const { getInitialState } = (0, useLinking_1.useLinking)(refContainer, {';
const marker = '    // Deriva: deliver initial linking state only after the first commit.';
const gate = `${marker}
    const linkingMounted = react_1.default.useRef(false);
    const linkingDisposed = react_1.default.useRef(false);
    const pendingLink = react_1.default.useRef({ queued: false, path: undefined });
    const handleUnhandledLink = react_1.default.useCallback((path) => {
        if (linkingDisposed.current) return;
        if (linkingMounted.current) {
            setLastUnhandledLink(path);
        } else {
            pendingLink.current = { queued: true, path };
        }
    }, []);
    react_1.default.useEffect(() => {
        linkingDisposed.current = false;
        linkingMounted.current = true;
        if (pendingLink.current.queued) {
            const path = pendingLink.current.path;
            pendingLink.current = { queued: false, path: undefined };
            // onReady may already have handled this path in a child's effect.
            setLastUnhandledLink(refContainer.current?.getCurrentRoute()?.path === path ? undefined : path);
        }
        return () => {
            linkingMounted.current = false;
            linkingDisposed.current = true;
            pendingLink.current = { queued: false, path: undefined };
        };
    }, []);
`;

function patchNavigationContainer(source) {
  if (source.includes(marker)) {
    if (!source.includes(replacement) || source.includes(original)) throw new Error('Expo Router patch is incomplete; review the installed source.');
    return source;
  }
  if (source.split(anchor).length !== 2 || source.split(original).length !== 2) {
    throw new Error('Expo Router linking source changed; review upstream issue #49378 before updating this patch.');
  }
  return source.replace(anchor, gate + anchor).replace(original, replacement);
}

if (require.main === module) {
  const packagePath = require.resolve('expo-router/package.json');
  const version = JSON.parse(fs.readFileSync(packagePath, 'utf8')).version;
  if (!/^57\.0\.\d+$/.test(version)) throw new Error(`Review the linking mount patch before using Expo Router ${version}.`);
  const target = path.join(path.dirname(packagePath), 'build/fork/NavigationContainer.js');
  const source = fs.readFileSync(target, 'utf8');
  const patched = patchNavigationContainer(source);
  if (patched !== source) fs.writeFileSync(target, patched);
  console.log(`Expo Router ${version}: initial linking mount patch verified.`);
}

module.exports = { patchNavigationContainer };
