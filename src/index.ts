/* eslint-disable no-console */
import 'source-map-support/register';
import * as Discord from 'discord.js';
// https://discord.js.org/#/docs/main/stable/general/welcome
import * as fs from 'fs';
import Markov, { MarkovConstructorOptions, MarkovGenerateOptions } from 'markov-strings';
import * as schedule from 'node-schedule';
import * as common from 'common-words';
import { Collection, GuildChannel, TextChannel, Snowflake } from 'discord.js';
import { MarkbotMarkovResult, MessageRecord, MessagesDB, ResponseSettings } from './lib/interface';
import { config } from './lib/config';
import {
  getResponseSettings,
  helpEmbed,
  hoursToTimeoutInMs,
  isModerator,
  prefixMessage,
  randomHours,
  removeCommonWords,
  uniqueBy,
  validateMessage,
} from './lib/util';

const version: string = JSON.parse(fs.readFileSync('./package.json', 'utf8')).version || '0.0.0';

export const client = new Discord.Client();

let channelSend: Discord.TextChannel;
const errors: string[] = [];
const sendLonely = false;
let chattyChannelId = '';

let fileObj: MessagesDB = {
  messages: [],
};

let markovDB: MessageRecord[] = [];
let messageCache: MessageRecord[] = [];
let deletionCache: string[] = [];
const markovOpts: MarkovConstructorOptions = {
  stateSize: config.stateSize,
};

const crimMessages = JSON.parse(fs.readFileSync('config/crim-messages.json', 'utf8'));

/**
 * Regenerates the corpus and saves all cached changes to disk
 */
function regenMarkov(): void {
  console.log('Regenerating Markov corpus...');
  try {
    fileObj = JSON.parse(fs.readFileSync('config/markovDB.json', 'utf8'));
  } catch (err) {
    console.log('No markovDB.json, starting with initial values');
    fileObj = {
      messages: [
        {
          id: '0',
          string: '',
        },
      ],
    };
  }
  // console.log("MessageCache", messageCache)
  markovDB = fileObj.messages;
  markovDB = uniqueBy<MessageRecord>(markovDB.concat(messageCache), 'id');
  deletionCache.forEach(id => {
    const removeIndex = markovDB.map(item => item.id).indexOf(id);
    // console.log('Remove Index:', removeIndex)
    markovDB.splice(removeIndex, 1);
  });
  deletionCache = [];
  const markov = new Markov(markovDB, markovOpts);
  fileObj.messages = markovDB;
  // console.log("WRITING THE FOLLOWING DATA:")
  // console.log(fileObj)
  fs.writeFileSync('config/markovDB.json', JSON.stringify(fileObj), 'utf-8');
  fileObj.messages = [];
  messageCache = [];
  markov.buildCorpus();
  fs.writeFileSync('config/markov.json', JSON.stringify(markov));
  console.log('Done regenerating Markov corpus.');
}

function crimIsLonely(nextTimeout: number) {
  if (sendLonely) {
    const modifiedTimeout = nextTimeout + hoursToTimeoutInMs(5);

    console.log('Crim is lonely...');
    console.log(`Next unprompted message will be in ${modifiedTimeout}ms`);

    const messageSend =
      crimMessages.messages[Math.floor(Math.random() * crimMessages.messages.length)];

    setTimeout(() => {
      channelSend.send(prefixMessage(messageSend));
      return crimIsLonely(hoursToTimeoutInMs(randomHours()));
    }, modifiedTimeout);
  } else {
    console.log('Exiting lonely loop.');
  }
}

/**
 * Function to recursively get all messages in a text channel's history. Ends
 * by regnerating the corpus.
 * @param {Message} message Message initiating the command, used for getting
 * channel data
 */
async function fetchMessages(message: Discord.Message): Promise<void> {
  let historyCache: MessageRecord[] = [];
  let keepGoing = true;
  let oldestMessageID;

  console.log('entered fetchMessages');
  while (keepGoing) {
    const messages: Discord.Collection<
      string,
      Discord.Message
      // eslint-disable-next-line no-await-in-loop
    > = await message.channel.fetchMessages({
      before: oldestMessageID,
      limit: config.pageSize,
    });
    const nonBotMessageFormatted = messages
      .filter(elem => !elem.author.bot)
      .map(elem => {
        const dbObj: MessageRecord = {
          string: elem.content,
          id: elem.id,
        };
        if (elem.attachments.size > 0) {
          dbObj.attachment = elem.attachments.values().next().value.url;
        }
        return dbObj;
      });
    historyCache = historyCache.concat(nonBotMessageFormatted);
    oldestMessageID = messages.last().id;
    if (messages.size < config.pageSize) {
      keepGoing = false;
    }
  }
  console.log(`Trained from ${historyCache.length} past human authored messages.`);
  messageCache = messageCache.concat(historyCache);
  regenMarkov();
  message.reply(`Finished training from past ${historyCache.length} messages.`);
}

/**
 * Function to recursively get all messages in a text channel's history. Ends
 * by regnerating the corpus.
 * @param {Channel} channel Channel to get messages from.
 */
