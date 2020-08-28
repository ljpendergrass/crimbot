import { config } from './config';

export function prefixMessage(message: string) {
  return config.messagePrefix.concat(' ', message);
}
