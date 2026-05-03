const { DataTypes } = require('sequelize');
const sequelize = require('./database');

const TrainerInvite = sequelize.define(
  'TrainerInvite',
  {
    id: {
      type: DataTypes.BIGINT,
      primaryKey: true,
      autoIncrement: true,
    },
    trainerId: {
      type: DataTypes.BIGINT,
      allowNull: false,
      field: 'trainer_id',
    },
    code: {
      type: DataTypes.STRING(64),
      allowNull: false,
      unique: true,
    },
    usedByUserId: {
      type: DataTypes.BIGINT,
      allowNull: true,
      field: 'used_by_user_id',
    },
    usedAt: {
      type: DataTypes.DATE,
      allowNull: true,
      field: 'used_at',
    },
  },
  {
    tableName: 'trainer_invites',
    timestamps: true,
  }
);

module.exports = TrainerInvite;

