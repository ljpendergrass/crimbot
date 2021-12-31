import * as fs from 'fs';
import { MarkbotConfig } from './interface';

/**
 * Loads the config settings from disk
 */
const token = 'missing';
let loadConfig: MarkbotConfig;
try {
  loadConfig = JSON.parse(fs.readFileSync('./config/config.json', 'utf8'));
} catch (e) {
  console.warn('Failed to read config.json. Using defaults only.');
  loadConfig = {
    game: '!crim help',
    prefix: '!crim',
    stateSize: 2,
    maxTries: 2000,
    minScore: 10,
    suppressRespCat: 'BOT-FREE-ZONE',
    increaseFreqCat: 'Events',
    messagePrefix: '',
    increasedMsgChance: 2 / 15,
    chattyChance: 2 / 10,
    randomMsgChance: 4 / 100,
    crimMsgChance: 1 / 200,
    token: process.env.TOKEN || token,
    pageSize: 200,
    imgFlipUsername: 'null',
    imgFlipPassword: 'null',
  };
}

export const config: MarkbotConfig = {
  game: loadConfig.game || '!crim help',
  prefix: loadConfig.prefix || '!crim',
  stateSize: loadConfig.stateSize || 2,
  maxTries: loadConfig.maxTries || 2000,
  minScore: loadConfig.minScore || 10,
  suppressRespCat: loadConfig.suppressRespCat || 'BOT-FREE-ZONE',
  increaseFreqCat: loadConfig.increaseFreqCat || 'Events',
  messagePrefix: loadConfig.messagePrefix || '',
  increasedMsgChance: loadConfig.increasedMsgChance || 15 / 100,
  chattyChance: loadConfig.increasedMsgChance || 3 / 10,
  randomMsgChance: loadConfig.randomMsgChance || 4 / 100,
  crimMsgChance: loadConfig.crimMsgChance || 1 / 200,
  token: loadConfig.token || process.env.TOKEN || token,
  pageSize: loadConfig.pageSize || 100,
  imgFlipUsername: loadConfig.imgFlipUsername || 'null',
  imgFlipPassword: loadConfig.imgFlipPassword || 'null',
};
