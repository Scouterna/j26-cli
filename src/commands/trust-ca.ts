import {execSync} from 'node:child_process'
import {existsSync, rmSync} from 'node:fs'
import {platform} from 'node:os'
import {join} from 'node:path'

import {Command} from '@oclif/core'

const GENERATED_DIR = '.j26'
const CERT_OUTPUT = `${GENERATED_DIR}/caddy-root-ca.crt`
const CADDY_CERT_PATH = '/data/caddy/pki/authorities/local/root.crt'

export default class TrustCa extends Command {
  static summary = 'Trust the local Caddy CA certificate'

  static description = `
Extracts the root CA certificate that Caddy generated for https://local.j26.se
and installs it into your operating system's trust store so browsers show a
valid padlock instead of a security warning.

This only needs to be run once per machine (or after the caddy_data volume is
deleted and recreated).

Firefox note: Firefox maintains its own certificate store. After running this
command, import ${CERT_OUTPUT} manually via:
  Settings → Privacy & Security → Certificates → View Certificates → Import
  `.trim()

  static examples = ['<%= config.bin %> trust-ca']

  public async run(): Promise<void> {
    if (!existsSync(`${GENERATED_DIR}/docker-compose.yml`)) {
      this.error(`No ${GENERATED_DIR}/docker-compose.yml found. Run \`j26 up\` first.`)
    }

    this.log(`Extracting Caddy root CA from container...`)

    // docker compose cp writes to a path relative to the current working directory
    const certDest = join(process.cwd(), CERT_OUTPUT)

    // Remove stale cert if present so cp doesn't complain
    if (existsSync(certDest)) rmSync(certDest)

    try {
      execSync(
        `docker compose cp caddy:${CADDY_CERT_PATH} ${certDest}`,
        {cwd: GENERATED_DIR, stdio: 'inherit'},
      )
    } catch {
      this.error(
        'Failed to copy the certificate. Make sure the stack is running (`j26 up`) and ' +
          'Caddy has had time to generate the certificate.',
      )
    }

    this.log(`Certificate saved to ${CERT_OUTPUT}`)
    this.log('')

    this.installCert(certDest)

    this.log('')
    this.warn(
      'Firefox uses its own certificate store and will NOT pick up this change automatically.\n' +
        '  Import the certificate manually: Settings → Privacy & Security →\n' +
        '  Certificates → View Certificates → Authorities → Import',
    )
  }

  private installCert(certPath: string): void {
    const os = platform()

    if (os === 'linux') {
      this.log('Installing certificate on Linux (requires sudo)...')
      execSync(
        `sudo cp "${certPath}" /usr/local/share/ca-certificates/j26-caddy-root-ca.crt && sudo update-ca-certificates`,
        {stdio: 'inherit'},
      )
      this.log('✅  Certificate installed. Restart your browser.')
      return
    }

    if (os === 'darwin') {
      this.log('Installing certificate on macOS (requires sudo)...')
      execSync(
        `sudo security add-trusted-cert -d -r trustRoot -k /Library/Keychains/System.keychain "${certPath}"`,
        {stdio: 'inherit'},
      )
      this.log('✅  Certificate installed. Restart your browser.')
      return
    }

    // Windows or other
    this.log(`Manual installation required on ${os}:`)
    this.log(`  1. Open ${CERT_OUTPUT}`)
    this.log('  2. Install it into your "Trusted Root Certification Authorities" store.')
    this.log('  3. Restart your browser.')
  }
}
