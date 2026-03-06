import {Command, Flags, Interfaces} from '@oclif/core'

export type BaseFlags<T extends typeof Command> = Interfaces.InferredFlags<
  typeof BaseCommand.baseFlags & T['flags']
>

export abstract class BaseCommand<T extends typeof Command> extends Command {
  static baseFlags = {
    config: Flags.string({
      char: 'c',
      description: 'Path to the services manifest',
      default: 'services.yaml',
      helpValue: '<path>',
    }),
  }

  protected flags!: BaseFlags<T>

  public async init(): Promise<void> {
    await super.init()
    const {flags} = await this.parse({
      flags: this.ctor.flags,
      baseFlags: (super.ctor as typeof BaseCommand).baseFlags,
      enableJsonFlag: this.ctor.enableJsonFlag,
      args: this.ctor.args,
      strict: this.ctor.strict,
    })
    this.flags = flags as BaseFlags<T>
  }
}