async function fetchMessagesByChannel(message: Discord.Message): Promise<void> {
  let historyCache: MessageRecord[] = [];

  const channelsToScan = [] as Array<string>;
  message.guild.channels.forEach(value => {
    if (value.type && value.type === 'text') {
      channelsToScan.push(value.id);
    }
  });
  console.log('Scanning channels: ', channelsToScan);

  console.log('entered fetchMessagesByChannel');
  // eslint-disable-next-line no-restricted-syntax
  for (const channelId of channelsToScan) {
    const channel = client.channels.get(channelId) as TextChannel;
    if (!(channel.parentID === '737790706445320353')) {
      console.log('Scanning', channel.name);
      let oldestMessageID;
      let keepGoing = true;
      while (keepGoing) {
        try {
          const messages: Discord.Collection<
            string,
            Discord.Message
            // eslint-disable-next-line no-await-in-loop
          > = await channel.fetchMessages({
            before: oldestMessageID,
            limit: config.pageSize,
          });
          const nonBotMessageFormatted = messages
            .filter(elem => !elem.author.bot)
            .map(elem => {
              const dbObj: MessageRecord = {
                string: elem.content,
                id: elem.id,
              };
              if (elem.attachments.size > 0) {
                dbObj.attachment = elem.attachments.values().next().value.url;
              }
              return dbObj;
            });
          historyCache = historyCache.concat(nonBotMessageFormatted);
          oldestMessageID = messages.last().id;
          if (messages.size < config.pageSize) {
            keepGoing = false;
          }
        } catch (error) {
          console.log('Failed!', error);
          keepGoing = false;
        }
      }
    } else {
      console.log('Skipping', channel.name);
    }
  }
  console.log(`Trained from ${historyCache.length} past human authored messages.`);
  messageCache = messageCache.concat(historyCache);
  regenMarkov();
  message.reply(`Finished training from past ${historyCache.length} messages.`);
}

/**
 * General Markov-chain optional-forced inclusion response function
 * @param {Message} message The message that invoked the action, used for channel info.
 * @param {Boolean} debug Sends debug info as a message if true.
 * @param {Boolean} tts If the message should be sent as TTS. Defaults to the TTS setting of the
 * invoking message.
 * @param {Array<string>>} force Strings to force from
 */
function generateResponse(
  message: Discord.Message,
  debug = false,
  tts = message.tts,
  force?: Array<string>
): void {
  console.log('Generating response...');
  let options: MarkovGenerateOptions;
  if (force === undefined || force.length == 0) {
    options = {
      filter: (result): boolean => {
        return result.score >= config.minScore && result.refs.length >= 2;
      },
      maxTries: config.maxTries,
    };
  } else {
    options = {
      filter: result => {
        return (
          result.score >= config.minScore &&
          force.some(word => result.string.split(' ').includes(word)) &&
          result.refs.length >= 2
        );
      },
      maxTries: config.maxTries * 4,
    };
  }

  const fsMarkov = new Markov([''], markovOpts);
  const markovFile = JSON.parse(fs.readFileSync('config/markov.json', 'utf-8')) as Markov;
  fsMarkov.corpus = markovFile.corpus;
  fsMarkov.startWords = markovFile.startWords;
  fsMarkov.endWords = markovFile.endWords;

  try {
    const myResult = fsMarkov.generate(options) as MarkbotMarkovResult;
    console.log('Generated Result:', myResult);
    const messageOpts: Discord.MessageOptions = { tts };
    const attachmentRefs = myResult.refs
      .filter(ref => Object.prototype.hasOwnProperty.call(ref, 'attachment'))
      .map(ref => ref.attachment as string);
    if (attachmentRefs.length > 0) {
      const randomRefAttachment = attachmentRefs[Math.floor(Math.random() * attachmentRefs.length)];
      messageOpts.files = [randomRefAttachment];
    } else {
      const randomMessage = markovDB[Math.floor(Math.random() * markovDB.length)];
      if (randomMessage && randomMessage.attachment) {
        messageOpts.files = [{ attachment: randomMessage.attachment }];
      }
    }

    myResult.string = myResult.string.replace(/@everyone/g, 'at everyone');
    myResult.string = myResult.string.replace(/@here/g, 'at here');
    message.channel.send(prefixMessage(myResult.string), messageOpts);
    if (debug) message.channel.send(`\`\`\`\n${JSON.stringify(myResult, null, 2)}\n\`\`\``);
  } catch (err) {
    message.react('688964665531039784');
    console.log(err);
    if (debug) message.channel.send(`\n\`\`\`\nERROR: ${err}\n\`\`\``);
    if (err.message.includes('Cannot build sentence with current corpus')) {
      console.log('Not enough chat data for a response.');
    }
  }
}

client.on('ready', () => {
  console.log('Markbot by Charlie Laabs');
  client.user.setActivity(config.game);
  // regenMarkov();
  channelSend = client.channels.get('735988826723319879') as Discord.TextChannel;
  crimIsLonely(hoursToTimeoutInMs(randomHours()));
});

