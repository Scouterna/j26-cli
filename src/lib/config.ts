import {readFile, writeFile} from 'node:fs/promises'
import {existsSync} from 'node:fs'

import yaml from 'js-yaml'
import {type} from 'arktype'

import {LocalConfigSchema} from './schemas.ts'
import type {LocalConfig} from './schemas.ts'

export const LOCAL_CONFIG_FILE = '.j26.local.yaml'

export async function loadLocalConfig(): Promise<LocalConfig> {
  if (!existsSync(LOCAL_CONFIG_FILE)) {
    return {services: {}}
  }

  const content = await readFile(LOCAL_CONFIG_FILE, 'utf8')
  const raw = yaml.load(content)

  if (raw === null || raw === undefined) {
    return {services: {}}
  }

  const result = LocalConfigSchema(raw)
  if (result instanceof type.errors) {
    throw new Error(`Invalid local config "${LOCAL_CONFIG_FILE}":\n${result.summary}`)
  }

  return result as LocalConfig
}

export async function saveLocalConfig(config: LocalConfig): Promise<void> {
  const content = yaml.dump(config, {indent: 2, lineWidth: -1})
  await writeFile(LOCAL_CONFIG_FILE, content, 'utf8')
}
