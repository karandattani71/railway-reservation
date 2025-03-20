const { Op } = require("sequelize");
const {
  BERTH_CONFIG,
  TICKET_STATUS,
  BERTH_TYPE,
} = require("../constants/ticketConstants");
const Ticket = require("../models/Ticket");
const Passenger = require("../models/Passenger");
const sequelize = require("sequelize");

const generateBookingReference = () => {
  const timestamp = Date.now();
  const random = Math.random().toString(36).slice(2, 7).toUpperCase();
  return `TKT${timestamp}${random}`;
};

const checkAvailability = async (transaction) => {
  const [confirmed, rac, waitlist] = await Promise.all([
    Ticket.count({
      where: {
        status: TICKET_STATUS.CONFIRMED,
      },
      transaction,
    }),
    Ticket.count({
      where: { status: TICKET_STATUS.RAC },
      transaction,
    }),
    Ticket.count({
      where: { status: TICKET_STATUS.WAITING_LIST },
      transaction,
    }),
  ]);

  return {
    confirmedAvailable: BERTH_CONFIG.TOTAL - confirmed,
    racAvailable: BERTH_CONFIG.RAC * 2 - rac,
    waitlistAvailable: BERTH_CONFIG.WAITING_LIST - waitlist,
  };
};

const needsPriorityAllocation = (passenger) => {
  const { age, hasChild } = passenger;
  return age >= 60 || hasChild;
};

const allocateBerth = async (passenger, transaction) => {
  if (!needsPriorityAllocation(passenger)) {
    const berthTypes = [BERTH_TYPE.UPPER, BERTH_TYPE.MIDDLE, BERTH_TYPE.LOWER];
    return berthTypes[Math.floor(Math.random() * berthTypes.length)];
  }

  const lowerBerthAvailable = await Ticket.count({
    where: {
      status: TICKET_STATUS.CONFIRMED,
      berthType: BERTH_TYPE.LOWER,
    },
    transaction,
  });

  return lowerBerthAvailable < BERTH_CONFIG.LOWER_BERTH_QUOTA
    ? BERTH_TYPE.LOWER
    : [BERTH_TYPE.UPPER, BERTH_TYPE.MIDDLE, BERTH_TYPE.LOWER][
        Math.floor(Math.random() * 3)
      ];
};

const createTicketData = async (passenger, availability, transaction) => {
  const ticketData = {
    PassengerId: passenger.id,
    bookingReference: generateBookingReference(),
  };

  // Prevent direct ticket booking for children under 5
  if (passenger.age < 5) {
    throw new Error(
      "Children under 5 years cannot book tickets directly. They must be registered with an adult passenger."
    );
  }

  if (availability.confirmedAvailable > 0) {
    ticketData.status = TICKET_STATUS.CONFIRMED;
    ticketData.berthType = await allocateBerth(passenger, transaction);
    ticketData.berthNumber = availability.confirmedAvailable;
  } else if (availability.racAvailable > 0) {
    ticketData.status = TICKET_STATUS.RAC;
    ticketData.berthType = BERTH_TYPE.SIDE_LOWER;
    ticketData.racNumber = availability.racAvailable;
  } else if (availability.waitlistAvailable > 0) {
    ticketData.status = TICKET_STATUS.WAITING_LIST;
    ticketData.waitingListNumber = availability.waitlistAvailable;
  } else {
    throw new Error("No tickets available");
  }

  return ticketData;
};

const getTicketSummary = (tickets) => ({
  total: tickets.length,
  confirmed: tickets.filter((t) => t.status === TICKET_STATUS.CONFIRMED).length,
  rac: tickets.filter((t) => t.status === TICKET_STATUS.RAC).length,
  waitingList: tickets.filter((t) => t.status === TICKET_STATUS.WAITING_LIST)
    .length,
  childrenNoBerth: tickets.filter(
    (t) => t.status === TICKET_STATUS.CHILD_NO_BERTH
  ).length,
});

