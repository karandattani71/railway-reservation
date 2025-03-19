const { DataTypes } = require("sequelize");
const sequelize = require("../config/database");

const Passenger = sequelize.define("Passenger", {
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true,
  },
  name: {
    type: DataTypes.STRING,
    allowNull: false,
  },
  age: {
    type: DataTypes.INTEGER,
    allowNull: false,
  },
  gender: {
    type: DataTypes.ENUM("MALE", "FEMALE", "OTHER"),
    allowNull: false,
  },
  hasChild: {
    type: DataTypes.BOOLEAN,
    defaultValue: false,
  },
  contactNumber: {
    type: DataTypes.STRING,
    allowNull: false,
  },
  email: {
    type: DataTypes.STRING,
    allowNull: false,
    validate: {
      isEmail: true,
    },
  },
});

module.exports = Passenger;
