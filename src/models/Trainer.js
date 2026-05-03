const { DataTypes } = require('sequelize');
const sequelize = require('./database');

const Trainer = sequelize.define(
  'Trainer',
  {
    id: {
      type: DataTypes.BIGINT,
      primaryKey: true,
      autoIncrement: true,
    },
    telegramId: {
      type: DataTypes.BIGINT,
      unique: true,
      allowNull: false,
    },
    notifyOnMissedDays: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: true,
      field: 'notify_on_missed_days',
    },
  },
  {
    tableName: 'trainers',
    timestamps: true,
  }
);

module.exports = Trainer;

