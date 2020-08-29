/* eslint-disable no-console */
import 'source-map-support/register';
import * as Discord from 'discord.js';
// https://discord.js.org/#/docs/main/stable/general/welcome
import * as fs from 'fs';
import Markov, { MarkovConstructorOptions, MarkovGenerateOptions } from 'markov-strings';
import * as schedule from 'node-schedule';
import * as common from 'common-words';
import { MarkbotMarkovResult, MessageRecord, MessagesDB, ResponseSettings } from './lib/interface';
import { config } from './lib/config';
import {
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
let sendLonely = true;

let fileObj: MessagesDB = {
  messages: [],
};

let markovDB: MessageRecord[] = [];
let messageCache: MessageRecord[] = [];
let deletionCache: string[] = [];
let markovOpts: MarkovConstructorOptions = {
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
    return;
  }
}

function getResponseSettings(message: Discord.Message): ResponseSettings {
  const channel = message.channel as Discord.TextChannel;
  const parentName = channel.parent.name;
  let settings: ResponseSettings = {
    allowedToRespond: true,
    increasedChance: false,
  };

  if (parentName !== config.suppressRespCat && parentName !== config.increaseFreqCat) {
    return settings;
  } else {
    parentName === config.suppressRespCat ? (settings.allowedToRespond = false) : null;
    parentName === config.increaseFreqCat ? (settings.increasedChance = true) : null;

    return settings;
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
      if (randomMessage.attachment) {
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
  regenMarkov();
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

client.on('message', message => {
  if (message.guild) {
    const command = validateMessage(message);
    const responseSettings = getResponseSettings(message);
    if (command === 'help') {
      const richem = new Discord.RichEmbed()
        .setAuthor(client.user.username, client.user.avatarURL)
        .setThumbnail(client.user.avatarURL)
        .setDescription('A Markov chain chatbot that speaks based on previous chat input.')
        .addField(
          '!crim',
          'Generates a sentence to say based on the chat database. Send your ' +
            'message as TTS to recieve it as TTS.'
        )
        .addField(
          '!crim train',
          'Fetches the maximum amount of previous messages in the current ' +
            'text channel, adds it to the database, and regenerates the corpus. Takes some time.'
        )
        .addField(
          '!crim regen',
          'Manually regenerates the corpus to add recent chat info. Run ' +
            'this before shutting down to avoid any data loss. This automatically runs at midnight.'
        )
        .addField(
          '!crim invite',
          "Don't invite this bot to other servers. The database is shared " +
            'between all servers and text channels.'
        )
        .addField(
          '!crim force [parameter]',
          'Force the bot to try to come up with a sentence involving parameter.'
        )
        .addField('!crim debug', 'Runs the !crim command and follows it up with debug info.')
        .setFooter(`Markov Discord v${version} by Charlie Laabs modified by Plague Hut & Friends`);
      message.channel.send(richem).catch(() => {
        message.author.send(richem);
      });
    }
    if (command === 'train') {
      if (isModerator(message.member)) {
        console.log('Training...');
        fileObj = {
          messages: [],
        };
        fs.writeFileSync('config/markovDB.json', JSON.stringify(fileObj), 'utf-8');
        fetchMessages(message);
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
    if (command === 'test') {
      console.log('test success');
      // simple area to test features in here
    }
    if (command === 'force') {
      const messageText = message.content.toLowerCase();
      const split = messageText.split(' ');
      let force = messageText.substring(12);
      const substrings = removeCommonWords(force.split(' '), common).filter(Boolean);
      console.log('Topics: ', substrings);
      generateResponse(message, false, false, substrings);
    }
    if (command === null) {
      let randomPick = Math.random();
      console.log('Listening...', responseSettings);
      if (!message.author.bot) {
        const chanceEval = responseSettings.increasedChance
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
              ? generateResponse(message, false, false, messageText)
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
    if (command === config.inviteCmd) {
      const richem = new Discord.RichEmbed()
        .setAuthor(`Invite ${client.user.username}`, client.user.avatarURL)
        .setThumbnail(client.user.avatarURL)
        .addField(
          'Invite',
          `[Invite ${client.user.username} to your server](https://discordapp.com/oauth2/authorize?client_id=${client.user.id}&scope=bot)`
        );

      message.channel.send(richem).catch(() => {
        message.author.send(richem);
      });
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
