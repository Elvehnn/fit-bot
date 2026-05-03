// src/models/associations.js
const User = require('./User');
const UserQuestionnaire = require('./UserQuestionnaire');
const Trainer = require('./Trainer');
const TrainerInvite = require('./TrainerInvite');

User.hasOne(UserQuestionnaire, {
  foreignKey: 'userId',
  as: 'questionnaire',
  onDelete: 'CASCADE',
  onUpdate: 'CASCADE',
});

UserQuestionnaire.belongsTo(User, {
  foreignKey: 'userId',
  as: 'user',
  onDelete: 'CASCADE',
  onUpdate: 'CASCADE',
});

Trainer.hasMany(User, {
  foreignKey: 'trainerId',
  as: 'clients',
  onDelete: 'SET NULL',
  onUpdate: 'CASCADE',
});

User.belongsTo(Trainer, {
  foreignKey: 'trainerId',
  as: 'trainer',
  onDelete: 'SET NULL',
  onUpdate: 'CASCADE',
});

Trainer.hasMany(TrainerInvite, {
  foreignKey: 'trainerId',
  as: 'invites',
  onDelete: 'CASCADE',
  onUpdate: 'CASCADE',
});

TrainerInvite.belongsTo(Trainer, {
  foreignKey: 'trainerId',
  as: 'trainer',
  onDelete: 'CASCADE',
  onUpdate: 'CASCADE',
});

TrainerInvite.belongsTo(User, {
  foreignKey: 'usedByUserId',
  as: 'usedBy',
  onDelete: 'SET NULL',
  onUpdate: 'CASCADE',
});

module.exports = { User, UserQuestionnaire, Trainer, TrainerInvite };
