import path from 'path';
import {existsSync} from 'fs';
import {fileURLToPath} from 'url';

const platformArchMap = {
  'win32:x64': 'win32-x64',
  'win32:ia32': 'win32-ia32',
  'win32:arm64': 'win32-arm64',
  'darwin:x64': 'darwin-x64',
  'darwin:arm64': 'darwin-arm64',
  'linux:x64': 'linux-x64',
  'linux:arm64': 'linux-arm64',
  'linux:arm': 'linux-arm',
  'linux:ia32': 'linux-ia32',
  'linux:loong64': 'linux-loong64',
  'linux:mips64el': 'linux-mips64el',
  'linux:ppc64': 'linux-ppc64',
  'linux:riscv64': 'linux-riscv64',
  'linux:s390x': 'linux-s390x',
  'freebsd:x64': 'freebsd-x64',
  'freebsd:arm64': 'freebsd-arm64',
  'openbsd:x64': 'openbsd-x64',
  'openbsd:arm64': 'openbsd-arm64',
  'netbsd:x64': 'netbsd-x64',
  'netbsd:arm64': 'netbsd-arm64',
  'android:x64': 'android-x64',
  'android:arm64': 'android-arm64',
  'android:arm': 'android-arm',
  'android:ia32': 'android-ia32',
  'aix:ppc64': 'aix-ppc64',
  'sunos:x64': 'sunos-x64',
  'openharmony:arm64': 'openharmony-arm64'
};

export function ensureEsbuildBinaryPath() {
  if (process.env.ESBUILD_BINARY_PATH) return;
  const key = `${process.platform}:${process.arch}`;
  const target = platformArchMap[key];
  if (!target) return;

  const binaryName = process.platform === 'win32' ? 'esbuild.exe' : 'esbuild';
  const scriptsDir = path.dirname(fileURLToPath(import.meta.url));
  const candidate = path.resolve(scriptsDir, '..', 'node_modules', '@esbuild', target, binaryName);

  if (existsSync(candidate)) {
    process.env.ESBUILD_BINARY_PATH = candidate;
  }
}
