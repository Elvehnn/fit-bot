// src/scenes/index.js
const { Scenes } = require('telegraf');
const profileSetupScene = require('./profileSetup');
const authorVoiceSetupScene = require('./authorVoiceSetup');
const contentGenerationScene = require('./contentGeneration'); // Добавляем новую сцену

const stage = new Scenes.Stage([profileSetupScene, authorVoiceSetupScene, contentGenerationScene]);

module.exports = stage;
