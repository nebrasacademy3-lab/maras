import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');
const pkg = JSON.parse(read('package.json'));
const lock = JSON.parse(read('package-lock.json'));
const checks = [];
const check = (name, ok) => { checks.push([name, Boolean(ok)]); };

check('expo-asset is a direct SDK 57 dependency', pkg.dependencies?.['expo-asset'] === '~57.0.15');
check('package-lock root contains expo-asset', lock.packages?.['']?.dependencies?.['expo-asset'] === '~57.0.15');
check('package-lock resolves expo-asset 57.0.15', lock.packages?.['node_modules/expo-asset']?.version === '57.0.15');
check('LanguageProvider applies native RTL + logical root direction', /forceRTL\(rtl\)/.test(read('src/providers/LanguageProvider.tsx')) && /direction: value\.direction/.test(read('src/providers/LanguageProvider.tsx')));
check('Screen propagates direction into SafeArea/ScrollView', /contentContainerStyle=.*direction/.test(read('src/components/ui.tsx')) && /backgroundColor: colors\.background, direction/.test(read('src/components/ui.tsx')));
check('ScaledText forces Arabic RTL and English LTR', /writingDirection: forceLtr \? "ltr" : isRTL \? "rtl" : "ltr"/.test(read('src/components/ScaledText.tsx')));
check('ScaledTextInput owns field alignment', /requestedTextAlign === "center"/.test(read('src/components/ScaledTextInput.tsx')) && /forceLtr \? "left" : isRTL \? "right" : "left"/.test(read('src/components/ScaledTextInput.tsx')));
check('Login layout is direction-aware', /rowDirection/.test(read('app/(auth)/login.tsx')) && /alignSelf: "flex-start"/.test(read('app/(auth)/login.tsx')));
check('Register layout is direction-aware', /flexDirection: rowDirection/.test(read('app/(auth)/register.tsx')));
check('Tabs scene is direction-aware and translated', /sceneStyle: \{ direction \}/.test(read('app/(tabs)/_layout.tsx')) && /title: t\("الرئيسية"\)/.test(read('app/(tabs)/_layout.tsx')));
check('No TextInput is hard-forced to textAlign="right"', !scan(/textAlign="right"/));
check('No view is hard-forced to direction: "ltr"', !scan(/direction:\s*"ltr"/));
check('Preview build points to Railway backend', read('eas.json').includes('https://marase.up.railway.app'));

function scan(regex) {
  for (const base of ['app', 'src']) {
    const stack = [path.join(root, base)];
    while (stack.length) {
      const dir = stack.pop();
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) stack.push(full);
        else if (/\.tsx?$/.test(entry.name) && regex.test(fs.readFileSync(full, 'utf8'))) return full;
      }
    }
  }
  return null;
}

for (const [name, ok] of checks) console.log(`${ok ? '✓' : '✗'} ${name}`);
const passed = checks.filter(([, ok]) => ok).length;
console.log(`\n${passed}/${checks.length} checks passed`);
if (passed !== checks.length) process.exit(1);
