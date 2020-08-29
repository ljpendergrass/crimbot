import * as Discord from 'discord.js';
import { client } from '../index';

export const richem = new Discord.RichEmbed()
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
  .setFooter(`Markov Discord by Charlie Laabs modified by Plague Hut & Friends`);
