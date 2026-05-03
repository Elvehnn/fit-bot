const { DataTypes } = require('sequelize');
const sequelize = require('./database');

const UserQuestionnaire = sequelize.define(
  'UserQuestionnaire',
  {
    userId: {
      type: DataTypes.INTEGER,
      allowNull: false,
      references: {
        model: 'users',
        key: 'id',
      },
      onUpdate: 'CASCADE',
      onDelete: 'CASCADE',
    },

    age: {
      type: DataTypes.INTEGER,
      allowNull: true,
      validate: {
        min: 0,
        max: 120,
      },
    },
    gender: {
      type: DataTypes.ENUM('male', 'female', 'other'),
      allowNull: false,
    },
    weight: {
      type: DataTypes.FLOAT,
      allowNull: true,
      validate: {
        min: 0,
      },
    },
    height: {
      type: DataTypes.FLOAT, // см
      allowNull: true,
      validate: {
        min: 0,
      },
    },

    // 2. Цель
    goal: {
      type: DataTypes.ENUM('lose_weight', 'gain_weight', 'keep_fit'),
      allowNull: true,
      // можно сделать обязательным: allowNull: false
      // значения мапишь на тексты в боте
    },

    // 3. Образ жизни
    lifestyle: {
      type: DataTypes.ENUM('sedentary', 'moderate', 'active'),
      allowNull: true,
    },

    // 4. Ограничения (человекочитаемый список / текст)
    restrictions: {
      type: DataTypes.TEXT,
      allowNull: true,
      // пример значения: "Вегетарианство; Аллергия на лактозу"
    },

    // 5. Проблемы (тоже одним текстовым полем)
    problems: {
      type: DataTypes.TEXT,
      allowNull: true,
      // пример: "Заедание стресса; Срывы на сладкое; Поздние ужины; Другое: ... "
    },

    // Доп. свободное поле, если нужно
    comment: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
  },
  {
    tableName: 'user_questionnaires', // имя таблицы в БД
    timestamps: true, // createdAt / updatedAt
  }
);

module.exports = UserQuestionnaire;
