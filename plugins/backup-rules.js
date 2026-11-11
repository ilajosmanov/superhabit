// Android backup rules for the app's own data. expo-secure-store's rules list only shared preferences, and on
// Android a list of includes is an allowlist: the database (the only copy of your history until sync) was in
// neither cloud backup nor device transfer. These keep secure-store's exclusion (its keys can't move between
// phones) and add the database; device transfer, which has no size cap, takes every file.
const fs = require('node:fs');
const path = require('node:path');
const { AndroidConfig, withAndroidManifest, withDangerousMod } = require('expo/config-plugins');

// Cloud backup is capped at 25 MB, so videos and traces stay out of it; the database is files/SQLite/.
const CLOUD = `
    <include domain="sharedpref" path="."/>
    <exclude domain="sharedpref" path="SecureStore"/>
    <include domain="file" path="SQLite/"/>`;
const TRANSFER = `
    <include domain="sharedpref" path="."/>
    <exclude domain="sharedpref" path="SecureStore"/>
    <include domain="file" path="."/>`;

// Android 9 to 11 tell a device transfer apart from a cloud backup; Android 8 can't, so it backs up as cloud.
const LEGACY_TRANSFER = `
    <include domain="file" path="." requireFlags="deviceToDeviceTransfer"/>`;

const RULES = {
  // Android 8.
  'xml/backup_rules.xml': `<?xml version="1.0" encoding="utf-8"?>
<full-backup-content>${CLOUD}
</full-backup-content>
`,
  // Android 9 to 11.
  'xml-v28/backup_rules.xml': `<?xml version="1.0" encoding="utf-8"?>
<full-backup-content>${CLOUD}${LEGACY_TRANSFER}
</full-backup-content>
`,
  // Android 12 and higher.
  'xml/data_extraction_rules.xml': `<?xml version="1.0" encoding="utf-8"?>
<data-extraction-rules>
  <cloud-backup>${CLOUD}
  </cloud-backup>
  <device-transfer>${TRANSFER}
  </device-transfer>
</data-extraction-rules>
`,
};

module.exports = function withBackupRules(config) {
  config = withDangerousMod(config, [
    'android',
    async (mod) => {
      const res = path.join(mod.modRequest.platformProjectRoot, 'app/src/main/res');
      for (const [name, xml] of Object.entries(RULES)) {
        fs.mkdirSync(path.dirname(path.join(res, name)), { recursive: true });
        fs.writeFileSync(path.join(res, name), xml);
      }
      return mod;
    },
  ]);
  return withAndroidManifest(config, (mod) => {
    const app = AndroidConfig.Manifest.getMainApplicationOrThrow(mod.modResults);
    app.$['android:fullBackupContent'] = '@xml/backup_rules';
    app.$['android:dataExtractionRules'] = '@xml/data_extraction_rules';
    return mod;
  });
};
