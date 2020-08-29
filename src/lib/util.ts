import { config } from './config';
import * as Discord from 'discord.js';

export function prefixMessage(message: string) {
  return config.messagePrefix.concat(' ', message);
}

/**
 * Checks if the author of a message as moderator-like permissions.
 * @param {GuildMember} member Sender of the message
 * @return {Boolean} True if the sender is a moderator.
 */
export function isModerator(member: Discord.GuildMember): boolean {
  return (
    member.hasPermission('ADMINISTRATOR') ||
    member.hasPermission('MANAGE_CHANNELS') ||
    member.hasPermission('KICK_MEMBERS') ||
    member.hasPermission('MOVE_MEMBERS') ||
    member.id === 'XXX' // example id
  );
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function uniqueBy<Record extends { [key: string]: any }>(
  arr: Record[],
  propertyName: keyof Record
): Record[] {
  const unique: Record[] = [];
  const found: { [key: string]: boolean } = {};

  for (let i = 0; i < arr.length; i += 1) {
    if (arr[i][propertyName]) {
      const value = arr[i][propertyName];
      if (!found[value]) {
        found[value] = true;
        unique.push(arr[i]);
      }
    }
  }
  return unique;
}

export function hoursToTimeoutInMs(hours: number) {
  return hours * 60 * 60 * 1000;
}

export function randomHours() {
  const random = Math.floor(Math.random() * Math.floor(12));
  if (random === 0) {
    return 10;
  } else {
    return random;
  }
}

/**
 * Reads a new message and checks if and which command it is.
 * @param {Message} message Message to be interpreted as a command
 * @return {String} Command string
 */
export function validateMessage(message: Discord.Message): string | null {
  const messageText = message.content.toLowerCase();
  let command = null;
  const allowableCommands = new Set([
    'train',
    'help',
    'regen',
    'invite',
    'debug',
    'tts',
    'force',
    'test',
  ]);
  const thisPrefix = messageText.substring(0, config.prefix.length);
  if (thisPrefix === config.prefix) {
    const split = messageText.split(' ');
    if (split[0] === config.prefix && split.length === 1) {
      command = 'respond';
    } else if (allowableCommands.has(split[1])) {
      command = split[1];
    }
  }
  return command;
}

export function removeCommonWords(words: Array<string>, common: any) {
  common.forEach(function(obj: any) {
    let word = obj.word;
    while (words.indexOf(word) !== -1) {
      words.splice(words.indexOf(word), 1);
    }
  });
  return words;
}
