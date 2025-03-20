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
    type: DataTypes.ENUM(
      "CONFIRMED",
      "RAC",
      "WAITING_LIST",
      "CHILD_NO_BERTH",
      "CANCELLED"
    ),
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
  parentTicketId: {
    type: DataTypes.UUID,
    allowNull: true,
    references: {
      model: "Tickets",
      key: "id",
    },
  },
});

// Establish relationship with Passenger
Ticket.belongsTo(Passenger, {
  foreignKey: {
    name: "PassengerId",
    allowNull: false,
  },
});
Passenger.hasMany(Ticket);

// Establish parent-child relationship between tickets
Ticket.belongsTo(Ticket, {
  as: "parentTicket",
  foreignKey: "parentTicketId",
  onDelete: "CASCADE",
});
Ticket.hasOne(Ticket, {
  as: "childTicket",
  foreignKey: "parentTicketId",
  onDelete: "CASCADE",
});

module.exports = Ticket;
