const { withPodfile } = require('expo/config-plugins');

// shortcut: MediaPipeTasksCommon's graph library (force-loaded) carries its own copy of GTMSessionFetcher,
// which GoogleSignIn also pulls in as a pod: the app then links two copies and fails on duplicate symbols.
// Drop the pod's copy from the app's link so GoogleSignIn uses MediaPipe's. Remove when MediaPipe stops
// bundling it (check `nm` on libMediaPipeTasksCommon_device_graph.a after an upgrade).
const MARK = '# superhabit: mediapipe-gtm';
const HOOK = `
    ${MARK}
    Dir.glob(File.join(installer.sandbox.root, 'Target Support Files', 'Pods-*', '*.xcconfig')).each do |path|
      text = File.read(path)
      File.write(path, text.gsub(' -l"GTMSessionFetcher"', ''))
    end`;

module.exports = function withMediaPipeGtm(config) {
  return withPodfile(config, (mod) => {
    const podfile = mod.modResults.contents;
    if (podfile.includes(MARK)) return mod;
    mod.modResults.contents = podfile.replace(
      /(post_install do \|installer\|\n(?:.*\n)*?\s*react_native_post_install\([\s\S]*?\n\s*\))/,
      `$1${HOOK}`,
    );
    return mod;
  });
};
