const { DataTypes } = require("sequelize");
const sequelize = require("../config/database");
const Passenger = require("./Passenger");

const Ticket = sequelize.define("Ticket", {
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true,
  },
  status: {
    type: DataTypes.ENUM("CONFIRMED", "RAC", "WAITING_LIST", "CHILD_NO_BERTH"),
    allowNull: false,
  },
  berthType: {
    type: DataTypes.ENUM(
      "UPPER",
      "MIDDLE",
      "LOWER",
      "SIDE_UPPER",
      "SIDE_LOWER"
    ),
    allowNull: true,
  },
  berthNumber: {
    type: DataTypes.INTEGER,
    allowNull: true,
  },
  waitingListNumber: {
    type: DataTypes.INTEGER,
    allowNull: true,
  },
  racNumber: {
    type: DataTypes.INTEGER,
    allowNull: true,
  },
  bookingReference: {
    type: DataTypes.STRING,
    unique: true,
    allowNull: false,
  },
  bookingDate: {
    type: DataTypes.DATE,
    allowNull: false,
    defaultValue: DataTypes.NOW,
  },
});

// Establish relationship with Passenger
Ticket.belongsTo(Passenger);
Passenger.hasMany(Ticket);

module.exports = Ticket;
