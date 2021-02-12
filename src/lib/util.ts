import { config } from './config';
import * as Discord from 'discord.js';
import { ResponseSettings } from './interface';

export function prefixMessage(message: string) {
  return config.messagePrefix.concat(' ', message);
}

/**dis
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
    'chatty',
    'pick',
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

export function getResponseSettings(
  message: Discord.Message,
  chattyChannelId: String
): ResponseSettings {
  const channel = message.channel as Discord.TextChannel;
  const parentName = channel.parent.name;
  let settings: ResponseSettings = {
    allowedToRespond: true,
    increasedChance: message.channel.id === chattyChannelId,
  };

  if (parentName !== config.suppressRespCat && parentName !== config.increaseFreqCat) {
    return settings;
  } else {
    parentName === config.suppressRespCat ? (settings.allowedToRespond = false) : null;
    parentName === config.increaseFreqCat ? (settings.increasedChance = true) : null;
    return settings;
  }
}

export const helpEmbed = {
  title: 'Crimbot',
  description:
    "Hi, I'm crimbot. Commands are listed below. Some commands are left off because they aren't really fleshed out.",
  url: 'https://discordapp.com',
  color: 4237055,
  thumbnail: {
    url: 'https://i.imgur.com/spQbBAM.jpg',
  },
  fields: [
    {
      name: '!crim',
      value: 'Generate a normal response',
    },
    {
      name: '!crim debug',
      value:
        'Generate a normal response and see the source messages that helped generate the message',
    },
    {
      name: '!crim force [terms]',
      value:
        "Send a list of terms for Crim to try to generate a message with. Crim will filter out common words. If Crim can't think of a relevant response he will quit and let you know with a reaction.",
    },
    {
      name: '!crim chatty [channel ID / off]',
      value:
        'Set a channel for Crim to have an increased chance to respond in, or use !crim chatty off to turn off chatty.',
    },
    {
      name: "!crim pick [list of options separated by ' or ']",
      value:
        'Have Crim settle your arguments for you by picking an option. Each option must be separated by `[whitespace]or[whitespace]`, case insensitive.',
    },
    {
      name: '!crim regen',
      value:
        'Dump the messages that Crim has been listening to into the current corpus. This runs nightly automatically.',
    },
    {
      name: '!crim train',
      value:
        'Requires elevated permissions. Will overwrite the current database. Do **not** use casually, you likely want to use !crim regen instead.',
    },
  ],
};