const cancelTicket = async (ticketId, transaction) => {
  const ticket = await Ticket.findByPk(ticketId, {
    include: [Passenger],
    transaction,
  });

  if (!ticket) {
    throw new Error("Ticket not found");
  }

  if (ticket.status === TICKET_STATUS.CANCELLED) {
    throw new Error("Ticket is already cancelled");
  }

  const originalStatus = ticket.status;

  // Update the current ticket to cancelled
  await ticket.update({ status: "CANCELLED" }, { transaction });

  // If the cancelled ticket was confirmed, promote RAC to confirmed
  if (originalStatus === TICKET_STATUS.CONFIRMED) {
    const nextRacTicket = await Ticket.findOne({
      where: { status: TICKET_STATUS.RAC },
      order: [["racNumber", "ASC"]],
      transaction,
    });

    if (nextRacTicket) {
      // Promote RAC to confirmed
      await nextRacTicket.update(
        {
          status: TICKET_STATUS.CONFIRMED,
          berthType: ticket.berthType,
          berthNumber: ticket.berthNumber,
          racNumber: null,
        },
        { transaction }
      );

      // Find next waiting list ticket to promote to RAC
      const nextWaitingTicket = await Ticket.findOne({
        where: { status: TICKET_STATUS.WAITING_LIST },
        order: [["waitingListNumber", "ASC"]],
        transaction,
      });

      if (nextWaitingTicket) {
        // Promote waiting list to RAC
        await nextWaitingTicket.update(
          {
            status: TICKET_STATUS.RAC,
            racNumber: nextRacTicket.racNumber,
            waitingListNumber: null,
          },
          { transaction }
        );

        // Reorder remaining waiting list numbers
        await Ticket.update(
          { waitingListNumber: sequelize.literal('"waitingListNumber" - 1') },
          {
            where: {
              status: TICKET_STATUS.WAITING_LIST,
              waitingListNumber: {
                [Op.gt]: nextWaitingTicket.waitingListNumber,
              },
            },
            transaction,
          }
        );
      }
    }
  }
  // If the cancelled ticket was RAC, promote waiting list to RAC
  else if (originalStatus === TICKET_STATUS.RAC) {
    const nextWaitingTicket = await Ticket.findOne({
      where: { status: TICKET_STATUS.WAITING_LIST },
      order: [["waitingListNumber", "ASC"]],
      transaction,
    });

    if (nextWaitingTicket) {
      // Promote waiting list to RAC
      await nextWaitingTicket.update(
        {
          status: TICKET_STATUS.RAC,
          racNumber: ticket.racNumber,
          waitingListNumber: null,
        },
        { transaction }
      );

      // Reorder remaining waiting list numbers
      await Ticket.update(
        { waitingListNumber: sequelize.literal('"waitingListNumber" - 1') },
        {
          where: {
            status: TICKET_STATUS.WAITING_LIST,
            waitingListNumber: { [Op.gt]: nextWaitingTicket.waitingListNumber },
          },
          transaction,
        }
      );
    }

    // Reorder remaining RAC numbers
    await Ticket.update(
      { racNumber: sequelize.literal('"racNumber" - 1') },
      {
        where: {
          status: TICKET_STATUS.RAC,
          racNumber: { [Op.gt]: ticket.racNumber },
        },
        transaction,
      }
    );
  }
  // If the cancelled ticket was waiting list, reorder remaining waiting list numbers
  else if (originalStatus === TICKET_STATUS.WAITING_LIST) {
    await Ticket.update(
      { waitingListNumber: sequelize.literal('"waitingListNumber" - 1') },
      {
        where: {
          status: TICKET_STATUS.WAITING_LIST,
          waitingListNumber: { [Op.gt]: ticket.waitingListNumber },
        },
        transaction,
      }
    );
  }

  return ticket;
};

module.exports = {
  checkAvailability,
  createTicketData,
  getTicketSummary,
  cancelTicket,
  generateBookingReference,
};
