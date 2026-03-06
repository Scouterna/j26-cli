import {existsSync} from 'node:fs'
import {mkdir, writeFile} from 'node:fs/promises'

import {Flags} from '@oclif/core'

import {BaseCommand} from '../base-command.ts'
import {generateCaddyfile} from '../lib/caddy.ts'
import {LOCAL_CONFIG_FILE, loadLocalConfig, saveLocalConfig} from '../lib/config.ts'
import {generateDockerCompose} from '../lib/compose.ts'
import {run} from '../lib/exec.ts'
import {loadManifest} from '../lib/manifest.ts'
import type {ServiceWithConfig} from '../lib/schemas.ts'

const GENERATED_DIR = '.j26'

export default class Up extends BaseCommand<typeof Up> {
  static summary = 'Start the local development environment'

  static description = `
Generates a Caddyfile and docker-compose.yml from your saved configuration
(.j26.local.yaml) and performs a full recreate of the stack. Services without
a saved configuration default to cloud mode.

By default the command runs in the foreground and streams container logs.
Pass -d to start the stack in the background instead.

Run \`j26 config\` first to choose which services to run locally.
  `.trim()

  static examples = [
    '<%= config.bin %> up',
    '<%= config.bin %> up -d',
    '<%= config.bin %> up --config path/to/services.yaml',
  ]

  static flags = {
    detach: Flags.boolean({
      char: 'd',
      description: 'Run the stack in the background (detached mode)',
      default: false,
    }),
  }

  public async run(): Promise<void> {
    const manifest = await loadManifest(this.flags.config)
    const localConfig = await loadLocalConfig()

    const isFirstRun = !existsSync(LOCAL_CONFIG_FILE)
    const servicesWithConfig: ServiceWithConfig[] = []

    // ── Shared manifest services ───────────────────────────────────────────────
    for (const service of manifest.services) {
      const existing = localConfig.services[service.name]

      if (!existing && !isFirstRun) {
        this.warn(`New service "${service.name}" not yet configured — defaulting to cloud. Run \`j26 config\` to change.`)
      }

      servicesWithConfig.push({service, localConfig: existing ?? {mode: 'cloud'}})
    }

    // ── Locally-defined services — always local, use saved host port ──────────
    for (const service of Object.values(localConfig.localServices ?? {})) {
      const existing = localConfig.services[service.name]
      const hostPort = existing?.hostPort ?? service.port
      servicesWithConfig.push({service, localConfig: {mode: 'local', hostPort, env: existing?.env}})
    }

    // Create the config file on first run so developers know it exists
    if (isFirstRun) {
      await saveLocalConfig(localConfig)
      this.log('Created .j26.local.yaml — run `j26 config` to customise service modes.')
    }

    // Skip services are excluded from the generated Caddyfile / docker-compose
    const activeServices = servicesWithConfig.filter(({localConfig}) => localConfig.mode !== 'skip')

    await this.generateFiles(activeServices)
    await this.recreateStack(this.flags.detach)

    if (this.flags.detach) {
      this.log('')
      this.log('✅  Environment is up!')
      this.log('    https://local.j26.se')
      this.log('')
      this.log('    Tips:')
      this.log('      Run `j26 trust-ca` once to avoid browser certificate warnings.')
      this.log('      Run `j26 config` to change which services run locally.')
    }
  }

  private async generateFiles(services: ServiceWithConfig[]): Promise<void> {
    await mkdir(GENERATED_DIR, {recursive: true})

    const caddyfile = generateCaddyfile(services)
    await writeFile(`${GENERATED_DIR}/Caddyfile`, caddyfile, 'utf8')

    const composeContent = generateDockerCompose(services)
    await writeFile(`${GENERATED_DIR}/docker-compose.yml`, composeContent, 'utf8')

    this.log(`Generated ${GENERATED_DIR}/Caddyfile and ${GENERATED_DIR}/docker-compose.yml`)
  }

  private async recreateStack(detach: boolean): Promise<void> {
    this.log('Stopping existing stack...')
    try {
      await run('docker', ['compose', 'down'], {cwd: GENERATED_DIR})
    } catch {
      // Stack may not be running — safe to ignore
    }

    this.log('Starting stack...')
    const upArgs = ['compose', 'up', '--pull', 'always']
    if (detach) upArgs.push('--detach')
    await run('docker', upArgs, {cwd: GENERATED_DIR})
  }
}
