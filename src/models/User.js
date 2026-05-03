const { DataTypes } = require('sequelize');
const sequelize = require('./database');

const User = sequelize.define(
  'User',
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
    username: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    firstName: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    email: {
      type: DataTypes.STRING,
      allowNull: true,
      validate: {
        isEmail: true,
      },
    },
    subscriptionType: {
      type: DataTypes.ENUM('free', 'premium', 'pro'),
      defaultValue: 'free',
    },
    subscriptionEnd: {
      type: DataTypes.DATE,
      allowNull: true,
    },
    paymentData: {
      type: DataTypes.JSONB, // Зашифрованные данные об оплате
      allowNull: true,
    },
    // Флаг заполнения анкеты
    hasQuestionnaire: {
      type: DataTypes.BOOLEAN,
      defaultValue: false,
    },
    // Дата последнего заполнения анкеты
    questionnaireUpdatedAt: {
      type: DataTypes.DATE,
      allowNull: true,
    },

    trainerId: {
      type: DataTypes.BIGINT,
      allowNull: true,
      field: 'trainer_id',
    },
  },
  {
    tableName: 'users',
    timestamps: true,
  }
);

module.exports = User;