client.on('error', err => {
  const errText = `ERROR: ${err.name} - ${err.message}`;
  console.log(errText);
  errors.push(errText);
  fs.writeFile('./config/error.json', JSON.stringify(errors), fsErr => {
    if (fsErr) {
      console.log(`error writing to error file: ${fsErr.message}`);
    }
  });
});

function indirectResponse(responseSettings: ResponseSettings, message: Discord.Message) {
  const randomPick = Math.random();
  console.log('Listening...', responseSettings);
  if (!message.author.bot) {
    const chanceEval =
      message.channel.id === chattyChannelId
        ? config.chattyChance
        : responseSettings.increasedChance
        ? config.increasedMsgChance
        : config.randomMsgChance;

    if (randomPick < config.crimMsgChance) {
      console.log('Crimming it up');
      const messageSend =
        crimMessages.messages[Math.floor(Math.random() * crimMessages.messages.length)];
      responseSettings.allowedToRespond
        ? message.channel.send(prefixMessage(messageSend))
        : console.log('Suppressed in this category.');
    }
    if (randomPick < chanceEval) {
      if (!(randomPick < config.crimMsgChance)) {
        console.log('Feeling chatty! Speaking up...');
        const messageText = message.content.toLowerCase().split(' ');
        responseSettings.allowedToRespond
          ? message.channel.id === chattyChannelId
            ? generateResponse(message, false, false)
            : generateResponse(message, false, false, messageText)
          : console.log('Suppressed in this category.');
      }
    }

    const dbObj: MessageRecord = {
      string: message.content,
      id: message.id,
    };
    if (message.attachments.size > 0) {
      dbObj.attachment = message.attachments.values().next().value.url;
    }
    messageCache.push(dbObj);
    if (message.isMentioned(client.user)) {
      generateResponse(message);
    }
  }
}

client.on('message', message => {
  if (message.guild) {
    const command = validateMessage(message);
    const responseSettings = getResponseSettings(message, chattyChannelId);
    if (command === 'help') {
      message.channel.send({ embed: helpEmbed }).catch(() => {
        message.author.send({ embed: helpEmbed });
      });
    }
    if (command === 'train') {
      if (message.author.id === '239610853811421185') {
        console.log('Training...');
        fileObj = {
          messages: [],
        };
        fs.writeFileSync('config/markovDB.json', JSON.stringify(fileObj), 'utf-8');
        fetchMessages(message);
      } else {
        message.channel.send('Sorry, that command is restricted.');
      }
    }
    if (command === 'test') {
      const channelsToScan = [] as Array<string>;
      message.guild.channels.forEach(value => {
        if (value.type === 'text' && value.name === 'general') {
          console.log(value);
          channelsToScan.push(value.id);
        }
      });
      console.log();
    }
    if (command === 'fullscan') {
      console.log('doing fullscan');
      message.channel.send('Scanning...');
      if (message.author.id === '239610853811421185') {
        console.log('Oh god, here goes nothing.');
        fileObj = {
          messages: [],
        };
        fs.writeFileSync('config/markovDB.json', JSON.stringify(fileObj), 'utf-8');
        fetchMessagesByChannel(message);
      } else {
        message.channel.send('Sorry, that command is restricted.');
      }
    }
    if (command === 'respond') {
      generateResponse(message);
    }
    if (command === 'tts') {
      generateResponse(message, false, true);
    }
    if (command === 'debug') {
      generateResponse(message, true);
    }
    if (command === 'regen') {
      regenMarkov();
    }
    if (command === 'force') {
      const messageText = message.content.toLowerCase();
      const split = messageText.split(' ');
      const force = messageText.substring(12);
      const substrings = removeCommonWords(force.split(' '), common).filter(Boolean);
      console.log('Topics: ', substrings);
      generateResponse(message, false, false, substrings);
    }
    if (command === 'chatty') {
      const arg = message.content.substring(13);
      if (arg === 'off') {
        chattyChannelId = '';
        message.channel.send('No longer being chatty in requested channel, if there was one.');
      } else {
        const channelRequested = client.channels.get(
          message.content.substring(13)
        ) as Discord.TextChannel;

        if (channelRequested !== undefined) {
          message.channel.send(`Updating Crim's Chatty Channel to ${channelRequested.name}`);
          chattyChannelId = arg;
        } else {
          message.react('❌');
        }
      }
    }
    if (command === 'pick') {
      const options = message.content.substring(11).split(/\s+[o|O][r|R]\s+/gm);
      const pickRandom = options[Math.floor(Math.random() * options.length)];
      message.channel.send(`I choose ${pickRandom}`);
    }
    if (command === null) {
      indirectResponse(responseSettings, message);
    }
  }
});

client.on('messageDelete', message => {
  // console.log('Adding message ' + message.id + ' to deletion cache.')
  deletionCache.push(message.id);
  console.log('deletionCache:', deletionCache);
});

try {
  client.login(config.token);
} catch (e) {
  console.error('Failed to login with token:', config.token);
}
schedule.scheduleJob('0 4 * * *', () => regenMarkov());
